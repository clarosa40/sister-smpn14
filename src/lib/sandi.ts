/**
 * Sandi sementara untuk akun yang baru dibuat tata usaha.
 *
 * Selalu dibangkitkan, tidak pernah diketik. Membiarkan tata usaha
 * mengarangnya sendiri berujung pada satu pola rumahan yang sama di
 * seluruh akun sekolah - persis risiko yang sudah dibawa oleh gagasan
 * "sandi sementara" itu sendiri.
 *
 * Alfabetnya membuang 0, O, 1, l, dan I. Sandi ini dibacakan dari layar
 * lalu diketik ulang di perangkat lain; sepasang karakter kembar bentuk
 * mengubah "belum sempat mencatat" menjadi "sandinya salah".
 */
const ALFABET =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const PANJANG_BAKU = 12;

/**
 * Rejection sampling, bukan `byte % 57`. 256 tidak habis dibagi 57, jadi
 * modulo polos membuat dua puluh delapan simbol pertama alfabet muncul lebih sering
 * daripada sisanya. Bias itu kecil dan tidak pernah terlihat - justru
 * karena itu ia harus ditutup di sini, bukan diingat belakangan.
 */
export function sandiSementara(panjang: number = PANJANG_BAKU): string {
    const batas = 256 - (256 % ALFABET.length);
    const kantong = new Uint8Array(panjang);
    let hasil = "";

    while (hasil.length < panjang) {
        crypto.getRandomValues(kantong);
        for (const byte of kantong) {
            if (byte >= batas) continue;
            hasil += ALFABET[byte % ALFABET.length];
            if (hasil.length === panjang) break;
        }
    }

    return hasil;
}
