import { pastikanPegawai, siapkanKataKunci } from "@/lib/aksi";
import { ambilDraft } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { KatalogDaftar, type BarisKatalog } from "./katalog-daftar";

export const metadata: Metadata = {
    title: "Katalog Barang — SIPB SMPN 14",
};

/**
 * Tanpa paginasi: katalog sekolah ini puluhan baris, bukan ribuan, dan
 * pencarian yang mempersempitnya. Kalau kelak tumbuh melewati itu,
 * penanganan PGRST103 di master-barang adalah polanya.
 */
export default async function KatalogPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string }>;
}) {
    const user = await pastikanPegawai();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();

    const supabase = await createClient();

    // katalog_pemohon, bukan barang: view itu tidak punya satu pun kolom
    // angka, jadi angka stok tidak bisa bocor lewat halaman ini bahkan
    // kalau select-nya kelak ditulis dengan "*".
    let kueri = supabase
        .from("katalog_pemohon")
        .select("barang_id, kode, nama, satuan, tersedia");

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `kode.ilike."%${kataKunci}%",nama.ilike."%${kataKunci}%"`,
        );
    }

    // Dua permintaan yang tidak saling menunggu: katalognya panjang,
    // keranjangnya satu baris beserta isinya.
    const [katalog, draft] = await Promise.all([
        kueri.order("nama"),
        ambilDraft(supabase, user.id),
    ]);

    if (katalog.error) {
        console.error("[katalog]", katalog.error.code, katalog.error.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Katalog gagal dimuat. Muat ulang halamannya sebentar lagi.
            </p>
        );
    }

    const isi = Object.fromEntries(
        (draft?.item ?? []).map((i) => [i.barang_id, i.jumlah_diminta]),
    );

    return (
        <KatalogDaftar
            baris={(katalog.data ?? []) as BarisKatalog[]}
            cari={cari}
            draftId={draft?.id ?? null}
            isi={isi}
            tanpaUnitKerja={user.unitKerja === null}
        />
    );
}
