"use server";

import {
    GALAT_HILANG,
    pastikanTataUsaha,
    pesanGalatDb,
    teks,
    type HasilAksi,
    type PesanKhas,
} from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR = "/master-barang";

const PESAN: PesanKhas = {
    ganda: "Kode itu sudah dipakai barang lain. Satu kode hanya untuk satu barang.",
    terpakai:
        "Barang ini sudah tercatat di permintaan, penerimaan, atau buku mutasi, jadi tidak bisa dihapus. Kalau nama atau satuannya salah, ubah saja.",
};

type Isian = { kode: string; nama: string; satuan: string };

const BATAS = { kode: 60, nama: 120, satuan: 20 };

/**
 * Kode tidak diperiksa bentuknya. Kode barang disalin apa adanya dari Excel
 * inventaris sekolah dan sudah punya arti di luar aplikasi ini - memaksakan
 * pola di sini hanya akan menolak data yang sebenarnya benar.
 */
const bacaIsian = (formData: FormData): Isian | string => {
    const kode = teks(formData, "kode");
    const nama = teks(formData, "nama");
    const satuan = teks(formData, "satuan");

    if (!kode) return "Kode barang belum diisi.";
    if (!nama) return "Nama barang belum diisi.";
    if (!satuan) return "Satuan belum diisi.";

    if (kode.length > BATAS.kode)
        return `Kode terlalu panjang, maksimal ${BATAS.kode} karakter.`;
    if (nama.length > BATAS.nama)
        return `Nama terlalu panjang, maksimal ${BATAS.nama} karakter.`;
    if (satuan.length > BATAS.satuan)
        return `Satuan terlalu panjang, maksimal ${BATAS.satuan} karakter.`;

    return { kode, nama, satuan };
};

export async function buatBarang(
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const isian = bacaIsian(formData);
    if (typeof isian === "string") return { ok: false, galat: isian };

    const supabase = await createClient();
    const { error } = await supabase.from("barang").insert(isian);

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };

    revalidatePath(JALUR);
    return { ok: true };
}

export async function ubahBarang(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const isian = bacaIsian(formData);
    if (typeof isian === "string") return { ok: false, galat: isian };

    const supabase = await createClient();
    // UPDATE yang ditolak RLS tidak memunculkan galat - barisnya sekadar tak
    // terlihat. Baris yang kembali dari .select() yang membedakan "tersimpan"
    // dari "tidak berhak".
    const { data, error } = await supabase
        .from("barang")
        .update(isian)
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}

// Dialog hapus tidak punya isian, jadi (sebelumnya, formData) tidak diminta -
// fungsi berparameter lebih sedikit tetap sah dipasang di tempatnya.
export async function hapusBarang(id: string): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("barang")
        .delete()
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}
