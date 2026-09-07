"use client";

import {
    BidangDialog,
    BidangDialogBerdomain,
    DialogForm,
} from "@/components/admin/dialog-form";
import { Pencarian } from "@/components/admin/pencarian";
import { FormAlert } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { LABEL_PERAN } from "@/config/nav-items";
import type { Role } from "@/lib/dal";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { buatAkun, hapusAkun, setAktifAkun, setelUlangSandi, ubahAkun } from "./actions";
import { AkunDialog } from "./akun-dialog";

export type BarisPengguna = {
    id: string;
    nama_lengkap: string;
    role: Role;
    aktif: boolean;
    unit_kerja_id: string | null;
    unit_kerja: string | null;
    nama_pengguna: string;
    sandi_sementara: boolean;
};

export type OpsiUnit = { id: string; nama: string; aktif: boolean };

const PERAN: Role[] = ["pegawai", "pengurus_barang", "tata_usaha"];

export function PenggunaTabel({
    baris,
    unit,
    cari,
    idSaya,
}: {
    baris: BarisPengguna[];
    unit: OpsiUnit[];
    cari: string;
    /** Baris milik sendiri: tanpa sakelar, tanpa hapus, tanpa ganti peran. */
    idSaya: string;
}) {
    const [diubah, setDiubah] = React.useState<BarisPengguna | null>(null);
    const [dihapus, setDihapus] = React.useState<BarisPengguna | null>(null);
    const [tambah, setTambah] = React.useState(false);
    const [disetel, setDisetel] = React.useState<BarisPengguna | null>(null);

    // Sakelar aktif tidak punya dialog tempat menaruh pesan galatnya, jadi
    // pesannya naik ke sini - satu tempat di atas tabel, terbaca dari baris
    // mana pun kegagalannya datang.
    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();

    const ubahAktif = (akun: BarisPengguna, aktif: boolean) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await setAktifAkun(akun.id, aktif);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    // Unit yang aktif, ditambah unit milik baris yang sedang diubah walau
    // sudah dinonaktifkan - supaya menyimpan perubahan nama tidak diam-diam
    // memindahkan orangnya ke unit lain.
    const opsiUnit = (akun: BarisPengguna | null): OpsiUnit[] =>
        unit.filter((u) => u.aktif || u.id === akun?.unit_kerja_id);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
            <div className="flex items-center gap-2.5">
                <Pencarian
                    awal={cari}
                    jalur="/pengguna"
                    placeholder="Cari nama atau email"
                    ariaLabel="Cari pengguna"
                />
                <Button onClick={() => setTambah(true)} className="h-9.5 shrink-0">
                    <Plus />
                    <span className="hidden sm:inline">Tambah Akun</span>
                    <span className="sr-only sm:hidden">Tambah akun</span>
                </Button>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {cari
                        ? `Tidak ada akun yang cocok dengan “${cari}”.`
                        : "Belum ada akun."}
                </p>
            ) : (
                <>
                    {/* Ponsel: satu kartu per baris. Enam kolom tidak terbaca
                        di layar 375px. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {baris.map((akun) => (
                            <li
                                key={akun.id}
                                className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {akun.nama_lengkap}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {akun.nama_pengguna}
                                        </p>
                                    </div>
                                    <TombolBaris
                                        akun={akun}
                                        idSaya={idSaya}
                                        onUbah={setDiubah}
                                        onSetel={setDisetel}
                                        onHapus={setDihapus}
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline">
                                        {LABEL_PERAN[akun.role]}
                                    </Badge>
                                    <Badge variant="outline">
                                        {akun.unit_kerja ?? "Tanpa unit kerja"}
                                    </Badge>
                                    <LencanaStatus akun={akun} />
                                    <span className="ml-auto">
                                        <SakelarAktif
                                            akun={akun}
                                            idSaya={idSaya}
                                            menunggu={menunggu}
                                            onUbah={ubahAktif}
                                        />
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="px-5 text-xs text-muted-foreground">
                                        Nama
                                    </TableHead>
                                    <TableHead className="w-40 text-xs text-muted-foreground">
                                        Peran
                                    </TableHead>
                                    <TableHead className="w-44 text-xs text-muted-foreground">
                                        Unit Kerja
                                    </TableHead>
                                    <TableHead className="w-40 text-xs text-muted-foreground">
                                        Status
                                    </TableHead>
                                    <TableHead className="w-20 text-xs text-muted-foreground">
                                        Aktif
                                    </TableHead>
                                    <TableHead className="w-24 px-5 text-right text-xs text-muted-foreground">
                                        Tindakan
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {baris.map((akun) => (
                                    <TableRow key={akun.id}>
                                        <TableCell className="max-w-0 px-5 py-3">
                                            <p className="truncate text-[13px] font-medium text-foreground">
                                                {akun.nama_lengkap}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {akun.nama_pengguna}
                                            </p>
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] text-muted-foreground">
                                            {LABEL_PERAN[akun.role]}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] text-muted-foreground">
                                            {akun.unit_kerja ?? "—"}
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <LencanaStatus akun={akun} />
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <SakelarAktif
                                                akun={akun}
                                                idSaya={idSaya}
                                                menunggu={menunggu}
                                                onUbah={ubahAktif}
                                            />
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-right">
                                            <TombolBaris
                                                akun={akun}
                                                idSaya={idSaya}
                                                onUbah={setDiubah}
                                                onSetel={setDisetel}
                                                onHapus={setDihapus}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            <DialogForm
                key={diubah?.id}
                terbuka={diubah !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDiubah(null)}
                judul="Ubah Akun"
                keterangan="Alamat email tidak bisa diubah. Kalau alamatnya salah ketik dan akunnya belum punya riwayat permintaan, hapus lalu buat ulang."
                aksi={ubahAkun.bind(null, diubah?.id ?? "")}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <BidangDialog
                    id="nama_lengkap"
                    label="Nama Lengkap"
                    defaultValue={diubah?.nama_lengkap}
                    required
                    autoFocus
                    maxLength={120}
                />

                {diubah && diubah.id !== idSaya && (
                    <BidangPilih
                        id="role"
                        label="Peran"
                        defaultValue={diubah.role}
                        opsi={PERAN.map((p) => ({
                            nilai: p,
                            label: LABEL_PERAN[p],
                        }))}
                    />
                )}

                <BidangPilih
                    id="unit_kerja_id"
                    label="Unit Kerja"
                    defaultValue={diubah?.unit_kerja_id ?? undefined}
                    petunjuk="Wajib diisi. Pegawai tanpa unit kerja tertahan saat mengajukan permintaan pertamanya."
                    opsi={opsiUnit(diubah).map((u) => ({
                        nilai: u.id,
                        label: u.aktif ? u.nama : `${u.nama} (nonaktif)`,
                    }))}
                />
            </DialogForm>

            <DialogForm
                key={`hapus-${dihapus?.id}`}
                terbuka={dihapus !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDihapus(null)}
                judul={`Hapus ${dihapus?.nama_lengkap ?? ""}?`}
                keterangan="Akun yang sudah punya riwayat permintaan tidak bisa dihapus - nonaktifkan saja. Penghapusan tidak bisa dibatalkan."
                aksi={hapusAkun.bind(null, dihapus?.id ?? "")}
                labelSimpan="Hapus"
                labelMenyimpan="Menghapus"
                merusak
            />

            <AkunDialog
                key={tambah ? "tambah" : "tambah-tertutup"}
                terbuka={tambah}
                onTerbukaBerubah={setTambah}
                judul="Tambah Akun"
                keterangan="Akun langsung aktif dengan kata sandi sementara yang ditampilkan satu kali. Alamat email tidak bisa diubah setelah akun terbentuk."
                aksi={buatAkun}
                labelSimpan="Buat Akun"
                labelMenyimpan="Membuat"
                catatanSandi="Serahkan kata sandi ini kepada pemiliknya. Ia akan diminta menggantinya sendiri saat pertama kali masuk."
            >
                <BidangDialog
                    id="nama_lengkap"
                    label="Nama Lengkap"
                    placeholder="Sari Widyaningrum, S.Pd."
                    required
                    autoFocus
                    maxLength={120}
                />
                <BidangDialogBerdomain
                    id="email"
                    label="Alamat Email"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="guru.ipa"
                    required
                    petunjuk="Dipakai untuk masuk bersama @smpn14.local, dan tidak bisa diubah lagi setelah ini."
                />
                <BidangPilih
                    id="role"
                    label="Peran"
                    defaultValue="pegawai"
                    opsi={PERAN.map((p) => ({ nilai: p, label: LABEL_PERAN[p] }))}
                />
                <BidangPilih
                    id="unit_kerja_id"
                    label="Unit Kerja"
                    petunjuk="Wajib diisi. Pegawai tanpa unit kerja tertahan saat mengajukan permintaan pertamanya."
                    opsi={unit
                        .filter((u) => u.aktif)
                        .map((u) => ({ nilai: u.id, label: u.nama }))}
                />
            </AkunDialog>

            <AkunDialog
                key={`setel-${disetel?.id}`}
                terbuka={disetel !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDisetel(null)}
                judul={`Setel ulang sandi ${disetel?.nama_lengkap ?? ""}?`}
                keterangan="Kata sandi lamanya langsung tidak berlaku, dan pemiliknya diminta membuat kata sandi baru saat masuk berikutnya."
                aksi={setelUlangSandi.bind(null, disetel?.id ?? "")}
                labelSimpan="Setel Ulang"
                labelMenyimpan="Menyetel"
                catatanSandi="Serahkan kata sandi ini kepada pemiliknya. Kata sandi lamanya sudah tidak berlaku."
            />
        </div>
    );
}

function LencanaStatus({ akun }: { akun: BarisPengguna }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <Badge
                variant={akun.aktif ? "secondary" : "outline"}
                className={akun.aktif ? "" : "text-muted-foreground"}
            >
                {akun.aktif ? "Aktif" : "Nonaktif"}
            </Badge>
            {akun.sandi_sementara && (
                <Badge variant="outline" className="text-muted-foreground">
                    Sandi sementara
                </Badge>
            )}
        </span>
    );
}

function SakelarAktif({
    akun,
    idSaya,
    menunggu,
    onUbah,
}: {
    akun: BarisPengguna;
    idSaya: string;
    menunggu: boolean;
    onUbah: (akun: BarisPengguna, aktif: boolean) => void;
}) {
    // Baris sendiri tidak punya sakelar sama sekali. Aksinya tetap memeriksa
    // ulang di server - halaman yang merender sebuah kontrol bukan bukti apa pun.
    if (akun.id === idSaya) {
        return <span className="text-xs text-muted-foreground">Anda</span>;
    }

    return (
        <Switch
            checked={akun.aktif}
            disabled={menunggu}
            onCheckedChange={(aktif) => onUbah(akun, aktif)}
            aria-label={`${akun.aktif ? "Nonaktifkan" : "Aktifkan"} ${akun.nama_lengkap}`}
        />
    );
}

function TombolBaris({
    akun,
    idSaya,
    onUbah,
    onSetel,
    onHapus,
}: {
    akun: BarisPengguna;
    idSaya: string;
    onUbah: (akun: BarisPengguna) => void;
    onSetel: (akun: BarisPengguna) => void;
    onHapus: (akun: BarisPengguna) => void;
}) {
    return (
        <div className="flex shrink-0 items-center justify-end gap-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onUbah(akun)}
                aria-label={`Ubah ${akun.nama_lengkap}`}
            >
                <Pencil className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            {akun.id !== idSaya && (
                <>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSetel(akun)}
                        aria-label={`Setel ulang sandi ${akun.nama_lengkap}`}
                    >
                        <KeyRound
                            className="text-muted-foreground"
                            strokeWidth={1.6}
                        />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onHapus(akun)}
                        aria-label={`Hapus ${akun.nama_lengkap}`}
                    >
                        <Trash2
                            className="text-muted-foreground"
                            strokeWidth={1.6}
                        />
                    </Button>
                </>
            )}
        </div>
    );
}

/**
 * Pasangan BidangDialog untuk pilihan tertutup.
 *
 * Radix Select menitipkan nilainya pada satu <select> tersembunyi begitu
 * ia berada di dalam <form> dan diberi `name`, jadi FormData tetap terisi
 * tanpa input bayangan buatan sendiri.
 */
export function BidangPilih({
    id,
    label,
    opsi,
    defaultValue,
    petunjuk,
}: {
    id: string;
    label: string;
    opsi: { nilai: string; label: string }[];
    defaultValue?: string;
    petunjuk?: string;
}) {
    const [nilai, setNilai] = React.useState(defaultValue ?? "");

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-[13px]">
                {label}
            </Label>
            <Select name={id} value={nilai} onValueChange={setNilai}>
                <SelectTrigger id={id}>
                    <SelectValue placeholder="Pilih salah satu" />
                </SelectTrigger>
                <SelectContent>
                    {opsi.map((o) => (
                        <SelectItem key={o.nilai} value={o.nilai}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {petunjuk && (
                <p className="text-xs text-muted-foreground">{petunjuk}</p>
            )}
        </div>
    );
}
