"use client";

import { setelJumlah } from "@/app/(dashboard)/katalog/actions";
import { Penyetel } from "@/app/(dashboard)/katalog/katalog-daftar";
import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { FormAlert } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import {
    kalimatLog,
    PANJANG_CATATAN,
    PANJANG_KEPERLUAN,
    tanggalHariIni,
    tanggalPanjang,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { LencanaStatus } from "../daftar-permintaan";
import {
    ajukanPermintaan,
    batalkanPermintaan,
    kosongkanKeranjang,
} from "../actions";

export type ItemDetail = {
    id: string;
    barang_id: string;
    nama_barang_snapshot: string;
    satuan_snapshot: string;
    jumlah_diminta: number;
};

export type BarisLog = {
    id: string;
    status_ke: StatusPermintaan;
    created_at: string;
};

export type BarisDetail = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    catatan_pemohon: string | null;
    alasan_tolak: string | null;
    created_at: string;
    diajukan_at: string | null;
    permintaan_item: ItemDetail[];
};

export function DetailPermintaan({
    permintaan,
    log,
}: {
    permintaan: BarisDetail;
    log: BarisLog[];
}) {
    const router = useRouter();

    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();
    const [ajukan, setAjukan] = React.useState(false);
    const [kosongkan, setKosongkan] = React.useState(false);
    const [batalkan, setBatalkan] = React.useState(false);

    const draft = permintaan.status === "draft";

    const setel = (item: ItemDetail, jumlah: number) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await setelJumlah(
                permintaan.id,
                item.barang_id,
                jumlah,
            );
            if (!hasil.ok) {
                setGalat(hasil.galat);
                return;
            }
            // Barang terakhir yang keluar membawa serta keranjangnya, jadi
            // halaman ini baru saja berhenti ada.
            if (hasil.kosong) router.replace("/permintaan-saya");
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Link
                href="/permintaan-saya"
                className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ArrowLeft className="size-4" strokeWidth={1.6} />
                Permintaan Saya
            </Link>

            <header className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-mono text-base font-semibold text-foreground">
                    {permintaan.nomor ?? "Keranjang"}
                </h2>
                <LencanaStatus status={permintaan.status} />
            </header>

            {galat && <FormAlert>{galat}</FormAlert>}

            {permintaan.status === "ditolak" && permintaan.alasan_tolak && (
                <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3.5">
                    <p className="text-[13px] font-medium text-destructive">
                        Alasan penolakan
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-destructive">
                        {permintaan.alasan_tolak}
                    </p>
                </div>
            )}

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Barang ({permintaan.permintaan_item.length})
                </h3>

                {permintaan.permintaan_item.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Keranjang ini kosong.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {permintaan.permintaan_item.map((item) => (
                            <li
                                key={item.id}
                                className="flex items-center gap-3 px-4 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-medium text-foreground">
                                        {item.nama_barang_snapshot}
                                    </p>
                                    {!draft && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {item.jumlah_diminta}{" "}
                                            {item.satuan_snapshot}
                                        </p>
                                    )}
                                </div>

                                {draft ? (
                                    <>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {item.satuan_snapshot}
                                        </span>
                                        <Penyetel
                                            nama={item.nama_barang_snapshot}
                                            jumlah={item.jumlah_diminta}
                                            menunggu={menunggu}
                                            onUbah={(n) => setel(item, n)}
                                        />
                                        {/* Jalur keluar independen dari stepper: barang
                                            yang stoknya habis setelah masuk keranjang
                                            menolak setiap UPDATE dari tombol +/-
                                            (trigger siapkan_permintaan_item mengecek
                                            stok pada UPDATE juga), jadi jumlah tidak
                                            pernah bisa diturunkan sampai 0 lewat
                                            stepper. Tombol ini memanggil setel(item, 0)
                                            langsung, yang berujung DELETE - tidak
                                            pernah digerbangi trigger tersebut. */}
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            disabled={menunggu}
                                            onClick={() => setel(item, 0)}
                                            aria-label={`Keluarkan ${item.nama_barang_snapshot} dari keranjang`}
                                        >
                                            <Trash2
                                                className="text-muted-foreground"
                                                strokeWidth={1.6}
                                            />
                                        </Button>
                                    </>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {draft ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" className="h-9.5">
                        <Link href="/katalog">
                            <Plus />
                            Tambah Barang
                        </Link>
                    </Button>
                    <Button
                        className="h-9.5"
                        disabled={permintaan.permintaan_item.length === 0}
                        onClick={() => setAjukan(true)}
                    >
                        <Send />
                        Ajukan Permintaan
                    </Button>
                    <Button
                        variant="ghost"
                        className="ml-auto h-9.5 text-muted-foreground"
                        onClick={() => setKosongkan(true)}
                    >
                        <Trash2 strokeWidth={1.6} />
                        Kosongkan
                    </Button>
                </div>
            ) : (
                <Keterangan permintaan={permintaan} />
            )}

            {permintaan.status === "diajukan" && (
                <Button
                    variant="outline"
                    className="h-9.5 w-fit text-destructive"
                    onClick={() => setBatalkan(true)}
                >
                    Batalkan Permintaan
                </Button>
            )}

            {!draft && (
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                        Riwayat
                    </h3>
                    {/* Disebutkan menurut status, bukan menurut orang: policy
                        baca_profil hanya membuka baris sendiri, jadi nama
                        penyetujunya memang tidak terjangkau dari sini. */}
                    <ol className="divide-y divide-border">
                        {log.map((l) => (
                            <li
                                key={l.id}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3"
                            >
                                <span className="text-[13px] text-foreground">
                                    {kalimatLog(l.status_ke)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {waktuSingkat(l.created_at)}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <DialogForm
                key={ajukan ? "ajukan" : "ajukan-tertutup"}
                terbuka={ajukan}
                onTerbukaBerubah={setAjukan}
                judul="Ajukan Permintaan"
                keterangan="Setelah diajukan, daftar barangnya tidak bisa diubah lagi - permintaan dilayani utuh atau tidak sama sekali."
                aksi={ajukanPermintaan.bind(null, permintaan.id)}
                labelSimpan="Ajukan"
                labelMenyimpan="Mengajukan"
            >
                <BidangDialog
                    id="keperluan"
                    label="Keperluan"
                    defaultValue={permintaan.keperluan}
                    placeholder="Praktikum kelas 8 semester ganjil"
                    petunjuk="Dibaca tata usaha saat menimbang persetujuan."
                    required
                    autoFocus
                    maxLength={PANJANG_KEPERLUAN}
                />
                <BidangDialog
                    id="tanggal_dibutuhkan"
                    label="Tanggal Dibutuhkan (opsional)"
                    type="date"
                    min={tanggalHariIni()}
                    defaultValue={permintaan.tanggal_dibutuhkan ?? ""}
                />
                <BidangDialog
                    id="catatan_pemohon"
                    label="Catatan (opsional)"
                    defaultValue={permintaan.catatan_pemohon ?? ""}
                    placeholder="Diambil sore hari"
                    maxLength={PANJANG_CATATAN}
                />
            </DialogForm>

            <DialogForm
                key={kosongkan ? "kosongkan" : "kosongkan-tertutup"}
                terbuka={kosongkan}
                onTerbukaBerubah={setKosongkan}
                judul="Kosongkan keranjang?"
                keterangan="Seluruh barang di keranjang ini dikeluarkan dan keranjangnya ikut hilang. Barangnya bisa ditambahkan lagi dari katalog."
                aksi={kosongkanKeranjang.bind(null, permintaan.id)}
                labelSimpan="Kosongkan"
                labelMenyimpan="Mengosongkan"
                merusak
            />

            <DialogForm
                key={batalkan ? "batalkan" : "batalkan-tertutup"}
                terbuka={batalkan}
                onTerbukaBerubah={setBatalkan}
                judul="Batalkan permintaan ini?"
                keterangan="Permintaan yang dibatalkan tidak bisa diajukan lagi. Buat permintaan baru dari katalog kalau masih dibutuhkan."
                aksi={batalkanPermintaan.bind(null, permintaan.id)}
                labelSimpan="Batalkan"
                labelMenyimpan="Membatalkan"
                merusak
            />
        </div>
    );
}

function Keterangan({ permintaan }: { permintaan: BarisDetail }) {
    return (
        <dl className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <Baris label="Keperluan" nilai={permintaan.keperluan} />
            <Baris
                label="Tanggal dibutuhkan"
                nilai={
                    permintaan.tanggal_dibutuhkan
                        ? tanggalPanjang(permintaan.tanggal_dibutuhkan)
                        : "Tidak ditentukan"
                }
            />
            <Baris
                label="Diajukan"
                nilai={
                    permintaan.diajukan_at
                        ? tanggalPanjang(permintaan.diajukan_at)
                        : "—"
                }
            />
            {permintaan.catatan_pemohon && (
                <Baris label="Catatan" nilai={permintaan.catatan_pemohon} />
            )}
        </dl>
    );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
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
