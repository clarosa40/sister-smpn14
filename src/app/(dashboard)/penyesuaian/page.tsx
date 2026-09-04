import { pastikanPengurus } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { PenyesuaianDaftar, type BarangOpsi, type BarisPenyesuaian } from "./penyesuaian-daftar";

export const metadata: Metadata = {
    title: "Penyesuaian — SIPB SMPN 14",
};

export default async function PenyesuaianPage() {
    await pastikanPengurus();

    const supabase = await createClient();

    const [log, barang] = await Promise.all([
        supabase
            .from("mutasi_stok")
            .select(
                `id, jumlah, catatan, created_at,
                 barang ( nama, satuan ),
                 dibuat_oleh:profil ( nama_lengkap )`,
            )
            .eq("jenis", "penyesuaian")
            .order("created_at", { ascending: false }),
        supabase.from("barang").select("id, kode, nama, satuan").order("nama"),
    ]);

    if (log.error) {
        console.error("[penyesuaian]", log.error.code, log.error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Riwayat penyesuaian gagal dimuat. Muat ulang halamannya
                sebentar lagi.
            </p>
        );
    }

    if (barang.error) {
        console.error(
            "[penyesuaian] barang",
            barang.error.code,
            barang.error.message,
        );
    }

    return (
        <PenyesuaianDaftar
            baris={(log.data ?? []) as unknown as BarisPenyesuaian[]}
            barang={(barang.data ?? []) as BarangOpsi[]}
        />
    );
}
