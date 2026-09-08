import { pastikanPegawai } from "@/lib/aksi";
import { ambilDraft } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { DaftarPermintaan, type BarisPermintaan } from "./daftar-permintaan";

export const metadata: Metadata = {
    title: "Permintaan Saya — SIPB SMPN 14",
};

/**
 * Tanpa paginasi, dengan sengaja: seorang pegawai mengajukan puluhan
 * permintaan, bukan ribuan. Kalau kelak daftarnya tumbuh melewati itu,
 * Paginasi di components/admin/paginasi.tsx adalah polanya.
 */
export default async function PermintaanSayaPage() {
    const user = await pastikanPegawai();
    const supabase = await createClient();

    const [draft, riwayat] = await Promise.all([
        ambilDraft(supabase, user.id),
        // .eq("pemohon_id") tidak menggantikan RLS - policy baca_permintaan
        // sudah menyempitkannya - tetapi menuliskannya membuat maksud kueri
        // ini terbaca tanpa harus membuka rls.sql.
        // Ini pun riwayat - catatan kejadian sekolah - jadi ia mengurut
        // tanggal permintaan, dengan diajukan_at sebagai penentu kalau dua
        // permintaan pegawai ini sama-sama tercatat pada tanggal yang sama.
        supabase
            .from("permintaan")
            .select(
                "id, nomor, status, keperluan, tanggal, diajukan_at, permintaan_item ( id )",
            )
            .eq("pemohon_id", user.id)
            .neq("status", "draft")
            .order("tanggal", { ascending: false })
            .order("diajukan_at", { ascending: false }),
    ]);

    if (riwayat.error) {
        console.error(
            "[permintaan saya]",
            riwayat.error.code,
            riwayat.error.message,
        );
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar permintaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    return (
        <DaftarPermintaan
            draft={draft}
            baris={(riwayat.data ?? []) as BarisPermintaan[]}
        />
    );
}
