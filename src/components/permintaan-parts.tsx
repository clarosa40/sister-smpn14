import { Badge } from "@/components/ui/badge";
import {
    LABEL_STATUS,
    NADA_STATUS,
    type StatusPermintaan,
} from "@/lib/permintaan";

/**
 * Potongan tampilan permintaan yang dipakai dua peran. Keduanya lahir di
 * halaman pegawai dan pindah ke sini begitu halaman persetujuan ikut
 * memakainya - halaman tata usaha yang mengimpor dari halaman pegawai
 * akan jadi ketergantungan yang salah arah.
 *
 * Sengaja tanpa "use client". Tidak ada hook di sini, jadi komponen
 * server bisa memakainya tanpa mengirim JavaScript apa pun, sementara
 * komponen klien yang mengimpornya tetap membundelnya seperti biasa.
 */

export function LencanaStatus({ status }: { status: StatusPermintaan }) {
    const nada = NADA_STATUS[status];
    return (
        <Badge
            variant={nada}
            className={nada === "outline" ? "text-muted-foreground" : ""}
        >
            {LABEL_STATUS[status]}
        </Badge>
    );
}

/** Satu baris <dt>/<dd> di kartu keterangan permintaan. */
export function BarisKeterangan({
    label,
    nilai,
}: {
    label: string;
    nilai: string;
}) {
    return (
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground sm:w-40 sm:text-[13px]">
                {label}
            </dt>
            <dd className="text-[13px] leading-relaxed text-foreground">
                {nilai}
            </dd>
        </div>
    );
}
