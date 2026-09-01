"use server";

import { pastikanPegawai, teks, type HasilAksi } from "@/lib/aksi";
import {
    GALAT_KERANJANG_HILANG,
    PANJANG_CATATAN,
    PANJANG_KEPERLUAN,
    pesanGalatPermintaan,
    tanggalHariIni,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const JALUR_KATALOG = "/katalog";
const JALUR_DAFTAR = "/permintaan-saya";

const GALAT_PINDAH =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

/**
 * Mengajukan keranjang. Keperluan, tanggal dibutuhkan, dan catatan baru
 * ditanyakan di sini - bukan di klik pertama - karena di titik ini
 * pemohonnya sudah melihat seluruh daftar barangnya.
 *
 * Ketiganya ditulis bersama status dalam satu UPDATE. Trigger yang
 * menerbitkan nomor SPB dan mencap diajukan_at; baris lognya ditulis
 * catat_log_permintaan(). Tidak ada satu pun dari itu yang perlu diketik
 * di sini.
 */
export async function ajukanPermintaan(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanPegawai();

    const keperluan = teks(formData, "keperluan");
    const tanggal = teks(formData, "tanggal_dibutuhkan");
    const catatan = teks(formData, "catatan_pemohon");

    if (!keperluan) return { ok: false, galat: "Keperluan belum diisi." };
    if (keperluan.length > PANJANG_KEPERLUAN) {
        return {
            ok: false,
            galat: `Keperluan terlalu panjang, maksimal ${PANJANG_KEPERLUAN} karakter.`,
        };
    }
    if (catatan.length > PANJANG_CATATAN) {
        return {
            ok: false,
            galat: `Catatan terlalu panjang, maksimal ${PANJANG_CATATAN} karakter.`,
        };
    }
    // Perbandingan teks, bukan Date: keduanya YYYY-MM-DD dan keduanya
    // dihitung di zona waktu sekolah, jadi tidak ada tengah malam UTC yang
    // membuat "hari ini" jadi kemarin.
    if (tanggal && tanggal < tanggalHariIni()) {
        return {
            ok: false,
            galat: "Tanggal dibutuhkan tidak boleh sebelum hari ini.",
        };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({
            keperluan,
            tanggal_dibutuhkan: tanggal || null,
            catatan_pemohon: catatan || null,
            status: "diajukan",
        })
        .eq("id", id)
        .eq("status", "draft")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    // Nol baris berarti RLS menolak update ini tanpa memunculkan galat -
    // keadaan yang didokumentasikan aksi.ts:61-64. Di sini penyebabnya
    // hampir selalu keranjang yang sudah diajukan dari tab lain.
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_KATALOG);
    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    return { ok: true };
}

/**
 * Membatalkan permintaan yang masih menunggu persetujuan.
 *
 * `.eq("status", "diajukan")` bukan pengulangan mesin status: tanpa itu,
 * permintaan yang sudah disetujui akan tetap terkirim ke server dan
 * ditolak diam-diam oleh policy ubah_permintaan - nol baris, tanpa galat.
 * Dengan itu, hasilnya sama tetapi maksudnya terbaca.
 */
export async function batalkanPermintaan(id: string): Promise<HasilAksi> {
    await pastikanPegawai();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "dibatalkan" })
        .eq("id", id)
        .eq("status", "diajukan")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    return { ok: true };
}

/**
 * Mengosongkan keranjang: barisnya sendiri yang dihapus, dan
 * permintaan_item ikut lewat on delete cascade.
 *
 * Berakhir dengan redirect(), bukan { ok: true }, karena halaman yang
 * memanggilnya baru saja berhenti ada. redirect() melempar - itu memang
 * caranya bekerja - jadi ia tidak boleh berada di dalam try/catch.
 */
export async function kosongkanKeranjang(id: string): Promise<HasilAksi> {
    await pastikanPegawai();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .delete()
        .eq("id", id)
        .eq("status", "draft")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_KERANJANG_HILANG };

    revalidatePath(JALUR_KATALOG);
    revalidatePath(JALUR_DAFTAR);
    redirect(JALUR_DAFTAR);
}
