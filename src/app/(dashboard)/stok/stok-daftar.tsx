"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
    createColumnHelper,
    createPaginatedRowModel,
    createSortedRowModel,
    rowPaginationFeature,
    rowSortingFeature,
    tableFeatures,
    useTable,
    type ReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type BarisStok = {
    barang_id: string;
    kode: string;
    nama: string;
    satuan: string;
    stok: number;
    status: "kosong" | "tersedia";
};

const features = tableFeatures({
    rowSortingFeature,
    rowPaginationFeature,
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
});

const kolom = createColumnHelper<typeof features, BarisStok>();

const daftarKolom = kolom.columns([
    kolom.accessor("kode", {
        header: "Kode",
        cell: (info) => (
            <span className="font-mono text-xs text-muted-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("nama", {
        header: "Nama Barang",
        cell: (info) => (
            <span className="text-[13px] font-medium whitespace-normal text-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("satuan", {
        header: "Satuan",
        cell: (info) => (
            <span className="text-[13px] text-muted-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("stok", {
        header: "Stok",
        cell: (info) => (
            <span className="text-[13px] tabular-nums text-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("status", {
        header: "Status",
        cell: (info) => <StatusStok status={info.getValue()} />,
    }),
]);

/** Lebar kolom header dan padding sel, dari satu sumber supaya keduanya tidak melenceng. */
const KELAS_KOLOM: Partial<Record<string, string>> = {
    kode: "w-64 px-5",
    satuan: "w-24",
    stok: "w-24",
    status: "w-28 px-5",
};

/**
 * Lookup, bukan tabel kelola: tidak ada baris yang menawarkan koreksi atau
 * pergerakan apa pun. Mencampur tulis ke dalam tabel lookup adalah cara
 * baris yang salah berakhir disunting - koreksi hidup di /penyesuaian.
 *
 * Semua baris diambil sekali di server lalu disortir, difilter, dan
 * dipaginasi di peramban lewat TanStack Table - skalanya (≤200 baris
 * sekolah) tidak butuh pulang-pergi ke server tiap kali penggunanya
 * mengurutkan atau menyaring.
 */
export function StokDaftar({ baris }: { baris: BarisStok[] }) {
    const table = useTable({
        features,
        data: baris,
        columns: daftarKolom,
        initialState: {
            sorting: [{ id: "kode", desc: false }],
            pagination: { pageIndex: 0, pageSize: 25 },
        },
    });

    const barisHalaman = table.getRowModel().rows;

    return (
        <div className="flex flex-col gap-4">
            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    Belum ada barang. Barang muncul di sini setelah tata usaha
                    menambahkannya ke master barang.
                </p>
            ) : (
                <>
                    {/* Ponsel: kartu, bukan tabel - sama seperti Master Barang. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {barisHalaman.map((row) => {
                            const b = row.original;
                            return (
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
                            );
                        })}
                    </ul>

                    <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
                        <Table>
                            <TableHeader>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow
                                        key={headerGroup.id}
                                        className="hover:bg-transparent"
                                    >
                                        {headerGroup.headers.map((header) => {
                                            const kelas = cn(
                                                "text-xs text-muted-foreground",
                                                KELAS_KOLOM[header.column.id],
                                            );

                                            if (header.isPlaceholder) {
                                                return (
                                                    <TableHead
                                                        key={header.id}
                                                        className={kelas}
                                                    />
                                                );
                                            }

                                            if (!header.column.getCanSort()) {
                                                return (
                                                    <TableHead
                                                        key={header.id}
                                                        className={kelas}
                                                    >
                                                        <table.FlexRender
                                                            header={header}
                                                        />
                                                    </TableHead>
                                                );
                                            }

                                            return (
                                                <TableHead
                                                    key={header.id}
                                                    className={kelas}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={header.column.getToggleSortingHandler()}
                                                        className="inline-flex items-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                                    >
                                                        <table.FlexRender
                                                            header={header}
                                                        />
                                                        <IndikatorSortir
                                                            arah={header.column.getIsSorted()}
                                                        />
                                                    </button>
                                                </TableHead>
                                            );
                                        })}
                                    </TableRow>
                                ))}
                            </TableHeader>
                            <TableBody>
                                {barisHalaman.map((row) => (
                                    <TableRow key={row.id}>
                                        {row.getAllCells().map((cell) => (
                                            <TableCell
                                                key={cell.id}
                                                className={cn(
                                                    "py-3",
                                                    KELAS_KOLOM[cell.column.id],
                                                )}
                                            >
                                                <table.FlexRender cell={cell} />
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <PaginasiKlien table={table} total={baris.length} />
                </>
            )}
        </div>
    );
}

function IndikatorSortir({ arah }: { arah: "asc" | "desc" | false }) {
    if (arah === "asc") return <ArrowUp className="size-3.5" />;
    if (arah === "desc") return <ArrowDown className="size-3.5" />;
    return <ChevronsUpDown className="size-3.5 text-muted-foreground/50" />;
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

/**
 * Gaya visualnya meniru <Paginasi> (komponen server, dipakai di halaman
 * lain), tapi tombolnya memanggil balik ke TanStack Table alih-alih
 * menulis ke URL - state ada di peramban, bukan di alamat halaman.
 *
 * `total` datang sebagai prop terpisah, bukan dari `table`, sebab belum
 * ada fitur filter terpasang di sini (itu tiket 02) - baris.length sudah
 * jumlah barang seutuhnya untuk saat ini.
 */
function PaginasiKlien({
    table,
    total,
}: {
    table: ReactTable<typeof features, BarisStok>;
    total: number;
}) {
    const { pageIndex, pageSize } = table.state.pagination;
    const dari = pageIndex * pageSize;
    const ditampilkan = table.getRowModel().rows.length;
    const jumlahHalaman = table.getPageCount();

    return (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
                Menampilkan {ditampilkan === 0 ? 0 : dari + 1}–
                {dari + ditampilkan} dari {total} barang
            </p>

            {jumlahHalaman > 1 && (
                <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!table.getCanPreviousPage()}
                        onClick={() => table.previousPage()}
                    >
                        Sebelumnya
                    </Button>
                    <span className="px-1 tabular-nums">
                        {pageIndex + 1} / {jumlahHalaman}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!table.getCanNextPage()}
                        onClick={() => table.nextPage()}
                    >
                        Berikutnya
                    </Button>
                </div>
            )}
        </div>
    );
}
