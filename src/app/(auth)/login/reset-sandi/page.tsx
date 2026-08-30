import { getUser } from "@/lib/dal";
import { COOKIE_PEMULIHAN } from "@/lib/pemulihan";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResetSandiForm } from "./reset-sandi-form";

export const metadata: Metadata = {
    title: "Kata sandi baru — SIPB SMPN 14",
};

export default async function ResetSandiPage() {
    // Halaman ini hanya untuk orang yang baru saja menukarkan tautan pemulihan.
    // Sesi biasa tidak cukup: updateUser() menerima sesi apa pun, jadi tanpa
    // pagar ini siapa pun yang sudah masuk bisa mengganti kata sandi tanpa
    // pernah ditanya sandi lamanya.
    const penanda = (await cookies()).get(COOKIE_PEMULIHAN);

    if (!penanda) {
        redirect((await getUser()) ? "/beranda" : "/login");
    }

    return <ResetSandiForm />;
}
