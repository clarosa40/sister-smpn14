"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cocokPilihan, cocokTeks, dalamRentangStok } from "@/lib/stok-filter";
import { cn } from "@/lib/utils";
import {
    columnFilteringFeature,
    createColumnHelper,
    createFilteredRowModel,
    createPaginatedRowModel,
    createSortedRowModel,
    rowPaginationFeature,
    rowSortingFeature,
    tableFeatures,
    useTable,
    type ReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";
import * as React from "react";

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
    columnFilteringFeature,
    sortedRowModel: createSortedRowModel(),
    paginatedRowModel: createPaginatedRowModel(),
    filteredRowModel: createFilteredRowModel(),
});

// Nilai sentinel dropdown Satuan/Status: Radix Select menolak value="".
// Dibuat tidak lazim (bukan "semua" polos) supaya tidak pernah bentrok
// dengan satuan sungguhan - master-barang tidak melarang operator memberi
// nama satuan "semua".
const SEMUA = "__semua__";

/**
 * `autoRemove` melekat di sini, bukan dicek manual di pemanggilnya: TanStack
 * hanya melepas entri filter dari state saat nilainya `undefined` atau
 * string kosong secara bawaan - tuple `[min, max]` tidak pernah cocok
 * kriteria itu walau kedua sisinya kosong. Menaruh aturannya di filterFn
 * berlaku untuk siapa pun yang memanggil `setFilterValue` kelak, bukan
 * cuma dua input di AlatFilter saat ini.
 */
function filterRentangStok(
    row: { getValue: (columnId: string) => number },
    columnId: string,
    [min, max]: [number?, number?],
): boolean {
    return dalamRentangStok(row.getValue(columnId), min, max);
}
filterRentangStok.autoRemove = ([min, max]: [number?, number?]) =>
    min === undefined && max === undefined;

const kolom = createColumnHelper<typeof features, BarisStok>();

const daftarKolom = kolom.columns([
    kolom.accessor("kode", {
        header: "Kode",
        filterFn: (row, columnId, nilai: string) =>
            cocokTeks(row.getValue(columnId), nilai),
        cell: (info) => (
            <span className="font-mono text-xs text-muted-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("nama", {
        header: "Nama Barang",
        filterFn: (row, columnId, nilai: string) =>
            cocokTeks(row.getValue(columnId), nilai),
        cell: (info) => (
            <span className="text-[13px] font-medium whitespace-normal text-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("satuan", {
        header: "Satuan",
        filterFn: (row, columnId, nilai: string) =>
            cocokPilihan(row.getValue(columnId), nilai),
        cell: (info) => (
            <span className="text-[13px] text-muted-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("stok", {
        header: "Stok",
        filterFn: filterRentangStok,
        cell: (info) => (
            <span className="text-[13px] tabular-nums text-foreground">
                {info.getValue()}
            </span>
        ),
    }),
    kolom.accessor("status", {
        header: "Status",
        filterFn: (row, columnId, nilai: string) =>
            cocokPilihan(row.getValue(columnId), nilai),
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

    // Dihitung dari baris.length, bukan lewat query terpisah: kardinalitasnya
    // rendah (≤10 satuan di sekolah) sehingga aman dikomputasi ulang di sini.
    const daftarSatuan = React.useMemo(
        () =>
            [...new Set(baris.map((b) => b.satuan))].sort((a, b) =>
                a.localeCompare(b, "id"),
            ),
        [baris],
    );

    return (
        <div className="flex flex-col gap-4">
            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    Belum ada barang. Barang muncul di sini setelah tata usaha
                    menambahkannya ke master barang.
                </p>
            ) : (
                <>
                    <AlatFilter table={table} daftarSatuan={daftarSatuan} />

                    {barisHalaman.length === 0 ? (
                        <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                            Tidak ada barang yang cocok dengan filter yang
                            dipilih.
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
                                        {table
                                            .getHeaderGroups()
                                            .map((headerGroup) => (
                                                <TableRow
                                                    key={headerGroup.id}
                                                    className="hover:bg-transparent"
                                                >
                                                    {headerGroup.headers.map(
                                                        (header) => {
                                                            const kelas = cn(
                                                                "text-xs text-muted-foreground",
                                                                KELAS_KOLOM[
                                                                    header
                                                                        .column
                                                                        .id
                                                                ],
                                                            );

                                                            if (
                                                                header.isPlaceholder
                                                            ) {
                                                                return (
                                                                    <TableHead
                                                                        key={
                                                                            header.id
                                                                        }
                                                                        className={
                                                                            kelas
                                                                        }
                                                                    />
                                                                );
                                                            }

                                                            if (
                                                                !header.column.getCanSort()
                                                            ) {
                                                                return (
                                                                    <TableHead
                                                                        key={
                                                                            header.id
                                                                        }
                                                                        className={
                                                                            kelas
                                                                        }
                                                                    >
                                                                        <table.FlexRender
                                                                            header={
                                                                                header
                                                                            }
                                                                        />
                                                                    </TableHead>
                                                                );
                                                            }

                                                            return (
                                                                <TableHead
                                                                    key={
                                                                        header.id
                                                                    }
                                                                    className={
                                                                        kelas
                                                                    }
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onClick={header.column.getToggleSortingHandler()}
                                                                        className="inline-flex items-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                                                    >
                                                                        <table.FlexRender
                                                                            header={
                                                                                header
                                                                            }
                                                                        />
                                                                        <IndikatorSortir
                                                                            arah={header.column.getIsSorted()}
                                                                        />
                                                                    </button>
                                                                </TableHead>
                                                            );
                                                        },
                                                    )}
                                                </TableRow>
                                            ))}
                                    </TableHeader>
                                    <TableBody>
                                        {barisHalaman.map((row) => (
                                            <TableRow key={row.id}>
                                                {row
                                                    .getAllCells()
                                                    .map((cell) => (
                                                        <TableCell
                                                            key={cell.id}
                                                            className={cn(
                                                                "py-3",
                                                                KELAS_KOLOM[
                                                                    cell.column
                                                                        .id
                                                                ],
                                                            )}
                                                        >
                                                            <table.FlexRender
                                                                cell={cell}
                                                            />
                                                        </TableCell>
                                                    ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}

                    <PaginasiKlien
                        table={table}
                        total={table.getFilteredRowModel().rows.length}
                    />
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
 * Toolbar dua baris di atas tabel. Baris 1: Kode, Nama, Satuan, Status.
 * Baris 2: rentang Stok dan tombol Hapus filter.
 *
 * Nilai filter dibaca dan ditulis langsung lewat `table.getColumn(id)` -
 * TanStack Table sudah memegang `columnFilters` di state internalnya, jadi
 * tidak perlu disalin ke `useState` sendiri di sini (sama seperti
 * `PaginasiKlien` memanggil `table.previousPage()` langsung).
 */
function AlatFilter({
    table,
    daftarSatuan,
}: {
    table: ReactTable<typeof features, BarisStok>;
    daftarSatuan: string[];
}) {
    const filterAktif = table.state.columnFilters.length > 0;

    // State lokal dipertahankan cuma untuk tampilan input, bukan sebagai
    // sumber kebenaran: nilai yang belum berupa angka valid (mis. "-" saat
    // baru diketik) harus tetap terlihat di kotaknya sendiri walau belum
    // ikut membatasi filter - kalau dibaca balik dari `getFilterValue()`,
    // angka yang gagal di-parse akan hilang dari kotaknya.
    const [stokMin, setStokMin] = React.useState("");
    const [stokMax, setStokMax] = React.useState("");

    const angkaAtauUndefined = (nilai: string): number | undefined => {
        if (nilai.trim() === "") return undefined;
        const n = Number(nilai);
        return Number.isFinite(n) ? n : undefined;
    };

    const terapkanRentangStok = (min: string, max: string) => {
        table
            .getColumn("stok")
            ?.setFilterValue([angkaAtauUndefined(min), angkaAtauUndefined(max)]);
    };

    const hapusFilter = () => {
        table.resetColumnFilters(true);
        setStokMin("");
        setStokMax("");
    };

    return (
        <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Input
                    value={
                        (table.getColumn("kode")?.getFilterValue() as
                            | string
                            | undefined) ?? ""
                    }
                    onChange={(e) =>
                        table.getColumn("kode")?.setFilterValue(e.target.value)
                    }
                    placeholder="Kode"
                    aria-label="Filter kode"
                    className="h-9.5"
                />
                <Input
                    value={
                        (table.getColumn("nama")?.getFilterValue() as
                            | string
                            | undefined) ?? ""
                    }
                    onChange={(e) =>
                        table.getColumn("nama")?.setFilterValue(e.target.value)
                    }
                    placeholder="Nama barang"
                    aria-label="Filter nama barang"
                    className="h-9.5"
                />
                <Select
                    value={
                        (table.getColumn("satuan")?.getFilterValue() as
                            | string
                            | undefined) ?? SEMUA
                    }
                    onValueChange={(nilai) =>
                        table
                            .getColumn("satuan")
                            ?.setFilterValue(
                                nilai === SEMUA ? undefined : nilai,
                            )
                    }
                >
                    <SelectTrigger aria-label="Filter satuan" className="h-9.5">
                        <SelectValue placeholder="Satuan" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SEMUA}>Semua satuan</SelectItem>
                        {daftarSatuan.map((satuan) => (
                            <SelectItem key={satuan} value={satuan}>
                                {satuan}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={
                        (table.getColumn("status")?.getFilterValue() as
                            | string
                            | undefined) ?? SEMUA
                    }
                    onValueChange={(nilai) =>
                        table
                            .getColumn("status")
                            ?.setFilterValue(
                                nilai === SEMUA ? undefined : nilai,
                            )
                    }
                >
                    <SelectTrigger aria-label="Filter status" className="h-9.5">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={SEMUA}>Semua status</SelectItem>
                        <SelectItem value="kosong">Kosong</SelectItem>
                        <SelectItem value="tersedia">Tersedia</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
                <Input
                    type="number"
                    inputMode="numeric"
                    value={stokMin}
                    onChange={(e) => {
                        setStokMin(e.target.value);
                        terapkanRentangStok(e.target.value, stokMax);
                    }}
                    placeholder="Stok minimum"
                    aria-label="Stok minimum"
                    className="h-9.5 w-36"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                    type="number"
                    inputMode="numeric"
                    value={stokMax}
                    onChange={(e) => {
                        setStokMax(e.target.value);
                        terapkanRentangStok(stokMin, e.target.value);
                    }}
                    placeholder="Stok maksimum"
                    aria-label="Stok maksimum"
                    className="h-9.5 w-36"
                />

                {filterAktif && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={hapusFilter}
                        className="ml-auto"
                    >
                        <X />
                        Hapus filter
                    </Button>
                )}
            </div>
        </div>
    );
}

/**
 * Gaya visualnya meniru <Paginasi> (komponen server, dipakai di halaman
 * lain), tapi tombolnya memanggil balik ke TanStack Table alih-alih
 * menulis ke URL - state ada di peramban, bukan di alamat halaman.
 *
 * `total` datang sebagai prop terpisah, bukan dari `baris.length`: begitu
 * filter aktif, jumlah barang yang relevan adalah hasil
 * `getFilteredRowModel()`, bukan seluruh data yang diambil dari server.
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
