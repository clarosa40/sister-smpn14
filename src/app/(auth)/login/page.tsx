import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
    title: "Masuk — SIPB SMPN 14",
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ alasan?: string }>;
}) {
    // Satu-satunya alasan yang dikenali. /auth/keluar yang memasangnya, dan
    // hanya untuk nilai itu - jadi tidak ada teks dari luar yang sampai ke
    // layar lewat jalur ini.
    const { alasan } = await searchParams;

    return <LoginForm nonaktif={alasan === "nonaktif"} />;
}
