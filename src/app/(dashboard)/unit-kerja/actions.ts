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

const JALUR = "/unit-kerja";

const PANJANG_MAKSIMAL = 80;

const PESAN: PesanKhas = {
    ganda: "Sudah ada unit kerja dengan nama itu.",
    terpakai:
        "Unit kerja ini masih dipakai akun atau permintaan, jadi tidak bisa dihapus. Nonaktifkan saja supaya tidak muncul lagi sebagai pilihan.",
};

const periksaNama = (nama: string): string | null => {
    if (!nama) return "Nama unit kerja belum diisi.";
    if (nama.length > PANJANG_MAKSIMAL)
        return `Nama unit kerja terlalu panjang, maksimal ${PANJANG_MAKSIMAL} karakter.`;
    return null;
};

export async function buatUnit(
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const nama = teks(formData, "nama");
    const galatIsian = periksaNama(nama);
    if (galatIsian) return { ok: false, galat: galatIsian };

    const supabase = await createClient();
    const { error } = await supabase.from("unit_kerja").insert({ nama });

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };

    revalidatePath(JALUR);
    return { ok: true };
}

export async function ubahUnit(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const nama = teks(formData, "nama");
    const galatIsian = periksaNama(nama);
    if (galatIsian) return { ok: false, galat: galatIsian };

    const supabase = await createClient();
    // .select() bukan hiasan: UPDATE yang ditolak RLS tidak memunculkan galat,
    // barisnya sekadar tak terlihat dan nol baris tersentuh. Tanpa memeriksa
    // baris yang kembali, penolakan itu akan dilaporkan sebagai keberhasilan.
    const { data, error } = await supabase
        .from("unit_kerja")
        .update({ nama })
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}

// Tidak menerima (sebelumnya, formData) seperti aksi berformulir: dialog hapus
// tidak punya isian apa pun, dan fungsi berparameter lebih sedikit tetap sah
// dipasang di tempat yang memanggilnya dengan dua argumen.
export async function hapusUnit(id: string): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("unit_kerja")
        .delete()
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}

/**
 * Dipanggil langsung dari sakelar, bukan lewat formulir - karena itu tidak
 * memakai bentuk (sebelumnya, formData) seperti aksi yang lain.
 */
export async function setAktifUnit(
    id: string,
    aktif: boolean,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("unit_kerja")
        .update({ aktif })
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}
