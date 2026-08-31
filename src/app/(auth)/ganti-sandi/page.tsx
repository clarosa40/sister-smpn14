import { ambilAkun, jalurTolak } from "@/lib/dal";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GantiSandiForm } from "./ganti-sandi-form";

export const metadata: Metadata = {
    title: "Ganti Kata Sandi — SIPB SMPN 14",
};

export default async function GantiSandiPage() {
    // ambilAkun(), bukan getUserOrRedirect(): fungsi itu mengalihkan setiap
    // pemegang sandi sementara ke halaman ini, jadi memanggilnya dari sini
    // berarti mengalihkan halaman ini ke dirinya sendiri, terus-menerus.
    const akun = await ambilAkun();
    if (akun.status !== "ok") redirect(jalurTolak(akun.status));

    // Tanpa penanda, halaman ini tetap boleh dibuka: inilah satu-satunya
    // layar ganti kata sandi bagi orang yang sudah masuk.
    return <GantiSandiForm dipaksa={akun.sandiSementara} />;
}
