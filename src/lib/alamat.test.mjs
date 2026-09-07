// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:alamat

import {
    alamatDari,
    namaPenggunaDari,
    tanpaAkhiranDomain,
    DOMAIN_SEKOLAH,
} from "./alamat.ts";

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

const diterima = (nama) => alamatDari(nama).ok;
const alamatnya = (nama) => {
    const hasil = alamatDari(nama);
    return hasil.ok ? hasil.alamat : null;
};

console.log("\n— alamat —");

ok(
    "merangkai nama pengguna menjadi alamat lengkap",
    alamatnya("guru.ipa") === "guru.ipa@smpn14.local",
    JSON.stringify(alamatDari("guru.ipa")),
);

ok("domainnya smpn14.local", DOMAIN_SEKOLAH === "smpn14.local");

ok("separator di depan ditolak", !diterima(".guru"));
ok("separator di belakang ditolak", !diterima("guru."));
ok("dua separator berdampingan ditolak", !diterima("guru..ipa"));
ok("garis bawah di depan ditolak", !diterima("_guru"));
ok("garis di belakang ditolak", !diterima("guru-"));

ok(
    "huruf besar dan spasi pembungkus diterima setelah dirapikan",
    alamatnya(" Guru.IPA ") === "guru.ipa@smpn14.local",
    JSON.stringify(alamatDari(" Guru.IPA ")),
);

ok("spasi di tengah ditolak", !diterima("guru ipa"));
ok("karakter di luar himpunan ditolak", !diterima("guru#ipa"));

ok("separator titik diterima", diterima("guru.ipa"));
ok("separator garis diterima", diterima("guru-ipa"));
ok("separator garis bawah diterima", diterima("guru_ipa"));
ok("ketiga separator sekaligus diterima", diterima("guru.ipa-smp_a"));
ok("tanpa separator sama sekali diterima", diterima("guruipa"));

const PAS_64 = "a".repeat(64);
const LEBIH_65 = "a".repeat(65);
ok("64 karakter diterima", diterima(PAS_64));
ok("65 karakter ditolak", !diterima(LEBIH_65));
ok("string kosong ditolak", !diterima(""));
ok("string berisi spasi saja ditolak", !diterima("   "));

ok("nilai yang memuat @ ditolak", !diterima("guru.ipa@smpn14.local"));
ok(
    "nilai yang memuat @ tetap ditolak walau domainnya benar",
    !diterima(`guru.ipa@${DOMAIN_SEKOLAH}`),
);

ok(
    "namaPenggunaDari membalik alamatDari",
    namaPenggunaDari(alamatnya("guru.ipa")) === "guru.ipa",
);

console.log("\n— tanpaAkhiranDomain —");

ok(
    "alamat penuh berdomain benar dilepas akhirannya",
    tanpaAkhiranDomain("guru.ipa@smpn14.local") === "guru.ipa",
    tanpaAkhiranDomain("guru.ipa@smpn14.local"),
);
ok(
    "nama pengguna tanpa akhiran dibiarkan apa adanya",
    tanpaAkhiranDomain("guru.ipa") === "guru.ipa",
);
ok(
    "domain yang salah tidak ikut dilepas",
    tanpaAkhiranDomain("guru.ipa@gmail.com") === "guru.ipa@gmail.com",
);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
