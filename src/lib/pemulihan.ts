/**
 * Titipan token pemulihan dari email, disimpan mentah menunggu ditebus.
 *
 * Titip dulu, tebus belakangan: /auth/konfirmasi tidak lagi memanggil
 * verifyOtp saat pengguna sekadar mengklik tautannya - hanya menyimpan
 * token_hash-nya ke sini. verifyOtp dan updateUser baru dipanggil bersamaan
 * di server action, saat pengguna benar-benar menekan simpan. Dua akibatnya:
 *
 *   1. Klik dua kali tautan yang sama tetap sah, karena Supabase belum pernah
 *      diberi kesempatan menandai tokennya terpakai.
 *   2. Ada tidaknya cookie ini sama artinya dengan ada tidaknya niatan
 *      memulihkan. Tidak ada "penanda" yang bisa mengambang lebih lama
 *      daripada tokennya.
 *
 * Isi cookie adalah token_hash mentah - alat yang cukup untuk mengambil alih
 * akun. `httpOnly` menjauhkannya dari JavaScript peramban, `path` mengunci ke
 * satu halaman pemakainya, dan umurnya sengaja pendek: pengetikan satu formulir
 * tidak butuh lima belas menit, tetapi meninggalkan tab terbuka semalaman juga
 * tidak masuk akal.
 */
export const COOKIE_PEMULIHAN = "sipb-pemulihan";

export const JALUR_PEMULIHAN = "/login/reset-sandi";

export const opsiCookiePemulihan = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: JALUR_PEMULIHAN,
    maxAge: 60 * 15,
} as const;
