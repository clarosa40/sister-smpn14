import "server-only";

import { getUserOrRedirect, type User } from "@/lib/dal";
import type { AuthError, PostgrestError } from "@supabase/supabase-js";

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

/**
 * Pasangan pastikanTataUsaha untuk halaman pegawai. Peran lain tidak
 * ditolak dengan pesan galat melainkan dipulangkan ke /beranda oleh
 * getUserOrRedirect - laman yang pasti terlihat oleh peran mana pun.
 *
 * Sama seperti pasangannya, ini lapis kedua. Gerbangnya adalah policy
 * buat_permintaan, ubah_permintaan, hapus_permintaan, dan
 * susun_permintaan_item, yang tetap berlaku kalau pemeriksaan ini kelak
 * terlupa dipasang di sebuah aksi baru.
 */
export const pastikanPegawai = async (): Promise<User> =>
    getUserOrRedirect(["pegawai"]);

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

export const GALAT_RIWAYAT =
    "Akun ini sudah punya riwayat, jadi tidak bisa dihapus. Nonaktifkan saja.";

/**
 * Pasangan pesanGalatDb untuk galat yang datang dari Supabase Auth.
 *
 * Auth Admin API mengembalikan AuthError, bukan PostgrestError: tidak ada
 * kolom `code` berisi SQLSTATE, melainkan kode kata seperti `email_exists`.
 * Karena itu ia butuh pemetaannya sendiri - bukan cabang tambahan di
 * pesanGalatDb yang harus menebak-nebak bentuk galat yang masuk.
 */
export function pesanGalatAuth(galat: AuthError): string {
    switch (galat.code) {
        case "email_exists":
        case "user_already_exists":
            return "Email itu sudah dipakai akun lain.";

        case "weak_password":
            // Mestinya tidak terjangkau untuk sandi yang dibangkitkan
            // sendiri; dipetakan karena /ganti-sandi menerima sandi ketikan.
            return "Kata sandi terlalu pendek, minimal 8 karakter.";

        case "same_password":
            return "Kata sandi baru harus berbeda dari yang lama.";

        case "validation_failed":
            // validation_failed dipakai untuk banyak hal. Hanya yang
            // menyebut email yang bisa diterjemahkan dengan yakin.
            if (/email/i.test(galat.message)) {
                return "Alamat email itu tidak bisa dipakai.";
            }
            break;
    }

    // Penghapusan akun yang tertahan sampai ke sini sebagai kegagalan tak
    // terduga dari GoTrue, bukan sebagai kode kata: yang menolak adalah
    // Postgres, di ujung rantai on delete cascade menuju profil. Dua
    // bentuknya - foreign key "on delete restrict" (permintaan) dan
    // trigger append-only yang tersulut oleh UPDATE set-null pada
    // mutasi_stok/permintaan_log (23503, "foreign key", "permintaan",
    // "mutasi", "append-only") - bukan kerusakan, justru penjaga yang
    // membuat riwayat lama tetap punya nama pemiliknya.
    if (/23503|foreign key|permintaan|mutasi|append-only/i.test(galat.message)) {
        return GALAT_RIWAYAT;
    }

    console.error("[auth]", galat.code, galat.status, galat.message);
    return GALAT_UMUM;
}

/**
 * PostgREST menerima .or() sebagai satu string filter, bukan nilai
 * berparameter: koma memisahkan cabang dan tanda kurung mengelompokkannya.
 * Kata kunci mentah karena itu bisa merusak seluruh ekspresinya - pencarian
 * "HVS, A4" terbaca sebagai cabang ketiga yang tidak sah, dan permintaannya
 * gagal alih-alih menghasilkan nol baris.
 *
 * Nilainya dikutip ganda supaya koma dan kurung di dalamnya ikut terbawa apa
 * adanya, sementara joker ilike dibuang supaya "50%" mencari "50", bukan
 * mencocokkan segalanya.
 *
 * Tinggal di sini, bukan di salah satu page.tsx, sejak pemanggilnya lebih
 * dari satu: sanitasi seperti ini tidak boleh ditulis ulang per halaman.
 */
export const siapkanKataKunci = (kata: string): string =>
    kata
        .replace(/[%_]/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');
