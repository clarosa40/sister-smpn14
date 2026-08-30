"use client";

import { FormAlert, SubmitButton } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HasilAksi } from "@/lib/aksi";
import * as React from "react";

export type AksiDialog = (
    sebelumnya: HasilAksi | null,
    formData: FormData,
) => Promise<HasilAksi>;

/**
 * Dialog berisi satu server action - dipakai untuk tambah, ubah, dan hapus di
 * kedua halaman master data.
 *
 * Isinya sengaja dipecah ke komponen tersendiri di bawah portal Radix.
 * useActionState menyimpan hasil pemanggilan terakhir dan tidak punya cara
 * untuk direset; kalau hook itu hidup di luar portal, dialog yang dibuka
 * kedua kalinya akan menyapa penggunanya dengan pesan galat percobaan
 * sebelumnya. Radix melepas isi portal saat dialog tertutup, jadi menaruh
 * hook di dalamnya membuat setiap pembukaan mulai dari keadaan bersih.
 */
export function DialogForm({
    terbuka,
    onTerbukaBerubah,
    judul,
    keterangan,
    aksi,
    labelSimpan,
    labelMenyimpan,
    merusak = false,
    children,
}: {
    terbuka: boolean;
    onTerbukaBerubah: (terbuka: boolean) => void;
    judul: string;
    keterangan: string;
    aksi: AksiDialog;
    labelSimpan: string;
    labelMenyimpan: string;
    /** Menandai aksi yang menghapus: tombol simpannya merah. */
    merusak?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <Dialog open={terbuka} onOpenChange={onTerbukaBerubah}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{judul}</DialogTitle>
                    <DialogDescription>{keterangan}</DialogDescription>
                </DialogHeader>

                <IsiDialog
                    aksi={aksi}
                    labelSimpan={labelSimpan}
                    labelMenyimpan={labelMenyimpan}
                    merusak={merusak}
                    onSelesai={() => onTerbukaBerubah(false)}
                >
                    {children}
                </IsiDialog>
            </DialogContent>
        </Dialog>
    );
}

function IsiDialog({
    aksi,
    labelSimpan,
    labelMenyimpan,
    merusak,
    onSelesai,
    children,
}: {
    aksi: AksiDialog;
    labelSimpan: string;
    labelMenyimpan: string;
    merusak: boolean;
    onSelesai: () => void;
    children?: React.ReactNode;
}) {
    const [hasil, kirim, pending] = React.useActionState(aksi, null);

    // Dialog hanya ditutup kalau servernya benar-benar berhasil. Penolakan -
    // kode kembar, barang masih terpakai - tetap tampil di tempat pengguna
    // masih bisa memperbaiki isiannya.
    React.useEffect(() => {
        if (hasil?.ok) onSelesai();
    }, [hasil, onSelesai]);

    return (
        <form action={kirim} className="flex flex-col gap-4">
            {hasil && !hasil.ok && <FormAlert>{hasil.galat}</FormAlert>}

            {children}

            <DialogFooter className="mt-1">
                <DialogClose asChild>
                    <Button type="button" variant="outline" className="h-9.5">
                        Batal
                    </Button>
                </DialogClose>
                <SubmitButton
                    pending={pending}
                    pendingLabel={labelMenyimpan}
                    className={
                        merusak
                            ? "mt-0 h-9.5 w-full bg-destructive text-white hover:bg-destructive/90 sm:w-auto"
                            : "mt-0 h-9.5 w-full sm:w-auto"
                    }
                >
                    {labelSimpan}
                </SubmitButton>
            </DialogFooter>
        </form>
    );
}

/**
 * Satu kolom isian di dalam dialog. Lebih rendah daripada kolom layar auth.
 *
 * Nilainya dikendalikan React, bukan dibiarkan hidup di DOM. React mengosongkan
 * formulir begitu server action-nya selesai - termasuk ketika hasilnya gagal.
 * Dengan isian tak terkendali, tata usaha yang mengetik kode kembar akan
 * menerima pesan galatnya sekaligus kehilangan seluruh ketikannya, dan harus
 * mengulang dari awal justru pada saat ia sedang membetulkan kesalahan.
 */
export function BidangDialog({
    id,
    label,
    petunjuk,
    defaultValue = "",
    ...props
}: Omit<React.ComponentProps<typeof Input>, "defaultValue" | "value"> & {
    id: string;
    label: string;
    petunjuk?: string;
    defaultValue?: string;
}) {
    const [nilai, setNilai] = React.useState(defaultValue);

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-[13px]">
                {label}
            </Label>
            <Input
                id={id}
                name={id}
                className="h-9.5"
                value={nilai}
                onChange={(e) => setNilai(e.target.value)}
                {...props}
            />
            {petunjuk && (
                <p className="text-xs text-muted-foreground">{petunjuk}</p>
            )}
        </div>
    );
}
