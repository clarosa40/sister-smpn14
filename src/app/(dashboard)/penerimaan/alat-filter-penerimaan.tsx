"use client";

import { FormAlert } from "@/components/form-parts";
import { Pencarian } from "@/components/admin/pencarian";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { eksporPenerimaan } from "./actions";

/** Basis alamat untuk <Pencarian> - tanpa `cari`, sebab Pencarian yang menambahkannya. */
function jalurPenerimaan(dari: string, sampai: string): string {
    const parameter = new URLSearchParams();
    if (dari) parameter.set("dari", dari);
    if (sampai) parameter.set("sampai", sampai);
    const kueri = parameter.toString();
    return kueri ? `/penerimaan?${kueri}` : "/penerimaan";
}

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
 * Kartu bertepi dari /stok, dipakai untuk Pencarian, rentang tanggal, dan
 * tombol ekspor. "Catat Penerimaan" sengaja tidak ikut di sini - lihat
 * DaftarPenerimaan: tombol yang membuat dokumen tidak semestinya duduk di
 * satu baris dengan input filter.
 */
export function AlatFilterPenerimaan({
    cari,
    dari,
    sampai,
}: {
    cari: string;
    dari: string;
    sampai: string;
}) {
    const router = useRouter();
    const [mengekspor, setMengekspor] = React.useState(false);
    const [galat, setGalat] = React.useState<string | null>(null);

    // `hal` sengaja tidak dibawa saat filter berganti: halaman yang sudah
    // menyusut karena rentangnya menyempit hampir selalu berarti mendarat
    // di daftar kosong.
    const gantiTanggal = (bidang: "dari" | "sampai", nilai: string) => {
        const dariBaru = bidang === "dari" ? nilai : dari;
        const sampaiBaru = bidang === "sampai" ? nilai : sampai;

        const parameter = new URLSearchParams();
        if (cari) parameter.set("cari", cari);
        if (dariBaru) parameter.set("dari", dariBaru);
        if (sampaiBaru) parameter.set("sampai", sampaiBaru);

        const kueri = parameter.toString();
        router.replace(kueri ? `/penerimaan?${kueri}` : "/penerimaan", {
            scroll: false,
        });
    };

    const klikEkspor = async () => {
        setMengekspor(true);
        setGalat(null);

        const hasil = await eksporPenerimaan(cari, dari, sampai);

        setMengekspor(false);
        if (!hasil.ok) {
            setGalat(hasil.galat);
            return;
        }
        unduhBase64(hasil.base64, hasil.namaBerkas);
    };

    return (
        <div className="flex flex-1 flex-col gap-2.5">
            <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Pencarian
                    awal={cari}
                    jalur={jalurPenerimaan(dari, sampai)}
                    placeholder="Cari nomor atau no dokumen"
                    ariaLabel="Cari penerimaan"
                />

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Label
                            htmlFor="penerimaan-dari"
                            className="text-xs text-muted-foreground"
                        >
                            Dari
                        </Label>
                        <Input
                            id="penerimaan-dari"
                            type="date"
                            value={dari}
                            onChange={(e) => gantiTanggal("dari", e.target.value)}
                            aria-label="Tanggal dari"
                            className="h-9.5 w-36"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Label
                            htmlFor="penerimaan-sampai"
                            className="text-xs text-muted-foreground"
                        >
                            Sampai
                        </Label>
                        <Input
                            id="penerimaan-sampai"
                            type="date"
                            value={sampai}
                            onChange={(e) =>
                                gantiTanggal("sampai", e.target.value)
                            }
                            aria-label="Tanggal sampai"
                            className="h-9.5 w-36"
                        />
                    </div>
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
