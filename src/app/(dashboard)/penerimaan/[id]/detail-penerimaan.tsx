import { BarisKeterangan } from "@/components/permintaan-parts";
import { tanggalPanjang } from "@/lib/permintaan";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export type ItemDetailPenerimaan = {
    id: string;
    nama_barang_snapshot: string;
    satuan_snapshot: string;
    jumlah: number;
    harga_satuan: number | null;
};

export type BarisDetailPenerimaan = {
    id: string;
    nomor: string;
    tanggal: string;
    no_dokumen: string | null;
    catatan: string | null;
    penerimaan_item: ItemDetailPenerimaan[];
};

const rupiah = (nilai: number): string =>
    `Rp${nilai.toLocaleString("id-ID")}`;

/**
 * Tidak ada tombol ubah atau hapus di layar ini, dan itu bukan pilihan
 * tampilan semata: migrasi 20260903010000 menolak UPDATE dan DELETE atas
 * dokumen yang barisnya sudah bermutasi, dan setiap penerimaan yang bisa
 * dibuka di sini sudah melewati catat_penerimaan() sejak disimpan. Layar
 * ini sekadar mengikuti kenyataan itu, bukan berpura-pura sebaliknya.
 */
export function DetailPenerimaan({
    penerimaan,
}: {
    penerimaan: BarisDetailPenerimaan;
}) {
    const total = penerimaan.penerimaan_item.reduce(
        (jumlah, item) =>
            jumlah + (item.harga_satuan ?? 0) * item.jumlah,
        0,
    );
    const adaHarga = penerimaan.penerimaan_item.some(
        (item) => item.harga_satuan !== null,
    );

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Link
                href="/penerimaan"
                className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ArrowLeft className="size-4" strokeWidth={1.6} />
                Penerimaan
            </Link>

            <header>
                <h2 className="font-mono text-base font-semibold text-foreground">
                    {penerimaan.nomor}
                </h2>
            </header>

            <dl className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
                <BarisKeterangan
                    label="Tanggal"
                    nilai={tanggalPanjang(penerimaan.tanggal)}
                />
                <BarisKeterangan
                    label="No Dokumen"
                    nilai={penerimaan.no_dokumen ?? "—"}
                />
                {penerimaan.catatan && (
                    <BarisKeterangan label="Catatan" nilai={penerimaan.catatan} />
                )}
            </dl>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Barang ({penerimaan.penerimaan_item.length})
                </h3>
                <ul className="divide-y divide-border">
                    {penerimaan.penerimaan_item.map((item) => (
                        <li
                            key={item.id}
                            className="flex items-center gap-3 px-4 py-3"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-medium text-foreground">
                                    {item.nama_barang_snapshot}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {item.jumlah} {item.satuan_snapshot}
                                </p>
                            </div>
                            {adaHarga && (
                                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                                    {item.harga_satuan !== null
                                        ? rupiah(item.harga_satuan)
                                        : "—"}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
                {adaHarga && (
                    <div className="flex items-center justify-between border-t border-border px-4 py-3">
                        <span className="text-[13px] font-medium text-foreground">
                            Total
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                            {rupiah(total)}
                        </span>
                    </div>
                )}
            </section>
        </div>
    );
}
