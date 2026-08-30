// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:sandi

import { sandiSementara } from "./sandi.ts";

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

const CONTOH = Array.from({ length: 400 }, () => sandiSementara());

console.log("\n— sandi sementara —");

ok(
    "panjangnya 12 karakter",
    CONTOH.every((s) => s.length === 12),
    CONTOH.find((s) => s.length !== 12),
);

ok(
    "panjang bisa diminta lain",
    sandiSementara(20).length === 20,
    String(sandiSementara(20).length),
);

// 0/O/1/l/I dibuang: sandi ini dibacakan dari layar lalu diketik ulang.
const MEMBINGUNGKAN = /[0O1lI]/;
ok(
    "tidak pernah memuat 0, O, 1, l, atau I",
    CONTOH.every((s) => !MEMBINGUNGKAN.test(s)),
    CONTOH.find((s) => MEMBINGUNGKAN.test(s)),
);

const SAH = /^[A-HJ-NP-Za-km-z2-9]+$/;
ok(
    "seluruh karakternya berasal dari alfabet yang dimaksud",
    CONTOH.every((s) => SAH.test(s)),
    CONTOH.find((s) => !SAH.test(s)),
);

ok(
    "400 sandi berturut-turut semuanya berbeda",
    new Set(CONTOH).size === 400,
    `(${new Set(CONTOH).size} unik)`,
);

// Rejection sampling yang keliru batasnya membuang simbol-simbol
// terakhir alfabet tanpa suara. 4800 karakter membuat setiap simbol
// muncul ~84 kali; satu yang hilang berarti batasnya salah.
const terpakai = new Set(CONTOH.join(""));
ok(
    "seluruh 57 simbol alfabet pernah terpakai",
    terpakai.size === 57,
    `(${terpakai.size} simbol)`,
);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
