"use client";

import {
    AuthField,
    AuthInput,
    KELAS_TAUTAN_HALUS,
    PanelSukses,
} from "@/components/auth/form-parts";
import { FormAlert, SubmitButton } from "@/components/form-parts";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";

export function LupaSandiForm({ tautanGalat }: { tautanGalat: boolean }) {
    const [terkirim, setTerkirim] = React.useState(false);
    const [galat, setGalat] = React.useState<string | null>(
        tautanGalat ? "Tautan tidak valid atau sudah kedaluwarsa." : null,
    );
    const [pending, setPending] = React.useState(false);

    const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setGalat(null);
        setPending(true);

        const data = new FormData(event.currentTarget);
        const supabase = createClient();
        // Tautan email menuju route handler, bukan ke formulirnya. Alur PKCE
        // menyisipkan satu langkah penukaran token sebelum sesi ada.
        const { error } = await supabase.auth.resetPasswordForEmail(
            String(data.get("email")),
            { redirectTo: `${window.location.origin}/auth/konfirmasi` },
        );

        if (error) {
            setGalat("Tautan gagal dikirim. Coba lagi beberapa saat lagi.");
            setPending(false);
            return;
        }

        setTerkirim(true);
        setPending(false);
    };

    if (terkirim) {
        return (
            <PanelSukses
                icon={MailCheck}
                judul="Tautan reset telah dikirim ke email Anda"
            >
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Buka email tersebut dan ikuti tautannya untuk membuat kata
                    sandi baru. Tautan hanya berlaku sekali pakai.
                </p>
                <KembaliKeLogin className="mt-1" />
            </PanelSukses>
        );
    }

    return (
        <form onSubmit={kirim} className="flex flex-col gap-4.5">
            <div className="flex flex-col gap-1">
                <h1 className="text-[15px] font-semibold text-foreground">
                    Lupa kata sandi
                </h1>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Masukkan alamat email akun Anda. Kami kirimkan tautan untuk
                    membuat kata sandi baru.
                </p>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            <AuthField id="email" label="Alamat Email">
                <AuthInput
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="nama@sekolah.sch.id"
                    required
                    autoFocus
                />
            </AuthField>

            <SubmitButton pending={pending} pendingLabel="Mengirim">
                Kirim tautan reset
            </SubmitButton>

            <KembaliKeLogin className="self-center" />
        </form>
    );
}

function KembaliKeLogin({ className }: { className?: string }) {
    return (
        <Link
            href="/login"
            className={`${KELAS_TAUTAN_HALUS} ${className ?? ""}`}
        >
            <ArrowLeft className="size-3.5" />
            Kembali ke halaman masuk
        </Link>
    );
}
