import { pastikanTataUsaha } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { FormPenerimaan, type BarangOpsi } from "./form-penerimaan";

export const metadata: Metadata = {
    title: "Catat Penerimaan — SIPB SMPN 14",
};

/**
 * Barang dipetik dari tabel barang, bukan dari stok_barang: barang yang
 * baru pertama kali diterima memang belum punya baris mutasi sama
 * sekali, dan penerimaan justru yang menerbitkannya. Katalog sekolah ini
 * puluhan baris, bukan ribuan, jadi memuatnya utuh sekali di sini
 * mengikuti pola yang sama dengan /katalog.
 */
export default async function PenerimaanBaruPage() {
    await pastikanTataUsaha();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("barang")
        .select("id, kode, nama, satuan")
        .order("nama");

    if (error) {
        console.error("[penerimaan baru]", error.code, error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar barang gagal dimuat. Muat ulang halamannya sebentar lagi.
            </p>
        );
    }

    return <FormPenerimaan barang={(data ?? []) as BarangOpsi[]} />;
}
