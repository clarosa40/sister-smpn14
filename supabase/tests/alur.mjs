import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { DOMAIN_SEKOLAH } from "../../src/lib/alamat.ts";

const MIG = new URL("../migrations/", import.meta.url);
const TU = "11111111-1111-1111-1111-111111111111"; // tata usaha
const PGR = "22222222-2222-2222-2222-222222222222"; // pengurus barang
const PGW = "33333333-3333-3333-3333-333333333333"; // pegawai

// Barang dicari lewat nama, bukan kode. Kode barang berasal dari
// Excel inventaris sekolah dan akan diganti seluruhnya saat data
// sungguhan masuk; tes tidak boleh ikut mati karenanya.
const SPIDOL = "Spidol whiteboard hitam";
const HVS = "Kertas HVS A4 70 gram";
const PEL = "Kain pel";
const PULPEN = "Pulpen tinta hitam";

const db = new PGlite();
let pass = 0,
    fail = 0;

// Hasil query dijadikan peta bernama supaya urutan baris tidak
// pernah jadi bagian dari yang diuji.
const petaNama = (rows) => Object.fromEntries(rows.map((r) => [r.nama, r]));

function ok(label, cond, extra = "") {
    if (cond) {
        pass++;
        console.log(`  ok    ${label}`);
    } else {
        fail++;
        console.log(`  FAIL  ${label} ${extra}`);
    }
}

async function expectError(label, fn, fragment) {
    try {
        await fn();
        fail++;
        console.log(`  FAIL  ${label} — tidak ada error sama sekali`);
    } catch (e) {
        const hit =
            !fragment ||
            e.message.toLowerCase().includes(fragment.toLowerCase());
        if (hit) {
            pass++;
            console.log(`  ok    ${label} — "${e.message.slice(0, 70)}"`);
        } else {
            fail++;
            console.log(`  FAIL  ${label} — error lain: ${e.message}`);
        }
    }
}

async function as(uid, fn) {
    await db.exec(
        `select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`,
    );
    try {
        return await fn();
    } finally {
        await db.exec(
            `reset role; select set_config('request.jwt.claim.sub', '', false);`,
        );
    }
}

// ---- setup -------------------------------------------------------
await db.exec(`
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
create role anon; create role authenticated; create role service_role;`);

for (const f of readdirSync(MIG)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(new URL(f, MIG), "utf8"));
}

await db.exec(`
insert into auth.users (id, email) values
  ('${TU}',  'tu@${DOMAIN_SEKOLAH}'),
  ('${PGR}', 'sarpras@${DOMAIN_SEKOLAH}'),
  ('${PGW}', 'guru.ipa@${DOMAIN_SEKOLAH}');
update public.profil set role = 'tata_usaha',
  unit_kerja_id = (select id from public.unit_kerja where nama = 'Tata Usaha')
  where id = '${TU}';
update public.profil set role = 'pengurus_barang',
  unit_kerja_id = (select id from public.unit_kerja where nama = 'Sarana Prasarana')
  where id = '${PGR}';
update public.profil set
  unit_kerja_id = (select id from public.unit_kerja where nama = 'Guru')
  where id = '${PGW}';`);

const cariBarang = async (nama) =>
    (await db.query(`select id from public.barang where nama = $1`, [nama]))
        .rows[0].id;

const spidol = await cariBarang(SPIDOL);
const hvs = await cariBarang(HVS);
const pel = await cariBarang(PEL);
const pulpen = await cariBarang(PULPEN);

console.log("\n— barang masuk —");
await as(TU, async () => {
    await expectError(
        "tata usaha tidak boleh mencatat penerimaan",
        () => db.query(`select public.catat_penerimaan(gen_random_uuid())`),
        "pengurus barang",
    );
});

let penerimaanId;
await as(PGR, async () => {
    await db.exec(`
    insert into public.penerimaan (no_dokumen)
    values ('INV-8841');
    insert into public.penerimaan_item (penerimaan_id, barang_id, jumlah, harga_satuan)
    select p.id, '${spidol}', 50, 8500 from public.penerimaan p order by p.created_at desc limit 1;
    insert into public.penerimaan_item (penerimaan_id, barang_id, jumlah, harga_satuan)
    select p.id, '${hvs}', 2, 55000 from public.penerimaan p order by p.created_at desc limit 1;`);

    const p = (
        await db.query(
            `select id, nomor, dibuat_oleh from public.penerimaan limit 1`,
        )
    ).rows[0];
    penerimaanId = p.id;
    ok(
        "nomor penerimaan global dari sequence",
        p.nomor === "TRM-000001",
        `(dapat ${p.nomor})`,
    );
    ok(
        "dibuat_oleh penerimaan terisi sendiri dari auth.uid()",
        p.dibuat_oleh === PGR,
        `(${p.dibuat_oleh})`,
    );

    const n = (
        await db.query(`select public.catat_penerimaan($1) as n`, [
            penerimaanId,
        ])
    ).rows[0].n;
    ok("catat_penerimaan menerbitkan 2 mutasi masuk", n === 2, `(${n})`);

    const ulang = (
        await db.query(`select public.catat_penerimaan($1) as n`, [
            penerimaanId,
        ])
    ).rows[0].n;
    ok(
        "catat_penerimaan idempoten — dijalankan dua kali tetap 0 baris baru",
        ulang === 0,
        `(${ulang})`,
    );

    const s = petaNama(
        (
            await db.query(
                `select nama, stok, status from public.stok_barang where nama = any($1)`,
                [[SPIDOL, HVS, PEL]],
            )
        ).rows,
    );
    ok(
        "stok spidol = 50 (agregasi mutasi)",
        s[SPIDOL].stok === 50 && s[SPIDOL].status === "tersedia",
        JSON.stringify(s[SPIDOL]),
    );
    ok("stok HVS = 2", s[HVS].stok === 2, JSON.stringify(s[HVS]));
    ok(
        "kain pel belum pernah diterima -> kosong",
        s[PEL].stok === 0 && s[PEL].status === "kosong",
        JSON.stringify(s[PEL]),
    );
});

console.log("\n— penerimaan tercatat beku —");
await as(PGR, async () => {
    await expectError(
        "kepala penerimaan yang sudah tercatat tidak bisa diubah",
        () =>
            db.exec(
                `update public.penerimaan set catatan = 'diubah diam-diam' where id = '${penerimaanId}'`,
            ),
        "sudah tercatat",
    );

    await expectError(
        "kepala penerimaan yang sudah tercatat tidak bisa dihapus",
        () => db.exec(`delete from public.penerimaan where id = '${penerimaanId}'`),
        "sudah tercatat",
    );

    const baris = (
        await db.query(
            `select id from public.penerimaan_item where penerimaan_id = '${penerimaanId}' and barang_id = '${spidol}'`,
        )
    ).rows[0];

    await expectError(
        "baris penerimaan yang sudah tercatat tidak bisa diubah",
        () =>
            db.exec(
                `update public.penerimaan_item set jumlah = 999 where id = '${baris.id}'`,
            ),
        "sudah tercatat",
    );

    await expectError(
        "baris penerimaan yang sudah tercatat tidak bisa dihapus",
        () => db.exec(`delete from public.penerimaan_item where id = '${baris.id}'`),
        "sudah tercatat",
    );

    // Pembekuan terikat pada terbitnya mutasi, bukan pada keberadaan
    // dokumennya - dokumen yang belum diposting lewat catat_penerimaan()
    // masih bebas disunting dan dihapus lagi, lalu dibersihkan supaya
    // tidak ikut terhitung bagian-bagian berikutnya.
    await db.exec(`
    insert into public.penerimaan (no_dokumen) values ('INV-BELUM-POSTING');
    insert into public.penerimaan_item (penerimaan_id, barang_id, jumlah)
    select p.id, '${pulpen}', 7 from public.penerimaan p where p.no_dokumen = 'INV-BELUM-POSTING';`);

    const belum = (
        await db.query(
            `select pi.id from public.penerimaan_item pi
             join public.penerimaan p on p.id = pi.penerimaan_id
             where p.no_dokumen = 'INV-BELUM-POSTING'`,
        )
    ).rows[0];

    const u = await db.query(
        `update public.penerimaan_item set jumlah = 9 where id = $1`,
        [belum.id],
    );
    ok(
        "baris penerimaan tanpa mutasi masih bisa diubah",
        u.affectedRows === 1,
        `(${u.affectedRows} baris)`,
    );

    const uh = await db.query(
        `update public.penerimaan set catatan = 'masih boleh' where no_dokumen = 'INV-BELUM-POSTING'`,
    );
    ok(
        "kepala penerimaan tanpa mutasi masih bisa diubah",
        uh.affectedRows === 1,
        `(${uh.affectedRows} baris)`,
    );

    await db.query(
        `delete from public.penerimaan_item where id = $1`,
        [belum.id],
    );
    const dh = await db.query(
        `delete from public.penerimaan where no_dokumen = 'INV-BELUM-POSTING'`,
    );
    ok(
        "kepala penerimaan tanpa mutasi masih bisa dihapus",
        dh.affectedRows === 1,
        `(${dh.affectedRows} baris)`,
    );

    // Policy tulis_mutasi sudah dicabut, dan INSERT yang ditolak RLS
    // muncul sebagai galat (tidak seperti UPDATE/DELETE yang menyaring
    // diam-diam) - satu-satunya pintu yang tersisa sekarang adalah
    // ketiga fungsi SECURITY DEFINER.
    await expectError(
        "pengurus barang tidak lagi bisa menulis mutasi langsung lewat API",
        () =>
            db.query(
                `insert into public.mutasi_stok (barang_id, jenis, jumlah, catatan)
                 values ('${spidol}', 'penyesuaian', 3, 'jalan pintas lewat API')`,
            ),
        "row-level security",
    );
});

console.log("\n— apa yang dilihat tiap peran —");
await as(TU, async () => {
    const s = (
        await db.query(`select count(*)::int as n from public.stok_barang`)
    ).rows[0];
    ok("tata usaha ikut melihat angka stok", s.n > 0, `(${s.n} baris)`);

    await expectError(
        "tata usaha tidak boleh menulis mutasi langsung",
        () =>
            db.exec(`insert into public.mutasi_stok (barang_id, jenis, jumlah, catatan)
                   values ('${spidol}', 'rusak_kadaluarsa', -1, 'coba-coba')`),
        "row-level security",
    );
});

await as(PGW, async () => {
    const k = petaNama(
        (
            await db.query(
                `select * from public.katalog_pemohon where nama = any($1)`,
                [[SPIDOL, PEL]],
            )
        ).rows,
    );
    ok("katalog: spidol tersedia", k[SPIDOL].tersedia === true);
    ok(
        "katalog: kain pel belum pernah diterima -> tersedia = false",
        k[PEL].tersedia === false,
    );
    ok(
        "katalog tidak punya kolom angka apa pun",
        !Object.keys(k[SPIDOL]).some((c) => /stok|jumlah/.test(c)),
        Object.keys(k[SPIDOL]).join(","),
    );

    const s = (await db.query(`select * from public.stok_barang`)).rows;
    ok(
        "pegawai membaca stok_barang -> 0 baris (bukan angka nol)",
        s.length === 0,
        `(${s.length} baris)`,
    );

    const m = (await db.query(`select * from public.mutasi_stok`)).rows;
    ok(
        "pegawai membaca mutasi_stok -> 0 baris",
        m.length === 0,
        `(${m.length} baris)`,
    );
});

console.log("\n— pengajuan —");
let permA, permB;
await as(PGW, async () => {
    await db.exec(
        `insert into public.permintaan (keperluan) values ('Praktikum kelas 8 semester ganjil');`,
    );
    const p = (
        await db.query(
            `select id, nomor, status, unit_kerja_id from public.permintaan order by created_at limit 1`,
        )
    ).rows[0];
    permA = p.id;
    ok("draft belum punya nomor", p.nomor === null && p.status === "draft");
    ok("unit_kerja terisi otomatis dari profil", p.unit_kerja_id !== null);

    await expectError(
        'barang berstok nol tidak bisa diminta — "disabled" ditegakkan database',
        () =>
            db.exec(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta) values ('${permA}', '${pel}', 1)`,
            ),
        "kosong",
    );

    await db.exec(`
    insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta) values
      ('${permA}', '${spidol}', 5),
      ('${permA}', '${hvs}', 2);`);
    const it = (
        await db.query(
            `select nama_barang_snapshot, satuan_snapshot from public.permintaan_item where barang_id = '${spidol}' and permintaan_id = '${permA}'`,
        )
    ).rows[0];
    ok(
        "snapshot nama/satuan dibekukan server",
        it.nama_barang_snapshot === "Spidol whiteboard hitam" &&
            it.satuan_snapshot === "pcs",
    );

    // Permintaan kedua disusun selagi stok masih utuh — nanti dipakai
    // membuktikan all-or-nothing setelah permintaan A menghabiskan HVS.
    await db.exec(`
    insert into public.permintaan (keperluan) values ('Administrasi wali kelas');`);
    permB = (
        await db.query(
            `select id from public.permintaan order by created_at desc limit 1`,
        )
    ).rows[0].id;
    await db.exec(`
    insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta) values
      ('${permB}', '${spidol}', 10),
      ('${permB}', '${hvs}', 2);`);

    await db.exec(
        `update public.permintaan set status = 'diajukan' where id in ('${permA}', '${permB}')`,
    );
    const q = (
        await db.query(
            `select nomor, diajukan_at from public.permintaan where id = '${permA}'`,
        )
    ).rows[0];
    ok(
        "nomor permintaan terbit saat diajukan",
        q.nomor === "SPB-000001" && q.diajukan_at !== null,
        q.nomor,
    );

    await expectError(
        "pegawai tidak bisa menyetujui permintaannya sendiri",
        () =>
            db.exec(
                `update public.permintaan set status = 'disetujui' where id = '${permA}'`,
            ),
        "tata usaha",
    );

    await expectError(
        "pegawai tidak bisa menaikkan perannya sendiri",
        () =>
            db.exec(
                `update public.profil set role = 'tata_usaha' where id = '${PGW}'`,
            ),
        "tata usaha",
    );
});

console.log("\n— persetujuan tata usaha —");
await as(PGR, async () => {
    await expectError(
        "pengurus barang tidak boleh menyetujui",
        () =>
            db.exec(
                `update public.permintaan set status = 'disetujui' where id = '${permA}'`,
            ),
        "tata usaha",
    );

    await expectError(
        "penyiapan ditolak selama belum disetujui",
        () => db.query(`select public.siapkan_permintaan($1)`, [permA]),
        "menunggu persetujuan",
    );
});

await as(TU, async () => {
    await expectError(
        "penolakan wajib menyertakan alasan",
        () =>
            db.exec(
                `update public.permintaan set status = 'ditolak' where id = '${permB}'`,
            ),
        "alasan_tolak_wajib",
    );

    await db.exec(
        `update public.permintaan set status = 'disetujui' where id in ('${permA}', '${permB}')`,
    );
    const p = (
        await db.query(
            `select status, disetujui_at, disetujui_oleh from public.permintaan where id = '${permA}'`,
        )
    ).rows[0];
    ok(
        "tata usaha menyetujui — jejaknya tercatat",
        p.status === "disetujui" &&
            p.disetujui_at !== null &&
            p.disetujui_oleh === TU,
    );

    await expectError(
        "tata usaha tidak boleh menyiapkan barang",
        () => db.query(`select public.siapkan_permintaan($1)`, [permA]),
        "pengurus barang",
    );
});

console.log("\n— penyiapan barang (all-or-nothing) —");
await as(PGR, async () => {
    const r = await db.query(
        `select (public.siapkan_permintaan($1)).status as status`,
        [permA],
    );
    ok(
        "siapkan_permintaan -> siap_diambil",
        r.rows[0].status === "siap_diambil",
        r.rows[0].status,
    );

    const s = petaNama(
        (
            await db.query(
                `select nama, stok from public.stok_barang where nama = any($1)`,
                [[SPIDOL, HVS]],
            )
        ).rows,
    );
    ok(
        "stok berkurang persis sebanyak jumlah_diminta (50-5=45)",
        s[SPIDOL].stok === 45,
        `(${s[SPIDOL].stok})`,
    );
    ok(
        "HVS habis terpakai permintaan A (2-2=0)",
        s[HVS].stok === 0,
        `(${s[HVS].stok})`,
    );

    // Permintaan B minta 10 spidol (cukup) dan 2 rim HVS (sudah habis).
    await expectError(
        "satu item kurang -> seluruh permintaan gagal disiapkan",
        () => db.query(`select public.siapkan_permintaan($1)`, [permB]),
        "tidak cukup",
    );

    const sisa = (
        await db.query(`select stok from public.stok_barang where nama = $1`, [
            SPIDOL,
        ])
    ).rows[0];
    ok(
        "spidol tidak ikut keluar walau stoknya cukup — all-or-nothing",
        sisa.stok === 45,
        `(${sisa.stok})`,
    );

    const mB = (
        await db.query(
            `
    select count(*)::int as n from public.mutasi_stok m
    join public.permintaan_item pi on pi.id = m.permintaan_item_id
    where pi.permintaan_id = $1`,
            [permB],
        )
    ).rows[0];
    ok(
        "tidak satu pun mutasi terbit untuk permintaan yang gagal",
        mB.n === 0,
        `(${mB.n})`,
    );

    const stB = (
        await db.query(`select status from public.permintaan where id = $1`, [
            permB,
        ])
    ).rows[0];
    ok(
        "permintaan gagal tetap disetujui, tidak otomatis ditolak",
        stB.status === "disetujui",
        stB.status,
    );

    await expectError(
        "status tidak bisa dilompatkan ke siap_diambil tanpa mengeluarkan stok",
        () =>
            db.exec(
                `update public.permintaan set status = 'siap_diambil' where id = '${permB}'`,
            ),
        "belum dikeluarkan dari stok",
    );
});

console.log("\n— penyerahan barang —");
await as(TU, async () => {
    await expectError(
        "tata usaha tidak boleh menyerahkan barang",
        () =>
            db.exec(
                `update public.permintaan set status = 'selesai' where id = '${permA}'`,
            ),
        "pengurus barang",
    );
});

await as(PGR, async () => {
    await db.exec(
        `update public.permintaan set status = 'selesai' where id = '${permA}'`,
    );
    const p = (
        await db.query(
            `select status, selesai_at, diserahkan_oleh from public.permintaan where id = '${permA}'`,
        )
    ).rows[0];
    ok(
        "pengurus barang menyerahkan — jejaknya tercatat",
        p.status === "selesai" &&
            p.selesai_at !== null &&
            p.diserahkan_oleh === PGR,
    );

    const log = (
        await db.query(
            `select status_ke from public.permintaan_log where permintaan_id = $1 order by created_at, status_ke`,
            [permA],
        )
    ).rows;
    ok(
        "log mencatat seluruh perpindahan status",
        log.length === 5,
        JSON.stringify(log.map((l) => l.status_ke)),
    );

    await expectError(
        "transisi melompat ditolak",
        () =>
            db.exec(
                `update public.permintaan set status = 'disetujui' where id = '${permA}'`,
            ),
        "tidak diizinkan",
    );
});

console.log("\n— penolakan dan pembatalan —");
await as(TU, async () => {
    await db.exec(`update public.permintaan set status = 'ditolak',
    alasan_tolak = 'Kertas HVS habis, diusulkan masuk pengadaan triwulan depan'
    where id = '${permB}'`);
    const p = (
        await db.query(
            `select status from public.permintaan where id = '${permB}'`,
        )
    ).rows[0];
    ok(
        "tata usaha menolak permintaan yang stoknya tak kunjung ada",
        p.status === "ditolak",
    );

    const log = (
        await db.query(
            `select catatan from public.permintaan_log where permintaan_id = $1 and status_ke = 'ditolak'`,
            [permB],
        )
    ).rows[0];
    ok(
        "alasan penolakan ikut masuk log",
        /HVS habis/.test(log.catatan),
        log.catatan,
    );
});

let permC;
await as(PGW, async () => {
    await db.exec(
        `insert into public.permintaan (keperluan) values ('Salah input, mau dibatalkan');`,
    );
    permC = (
        await db.query(
            `select id from public.permintaan order by created_at desc limit 1`,
        )
    ).rows[0].id;

    await expectError(
        "barang yang baru saja habis langsung tidak bisa diminta",
        () =>
            db.exec(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta) values ('${permC}', '${hvs}', 1)`,
            ),
        "kosong",
    );

    await db.exec(`
    insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta) values ('${permC}', '${spidol}', 1);
    update public.permintaan set status = 'diajukan' where id = '${permC}';
    update public.permintaan set status = 'dibatalkan' where id = '${permC}';`);
    const p = (
        await db.query(
            `select status from public.permintaan where id = '${permC}'`,
        )
    ).rows[0];
    ok(
        "pemohon boleh membatalkan permintaannya sendiri",
        p.status === "dibatalkan",
    );
});

console.log("\n— penyesuaian hasil hitung fisik —");
await as(TU, async () => {
    await expectError(
        "tata usaha tidak boleh mencatat penyesuaian",
        () =>
            db.query(`select public.catat_penyesuaian($1, 40, 'coba-coba')`, [
                spidol,
            ]),
        "pengurus barang",
    );
});

await as(PGR, async () => {
    const sebelum = (
        await db.query(`select stok from public.stok_barang where nama = $1`, [
            SPIDOL,
        ])
    ).rows[0].stok;

    // Yang diketik adalah hasil hitungan fisik, bukan selisihnya.
    const kurang = (
        await db.query(`select public.catat_penyesuaian($1, $2, $3) as s`, [
            spidol,
            sebelum - 3,
            "Opname: fisik kurang 3 dari buku",
        ])
    ).rows[0].s;
    ok("fisik kurang -> selisih negatif ditulis", kurang === -3, `(${kurang})`);

    const stokKurang = (
        await db.query(`select stok from public.stok_barang where nama = $1`, [
            SPIDOL,
        ])
    ).rows[0].stok;
    ok(
        "stok jadi persis sebanyak hitungan fisik",
        stokKurang === sebelum - 3,
        `(${stokKurang})`,
    );

    const lebih = (
        await db.query(`select public.catat_penyesuaian($1, $2, $3) as s`, [
            spidol,
            sebelum + 2,
            "Opname: ada sisa hibah belum tercatat",
        ])
    ).rows[0].s;
    ok("fisik lebih -> selisih positif ditulis", lebih === 5, `(${lebih})`);

    const stokLebih = (
        await db.query(`select stok from public.stok_barang where nama = $1`, [
            SPIDOL,
        ])
    ).rows[0].stok;
    ok(
        "stok naik ke hitungan fisik, bukan ditambah dua kali",
        stokLebih === sebelum + 2,
        `(${stokLebih})`,
    );

    const nol = (
        await db.query(`select public.catat_penyesuaian($1, $2, $3) as s`, [
            spidol,
            sebelum + 2,
            "Opname: sudah cocok",
        ])
    ).rows[0].s;
    ok("fisik sama dengan buku -> 0, tanpa baris baru", nol === 0, `(${nol})`);

    const n = (
        await db.query(
            `select count(*)::int as n from public.mutasi_stok where jenis = 'penyesuaian'`,
        )
    ).rows[0].n;
    ok("hanya 2 baris penyesuaian yang terbit", n === 2, `(${n})`);

    ok(
        "dibuat_oleh terisi sendiri walau tanpa dokumen induk",
        (
            await db.query(
                `select count(*)::int as n from public.mutasi_stok
                     where jenis = 'penyesuaian' and dibuat_oleh = $1`,
                [PGR],
            )
        ).rows[0].n === 2,
    );

    await expectError(
        "penyesuaian tanpa catatan ditolak",
        () =>
            db.query(`select public.catat_penyesuaian($1, 10, '   ')`, [
                spidol,
            ]),
        "wajib menyertakan catatan",
    );

    await expectError(
        "hitungan fisik negatif ditolak",
        () =>
            db.query(`select public.catat_penyesuaian($1, -5, 'salah ketik')`, [
                spidol,
            ]),
        "negatif",
    );

    await expectError(
        "barang tak dikenal ditolak",
        () =>
            db.query(
                `select public.catat_penyesuaian(gen_random_uuid(), 10, 'entah barang apa')`,
            ),
        "tidak dikenal",
    );
});

console.log("\n— pagar terakhir —");
await as(PGR, async () => {
    // RLS tidak punya policy UPDATE/DELETE untuk mutasi_stok, jadi
    // barisnya tersaring diam-diam - 0 baris terpengaruh, bukan error.
    const u = await db.query(`update public.mutasi_stok set jumlah = 0`);
    const d = await db.query(`delete from public.permintaan_log`);
    ok(
        "RLS: pengurus barang tidak bisa mengubah mutasi_stok",
        u.affectedRows === 0,
        `(${u.affectedRows} baris)`,
    );
    ok(
        "RLS: pengurus barang tidak bisa menghapus log",
        d.affectedRows === 0,
        `(${d.affectedRows} baris)`,
    );
    const tetap = (
        await db.query(
            `select count(*)::int as n from public.mutasi_stok where jumlah = 0`,
        )
    ).rows[0];
    ok("tidak ada baris mutasi yang ternoda", tetap.n === 0);
});

console.log("\n— lapis kedua: pemilik tabel pun ditolak —");
await expectError(
    "mutasi_stok append-only walau lewat SQL editor",
    () => db.exec(`update public.mutasi_stok set jumlah = 0`),
    "append-only",
);
await expectError(
    "mutasi_stok tidak bisa dihapus lewat SQL editor",
    () => db.exec(`delete from public.mutasi_stok`),
    "append-only",
);
await expectError(
    "permintaan_log append-only walau lewat SQL editor",
    () => db.exec(`delete from public.permintaan_log`),
    "append-only",
);

// Dijalankan paling akhir dengan sengaja: beberapa pemeriksaan di atas
// menghitung baris secara persis, jadi barang dan unit kerja karangan di
// bawah ini tidak boleh terbit lebih dulu.
console.log("\n— master data —");

await as(PGW, async () => {
    await expectError(
        "pegawai tidak bisa menambah unit kerja",
        () =>
            db.query(
                `insert into public.unit_kerja (nama) values ('Unit Karangan')`,
            ),
        "row-level security",
    );
    await expectError(
        "pegawai tidak bisa menambah barang",
        () =>
            db.query(
                `insert into public.barang (kode, nama, satuan)
                 values ('9.9.9', 'Barang karangan', 'pcs')`,
            ),
        "row-level security",
    );

    // UPDATE yang ditolak RLS tidak memunculkan galat sama sekali - barisnya
    // sekadar tak terlihat. Inilah sebabnya server action master data memeriksa
    // baris yang kembali dari .select(), bukan hanya ada tidaknya error.
    const u = await db.query(
        `update public.barang set nama = 'diubah diam-diam'`,
    );
    ok(
        "pegawai mengubah barang: nol baris, tanpa galat",
        u.affectedRows === 0,
        `(${u.affectedRows} baris)`,
    );
});

await as(PGR, async () => {
    await expectError(
        "pengurus barang tidak bisa menambah unit kerja",
        () =>
            db.query(
                `insert into public.unit_kerja (nama) values ('Unit Karangan')`,
            ),
        "row-level security",
    );
});

await as(TU, async () => {
    await db.query(
        `insert into public.unit_kerja (nama) values ('Laboratorium IPA')`,
    );
    ok(
        "tata usaha menambah unit kerja",
        (
            await db.query(
                `select count(*)::int as n from public.unit_kerja where nama = 'Laboratorium IPA'`,
            )
        ).rows[0].n === 1,
    );

    await expectError(
        "nama unit kerja kembar ditolak",
        () =>
            db.query(
                `insert into public.unit_kerja (nama) values ('Laboratorium IPA')`,
            ),
        "duplicate key",
    );

    const a = await db.query(
        `update public.unit_kerja set aktif = false where nama = 'Laboratorium IPA'`,
    );
    ok(
        "tata usaha menonaktifkan unit kerja",
        a.affectedRows === 1,
        `(${a.affectedRows} baris)`,
    );

    const hapusUnit = await db.query(
        `delete from public.unit_kerja where nama = 'Laboratorium IPA'`,
    );
    ok(
        "unit kerja yang belum dipakai bisa dihapus",
        hapusUnit.affectedRows === 1,
        `(${hapusUnit.affectedRows} baris)`,
    );

    // 'Guru' dipegang profil pegawai dan permintaan yang sudah terbit.
    await expectError(
        "unit kerja yang dipakai tidak bisa dihapus",
        () => db.query(`delete from public.unit_kerja where nama = 'Guru'`),
        "foreign key",
    );

    await db.query(
        `insert into public.barang (kode, nama, satuan)
         values ('9.9.9.99.99.99.999.99999', 'Map plastik karangan', 'pcs')`,
    );
    ok(
        "tata usaha menambah barang",
        (
            await db.query(
                `select count(*)::int as n from public.barang where kode = '9.9.9.99.99.99.999.99999'`,
            )
        ).rows[0].n === 1,
    );

    await expectError(
        "kode barang kembar ditolak",
        () =>
            db.query(
                `insert into public.barang (kode, nama, satuan)
                 values ('9.9.9.99.99.99.999.99999', 'Map lain', 'pcs')`,
            ),
        "duplicate key",
    );

    const hapusBaru = await db.query(
        `delete from public.barang where kode = '9.9.9.99.99.99.999.99999'`,
    );
    ok(
        "barang yang belum pernah dipakai bisa dihapus",
        hapusBaru.affectedRows === 1,
        `(${hapusBaru.affectedRows} baris)`,
    );

    // Spidol sudah punya baris penerimaan, permintaan, dan mutasi.
    await expectError(
        "barang yang sudah dipakai tidak bisa dihapus",
        () => db.query(`delete from public.barang where id = '${spidol}'`),
        "foreign key",
    );
});

// Sama seperti master data: ditaruh paling akhir karena bagian ini
// menambah permintaan dan mengutak-atik kolom aktif.
console.log("\n— pengguna —");

// Draft disusun selagi akunnya masih aktif. Nanti dipakai membuktikan
// bahwa penonaktifan ikut mengunci baris yang sudah terlanjur ada.
let permD;
await as(PGW, async () => {
    await db.exec(
        `insert into public.permintaan (keperluan) values ('Draft sebelum akun dinonaktifkan');`,
    );
    permD = (
        await db.query(
            `select id from public.permintaan order by created_at desc limit 1`,
        )
    ).rows[0].id;
});

await as(TU, async () => {
    const p = (
        await db.query(`select * from public.pengguna order by nama_lengkap`)
    ).rows;
    ok(
        "tata usaha melihat seluruh akun lewat view pengguna",
        p.length === 3,
        `(${p.length} baris)`,
    );

    const email = Object.fromEntries(p.map((r) => [r.id, r.email]));
    ok(
        "email ikut terbawa dari auth.users",
        email[TU] === `tu@${DOMAIN_SEKOLAH}` &&
            email[PGW] === `guru.ipa@${DOMAIN_SEKOLAH}`,
        JSON.stringify(email),
    );

    const namaPengguna = Object.fromEntries(p.map((r) => [r.id, r.nama_pengguna]));
    ok(
        "nama_pengguna adalah separuh alamat sebelum @",
        namaPengguna[TU] === "tu" && namaPengguna[PGW] === "guru.ipa",
        JSON.stringify(namaPengguna),
    );

    const guru = p.find((r) => r.id === PGW);
    ok(
        "unit kerja ikut terbaca lewat left join",
        guru.unit_kerja === "Guru",
        String(guru.unit_kerja),
    );
    ok(
        "sandi_sementara tanpa app_metadata -> false, bukan null",
        guru.sandi_sementara === false,
        String(guru.sandi_sementara),
    );
});

// Ditulis sebagai pemilik tabel, bukan lewat as(): app_metadata memang
// hanya bisa disentuh service role, persis seperti nanti di Supabase.
await db.exec(
    `update auth.users set raw_app_meta_data = jsonb_build_object('sandi_sementara', true) where id = '${PGW}'`,
);

await as(TU, async () => {
    const r = (
        await db.query(
            `select sandi_sementara from public.pengguna where id = '${PGW}'`,
        )
    ).rows[0];
    ok(
        "sandi_sementara terbaca dari app_metadata",
        r.sandi_sementara === true,
        String(r.sandi_sementara),
    );
});

// Inilah satu-satunya yang berdiri antara seorang guru dan seluruh
// alamat email staf: view ini berjalan sebagai pemiliknya, jadi RLS
// profil tidak berlaku dan where is_tu() adalah gerbangnya.
await as(PGW, async () => {
    const p = (await db.query(`select * from public.pengguna`)).rows;
    ok(
        "pegawai membaca view pengguna -> 0 baris, bukan galat",
        p.length === 0,
        `(${p.length} baris)`,
    );
});

await as(TU, async () => {
    const u = await db.query(
        `update public.profil set aktif = false where id = '${PGW}'`,
    );
    ok(
        "tata usaha menonaktifkan akun pegawai",
        u.affectedRows === 1,
        `(${u.affectedRows} baris)`,
    );
});

await as(PGW, async () => {
    await expectError(
        "akun nonaktif tidak bisa membuat permintaan",
        () =>
            db.query(
                `insert into public.permintaan (keperluan) values ('Setelah dinonaktifkan')`,
            ),
        "row-level security",
    );

    await expectError(
        "akun nonaktif tidak bisa menambah baris permintaan",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${permD}', '${spidol}', 1)`,
            ),
        "row-level security",
    );

    // UPDATE dan DELETE yang ditolak RLS tidak memunculkan galat sama
    // sekali - barisnya sekadar hilang dari pandangan. Itu sebabnya
    // server action memeriksa baris yang kembali, bukan hanya error.
    const u = await db.query(
        `update public.permintaan set keperluan = 'diubah diam-diam' where id = '${permD}'`,
    );
    ok(
        "akun nonaktif mengubah draftnya sendiri: nol baris, tanpa galat",
        u.affectedRows === 0,
        `(${u.affectedRows} baris)`,
    );

    const d = await db.query(
        `delete from public.permintaan where id = '${permD}'`,
    );
    ok(
        "akun nonaktif menghapus draftnya sendiri: nol baris",
        d.affectedRows === 0,
        `(${d.affectedRows} baris)`,
    );

    // ubah_profil sebelumnya lolos tanpa syarat aktif di cabang
    // "id = auth.uid()" - akun nonaktif bisa saja masih menulis ulang
    // nama_lengkap-nya sendiri selamanya, sebab nonaktif tidak mencabut
    // token Supabase Auth yang sedang dipegangnya.
    const namaNonaktif = await db.query(
        `update public.profil set nama_lengkap = 'Diubah diam-diam' where id = '${PGW}'`,
    );
    ok(
        "akun nonaktif mengubah nama profil sendiri: nol baris, tanpa galat",
        namaNonaktif.affectedRows === 0,
        `(${namaNonaktif.affectedRows} baris)`,
    );
});

await as(TU, async () => {
    await db.query(
        `update public.profil set aktif = true where id = '${PGW}'`,
    );
});

await as(PGW, async () => {
    const u = await db.query(
        `update public.permintaan set keperluan = 'Boleh lagi setelah diaktifkan' where id = '${permD}'`,
    );
    ok(
        "diaktifkan lagi -> boleh mengubah draftnya",
        u.affectedRows === 1,
        `(${u.affectedRows} baris)`,
    );

    const namaAktif = await db.query(
        `update public.profil set nama_lengkap = 'Nama diperbarui sendiri' where id = '${PGW}'`,
    );
    ok(
        "diaktifkan lagi -> boleh mengubah nama profil sendiri",
        namaAktif.affectedRows === 1,
        `(${namaAktif.affectedRows} baris)`,
    );

    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ('${permD}', '${spidol}', 1)`,
    );
    const n = (
        await db.query(
            `select count(*)::int as n from public.permintaan_item where permintaan_id = '${permD}'`,
        )
    ).rows[0].n;
    ok("diaktifkan lagi -> boleh menambah baris permintaan", n === 1, `(${n})`);

    await db.query(
        `insert into public.permintaan (keperluan) values ('Permintaan setelah diaktifkan')`,
    );
    const b = (
        await db.query(
            `select count(*)::int as n from public.permintaan where keperluan = 'Permintaan setelah diaktifkan'`,
        )
    ).rows[0].n;
    ok("diaktifkan lagi -> boleh membuat permintaan baru", b === 1, `(${b})`);
});

await as(TU, async () => {
    const naik = await db.query(
        `update public.profil set role = 'pengurus_barang' where id = '${PGW}'`,
    );
    ok(
        "tata usaha boleh mengganti peran akun lain",
        naik.affectedRows === 1,
        `(${naik.affectedRows} baris)`,
    );
    await db.query(
        `update public.profil set role = 'pegawai' where id = '${PGW}'`,
    );
});

await as(PGW, async () => {
    await expectError(
        "pegawai tetap tidak bisa menaikkan perannya sendiri",
        () =>
            db.query(
                `update public.profil set role = 'tata_usaha' where id = '${PGW}'`,
            ),
        "tata usaha",
    );
});

// Paling akhir, seperti dua bagian sebelumnya: di sini stok kain pel
// bertambah, akun keempat lahir, dan permintaan baru terbit - semuanya
// hal yang dihitung persis oleh pemeriksaan di atas.
console.log("\n— permintaan pegawai —");

// Pegawai kedua. Dibuat di sini, bukan di setup, karena bagian pengguna
// menghitung tepat tiga akun.
const PGW2 = "44444444-4444-4444-4444-444444444444";
await db.exec(`
insert into auth.users (id, email) values ('${PGW2}', 'guru.mtk@${DOMAIN_SEKOLAH}');
update public.profil set
  unit_kerja_id = (select id from public.unit_kerja where nama = 'Guru')
  where id = '${PGW2}';`);

// Kain pel diberi stok supaya bagian ini punya barang tersedia kedua:
// satu untuk keranjang, satu lagi untuk membuktikan bahwa keranjang yang
// sudah diajukan tidak bisa ditambah. Tanpa itu, penolakan RLS akan
// tertutup lebih dulu oleh penolakan "barang kosong" dari trigger.
await as(PGR, async () => {
    await db.exec(`
    insert into public.penerimaan (no_dokumen) values ('INV-9002');
    insert into public.penerimaan_item (penerimaan_id, barang_id, jumlah)
    select p.id, '${pel}', 20 from public.penerimaan p where p.no_dokumen = 'INV-9002';`);
    await db.query(
        `select public.catat_penerimaan((select id from public.penerimaan where no_dokumen = 'INV-9002'))`,
    );
});

let keranjang;
await as(PGW, async () => {
    // keperluan dibiarkan kosong: begitulah halaman katalog membuka draft,
    // dan kolomnya not null tanpa pemeriksaan isi. Keperluannya baru
    // ditanyakan di dialog pengajuan.
    await db.exec(`insert into public.permintaan (keperluan) values ('');`);
    keranjang = (
        await db.query(
            `select id, pemohon_id, unit_kerja_id, status, nomor from public.permintaan
             where keperluan = '' order by created_at desc limit 1`,
        )
    ).rows[0];
    ok(
        "keranjang lahir sebagai draft milik pemohonnya, tanpa nomor",
        keranjang.status === "draft" &&
            keranjang.pemohon_id === PGW &&
            keranjang.nomor === null,
        JSON.stringify(keranjang),
    );
    ok(
        "unit kerja ikut tersalin dari profil",
        keranjang.unit_kerja_id !== null,
        String(keranjang.unit_kerja_id),
    );

    await expectError(
        "barang berstok nol ditolak saat dimasukkan keranjang",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${keranjang.id}', '${pulpen}', 1)`,
            ),
        "kosong",
    );

    await expectError(
        "keranjang kosong tidak bisa diajukan",
        () =>
            db.query(
                `update public.permintaan set status = 'diajukan',
                 keperluan = 'Coba ajukan tanpa barang' where id = '${keranjang.id}'`,
            ),
        "permintaan kosong",
    );

    await expectError(
        "permintaan tidak bisa lahir langsung berstatus diajukan",
        () =>
            db.query(
                `insert into public.permintaan (keperluan, status)
                 values ('Lompat draft', 'diajukan')`,
            ),
        "permintaan kosong",
    );

    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ('${keranjang.id}', '${spidol}', 3)`,
    );
    const it = (
        await db.query(
            `select nama_barang_snapshot, satuan_snapshot, jumlah_diminta
             from public.permintaan_item where permintaan_id = '${keranjang.id}'`,
        )
    ).rows[0];
    ok(
        "snapshot nama dan satuan dibekukan saat barang masuk keranjang",
        it.nama_barang_snapshot === SPIDOL && it.satuan_snapshot === "pcs",
        JSON.stringify(it),
    );

    await expectError(
        "barang yang sama tidak bisa masuk keranjang dua kali",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${keranjang.id}', '${spidol}', 1)`,
            ),
        "duplicate key",
    );

    await db.query(
        `update public.permintaan set status = 'diajukan',
         keperluan = 'Spidol untuk ulangan harian' where id = '${keranjang.id}'`,
    );
    const p = (
        await db.query(
            `select nomor, status, diajukan_at from public.permintaan where id = '${keranjang.id}'`,
        )
    ).rows[0];
    ok(
        "keranjang berisi boleh diajukan dan mendapat nomor SPB",
        p.status === "diajukan" &&
            /^SPB-\d{6}$/.test(p.nomor) &&
            p.diajukan_at !== null,
        JSON.stringify(p),
    );

    const log = (
        await db.query(
            `select status_ke from public.permintaan_log where permintaan_id = $1 order by created_at`,
            [keranjang.id],
        )
    ).rows;
    ok(
        "log mencatat draft lalu diajukan",
        log.length === 2 && log[1].status_ke === "diajukan",
        JSON.stringify(log.map((l) => l.status_ke)),
    );

    await expectError(
        "barang tidak bisa ditambahkan lagi setelah permintaan diajukan",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${keranjang.id}', '${pel}', 1)`,
            ),
        "row-level security",
    );

    // DELETE yang ditolak RLS tidak memunculkan galat sama sekali. Itu
    // sebabnya server action memeriksa baris yang kembali dari .select(),
    // bukan hanya kolom error.
    const d = await db.query(
        `delete from public.permintaan where id = '${keranjang.id}'`,
    );
    ok(
        "permintaan yang sudah diajukan tidak bisa dihapus pemohonnya: nol baris, tanpa galat",
        d.affectedRows === 0,
        `(${d.affectedRows} baris)`,
    );

    await db.query(
        `update public.permintaan set status = 'dibatalkan' where id = '${keranjang.id}'`,
    );
    const b = (
        await db.query(
            `select status from public.permintaan where id = '${keranjang.id}'`,
        )
    ).rows[0];
    ok(
        "pemohon boleh membatalkan permintaan yang masih diajukan",
        b.status === "dibatalkan",
        b.status,
    );

    // Keranjang kosong memang boleh dihapus - itulah yang dipakai halaman
    // detail saat barang terakhir dikeluarkan.
    await db.query(`insert into public.permintaan (keperluan) values ('');`);
    const kosong = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    const h = await db.query(
        `delete from public.permintaan where id = '${kosong}'`,
    );
    ok(
        "draft kosong boleh dihapus pemohonnya",
        h.affectedRows === 1,
        `(${h.affectedRows} baris)`,
    );
});

let permE;
await as(PGW, async () => {
    await db.query(`insert into public.permintaan (keperluan) values ('');`);
    permE = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ('${permE}', '${pel}', 2)`,
    );
    await db.query(
        `update public.permintaan set status = 'diajukan',
         keperluan = 'Kain pel untuk piket kelas' where id = '${permE}'`,
    );
});

await as(TU, async () => {
    await db.query(
        `update public.permintaan set status = 'disetujui' where id = '${permE}'`,
    );
});

await as(PGW, async () => {
    // Bukan galat: policy ubah_permintaan menyempitkan UPDATE milik pemohon
    // ke status draft dan diajukan, jadi permintaan yang sudah disetujui
    // sekadar tidak terlihat oleh update ini.
    const u = await db.query(
        `update public.permintaan set status = 'dibatalkan' where id = '${permE}'`,
    );
    ok(
        "permintaan yang sudah disetujui tidak bisa dibatalkan pemohon: nol baris, tanpa galat",
        u.affectedRows === 0,
        `(${u.affectedRows} baris)`,
    );

    // susun_permintaan_item juga menyempitkan ke status draft - permintaan
    // yang sudah disetujui membuat UPDATE ini tidak menemukan baris sama
    // sekali, sekalipun baris itu milik pemohon sendiri.
    const ui = await db.query(
        `update public.permintaan_item set jumlah_diminta = 9 where permintaan_id = '${permE}'`,
    );
    ok(
        "baris permintaan yang sudah disetujui tidak bisa diubah pemohonnya: nol baris, tanpa galat",
        ui.affectedRows === 0,
        `(${ui.affectedRows} baris)`,
    );
});

await as(PGW2, async () => {
    const p = (
        await db.query(
            `select id from public.permintaan where id = '${permE}'`,
        )
    ).rows;
    ok(
        "pegawai lain tidak melihat permintaan milik orang lain",
        p.length === 0,
        `(${p.length} baris)`,
    );

    const it = (
        await db.query(
            `select id from public.permintaan_item where permintaan_id = '${permE}'`,
        )
    ).rows;
    ok(
        "baris permintaan orang lain ikut tak terlihat",
        it.length === 0,
        `(${it.length} baris)`,
    );

    const lg = (
        await db.query(
            `select id from public.permintaan_log where permintaan_id = '${permE}'`,
        )
    ).rows;
    ok(
        "log permintaan orang lain ikut tak terlihat",
        lg.length === 0,
        `(${lg.length} baris)`,
    );

    // pemohon_id di susun_permintaan_item bukan cuma status: pegawai lain
    // yang bukan pemiliknya sama sekali juga tidak menemukan baris ini.
    const ui2 = await db.query(
        `update public.permintaan_item set jumlah_diminta = 9 where permintaan_id = '${permE}'`,
    );
    ok(
        "pegawai lain tidak bisa mengubah baris permintaan orang lain: nol baris, tanpa galat",
        ui2.affectedRows === 0,
        `(${ui2.affectedRows} baris)`,
    );
});

// Bagian terakhir, seperti dua bagian sebelumnya: di sini permintaan
// baru terbit lalu diputuskan tata usaha - keduanya hal yang dihitung
// persis oleh pemeriksaan di bagian pengguna di atas.
console.log("\n— persetujuan tata usaha —");

/**
 * Keranjang berisi satu barang, lalu diajukan - persis jalur yang
 * ditempuh ajukanPermintaan: keperluan dan status ditulis dalam satu
 * UPDATE. Itu sekaligus penjaga regresi untuk migrasi pembekuan, sebab
 * UPDATE itulah yang paling mirip dengan yang dilarangnya.
 */
const ajukanBaru = async (keperluan, barangId) => {
    await db.query(`insert into public.permintaan (keperluan) values ('')`);
    const id = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ($1, $2, 2)`,
        [id, barangId],
    );
    await db.query(
        `update public.permintaan set status = 'diajukan', keperluan = $1 where id = $2`,
        [keperluan, id],
    );
    return id;
};

let permF, permG;
await as(PGW, async () => {
    permF = await ajukanBaru("Kain pel untuk ruang guru", pel);
    permG = await ajukanBaru("Kain pel untuk lab IPA", pel);

    const p = (
        await db.query(
            `select status, keperluan from public.permintaan where id = '${permF}'`,
        )
    ).rows[0];
    ok(
        "draft -> diajukan yang menulis keperluan sekalian tetap lolos",
        p.status === "diajukan" && p.keperluan === "Kain pel untuk ruang guru",
        JSON.stringify(p),
    );
});

await as(TU, async () => {
    await expectError(
        "tata usaha tidak bisa menulis ulang keperluan permintaan yang sudah diajukan",
        () =>
            db.query(
                `update public.permintaan set keperluan = 'Diubah tata usaha' where id = '${permF}'`,
            ),
        "tidak bisa diubah lagi",
    );

    await expectError(
        "alasan penolakan tidak bisa ditulis pada baris yang statusnya diam",
        () =>
            db.query(
                `update public.permintaan set alasan_tolak = 'Ditulis diam-diam' where id = '${permF}'`,
            ),
        "hanya bisa ditulis saat permintaan ditolak",
    );

    // Kolom sistem - bukan cuma isi yang diketik pemohon - ikut beku.
    // nomor adalah nomor SPB yang tercetak di kertas fisik, dan
    // disetujui_oleh dipakai pengguna/actions.ts untuk menggerbang
    // penghapusan akun: keduanya diam-diam bisa ditulis ulang sebelum
    // pembekuan ini diperlebar.
    await expectError(
        "tata usaha tidak bisa menulis ulang nomor SPB permintaan yang sudah diajukan",
        () =>
            db.query(
                `update public.permintaan set nomor = 'SPB-999999' where id = '${permF}'`,
            ),
        "tidak bisa diubah lagi",
    );

    await expectError(
        "tata usaha tidak bisa menulis ulang disetujui_oleh permintaan yang belum disetujui",
        () =>
            db.query(
                `update public.permintaan set disetujui_oleh = '${TU}' where id = '${permF}'`,
            ),
        "tidak bisa diubah lagi",
    );

    // Nama pemohon terjangkau tata usaha - inilah yang membuat garis
    // waktu di halaman keputusan bisa menyebut orang, bukan cuma status.
    const nama = (
        await db.query(
            `select pr.nama_lengkap from public.permintaan p
             join public.profil pr on pr.id = p.pemohon_id where p.id = '${permG}'`,
        )
    ).rows;
    ok(
        "tata usaha ikut membaca nama pemohon permintaan orang lain",
        nama.length === 1 && typeof nama[0].nama_lengkap === "string",
        JSON.stringify(nama),
    );

    // Halaman keputusan menaruh angka ini di samping jumlah yang diminta.
    const stok = (
        await db.query(
            `select barang_id, stok from public.stok_barang where barang_id = '${pel}'`,
        )
    ).rows;
    ok(
        "tata usaha membaca angka stok lewat stok_barang",
        stok.length === 1 && Number(stok[0].stok) > 0,
        JSON.stringify(stok),
    );
});

await as(PGW, async () => {
    await expectError(
        "pemohon pun tidak bisa mengubah isi permintaannya setelah diajukan",
        () =>
            db.query(
                `update public.permintaan set tanggal_dibutuhkan = current_date + 7
                 where id = '${permF}'`,
            ),
        "tidak bisa diubah lagi",
    );

    // Draft tetap bebas disunting - di situlah keranjang sedang diisi.
    await db.query(`insert into public.permintaan (keperluan) values ('')`);
    const draft = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    const u = await db.query(
        `update public.permintaan set keperluan = 'Masih keranjang' where id = '${draft}'`,
    );
    ok("isi draft masih bebas diubah", u.affectedRows === 1, `(${u.affectedRows} baris)`);

    await expectError(
        "pemohon tidak bisa menyetujui permintaannya sendiri",
        () =>
            db.query(
                `update public.permintaan set status = 'disetujui' where id = '${permF}'`,
            ),
        "hanya tata usaha",
    );
});

await as(PGR, async () => {
    await expectError(
        "pengurus barang tidak bisa menyetujui permintaan",
        () =>
            db.query(
                `update public.permintaan set status = 'disetujui' where id = '${permF}'`,
            ),
        "hanya tata usaha",
    );
});

await as(TU, async () => {
    await db.query(
        `update public.permintaan set status = 'disetujui' where id = '${permF}'`,
    );
    const p = (
        await db.query(
            `select status, disetujui_at, disetujui_oleh from public.permintaan
             where id = '${permF}'`,
        )
    ).rows[0];
    ok(
        "tata usaha menyetujui - stempel waktu dan namanya terisi sendiri",
        p.status === "disetujui" &&
            p.disetujui_at !== null &&
            p.disetujui_oleh === TU,
        JSON.stringify(p),
    );

    const log = (
        await db.query(
            `select oleh from public.permintaan_log
             where permintaan_id = $1 and status_ke = 'disetujui'`,
            [permF],
        )
    ).rows;
    ok(
        "persetujuan meninggalkan satu baris log atas nama tata usaha",
        log.length === 1 && log[0].oleh === TU,
        JSON.stringify(log),
    );

    await expectError(
        "penolakan tanpa alasan ditolak constraint",
        () =>
            db.query(
                `update public.permintaan set status = 'ditolak' where id = '${permG}'`,
            ),
        "alasan_tolak_wajib",
    );

    await db.query(
        `update public.permintaan set status = 'ditolak', alasan_tolak = $1 where id = $2`,
        ["Kain pel baru saja habis, tunggu penerimaan berikutnya", permG],
    );
    const g = (
        await db.query(
            `select status, alasan_tolak from public.permintaan where id = '${permG}'`,
        )
    ).rows[0];
    ok(
        "penolakan yang membawa alasannya sekalian diterima",
        g.status === "ditolak" && /baru saja habis/.test(g.alasan_tolak),
        JSON.stringify(g),
    );

    const logTolak = (
        await db.query(
            `select catatan from public.permintaan_log
             where permintaan_id = $1 and status_ke = 'ditolak'`,
            [permG],
        )
    ).rows[0];
    ok(
        "alasan penolakan ikut turun ke log",
        /baru saja habis/.test(logTolak.catatan ?? ""),
        JSON.stringify(logTolak),
    );

    // disetujui -> ditolak: stok yang tak kunjung datang masih bisa
    // membatalkan persetujuan yang sudah terlanjur diberikan.
    await db.query(
        `update public.permintaan set status = 'ditolak', alasan_tolak = $1 where id = $2`,
        ["Stok tak kunjung ada sampai akhir bulan", permF],
    );
    const f = (
        await db.query(
            `select status from public.permintaan where id = '${permF}'`,
        )
    ).rows[0];
    ok(
        "permintaan yang sudah disetujui masih bisa ditolak tata usaha",
        f.status === "ditolak",
        f.status,
    );
});

console.log(`\n${pass} lolos, ${fail} gagal`);
await db.close();
process.exit(fail ? 1 : 0);
