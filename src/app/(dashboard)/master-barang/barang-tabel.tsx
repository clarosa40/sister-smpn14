"use client";

import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { buatBarang, hapusBarang, ubahBarang } from "./actions";
import { Pencarian } from "./pencarian";

export type BarisBarang = {
    id: string;
    kode: string;
    nama: string;
    satuan: string;
};

const DAFTAR_SATUAN = "daftar-satuan";

export function BarangTabel({
    baris,
    cari,
    satuan,
}: {
    baris: BarisBarang[];
    cari: string;
    /** Satuan yang sudah dipakai, untuk melengkapi isian otomatis. */
    satuan: string[];
}) {
    const [tambah, setTambah] = React.useState(false);
    const [diubah, setDiubah] = React.useState<BarisBarang | null>(null);
    const [dihapus, setDihapus] = React.useState<BarisBarang | null>(null);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
                <Pencarian awal={cari} />
                <Button
                    onClick={() => setTambah(true)}
                    className="h-9.5 shrink-0"
                >
                    <Plus />
                    <span className="hidden sm:inline">Tambah Barang</span>
                    <span className="sr-only sm:hidden">Tambah barang</span>
                </Button>
            </div>

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {cari
                        ? `Tidak ada barang yang cocok dengan “${cari}”.`
                        : "Belum ada barang. Tambahkan lewat tombol di atas."}
                </p>
            ) : (
                <>
                    {/* Ponsel: kartu, bukan tabel. Kode inventaris sekolah
                        panjang - empat kolom di layar 375px tidak terbaca. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {baris.map((barang) => (
                            <li
                                key={barang.id}
                                className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground">
                                        {barang.nama}
                                    </p>
                                    <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                        {barang.kode}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Satuan: {barang.satuan}
                                    </p>
                                </div>
                                <TombolBaris
                                    barang={barang}
                                    onUbah={setDiubah}
                                    onHapus={setDihapus}
                                />
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
                                    <TableHead className="w-24 px-5 text-right text-xs text-muted-foreground">
                                        Tindakan
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {baris.map((barang) => (
                                    <TableRow key={barang.id}>
                                        <TableCell className="px-5 py-3 font-mono text-xs text-muted-foreground">
                                            {barang.kode}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] font-medium whitespace-normal text-foreground">
                                            {barang.nama}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] text-muted-foreground">
                                            {barang.satuan}
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-right">
                                            <TombolBaris
                                                barang={barang}
                                                onUbah={setDiubah}
                                                onHapus={setDihapus}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            <DialogForm
                terbuka={tambah}
                onTerbukaBerubah={setTambah}
                judul="Tambah Barang"
                keterangan="Kode disalin apa adanya dari Excel inventaris sekolah; aplikasi hanya menjaga keunikannya."
                aksi={buatBarang}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <IsianBarang satuan={satuan} />
            </DialogForm>

            <DialogForm
                key={diubah?.id}
                terbuka={diubah !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDiubah(null)}
                judul="Ubah Barang"
                keterangan="Permintaan dan penerimaan lama menyimpan salinan nama dan satuannya sendiri, jadi riwayat tidak ikut berubah."
                aksi={ubahBarang.bind(null, diubah?.id ?? "")}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <IsianBarang awal={diubah} satuan={satuan} />
            </DialogForm>

            <DialogForm
                key={`hapus-${dihapus?.id}`}
                terbuka={dihapus !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDihapus(null)}
                judul={`Hapus ${dihapus?.nama ?? ""}?`}
                keterangan="Barang yang pernah masuk ke permintaan, penerimaan, atau buku mutasi tidak bisa dihapus."
                aksi={hapusBarang.bind(null, dihapus?.id ?? "")}
                labelSimpan="Hapus"
                labelMenyimpan="Menghapus"
                merusak
            />
        </div>
    );
}

function IsianBarang({
    awal,
    satuan,
}: {
    awal?: BarisBarang | null;
    satuan: string[];
}) {
    return (
        <>
            <BidangDialog
                id="kode"
                label="Kode Barang"
                defaultValue={awal?.kode}
                placeholder="1.1.7.01.02.01.001.00852"
                className="h-9.5 font-mono text-xs"
                required
                autoFocus
                maxLength={60}
            />
            <BidangDialog
                id="nama"
                label="Nama Barang"
                defaultValue={awal?.nama}
                placeholder="Kertas HVS A4 70 gram"
                required
                maxLength={120}
            />
            <BidangDialog
                id="satuan"
                label="Satuan"
                defaultValue={awal?.satuan}
                placeholder="rim"
                list={DAFTAR_SATUAN}
                petunjuk="Pilih satuan yang sudah ada bila cocok - laporan konsumsi pecah kalau “pcs” juga ditulis “Pcs”."
                required
                maxLength={20}
            />
            <datalist id={DAFTAR_SATUAN}>
                {satuan.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>
        </>
    );
}

function TombolBaris({
    barang,
    onUbah,
    onHapus,
}: {
    barang: BarisBarang;
    onUbah: (barang: BarisBarang) => void;
    onHapus: (barang: BarisBarang) => void;
}) {
    return (
        <div className="flex shrink-0 items-center justify-end gap-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onUbah(barang)}
                aria-label={`Ubah ${barang.nama}`}
            >
                <Pencil className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onHapus(barang)}
                aria-label={`Hapus ${barang.nama}`}
            >
                <Trash2 className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
        </div>
    );
}
