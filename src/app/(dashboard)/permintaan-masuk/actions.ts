"use server";

import { pastikanPengurus, type HasilAksi } from "@/lib/aksi";
import { pesanGalatPermintaan } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
