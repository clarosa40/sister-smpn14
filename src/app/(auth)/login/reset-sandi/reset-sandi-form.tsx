"use client";

import {
    AuthField,
    FormAlert,
    KELAS_TAUTAN_HALUS,
    PanelSukses,
    PasswordInput,
    SubmitButton,
} from "@/components/auth/form-parts";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { simpanKataSandi, type HasilReset } from "./actions";

const PANJANG_MINIMAL = 8;
const JEDA_ALIH_MS = 2500;

export function ResetSandiForm() {
    const router = useRouter();
    const [state, formAction, pending] = React.useActionState<
        HasilReset | null,
        FormData
    >(simpanKataSandi, null);

    const sukses = state?.ok === true;
    const galat = state?.ok === false ? state.galat : null;
    const tokenBasi = state?.ok === false && state.tokenBasi === true;

    // Sesi baru sudah terpasang server side oleh verifyOtp. push() lalu
    // refresh() membuang Router Cache yang terisi sebelum ganti sandi, jadi
    // /beranda dimuat ulang dengan cookie sesi yang benar.
    const keBeranda = React.useCallback(() => {
        router.push("/beranda");
        router.refresh();
    }, [router]);

    React.useEffect(() => {
        if (!sukses) return;
        const jeda = setTimeout(keBeranda, JEDA_ALIH_MS);
        return () => clearTimeout(jeda);
    }, [sukses, keBeranda]);

    if (sukses) {
        return (
            <PanelSukses icon={ShieldCheck} judul="Kata sandi berhasil diubah">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Anda sudah masuk memakai kata sandi baru. Sebentar lagi
                    diarahkan ke beranda.
                </p>
                <button
                    type="button"
                    onClick={keBeranda}
                    className={`${KELAS_TAUTAN_HALUS} mt-1`}
                >
                    Ke beranda sekarang
                </button>
            </PanelSukses>
        );
    }

    return (
        <form action={formAction} className="flex flex-col gap-4.5">
            <div className="flex flex-col gap-1">
                <h1 className="text-[15px] font-semibold text-foreground">
                    Buat kata sandi baru
                </h1>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Gunakan minimal {PANJANG_MINIMAL} karakter. Setelah
                    disimpan, Anda langsung masuk ke aplikasi.
                </p>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            <AuthField id="sandi" label="Kata Sandi Baru">
                <PasswordInput
                    id="sandi"
                    name="sandi"
                    autoComplete="new-password"
                    minLength={PANJANG_MINIMAL}
                    required
                    autoFocus
                    disabled={tokenBasi}
                />
            </AuthField>

            <AuthField id="ulangi" label="Ulangi Kata Sandi">
                <PasswordInput
                    id="ulangi"
                    name="ulangi"
                    autoComplete="new-password"
                    minLength={PANJANG_MINIMAL}
                    required
                    disabled={tokenBasi}
                />
            </AuthField>

            {tokenBasi ? (
                <Link
                    href="/login/lupa-sandi"
                    className={`${KELAS_TAUTAN_HALUS} mt-1 self-center`}
                >
                    Minta tautan reset baru
                </Link>
            ) : (
                <SubmitButton pending={pending} pendingLabel="Menyimpan">
                    Simpan kata sandi
                </SubmitButton>
            )}
        </form>
    );
}
