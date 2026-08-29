-- =============================================================
-- SIPB SMPN 14 - Skema inti
-- Sistem permintaan barang habis pakai. Tiga peran: pegawai,
-- pengurus barang (sarpras), tata usaha.
--
-- Aturan pokok: tidak ada kolom stok di mana pun. Stok adalah
-- SUM(mutasi_stok.jumlah), disajikan lewat view di 030000_view.sql.
-- =============================================================

-- -------------------------------------------------------------
-- Tipe enum
-- -------------------------------------------------------------

create type public.role_user as enum (
  'pegawai',          -- mengajukan permintaan
  'pengurus_barang',  -- sarpras: barang masuk, penyiapan, penyerahan
  'tata_usaha'        -- admin: menyetujui atau menolak, kelola master
);

create type public.status_permintaan as enum (
  'draft', 'diajukan', 'disetujui', 'siap_diambil', 'selesai',
  'ditolak', 'dibatalkan'
);

create type public.jenis_mutasi as enum (
  'masuk', 'keluar', 'penyesuaian', 'rusak_kadaluarsa'
);

-- -------------------------------------------------------------
-- Penomoran dokumen: global, satu urutan berjalan terus.
-- Sequence dipilih justru karena aman saat dua orang menyimpan
-- bersamaan - tidak perlu penguncian tabel.
-- -------------------------------------------------------------

create sequence public.seq_permintaan;
create sequence public.seq_penerimaan;

-- -------------------------------------------------------------
-- Master dan referensi
-- -------------------------------------------------------------

create table public.unit_kerja (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null unique,
  aktif      boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.unit_kerja is
  'Tata Usaha, Kepala Sekolah, Wakil Kurikulum, Wakil Kesiswaan, Sarana Prasarana, Guru. Tabel, bukan teks bebas, supaya laporan konsumsi tidak pecah karena beda ejaan.';

-- Perpanjangan 1-1 dari auth.users. Password, sesi, dan reset
-- ditangani Supabase Auth, bukan tabel ini.
create table public.profil (
  id            uuid primary key references auth.users (id) on delete cascade,
  nama_lengkap  text not null,
  unit_kerja_id uuid references public.unit_kerja (id) on delete restrict,
  role          public.role_user not null default 'pegawai',
  aktif         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_profil_role on public.profil (role) where aktif;

-- Master barang sengaja tipis: kode, nama, satuan.
-- Tidak ada stok minimum, tidak ada batas per permintaan, dan tidak
-- ada kolom `aktif` - ketersediaan barang bukan sesuatu yang diketik
-- orang, melainkan hasil hitung mutasi. Barang berstok nol otomatis
-- mati di katalog, dan barang yang tidak dipakai lagi sampai ke
-- keadaan yang sama dengan sendirinya.
--
-- `kode` disalin apa adanya dari Excel inventaris sekolah
-- (contoh: 1.1.7.01.02.01.001.00852). Tidak ada format yang
-- dipaksakan dan tidak ada nomor yang dibuatkan database - kode itu
-- sudah punya arti di luar aplikasi ini, jadi aplikasi hanya
-- menyimpannya dan menjaga keunikannya.
create table public.barang (
  id          uuid primary key default gen_random_uuid(),
  kode        text not null unique,
  nama        text not null,
  satuan      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Alur permintaan
--
--   draft -> diajukan -> disetujui -> siap_diambil -> selesai
--            (pegawai)  (tata usaha)  (pengurus)     (pengurus)
-- -------------------------------------------------------------

create table public.permintaan (
  id                 uuid primary key default gen_random_uuid(),
  nomor              text unique,
  pemohon_id         uuid not null references public.profil (id) on delete restrict,
  unit_kerja_id      uuid not null references public.unit_kerja (id) on delete restrict,
  status             public.status_permintaan not null default 'draft',
  keperluan          text not null,
  tanggal_dibutuhkan date,
  catatan_pemohon    text,
  disetujui_oleh     uuid references public.profil (id) on delete restrict,
  disiapkan_oleh     uuid references public.profil (id) on delete restrict,
  diserahkan_oleh    uuid references public.profil (id) on delete restrict,
  alasan_tolak       text,
  diajukan_at        timestamptz,
  disetujui_at       timestamptz,
  siap_at            timestamptz,
  selesai_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint nomor_ada_setelah_draft check (
    status = 'draft' or nomor is not null
  ),
  constraint alasan_tolak_wajib check (
    status <> 'ditolak' or coalesce(btrim(alasan_tolak), '') <> ''
  )
);

create index idx_permintaan_pemohon on public.permintaan (pemohon_id, created_at desc);
create index idx_permintaan_status  on public.permintaan (status, created_at desc);

comment on column public.permintaan.unit_kerja_id is
  'Disalin dari profil saat pengajuan. Orang pindah unit kerja; laporan lama harus tetap benar.';

-- Tidak ada kolom jumlah_diberi. Permintaan dilayani utuh atau tidak
-- sama sekali: kalau satu barang saja stoknya kurang, seluruh
-- penyiapan gagal dan tidak satu pun mutasi terbit.
create table public.permintaan_item (
  id                   uuid primary key default gen_random_uuid(),
  permintaan_id        uuid not null references public.permintaan (id) on delete cascade,
  barang_id            uuid not null references public.barang (id) on delete restrict,
  nama_barang_snapshot text not null,
  satuan_snapshot      text not null,
  jumlah_diminta       integer not null check (jumlah_diminta > 0),

  unique (permintaan_id, barang_id)
);

create index idx_permintaan_item_permintaan on public.permintaan_item (permintaan_id);
create index idx_permintaan_item_barang     on public.permintaan_item (barang_id);

comment on column public.permintaan_item.jumlah_diminta is
  'Tidak pernah berubah setelah diajukan, dan inilah angka yang mengurangi stok saat penyiapan - all-or-nothing.';

-- Pengganti bukti serah terima digital: siapa memindahkan status
-- apa, kapan. Append-only, ditulis oleh trigger.
create table public.permintaan_log (
  id            uuid primary key default gen_random_uuid(),
  permintaan_id uuid not null references public.permintaan (id) on delete cascade,
  status_dari   public.status_permintaan,
  status_ke     public.status_permintaan not null,
  oleh          uuid references public.profil (id) on delete set null,
  catatan       text,
  created_at    timestamptz not null default now()
);

create index idx_permintaan_log_permintaan on public.permintaan_log (permintaan_id, created_at);

-- -------------------------------------------------------------
-- Dokumen barang masuk
-- -------------------------------------------------------------

create table public.penerimaan (
  id           uuid primary key default gen_random_uuid(),
  nomor        text not null unique,
  tanggal      date not null default current_date,
  no_dokumen   text,
  catatan      text,
  dibuat_oleh  uuid default auth.uid() references public.profil (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.penerimaan_item (
  id                   uuid primary key default gen_random_uuid(),
  penerimaan_id        uuid not null references public.penerimaan (id) on delete cascade,
  barang_id            uuid not null references public.barang (id) on delete restrict,
  nama_barang_snapshot text not null,
  satuan_snapshot      text not null,
  jumlah               integer not null check (jumlah > 0),
  harga_satuan         numeric(12,2) check (harga_satuan >= 0)
);

create index idx_penerimaan_item_penerimaan on public.penerimaan_item (penerimaan_id);
create index idx_penerimaan_item_barang     on public.penerimaan_item (barang_id);

-- -------------------------------------------------------------
-- Buku mutasi - satu-satunya sumber kebenaran stok
-- -------------------------------------------------------------

create table public.mutasi_stok (
  id                 uuid primary key default gen_random_uuid(),
  barang_id          uuid not null references public.barang (id) on delete restrict,
  jenis              public.jenis_mutasi not null,
  jumlah             integer not null,
  penerimaan_item_id uuid references public.penerimaan_item (id) on delete restrict,
  permintaan_item_id uuid references public.permintaan_item (id) on delete restrict,
  catatan            text,
  -- Diisi sendiri dari auth.uid() supaya baris tanpa dokumen induk -
  -- penyesuaian, barang rusak - tidak pernah kehilangan jejak siapa
  -- yang menulisnya. Fungsi yang mengisinya eksplisit tetap menang.
  dibuat_oleh        uuid default auth.uid() references public.profil (id) on delete set null,
  created_at         timestamptz not null default now(),

  -- Kolom jumlah bertanda: positif menambah, negatif mengurangi.
  -- Dengan begitu stok cukup SUM(jumlah), tanpa percabangan apa pun.
  constraint tanda_cocok_jenis check (
    (jenis = 'masuk' and jumlah > 0)
    or (jenis in ('keluar', 'rusak_kadaluarsa') and jumlah < 0)
    or (jenis = 'penyesuaian' and jumlah <> 0)
  ),

  constraint paling_banyak_satu_induk check (
    num_nonnulls(penerimaan_item_id, permintaan_item_id) <= 1
  ),

  -- Mutasi tanpa dokumen induk tetap boleh ada - barang rusak,
  -- kedaluwarsa, atau koreksi hasil hitung fisik memang tidak punya
  -- dokumen - tapi tidak boleh muncul tanpa penjelasan.
  constraint catatan_wajib_bila_tanpa_induk check (
    num_nonnulls(penerimaan_item_id, permintaan_item_id) = 1
    or coalesce(btrim(catatan), '') <> ''
  )
);

create index idx_mutasi_barang on public.mutasi_stok (barang_id, created_at);

-- Setiap baris dokumen menghasilkan paling banyak satu mutasi.
create unique index uq_mutasi_penerimaan_item
  on public.mutasi_stok (penerimaan_item_id) where penerimaan_item_id is not null;
create unique index uq_mutasi_permintaan_item
  on public.mutasi_stok (permintaan_item_id) where permintaan_item_id is not null;

comment on table public.mutasi_stok is
  'Append-only. Koreksi dilakukan dengan menulis baris lawan, bukan dengan UPDATE - persis seperti jurnal pembukuan. Opname tidak lagi jadi dokumen tersendiri; koreksi hitung fisik ditulis sebagai penyesuaian bercatatan.';
