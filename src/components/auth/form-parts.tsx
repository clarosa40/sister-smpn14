"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, LoaderCircle, type LucideIcon } from "lucide-react";
import * as React from "react";

// Kolom isian di layar auth lebih tinggi daripada kolom di dalam aplikasi:
// 44px di ponsel supaya nyaman disentuh, 38px di layar lebar.
const TINGGI_KOLOM = "h-11 rounded-lg sm:h-9.5";

export function AuthField({
    id,
    label,
    children,
}: {
    id: string;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-[13px]">
                {label}
            </Label>
            {children}
        </div>
    );
}

export function AuthInput({
    className,
    ...props
}: React.ComponentProps<typeof Input>) {
    return <Input className={cn(TINGGI_KOLOM, className)} {...props} />;
}

export function PasswordInput({
    className,
    ...props
}: React.ComponentProps<typeof Input>) {
    const [terlihat, setTerlihat] = React.useState(false);

    return (
        <div className="relative">
            <AuthInput
                type={terlihat ? "text" : "password"}
                className={cn("pr-10", className)}
                {...props}
            />
            <button
                type="button"
                onClick={() => setTerlihat((v) => !v)}
                aria-label={
                    terlihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                }
                aria-pressed={terlihat}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                {terlihat ? (
                    <EyeOff className="size-4" />
                ) : (
                    <Eye className="size-4" />
                )}
            </button>
        </div>
    );
}

export function SubmitButton({
    pending,
    children,
    pendingLabel,
}: {
    pending: boolean;
    children: React.ReactNode;
    pendingLabel: string;
}) {
    return (
        <Button
            type="submit"
            disabled={pending}
            className="mt-1 h-11 w-full rounded-lg text-sm sm:h-9.5"
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

/**
 * Layar setelah sebuah langkah auth berhasil - tautan terkirim, kata sandi
 * tersimpan. Menggantikan formulirnya, bukan menempel di atasnya: begitu
 * langkahnya lewat, formulir itu tidak ada gunanya lagi.
 */
export function PanelSukses({
    icon: Icon,
    judul,
    children,
}: {
    icon: LucideIcon;
    judul: string;
    children: React.ReactNode;
}) {
    return (
        <div
            role="status"
            className="flex flex-col items-center gap-3 text-center"
        >
            <Icon className="size-8 text-primary" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">{judul}</p>
            {children}
        </div>
    );
}

/** Aksi sekunder bertenang - dipakai di bawah PanelSukses. */
export const KELAS_TAUTAN_HALUS =
    "inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

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
