"use server";

import { pastikanTataUsaha, siapkanKataKunci, teks, type HasilAksi } from "@/lib/aksi";
import { keAoaEkspor, namaBerkasEkspor, type HasilEkspor, type KolomEkspor } from "@/lib/ekspor";
import {
    MAKS_JUMLAH,
    PANJANG_CATATAN,
    PANJANG_NO_DOKUMEN,
    barisEksporPenerimaan,
    pesanGalatPenerimaan,
    type BarisEksporPenerimaan,
    type PenerimaanUntukEkspor,
} from "@/lib/penerimaan";
import { tanggalHariIni } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as XLSX from "xlsx";

const JALUR_DAFTAR = "/penerimaan";
const JALUR_STOK = "/stok";
const JALUR_BERANDA = "/beranda";

type BarisMentah = {
    barang_id?: unknown;
    jumlah?: unknown;
    harga_satuan?: unknown;
};

type BarisIsian = { barang_id: string; jumlah: number; harga_satuan: number | null };

const GALAT_BARIS_RUSAK =
    "Data barang tidak terbaca. Muat ulang halamannya dan coba lagi.";

/**
 * "baris" datang sebagai satu field JSON, bukan input[] berindeks: jumlah
 * barisnya berubah-ubah selagi operator menambah dan menghapus baris di
 * peramban, dan menyerialisasi satu array di satu field lebih sederhana
 * daripada menjaga penomoran nama field tetap benar di kedua sisi.
 */
function bacaBaris(formData: FormData): BarisIsian[] | string {
    const mentah = teks(formData, "baris");
    if (!mentah) return [];

    let larik: unknown;
    try {
        larik = JSON.parse(mentah);
    } catch {
        return GALAT_BARIS_RUSAK;
    }
    if (!Array.isArray(larik)) return GALAT_BARIS_RUSAK;

    const hasil: BarisIsian[] = [];

    for (const [i, baris] of (larik as BarisMentah[]).entries()) {
        const barangId =
            typeof baris?.barang_id === "string" ? baris.barang_id : "";
        if (!barangId) {
            return `Pilih barang untuk baris ke-${i + 1}, atau hapus barisnya.`;
        }

        const jumlah = Number(baris?.jumlah);
        if (!Number.isInteger(jumlah) || jumlah <= 0 || jumlah > MAKS_JUMLAH) {
            return `Jumlah pada baris ke-${i + 1} harus bilangan bulat antara 1 dan ${MAKS_JUMLAH}.`;
        }

        const hargaMentah = baris?.harga_satuan;
        let harga: number | null = null;
        if (hargaMentah !== null && hargaMentah !== undefined && hargaMentah !== "") {
            const angka = Number(hargaMentah);
            if (!Number.isFinite(angka) || angka < 0) {
                return `Harga satuan pada baris ke-${i + 1} tidak valid.`;
            }
            harga = angka;
        }

        hasil.push({ barang_id: barangId, jumlah, harga_satuan: harga });
    }

    return hasil;
}

/**
 * Mencatat satu dokumen penerimaan berikut barisnya, lalu langsung
 * memposkannya - tidak ada susun-lalu-terbitkan terpisah, sebab
 * penerimaan tidak punya kolom status yang bisa merepresentasikan dokumen
 * setengah jadi secara jujur.
 *
 * Tiga langkah berurutan (kepala, baris, lalu catat_penerimaan()) karena
 * baris butuh penerimaan_id yang baru terbit, dan catat_penerimaan()
 * butuh barisnya sudah ada. Kegagalan di langkah kedua atau ketiga
 * membuang kepala yang baru saja ditulis supaya tidak ada dokumen
 * setengah jadi yang tertinggal untuk membingungkan operator - trigger
 * pembekuan tidak menghalangi ini, sebab belum ada satu pun mutasi yang
 * terbit untuk kepala yang gagal.
 */
export async function catatPenerimaan(
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const tanggal = teks(formData, "tanggal") || tanggalHariIni();
    const noDokumen = teks(formData, "no_dokumen");
    const catatan = teks(formData, "catatan");

    if (noDokumen.length > PANJANG_NO_DOKUMEN) {
        return {
            ok: false,
            galat: `No dokumen terlalu panjang, maksimal ${PANJANG_NO_DOKUMEN} karakter.`,
        };
    }
    if (catatan.length > PANJANG_CATATAN) {
        return {
            ok: false,
            galat: `Catatan terlalu panjang, maksimal ${PANJANG_CATATAN} karakter.`,
        };
    }

    const baris = bacaBaris(formData);
    if (typeof baris === "string") return { ok: false, galat: baris };
    if (baris.length === 0) {
        return {
            ok: false,
            galat: "Dokumen belum punya barang. Tambahkan minimal satu baris.",
        };
    }

    const supabase = await createClient();

    const { data: kepala, error: errKepala } = await supabase
        .from("penerimaan")
        .insert({
            tanggal,
            no_dokumen: noDokumen || null,
            catatan: catatan || null,
        })
        .select("id")
        .single<{ id: string }>();

    if (errKepala) return { ok: false, galat: pesanGalatPenerimaan(errKepala) };
    if (!kepala) {
        return {
            ok: false,
            galat: "Dokumen gagal disimpan. Coba lagi sebentar lagi.",
        };
    }

    const { error: errBaris } = await supabase.from("penerimaan_item").insert(
        baris.map((b) => ({
            penerimaan_id: kepala.id,
            barang_id: b.barang_id,
            jumlah: b.jumlah,
            harga_satuan: b.harga_satuan,
        })),
    );

    if (errBaris) {
        await supabase.from("penerimaan").delete().eq("id", kepala.id);
        return { ok: false, galat: pesanGalatPenerimaan(errBaris) };
    }

    const { error: errPost } = await supabase.rpc("catat_penerimaan", {
        p_penerimaan_id: kepala.id,
    });

    if (errPost) {
        await supabase.from("penerimaan").delete().eq("id", kepala.id);
        return { ok: false, galat: pesanGalatPenerimaan(errPost) };
    }

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(JALUR_STOK);
    revalidatePath(JALUR_BERANDA);
    redirect(`${JALUR_DAFTAR}/${kepala.id}`);
}

const KOLOM_EKSPOR_PENERIMAAN: KolomEkspor<BarisEksporPenerimaan>[] = [
    { header: "Nomor", nilai: (b) => b.nomor },
    { header: "Tanggal", nilai: (b) => b.tanggal },
    { header: "No Dokumen", nilai: (b) => b.noDokumen },
    { header: "Kode", nilai: (b) => b.kode },
    { header: "Nama Barang", nilai: (b) => b.namaBarang },
    { header: "Satuan", nilai: (b) => b.satuan },
    { header: "Jumlah", nilai: (b) => b.jumlah },
    { header: "Harga Satuan", nilai: (b) => b.hargaSatuan },
    { header: "Total", nilai: (b) => b.total },
];

const GALAT_EKSPOR =
    "Data gagal diambil untuk diekspor. Coba lagi sebentar lagi.";

/**
 * Menjalankan ulang kueri daftar tanpa `.range()` supaya seluruh baris yang
 * cocok ikut, bukan cuma 25 yang tampil di peramban - lihat spec ekspor
 * penerimaan & permintaan untuk kenapa /stok tidak jadi contohnya di sini.
 */
export async function eksporPenerimaan(
    cari: string,
    dari: string,
    sampai: string,
): Promise<HasilEkspor> {
    await pastikanTataUsaha();

    const supabase = await createClient();

    let kueri = supabase.from("penerimaan").select(
        `nomor, tanggal, no_dokumen,
         penerimaan_item ( nama_barang_snapshot, satuan_snapshot, jumlah, harga_satuan, barang ( kode ) )`,
    );

    const kataKunci = siapkanKataKunci(cari.trim());
    if (kataKunci) {
        kueri = kueri.or(
            `nomor.ilike."%${kataKunci}%",no_dokumen.ilike."%${kataKunci}%"`,
        );
    }
    if (dari) kueri = kueri.gte("tanggal", dari);
    if (sampai) kueri = kueri.lte("tanggal", sampai);

    const { data, error } = await kueri.order("created_at", {
        ascending: false,
    });

    if (error) {
        console.error("[penerimaan] ekspor", error.code, error.message);
        return { ok: false, galat: GALAT_EKSPOR };
    }

    const baris = barisEksporPenerimaan(
        (data ?? []) as unknown as PenerimaanUntukEkspor[],
    );
    const aoa = keAoaEkspor(baris, KOLOM_EKSPOR_PENERIMAAN);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Penerimaan");
    const base64 = XLSX.write(wb, {
        type: "base64",
        bookType: "xlsx",
    }) as string;

    return {
        ok: true,
        base64,
        namaBerkas: namaBerkasEkspor({
            prefix: "penerimaan",
            dari,
            sampai,
            hariIni: tanggalHariIni(),
        }),
    };
}
