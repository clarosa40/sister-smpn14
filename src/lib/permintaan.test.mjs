// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:permintaan

import {
    periksaTanggalPermintaan,
    periksaTanggalDibutuhkan,
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

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
