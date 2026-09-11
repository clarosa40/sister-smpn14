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
