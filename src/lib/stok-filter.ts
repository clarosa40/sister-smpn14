/**
 * Fungsi murni di balik filter toolbar /stok - dipisah dari komponennya
 * supaya bisa diuji tanpa DOM atau instance TanStack Table.
 */

export function cocokTeks(nilai: string, kueri: string): boolean {
    return nilai.toLowerCase().includes(kueri.trim().toLowerCase());
}

export function cocokPilihan(nilai: string, pilihan: string): boolean {
    return nilai === pilihan;
}

export function dalamRentangStok(
    stok: number,
    min: number | undefined,
    max: number | undefined,
): boolean {
    if (min !== undefined && stok < min) return false;
    if (max !== undefined && stok > max) return false;
    return true;
}
