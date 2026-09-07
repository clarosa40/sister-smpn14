import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import {
    PenggunaTabel,
    type BarisPengguna,
    type OpsiUnit,
} from "./pengguna-tabel";

export const metadata: Metadata = {
    title: "Kelola Pengguna — SIPB SMPN 14",
};

/**
 * Tanpa paginasi, dengan sengaja: kurang lebih empat puluh orang staf
 * muat dalam satu layar, dan pencarian yang mempersempitnya. Kalau kelak
 * daftarnya tumbuh melewati itu, penanganan PGRST103 di master-barang
 * adalah polanya.
 */
export default async function PenggunaPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string }>;
}) {
    const saya = await pastikanTataUsaha();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();

    const supabase = await createClient();

    let kueri = supabase
        .from("pengguna")
        .select(
            "id, nama_lengkap, role, aktif, unit_kerja_id, unit_kerja, nama_pengguna, sandi_sementara",
        );

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `nama_lengkap.ilike."%${kataKunci}%",nama_pengguna.ilike."%${kataKunci}%"`,
        );
    }

    const [daftar, unit] = await Promise.all([
        kueri.order("nama_lengkap"),
        // Seluruh unit kerja, bukan yang aktif saja. Dialog tambah hanya
        // menawarkan yang aktif, tetapi dialog ubah harus tetap bisa
        // menampilkan unit milik barisnya sendiri walau unit itu sudah
        // dinonaktifkan - kalau tidak, mengganti nama seseorang diam-diam
        // memindahkan unit kerjanya.
        supabase.from("unit_kerja").select("id, nama, aktif").order("nama"),
    ]);

    if (daftar.error || unit.error) {
        const galat = daftar.error ?? unit.error;
        console.error("[pengguna]", galat?.code, galat?.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar pengguna gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    return (
        <PenggunaTabel
            baris={(daftar.data ?? []) as BarisPengguna[]}
            unit={(unit.data ?? []) as OpsiUnit[]}
            cari={cari}
            idSaya={saya.id}
        />
    );
}
