import { Paginasi } from "@/components/admin/paginasi";
import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
    DaftarPermintaanMasuk,
    type BarisPermintaanMasuk,
    type StatusRiwayat,
    type Tampilan,
} from "./daftar-permintaan-masuk";

export const metadata: Metadata = {
    title: "Permintaan Masuk — SIPB SMPN 14",
};

const PER_HALAMAN = 25;

/**
 * Petunjuk foreign key pada pemohon bukan hiasan: permintaan punya empat
 * FK ke profil, jadi `profil ( nama_lengkap )` telanjang membuat
 * PostgREST menjawab PGRST201 alih-alih memilih salah satu.
 */
const KOLOM = `id, nomor, status, keperluan, tanggal_dibutuhkan, tanggal, diajukan_at, siap_at,
     pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
     unit_kerja ( nama ),
     permintaan_item ( id )`;

/** `hal` dihilangkan di halaman pertama supaya alamatnya tetap bersih. */
const alamatRiwayat = (
    cari: string,
    halaman = 1,
    dari = "",
    sampai = "",
    status = "",
): string => {
    const parameter = new URLSearchParams({ lihat: "riwayat" });
    if (cari) parameter.set("cari", cari);
    if (dari) parameter.set("dari", dari);
    if (sampai) parameter.set("sampai", sampai);
    if (status) parameter.set("status", status);
    if (halaman > 1) parameter.set("hal", String(halaman));
    return `/permintaan-masuk?${parameter.toString()}`;
};

const tampilanDari = (nilai: string | undefined): Tampilan =>
    nilai === "serahkan" || nilai === "riwayat" ? nilai : "siapkan";

const statusDari = (nilai: string | undefined): StatusRiwayat =>
    nilai === "selesai" || nilai === "ditolak" ? nilai : "";

export default async function PermintaanMasukPage({
    searchParams,
}: {
    searchParams: Promise<{
        lihat?: string;
        cari?: string;
        dari?: string;
        sampai?: string;
        status?: string;
        hal?: string;
    }>;
}) {
    await pastikanTataUsaha();

    const parameter = await searchParams;
    const tampilan = tampilanDari(parameter.lihat);
    const riwayat = tampilan === "riwayat";
    // Kata kunci, rentang tanggal, status, dan halaman hanya berlaku di
    // Riwayat; kedua antrean tidak dicari dan tidak dipaginasi - keduanya
    // memang untuk dihabiskan.
    const cari = riwayat ? (parameter.cari ?? "").trim() : "";
    const dariTanggal = riwayat ? (parameter.dari ?? "").trim() : "";
    const sampaiTanggal = riwayat ? (parameter.sampai ?? "").trim() : "";
    const statusFilter = riwayat ? statusDari(parameter.status) : "";
    const halaman = Math.max(1, Number.parseInt(parameter.hal ?? "1", 10) || 1);
    const dari = (halaman - 1) * PER_HALAMAN;

    const supabase = await createClient();

    let kueri = supabase.from("permintaan").select(KOLOM, { count: "exact" });

    if (tampilan === "riwayat") {
        // Persis permintaan yang pernah sampai ke antrean tata usaha:
        // pernah disetujui, dan sekarang sudah selesai atau ditolak.
        // disetujui_at is not null memisahkan penolakan setelah persetujuan
        // dari penolakan langsung dari diajukan, yang tidak pernah singgah
        // di sini.
        kueri = kueri
            .in("status", ["selesai", "ditolak"])
            .not("disetujui_at", "is", null);

        const kataKunci = siapkanKataKunci(cari);
        if (kataKunci) {
            kueri = kueri.or(
                `nomor.ilike."%${kataKunci}%",keperluan.ilike."%${kataKunci}%"`,
            );
        }
        if (dariTanggal) kueri = kueri.gte("tanggal", dariTanggal);
        if (sampaiTanggal) kueri = kueri.lte("tanggal", sampaiTanggal);
        if (statusFilter) kueri = kueri.eq("status", statusFilter);
    } else if (tampilan === "serahkan") {
        kueri = kueri.eq("status", "siap_diambil");
    } else {
        kueri = kueri.eq("status", "disetujui");
    }

    // Kedua antrean (Siapkan, Serahkan) dikuras menurut urutan tiba -
    // diajukan_at atau siap_at - sebab pekerjaan yang sudah menunggu tidak
    // boleh dilangkahi permintaan yang tanggalnya sengaja dimundurkan.
    // Riwayat sebaliknya adalah catatan kejadian sekolah, jadi ia mengurut
    // tanggal permintaan, dengan diajukan_at sebagai penentu kalau dua
    // permintaan sama-sama tercatat pada tanggal yang sama.
    const daftar = riwayat
        ? await kueri
              .order("tanggal", { ascending: false })
              .order("diajukan_at", { ascending: false })
              .range(dari, dari + PER_HALAMAN - 1)
        : await kueri.order(tampilan === "serahkan" ? "siap_at" : "diajukan_at");

    // PostgREST menjawab rentang yang mulai di luar jumlah baris dengan 416,
    // bukan dengan daftar kosong - tautan lama atau halaman yang baru saja
    // menyusut karena kata kunci berganti.
    if (daftar.error?.code === "PGRST103" && halaman > 1) {
        redirect(
            alamatRiwayat(cari, 1, dariTanggal, sampaiTanggal, statusFilter),
        );
    }

    if (daftar.error) {
        console.error(
            "[permintaan masuk]",
            daftar.error.code,
            daftar.error.message,
        );
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar permintaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    const total = daftar.count ?? 0;
    const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <DaftarPermintaanMasuk
                baris={(daftar.data ?? []) as unknown as BarisPermintaanMasuk[]}
                tampilan={tampilan}
                cari={cari}
                dari={dariTanggal}
                sampai={sampaiTanggal}
                status={statusFilter}
            />

            {riwayat && total > 0 && (
                <Paginasi
                    halaman={halaman}
                    jumlahHalaman={jumlahHalaman}
                    dari={dari}
                    ditampilkan={daftar.data?.length ?? 0}
                    total={total}
                    satuan="permintaan"
                    href={(h) =>
                        alamatRiwayat(
                            cari,
                            h,
                            dariTanggal,
                            sampaiTanggal,
                            statusFilter,
                        )
                    }
                />
            )}
        </div>
    );
}
