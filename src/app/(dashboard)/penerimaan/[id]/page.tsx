import { pastikanTataUsaha } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DetailPenerimaan, type BarisDetailPenerimaan } from "./detail-penerimaan";

export const metadata: Metadata = {
    title: "Detail Penerimaan — SIPB SMPN 14",
};

export default async function DetailPenerimaanPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await pastikanTataUsaha();

    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("penerimaan")
        .select(
            `id, nomor, tanggal, no_dokumen, catatan,
             penerimaan_item ( id, nama_barang_snapshot, satuan_snapshot, jumlah, harga_satuan )`,
        )
        .eq("id", id)
        .maybeSingle<BarisDetailPenerimaan>();

    // Kalau id-nya bukan uuid, Postgres menolaknya (22P02) - jalur yang sama
    // dengan penerimaan yang memang tidak ada, sebab keduanya sama-sama
    // bukan kesalahan pemuatan yang bisa hilang dengan memuat ulang.
    if (error && error.code !== "22P02") {
        console.error("[detail penerimaan]", error.code, error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Detail penerimaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    if (!data) notFound();

    const item = [...(data.penerimaan_item ?? [])].sort((a, b) =>
        a.nama_barang_snapshot.localeCompare(b.nama_barang_snapshot, "id"),
    );

    return <DetailPenerimaan penerimaan={{ ...data, penerimaan_item: item }} />;
}
