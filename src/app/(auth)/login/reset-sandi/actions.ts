"use server";

import { COOKIE_PEMULIHAN, JALUR_PEMULIHAN } from "@/lib/pemulihan";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const PANJANG_MINIMAL = 8;

export type HasilReset =
    | { ok: true }
    | { ok: false; galat: string; tokenBasi?: boolean };

/**
 * Menebus token pemulihan dan menetapkan kata sandi baru dalam satu langkah.
 *
 * Verifikasi token dan penyimpanan sandi dijalankan berturut-turut di sini,
 * bukan terpisah. Kalau tokennya basi Supabase akan mengeluh, cookie penitipan
 * dibuang, dan pengguna dituntun meminta tautan baru.
 */
export async function simpanKataSandi(
    _prev: HasilReset | null,
    formData: FormData,
): Promise<HasilReset> {
    const sandi = String(formData.get("sandi") ?? "");
    const ulangi = String(formData.get("ulangi") ?? "");

    if (sandi.length < PANJANG_MINIMAL) {
        return {
            ok: false,
            galat: `Kata sandi minimal ${PANJANG_MINIMAL} karakter.`,
        };
    }

    if (sandi !== ulangi) {
        return { ok: false, galat: "Kedua kata sandi belum sama." };
    }

    const store = await cookies();
    const token = store.get(COOKIE_PEMULIHAN)?.value;

    // Kalau tidak ada tokennya, halamannya seharusnya sudah menolak duluan.
    // Jaga-jaga untuk kasus cookie yang habis di antara render halaman dan
    // penekanan tombol.
    if (!token) {
        return {
            ok: false,
            galat: "Sesi pemulihan tidak ditemukan. Buka ulang tautan resetnya dari email.",
            tokenBasi: true,
        };
    }

    const supabase = await createClient();

    // Sesi apa pun yang sudah hidup di peramban ini harus dibubarkan lebih
    // dulu. Tanpa itu, verifyOtp mengubah kepemilikan sesi menjadi pemilik
    // token; kalau sesi sebelumnya milik orang lain, akun mereka bisa ikut
    // terganti kata sandinya tanpa pernah dimintai sandi lama.
    const {
        data: { user: sesiAda },
    } = await supabase.auth.getUser();
    if (sesiAda) {
        await supabase.auth.signOut();
    }

    const { error: galatVerifikasi } = await supabase.auth.verifyOtp({
        type: "recovery",
        token_hash: token,
    });

    // Sudah ditolak Supabase - baik karena kadaluwarsa maupun karena dipakai
    // di perangkat lain lebih dulu. Hapus cookie supaya /login/reset-sandi
    // langsung memantul pada permintaan berikutnya, dan minta tautan baru.
    if (galatVerifikasi) {
        store.delete({ name: COOKIE_PEMULIHAN, path: JALUR_PEMULIHAN });
        return {
            ok: false,
            galat: "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman lupa kata sandi.",
            tokenBasi: true,
        };
    }

    const { error: galatUpdate } = await supabase.auth.updateUser({
        password: sandi,
    });

    if (galatUpdate) {
        // Token sudah dipakai oleh verifyOtp; percobaan berikutnya dengan
        // cookie yang sama pasti muncul sebagai "tautan kedaluwarsa" yang
        // menyesatkan. Bereskan seluruh sesi pemulihannya - cookie dibuang,
        // sesi yang baru diminta juga - lalu tuntun pengguna minta tautan baru.
        store.delete({ name: COOKIE_PEMULIHAN, path: JALUR_PEMULIHAN });
        await supabase.auth.signOut();
        return {
            ok: false,
            galat: "Kata sandi gagal disimpan. Minta tautan reset baru dari halaman lupa kata sandi.",
            tokenBasi: true,
        };
    }

    // Token sudah dipakai; cookie dibakar bersamanya. Sesi yang baru saja
    // dibuat verifyOtp tetap hidup - itulah yang membuat pengguna sudah masuk
    // begitu mendarat di /beranda.
    store.delete({ name: COOKIE_PEMULIHAN, path: JALUR_PEMULIHAN });
    return { ok: true };
}
