"use client";

import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxTrigger,
    ComboboxValue,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as React from "react";

export type OpsiCari = { nilai: string; label: string };

type Butir = { value: string; label: string };

/**
 * Sama bentuknya dengan SelectTrigger - sengaja. Di Kelola Pengguna,
 * BidangPilih dan BidangCari duduk di dialog yang sama, dan dua kendali
 * yang mengerjakan pekerjaan yang sama tidak boleh terlihat seperti dua
 * jenis benda yang berbeda.
 */
const KELAS_PEMICU =
    "flex h-9.5 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Daftar pilihan yang bisa dicari. Dipakai kalau daftarnya panjang -
 * Select biasa hanya bisa digulir, dan ketik-cepat bawaannya mencocokkan
 * dari huruf pertama lalu lupa lagi sedetik kemudian.
 *
 * Penyaringan dikerjakan Base UI, bukan kita: urutannya tidak diacak
 * ulang mengikuti skor kecocokan, jadi daftar yang tadinya urut nama
 * tetap urut nama sambil diketik.
 *
 * Bentuk opsinya `{nilai, label}` supaya sama dengan BidangPilih. Base UI
 * sendiri mengenali `{value, label}`, jadi penyalinannya terjadi di sini
 * sekali, bukan di setiap pemanggil.
 */
export function KotakCari({
    id,
    name,
    opsi,
    nilai,
    onNilaiBerubah,
    placeholder,
    benda,
    className,
}: {
    id?: string;
    /** Diisi kalau nilainya ikut terkirim sebagai FormData. */
    name?: string;
    opsi: OpsiCari[];
    nilai: string;
    onNilaiBerubah: (nilai: string) => void;
    /** Tulisan di pemicu selama belum ada yang dipilih, mis. "Pilih barang". */
    placeholder: string;
    /** Kata bendanya, mis. "barang" - dipakai di kotak cari dan kalimat kosong. */
    benda: string;
    className?: string;
}) {
    const butir = React.useMemo<Butir[]>(
        () => opsi.map((o) => ({ value: o.nilai, label: o.label })),
        [opsi],
    );
    const terpilih = butir.find((b) => b.value === nilai) ?? null;
    const [kata, setKata] = React.useState("");
    const pemicu = React.useRef<HTMLButtonElement>(null);
    const [wadah, setWadah] = React.useState<HTMLElement | null>(null);

    return (
        <Combobox
            items={butir}
            value={terpilih}
            onValueChange={(b: Butir | null) => onNilaiBerubah(b?.value ?? "")}
            inputValue={kata}
            onInputValueChange={setKata}
            name={name}
            onOpenChange={(terbuka) => {
                if (!terbuka) return;
                // Kata kunci lama dibuang tiap kali dibuka: yang membuka
                // kedua kalinya sedang mencari barang lain, bukan
                // meneruskan pencarian yang tadi.
                setKata("");
                // Radix Dialog mengurung fokus di dalam isinya. Popup Base
                // UI biasanya diportalkan ke <body>, jadi di luar kurungan
                // itu - dan kotak carinya tidak pernah kebagian fokus.
                // Diportalkan ke dalam dialognya kalau memang sedang di
                // dalam dialog; di luar dialog, <body> seperti biasa.
                setWadah(
                    pemicu.current?.closest<HTMLElement>('[role="dialog"]') ??
                        null,
                );
            }}
        >
            <ComboboxTrigger
                ref={pemicu}
                id={id}
                className={cn(KELAS_PEMICU, className)}
            >
                <ComboboxValue
                    placeholder={
                        <span className="text-muted-foreground">
                            {placeholder}
                        </span>
                    }
                />
            </ComboboxTrigger>
            <ComboboxContent container={wadah ?? undefined}>
                <div className="p-1 pb-0">
                    <ComboboxInput
                        placeholder={`Cari nama ${benda}`}
                        aria-label={`Cari ${benda}`}
                        className="h-8"
                    />
                </div>
                <ComboboxEmpty>
                    Tidak ada {benda} yang cocok dengan “{kata}”.
                </ComboboxEmpty>
                <ComboboxList>
                    {(b: Butir) => (
                        <ComboboxItem key={b.value} value={b}>
                            {b.label}
                        </ComboboxItem>
                    )}
                </ComboboxList>
            </ComboboxContent>
        </Combobox>
    );
}

/**
 * KotakCari berlabel - sejajar dengan BidangPilih, dipakai di dalam
 * DialogForm. Nilainya dikirim lewat `name` bawaan Base UI, jadi tidak
 * perlu input tersembunyi; kalau kosong, server yang menjawab.
 */
export function BidangCari({
    id,
    label,
    opsi,
    placeholder,
    benda,
    defaultValue,
    petunjuk,
}: {
    id: string;
    label: string;
    opsi: OpsiCari[];
    placeholder: string;
    benda: string;
    defaultValue?: string;
    petunjuk?: string;
}) {
    const [nilai, setNilai] = React.useState(defaultValue ?? "");

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-[13px]">
                {label}
            </Label>
            <KotakCari
                id={id}
                name={id}
                opsi={opsi}
                nilai={nilai}
                onNilaiBerubah={setNilai}
                placeholder={placeholder}
                benda={benda}
            />
            {petunjuk && (
                <p className="text-xs text-muted-foreground">{petunjuk}</p>
            )}
        </div>
    );
}
