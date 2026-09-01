import { getUserOrRedirect, type Role } from "@/lib/dal";
import {
    kalimatLog,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Beranda — SIPB SMPN 14",
};

// Angka pegawai terisi di sub-proyek 4. Angka tata usaha menyusul bersama
// halaman persetujuan di sub-proyek 5, angka pengurus barang bersama stok
// dan penerimaan di sub-proyek 6. Label dan tata letaknya sudah terpasang
// supaya kerangka ini yang tinggal diisi, bukan dirombak.
const RINGKASAN: Record<Role, string[]> = {
    pegawai: ["Permintaan Aktif", "Menunggu Persetujuan", "Siap Diambil"],
    tata_usaha: [
        "Menunggu Persetujuan",
        "Disetujui Bulan Ini",
        "Total Pengguna",
    ],
    pengurus_barang: [
        "Barang Kosong",
        "Siap Disiapkan",
        "Penerimaan Bulan Ini",
    ],
};

/** Permintaan yang masih berjalan - belum selesai, ditolak, atau dibatalkan. */
const AKTIF: StatusPermintaan[] = [
    "draft",
    "diajukan",
    "disetujui",
    "siap_diambil",
];

const WAKTU_JAKARTA = "Asia/Jakarta";

type Aktivitas = {
    id: string;
    status_ke: StatusPermintaan;
    created_at: string;
    permintaan: { nomor: string | null } | null;
};

const sapaan = (jam: number) => {
    if (jam < 11) return "Selamat pagi";
    if (jam < 15) return "Selamat siang";
    if (jam < 18) return "Selamat sore";
    return "Selamat malam";
};

/**
 * Satu select status untuk ketiga angka, dihitung di JavaScript. Tiga
 * count(head: true) akan jadi tiga perjalanan ke Supabase demi tiga angka
 * yang muat dalam satu jawaban.
 *
 * Log tidak perlu disaring per pemohon: policy baca_permintaan_log hanya
 * membuka log yang induknya boleh dibaca, dan fungsi ini hanya dipanggil
 * untuk peran pegawai.
 */
async function ringkasanPegawai(userId: string) {
    const supabase = await createClient();

    const [status, aktivitas] = await Promise.all([
        supabase.from("permintaan").select("status").eq("pemohon_id", userId),
        supabase
            .from("permintaan_log")
            .select("id, status_ke, created_at, permintaan ( nomor )")
            .order("created_at", { ascending: false })
            .limit(5),
    ]);

    if (status.error) {
        console.error("[beranda]", status.error.code, status.error.message);
    }

    const daftar = (status.data ?? []).map(
        (r) => r.status as StatusPermintaan,
    );

    return {
        angka: [
            daftar.filter((s) => AKTIF.includes(s)).length,
            daftar.filter((s) => s === "diajukan").length,
            daftar.filter((s) => s === "siap_diambil").length,
        ],
        aktivitas: (aktivitas.data ?? []) as unknown as Aktivitas[],
    };
}

export default async function BerandaPage() {
    // Sudah dibungkus cache(), jadi pemanggilan kedua dalam render pass yang
    // sama ini tidak menambah perjalanan ke Supabase.
    const user = await getUserOrRedirect();

    const ringkasan =
        user.role === "pegawai" ? await ringkasanPegawai(user.id) : null;

    const sekarang = new Date();
    const jam = Number(
        new Intl.DateTimeFormat("id-ID", {
            hour: "numeric",
            hour12: false,
            timeZone: WAKTU_JAKARTA,
        }).format(sekarang),
    );
    const tanggal = new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: WAKTU_JAKARTA,
    }).format(sekarang);

    const namaDepan = user.namaLengkap.split(" ")[0];

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-5 md:gap-6">
            <header>
                <h2 className="text-[17px] font-semibold text-foreground md:text-lg">
                    {sapaan(jam)}, {namaDepan}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground md:text-[13px]">
                    {tanggal}
                </p>
            </header>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                {RINGKASAN[user.role].map((label, i) => {
                    const nilai = ringkasan?.angka[i] ?? null;
                    return (
                        <div
                            key={label}
                            className={cn(
                                "rounded-xl border border-border bg-card p-4 md:p-5",
                                i === 0 && "col-span-2 md:col-span-1",
                            )}
                        >
                            <p className="text-[11px] font-medium text-muted-foreground md:text-xs">
                                {label}
                            </p>
                            <p
                                className={cn(
                                    "mt-1.5 text-2xl font-bold md:mt-2 md:text-[28px]",
                                    nilai === null
                                        ? "text-muted-foreground/50"
                                        : "text-foreground",
                                )}
                            >
                                {nilai === null ? <>&mdash;</> : nilai}
                            </p>
                        </div>
                    );
                })}
            </div>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
                    Aktivitas Terbaru
                </h3>

                {ringkasan === null ? (
                    <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Belum ada aktivitas.
                        <br />
                        Riwayat permintaan dan penerimaan muncul di sini begitu
                        modulnya aktif.
                    </p>
                ) : ringkasan.aktivitas.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Belum ada aktivitas.
                        <br />
                        Riwayat permintaan Anda muncul di sini begitu keranjang
                        pertama dibuat.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {ringkasan.aktivitas.map((a) => (
                            <li
                                key={a.id}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-3"
                            >
                                <p className="text-[13px] text-foreground">
                                    {a.permintaan?.nomor && (
                                        <span className="font-mono">
                                            {a.permintaan.nomor} &middot;{" "}
                                        </span>
                                    )}
                                    {kalimatLog(a.status_ke)}
                                </p>
                                <span className="text-xs text-muted-foreground">
                                    {waktuSingkat(a.created_at)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
