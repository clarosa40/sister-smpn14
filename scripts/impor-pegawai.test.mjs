import { periksaBaris, petakanKolom } from "./impor-pegawai.mjs";

let pass = 0,
    fail = 0;

const ok = (label, cond, extra = "") => {
    if (cond) {
        pass++;
        console.log(`  ok    ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label} ${extra}`);
    }
};

const UNIT = new Map([
    ["tata usaha", "u-tu"],
    ["kepala sekolah", "u-kepsek"],
    ["guru", "u-guru"],
    ["sarana prasarana", "u-sarpras"],
]);

const jalan = (baris, sudahAda = new Set()) =>
    periksaBaris(baris, petakanKolom(Object.keys(baris[0])), UNIT, sudahAda);

console.log("\npetakanKolom - judul bebas urutan dan huruf besar");
{
    const peta = petakanKolom(["Peran", "NAMA LENGKAP", "Username", " Unit Kerja "]);
    ok("nama", peta.nama === "NAMA LENGKAP");
    ok("unit", peta.unit === " Unit Kerja ");
    ok("role", peta.role === "Peran");
    ok("user", peta.user === "Username");
}

console.log("\nbaris sehat");
{
    const { siap, galat } = jalan([
        { Nama: "Siti Aminah", "Unit Kerja": "Guru", Peran: "guru", Username: "siti.aminah" },
        { Nama: "Budi", "Unit Kerja": "Tata Usaha", Peran: "TU", Username: "budi" },
        { Nama: "Rina", "Unit Kerja": "Sarana Prasarana", Peran: "Sarpras", Username: "rina" },
    ]);
    ok("tanpa galat", galat.length === 0, JSON.stringify(galat));
    ok("tiga siap", siap.length === 3);
    ok("guru -> pegawai", siap[0].role === "pegawai");
    ok("TU -> tata_usaha", siap[1].role === "tata_usaha");
    ok("Sarpras -> pengurus_barang", siap[2].role === "pengurus_barang");
    ok("alamat dirangkai", siap[0].email === "siti.aminah@smpn14.local", siap[0].email);
    ok("unit jadi id", siap[2].unitId === "u-sarpras");
}

console.log("\nnama bergelar - koma dan titik di dalam nama");
{
    const { siap, galat } = jalan([
        { Nama: "Eny Minarni, M.Pd.", "Unit Kerja": "Kepala Sekolah", Peran: "guru", Username: "eny.minarni" },
    ]);
    ok("diterima", galat.length === 0, JSON.stringify(galat));
    ok("nama utuh dengan gelarnya", siap[0]?.nama === "Eny Minarni, M.Pd.", siap[0]?.nama);
    ok("guru -> pegawai", siap[0]?.role === "pegawai");
    ok("username berisi titik sah", siap[0]?.email === "eny.minarni@smpn14.local", siap[0]?.email);
}

console.log("\nusername sudah berupa alamat lengkap");
{
    const { siap, galat } = jalan([
        { Nama: "Ani", "Unit Kerja": "Guru", Peran: "guru", Username: "ani@smpn14.local" },
    ]);
    ok("diterima", galat.length === 0, JSON.stringify(galat));
    ok("tidak dobel domain", siap[0]?.email === "ani@smpn14.local", siap[0]?.email);
}

console.log("\nyang harus ditolak");
{
    const kasus = [
        ["nama kosong", { Nama: "", "Unit Kerja": "Guru", Peran: "guru", Username: "a" }],
        ["nama 121 karakter", { Nama: "x".repeat(121), "Unit Kerja": "Guru", Peran: "guru", Username: "a" }],
        ["username huruf besar/spasi", { Nama: "A", "Unit Kerja": "Guru", Peran: "guru", Username: "Budi Santoso" }],
        ["username titik ganda", { Nama: "A", "Unit Kerja": "Guru", Peran: "guru", Username: "guru..ipa" }],
        ["peran ngaco", { Nama: "A", "Unit Kerja": "Guru", Peran: "kepsek", Username: "a" }],
        ["unit tidak ada", { Nama: "A", "Unit Kerja": "Perpustakaan", Peran: "guru", Username: "a" }],
    ];
    for (const [label, baris] of kasus) {
        const { siap, galat } = jalan([baris]);
        ok(label, galat.length === 1 && siap.length === 0, JSON.stringify(galat));
    }
}

console.log("\ndomain asing ditulis ulang, bukan ditolak");
{
    const { siap, galat } = jalan([
        { Nama: "Budi", "Unit Kerja": "Guru", Peran: "guru", Username: "budi@gmail.com" },
    ]);
    ok("diterima", galat.length === 0, JSON.stringify(galat));
    ok("jadi domain sekolah", siap[0]?.email === "budi@smpn14.local", siap[0]?.email);
}

console.log("\ntabrakan akibat penulisan ulang tetap tertangkap");
{
    const { siap, galat } = jalan([
        { Nama: "Budi A", "Unit Kerja": "Guru", Peran: "guru", Username: "budi@gmail.com" },
        { Nama: "Budi B", "Unit Kerja": "Guru", Peran: "guru", Username: "budi@yahoo.com" },
    ]);
    ok("yang kedua ditolak", galat.length === 1 && siap.length === 1, JSON.stringify(galat));
    ok("pesannya menyebut dua kali", galat[0]?.includes("dua kali"), galat[0]);
}

console.log("\nduplikat di dalam berkas");
{
    const { galat, siap } = jalan([
        { Nama: "Ani", "Unit Kerja": "Guru", Peran: "guru", Username: "ani" },
        { Nama: "Ani Lain", "Unit Kerja": "Guru", Peran: "guru", Username: "ANI" },
    ]);
    ok("yang kedua ditolak", galat.length === 1 && siap.length === 1, JSON.stringify(galat));
    ok("pesannya menyebut dua kali", galat[0]?.includes("dua kali"), galat[0]);
}

console.log("\nakun yang sudah ada dilewati, bukan digagalkan");
{
    const { siap, galat, lewat } = jalan(
        [
            { Nama: "Ani", "Unit Kerja": "Guru", Peran: "guru", Username: "ani" },
            { Nama: "Budi", "Unit Kerja": "Guru", Peran: "guru", Username: "budi" },
        ],
        new Set(["ani@smpn14.local"]),
    );
    ok("tanpa galat", galat.length === 0, JSON.stringify(galat));
    ok("satu dilewati", lewat.length === 1 && lewat[0] === "ani@smpn14.local");
    ok("satu tersisa", siap.length === 1 && siap[0].email === "budi@smpn14.local");
}

console.log("\nnomor baris menunjuk baris Excel yang benar");
{
    const { galat } = jalan([
        { Nama: "Ani", "Unit Kerja": "Guru", Peran: "guru", Username: "ani" },
        { Nama: "Budi", "Unit Kerja": "Guru", Peran: "guru", Username: "budi" },
        { Nama: "", "Unit Kerja": "Guru", Peran: "guru", Username: "cici" },
    ]);
    ok("baris ke-4", galat[0]?.startsWith("baris 4:"), galat[0]);
}

console.log(`\n${pass} ok, ${fail} gagal`);
process.exit(fail ? 1 : 0);
