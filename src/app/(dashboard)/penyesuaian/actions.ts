"use server";

import { pastikanTataUsaha, teks, type HasilAksi } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

const JALUR = "/penyesuaian";

const GALAT_SUDAH_SESUAI =
    "Hitungan fisiknya sudah sama dengan buku. Tidak ada penyesuaian yang ditulis.";

/**
 * P0001 sudah ditulis sebagai kalimat oleh catat_penyesuaian() untuk
 * seorang pengurus barang - diteruskan apa adanya, sama seperti
 * pesanGalatPermintaan dan pesanGalatPenerimaan.
 */
function pesanGalat(galat: PostgrestError): string {
    if (galat.code === "P0001") return galat.message;
    if (galat.code === "42501") {
        return "Hanya pengurus barang yang boleh mencatat penyesuaian stok.";
    }
    console.error("[penyesuaian]", galat.code, galat.message);
    return "Perubahan gagal disimpan. Coba lagi sebentar lagi.";
}

/**
 * Yang diketik operator adalah hasil hitung fisik, bukan selisihnya -
 * catat_penyesuaian() yang menghitung selisih itu sendiri dari stok
 * sekarang, persis seperti komentarnya di fungsi.sql:537-546.
 *
 * Hitungan yang sudah sama dengan buku dikembalikan lewat jalur
 * ok:false, bukan ok:true diam-diam: DialogForm menutup dirinya sendiri
 * begitu ok:true, dan portalnya lepas seketika (lihat komentar
 * DialogForm) - hasil "sudah sesuai" akan hilang sebelum sempat terbaca
 * kalau lewat jalur itu. Jalur ok:false membuat dialognya tetap terbuka
 * dengan kalimatnya terlihat, sehingga operator tahu persis apa yang
 * terjadi alih-alih menduga-duga apakah tersimpan.
 */
export async function catatPenyesuaian(
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const barangId = teks(formData, "barang_id");
    const catatan = teks(formData, "catatan");
    const jumlahMentah = teks(formData, "jumlah_fisik");

    if (!barangId) return { ok: false, galat: "Pilih barang yang mau disesuaikan." };

    const jumlah = Number(jumlahMentah);
    if (jumlahMentah === "" || !Number.isInteger(jumlah) || jumlah < 0) {
        return {
            ok: false,
            galat: "Hasil hitung fisik harus bilangan bulat dan tidak boleh negatif.",
        };
    }

    if (!catatan) return { ok: false, galat: "Catatan alasannya belum diisi." };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("catat_penyesuaian", {
        p_barang_id: barangId,
        p_jumlah_fisik: jumlah,
        p_catatan: catatan,
    });

    if (error) return { ok: false, galat: pesanGalat(error) };
    if (data === 0) return { ok: false, galat: GALAT_SUDAH_SESUAI };

    revalidatePath(JALUR);
    revalidatePath("/stok");
    revalidatePath("/beranda");
    return { ok: true };
}
