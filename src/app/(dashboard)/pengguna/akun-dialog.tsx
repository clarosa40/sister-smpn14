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
import { Check, Copy } from "lucide-react";
import * as React from "react";
import type { HasilSandi } from "./actions";

export type AksiSandi = (
    sebelumnya: HasilSandi | null,
    formData: FormData,
) => Promise<HasilSandi>;

/**
 * Dialog yang tidak menutup diri saat berhasil.
 *
 * DialogForm menutup begitu servernya menjawab ok - persis yang diinginkan
 * ubah dan hapus, dan persis yang tidak boleh terjadi di sini: sandi yang
 * baru terbit hanya muncul sekali, dan menutup dialognya berarti
 * kehilangannya. Menambahkan prop "jangan tutup" ke DialogForm berarti
 * meminta komponen itu membatalkan satu-satunya hal yang jadi alasannya ada.
 *
 * useActionState hidup di komponen anak di bawah portal Radix, seperti pada
 * DialogForm dan karena alasan yang sama: hook itu menyimpan hasil terakhir
 * dan tidak bisa direset, jadi pembukaan berikutnya harus benar-benar
 * memasang ulang komponennya.
 */
export function AkunDialog({
    terbuka,
    onTerbukaBerubah,
    judul,
    keterangan,
    aksi,
    labelSimpan,
    labelMenyimpan,
    catatanSandi,
    children,
}: {
    terbuka: boolean;
    onTerbukaBerubah: (terbuka: boolean) => void;
    judul: string;
    keterangan: string;
    aksi: AksiSandi;
    labelSimpan: string;
    labelMenyimpan: string;
    /** Kalimat di bawah sandi, berbeda untuk akun baru dan setel ulang. */
    catatanSandi: string;
    children?: React.ReactNode;
}) {
    return (
        <Dialog open={terbuka} onOpenChange={onTerbukaBerubah}>
            <DialogContent>
                <IsiAkunDialog
                    judul={judul}
                    keterangan={keterangan}
                    aksi={aksi}
                    labelSimpan={labelSimpan}
                    labelMenyimpan={labelMenyimpan}
                    catatanSandi={catatanSandi}
                >
                    {children}
                </IsiAkunDialog>
            </DialogContent>
        </Dialog>
    );
}

function IsiAkunDialog({
    judul,
    keterangan,
    aksi,
    labelSimpan,
    labelMenyimpan,
    catatanSandi,
    children,
}: {
    judul: string;
    keterangan: string;
    aksi: AksiSandi;
    labelSimpan: string;
    labelMenyimpan: string;
    catatanSandi: string;
    children?: React.ReactNode;
}) {
    const [hasil, kirim, pending] = React.useActionState<
        HasilSandi | null,
        FormData
    >(aksi, null);

    if (hasil?.ok) {
        return (
            <>
                <DialogHeader>
                    <DialogTitle>Kata sandi sementara</DialogTitle>
                    <DialogDescription>{catatanSandi}</DialogDescription>
                </DialogHeader>
                <PanelSandi sandi={hasil.sandi} />
            </>
        );
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>{judul}</DialogTitle>
                <DialogDescription>{keterangan}</DialogDescription>
            </DialogHeader>

            <form action={kirim} className="flex flex-col gap-4">
                {hasil && !hasil.ok && <FormAlert>{hasil.galat}</FormAlert>}

                {children}

                <DialogFooter className="mt-1">
                    <DialogClose asChild>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-9.5"
                        >
                            Batal
                        </Button>
                    </DialogClose>
                    <SubmitButton
                        pending={pending}
                        pendingLabel={labelMenyimpan}
                        className="mt-0 h-9.5 w-full sm:w-auto"
                    >
                        {labelSimpan}
                    </SubmitButton>
                </DialogFooter>
            </form>
        </>
    );
}

function PanelSandi({ sandi }: { sandi: string }) {
    const [tersalin, setTersalin] = React.useState(false);

    const salin = async () => {
        try {
            await navigator.clipboard.writeText(sandi);
            setTersalin(true);
            setTimeout(() => setTersalin(false), 2000);
        } catch {
            // Papan klip ditolak peramban - sandinya toh sudah terbaca di
            // layar dan bisa disalin dengan tangan. Tidak ada yang hilang.
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <code className="flex-1 font-mono text-base tracking-wide break-all text-foreground select-all">
                    {sandi}
                </code>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={salin}
                    aria-label="Salin kata sandi"
                >
                    {tersalin ? (
                        <Check className="text-primary" strokeWidth={1.8} />
                    ) : (
                        <Copy
                            className="text-muted-foreground"
                            strokeWidth={1.6}
                        />
                    )}
                </Button>
            </div>

            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Catat atau salin sekarang. Setelah kotak ini ditutup, kata
                sandinya tidak bisa ditampilkan lagi — yang bisa dilakukan
                hanyalah menerbitkan yang baru lewat tombol “Setel ulang
                sandi”.
            </p>

            <DialogFooter className="mt-1">
                <DialogClose asChild>
                    <Button type="button" className="h-9.5 w-full sm:w-auto">
                        Sudah dicatat
                    </Button>
                </DialogClose>
            </DialogFooter>
        </div>
    );
}
