import { Paginasi } from "@/components/admin/paginasi";
import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DaftarPersetujuan, type BarisPersetujuan } from "./daftar-persetujuan";

export const metadata: Metadata = {
    title: "Persetujuan — SIPB SMPN 14",
};

const PER_HALAMAN = 25;

/**
 * Petunjuk foreign key pada pemohon bukan hiasan: permintaan punya empat
 * FK ke profil - pemohon_id, disetujui_oleh, disiapkan_oleh,
 * diserahkan_oleh - jadi `profil ( nama_lengkap )` telanjang membuat
 * PostgREST menjawab PGRST201 alih-alih memilih salah satu. unit_kerja
 * hanya punya satu dan karena itu tidak membutuhkannya.
 */
const KOLOM = `id, nomor, status, keperluan, tanggal_dibutuhkan, tanggal, diajukan_at,
     pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
     unit_kerja ( nama ),
     permintaan_item ( id )`;

/** `hal` dihilangkan di halaman pertama supaya alamatnya tetap bersih. */
const alamatRiwayat = (cari: string, halaman = 1): string => {
    const parameter = new URLSearchParams({ lihat: "riwayat" });
    if (cari) parameter.set("cari", cari);
    if (halaman > 1) parameter.set("hal", String(halaman));
    return `/persetujuan?${parameter.toString()}`;
};

export default async function PersetujuanPage({
    searchParams,
}: {
    searchParams: Promise<{ lihat?: string; cari?: string; hal?: string }>;
}) {
    await pastikanTataUsaha();

    const parameter = await searchParams;
    const riwayat = parameter.lihat === "riwayat";
    // Keduanya hanya berlaku di Riwayat; antrean tidak dicari dan tidak
    // dipaginasi, jadi parameter nyasar di sana diabaikan saja.
    const cari = riwayat ? (parameter.cari ?? "").trim() : "";
    const halaman = Math.max(1, Number.parseInt(parameter.hal ?? "1", 10) || 1);
    const dari = (halaman - 1) * PER_HALAMAN;

    const supabase = await createClient();

    // Draft disisihkan di kueri, bukan oleh RLS: baca_permintaan
    // disempitkan oleh is_staf(), bukan oleh status, jadi keranjang orang
    // lain memang akan ikut terbawa kalau tidak diminta menyingkir.
    let kueri = supabase.from("permintaan").select(KOLOM, { count: "exact" });

    if (riwayat) {
        kueri = kueri.not("status", "in", '("draft","diajukan")');

        const kataKunci = siapkanKataKunci(cari);
        if (kataKunci) {
            kueri = kueri.or(
                `nomor.ilike."%${kataKunci}%",keperluan.ilike."%${kataKunci}%"`,
            );
        }
    } else {
        kueri = kueri.eq("status", "diajukan");
    }

    // Antrean dilayani menurut urutan datang - diajukan_at - dan tidak
    // dipaginasi: ia memang untuk dihabiskan, dan permintaan yang
    // tanggalnya sengaja dimundurkan tidak boleh melangkahi yang sudah
    // menunggu lebih dulu. Riwayat justru catatan kejadian sekolah, jadi
    // ia mengurut tanggal permintaan, dengan diajukan_at sebagai penentu
    // kalau dua permintaan sama-sama tercatat pada tanggal yang sama.
    const daftar = riwayat
        ? await kueri
              .order("tanggal", { ascending: false })
              .order("diajukan_at", { ascending: false })
              .range(dari, dari + PER_HALAMAN - 1)
        : await kueri.order("diajukan_at");

    // PostgREST menjawab rentang yang mulai di luar jumlah baris dengan 416,
    // bukan dengan daftar kosong - tautan lama, penanda buku, atau baris
    // terakhir sebuah halaman yang baru saja berpindah status. Pembacanya
    // dipulangkan ke halaman pertama, bukan disuguhi pesan kerusakan.
    if (daftar.error?.code === "PGRST103" && halaman > 1) {
        redirect(alamatRiwayat(cari));
    }

    if (daftar.error) {
        console.error("[persetujuan]", daftar.error.code, daftar.error.message);
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
            <DaftarPersetujuan
                baris={(daftar.data ?? []) as unknown as BarisPersetujuan[]}
                riwayat={riwayat}
                cari={cari}
            />

            {riwayat && total > 0 && (
                <Paginasi
                    halaman={halaman}
                    jumlahHalaman={jumlahHalaman}
                    dari={dari}
                    ditampilkan={daftar.data?.length ?? 0}
                    total={total}
                    satuan="permintaan"
                    href={(h) => alamatRiwayat(cari, h)}
                />
            )}
        </div>
    );
}
