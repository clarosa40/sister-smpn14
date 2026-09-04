"use client";

import { FormAlert, SubmitButton } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PANJANG_CATATAN, PANJANG_NO_DOKUMEN } from "@/lib/penerimaan";
import { tanggalHariIni } from "@/lib/permintaan";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { catatPenerimaan } from "../actions";

export type BarangOpsi = {
    id: string;
    kode: string;
    nama: string;
    satuan: string;
};

type Baris = {
    key: string;
    barangId: string;
    jumlah: string;
    harga: string;
};

const barisKosong = (): Baris => ({
    key: crypto.randomUUID(),
    barangId: "",
    jumlah: "",
    harga: "",
});

export function FormPenerimaan({ barang }: { barang: BarangOpsi[] }) {
    const [baris, setBaris] = React.useState<Baris[]>([barisKosong()]);
    const [hasil, kirim, pending] = React.useActionState(catatPenerimaan, null);

    const barangById = React.useMemo(
        () => new Map(barang.map((b) => [b.id, b])),
        [barang],
    );

    const ubahBaris = (key: string, perubahan: Partial<Baris>) =>
        setBaris((semua) =>
            semua.map((b) => (b.key === key ? { ...b, ...perubahan } : b)),
        );

    const hapusBaris = (key: string) =>
        setBaris((semua) => semua.filter((b) => b.key !== key));

    const tambahBaris = () => setBaris((semua) => [...semua, barisKosong()]);

    const muatanBaris = JSON.stringify(
        baris.map((b) => ({
            barang_id: b.barangId,
            jumlah: b.jumlah,
            harga_satuan: b.harga,
        })),
    );

    return (
        <form
            action={kirim}
            className="mx-auto flex w-full max-w-3xl flex-col gap-4"
        >
            <Link
                href="/penerimaan"
                className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ArrowLeft className="size-4" strokeWidth={1.6} />
                Penerimaan
            </Link>

            <header>
                <h2 className="text-base font-semibold text-foreground">
                    Catat Penerimaan
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    Salin dari surat jalan atau nota pengiriman dalam satu
                    kali duduk. Setelah disimpan, dokumen ini tidak bisa
                    diubah lagi.
                </p>
            </header>

            {hasil && !hasil.ok && <FormAlert>{hasil.galat}</FormAlert>}

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tanggal" className="text-[13px]">
                        Tanggal
                    </Label>
                    <Input
                        id="tanggal"
                        name="tanggal"
                        type="date"
                        className="h-9.5"
                        defaultValue={tanggalHariIni()}
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="no_dokumen" className="text-[13px]">
                        No Dokumen (opsional)
                    </Label>
                    <Input
                        id="no_dokumen"
                        name="no_dokumen"
                        className="h-9.5"
                        placeholder="INV-8841"
                        maxLength={PANJANG_NO_DOKUMEN}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="catatan" className="text-[13px]">
                        Catatan (opsional)
                    </Label>
                    <Input
                        id="catatan"
                        name="catatan"
                        className="h-9.5"
                        placeholder="Hibah dari komite sekolah"
                        maxLength={PANJANG_CATATAN}
                    />
                </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Barang ({baris.length})
                </h3>

                <ul className="divide-y divide-border">
                    {baris.map((b) => (
                        <li key={b.key} className="flex flex-col gap-2.5 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <Select
                                    value={b.barangId}
                                    onValueChange={(nilai) =>
                                        ubahBaris(b.key, { barangId: nilai })
                                    }
                                >
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Pilih barang" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {barang.map((bo) => (
                                            <SelectItem key={bo.id} value={bo.id}>
                                                {bo.nama}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => hapusBaris(b.key)}
                                    aria-label="Hapus baris ini"
                                >
                                    <Trash2
                                        className="text-muted-foreground"
                                        strokeWidth={1.6}
                                    />
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs text-muted-foreground">
                                        Jumlah
                                    </Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className="h-9"
                                        value={b.jumlah}
                                        onChange={(e) =>
                                            ubahBaris(b.key, {
                                                jumlah: e.target.value,
                                            })
                                        }
                                        placeholder="0"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <Label className="text-xs text-muted-foreground">
                                        Harga Satuan (opsional)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        className="h-9"
                                        value={b.harga}
                                        onChange={(e) =>
                                            ubahBaris(b.key, {
                                                harga: e.target.value,
                                            })
                                        }
                                        placeholder="Tidak diketahui"
                                    />
                                </div>
                                <div className="flex items-end text-xs text-muted-foreground sm:col-span-1">
                                    {b.barangId &&
                                        barangById.get(b.barangId)?.satuan}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="px-4 py-3">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9.5"
                        onClick={tambahBaris}
                    >
                        <Plus />
                        Tambah Baris
                    </Button>
                </div>
            </section>

            <input type="hidden" name="baris" value={muatanBaris} />

            <SubmitButton
                pending={pending}
                pendingLabel="Menyimpan"
                className="w-fit"
            >
                Simpan Penerimaan
            </SubmitButton>
        </form>
    );
}
