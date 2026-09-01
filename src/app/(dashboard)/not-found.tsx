import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import Link from "next/link";

/**
 * Ditempatkan di (dashboard), bukan di root app/: notFound() yang dilempar
 * di dalam grup rute ini dirender di sini, tetap terbungkus AppShell milik
 * layout.tsx grup ini - tanpa halaman ini, Next jatuh ke 404 bawaannya
 * yang berbahasa Inggris dan lepas dari kerangka dashboard.
 */
export default function NotFound() {
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 rounded-xl border border-border bg-card px-5 py-10 text-center">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Halaman tidak ditemukan.
                <br />
                Isinya mungkin sudah dihapus atau dipindahkan.
            </p>
            <Button asChild className="h-9.5">
                <Link href="/beranda">
                    <Home />
                    Kembali ke Beranda
                </Link>
            </Button>
        </div>
    );
}
