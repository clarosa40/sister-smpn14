import { pastikanPengurus } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    PermintaanMasukDetail,
    type BarisPermintaanDetail,
    type BarisLogBernama,
} from "./permintaan-masuk-detail";

export const metadata: Metadata = {
    title: "Detail Permintaan — SIPB SMPN 14",
};

type BarisStok = { barang_id: string; stok: number };

/**
 * Tanpa pemeriksaan kepemilikan, sama seperti /persetujuan/[id]: policy
 * baca_permintaan mengembalikan baris mana pun kepada staf, kueri di
 * bawah menyisihkan draft, dan baris yang tidak ada berakhir di
 * notFound().
 */
export default async function PermintaanMasukDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await pastikanPengurus();

    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("permintaan")
        .select(
            `id, nomor, status, keperluan, tanggal_dibutuhkan, catatan_pemohon,
             alasan_tolak, tanggal, diajukan_at,
             pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
             unit_kerja ( nama ),
             permintaan_item ( id, barang_id, nama_barang_snapshot, satuan_snapshot, jumlah_diminta )`,
        )
        .eq("id", id)
        .neq("status", "draft")
        .maybeSingle<BarisPermintaanDetail>();

    // Kalau id-nya bukan uuid, Postgres menolaknya (22P02) - jalur yang sama
    // dengan permintaan yang memang tidak ada.
    if (error && error.code !== "22P02") {
        console.error(
            "[permintaan masuk detail]",
            error.code,
            error.message,
        );
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Detail permintaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    if (!data) notFound();

    const item = [...(data.permintaan_item ?? [])].sort((a, b) =>
        a.nama_barang_snapshot.localeCompare(b.nama_barang_snapshot, "id"),
    );

    const [stok, log] = await Promise.all([
        supabase
            .from("stok_barang")
            .select("barang_id, stok")
            .in(
                "barang_id",
                item.map((i) => i.barang_id),
            ),
        supabase
            .from("permintaan_log")
            .select("id, status_ke, catatan, created_at, oleh:profil ( nama_lengkap )")
            .eq("permintaan_id", id)
            .order("created_at"),
    ]);

    // Keduanya tidak fatal. Angka stok yang gagal dimuat membuat barisnya
    // tampil tanpa angka - itu memang yang dipetakan komponennya, sebab
    // angka ini hanya menampilkan tanda kurang, tidak pernah menggerbangi
    // tombol Siapkan.
    if (stok.error) {
        console.error(
            "[permintaan masuk detail] stok",
            stok.error.code,
            stok.error.message,
        );
    }
    if (log.error) {
        console.error(
            "[permintaan masuk detail] log",
            log.error.code,
            log.error.message,
        );
    }

    return (
        <PermintaanMasukDetail
            permintaan={{ ...data, permintaan_item: item }}
            log={(log.data ?? []) as unknown as BarisLogBernama[]}
            stok={Object.fromEntries(
                ((stok.data ?? []) as BarisStok[]).map((s) => [
                    s.barang_id,
                    s.stok,
                ]),
            )}
        />
    );
}
