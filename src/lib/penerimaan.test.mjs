// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:penerimaan

import { barisEksporPenerimaan } from "./penerimaan.ts";

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

console.log("\n— barisEksporPenerimaan —");

const dokumen = (override = {}) => ({
    nomor: "TRM-000001",
    tanggal: "2026-09-01",
    no_dokumen: "INV-8841",
    penerimaan_item: [],
    ...override,
});

const item = (override = {}) => ({
    nama_barang_snapshot: "Kertas A4",
    satuan_snapshot: "Rim",
    jumlah: 5,
    harga_satuan: 50000,
    barang: { kode: "B001" },
    ...override,
});

ok("array kosong menghasilkan array kosong", barisEksporPenerimaan([]).length === 0);

ok(
    "dokumen tanpa item tidak menyumbang baris",
    barisEksporPenerimaan([dokumen({ penerimaan_item: [] })]).length === 0,
);

{
    const baris = barisEksporPenerimaan([
        dokumen({
            penerimaan_item: [
                item({ nama_barang_snapshot: "Kertas A4" }),
                item({ nama_barang_snapshot: "Spidol" }),
            ],
        }),
    ]);
    ok("satu dokumen dengan dua item menghasilkan dua baris", baris.length === 2);
    ok(
        "kepala dokumen identik di kedua baris",
        baris[0].nomor === baris[1].nomor &&
            baris[0].tanggal === baris[1].tanggal &&
            baris[0].noDokumen === baris[1].noDokumen,
    );
}

{
    const baris = barisEksporPenerimaan([
        dokumen({ nomor: "TRM-000001", penerimaan_item: [item()] }),
        dokumen({ nomor: "TRM-000002", penerimaan_item: [item()] }),
    ]);
    ok(
        "beberapa dokumen menghasilkan baris berurutan, dikelompokkan per dokumen",
        baris.map((b) => b.nomor).join(",") === "TRM-000001,TRM-000002",
    );
}

ok(
    "total = jumlah x harga_satuan saat harga ada",
    barisEksporPenerimaan([
        dokumen({ penerimaan_item: [item({ jumlah: 5, harga_satuan: 50000 })] }),
    ])[0].total === 250000,
);

ok(
    "total kosong (bukan 0), bukan null, saat harga_satuan null",
    barisEksporPenerimaan([
        dokumen({ penerimaan_item: [item({ harga_satuan: null })] }),
    ])[0].total === "",
);

ok(
    "hargaSatuan kosong (bukan 0), bukan null, saat harga_satuan null",
    barisEksporPenerimaan([
        dokumen({ penerimaan_item: [item({ harga_satuan: null })] }),
    ])[0].hargaSatuan === "",
);

ok(
    "noDokumen kosong saat no_dokumen null",
    barisEksporPenerimaan([
        dokumen({ no_dokumen: null, penerimaan_item: [item()] }),
    ])[0].noDokumen === "",
);

{
    // Kode ikut kode barang saat ini (join), Nama Barang dan Satuan ikut
    // snapshot dokumen - fixture di bawah membuat keduanya berselisih
    // supaya sumber yang benar terbukti menang.
    const baris = barisEksporPenerimaan([
        dokumen({
            penerimaan_item: [
                item({
                    nama_barang_snapshot: "Kertas A4 (nama lama)",
                    satuan_snapshot: "Rim",
                    barang: { kode: "B001-BARU" },
                }),
            ],
        }),
    ]);
    ok("kode datang dari join barang", baris[0].kode === "B001-BARU");
    ok(
        "nama barang datang dari snapshot, bukan master",
        baris[0].namaBarang === "Kertas A4 (nama lama)",
    );
    ok("satuan datang dari snapshot", baris[0].satuan === "Rim");
}

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
