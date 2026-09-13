import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Perbendaharaan kecil untuk alur penerimaan - pasangan lib/permintaan.ts.
 * Formatter tanggal dan jam Jakarta sengaja tidak disalin ke sini:
 * tanggalHariIni(), tanggalPanjang(), dan waktuSingkat() di
 * lib/permintaan.ts dipakai apa adanya, sebab ketiganya tidak spesifik
 * milik alur permintaan.
 */

export const PANJANG_NO_DOKUMEN = 60;
export const PANJANG_CATATAN = 500;

/** Batas kewajaran, bukan batas skema - kolomnya cuma integer > 0. */
export const MAKS_JUMLAH = 100000;

const GALAT_UMUM = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";

/**
 * Pasangan pesanGalatPermintaan untuk galat yang datang dari alur
 * penerimaan. P0001 sudah ditulis sebagai kalimat oleh trigger pembekuan
 * (20260903010000) untuk seorang tata usaha, jadi diteruskan apa
 * adanya - menggantinya dengan kalimat umum membuang satu-satunya bagian
 * yang menjelaskan kenapa.
 */
export function pesanGalatPenerimaan(galat: PostgrestError): string {
    switch (galat.code) {
        case "P0001":
            return galat.message;

        case "42501":
            return "Hanya tata usaha yang boleh mencatat penerimaan.";

        default:
            console.error("[penerimaan]", galat.code, galat.message);
            return GALAT_UMUM;
    }
}

/** Baris query penerimaan berikut item bersarangnya, seperlunya untuk ekspor. */
export type PenerimaanUntukEkspor = {
    nomor: string;
    tanggal: string;
    no_dokumen: string | null;
    penerimaan_item: {
        nama_barang_snapshot: string;
        satuan_snapshot: string;
        jumlah: number;
        harga_satuan: number | null;
        barang: { kode: string } | null;
    }[];
};

export type BarisEksporPenerimaan = {
    nomor: string;
    tanggal: string;
    noDokumen: string;
    kode: string;
    namaBarang: string;
    satuan: string;
    jumlah: number;
    hargaSatuan: number | "";
    total: number | "";
};

/**
 * Satu dokumen jadi satu baris per penerimaan_item, kepala dokumennya
 * diulang di tiap baris. Kode datang dari join ke barang (tidak pernah
 * disnapshot), sedangkan Nama Barang dan Satuan datang dari kolom snapshot
 * - kebenaran dokumen pada saat barang tiba, bukan master hari ini. Total
 * dan Harga Satuan kosong, bukan nol, saat harga_satuan belum diketahui.
 */
export function barisEksporPenerimaan(
    dokumen: PenerimaanUntukEkspor[],
): BarisEksporPenerimaan[] {
    const baris: BarisEksporPenerimaan[] = [];

    for (const d of dokumen) {
        for (const item of d.penerimaan_item) {
            baris.push({
                nomor: d.nomor,
                tanggal: d.tanggal,
                noDokumen: d.no_dokumen ?? "",
                kode: item.barang?.kode ?? "",
                namaBarang: item.nama_barang_snapshot,
                satuan: item.satuan_snapshot,
                jumlah: item.jumlah,
                hargaSatuan: item.harga_satuan ?? "",
                total:
                    item.harga_satuan === null
                        ? ""
                        : item.jumlah * item.harga_satuan,
            });
        }
    }

    return baris;
}
