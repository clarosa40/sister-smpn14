import { pastikanPegawai } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    DetailPermintaan,
    type BarisDetail,
    type BarisLog,
} from "./detail-permintaan";

export const metadata: Metadata = {
    title: "Detail Permintaan — SIPB SMPN 14",
};

/**
 * Tidak ada pemeriksaan kepemilikan di halaman ini, dan itu disengaja.
 * Policy baca_permintaan tidak mengembalikan baris milik orang lain, jadi
 * permintaan orang lain tiba di sini sebagai "tidak ada" - persis seperti
 * uuid karangan. Gerbang kedua di sini hanya akan jadi gerbang yang bisa
 * melenceng dari gerbang pertama.
 */
export default async function DetailPermintaanPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await pastikanPegawai();

    const { id } = await params;
    const supabase = await createClient();

    // Kalau id-nya bukan uuid, Postgres menolaknya (22P02) dan data-nya
    // null - jalur yang sama dengan permintaan yang memang tidak ada.
    const { data, error } = await supabase
        .from("permintaan")
        .select(
            `id, nomor, status, keperluan, tanggal_dibutuhkan, catatan_pemohon,
             alasan_tolak, created_at, diajukan_at,
             permintaan_item ( id, barang_id, nama_barang_snapshot, satuan_snapshot, jumlah_diminta )`,
        )
        .eq("id", id)
        .maybeSingle<BarisDetail>();

    if (error) {
        console.error("[detail permintaan]", error.code, error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Detail permintaan gagal dimuat. Muat ulang halamannya
                sebentar lagi.
            </p>
        );
    }

    if (!data) notFound();

    const { data: log, error: errorLog } = await supabase
        .from("permintaan_log")
        .select("id, status_ke, created_at")
        .eq("permintaan_id", id)
        .order("created_at");

    if (errorLog) {
        console.error(
            "[detail permintaan] log",
            errorLog.code,
            errorLog.message,
        );
    }

    const item = [...(data.permintaan_item ?? [])].sort((a, b) =>
        a.nama_barang_snapshot.localeCompare(b.nama_barang_snapshot, "id"),
    );

    return (
        <DetailPermintaan
            permintaan={{ ...data, permintaan_item: item }}
            log={(log ?? []) as BarisLog[]}
        />
    );
}
