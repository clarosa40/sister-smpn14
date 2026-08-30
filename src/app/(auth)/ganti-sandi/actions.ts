"use server";

import { pesanGalatAuth } from "@/lib/aksi";
import { ambilAkun, jalurTolak } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const PANJANG_MINIMAL = 8;

export type HasilGanti = { ok: true } | { ok: false; galat: string };

/**
 * Mengganti kata sandi sendiri, dengan sandi lama sebagai syarat.
 *
 * Supabase tidak menuntut sandi lama pada updateUser() - sesi yang hidup
 * sudah cukup baginya. Di sini ia tetap diminta: laptop yang ditinggal
 * terbuka di ruang guru seharusnya tidak cukup untuk mengambil alih akun
 * orang. Karena itu signInWithPassword() dijalankan lebih dulu, memakai
 * akun yang sama, semata-mata sebagai pembuktian.
 */
export async function gantiSandi(
    _sebelumnya: HasilGanti | null,
    formData: FormData,
): Promise<HasilGanti> {
    const akun = await ambilAkun();
    if (akun.status !== "ok") redirect(jalurTolak(akun.status));

    const lama = String(formData.get("lama") ?? "");
    const baru = String(formData.get("baru") ?? "");
    const ulangi = String(formData.get("ulangi") ?? "");

    if (!lama) return { ok: false, galat: "Kata sandi lama belum diisi." };
    if (baru.length < PANJANG_MINIMAL) {
        return {
            ok: false,
            galat: `Kata sandi baru minimal ${PANJANG_MINIMAL} karakter.`,
        };
    }
    if (baru !== ulangi) {
        return { ok: false, galat: "Kedua kata sandi baru belum sama." };
    }
    if (baru === lama) {
        return {
            ok: false,
            galat: "Kata sandi baru harus berbeda dari yang lama.",
        };
    }

    const supabase = await createClient();

    const { error: galatMasuk } = await supabase.auth.signInWithPassword({
        email: akun.user.email,
        password: lama,
    });
    if (galatMasuk) {
        return { ok: false, galat: "Kata sandi lama salah." };
    }

    const { error: galatSimpan } = await supabase.auth.updateUser({
        password: baru,
    });
    if (galatSimpan) {
        return { ok: false, galat: pesanGalatAuth(galatSimpan) };
    }

    // Penanda dibersihkan dengan klien service-role, sebab app_metadata
    // memang tidak bisa disentuh sesi pengguna - dan itu justru gunanya.
    const admin = createAdminClient();
    const { error: galatPenanda } = await admin.auth.admin.updateUserById(
        akun.user.id,
        { app_metadata: { sandi_sementara: false } },
    );

    if (galatPenanda) {
        // Sandinya sudah berganti; yang tersisa hanya penandanya. Jangan
        // berpura-pura gagal seluruhnya - katakan apa adanya, sebab memuat
        // ulang halaman ini dan mencoba sekali lagi memang jalan keluarnya.
        console.error("[ganti sandi]", galatPenanda.code, galatPenanda.message);
        return {
            ok: false,
            galat: "Kata sandi baru sudah tersimpan, tetapi status akun belum ikut diperbarui. Muat ulang halaman ini lalu coba sekali lagi.",
        };
    }

    return { ok: true };
}
