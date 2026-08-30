import { pastikanTataUsaha } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { UnitKerjaTabel, type BarisUnit } from "./unit-kerja-tabel";

export const metadata: Metadata = {
    title: "Unit Kerja — SIPB SMPN 14",
};

export default async function UnitKerjaPage() {
    // Proxy hanya menjawab "ada sesi atau tidak"; peran dijaga di sini.
    // Peran yang salah dialihkan ke /beranda, laman yang pasti terlihat olehnya.
    await pastikanTataUsaha();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("unit_kerja")
        .select("id, nama, aktif")
        .order("nama");

    if (error) {
        console.error("[unit kerja]", error.code, error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar unit kerja gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    return <UnitKerjaTabel baris={(data ?? []) as BarisUnit[]} />;
}
