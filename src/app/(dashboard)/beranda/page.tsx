import { getUserOrRedirect, type Role } from "@/lib/dal";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Beranda — SIPB SMPN 14",
};

// Angka-angkanya baru ada setelah modul katalog, permintaan, dan stok dibangun
// di sub-proyek 2-4. Label dan tata letaknya dipasang sekarang supaya kerangka
// ini yang tinggal diisi, bukan dirombak.
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

const WAKTU_JAKARTA = "Asia/Jakarta";

const sapaan = (jam: number) => {
    if (jam < 11) return "Selamat pagi";
    if (jam < 15) return "Selamat siang";
    if (jam < 18) return "Selamat sore";
    return "Selamat malam";
};

export default async function BerandaPage() {
    // Sudah dibungkus cache(), jadi pemanggilan kedua dalam render pass yang
    // sama ini tidak menambah perjalanan ke Supabase.
    const user = await getUserOrRedirect();

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
                {RINGKASAN[user.role].map((label, i) => (
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
                        <p className="mt-1.5 text-2xl font-bold text-muted-foreground/50 md:mt-2 md:text-[28px]">
                            &mdash;
                        </p>
                    </div>
                ))}
            </div>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
                    Aktivitas Terbaru
                </h3>
                <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                    Belum ada aktivitas.
                    <br />
                    Riwayat permintaan dan penerimaan muncul di sini begitu
                    modulnya aktif.
                </p>
            </section>
        </div>
    );
}
