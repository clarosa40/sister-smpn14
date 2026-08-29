-- =============================================================
-- SIPB SMPN 14 - Row Level Security
--
-- Model peran hidup di sini, bukan di komponen React. Tidak ada
-- policy yang menyasar peran `anon`, jadi pengunjung tanpa sesi
-- tidak melihat apa pun.
--
-- Pembagiannya: tata usaha memegang master data dan keputusan
-- setuju/tolak; pengurus barang memegang seluruh pergerakan fisik
-- stok; pegawai hanya menyentuh permintaannya sendiri.
-- =============================================================

-- Supabase memberikan grant ini secara default; ditulis ulang di sini
-- supaya skema tetap benar kalau dijalankan di Postgres polos, dan
-- supaya jelas bahwa RLS - bukan grant - yang jadi gerbangnya.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

alter table public.unit_kerja      enable row level security;
alter table public.profil          enable row level security;
alter table public.barang          enable row level security;
alter table public.permintaan      enable row level security;
alter table public.permintaan_item enable row level security;
alter table public.permintaan_log  enable row level security;
alter table public.penerimaan      enable row level security;
alter table public.penerimaan_item enable row level security;
alter table public.mutasi_stok     enable row level security;

-- -------------------------------------------------------------
-- Master: semua yang login boleh membaca, hanya tata usaha menulis.
-- Membiarkan pegawai membaca tabel `barang` aman justru karena
-- tabel itu tidak punya kolom stok.
-- -------------------------------------------------------------

create policy baca_unit_kerja on public.unit_kerja
  for select to authenticated using (true);
create policy kelola_unit_kerja on public.unit_kerja
  for all to authenticated using (public.is_tu()) with check (public.is_tu());

create policy baca_barang on public.barang
  for select to authenticated using (true);
create policy kelola_barang on public.barang
  for all to authenticated using (public.is_tu()) with check (public.is_tu());

-- -------------------------------------------------------------
-- Profil
-- -------------------------------------------------------------

create policy baca_profil on public.profil
  for select to authenticated
  using (id = (select auth.uid()) or public.is_staf());

create policy ubah_profil on public.profil
  for update to authenticated
  using (id = (select auth.uid()) or public.is_tu())
  with check (id = (select auth.uid()) or public.is_tu());

create policy kelola_profil on public.profil
  for insert to authenticated
  with check (public.is_tu());

-- RLS bekerja per baris, bukan per kolom. Kenaikan peran sendiri
-- karena itu ditutup di sini.
create or replace function public.jaga_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() kosong berarti pemanggilnya bukan sesi pengguna:
  -- migrasi, service_role, atau SQL editor. Tanpa jalan keluar ini
  -- akun tata usaha pertama tidak akan pernah bisa dibuat.
  if (select auth.uid()) is null or public.is_tu() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.aktif is distinct from old.aktif
     or new.unit_kerja_id is distinct from old.unit_kerja_id then
    raise exception 'Peran, status aktif, dan unit kerja hanya bisa diubah tata usaha'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger trg_profil_jaga
  before update on public.profil
  for each row execute function public.jaga_profil();

-- -------------------------------------------------------------
-- Permintaan
--
-- WITH CHECK sengaja lebih longgar daripada USING: pemohon harus
-- tetap bisa memindahkan permintaannya sendiri ke `dibatalkan`.
-- Legal atau tidaknya transisi - dan peran mana yang boleh
-- memindahkannya - ditegakkan mesin status, bukan RLS.
-- -------------------------------------------------------------

create policy baca_permintaan on public.permintaan
  for select to authenticated
  using (pemohon_id = (select auth.uid()) or public.is_staf());

create policy buat_permintaan on public.permintaan
  for insert to authenticated
  with check (pemohon_id = (select auth.uid()));

create policy ubah_permintaan on public.permintaan
  for update to authenticated
  using (
    (pemohon_id = (select auth.uid()) and status in ('draft', 'diajukan'))
    or public.is_staf()
  )
  with check (pemohon_id = (select auth.uid()) or public.is_staf());

create policy hapus_permintaan on public.permintaan
  for delete to authenticated
  using (pemohon_id = (select auth.uid()) and status = 'draft');

-- -------------------------------------------------------------
-- Baris permintaan: ikut induknya. Hanya pemohon yang menyusunnya,
-- dan hanya selagi permintaan masih draft. Tidak ada peran lain yang
-- boleh menyunting isi keranjang orang - all-or-nothing membuat
-- daftar barang jadi kesepakatan yang tidak ditawar belakangan.
-- -------------------------------------------------------------

create policy baca_permintaan_item on public.permintaan_item
  for select to authenticated
  using (
    exists (
      select 1 from public.permintaan p
      where p.id = permintaan_id
        and (p.pemohon_id = (select auth.uid()) or public.is_staf())
    )
  );

create policy susun_permintaan_item on public.permintaan_item
  for all to authenticated
  using (
    exists (
      select 1 from public.permintaan p
      where p.id = permintaan_id
        and p.pemohon_id = (select auth.uid())
        and p.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.permintaan p
      where p.id = permintaan_id
        and p.pemohon_id = (select auth.uid())
        and p.status = 'draft'
    )
  );

-- -------------------------------------------------------------
-- Log: bisa dibaca sepanjang induknya bisa dibaca, dan tidak bisa
-- ditulis siapa pun lewat API. Penulisnya adalah trigger.
-- -------------------------------------------------------------

create policy baca_permintaan_log on public.permintaan_log
  for select to authenticated
  using (
    exists (
      select 1 from public.permintaan p
      where p.id = permintaan_id
        and (p.pemohon_id = (select auth.uid()) or public.is_staf())
    )
  );

-- -------------------------------------------------------------
-- Dokumen barang masuk dan buku mutasi: pengurus barang yang
-- menulis, tata usaha ikut membaca supaya bisa menimbang persetujuan.
-- -------------------------------------------------------------

create policy baca_penerimaan on public.penerimaan
  for select to authenticated using (public.is_staf());
create policy kelola_penerimaan on public.penerimaan
  for all to authenticated using (public.is_pengurus()) with check (public.is_pengurus());

create policy baca_penerimaan_item on public.penerimaan_item
  for select to authenticated using (public.is_staf());
create policy kelola_penerimaan_item on public.penerimaan_item
  for all to authenticated using (public.is_pengurus()) with check (public.is_pengurus());

create policy baca_mutasi on public.mutasi_stok
  for select to authenticated using (public.is_staf());

-- Hanya INSERT. Tidak ada policy UPDATE maupun DELETE, dan trigger
-- append-only menutup jalur SQL editor. Koreksi = baris lawan.
create policy tulis_mutasi on public.mutasi_stok
  for insert to authenticated with check (public.is_pengurus());
