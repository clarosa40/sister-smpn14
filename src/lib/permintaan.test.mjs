// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:permintaan

import {
    periksaTanggalPermintaan,
    periksaTanggalDibutuhkan,
    barisEksporPermintaan,
} from "./permintaan.ts";

let lolos = 0;
let gagal = 0;

const ok = (label, syarat, extra = "") => {
    if (syarat) {
        lolos++;
        console.log(`  ok    ${label}`);
    } else {
        gagal++;
        console.log(`  FAIL  ${label} ${extra}`);
    }
};

// Dipatok, bukan tanggalHariIni(): pengujian ini tidak boleh bergantung
// pada hari ia dijalankan.
const HARI_INI = "2026-09-15";

const diterima = (tanggal) => periksaTanggalPermintaan(tanggal, HARI_INI).ok;

console.log("\n— periksaTanggalPermintaan —");

ok("hari ini diterima", diterima(HARI_INI));
ok("tiga puluh hari ke belakang diterima", diterima("2026-08-16"));
ok(
    "tiga puluh satu hari ke belakang ditolak",
    !diterima("2026-08-15"),
    JSON.stringify(periksaTanggalPermintaan("2026-08-15", HARI_INI)),
);
ok(
    "besok ditolak",
    !diterima("2026-09-16"),
    JSON.stringify(periksaTanggalPermintaan("2026-09-16", HARI_INI)),
);

console.log("\n— periksaTanggalDibutuhkan —");

const TANGGAL_PERMINTAAN = "2026-09-10";

ok(
    "sama dengan tanggal permintaan diterima",
    periksaTanggalDibutuhkan(TANGGAL_PERMINTAAN, TANGGAL_PERMINTAAN).ok,
);
ok(
    "sehari sebelum tanggal permintaan ditolak",
    !periksaTanggalDibutuhkan("2026-09-09", TANGGAL_PERMINTAAN).ok,
    JSON.stringify(periksaTanggalDibutuhkan("2026-09-09", TANGGAL_PERMINTAAN)),
);
ok("kosong diterima", periksaTanggalDibutuhkan("", TANGGAL_PERMINTAAN).ok);

console.log("\n— barisEksporPermintaan —");

const dokumenPermintaan = (override = {}) => ({
    nomor: "SPB/2026/09/001",
    tanggal: "2026-09-01",
    diajukan_at: "2026-09-02T06:30:00+00:00",
    status: "selesai",
    alasan_tolak: null,
    keperluan: "Rapat wali murid",
    pemohon: { nama_lengkap: "Sari Wijaya" },
    unit_kerja: { nama: "Tata Usaha" },
    permintaan_item: [],
    ...override,
});

const itemPermintaan = (override = {}) => ({
    nama_barang_snapshot: "Kertas A4",
    satuan_snapshot: "Rim",
    jumlah_diminta: 3,
    barang: { kode: "B001" },
    ...override,
});

ok(
    "array kosong menghasilkan array kosong",
    barisEksporPermintaan([]).length === 0,
);

ok(
    "dokumen tanpa item tidak menyumbang baris",
    barisEksporPermintaan([dokumenPermintaan({ permintaan_item: [] })])
        .length === 0,
);

ok(
    "status selesai terbaca 'Selesai', bukan enum mentah",
    barisEksporPermintaan([
        dokumenPermintaan({
            status: "selesai",
            permintaan_item: [itemPermintaan()],
        }),
    ])[0].status === "Selesai",
);

ok(
    "status ditolak terbaca 'Ditolak', bukan enum mentah",
    barisEksporPermintaan([
        dokumenPermintaan({
            status: "ditolak",
            alasan_tolak: "Stok tidak mencukupi",
            permintaan_item: [itemPermintaan()],
        }),
    ])[0].status === "Ditolak",
);

ok(
    "alasan tolak kosong pada baris Selesai",
    barisEksporPermintaan([
        dokumenPermintaan({
            status: "selesai",
            alasan_tolak: null,
            permintaan_item: [itemPermintaan()],
        }),
    ])[0].alasanTolak === "",
);

ok(
    "alasan tolak terisi pada baris Ditolak",
    barisEksporPermintaan([
        dokumenPermintaan({
            status: "ditolak",
            alasan_tolak: "Stok tidak mencukupi",
            permintaan_item: [itemPermintaan()],
        }),
    ])[0].alasanTolak === "Stok tidak mencukupi",
);

{
    const baris = barisEksporPermintaan([
        dokumenPermintaan({
            nomor: null,
            pemohon: null,
            unit_kerja: null,
            permintaan_item: [itemPermintaan()],
        }),
    ])[0];
    ok("nomor null jadi string kosong, bukan null/undefined", baris.nomor === "");
    ok(
        "pemohon null jadi string kosong, bukan null/undefined",
        baris.pemohon === "",
    );
    ok(
        "unit kerja null jadi string kosong, bukan null/undefined",
        baris.unitKerja === "",
    );
}

ok(
    "kolom Status tetap ada dan sama di seluruh baris walau hanya satu status yang tersaring",
    barisEksporPermintaan([
        dokumenPermintaan({
            status: "selesai",
            permintaan_item: [itemPermintaan(), itemPermintaan()],
        }),
    ]).every((b) => b.status === "Selesai"),
);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
