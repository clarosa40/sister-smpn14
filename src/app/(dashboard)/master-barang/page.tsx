import { pastikanTataUsaha } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarangTabel, type BarisBarang } from "./barang-tabel";

export const metadata: Metadata = {
    title: "Master Barang — SIPB SMPN 14",
};

const PER_HALAMAN = 25;

/**
 * PostgREST menerima .or() sebagai satu string filter, bukan nilai
 * berparameter: koma memisahkan cabang dan tanda kurung mengelompokkannya.
 * Kata kunci mentah karena itu bisa merusak seluruh ekspresinya - pencarian
 * "HVS, A4" terbaca sebagai cabang ketiga yang tidak sah, dan permintaannya
 * gagal alih-alih menghasilkan nol baris.
 *
 * Nilainya dikutip ganda supaya koma dan kurung di dalamnya ikut terbawa apa
 * adanya, sementara joker ilike dibuang supaya "50%" mencari "50", bukan
 * mencocokkan segalanya.
 */
const siapkanKataKunci = (kata: string): string =>
    kata
        .replace(/[%_]/g, "")
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

/** `hal` dihilangkan di halaman pertama supaya alamatnya tetap bersih. */
const alamatDaftar = (cari: string, halaman = 1): string => {
    const parameter = new URLSearchParams();
    if (cari) parameter.set("cari", cari);
    if (halaman > 1) parameter.set("hal", String(halaman));
    const kueri = parameter.toString();
    return kueri ? `/master-barang?${kueri}` : "/master-barang";
};

export default async function MasterBarangPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string; hal?: string }>;
}) {
    await pastikanTataUsaha();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();
    const halaman = Math.max(
        1,
        Number.parseInt(parameter.hal ?? "1", 10) || 1,
    );
    const dari = (halaman - 1) * PER_HALAMAN;

    const supabase = await createClient();

    let kueri = supabase
        .from("barang")
        .select("id, kode, nama, satuan", { count: "exact" });

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `kode.ilike."%${kataKunci}%",nama.ilike."%${kataKunci}%"`,
        );
    }

    const [daftar, semuaSatuan] = await Promise.all([
        kueri.order("kode").range(dari, dari + PER_HALAMAN - 1),
        // Satuan yang sudah dipakai, untuk melengkapi isian dialog. Satu kolom
        // teks pendek, jadi memuatnya utuh lebih murah daripada view baru.
        supabase.from("barang").select("satuan").limit(1000),
    ]);

    // PostgREST menjawab rentang yang mulai di luar jumlah baris dengan 416,
    // bukan dengan daftar kosong. Itu keadaan yang wajar - tautan lama, penanda
    // buku, atau baris terakhir sebuah halaman yang baru saja dihapus - jadi
    // pengguna dipulangkan ke halaman pertama, bukan disuguhi pesan kerusakan.
    if (daftar.error?.code === "PGRST103" && halaman > 1) {
        redirect(alamatDaftar(cari));
    }

    if (daftar.error) {
        console.error("[master barang]", daftar.error.code, daftar.error.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar barang gagal dimuat. Muat ulang halamannya sebentar lagi.
            </p>
        );
    }

    const satuan = [
        ...new Set((semuaSatuan.data ?? []).map((b) => b.satuan)),
    ].sort((a, b) => a.localeCompare(b, "id"));

    const total = daftar.count ?? 0;
    const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
            <BarangTabel
                baris={(daftar.data ?? []) as BarisBarang[]}
                cari={cari}
                satuan={satuan}
            />

            {total > 0 && (
                <Paginasi
                    cari={cari}
                    halaman={halaman}
                    jumlahHalaman={jumlahHalaman}
                    dari={dari}
                    ditampilkan={daftar.data?.length ?? 0}
                    total={total}
                />
            )}
        </div>
    );
}

function Paginasi({
    cari,
    halaman,
    jumlahHalaman,
    dari,
    ditampilkan,
    total,
}: {
    cari: string;
    halaman: number;
    jumlahHalaman: number;
    dari: number;
    ditampilkan: number;
    total: number;
}) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
                Menampilkan {dari + 1}–{dari + ditampilkan} dari {total} barang
            </p>

            {jumlahHalaman > 1 && (
                <div className="flex shrink-0 items-center gap-1.5">
                    <TautanHalaman
                        href={alamatDaftar(cari, halaman - 1)}
                        aktif={halaman > 1}
                    >
                        Sebelumnya
                    </TautanHalaman>
                    <span className="px-1 tabular-nums">
                        {halaman} / {jumlahHalaman}
                    </span>
                    <TautanHalaman
                        href={alamatDaftar(cari, halaman + 1)}
                        aktif={halaman < jumlahHalaman}
                    >
                        Berikutnya
                    </TautanHalaman>
                </div>
            )}
        </div>
    );
}

function TautanHalaman({
    href,
    aktif,
    children,
}: {
    href: string;
    aktif: boolean;
    children: React.ReactNode;
}) {
    const kelas =
        "rounded-md border border-border px-2.5 py-1.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

    // Batas daftar disajikan sebagai teks mati, bukan tautan yang tidak
    // menuju ke mana-mana: pembaca layar ikut tahu tombolnya memang habis.
    if (!aktif) {
        return (
            <span
                aria-disabled
                className={cn(kelas, "opacity-40")}
            >
                {children}
            </span>
        );
    }

    return (
        <Link href={href} scroll={false} className={cn(kelas, "hover:bg-muted hover:text-foreground")}>
            {children}
        </Link>
    );
}
