"use client";

import { Pencarian } from "@/components/admin/pencarian";
import { FormAlert } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MAKS_JUMLAH } from "@/lib/permintaan";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { setelJumlah, tambahKeKeranjang } from "./actions";
import { cn } from "@/lib/utils";

export type BarisKatalog = {
    barang_id: string;
    kode: string;
    nama: string;
    satuan: string;
    tersedia: boolean;
};

/**
 * Katalog belanja. Satu bentuk kartu di semua lebar layar, bukan tabel di
 * layar lebar: tiap baris memuat kontrolnya sendiri, dan kartu membuat
 * kontrol itu berada di tempat yang sama di ponsel maupun di laptop.
 */
export function KatalogDaftar({
    baris,
    cari,
    draftId,
    isi,
    tanpaUnitKerja,
}: {
    baris: BarisKatalog[];
    cari: string;
    /** Keranjang yang sedang terbuka, kalau ada. */
    draftId: string | null;
    /** barang_id -> jumlah yang sudah ada di keranjang. */
    isi: Record<string, number>;
    tanpaUnitKerja: boolean;
}) {
    // Tombol di baris tidak punya dialog tempat menaruh pesan galatnya, jadi
    // pesannya naik ke satu tempat di atas daftar - terbaca dari baris mana
    // pun kegagalannya datang.
    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();

    const tambah = (barang: BarisKatalog) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await tambahKeKeranjang(barang.barang_id);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    const setel = (barang: BarisKatalog, jumlah: number) => {
        if (!draftId) return;
        setGalat(null);
        mulai(async () => {
            const hasil = await setelJumlah(draftId, barang.barang_id, jumlah);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    const jumlahBarang = Object.keys(isi).length;

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Pencarian
                awal={cari}
                jalur="/katalog"
                placeholder="Cari nama atau kode barang"
                ariaLabel="Cari barang"
            />

            {tanpaUnitKerja && (
                <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-[13px] leading-relaxed text-destructive">
                    Akun Anda belum terhubung ke unit kerja, jadi permintaan
                    belum bisa dibuat. Minta tata usaha mengisinya lebih dulu.
                </p>
            )}

            {galat && <FormAlert>{galat}</FormAlert>}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {cari
                        ? `Tidak ada barang yang cocok dengan “${cari}”.`
                        : "Katalog masih kosong. Barang muncul di sini setelah tata usaha mencatat penerimaan pertama."}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((barang) => (
                        <li
                            key={barang.barang_id}
                            className={cn(
                                "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
                                barang.tersedia ? "bg-card" : "bg-muted",
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">
                                    {barang.nama}
                                </p>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                    {barang.kode}
                                </p>
                                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Satuan: {barang.satuan}</span>
                                    {!barang.tersedia && (
                                        <Badge
                                            variant="outline"
                                            className="text-muted-foreground"
                                        >
                                            Sedang kosong
                                        </Badge>
                                    )}
                                </p>
                            </div>

                            {/* Barang kosong tidak menawarkan tombol apa pun.
                                Penolakannya sendiri tetap milik database:
                                trigger siapkan_permintaan_item yang menolak,
                                bukan atribut disabled ini. */}
                            {tanpaUnitKerja || !barang.tersedia ? null : isi[
                                  barang.barang_id
                              ] ? (
                                <Penyetel
                                    nama={barang.nama}
                                    jumlah={isi[barang.barang_id]}
                                    menunggu={menunggu}
                                    onUbah={(n) => setel(barang, n)}
                                />
                            ) : (
                                <Button
                                    variant="outline"
                                    className="h-9.5 shrink-0"
                                    disabled={menunggu}
                                    onClick={() => tambah(barang)}
                                    aria-label={`Tambahkan ${barang.nama} ke keranjang`}
                                >
                                    <Plus />
                                    Tambah
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Keranjang mengumumkan dirinya di tempat ia sedang diisi.
                Lencana hidup di nav akan berarti menyalurkan hitungan lewat
                layout dashboard ke AppShell pada setiap navigasi. */}
            {jumlahBarang > 0 && draftId && (
                <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                        <p className="text-[13px] text-muted-foreground">
                            <span className="font-medium text-foreground">
                                {jumlahBarang} barang
                            </span>{" "}
                            di keranjang
                        </p>
                        <Button asChild className="h-9.5 shrink-0">
                            <Link href={`/permintaan-saya/${draftId}`}>
                                <ShoppingCart />
                                Lihat Keranjang
                            </Link>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Tombol kurang / angka / tombol tambah. Diekspor karena halaman detail
 * memakai penyetel yang sama persis - dua salinan akan berarti dua tempat
 * yang bisa berbeda soal apa arti menekan minus di angka satu.
 */
export function Penyetel({
    nama,
    jumlah,
    menunggu,
    onUbah,
}: {
    nama: string;
    jumlah: number;
    menunggu: boolean;
    onUbah: (jumlah: number) => void;
}) {
    return (
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={menunggu}
                onClick={() => onUbah(jumlah - 1)}
                aria-label={
                    jumlah === 1
                        ? `Keluarkan ${nama} dari keranjang`
                        : `Kurangi jumlah ${nama}`
                }
            >
                <Minus className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            <span className="w-7 text-center text-[13px] font-medium tabular-nums text-foreground">
                {jumlah}
            </span>
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={menunggu || jumlah >= MAKS_JUMLAH}
                onClick={() => onUbah(jumlah + 1)}
                aria-label={`Tambah jumlah ${nama}`}
            >
                <Plus className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
        </div>
    );
}
