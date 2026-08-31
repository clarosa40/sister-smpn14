"use client";

import {
    AuthField,
    KELAS_TAUTAN_HALUS,
    PanelSukses,
    PasswordInput,
} from "@/components/auth/form-parts";
import { FormAlert, SubmitButton } from "@/components/form-parts";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { gantiSandi, type HasilGanti } from "./actions";

const PANJANG_MINIMAL = 8;
const JEDA_ALIH_MS = 2000;

export function GantiSandiForm({ dipaksa }: { dipaksa: boolean }) {
    const router = useRouter();
    const [hasil, kirim, pending] = React.useActionState<
        HasilGanti | null,
        FormData
    >(gantiSandi, null);

    const sukses = hasil?.ok === true;
    const galat = hasil?.ok === false ? hasil.galat : null;

    // refresh() membuang Router Cache yang terisi selagi penanda
    // sandi_sementara masih terpasang. Tanpa itu /beranda bisa dilayani
    // dari salinan lama yang justru memantulkan kembali ke halaman ini.
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
            <PanelSukses icon={ShieldCheck} judul="Kata sandi berhasil diganti">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Mulai sekarang pakai kata sandi baru itu untuk masuk.
                    Sebentar lagi diarahkan ke beranda.
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
        <form action={kirim} className="flex flex-col gap-4.5">
            <div className="flex flex-col gap-1">
                <h1 className="text-[15px] font-semibold text-foreground">
                    {dipaksa ? "Ganti kata sandi dulu" : "Ganti kata sandi"}
                </h1>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {dipaksa
                        ? "Akun ini masih memakai kata sandi sementara dari tata usaha. Buat kata sandi Anda sendiri untuk melanjutkan."
                        : `Gunakan minimal ${PANJANG_MINIMAL} karakter. Kata sandi lama diminta sebagai pembuktian.`}
                </p>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            <AuthField
                id="lama"
                label={dipaksa ? "Kata Sandi Sementara" : "Kata Sandi Lama"}
            >
                <PasswordInput
                    id="lama"
                    name="lama"
                    autoComplete="current-password"
                    required
                    autoFocus
                />
            </AuthField>

            <AuthField id="baru" label="Kata Sandi Baru">
                <PasswordInput
                    id="baru"
                    name="baru"
                    autoComplete="new-password"
                    minLength={PANJANG_MINIMAL}
                    required
                />
            </AuthField>

            <AuthField id="ulangi" label="Ulangi Kata Sandi Baru">
                <PasswordInput
                    id="ulangi"
                    name="ulangi"
                    autoComplete="new-password"
                    minLength={PANJANG_MINIMAL}
                    required
                />
            </AuthField>

            <SubmitButton pending={pending} pendingLabel="Menyimpan">
                Simpan kata sandi
            </SubmitButton>
        </form>
    );
}
