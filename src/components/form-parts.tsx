"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoaderCircle } from "lucide-react";
import * as React from "react";

/**
 * Bagian formulir yang tidak khusus milik layar auth. Keduanya lahir di
 * components/auth/form-parts.tsx dan pindah ke sini begitu dialog master data
 * ikut memakainya - sisa isi berkas itu memang hanya untuk layar auth.
 */

export function SubmitButton({
    pending,
    children,
    pendingLabel,
    className,
}: {
    pending: boolean;
    children: React.ReactNode;
    pendingLabel: string;
    className?: string;
}) {
    return (
        <Button
            type="submit"
            disabled={pending}
            // Ukuran bawaan mengikuti layar auth: setinggi ibu jari di ponsel,
            // selebar kartunya. Dialog master data menimpanya lewat className.
            className={cn("mt-1 h-11 w-full rounded-lg text-sm sm:h-9.5", className)}
        >
            {pending ? (
                <>
                    <LoaderCircle className="size-4 animate-spin" />
                    {pendingLabel}
                </>
            ) : (
                children
            )}
        </Button>
    );
}

export function FormAlert({
    tone = "error",
    children,
}: {
    tone?: "error" | "success";
    children: React.ReactNode;
}) {
    return (
        <p
            role="status"
            className={cn(
                "rounded-lg border px-3 py-2.5 text-[13px] leading-normal",
                tone === "error"
                    ? "border-destructive/25 bg-destructive/8 text-destructive"
                    : "border-primary/25 bg-primary/8 text-primary",
            )}
        >
            {children}
        </p>
    );
}
