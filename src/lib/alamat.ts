/**
 * Domain sekolah dan aturan nama pengguna, satu-satunya tempat yang
 * merangkai atau membongkar sebuah alamat email.
 *
 * `smpn14.local` tidak pernah menerima apa pun - Supabase Auth sekadar
 * butuh sesuatu berbentuk email untuk mengenali sebuah akun. Karena itu
 * domainnya konstanta, bukan konfigurasi: satu sekolah, satu gudang, satu
 * domain, dan sebuah env var hanya membeli keleluasaan yang tidak pernah
 * dipakai dengan harga nilai yang bisa berbeda diam-diam antara klien dan
 * server.
 */
export const DOMAIN_SEKOLAH = "smpn14.local";

const PANJANG_MAKS = 64;

/**
 * Lebih ketat daripada yang dibutuhkan format alamat, sengaja: sandi yang
 * lupa di sistem ini adalah telepon ke tata usaha, dan nama pengguna yang
 * tidak bisa dibacakan tanpa ambigu - `guru..ipa`, `.guru`, `guru_` -
 * adalah masalah dukungan yang lebih panjang umur daripada orang yang
 * mengetiknya.
 */
const POLA_NAMA_PENGGUNA = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

export const GALAT_NAMA_PENGGUNA =
    "Nama sebelum @ hanya boleh huruf kecil, angka, titik, garis, dan garis bawah.";

/** Sebangun dengan HasilAksi di lib/aksi.ts, untuk kegunaan yang sama. */
export type HasilAlamat =
    | { ok: true; alamat: string }
    | { ok: false; galat: string };

/**
 * Merangkai nama pengguna menjadi alamat lengkap, setelah memangkas dan
 * mengecilkan hurufnya lalu memeriksa polanya.
 *
 * Tidak ada pemeriksaan `@` tersendiri: karakter itu bukan bagian dari
 * POLA_NAMA_PENGGUNA, jadi nilai apa pun yang memuatnya - termasuk alamat
 * lengkap dengan domain yang benar - sudah gagal di pola yang sama. Itulah
 * penjaga yang membuat POST hasil rekayasa tidak bisa membuat akun di
 * domain yang tidak terjangkau formulir masuk.
 */
export function alamatDari(namaPengguna: string): HasilAlamat {
    const nama = namaPengguna.trim().toLowerCase();

    if (nama.length > PANJANG_MAKS || !POLA_NAMA_PENGGUNA.test(nama)) {
        return { ok: false, galat: GALAT_NAMA_PENGGUNA };
    }

    return { ok: true, alamat: `${nama}@${DOMAIN_SEKOLAH}` };
}

/** Separuh sebelum `@` - kebalikan alamatDari, untuk alamat yang sudah sah. */
export const namaPenggunaDari = (alamat: string): string =>
    alamat.slice(0, alamat.indexOf("@"));

/**
 * Kelonggaran untuk formulir masuk: browser yang menyimpan alamat lengkap
 * dari sebelum perubahan ini akan terus menawarkannya lewat autofill. Melepas
 * akhiran domain yang benar supaya nilai itu tetap lolos alamatDari, alih-alih
 * menyambut pengguna lama dengan galat validasi.
 */
export function tanpaAkhiranDomain(nilai: string): string {
    const akhiran = `@${DOMAIN_SEKOLAH}`;
    return nilai.endsWith(akhiran) ? nilai.slice(0, -akhiran.length) : nilai;
}
