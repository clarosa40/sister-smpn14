// =============================================================
// Sandbox alur SIPB - Postgres sungguhan di dalam Node (PGlite),
// tanpa Docker dan tanpa Supabase.
//
//   node supabase/tests/sandbox.mjs
//
// Seluruh migration dijalankan apa adanya, lalu tiga akun dibuat:
// tu, sarpras, guru. Ketik SQL apa pun; RLS dan trigger berlaku
// persis seperti nanti di Supabase.
// =============================================================

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DOMAIN_SEKOLAH } from '../../src/lib/alamat.ts';

const MIG = new URL('../migrations/', import.meta.url);

const AKUN = {
  tu:      { id: '11111111-1111-1111-1111-111111111111', role: 'tata_usaha',      unit: 'Tata Usaha',       nama: 'Bu Rina (Tata Usaha)' },
  sarpras: { id: '22222222-2222-2222-2222-222222222222', role: 'pengurus_barang', unit: 'Sarana Prasarana', nama: 'Pak Budi (Pengurus Barang)' },
  guru:    { id: '33333333-3333-3333-3333-333333333333', role: 'pegawai',         unit: 'Guru',             nama: 'Bu Sari (Guru IPA)' },
};

const db = new PGlite();
let siapa = 'guru';

await db.exec(`
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
create role anon; create role authenticated; create role service_role;`);

for (const f of readdirSync(MIG).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL(f, MIG), 'utf8'));
}

for (const [kunci, a] of Object.entries(AKUN)) {
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('${a.id}', '${kunci}@${DOMAIN_SEKOLAH}', jsonb_build_object('nama_lengkap', '${a.nama}'));
    update public.profil
       set role = '${a.role}',
           unit_kerja_id = (select id from public.unit_kerja where nama = '${a.unit}')
     where id = '${a.id}';`);
}

// ---- tampilan ----------------------------------------------------

const warna = (kode, s) => `\x1b[${kode}m${s}\x1b[0m`;
const abu   = s => warna('90', s);
const tebal = s => warna('1', s);

// Lebar kolom dihitung dari teks polos, warna dipasang belakangan.
// Kalau dibalik, kode ANSI ikut terhitung dan seluruh tabel meleset.
function tabel(rows) {
  if (!rows.length) return abu('   (0 baris)');

  const teks = (v) =>
    v === null || v === undefined ? 'null'
    : v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ')
    : String(v);

  const kol   = Object.keys(rows[0]);
  const sel   = rows.map(r => kol.map(k => teks(r[k])));
  const lebar = kol.map((k, i) => Math.max(k.length, ...sel.map(s => s[i].length)));

  const garis = (kiri, tengah, kanan) =>
    abu(kiri + lebar.map(w => '─'.repeat(w + 2)).join(tengah) + kanan);
  const baris = (sel, hias) =>
    abu('│') + sel.map((c, i) => hias(` ${c.padEnd(lebar[i])} `, c)).join(abu('│')) + abu('│');

  return [
    garis('┌', '┬', '┐'),
    baris(kol, (p) => tebal(p)),
    garis('├', '┼', '┤'),
    ...sel.map(s => baris(s, (p, c) => (c === 'null' ? abu(p) : p))),
    garis('└', '┴', '┘'),
  ].join('\n');
}

const BANTUAN = `
${tebal('Perintah')}
  \\siapa <tu|sarpras|guru>   ganti akun yang sedang login
  \\akun                      daftar akun beserta perannya
  \\alur                      diagram status permintaan
  \\stok                      angka stok (butuh peran tu / sarpras)
  \\katalog                   katalog seperti yang dilihat pegawai
  \\permintaan                daftar permintaan yang boleh dilihat akun ini
  \\log <nomor>               riwayat status satu permintaan
  \\reset                     kosongkan seluruh transaksi, master tetap
  \\q                         keluar

${tebal('Selain itu, ketik SQL apa saja.')} ${abu('Akhiri dengan ; atau langsung Enter.')}

${tebal('Contoh alur lengkap')} ${abu('(jalankan berurutan, ganti akun sesuai baris)')}
  \\siapa tu
  insert into penerimaan (sumber_dana, no_dokumen) values ('BOS Reguler 2026', 'INV-01');
  insert into penerimaan_item (penerimaan_id, barang_id, jumlah)
    select p.id, b.id, 50 from penerimaan p, barang b where b.nama = 'Spidol whiteboard hitam';
  select catat_penerimaan((select id from penerimaan limit 1));
  \\stok

  \\siapa guru
  insert into permintaan (keperluan) values ('Praktikum kelas 8');
  insert into permintaan_item (permintaan_id, barang_id, jumlah_diminta)
    select p.id, b.id, 5 from permintaan p, barang b where b.nama = 'Spidol whiteboard hitam';
  update permintaan set status = 'diajukan';

  \\siapa sarpras
  update permintaan set status = 'disetujui' where nomor = 'SPB-000001';

  \\siapa tu
  select (siapkan_permintaan((select id from permintaan where nomor = 'SPB-000001'))).status;
  update permintaan set status = 'selesai' where nomor = 'SPB-000001';
  \\log SPB-000001
`;

const ALUR = `
        ${tebal('pegawai')}        ${tebal('pengurus barang')}         ${tebal('tata usaha')}
   ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌──────────────┐   ┌─────────┐
   │  draft  │──▶│ diajukan │──▶│ disetujui │──▶│ siap_diambil │──▶│ selesai │
   └─────────┘   └──────────┘   └───────────┘   └──────────────┘   └─────────┘
                      │  │            │              ▲
                      │  │            │              │
                      │  └────────────┼──── siapkan_permintaan()
                      │               │              all-or-nothing:
                      ▼               ▼              satu item kurang
               ┌─────────────┐  ┌──────────┐         -> semua batal
               │ dibatalkan  │  │ ditolak  │◀────────┘
               └─────────────┘  └──────────┘
                  (pemohon)      (pengurus barang, alasan wajib)
`;

async function jalankan(sql) {
  const a = AKUN[siapa];
  await db.exec(`select set_config('request.jwt.claim.sub', '${a.id}', false); set role authenticated;`);
  try {
    const hasil = await db.query(sql);
    if (hasil.rows?.length) console.log(tabel(hasil.rows));
    else console.log(abu(`   ${hasil.affectedRows ?? 0} baris terpengaruh`));
  } catch (e) {
    console.log(warna('31', `   ✗ ${e.message}`));
    if (e.hint) console.log(abu(`     ${e.hint}`));
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const PINTAS = {
  '\\stok':       `select kode, nama, satuan, stok, status from stok_barang order by kode`,
  '\\katalog':    `select kode, nama, satuan, tersedia from katalog_pemohon order by kode`,
  '\\permintaan': `select p.nomor, p.status, u.nama as unit, pr.nama_lengkap as pemohon, p.keperluan
                   from permintaan p
                   join unit_kerja u on u.id = p.unit_kerja_id
                   join profil pr on pr.id = p.pemohon_id
                   order by p.created_at`,
};

// ---- REPL --------------------------------------------------------

const prompt = () => `${warna('36', siapa)}${abu(' ▸ ')}`;
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: prompt() });

console.log(`\n${tebal('Sandbox SIPB SMPN 14')} ${abu('— Postgres asli, RLS aktif, tanpa Docker')}`);
console.log(abu(`Login sebagai ${warna('36', siapa)}${abu('. Ketik \\? untuk bantuan, \\q untuk keluar.')}`));
console.log(BANTUAN);
rl.prompt();

let buffer = '';

// readline tidak menunggu handler async selesai. Saat diketik manusia
// itu tidak terasa, tapi saat skrip di-pipe ke sini barisnya balapan
// dan urutannya kacau - jadi setiap baris diantre secara berurutan.
let antre = Promise.resolve();
rl.on('line', (line) => { antre = antre.then(() => tangani(line)); });

async function tangani(line) {
  const t = line.trim();

  if (!t && !buffer) { rl.prompt(); return; }

  if (!buffer && t.startsWith('\\')) {
    const [cmd, arg] = t.split(/\s+/);

    if (cmd === '\\q') { rl.close(); return; }
    else if (cmd === '\\?' || cmd === '\\h') console.log(BANTUAN);
    else if (cmd === '\\alur') console.log(ALUR);
    else if (cmd === '\\siapa') {
      if (AKUN[arg]) { siapa = arg; console.log(abu(`   sekarang login sebagai ${AKUN[arg].nama} — ${AKUN[arg].role}`)); }
      else console.log(warna('31', `   akun tidak dikenal. pilih: ${Object.keys(AKUN).join(', ')}`));
    }
    else if (cmd === '\\akun') {
      console.log(tabel(Object.entries(AKUN).map(([k, a]) =>
        ({ ketik: k, nama: a.nama, role: a.role, unit_kerja: a.unit, aktif: k === siapa ? '◀ ini' : '' }))));
    }
    else if (cmd === '\\log') {
      await jalankan(`select l.created_at, coalesce(l.status_dari::text, '(awal)') as dari,
                             l.status_ke as ke, pr.nama_lengkap as oleh, l.catatan
                      from permintaan_log l
                      join permintaan p on p.id = l.permintaan_id
                      left join profil pr on pr.id = l.oleh
                      where p.nomor = '${arg ?? ''}'
                      order by l.created_at`);
    }
    else if (cmd === '\\reset') {
      await db.exec(`
        set session_replication_role = replica;
        truncate mutasi_stok, permintaan_log, permintaan_item, permintaan,
                 penerimaan_item, penerimaan, nomor_counter restart identity cascade;
        alter sequence seq_penerimaan restart;
        set session_replication_role = origin;`);
      console.log(abu('   transaksi dikosongkan; master dan akun tetap'));
    }
    else if (PINTAS[cmd]) await jalankan(PINTAS[cmd]);
    else console.log(warna('31', `   perintah tidak dikenal: ${cmd}`));

    rl.setPrompt(prompt());
    rl.prompt();
    return;
  }

  buffer += line + '\n';

  // Kirim saat ada titik koma, atau saat baris kosong menutup blok.
  if (t.endsWith(';') || (!t && buffer.trim())) {
    const sql = buffer.trim().replace(/;$/, '');
    buffer = '';
    if (sql) await jalankan(sql);
  }

  rl.setPrompt(buffer ? abu('    ...  ') : prompt());
  rl.prompt();
}

rl.on('close', async () => {
  await antre;
  console.log(abu('\nsampai jumpa\n'));
  await db.close();
  process.exit(0);
});
