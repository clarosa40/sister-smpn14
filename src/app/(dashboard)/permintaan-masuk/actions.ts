"use server";

import { pastikanPengurus, siapkanKataKunci, type HasilAksi } from "@/lib/aksi";
import { keAoaEkspor, namaBerkasEkspor, type HasilEkspor, type KolomEkspor } from "@/lib/ekspor";
import {
    barisEksporPermintaan,
    pesanGalatPermintaan,
    tanggalHariIni,
    type BarisEksporPermintaan,
    type PermintaanUntukEkspor,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

const JALUR_DAFTAR = "/permintaan-masuk";
const JALUR_STOK = "/stok";
const JALUR_BERANDA = "/beranda";

const GALAT_PINDAH =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

const segarkan = (id: string) => {
    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    revalidatePath(JALUR_STOK);
    revalidatePath(JALUR_BERANDA);
};

/**
 * Menyiapkan permintaan lewat siapkan_permintaan(), bukan lewat UPDATE
 * langsung: jaga_alur_permintaan() menolak lompatan ke siap_diambil
 * selama belum ada mutasi keluar untuk seluruh barisnya, dan fungsi
 * inilah satu-satunya yang menulis mutasi itu - all-or-nothing, dalam
 * satu transaksi.
 *
 * Galat kekurangan stok sudah ditulis sebagai kalimat oleh fungsinya
 * sendiri (fungsi.sql:474-477): menyebut barang, sisa, dan yang diminta.
 * pesanGalatPermintaan meneruskannya apa adanya lewat cabang P0001.
 */
export async function siapkanPermintaanMasuk(id: string): Promise<HasilAksi> {
    await pastikanPengurus();

    const supabase = await createClient();
    const { error } = await supabase.rpc("siapkan_permintaan", {
        p_permintaan_id: id,
    });

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };

    segarkan(id);
    return { ok: true };
}

/**
 * Menyerahkan permintaan yang sudah siap. Berbeda dengan siapkan, ini
 * UPDATE biasa: serahkan tidak menulis mutasi apa pun, jadi tidak perlu
 * fungsi SECURITY DEFINER - trigger jaga_alur_permintaan() sudah
 * memeriksa peran dan mengisi selesai_at serta diserahkan_oleh sendiri.
 *
 * `.eq("status", "siap_diambil")` bukan pengulangan mesin status: tanpa
 * itu, permintaan yang sudah diserahkan dari tab lain tetap terkirim ke
 * server dan ditolak diam-diam - nol baris, tanpa galat.
 */
export async function serahkanPermintaanMasuk(id: string): Promise<HasilAksi> {
    await pastikanPengurus();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "selesai" })
        .eq("id", id)
        .eq("status", "siap_diambil")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    segarkan(id);
    return { ok: true };
}

const KOLOM_EKSPOR_PERMINTAAN: KolomEkspor<BarisEksporPermintaan>[] = [
    { header: "Nomor", nilai: (b) => b.nomor },
    { header: "Tanggal Permintaan", nilai: (b) => b.tanggalPermintaan },
    { header: "Tanggal Diajukan", nilai: (b) => b.tanggalDiajukan },
    { header: "Status", nilai: (b) => b.status },
    { header: "Alasan Tolak", nilai: (b) => b.alasanTolak },
    { header: "Pemohon", nilai: (b) => b.pemohon },
    { header: "Unit Kerja", nilai: (b) => b.unitKerja },
    { header: "Keperluan", nilai: (b) => b.keperluan },
    { header: "Kode", nilai: (b) => b.kode },
    { header: "Nama Barang", nilai: (b) => b.namaBarang },
    { header: "Satuan", nilai: (b) => b.satuan },
    { header: "Jumlah Diminta", nilai: (b) => b.jumlahDiminta },
];

const GALAT_EKSPOR =
    "Data gagal diambil untuk diekspor. Coba lagi sebentar lagi.";

/**
 * Menjalankan ulang kueri Riwayat tanpa `.range()` supaya seluruh baris
 * yang cocok ikut, bukan cuma 25 yang tampil di peramban. Petunjuk FK pada
 * pemohon dan batasan disetujui_at is not null dipertahankan sama seperti
 * kueri daftar - status hanya boleh mempersempit Riwayat, tidak pernah
 * melebarkannya.
 */
export async function eksporRiwayatPermintaan(
    cari: string,
    dari: string,
    sampai: string,
    status: string,
): Promise<HasilEkspor> {
    await pastikanPengurus();

    const supabase = await createClient();

    let kueri = supabase
        .from("permintaan")
        .select(
            `nomor, tanggal, diajukan_at, status, alasan_tolak, keperluan,
             pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
             unit_kerja ( nama ),
             permintaan_item ( nama_barang_snapshot, satuan_snapshot, jumlah_diminta, barang ( kode ) )`,
        )
        .in("status", ["selesai", "ditolak"])
        .not("disetujui_at", "is", null);

    const kataKunci = siapkanKataKunci(cari.trim());
    if (kataKunci) {
        kueri = kueri.or(
            `nomor.ilike."%${kataKunci}%",keperluan.ilike."%${kataKunci}%"`,
        );
    }
    if (dari) kueri = kueri.gte("tanggal", dari);
    if (sampai) kueri = kueri.lte("tanggal", sampai);
    if (status === "selesai" || status === "ditolak") {
        kueri = kueri.eq("status", status);
    }

    const { data, error } = await kueri
        .order("tanggal", { ascending: false })
        .order("diajukan_at", { ascending: false });

    if (error) {
        console.error("[permintaan-masuk] ekspor", error.code, error.message);
        return { ok: false, galat: GALAT_EKSPOR };
    }

    const baris = barisEksporPermintaan(
        (data ?? []) as unknown as PermintaanUntukEkspor[],
    );
    const aoa = keAoaEkspor(baris, KOLOM_EKSPOR_PERMINTAAN);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Permintaan");
    const base64 = XLSX.write(wb, {
        type: "base64",
        bookType: "xlsx",
    }) as string;

    return {
        ok: true,
        base64,
        namaBerkas: namaBerkasEkspor({
            prefix: "permintaan",
            status: status || undefined,
            dari,
            sampai,
            hariIni: tanggalHariIni(),
        }),
    };
}
