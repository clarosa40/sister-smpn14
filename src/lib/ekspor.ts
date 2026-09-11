/**
 * Fungsi murni di balik ekspor Excel /stok, /penerimaan, dan
 * /permintaan-masuk - dipisah dari komponennya supaya bisa diuji tanpa DOM
 * atau instance TanStack Table / xlsx.
 */

export type KolomEkspor<T> = {
    header: string;
    nilai: (baris: T) => string | number;
};

/**
 * Ubah baris + definisi kolom jadi array-of-arrays (header lalu baris data),
 * bentuk yang diterima langsung oleh `xlsx.utils.aoa_to_sheet`.
 */
export function keAoaEkspor<T>(
    baris: T[],
    kolom: KolomEkspor<T>[],
): (string | number)[][] {
    return [
        kolom.map((k) => k.header),
        ...baris.map((b) => kolom.map((k) => k.nilai(b))),
    ];
}

/** Kembalian setiap server action ekspor: berkas jadi, atau kalimat galat. */
export type HasilEkspor =
    | { ok: true; base64: string; namaBerkas: string }
    | { ok: false; galat: string };

/**
 * Nama berkas disusun dari rentang tanggalnya, bukan dari hari ekspornya
 * dijalankan - dua ekspor rentang berbeda pada hari yang sama tidak boleh
 * tiban-timpa satu sama lain di folder Unduhan.
 *
 * `hariIni` diterima sebagai argumen, bukan dibaca dari jam, dengan alasan
 * yang sama seperti periksaTanggalPermintaan: pengujian tidak boleh
 * bergantung pada hari ia dijalankan.
 */
export function namaBerkasEkspor(opsi: {
    prefix: string;
    /** Sudah berupa kata (mis. "selesai"), bukan enum mentah. Kosong/undefined dilewati. */
    status?: string;
    dari: string;
    sampai: string;
    hariIni: string;
}): string {
    const rentang =
        opsi.dari && opsi.sampai
            ? `${opsi.dari}-sd-${opsi.sampai}`
            : opsi.sampai
              ? `sd-${opsi.sampai}`
              : opsi.dari
                ? `${opsi.dari}-dst`
                : `semua-${opsi.hariIni}`;

    return `${[opsi.prefix, opsi.status, rentang].filter(Boolean).join("-")}.xlsx`;
}
