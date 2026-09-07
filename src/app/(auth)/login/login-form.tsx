"use client";

import {
    AuthField,
    AuthInputBerdomain,
    PasswordInput,
} from "@/components/auth/form-parts";
import { FormAlert, SubmitButton } from "@/components/form-parts";
import { alamatDari, tanpaAkhiranDomain } from "@/lib/alamat";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import * as React from "react";

export function LoginForm({ nonaktif = false }: { nonaktif?: boolean }) {
    const router = useRouter();
    const [galat, setGalat] = React.useState<string | null>(null);
    const [pending, setPending] = React.useState(false);

    const kirim = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setGalat(null);
        setPending(true);

        const data = new FormData(event.currentTarget);
        const nama = tanpaAkhiranDomain(String(data.get("email")));
        const hasil = alamatDari(nama);

        if (!hasil.ok) {
            setGalat(hasil.galat);
            setPending(false);
            return;
        }

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
            email: hasil.alamat,
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
            {galat ? (
                <FormAlert>{galat}</FormAlert>
            ) : (
                nonaktif && (
                    <FormAlert>
                        Akun Anda dinonaktifkan. Hubungi tata usaha.
                    </FormAlert>
                )
            )}

            <AuthField id="email" label="Alamat Email">
                <AuthInputBerdomain
                    id="email"
                    name="email"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="guru.ipa"
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

            <SubmitButton pending={pending} pendingLabel="Memproses">
                Masuk
            </SubmitButton>
        </form>
    );
}
