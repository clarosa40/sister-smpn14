// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:stok-ekspor

import { keAoaEkspor } from "./stok-ekspor.ts";

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

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
