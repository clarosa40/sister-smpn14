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
    unit_kerja: { nama: string } | null;
};

// Dipakai layout dashboard dan halaman-halaman di bawahnya dalam satu render
// pass yang sama. Tanpa cache() itu berarti satu perjalanan ke Supabase per
// pemanggil, padahal jawabannya sama persis.
export const getUser = cache(async (): Promise<User | null> => {
    const supabase = await createClient();

    // getUser(), bukan getSession(): yang terakhir hanya membaca cookie tanpa
    // memvalidasikannya ke Supabase.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // Satu select saja. `role` dibaca langsung dari baris ini - peran_saya()
    // ada untuk kebijakan RLS, yang memang tidak memegang barisnya.
    const { data, error } = await supabase
        .from("profil")
        .select("nama_lengkap, role, unit_kerja ( nama )")
        .eq("id", user.id)
        .single<BarisProfil>();

    // Sesi Auth valid tetapi profilnya tidak terjangkau - baris hilang, RLS
    // menolak, atau sambungan sedang tersendat. Kalau kembalikan null saja,
    // pemanggil mengalihkan ke /login, proxy melihat sesi masih hidup lalu
    // memantul kembali ke /beranda: lingkaran tanpa henti. Cabut sesinya di
    // sini supaya proxy meloloskan /login pada permintaan berikutnya.
    if (error || !data) {
        await supabase.auth.signOut();
        return null;
    }

    return {
        id: user.id,
        // profil tidak punya kolom email; alamatnya milik Supabase Auth.
        email: user.email ?? "",
        namaLengkap: data.nama_lengkap,
        role: data.role,
        unitKerja: data.unit_kerja?.nama ?? null,
    };
});

export const getUserOrRedirect = cache(
    async (peranDibolehkan?: readonly Role[]): Promise<User> => {
        const user = await getUser();
        if (!user) redirect("/login");
        // Pagar per-halaman untuk rute khusus peran. Beranda memanggil tanpa
        // filter; halaman yang dibatasi meneruskan daftar peran yang berhak.
        // Alih ke /beranda supaya salah-alamat dari URL tetap membawa pengguna
        // ke laman yang pasti terlihat oleh perannya.
        if (peranDibolehkan && !peranDibolehkan.includes(user.role)) {
            redirect("/beranda");
        }
        return user;
    },
);
