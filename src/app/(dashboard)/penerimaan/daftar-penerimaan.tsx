import { Pencarian } from "@/components/admin/pencarian";
import { Button } from "@/components/ui/button";
import { tanggalPanjang } from "@/lib/permintaan";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

export type BarisPenerimaan = {
    id: string;
    nomor: string;
    tanggal: string;
    no_dokumen: string | null;
    penerimaan_item: { id: string }[];
};

/**
 * Tanpa "use client": Pencarian menulis kata kuncinya ke URL, jadi
 * halaman ini tidak butuh state peramban sama sekali - persis pola
 * Master Barang dan Riwayat Persetujuan.
 */
export function DaftarPenerimaan({
    baris,
    cari,
}: {
    baris: BarisPenerimaan[];
    cari: string;
}) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
                <Pencarian
                    awal={cari}
                    jalur="/penerimaan"
                    placeholder="Cari nomor atau no dokumen"
                    ariaLabel="Cari penerimaan"
                />
                <Button asChild className="ml-auto h-9.5 shrink-0">
                    <Link href="/penerimaan/baru">
                        <Plus />
                        <span className="hidden sm:inline">
                            Catat Penerimaan
                        </span>
                        <span className="sr-only sm:hidden">
                            Catat penerimaan
                        </span>
                    </Link>
                </Button>
            </div>

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {cari
                        ? `Tidak ada penerimaan yang cocok dengan “${cari}”.`
                        : "Belum ada penerimaan yang tercatat. Catat yang pertama lewat tombol di atas."}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`/penerimaan/${p.id}`}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="font-mono text-[13px] font-medium text-foreground">
                                        {p.nomor}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {tanggalPanjang(p.tanggal)}
                                        {p.no_dokumen && ` · ${p.no_dokumen}`}
                                        {` · ${p.penerimaan_item.length} barang`}
                                    </p>
                                </div>
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground"
                                    strokeWidth={1.6}
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
