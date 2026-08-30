"use server";

import {
    GALAT_HILANG,
    GALAT_RIWAYAT,
    pastikanTataUsaha,
    pesanGalatAuth,
    pesanGalatDb,
    teks,
    type HasilAksi,
    type PesanKhas,
} from "@/lib/aksi";
import type { Role } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR = "/pengguna";

const PANJANG_NAMA = 120;

const PERAN: readonly Role[] = ["pegawai", "pengurus_barang", "tata_usaha"];

const PESAN: PesanKhas = {
    ganda: "Data itu sudah dipakai akun lain.",
    terpakai: GALAT_RIWAYAT,
};

/**
 * Tata usaha tidak boleh menurunkan, menonaktifkan, atau menghapus
 * dirinya sendiri.
 *
 * Pagar ini menutup jalur yang paling mungkin terjadi tanpa satu pun
 * query hitung: menurunkan satu-satunya tata usaha berarti menurunkan
 * diri sendiri, yang ditolak di sini, dan dua tata usaha yang bekerja
 * bergantian selalu menyisakan satu - sebab yang sudah diturunkan tidak
 * lolos pastikanTataUsaha() pada aksi berikutnya.
 *
 * Yang TIDAK ditutupnya: dua tata usaha yang menurunkan satu sama lain
 * pada saat yang bersamaan. Keduanya lolos pemeriksaan id === saya.id
 * sebelum salah satunya sempat tersimpan, dan sekolah bisa kehabisan
 * tata usaha aktif. Menutupnya butuh penjaga di basis data - bukan di
 * sini, sebab dua server action tidak saling melihat. Sampai itu ada,
 * pemulihannya lewat SQL, seperti tata usaha pertama di seed.sql.
 */
const PESAN_DIRI = {
    peran: "Peran akun sendiri tidak bisa diubah. Minta tata usaha lain yang melakukannya.",
    aktif: "Akun sendiri tidak bisa dinonaktifkan.",
    hapus: "Akun sendiri tidak bisa dihapus.",
};

type Isian = { nama_lengkap: string; role: Role; unit_kerja_id: string };

export async function ubahAkun(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    const saya = await pastikanTataUsaha();

    const nama = teks(formData, "nama_lengkap");
    const unitKerjaId = teks(formData, "unit_kerja_id");
    const peranDiminta = teks(formData, "role");

    if (!nama) return { ok: false, galat: "Nama lengkap belum diisi." };
    if (nama.length > PANJANG_NAMA) {
        return {
            ok: false,
            galat: `Nama terlalu panjang, maksimal ${PANJANG_NAMA} karakter.`,
        };
    }

    // Unit kerja wajib. jaga_alur_permintaan() menolak pemohon tanpa unit
    // kerja dengan "Akun Anda belum terhubung ke unit kerja" - berhari-hari
    // kemudian, di meja yang salah, kepada orang yang tidak bisa membetulkannya.
    if (!unitKerjaId) {
        return { ok: false, galat: "Unit kerja belum dipilih." };
    }

    // Formulir untuk baris sendiri memang tidak memuat pilihan peran; kalau
    // toh ada yang mengirimkannya, itu bukan dari halaman yang kita render.
    if (id === saya.id && peranDiminta && peranDiminta !== saya.role) {
        return { ok: false, galat: PESAN_DIRI.peran };
    }

    const role = id === saya.id ? saya.role : (peranDiminta as Role);
    if (!PERAN.includes(role)) {
        return { ok: false, galat: "Peran belum dipilih." };
    }

    const isian: Isian = {
        nama_lengkap: nama,
        role,
        unit_kerja_id: unitKerjaId,
    };

    const supabase = await createClient();
    // .select() bukan hiasan: UPDATE yang ditolak RLS tidak memunculkan galat,
    // barisnya sekadar tak terlihat dan nol baris tersentuh.
    const { data, error } = await supabase
        .from("profil")
        .update(isian)
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
export async function setAktifAkun(
    id: string,
    aktif: boolean,
): Promise<HasilAksi> {
    const saya = await pastikanTataUsaha();

    if (id === saya.id) return { ok: false, galat: PESAN_DIRI.aktif };

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("profil")
        .update({ aktif })
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}

/**
 * Satu-satunya cara menghapus akun: baris profil ikut lenyap lewat
 * on delete cascade dari auth.users, jadi klien biasa tidak punya jalan
 * ke sana sama sekali.
 *
 * Riwayat diperiksa lebih dulu supaya penolakannya berbentuk kalimat yang
 * bisa ditindaklanjuti, bukan galat basis data yang menyeberang dari
 * ujung rantai cascade. Pemeriksaan itu bisa saja terlewat balapan dengan
 * permintaan yang baru masuk - karena itu foreign key tetap dipetakan
 * sebagai jaring terakhir di pesanGalatAuth.
 */
export async function hapusAkun(id: string): Promise<HasilAksi> {
    const saya = await pastikanTataUsaha();

    if (id === saya.id) return { ok: false, galat: PESAN_DIRI.hapus };

    const supabase = await createClient();
    const { data: riwayat, error: galatRiwayat } = await supabase
        .from("permintaan")
        .select("id")
        .or(
            `pemohon_id.eq.${id},disetujui_oleh.eq.${id},disiapkan_oleh.eq.${id},diserahkan_oleh.eq.${id}`,
        )
        .limit(1);

    if (galatRiwayat) {
        return { ok: false, galat: pesanGalatDb(galatRiwayat, PESAN) };
    }
    if (riwayat?.length) return { ok: false, galat: GALAT_RIWAYAT };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);

    if (error) return { ok: false, galat: pesanGalatAuth(error) };

    revalidatePath(JALUR);
    return { ok: true };
}
