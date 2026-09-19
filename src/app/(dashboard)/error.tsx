"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RotateCw } from "lucide-react";

/**
 * Ditempatkan di (dashboard), bukan di root app/: getUserOrRedirect() di
 * layout.tsx grup ini ada di luar boundary error.js (yang membungkus
 * page.js dan layout.js DI BAWAHNYA, bukan layout.js segmen ini sendiri),
 * jadi galat baca autentikasi tetap redirect, bukan jatuh ke sini.
 */
export default function Error({
    error,
    unstable_retry,
}: {
    error: Error & { digest?: string };
    unstable_retry: () => void;
}) {
    return (
        <Card className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-5 py-10 text-center">
            <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">
                    Halaman tidak bisa dimuat
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Server tidak sempat merespons; mencoba lagi biasanya
                    berhasil.
                </p>
            </div>
            {error.digest && (
                <p className="font-mono text-xs text-muted-foreground/70">
                    {error.digest}
                </p>
            )}
            <Button onClick={() => unstable_retry()} className="h-9.5">
                <RotateCw />
                Coba lagi
            </Button>
        </Card>
    );
}
