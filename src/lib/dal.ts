import "server-only";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";

export type Role = "pegawai" | "pengurus_barang" | "tata_usaha";

export type User = {
    id: string;
    email: string;
    namaLengkap: string;
    role: Role;
    unitKerja: string | null;
};

type BarisProfil = {
    nama_lengkap: string;
    role: Role;
    aktif: boolean;
    unit_kerja: { nama: string } | null;
};

/** Sebab-sebab sebuah sesi tidak boleh diteruskan ke dalam aplikasi. */
export type StatusTolak = "tanpa-sesi" | "profil-hilang" | "nonaktif";

export type Akun =
    | { status: StatusTolak }
    | { status: "ok"; user: User; sandiSementara: boolean };

export const JALUR_GANTI_SANDI = "/ganti-sandi";

/**
 * Ke mana sebuah sesi yang ditolak dipulangkan.
 *
 * Dua di antaranya lewat /auth/keluar, bukan langsung ke /login: sesinya
 * masih hidup di peramban, dan DAL tidak bisa mencabutnya sendiri -
 * penulisan cookie saat merender Server Component memang tidak didukung.
 * Tanpa singgah ke route handler itu, pengguna akan memantul antara
 * /login dan /beranda sampai tokennya kedaluwarsa sendiri.
 */
export const jalurTolak = (status: StatusTolak): string => {
    switch (status) {
        case "tanpa-sesi":
            return "/login";
        case "nonaktif":
            return "/auth/keluar?alasan=nonaktif";
        case "profil-hilang":
            return "/auth/keluar";
    }
};

/**
 * Satu-satunya tempat yang benar-benar bertanya ke Supabase.
 *
 * getUser() tidak bisa mengungkapkan "sudah masuk tetapi tidak boleh
 * lewat" - ia hanya punya User atau null. Perbedaan itu justru yang
 * menentukan ke mana orangnya dikirim, jadi ia hidup di sini dan kedua
 * fungsi umum di bawah membacanya.
 *
 * Dipakai layout dashboard dan halaman-halaman di bawahnya dalam satu
 * render pass yang sama. Tanpa cache() itu berarti satu perjalanan ke
 * Supabase per pemanggil, padahal jawabannya sama persis.
 */
export const ambilAkun = cache(async (): Promise<Akun> => {
    const supabase = await createClient();

    // getUser(), bukan getSession(): yang terakhir hanya membaca cookie tanpa
    // memvalidasikannya ke Supabase. Sekalian, ini yang membuat penanda
    // sandi_sementara selalu segar dari basis data - JWT basi di peramban
    // tidak bisa menahan siapa pun di /ganti-sandi setelah sandinya diganti.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { status: "tanpa-sesi" };

    // Satu select saja. `role` dibaca langsung dari baris ini - peran_saya()
    // ada untuk kebijakan RLS, yang memang tidak memegang barisnya.
    const { data, error } = await supabase
        .from("profil")
        .select("nama_lengkap, role, aktif, unit_kerja ( nama )")
        .eq("id", user.id)
        .single<BarisProfil>();

    // Sesi Auth valid tetapi profilnya tidak terjangkau - baris hilang, RLS
    // menolak, atau sambungan sedang tersendat.
    if (error || !data) return { status: "profil-hilang" };

    // Baris sendiri tetap terbaca walau nonaktif (policy baca_profil), jadi
    // "nonaktif" memang bisa dibedakan dari "profil hilang".
    if (!data.aktif) return { status: "nonaktif" };

    return {
        status: "ok",
        user: {
            id: user.id,
            // profil tidak punya kolom email; alamatnya milik Supabase Auth.
            email: user.email ?? "",
            namaLengkap: data.nama_lengkap,
            role: data.role,
            unitKerja: data.unit_kerja?.nama ?? null,
        },
        // app_metadata hanya bisa ditulis service role. Itulah sebabnya
        // penanda ini tinggal di sana dan bukan di user_metadata: pemiliknya
        // sendiri tidak boleh bisa membersihkannya.
        sandiSementara: user.app_metadata?.sandi_sementara === true,
    };
});

export const getUser = cache(async (): Promise<User | null> => {
    const akun = await ambilAkun();
    return akun.status === "ok" ? akun.user : null;
});

export const getUserOrRedirect = cache(
    async (peranDibolehkan?: readonly Role[]): Promise<User> => {
        const akun = await ambilAkun();

        if (akun.status !== "ok") redirect(jalurTolak(akun.status));

        // Sebelum pemeriksaan peran, dengan sengaja: tata usaha yang masih
        // memegang sandi sementara ditahan sama seperti orang lain.
        if (akun.sandiSementara) redirect(JALUR_GANTI_SANDI);

        // Pagar per-halaman untuk rute khusus peran. Beranda memanggil tanpa
        // filter; halaman yang dibatasi meneruskan daftar peran yang berhak.
        // Alih ke /beranda supaya salah-alamat dari URL tetap membawa pengguna
        // ke laman yang pasti terlihat oleh perannya.
        if (peranDibolehkan && !peranDibolehkan.includes(akun.user.role)) {
            redirect("/beranda");
        }

        return akun.user;
    },
);
