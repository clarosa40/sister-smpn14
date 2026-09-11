"use client";

import { FormAlert } from "@/components/form-parts";
import { Pencarian } from "@/components/admin/pencarian";
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
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { eksporRiwayatPermintaan } from "./actions";
import type { StatusRiwayat } from "./daftar-permintaan-masuk";

// Nilai sentinel dropdown Status: Radix Select menolak value="". Dibuat
// tidak lazim, sama seperti stok-daftar.tsx, supaya tidak pernah bentrok
// dengan nilai status sungguhan.
const SEMUA = "__semua__";

function unduhBase64(base64: string, namaBerkas: string) {
    const biner = atob(base64);
    const bytes = new Uint8Array(biner.length);
    for (let i = 0; i < biner.length; i++) bytes[i] = biner.charCodeAt(i);
    const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = namaBerkas;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Basis alamat untuk <Pencarian> - membawa lihat=riwayat, dari, sampai, dan
 * status, tapi tanpa `cari`, sebab Pencarian yang menambahkannya sendiri.
 */
function jalurRiwayat(dari: string, sampai: string, status: StatusRiwayat) {
    const parameter = new URLSearchParams({ lihat: "riwayat" });
    if (dari) parameter.set("dari", dari);
    if (sampai) parameter.set("sampai", sampai);
    if (status) parameter.set("status", status);
    return `/permintaan-masuk?${parameter.toString()}`;
}

/**
 * Kartu bertepi dari /stok, dipakai untuk Pencarian, rentang tanggal,
 * status, dan tombol ekspor Riwayat. Tab nav Siapkan/Serahkan/Riwayat
 * sengaja tidak ikut di sini - lihat DaftarPermintaanMasuk.
 */
export function AlatFilterRiwayat({
    cari,
    dari,
    sampai,
    status,
}: {
    cari: string;
    dari: string;
    sampai: string;
    status: StatusRiwayat;
}) {
    const router = useRouter();
    const [mengekspor, setMengekspor] = React.useState(false);
    const [galat, setGalat] = React.useState<string | null>(null);

    // `hal` sengaja tidak dibawa saat filter berganti: halaman yang sudah
    // menyusut karena filternya menyempit hampir selalu berarti mendarat
    // di daftar kosong.
    const terapkanFilter = (
        perubahan: Partial<{
            dari: string;
            sampai: string;
            status: StatusRiwayat;
        }>,
    ) => {
        const efektif = { dari, sampai, status, ...perubahan };

        const parameter = new URLSearchParams({ lihat: "riwayat" });
        if (cari) parameter.set("cari", cari);
        if (efektif.dari) parameter.set("dari", efektif.dari);
        if (efektif.sampai) parameter.set("sampai", efektif.sampai);
        if (efektif.status) parameter.set("status", efektif.status);

        router.replace(`/permintaan-masuk?${parameter.toString()}`, {
            scroll: false,
        });
    };

    const klikEkspor = async () => {
        setMengekspor(true);
        setGalat(null);

        const hasil = await eksporRiwayatPermintaan(cari, dari, sampai, status);

        setMengekspor(false);
        if (!hasil.ok) {
            setGalat(hasil.galat);
            return;
        }
        unduhBase64(hasil.base64, hasil.namaBerkas);
    };

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Pencarian
                    awal={cari}
                    jalur={jalurRiwayat(dari, sampai, status)}
                    placeholder="Cari nomor atau keperluan"
                    ariaLabel="Cari permintaan"
                />

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Label
                            htmlFor="riwayat-dari"
                            className="text-xs text-muted-foreground"
                        >
                            Dari
                        </Label>
                        <Input
                            id="riwayat-dari"
                            type="date"
                            value={dari}
                            onChange={(e) =>
                                terapkanFilter({ dari: e.target.value })
                            }
                            aria-label="Tanggal dari"
                            className="h-9.5 w-36"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Label
                            htmlFor="riwayat-sampai"
                            className="text-xs text-muted-foreground"
                        >
                            Sampai
                        </Label>
                        <Input
                            id="riwayat-sampai"
                            type="date"
                            value={sampai}
                            onChange={(e) =>
                                terapkanFilter({ sampai: e.target.value })
                            }
                            aria-label="Tanggal sampai"
                            className="h-9.5 w-36"
                        />
                    </div>

                    <Select
                        value={status || SEMUA}
                        onValueChange={(nilai) =>
                            terapkanFilter({
                                status:
                                    nilai === SEMUA
                                        ? ""
                                        : (nilai as StatusRiwayat),
                            })
                        }
                    >
                        <SelectTrigger
                            aria-label="Filter status"
                            className="h-9.5 w-36"
                        >
                            <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={SEMUA}>Semua status</SelectItem>
                            <SelectItem value="selesai">Selesai</SelectItem>
                            <SelectItem value="ditolak">Ditolak</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={mengekspor}
                    onClick={klikEkspor}
                    className="sm:ml-auto"
                >
                    {mengekspor ? (
                        <LoaderCircle className="animate-spin" />
                    ) : (
                        <FileSpreadsheet />
                    )}
                    Ekspor Excel
                </Button>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}
        </div>
    );
}
