import "server-only";

import { getUserOrRedirect, type User } from "@/lib/dal";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Bentuk kembalian setiap server action master data, sebangun dengan
 * HasilReset di (auth)/login/reset-sandi/actions.ts supaya useActionState
 * dipakai dengan cara yang sama di seluruh aplikasi.
 */
export type HasilAksi = { ok: true } | { ok: false; galat: string };

/**
 * Dua kalimat yang berbeda per tabel. Sisanya - hak akses, galat tak terduga -
 * sama di mana pun, jadi hanya kedua ini yang diminta dari pemanggil.
 */
export type PesanKhas = {
    /** Nilai uniknya bentrok: kode barang kembar, nama unit kerja kembar. */
    ganda: string;
    /** Barisnya masih dirujuk tabel lain, jadi tidak bisa dihapus. */
    terpakai: string;
};

const GALAT_UMUM = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";

export const GALAT_HILANG =
    "Data itu sudah tidak ada, atau akun Anda tidak berhak mengubahnya. Muat ulang halamannya.";

/**
 * Server action adalah endpoint HTTP tersendiri; halaman yang menampilkan
 * formulirnya bukan bukti apa pun. Karena itu perannya diperiksa ulang di awal
 * setiap aksi, bukan sekali di page.tsx.
 *
 * Ini lapis kedua, bukan gerbangnya: gerbang sesungguhnya ada di policy RLS
 * kelola_barang dan kelola_unit_kerja, yang berlaku bahkan kalau pemeriksaan
 * ini kelak terlupa dipasang.
 */
export const pastikanTataUsaha = async (): Promise<User> =>
    getUserOrRedirect(["tata_usaha"]);

/** Isi satu kolom formulir, sudah dirapikan ujung-ujungnya. */
export const teks = (formData: FormData, nama: string): string =>
    String(formData.get(nama) ?? "").trim();

/**
 * Menerjemahkan galat Postgres menjadi kalimat yang bisa ditindaklanjuti tata
 * usaha. Pesan aslinya ditulis ke log server dan tidak pernah sampai ke layar:
 * "duplicate key value violates unique constraint barang_kode_key" tidak
 * memberi tahu siapa pun apa yang harus dilakukan.
 */
export function pesanGalatDb(galat: PostgrestError, khas: PesanKhas): string {
    switch (galat.code) {
        case "23505":
            return khas.ganda;

        // Dirujuk tabel lain dengan on delete restrict. Bukan kegagalan -
        // justru penjaga yang membuat riwayat permintaan lama tetap terbaca.
        case "23503":
            return khas.terpakai;

        // INSERT yang ditolak RLS muncul sebagai galat. UPDATE dan DELETE yang
        // ditolak RLS tidak: barisnya sekadar tidak terlihat, nol baris
        // terpengaruh, tanpa galat sama sekali. Itu ditangani di sisi pemanggil
        // dengan memeriksa baris yang kembali, bukan di sini.
        case "42501":
            return "Hanya tata usaha yang boleh mengubah data ini.";

        default:
            console.error("[master data]", galat.code, galat.message);
            return GALAT_UMUM;
    }
}
