import { pastikanStaf } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { StokDaftar, type BarisStok } from "./stok-daftar";

export const metadata: Metadata = {
    title: "Stok Barang — SIPB SMPN 14",
};

export default async function StokPage() {
    await pastikanStaf();

    const supabase = await createClient();

    const daftar = await supabase
        .from("stok_barang")
        .select("barang_id, kode, nama, satuan, stok, status");

    if (daftar.error) {
        console.error("[stok]", daftar.error.code, daftar.error.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar stok gagal dimuat. Muat ulang halamannya sebentar lagi.
            </p>
        );
    }

    return (
        <div className="mx-auto max-w-5xl">
            <StokDaftar baris={(daftar.data ?? []) as BarisStok[]} />
        </div>
    );
}
