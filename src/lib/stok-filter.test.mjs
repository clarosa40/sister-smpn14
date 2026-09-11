// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:stok-filter

import {
    cocokTeks,
    cocokPilihan,
    dalamRentangStok,
} from "./stok-filter.ts";

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

console.log("\n— cocokTeks —");

ok("substring cocok", cocokTeks("Kertas A4", "kertas"));
ok("tidak peka huruf besar/kecil", cocokTeks("KERTAS A4", "kertas a4"));
ok("substring di tengah cocok", cocokTeks("Kertas A4 80gsm", "a4"));
ok("tidak cocok ditolak", !cocokTeks("Kertas A4", "spidol"));
ok("kueri kosong selalu cocok", cocokTeks("Kertas A4", ""));
ok("spasi pembungkus kueri diabaikan", cocokTeks("Kertas A4", "  kertas  "));

console.log("\n— cocokPilihan —");

ok("nilai sama cocok", cocokPilihan("rim", "rim"));
ok("nilai beda ditolak", !cocokPilihan("rim", "botol"));
ok("peka huruf besar/kecil", !cocokPilihan("Rim", "rim"));

console.log("\n— dalamRentangStok —");

ok("tanpa batas selalu cocok", dalamRentangStok(50, undefined, undefined));
ok("di atas minimum cocok", dalamRentangStok(50, 10, undefined));
ok("di bawah minimum ditolak", !dalamRentangStok(5, 10, undefined));
ok("tepat di minimum cocok", dalamRentangStok(10, 10, undefined));
ok("di bawah maksimum cocok", dalamRentangStok(50, undefined, 100));
ok("di atas maksimum ditolak", !dalamRentangStok(150, undefined, 100));
ok("tepat di maksimum cocok", dalamRentangStok(100, undefined, 100));
ok("di dalam rentang cocok", dalamRentangStok(50, 10, 100));
ok("di luar rentang bawah ditolak", !dalamRentangStok(5, 10, 100));
ok("di luar rentang atas ditolak", !dalamRentangStok(150, 10, 100));
ok("stok nol tetap diperiksa terhadap minimum", !dalamRentangStok(0, 1, undefined));
ok("stok nol lolos minimum nol", dalamRentangStok(0, 0, undefined));
ok("maksimum nol menolak stok positif", !dalamRentangStok(5, undefined, 0));

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
