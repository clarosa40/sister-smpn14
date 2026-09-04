import { Paginasi } from "@/components/admin/paginasi";
import { pastikanPengurus, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DaftarPenerimaan, type BarisPenerimaan } from "./daftar-penerimaan";

export const metadata: Metadata = {
    title: "Penerimaan — SIPB SMPN 14",
};

const PER_HALAMAN = 25;

/** `hal` dihilangkan di halaman pertama supaya alamatnya tetap bersih. */
export const alamatPenerimaan = (cari: string, halaman = 1): string => {
    const parameter = new URLSearchParams();
    if (cari) parameter.set("cari", cari);
    if (halaman > 1) parameter.set("hal", String(halaman));
    const kueri = parameter.toString();
    return kueri ? `/penerimaan?${kueri}` : "/penerimaan";
};

export default async function PenerimaanPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string; hal?: string }>;
}) {
    await pastikanPengurus();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();
    const halaman = Math.max(1, Number.parseInt(parameter.hal ?? "1", 10) || 1);
    const dari = (halaman - 1) * PER_HALAMAN;

    const supabase = await createClient();

    let kueri = supabase
        .from("penerimaan")
        .select("id, nomor, tanggal, no_dokumen, penerimaan_item ( id )", {
            count: "exact",
        });

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `nomor.ilike."%${kataKunci}%",no_dokumen.ilike."%${kataKunci}%"`,
        );
    }

    const daftar = await kueri
        .order("created_at", { ascending: false })
        .range(dari, dari + PER_HALAMAN - 1);

    // PostgREST menjawab rentang yang mulai di luar jumlah baris dengan 416,
    // bukan dengan daftar kosong. Pembacanya dipulangkan ke halaman pertama,
    // bukan disuguhi pesan kerusakan.
    if (daftar.error?.code === "PGRST103" && halaman > 1) {
        redirect(alamatPenerimaan(cari));
    }

    if (daftar.error) {
        console.error("[penerimaan]", daftar.error.code, daftar.error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar penerimaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    const total = daftar.count ?? 0;
    const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <DaftarPenerimaan
                baris={(daftar.data ?? []) as unknown as BarisPenerimaan[]}
                cari={cari}
            />

            {total > 0 && (
                <Paginasi
                    halaman={halaman}
                    jumlahHalaman={jumlahHalaman}
                    dari={dari}
                    ditampilkan={daftar.data?.length ?? 0}
                    total={total}
                    satuan="penerimaan"
                    href={(h) => alamatPenerimaan(cari, h)}
                />
            )}
        </div>
    );
}
