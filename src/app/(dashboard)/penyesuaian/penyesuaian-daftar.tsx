"use client";

import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { PANJANG_CATATAN, waktuSingkat } from "@/lib/permintaan";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import * as React from "react";
import { catatPenyesuaian } from "./actions";

export type BarangOpsi = { id: string; kode: string; nama: string; satuan: string };

export type BarisPenyesuaian = {
    id: string;
    jumlah: number;
    catatan: string | null;
    created_at: string;
    barang: { nama: string; satuan: string } | null;
    dibuat_oleh: { nama_lengkap: string } | null;
};

/**
 * Log lebih dulu, formulirnya di atasnya - bukan sebaliknya. Catatan
 * wajib justru supaya tulisan itu ada yang dibaca enam bulan lagi, dan
 * formulir tanpa log tidak memberi tulisan itu tempat untuk dibaca.
 *
 * Tidak ditawarkan dari baris Stok Barang: layar itu adalah lookup, dan
 * mencampur tulis ke dalam tabel lookup adalah cara baris yang salah
 * berakhir disunting.
 */
export function PenyesuaianDaftar({
    baris,
    barang,
}: {
    baris: BarisPenyesuaian[];
    barang: BarangOpsi[];
}) {
    const [tambah, setTambah] = React.useState(false);

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <div className="flex items-center justify-between gap-2.5">
                <h2 className="text-base font-semibold text-foreground">
                    Penyesuaian
                </h2>
                <Button onClick={() => setTambah(true)} className="h-9.5 shrink-0">
                    <Plus />
                    <span className="hidden sm:inline">Catat Penyesuaian</span>
                    <span className="sr-only sm:hidden">Catat penyesuaian</span>
                </Button>
            </div>

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    Belum ada penyesuaian yang tercatat. Catat yang pertama
                    lewat tombol di atas setelah hitung fisik.
                </p>
            ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                    {baris.map((b) => (
                        <li key={b.id} className="flex items-start gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-foreground">
                                    {b.barang?.nama ?? "Barang tidak dikenal"}
                                </p>
                                {b.catatan && (
                                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                        {b.catatan}
                                    </p>
                                )}
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {b.dibuat_oleh?.nama_lengkap ?? "Akun sudah dihapus"}
                                    {" · "}
                                    {waktuSingkat(b.created_at)}
                                </p>
                            </div>
                            <span
                                className={cn(
                                    "shrink-0 text-sm font-semibold tabular-nums",
                                    b.jumlah < 0
                                        ? "text-destructive"
                                        : "text-foreground",
                                )}
                            >
                                {b.jumlah > 0 ? `+${b.jumlah}` : b.jumlah}
                                {b.barang && (
                                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                                        {b.barang.satuan}
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <DialogForm
                key={tambah ? "tambah" : "tambah-tertutup"}
                terbuka={tambah}
                onTerbukaBerubah={setTambah}
                judul="Catat Penyesuaian"
                keterangan="Isikan hasil hitung fisik, bukan selisihnya - selisihnya dihitung sendiri dari stok sekarang."
                aksi={catatPenyesuaian}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <BidangBarang barang={barang} />
                <BidangDialog
                    id="jumlah_fisik"
                    label="Hasil Hitung Fisik"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    required
                    autoFocus
                />
                <BidangDialog
                    id="catatan"
                    label="Catatan"
                    placeholder="Opname: fisik kurang 3 dari buku"
                    petunjuk="Dibaca lagi enam bulan dari sekarang - tulis yang bisa dipahami tanpa konteks hari ini."
                    required
                    maxLength={PANJANG_CATATAN}
                />
            </DialogForm>
        </div>
    );
}

function BidangBarang({ barang }: { barang: BarangOpsi[] }) {
    const [nilai, setNilai] = React.useState("");

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor="barang_id" className="text-[13px]">
                Barang
            </Label>
            <Select name="barang_id" value={nilai} onValueChange={setNilai}>
                <SelectTrigger id="barang_id">
                    <SelectValue placeholder="Pilih barang" />
                </SelectTrigger>
                <SelectContent>
                    {barang.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                            {b.nama}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
