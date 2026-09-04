import { Paginasi } from "@/components/admin/paginasi";
import { pastikanPengurus, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StokDaftar, type BarisStok } from "./stok-daftar";

export const metadata: Metadata = {
    title: "Stok Barang — SIPB SMPN 14",
};

const PER_HALAMAN = 25;

/** `hal` dihilangkan di halaman pertama supaya alamatnya tetap bersih. */
export const alamatStok = (
    cari: string,
    kosong: boolean,
    halaman = 1,
): string => {
    const parameter = new URLSearchParams();
    if (cari) parameter.set("cari", cari);
    if (kosong) parameter.set("kosong", "1");
    if (halaman > 1) parameter.set("hal", String(halaman));
    const kueri = parameter.toString();
    return kueri ? `/stok?${kueri}` : "/stok";
};

export default async function StokPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string; kosong?: string; hal?: string }>;
}) {
    await pastikanPengurus();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();
    const kosong = parameter.kosong === "1";
    const halaman = Math.max(1, Number.parseInt(parameter.hal ?? "1", 10) || 1);
    const dari = (halaman - 1) * PER_HALAMAN;

    const supabase = await createClient();

    let kueri = supabase
        .from("stok_barang")
        .select("barang_id, kode, nama, satuan, stok, status", {
            count: "exact",
        });

    if (kosong) kueri = kueri.eq("status", "kosong");

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `kode.ilike."%${kataKunci}%",nama.ilike."%${kataKunci}%"`,
        );
    }

    const daftar = await kueri
        .order("nama")
        .range(dari, dari + PER_HALAMAN - 1);

    // PostgREST menjawab rentang yang mulai di luar jumlah baris dengan 416,
    // bukan dengan daftar kosong - tautan lama atau halaman yang baru saja
    // menyusut karena kata kunci berganti. Pembacanya dipulangkan ke halaman
    // pertama, bukan disuguhi pesan kerusakan.
    if (daftar.error?.code === "PGRST103" && halaman > 1) {
        redirect(alamatStok(cari, kosong));
    }

    if (daftar.error) {
        console.error("[stok]", daftar.error.code, daftar.error.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar stok gagal dimuat. Muat ulang halamannya sebentar lagi.
            </p>
        );
    }

    const total = daftar.count ?? 0;
    const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <StokDaftar
                baris={(daftar.data ?? []) as BarisStok[]}
                cari={cari}
                kosong={kosong}
            />

            {total > 0 && (
                <Paginasi
                    halaman={halaman}
                    jumlahHalaman={jumlahHalaman}
                    dari={dari}
                    ditampilkan={daftar.data?.length ?? 0}
                    total={total}
                    satuan="barang"
                    href={(h) => alamatStok(cari, kosong, h)}
                />
            )}
        </div>
    );
}
