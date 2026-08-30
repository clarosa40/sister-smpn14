"use client";

import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { FormAlert } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { buatUnit, hapusUnit, setAktifUnit, ubahUnit } from "./actions";

export type BarisUnit = {
    id: string;
    nama: string;
    aktif: boolean;
};

export function UnitKerjaTabel({ baris }: { baris: BarisUnit[] }) {
    const [tambah, setTambah] = React.useState(false);
    const [diubah, setDiubah] = React.useState<BarisUnit | null>(null);
    const [dihapus, setDihapus] = React.useState<BarisUnit | null>(null);

    // Sakelar aktif tidak punya dialog tempat menaruh pesan galatnya, jadi
    // pesannya naik ke sini - satu tempat di atas tabel, terbaca dari baris
    // mana pun kegagalannya datang.
    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();

    const ubahAktif = (unit: BarisUnit, aktif: boolean) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await setAktifUnit(unit.id, aktif);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    return (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Daftar unit kerja sekolah. Unit yang dinonaktifkan tidak
                    lagi bisa dipilih untuk akun baru, tetapi permintaan lama
                    yang memakainya tetap utuh.
                </p>
                <Button
                    onClick={() => setTambah(true)}
                    className="h-9.5 shrink-0"
                >
                    <Plus />
                    <span className="hidden sm:inline">Tambah Unit</span>
                    <span className="sr-only sm:hidden">Tambah unit kerja</span>
                </Button>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] text-muted-foreground">
                    Belum ada unit kerja.
                </p>
            ) : (
                <>
                    {/* Ponsel: satu kartu per baris. Tabel tiga kolom terlalu
                        sempit untuk dibaca di layar 375px. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {baris.map((unit) => (
                            <li
                                key={unit.id}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {unit.nama}
                                    </p>
                                    <LencanaAktif aktif={unit.aktif} />
                                </div>
                                <SakelarAktif
                                    unit={unit}
                                    menunggu={menunggu}
                                    onUbah={ubahAktif}
                                />
                                <TombolBaris
                                    unit={unit}
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
                                    <TableHead className="px-5 text-xs text-muted-foreground">
                                        Nama
                                    </TableHead>
                                    <TableHead className="w-32 text-xs text-muted-foreground">
                                        Status
                                    </TableHead>
                                    <TableHead className="w-28 text-xs text-muted-foreground">
                                        Aktif
                                    </TableHead>
                                    <TableHead className="w-24 px-5 text-right text-xs text-muted-foreground">
                                        Tindakan
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {baris.map((unit) => (
                                    <TableRow key={unit.id}>
                                        <TableCell className="px-5 py-3 text-[13px] font-medium text-foreground">
                                            {unit.nama}
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <LencanaAktif aktif={unit.aktif} />
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <SakelarAktif
                                                unit={unit}
                                                menunggu={menunggu}
                                                onUbah={ubahAktif}
                                            />
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-right">
                                            <TombolBaris
                                                unit={unit}
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
                judul="Tambah Unit Kerja"
                keterangan="Nama unit kerja dipakai di seluruh laporan konsumsi, jadi tulis selengkapnya."
                aksi={buatUnit}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <BidangDialog
                    id="nama"
                    label="Nama Unit Kerja"
                    placeholder="Wakil Kesiswaan"
                    required
                    autoFocus
                    maxLength={80}
                />
            </DialogForm>

            <DialogForm
                key={diubah?.id}
                terbuka={diubah !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDiubah(null)}
                judul="Ubah Unit Kerja"
                keterangan="Mengganti nama tidak memutus kaitannya: akun dan permintaan yang sudah menunjuk unit ini ikut memakai nama barunya."
                aksi={ubahUnit.bind(null, diubah?.id ?? "")}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <BidangDialog
                    id="nama"
                    label="Nama Unit Kerja"
                    defaultValue={diubah?.nama}
                    required
                    autoFocus
                    maxLength={80}
                />
            </DialogForm>

            <DialogForm
                key={`hapus-${dihapus?.id}`}
                terbuka={dihapus !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDihapus(null)}
                judul={`Hapus ${dihapus?.nama ?? ""}?`}
                keterangan="Unit kerja yang pernah dipakai akun atau permintaan tidak bisa dihapus - nonaktifkan saja."
                aksi={hapusUnit.bind(null, dihapus?.id ?? "")}
                labelSimpan="Hapus"
                labelMenyimpan="Menghapus"
                merusak
            />
        </div>
    );
}

function LencanaAktif({ aktif }: { aktif: boolean }) {
    return (
        <Badge
            variant={aktif ? "secondary" : "outline"}
            className={aktif ? "" : "text-muted-foreground"}
        >
            {aktif ? "Aktif" : "Nonaktif"}
        </Badge>
    );
}

function SakelarAktif({
    unit,
    menunggu,
    onUbah,
}: {
    unit: BarisUnit;
    menunggu: boolean;
    onUbah: (unit: BarisUnit, aktif: boolean) => void;
}) {
    return (
        <Switch
            checked={unit.aktif}
            disabled={menunggu}
            onCheckedChange={(aktif) => onUbah(unit, aktif)}
            aria-label={`${unit.aktif ? "Nonaktifkan" : "Aktifkan"} ${unit.nama}`}
        />
    );
}

function TombolBaris({
    unit,
    onUbah,
    onHapus,
}: {
    unit: BarisUnit;
    onUbah: (unit: BarisUnit) => void;
    onHapus: (unit: BarisUnit) => void;
}) {
    return (
        <div className="flex shrink-0 items-center justify-end gap-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onUbah(unit)}
                aria-label={`Ubah ${unit.nama}`}
            >
                <Pencil className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onHapus(unit)}
                aria-label={`Hapus ${unit.nama}`}
            >
                <Trash2 className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
        </div>
    );
}
