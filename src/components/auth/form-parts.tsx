"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOMAIN_SEKOLAH } from "@/lib/alamat";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
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

/**
 * AuthInput dengan domain sekolah tampil di sampingnya sebagai teks tetap
 * yang tidak bisa dipilih - alamatnya tetap terbaca utuh dari kiri ke kanan
 * tanpa pernah bisa diketik seluruhnya.
 */
export function AuthInputBerdomain({
    className,
    ...props
}: React.ComponentProps<typeof Input>) {
    return (
        <div className="flex items-center gap-2">
            <AuthInput className={cn("min-w-0 flex-1", className)} {...props} />
            <span className="shrink-0 text-sm text-muted-foreground select-none">
                @{DOMAIN_SEKOLAH}
            </span>
        </div>
    );
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
