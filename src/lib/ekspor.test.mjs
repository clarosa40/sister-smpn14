// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:ekspor

import { keAoaEkspor, namaBerkasEkspor } from "./ekspor.ts";

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

console.log("\n— keAoaEkspor —");

const kolom = [
    { header: "Kode", nilai: (b) => b.kode },
    { header: "Nama Barang", nilai: (b) => b.nama },
    { header: "Stok", nilai: (b) => b.stok },
];

const baris = [
    { kode: "B001", nama: "Kertas A4", stok: 12 },
    { kode: "B002", nama: "Spidol", stok: 0 },
];

const aoa = keAoaEkspor(baris, kolom);

ok(
    "baris pertama adalah header",
    JSON.stringify(aoa[0]) === JSON.stringify(["Kode", "Nama Barang", "Stok"]),
    JSON.stringify(aoa[0]),
);
ok(
    "baris data mengikuti urutan kolom",
    JSON.stringify(aoa[1]) === JSON.stringify(["B001", "Kertas A4", 12]),
    JSON.stringify(aoa[1]),
);
ok(
    "seluruh baris data ikut, urutan dipertahankan",
    JSON.stringify(aoa[2]) === JSON.stringify(["B002", "Spidol", 0]),
    JSON.stringify(aoa[2]),
);
ok("jumlah baris = header + data", aoa.length === baris.length + 1);

ok(
    "baris kosong menghasilkan cuma header",
    JSON.stringify(keAoaEkspor([], kolom)) ===
        JSON.stringify([["Kode", "Nama Barang", "Stok"]]),
);

ok(
    "nilai() dipakai, bukan properti mentah - status bisa diterjemahkan",
    JSON.stringify(
        keAoaEkspor(
            [{ status: "kosong" }],
            [{ header: "Status", nilai: (b) => (b.status === "kosong" ? "Kosong" : "Tersedia") }],
        )[1],
    ) === JSON.stringify(["Kosong"]),
);

console.log("\n— namaBerkasEkspor —");

const HARI_INI = "2026-09-11";

ok(
    "dari dan sampai keduanya diisi",
    namaBerkasEkspor({
        prefix: "penerimaan",
        dari: "2026-09-01",
        sampai: "2026-09-30",
        hariIni: HARI_INI,
    }) === "penerimaan-2026-09-01-sd-2026-09-30.xlsx",
);
ok(
    "cuma sampai diisi",
    namaBerkasEkspor({
        prefix: "penerimaan",
        dari: "",
        sampai: "2026-09-30",
        hariIni: HARI_INI,
    }) === "penerimaan-sd-2026-09-30.xlsx",
);
ok(
    "cuma dari diisi",
    namaBerkasEkspor({
        prefix: "penerimaan",
        dari: "2026-09-01",
        sampai: "",
        hariIni: HARI_INI,
    }) === "penerimaan-2026-09-01-dst.xlsx",
);
ok(
    "keduanya kosong jatuh ke hari ini, bukan jam saat fungsi berjalan",
    namaBerkasEkspor({
        prefix: "penerimaan",
        dari: "",
        sampai: "",
        hariIni: HARI_INI,
    }) === "penerimaan-semua-2026-09-11.xlsx",
);
ok(
    "status terisi disisipkan setelah prefix",
    namaBerkasEkspor({
        prefix: "permintaan",
        status: "selesai",
        dari: "2026-09-01",
        sampai: "2026-09-30",
        hariIni: HARI_INI,
    }) === "permintaan-selesai-2026-09-01-sd-2026-09-30.xlsx",
);
ok(
    "status kosong (Semua) tidak menyisipkan apa pun",
    namaBerkasEkspor({
        prefix: "permintaan",
        dari: "2026-09-01",
        sampai: "2026-09-30",
        hariIni: HARI_INI,
    }) === "permintaan-2026-09-01-sd-2026-09-30.xlsx",
);
ok(
    "dua rentang berbeda pada hari ekspor yang sama menghasilkan nama berbeda",
    namaBerkasEkspor({
        prefix: "penerimaan",
        dari: "2026-09-01",
        sampai: "2026-09-15",
        hariIni: HARI_INI,
    }) !==
        namaBerkasEkspor({
            prefix: "penerimaan",
            dari: "2026-09-16",
            sampai: "2026-09-30",
            hariIni: HARI_INI,
        }),
);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
