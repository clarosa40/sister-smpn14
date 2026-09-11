import { LencanaStatus } from "@/components/permintaan-parts";
import {
    tanggalPanjang,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { AlatFilterRiwayat } from "./alat-filter-riwayat";

export type Tampilan = "siapkan" | "serahkan" | "riwayat";

/** Kosong berarti Semua status - sentinel Radix Select ditangani di AlatFilterRiwayat. */
export type StatusRiwayat = "" | "selesai" | "ditolak";

export type BarisPermintaanMasuk = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    tanggal: string | null;
    diajukan_at: string | null;
    siap_at: string | null;
    pemohon: { nama_lengkap: string } | null;
    unit_kerja: { nama: string } | null;
    permintaan_item: { id: string }[];
};

const JALUR: Record<Tampilan, string> = {
    siapkan: "/permintaan-masuk",
    serahkan: "/permintaan-masuk?lihat=serahkan",
    riwayat: "/permintaan-masuk?lihat=riwayat",
};

const KOSONG: Record<Tampilan, string> = {
    siapkan:
        "Tidak ada permintaan yang menunggu disiapkan. Semuanya sudah beres untuk hari ini.",
    serahkan:
        "Tidak ada permintaan yang menunggu diserahkan. Semuanya sudah beres untuk hari ini.",
    riwayat: "Belum ada permintaan yang pernah sampai ke antrean ini.",
};

/**
 * Server-rendered link tabs di belakang parameter kueri, persis
 * /persetujuan: server yang memegang keadaannya, jadi tidak ada salinan
 * di peramban yang bisa basi. Dua antrean tidak dicari dan tidak
 * dipaginasi - keduanya memang untuk dihabiskan, bukan ditumpuk.
 */
export function DaftarPermintaanMasuk({
    baris,
    tampilan,
    cari,
    dari,
    sampai,
    status,
}: {
    baris: BarisPermintaanMasuk[];
    tampilan: Tampilan;
    cari: string;
    dari: string;
    sampai: string;
    status: StatusRiwayat;
}) {
    const kosong =
        tampilan === "riwayat" && (cari || dari || sampai || status)
            ? "Tidak ada permintaan yang cocok dengan filter yang dipilih."
            : KOSONG[tampilan];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
                <nav
                    aria-label="Tampilan permintaan masuk"
                    className="flex w-fit shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1"
                >
                    <TautanLihat
                        href={JALUR.siapkan}
                        aktif={tampilan === "siapkan"}
                    >
                        Siapkan
                    </TautanLihat>
                    <TautanLihat
                        href={JALUR.serahkan}
                        aktif={tampilan === "serahkan"}
                    >
                        Serahkan
                    </TautanLihat>
                    <TautanLihat
                        href={JALUR.riwayat}
                        aktif={tampilan === "riwayat"}
                    >
                        Riwayat
                    </TautanLihat>
                </nav>

                {tampilan === "riwayat" && (
                    <AlatFilterRiwayat
                        cari={cari}
                        dari={dari}
                        sampai={sampai}
                        status={status}
                    />
                )}
            </div>

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {kosong}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((p) => (
                        <BarisAntrean key={p.id} permintaan={p} tampilan={tampilan} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function TautanLihat({
    href,
    aktif,
    children,
}: {
    href: string;
    aktif: boolean;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            scroll={false}
            aria-current={aktif ? "page" : undefined}
            className={cn(
                "rounded-md px-3 py-1.5 text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                aktif
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            {children}
        </Link>
    );
}

function BarisAntrean({
    permintaan,
    tampilan,
}: {
    permintaan: BarisPermintaanMasuk;
    tampilan: Tampilan;
}) {
    const orang = [
        permintaan.pemohon?.nama_lengkap,
        permintaan.unit_kerja?.nama,
    ]
        .filter(Boolean)
        .join(" · ");

    // Tanggal permintaan dan tanggal diajukan tampil berdampingan, selalu -
    // bahkan ketika keduanya sama tanggal - supaya pembaca yang tidak
    // pernah melihat keduanya berbeda tidak berhenti mencarinya pada hari
    // itu justru berbeda. "Siap" hanya menambah, bukan menggantikan,
    // sebab ia bercerita tentang kejadian lain: kapan barangnya selesai
    // disiapkan.
    const keterangan = [
        `${permintaan.permintaan_item.length} barang`,
        permintaan.tanggal && tanggalPanjang(permintaan.tanggal),
        permintaan.diajukan_at &&
            `diajukan ${tanggalPanjang(permintaan.diajukan_at)}`,
        tampilan === "serahkan" &&
            permintaan.siap_at &&
            `siap ${waktuSingkat(permintaan.siap_at)}`,
        tampilan !== "riwayat" &&
            permintaan.tanggal_dibutuhkan &&
            `dibutuhkan ${tanggalPanjang(permintaan.tanggal_dibutuhkan)}`,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <li>
            <Link
                href={`/permintaan-masuk/${permintaan.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-foreground">
                            {permintaan.nomor ?? "Tanpa nomor"}
                        </span>
                        {tampilan === "riwayat" && (
                            <LencanaStatus status={permintaan.status} />
                        )}
                    </div>
                    {orang && (
                        <p className="mt-1 truncate text-[13px] font-medium text-foreground">
                            {orang}
                        </p>
                    )}
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {permintaan.keperluan}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {keterangan}
                    </p>
                </div>
                <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.6}
                />
            </Link>
        </li>
    );
}
