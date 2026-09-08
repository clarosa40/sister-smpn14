"use client";

import { DialogForm } from "@/components/admin/dialog-form";
import { BarisKeterangan, LencanaStatus } from "@/components/permintaan-parts";
import { Button } from "@/components/ui/button";
import {
    kalimatLogBernama,
    tanggalPanjang,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { cn } from "@/lib/utils";
import { ArrowLeft, PackageCheck, TriangleAlert, Truck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { serahkanPermintaanMasuk, siapkanPermintaanMasuk } from "../actions";

export type ItemPermintaanDetail = {
    id: string;
    barang_id: string;
    nama_barang_snapshot: string;
    satuan_snapshot: string;
    jumlah_diminta: number;
};

export type BarisLogBernama = {
    id: string;
    status_ke: StatusPermintaan;
    catatan: string | null;
    created_at: string;
    oleh: { nama_lengkap: string } | null;
};

export type BarisPermintaanDetail = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    catatan_pemohon: string | null;
    alasan_tolak: string | null;
    tanggal: string | null;
    diajukan_at: string | null;
    pemohon: { nama_lengkap: string } | null;
    unit_kerja: { nama: string } | null;
    permintaan_item: ItemPermintaanDetail[];
};

export function PermintaanMasukDetail({
    permintaan,
    log,
    stok,
}: {
    permintaan: BarisPermintaanDetail;
    log: BarisLogBernama[];
    /** Stok per barang_id. Barang yang tidak ada di sini tampil tanpa angka. */
    stok: Record<string, number>;
}) {
    const [siapkan, setSiapkan] = React.useState(false);
    const [serahkan, setSerahkan] = React.useState(false);

    const bolehSiapkan = permintaan.status === "disetujui";
    const bolehSerahkan = permintaan.status === "siap_diambil";

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Link
                href="/permintaan-masuk"
                className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ArrowLeft className="size-4" strokeWidth={1.6} />
                Permintaan Masuk
            </Link>

            <header className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-mono text-base font-semibold text-foreground">
                    {permintaan.nomor ?? "Tanpa nomor"}
                </h2>
                <LencanaStatus status={permintaan.status} />
            </header>

            {permintaan.status === "ditolak" && permintaan.alasan_tolak && (
                <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3.5">
                    <p className="text-[13px] font-medium text-destructive">
                        Alasan penolakan
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-destructive">
                        {permintaan.alasan_tolak}
                    </p>
                </div>
            )}

            <dl className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
                <BarisKeterangan
                    label="Pemohon"
                    nilai={permintaan.pemohon?.nama_lengkap ?? "—"}
                />
                <BarisKeterangan
                    label="Unit kerja"
                    nilai={permintaan.unit_kerja?.nama ?? "—"}
                />
                <BarisKeterangan label="Keperluan" nilai={permintaan.keperluan} />
                <BarisKeterangan
                    label="Tanggal permintaan"
                    nilai={
                        permintaan.tanggal
                            ? tanggalPanjang(permintaan.tanggal)
                            : "—"
                    }
                />
                <BarisKeterangan
                    label="Tanggal dibutuhkan"
                    nilai={
                        permintaan.tanggal_dibutuhkan
                            ? tanggalPanjang(permintaan.tanggal_dibutuhkan)
                            : "Tidak ditentukan"
                    }
                />
                <BarisKeterangan
                    label="Tanggal diajukan"
                    nilai={
                        permintaan.diajukan_at
                            ? tanggalPanjang(permintaan.diajukan_at)
                            : "—"
                    }
                />
                {permintaan.catatan_pemohon && (
                    <BarisKeterangan
                        label="Catatan pemohon"
                        nilai={permintaan.catatan_pemohon}
                    />
                )}
            </dl>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Barang ({permintaan.permintaan_item.length})
                </h3>
                <ul className="divide-y divide-border">
                    {permintaan.permintaan_item.map((item) => (
                        <BarisBarang
                            key={item.id}
                            item={item}
                            stok={stok[item.barang_id]}
                        />
                    ))}
                </ul>
            </section>

            {/* Persis satu aksi, ditentukan oleh status - tidak pernah
                keduanya sekaligus. */}
            {bolehSiapkan && (
                <Button className="h-9.5 w-fit" onClick={() => setSiapkan(true)}>
                    <PackageCheck />
                    Siapkan
                </Button>
            )}
            {bolehSerahkan && (
                <Button className="h-9.5 w-fit" onClick={() => setSerahkan(true)}>
                    <Truck />
                    Serahkan
                </Button>
            )}

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Riwayat
                </h3>
                {/* Disebutkan berikut namanya, sama seperti layar tata usaha:
                    policy baca_profil membuka seluruh baris untuk is_staf(). */}
                <ol className="divide-y divide-border">
                    {log.map((l) => (
                        <li
                            key={l.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-foreground">
                                    {kalimatLogBernama(
                                        l.status_ke,
                                        l.oleh?.nama_lengkap,
                                    )}
                                </p>
                                {l.catatan && (
                                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                        {l.catatan}
                                    </p>
                                )}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {waktuSingkat(l.created_at)}
                            </span>
                        </li>
                    ))}
                </ol>
            </section>

            <DialogForm
                key={siapkan ? "siapkan" : "siapkan-tertutup"}
                terbuka={siapkan}
                onTerbukaBerubah={setSiapkan}
                judul="Siapkan permintaan ini?"
                keterangan="Permintaan dilayani utuh atau tidak sama sekali. Kalau satu barang saja kurang, seluruh penyiapan gagal dan tidak ada yang berpindah dari stok."
                aksi={siapkanPermintaanMasuk.bind(null, permintaan.id)}
                labelSimpan="Siapkan"
                labelMenyimpan="Menyiapkan"
            />

            <DialogForm
                key={serahkan ? "serahkan" : "serahkan-tertutup"}
                terbuka={serahkan}
                onTerbukaBerubah={setSerahkan}
                judul={`Serahkan ke ${permintaan.pemohon?.nama_lengkap ?? "pemohon ini"}?`}
                keterangan={`Diserahkan atas nama ${permintaan.unit_kerja?.nama ?? "unit kerja ini"}. Barang sudah keluar dari stok sejak disiapkan - menyerahkan tidak menulis mutasi apa pun lagi.`}
                aksi={serahkanPermintaanMasuk.bind(null, permintaan.id)}
                labelSimpan="Serahkan"
                labelMenyimpan="Menyerahkan"
            />
        </div>
    );
}

/**
 * Angka stok ditampilkan sebagai tanda, tidak pernah menggerbangi
 * tombol Siapkan: nomornya dibaca detik ini, dan penerimaan bisa saja
 * baru saja tercatat. siapkan_permintaan() adalah penjaga sesungguhnya,
 * dan galatnya sudah tertulis sebagai kalimat yang menyebut barang mana
 * yang kurang.
 */
function BarisBarang({
    item,
    stok,
}: {
    item: ItemPermintaanDetail;
    stok: number | undefined;
}) {
    const kurang = stok !== undefined && item.jumlah_diminta > stok;

    return (
        <li className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">
                    {item.nama_barang_snapshot}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.jumlah_diminta} {item.satuan_snapshot}
                </p>
            </div>

            {stok !== undefined && (
                <span
                    className={cn(
                        "flex shrink-0 items-center gap-1 text-xs",
                        kurang ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {kurang && (
                        <TriangleAlert
                            aria-hidden
                            className="size-3.5"
                            strokeWidth={1.8}
                        />
                    )}
                    {kurang ? `Stok ${stok}, kurang` : `Stok ${stok}`}
                </span>
            )}
        </li>
    );
}
