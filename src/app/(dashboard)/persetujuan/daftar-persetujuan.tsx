import { Pencarian } from "@/components/admin/pencarian";
import { LencanaStatus } from "@/components/permintaan-parts";
import { tanggalPanjang, type StatusPermintaan } from "@/lib/permintaan";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type BarisPersetujuan = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    diajukan_at: string | null;
    pemohon: { nama_lengkap: string } | null;
    unit_kerja: { nama: string } | null;
    permintaan_item: { id: string }[];
};

const JALUR_ANTREAN = "/persetujuan";
const JALUR_RIWAYAT = "/persetujuan?lihat=riwayat";

/**
 * Tanpa "use client", dan tabnya sepasang <Link> biasa - bukan state.
 * Alasannya sama dengan alasan Pencarian menulis kata kuncinya ke URL:
 * datanya tetap dipegang server, jadi tidak ada salinan di peramban yang
 * bisa basi, dan tampilan yang sedang dibuka bisa ditautkan apa adanya.
 */
export function DaftarPersetujuan({
    baris,
    riwayat,
    cari,
}: {
    baris: BarisPersetujuan[];
    riwayat: boolean;
    cari: string;
}) {
    const kosong = !riwayat
        ? "Tidak ada permintaan yang menunggu persetujuan. Semuanya sudah diputuskan."
        : cari
          ? `Tidak ada permintaan yang cocok dengan “${cari}”.`
          : "Belum ada permintaan yang sudah diputuskan.";

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
                <nav
                    aria-label="Tampilan permintaan"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1"
                >
                    <TautanLihat href={JALUR_ANTREAN} aktif={!riwayat}>
                        Menunggu
                    </TautanLihat>
                    <TautanLihat href={JALUR_RIWAYAT} aktif={riwayat}>
                        Riwayat
                    </TautanLihat>
                </nav>

                {/* Nama pemohon sengaja di luar jangkauan kotak ini: filter
                    PostgREST atas tabel tersemat menyaring tersematnya, bukan
                    baris induknya, jadi mencari nama akan mengosongkan kolom
                    pemohon alih-alih menyisihkan barisnya. Placeholder-nya
                    karena itu hanya menjanjikan yang benar-benar bisa. */}
                {riwayat && (
                    <Pencarian
                        awal={cari}
                        jalur={JALUR_RIWAYAT}
                        placeholder="Cari nomor atau keperluan"
                        ariaLabel="Cari permintaan"
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
                        <BarisAntrean key={p.id} permintaan={p} />
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

/** Satu baris, dipakai kedua tampilan - yang membedakan hanya isinya. */
function BarisAntrean({ permintaan }: { permintaan: BarisPersetujuan }) {
    const orang = [permintaan.pemohon?.nama_lengkap, permintaan.unit_kerja?.nama]
        .filter(Boolean)
        .join(" · ");

    return (
        <li>
            <Link
                href={`/persetujuan/${permintaan.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-foreground">
                            {permintaan.nomor ?? "Tanpa nomor"}
                        </span>
                        <LencanaStatus status={permintaan.status} />
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
                        {permintaan.permintaan_item.length} barang
                        {permintaan.diajukan_at &&
                            ` · diajukan ${tanggalPanjang(permintaan.diajukan_at)}`}
                        {permintaan.tanggal_dibutuhkan &&
                            ` · dibutuhkan ${tanggalPanjang(permintaan.tanggal_dibutuhkan)}`}
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
