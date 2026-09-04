import { Pencarian } from "@/components/admin/pencarian";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { alamatStok } from "./page";

export type BarisStok = {
    barang_id: string;
    kode: string;
    nama: string;
    satuan: string;
    stok: number;
    status: "kosong" | "tersedia";
};

/**
 * Lookup, bukan tabel kelola: tidak ada baris yang menawarkan koreksi atau
 * pergerakan apa pun. Mencampur tulis ke dalam tabel lookup adalah cara
 * baris yang salah berakhir disunting - koreksi hidup di /penyesuaian.
 *
 * Tanpa "use client": Pencarian dan tautan filter kosong sama-sama
 * menulis ke URL, jadi halaman ini tidak butuh state peramban sama
 * sekali.
 */
export function StokDaftar({
    baris,
    cari,
    kosong,
}: {
    baris: BarisStok[];
    cari: string;
    kosong: boolean;
}) {
    const jalur = kosong ? "/stok?kosong=1" : "/stok";

    const teksKosong = cari
        ? `Tidak ada barang yang cocok dengan “${cari}”.`
        : kosong
          ? "Tidak ada barang yang kosong saat ini."
          : "Belum ada barang. Barang muncul di sini setelah tata usaha menambahkannya ke master barang.";

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
                <Pencarian
                    awal={cari}
                    jalur={jalur}
                    placeholder="Cari kode atau nama barang"
                    ariaLabel="Cari barang"
                />
                <Link
                    href={alamatStok(cari, !kosong)}
                    scroll={false}
                    aria-pressed={kosong}
                    className={cn(
                        "shrink-0 rounded-lg border px-3 py-1.5 text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        kosong
                            ? "border-transparent bg-muted font-medium text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                    )}
                >
                    Hanya kosong
                </Link>
            </div>

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {teksKosong}
                </p>
            ) : (
                <>
                    {/* Ponsel: kartu, bukan tabel - sama seperti Master Barang. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {baris.map((b) => (
                            <li
                                key={b.barang_id}
                                className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">
                                        {b.nama}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                        {b.kode}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {b.stok} {b.satuan}
                                    </p>
                                </div>
                                <StatusStok status={b.status} />
                            </li>
                        ))}
                    </ul>

                    <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-64 px-5 text-xs text-muted-foreground">
                                        Kode
                                    </TableHead>
                                    <TableHead className="text-xs text-muted-foreground">
                                        Nama Barang
                                    </TableHead>
                                    <TableHead className="w-24 text-xs text-muted-foreground">
                                        Satuan
                                    </TableHead>
                                    <TableHead className="w-24 text-xs text-muted-foreground">
                                        Stok
                                    </TableHead>
                                    <TableHead className="w-28 px-5 text-xs text-muted-foreground">
                                        Status
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {baris.map((b) => (
                                    <TableRow key={b.barang_id}>
                                        <TableCell className="px-5 py-3 font-mono text-xs text-muted-foreground">
                                            {b.kode}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] font-medium whitespace-normal text-foreground">
                                            {b.nama}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] text-muted-foreground">
                                            {b.satuan}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] tabular-nums text-foreground">
                                            {b.stok}
                                        </TableCell>
                                        <TableCell className="px-5 py-3">
                                            <StatusStok status={b.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}
        </div>
    );
}

function StatusStok({ status }: { status: BarisStok["status"] }) {
    return (
        <Badge
            variant={status === "kosong" ? "outline" : "secondary"}
            className={status === "kosong" ? "text-muted-foreground" : ""}
        >
            {status === "kosong" ? "Kosong" : "Tersedia"}
        </Badge>
    );
}
