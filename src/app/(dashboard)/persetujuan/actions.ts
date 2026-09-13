"use server";

import { pastikanPengurus, teks, type HasilAksi } from "@/lib/aksi";
import { PANJANG_ALASAN, pesanGalatPermintaan } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR_DAFTAR = "/persetujuan";
const JALUR_BERANDA = "/beranda";

const GALAT_PINDAH =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

/**
 * Menyetujui permintaan yang masih menunggu.
 *
 * `.eq("status", "diajukan")` bukan pengulangan mesin status: tanpa itu,
 * permintaan yang sudah diputuskan dari tab lain tetap terkirim ke server
 * dan ditolak diam-diam - nol baris, tanpa galat. Dengan itu, hasilnya
 * sama tetapi maksudnya terbaca.
 *
 * Tidak ada satu pun kolom lain yang ditulis di sini. disetujui_at dan
 * disetujui_oleh diisi jaga_alur_permintaan() dari auth.uid(), dan baris
 * lognya ditulis catat_log_permintaan().
 */
export async function setujuiPermintaan(id: string): Promise<HasilAksi> {
    await pastikanPengurus();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "disetujui" })
        .eq("id", id)
        .eq("status", "diajukan")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    // Nol baris berarti RLS menolak update ini tanpa memunculkan galat -
    // keadaan yang didokumentasikan aksi.ts:74-77. Di sini penyebabnya
    // hampir selalu permintaan yang sudah diputuskan dari tab lain.
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    revalidatePath(JALUR_BERANDA);
    return { ok: true };
}

/**
 * Menolak permintaan, berikut alasannya.
 *
 * Alasan dan status ditulis dalam satu UPDATE karena keduanya memang
 * harus tiba bersamaan: constraint alasan_tolak_wajib (skema.sql:117)
 * menolak baris ditolak yang alasannya kosong, dan sejak
 * 20260902010000_permintaan-beku.sql alasan itu tidak bisa ditulis
 * belakangan pada baris yang statusnya sudah diam.
 *
 * Constraint itu tetap jaring terakhir, bukan penyaring: kalau ia sampai
 * berbunyi, validasi di atas inilah yang melenceng, dan kalimat umum
 * memang jawaban yang benar untuk cacat pengembang.
 */
export async function tolakPermintaan(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanPengurus();

    const alasan = teks(formData, "alasan_tolak");

    if (!alasan) return { ok: false, galat: "Alasan penolakan belum diisi." };
    if (alasan.length > PANJANG_ALASAN) {
        return {
            ok: false,
            galat: `Alasan terlalu panjang, maksimal ${PANJANG_ALASAN} karakter.`,
        };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "ditolak", alasan_tolak: alasan })
        .eq("id", id)
        // disetujui ikut, bukan diajukan saja: mesin status memang
        // membolehkan disetujui -> ditolak, untuk stok yang tak kunjung ada.
        .in("status", ["diajukan", "disetujui"])
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    revalidatePath(JALUR_BERANDA);
    return { ok: true };
}
