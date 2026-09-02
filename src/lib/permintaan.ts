import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/**
 * Perbendaharaan status permintaan dan kerja keranjang, satu kali untuk
 * empat layar: lencana di daftar, kepala halaman detail, garis waktu, dan
 * beranda.
 *
 * Berkas ini SENGAJA tidak diawali `import "server-only"`, tidak seperti
 * aksi.ts dan dal.ts: detail-permintaan.tsx adalah komponen klien dan
 * mengambil LABEL_STATUS dari sini. Itu pula sebabnya ambilDraft() dan
 * hapusDraftBilaKosong() menerima klien Supabase sebagai argumen alih-alih
 * membuatnya sendiri - mengimpor lib/supabase/server.ts akan menyeret
 * next/headers ke bundel peramban.
 */

/** Cermin enum public.status_permintaan (skema.sql:20-23). */
export type StatusPermintaan =
    | "draft"
    | "diajukan"
    | "disetujui"
    | "siap_diambil"
    | "selesai"
    | "ditolak"
    | "dibatalkan";

/**
 * "Keranjang", bukan "Draft": bagi pegawai, permintaan berstatus draft
 * memang keranjang belanja yang belum dikirim - dan itu satu-satunya
 * bentuk draft yang pernah dilihatnya.
 */
export const LABEL_STATUS: Record<StatusPermintaan, string> = {
    draft: "Keranjang",
    diajukan: "Menunggu persetujuan",
    disetujui: "Disetujui",
    siap_diambil: "Siap diambil",
    selesai: "Selesai",
    ditolak: "Ditolak",
    dibatalkan: "Dibatalkan",
};

/** Varian Badge yang tersedia; tidak ada nada "peringatan" di ui/badge.tsx. */
export type NadaStatus = "default" | "secondary" | "destructive" | "outline";

export const NADA_STATUS: Record<StatusPermintaan, NadaStatus> = {
    draft: "outline",
    diajukan: "secondary",
    disetujui: "secondary",
    siap_diambil: "default",
    selesai: "outline",
    ditolak: "destructive",
    dibatalkan: "outline",
};

/**
 * Kalimat garis waktu, disebutkan menurut status - bukan menurut orang.
 *
 * Policy baca_profil hanya membolehkan pegawai membaca barisnya sendiri,
 * jadi menyambung permintaan_log.oleh ke profil.nama_lengkap menghasilkan
 * null untuk siapa pun yang menyetujui. Itu batas yang disengaja, bukan
 * celah yang perlu ditambal dengan view baru: "Disetujui tata usaha" sudah
 * memberi tahu pemohon apa yang perlu ia tahu.
 */
const KALIMAT_LOG: Record<StatusPermintaan, string> = {
    draft: "Keranjang dibuat",
    diajukan: "Diajukan ke tata usaha",
    disetujui: "Disetujui tata usaha",
    siap_diambil: "Barang disiapkan pengurus barang",
    selesai: "Barang diserahkan",
    ditolak: "Ditolak tata usaha",
    dibatalkan: "Dibatalkan pemohon",
};

export const kalimatLog = (status: StatusPermintaan): string =>
    KALIMAT_LOG[status];

/**
 * Pelaku setiap status sebagai partisip telanjang, tanpa menyebut siapa.
 * Pasangannya kalimatLogBernama() yang menyambungnya dengan "oleh" dan
 * sebuah nama - dan sambungan itu terbaca benar untuk ketujuhnya:
 * "Keranjang dibuat oleh Sari Wijaya", "Ditolak oleh Budi Santoso".
 *
 * Ada dua catatan status di berkas ini, dan itu disengaja. KALIMAT_LOG
 * dipakai di layar pegawai, tempat nama penyetuju memang tidak
 * terjangkau (policy baca_profil). PELAKU_LOG dipakai di layar tata
 * usaha, tempat nama itu justru inti persoalannya: dengan dua akun tata
 * usaha, "Disetujui tata usaha" tidak menjawab apa pun.
 */
const PELAKU_LOG: Record<StatusPermintaan, string> = {
    draft: "Keranjang dibuat",
    diajukan: "Diajukan",
    disetujui: "Disetujui",
    siap_diambil: "Barang disiapkan",
    selesai: "Barang diserahkan",
    ditolak: "Ditolak",
    dibatalkan: "Dibatalkan",
};

/**
 * Nama kosong jatuh ke kalimatLog(), bukan ke "oleh —". Baris log yang
 * penulisnya sudah dihapus (permintaan_log.oleh adalah on delete set
 * null) karena itu tetap terbaca, dan kedua penyusun kalimat ini tidak
 * pernah bisa berselisih tentang baris yang sama.
 */
export const kalimatLogBernama = (
    status: StatusPermintaan,
    nama: string | null | undefined,
): string => (nama ? `${PELAKU_LOG[status]} oleh ${nama}` : kalimatLog(status));

/** Batas yang ditegakkan server; isian di layar hanya mencerminkannya. */
export const MAKS_JUMLAH = 999;
export const PANJANG_KEPERLUAN = 200;
export const PANJANG_CATATAN = 500;
export const PANJANG_ALASAN = 500;

export const GALAT_KERANJANG_HILANG =
    "Keranjang itu sudah tidak ada, atau isinya sudah berubah. Muat ulang halamannya.";

const GALAT_PINDAH_STATUS =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

// Kalimat yang sama dengan GALAT_UMUM di aksi.ts. Disalin, bukan diimpor:
// aksi.ts diawali `import "server-only"`, sedangkan berkas ini harus tetap
// bisa diimpor komponen klien yang menggambar lencana status.
const GALAT_UMUM = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";

export type BarisKeranjang = {
    barang_id: string;
    jumlah_diminta: number;
};

export type Draft = { id: string; item: BarisKeranjang[] };

type BarisDraft = { id: string; permintaan_item: BarisKeranjang[] };

/**
 * Keranjang yang sedang terbuka berikut isinya, dalam satu perjalanan ke
 * basis data - halaman katalog membutuhkan keduanya sekaligus.
 *
 * `.limit(1)` setelah urutan terbaru: tidak ada satu pun batasan di basis
 * data yang melarang dua draft sekaligus. Aplikasilah yang tidak pernah
 * membuka yang kedua; kalau dua tab pernah berlomba dan keduanya terlanjur
 * ada, yang terbaru yang dipakai - bukan galat.
 */
export async function ambilDraft(
    supabase: SupabaseClient,
    pemohonId: string,
): Promise<Draft | null> {
    const { data, error } = await supabase
        .from("permintaan")
        .select("id, permintaan_item ( barang_id, jumlah_diminta )")
        .eq("pemohon_id", pemohonId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<BarisDraft>();

    if (error) {
        console.error("[permintaan] draft", error.code, error.message);
        return null;
    }

    return data ? { id: data.id, item: data.permintaan_item ?? [] } : null;
}

/**
 * Keranjang yang kosong tidak meninggalkan bangkai: baris permintaannya
 * ikut dihapus. Itu yang membuat aturan "satu draft per pegawai" tetap
 * jujur, dan policy hapus_permintaan memang mengizinkan tepat itu.
 *
 * Mengembalikan true kalau draftnya benar-benar ikut terhapus - halaman
 * detail memakainya untuk memulangkan pembacanya ke daftar.
 */
export async function hapusDraftBilaKosong(
    supabase: SupabaseClient,
    permintaanId: string,
): Promise<boolean> {
    const { count, error } = await supabase
        .from("permintaan_item")
        .select("id", { count: "exact", head: true })
        .eq("permintaan_id", permintaanId);

    if (error || count !== 0) return false;

    const { data } = await supabase
        .from("permintaan")
        .delete()
        .eq("id", permintaanId)
        .eq("status", "draft")
        .select("id");

    return (data?.length ?? 0) > 0;
}

/** HasilAksi dengan satu kabar tambahan: keranjangnya ikut terhapus. */
export type HasilKeranjang =
    | { ok: true; kosong: boolean }
    | { ok: false; galat: string };

/**
 * Pasangan pesanGalatDb untuk galat yang datang dari alur permintaan.
 *
 * Bentuknya berbeda: hampir semuanya tiba sebagai P0001 dari trigger, dan
 * sudah ditulis sebagai kalimat untuk orang yang membacanya. "Spidol
 * whiteboard hitam sedang kosong dan belum bisa diminta" dan "Akun Anda
 * belum terhubung ke unit kerja" dikarang untuk seorang tata usaha
 * sekolah; menggantinya dengan kalimat umum justru membuang satu-satunya
 * bagian yang memberi tahu apa yang harus dilakukan.
 *
 * Dua kalimat yang memang untuk pengembang - "Transisi status % -> %
 * tidak diizinkan" (fungsi.sql:296) dan petunjuk siapkan_permintaan()
 * (fungsi.sql:334) - ditangkap lebih dulu lewat teksnya lalu diganti.
 */
export function pesanGalatPermintaan(galat: PostgrestError): string {
    switch (galat.code) {
        case "P0001":
            if (/tidak diizinkan|siapkan_permintaan\(\)/.test(galat.message)) {
                return GALAT_PINDAH_STATUS;
            }
            return galat.message;

        case "23505":
            return "Barang itu sudah ada di keranjang.";

        case "42501":
            return "Akun Anda tidak berhak mengubah permintaan ini.";

        default:
            console.error("[permintaan]", galat.code, galat.message);
            return GALAT_UMUM;
    }
}

const ZONA = "Asia/Jakarta";

/**
 * Tanggal hari ini di Jakarta, dalam bentuk YYYY-MM-DD - persis yang
 * diminta dan dikembalikan <input type="date">. Format pendek en-CA
 * memang ISO; menyusunnya dari getFullYear() dan kawan-kawan akan memakai
 * zona waktu server, bukan zona waktu sekolah.
 */
export const tanggalHariIni = (): string =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

/** "3 September 2026" - tanggal dibutuhkan dan tanggal pengajuan. */
export const tanggalPanjang = (nilai: string): string =>
    new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: ZONA,
    }).format(new Date(nilai));

/** "3 Sep 2026, 14.05" - garis waktu dan aktivitas terbaru. */
export const waktuSingkat = (nilai: string): string =>
    new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ZONA,
    }).format(new Date(nilai));
