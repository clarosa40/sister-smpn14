import { LencanaStatus } from "@/components/permintaan-parts";
import {
    tanggalPanjang,
    type Draft,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { ChevronRight, ShoppingCart } from "lucide-react";
import Link from "next/link";

export type BarisPermintaan = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    created_at: string;
    permintaan_item: { id: string }[];
};

export function DaftarPermintaan({
    draft,
    baris,
}: {
    draft: Draft | null;
    baris: BarisPermintaan[];
}) {
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {draft && (
                <Link
                    href={`/permintaan-saya/${draft.id}`}
                    className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3.5 transition-colors outline-none hover:bg-primary/12 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    <ShoppingCart
                        aria-hidden
                        className="size-4 shrink-0 text-primary"
                        strokeWidth={1.6}
                    />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                            Keranjang
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {draft.item.length} barang, belum diajukan
                        </p>
                    </div>
                    <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.6}
                    />
                </Link>
            )}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    Belum ada permintaan yang diajukan.
                    <br />
                    Mulai dari{" "}
                    <Link
                        href="/katalog"
                        className="font-medium text-foreground underline underline-offset-4"
                    >
                        Katalog Barang
                    </Link>
                    .
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`/permintaan-saya/${p.id}`}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-[13px] font-medium text-foreground">
                                            {p.nomor ?? "Tanpa nomor"}
                                        </span>
                                        <LencanaStatus status={p.status} />
                                    </div>
                                    <p className="mt-1 truncate text-[13px] text-muted-foreground">
                                        {p.keperluan}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {p.permintaan_item.length} barang ·{" "}
                                        {tanggalPanjang(p.created_at)}
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
