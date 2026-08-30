"use client";

import {
    AuthField,
    AuthInput,
    FormAlert,
    PasswordInput,
    SubmitButton,
} from "@/components/auth/form-parts";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

export function LoginForm() {
    const router = useRouter();
    const [galat, setGalat] = React.useState<string | null>(null);
    const [pending, setPending] = React.useState(false);

    const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setGalat(null);
        setPending(true);

        const data = new FormData(event.currentTarget);
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
            email: String(data.get("email")),
            password: String(data.get("sandi")),
        });

        if (error) {
            setGalat("Email atau kata sandi salah.");
            setPending(false);
            return;
        }

        router.push("/beranda");
        // Router Cache sisi klien terisi saat masih keluar; push saja bisa
        // dilayani dari sana. refresh() membuangnya dan mengambil ulang server
        // component dengan cookie yang baru.
        router.refresh();
    };

    return (
        <form onSubmit={kirim} className="flex flex-col gap-4.5">
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

            <AuthField id="sandi" label="Kata Sandi">
                <PasswordInput
                    id="sandi"
                    name="sandi"
                    autoComplete="current-password"
                    required
                />
            </AuthField>

            <div className="flex justify-end">
                <Link
                    href="/login/lupa-sandi"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                >
                    Lupa kata sandi?
                </Link>
            </div>

            <SubmitButton pending={pending} pendingLabel="Memproses">
                Masuk
            </SubmitButton>
        </form>
    );
}
