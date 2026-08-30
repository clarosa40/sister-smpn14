"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

const JEDA_KETIK = 300;

/**
 * Kotak pencarian yang menulis kata kuncinya ke URL, bukan ke state komponen.
 * Dengan begitu hasil pencarian bisa ditautkan dan dimuat ulang, dan halaman
 * server yang tetap memegang datanya - tidak ada salinan daftar barang di
 * peramban yang bisa basi.
 *
 * Nilai awal datang sebagai prop, bukan dari useSearchParams(), supaya
 * komponen ini tidak menuntut batas Suspense di sekelilingnya.
 */
export function Pencarian({ awal }: { awal: string }) {
    const router = useRouter();
    const [nilai, setNilai] = React.useState(awal);
    const jeda = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const jalankan = React.useCallback(
        (kata: string) => {
            const bersih = kata.trim();
            // `hal` sengaja tidak dibawa: hasil pencarian baru selalu mulai
            // dari halaman pertama. Berpindah kata kunci sambil tetap di
            // halaman 4 hampir selalu berarti mendarat di daftar kosong.
            router.replace(
                bersih
                    ? `/master-barang?cari=${encodeURIComponent(bersih)}`
                    : "/master-barang",
                { scroll: false },
            );
        },
        [router],
    );

    const ketik = (kata: string) => {
        setNilai(kata);
        if (jeda.current) clearTimeout(jeda.current);
        jeda.current = setTimeout(() => jalankan(kata), JEDA_KETIK);
    };

    const kosongkan = () => {
        if (jeda.current) clearTimeout(jeda.current);
        setNilai("");
        jalankan("");
    };

    React.useEffect(
        () => () => {
            if (jeda.current) clearTimeout(jeda.current);
        },
        [],
    );

    return (
        <div className="relative flex-1 sm:max-w-xs">
            <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.6}
            />
            <Input
                type="search"
                value={nilai}
                onChange={(e) => ketik(e.target.value)}
                placeholder="Cari kode atau nama barang"
                aria-label="Cari barang"
                className="h-9.5 pr-9 pl-8.5"
            />
            {nilai && (
                <button
                    type="button"
                    onClick={kosongkan}
                    aria-label="Kosongkan pencarian"
                    className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    <X className="size-4" strokeWidth={1.6} />
                </button>
            )}
        </div>
    );
}
