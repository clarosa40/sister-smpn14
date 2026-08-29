-- =============================================================
-- SIPB SMPN 14 - Fungsi, trigger, dan alur
--
-- Semua fungsi memakai `set search_path = ''` dan nama berkualifikasi
-- penuh; itu syarat wajar untuk fungsi SECURITY DEFINER supaya tidak
-- bisa dibajak lewat search_path pemanggil.
-- =============================================================

-- -------------------------------------------------------------
-- Helper peran. SECURITY DEFINER supaya policy RLS di tabel profil
-- tidak memanggil dirinya sendiri secara rekursif.
-- -------------------------------------------------------------

create or replace function public.peran_saya()
returns public.role_user
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profil p
  where p.id = (select auth.uid()) and p.aktif
$$;

-- Tata usaha: menyetujui atau menolak, dan memegang master data.
create or replace function public.is_tu()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.peran_saya() = 'tata_usaha', false)
$$;

-- Pengurus barang (sarpras): satu-satunya yang menggerakkan stok -
-- barang masuk, penyiapan, penyerahan.
create or replace function public.is_pengurus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.peran_saya() = 'pengurus_barang', false)
$$;

-- Keduanya boleh melihat angka stok dan seluruh permintaan yang
-- masuk; yang membedakan adalah apa yang boleh mereka tulis.
create or replace function public.is_staf()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.peran_saya() in ('tata_usaha', 'pengurus_barang'), false)
$$;

-- -------------------------------------------------------------
-- Stok satu barang. Dipakai view, trigger katalog, dan penyiapan -
-- supaya definisi stok hanya ditulis satu kali.
-- -------------------------------------------------------------

create or replace function public.stok(p_barang_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(m.jumlah), 0)::integer
  from public.mutasi_stok m
  where m.barang_id = p_barang_id
$$;

-- -------------------------------------------------------------
-- Utilitas umum
-- -------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_profil_updated_at
  before update on public.profil
  for each row execute function public.set_updated_at();

create trigger trg_barang_updated_at
  before update on public.barang
  for each row execute function public.set_updated_at();

-- Penjaga tabel append-only. RLS sudah menutup jalur API, ini
-- menutup jalur SQL editor juga.
create or replace function public.tolak_ubah_hapus()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tabel % bersifat append-only; tulis baris lawan, jangan ubah baris lama', tg_table_name
    using errcode = 'P0001';
end;
$$;

create trigger trg_mutasi_append_only
  before update or delete on public.mutasi_stok
  for each row execute function public.tolak_ubah_hapus();

create trigger trg_log_append_only
  before update or delete on public.permintaan_log
  for each row execute function public.tolak_ubah_hapus();

-- -------------------------------------------------------------
-- Profil dibuat otomatis saat akun Supabase Auth dibuat.
-- Peran default pegawai; pengurus barang dan tata usaha dinaikkan
-- manual oleh tata usaha.
-- -------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profil (id, nama_lengkap)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nama_lengkap'), ''),
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- Nomor dokumen: global, dari sequence.
-- -------------------------------------------------------------

create or replace function public.nomor_penerimaan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nomor is null then
    new.nomor := 'TRM-' || lpad(nextval('public.seq_penerimaan')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_penerimaan_nomor
  before insert on public.penerimaan
  for each row execute function public.nomor_penerimaan();

-- -------------------------------------------------------------
-- Baris permintaan: snapshot nama/satuan dibekukan di server, dan
-- barang yang stoknya habis ditolak di sini - bukan hanya dinonaktifkan
-- di katalog. "Disabled" yang hanya hidup di React bukan aturan.
-- -------------------------------------------------------------

create or replace function public.siapkan_permintaan_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.barang;
begin
  select * into b from public.barang where id = new.barang_id;

  if not found then
    raise exception 'Barang tidak dikenal' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.nama_barang_snapshot := b.nama;
    new.satuan_snapshot      := b.satuan;
  end if;

  if public.stok(new.barang_id) <= 0 then
    raise exception '% sedang kosong dan belum bisa diminta', b.nama
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_permintaan_item_siapkan
  before insert or update on public.permintaan_item
  for each row execute function public.siapkan_permintaan_item();

-- Snapshot yang sama untuk baris penerimaan.
create or replace function public.siapkan_penerimaan_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.barang;
begin
  select * into b from public.barang where id = new.barang_id;
  if not found then
    raise exception 'Barang tidak dikenal' using errcode = 'P0001';
  end if;
  new.nama_barang_snapshot := b.nama;
  new.satuan_snapshot      := b.satuan;
  return new;
end;
$$;

create trigger trg_penerimaan_item_siapkan
  before insert on public.penerimaan_item
  for each row execute function public.siapkan_penerimaan_item();

-- -------------------------------------------------------------
-- Mesin status permintaan
--
--   draft -> diajukan -> disetujui -> siap_diambil -> selesai
--            (pegawai)  (tata usaha)  (pengurus)     (pengurus)
--
-- Keluar jalur: ditolak (tata usaha, alasan wajib, dari diajukan
-- maupun disetujui - stok bisa saja tidak pernah datang) dan
-- dibatalkan (pemohon, hanya selagi belum disetujui).
-- -------------------------------------------------------------

create or replace function public.jaga_alur_permintaan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_unit   uuid;
  v_sah    boolean;
  v_belum  integer;
begin
  if tg_op = 'INSERT' then
    new.pemohon_id := coalesce(new.pemohon_id, v_uid);

    if new.unit_kerja_id is null then
      select p.unit_kerja_id into v_unit from public.profil p where p.id = new.pemohon_id;
      if v_unit is null then
        raise exception 'Akun Anda belum terhubung ke unit kerja. Minta tata usaha mengisinya lebih dulu.'
          using errcode = 'P0001';
      end if;
      new.unit_kerja_id := v_unit;
    end if;

    if new.status not in ('draft', 'diajukan') then
      raise exception 'Permintaan baru hanya boleh berstatus draft atau diajukan'
        using errcode = 'P0001';
    end if;

    if new.status = 'diajukan' then
      new.nomor       := coalesce(new.nomor, 'SPB-' || lpad(nextval('public.seq_permintaan')::text, 6, '0'));
      new.diajukan_at := now();
    end if;

    return new;
  end if;

  new.updated_at := now();

  if new.status = old.status then
    return new;
  end if;

  v_sah := case old.status
    when 'draft'        then new.status = 'diajukan'
    when 'diajukan'     then new.status in ('disetujui', 'ditolak', 'dibatalkan')
    when 'disetujui'    then new.status in ('siap_diambil', 'ditolak')
    when 'siap_diambil' then new.status = 'selesai'
    else false
  end;

  if not v_sah then
    raise exception 'Transisi status % -> % tidak diizinkan', old.status, new.status
      using errcode = 'P0001';
  end if;

  -- v_uid kosong berarti pemanggilnya bukan sesi pengguna: migrasi,
  -- service_role, atau SQL editor. Pemeriksaan peran dilewati di situ,
  -- sama seperti di jaga_profil().
  if v_uid is not null then
    if new.status in ('diajukan', 'dibatalkan')
       and new.pemohon_id is distinct from v_uid then
      raise exception 'Hanya pemohon sendiri yang boleh mengajukan atau membatalkan permintaannya'
        using errcode = '42501';
    end if;

    if new.status in ('disetujui', 'ditolak') and not public.is_tu() then
      raise exception 'Hanya tata usaha yang boleh menyetujui atau menolak permintaan'
        using errcode = '42501';
    end if;

    if new.status in ('siap_diambil', 'selesai') and not public.is_pengurus() then
      raise exception 'Hanya pengurus barang yang boleh menyiapkan dan menyerahkan barang'
        using errcode = '42501';
    end if;
  end if;

  -- siap_diambil hanya sah kalau stoknya benar-benar sudah keluar.
  -- Ini yang menutup jalan pintas "update status" tanpa lewat
  -- siapkan_permintaan(), yang akan membuat barang berpindah tanpa
  -- pernah tercatat di buku mutasi.
  if new.status = 'siap_diambil' then
    select count(*) into v_belum
    from public.permintaan_item pi
    where pi.permintaan_id = new.id
      and not exists (
        select 1 from public.mutasi_stok m where m.permintaan_item_id = pi.id
      );

    if v_belum > 0 then
      raise exception 'Barang belum dikeluarkan dari stok; pakai siapkan_permintaan() untuk menyiapkan permintaan ini'
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'diajukan' and new.nomor is null then
    new.nomor := 'SPB-' || lpad(nextval('public.seq_permintaan')::text, 6, '0');
  end if;

  case new.status
    when 'diajukan'     then new.diajukan_at := now();
    when 'disetujui'    then new.disetujui_at := now();
                             new.disetujui_oleh := coalesce(new.disetujui_oleh, v_uid);
    when 'siap_diambil' then new.siap_at := now();
                             new.disiapkan_oleh := coalesce(new.disiapkan_oleh, v_uid);
    when 'selesai'      then new.selesai_at := now();
                             new.diserahkan_oleh := coalesce(new.diserahkan_oleh, v_uid);
    else null;
  end case;

  return new;
end;
$$;

create trigger trg_permintaan_alur
  before insert or update on public.permintaan
  for each row execute function public.jaga_alur_permintaan();

-- Log ditulis sistem, bukan aplikasi. SECURITY DEFINER supaya tabel
-- log tidak perlu policy INSERT untuk siapa pun.
create or replace function public.catat_log_permintaan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.permintaan_log (permintaan_id, status_dari, status_ke, oleh)
    values (new.id, null, new.status, (select auth.uid()));

  elsif new.status is distinct from old.status then
    insert into public.permintaan_log (permintaan_id, status_dari, status_ke, oleh, catatan)
    values (
      new.id, old.status, new.status, (select auth.uid()),
      case when new.status = 'ditolak' then new.alasan_tolak end
    );
  end if;

  return null;
end;
$$;

create trigger trg_permintaan_log
  after insert or update on public.permintaan
  for each row execute function public.catat_log_permintaan();

-- =============================================================
-- siapkan_permintaan()
--
-- Penyiapan barang oleh pengurus barang, dan satu-satunya jalan
-- menulis mutasi keluar. SECURITY DEFINER karena pemeriksaan stok dan
-- penulisan mutasi harus terjadi dalam satu transaksi, dan karena
-- pegawai tidak boleh punya akses baca ke mutasi_stok sama sekali.
--
-- All-or-nothing: satu barang saja yang stoknya kurang membuat
-- seluruh transaksi gagal. Tidak ada pemenuhan sebagian, jadi tidak
-- ada angka yang perlu diketik operator - jumlah yang diminta itulah
-- yang diberikan.
--
-- Permintaan tetap berstatus disetujui saat gagal, bukan otomatis
-- ditolak: barang bisa datang besok, dan menolak permintaan orang
-- tetap keputusan manusia.
-- =============================================================

create or replace function public.siapkan_permintaan(p_permintaan_id uuid)
returns public.permintaan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_permintaan public.permintaan;
  v_item       record;
  v_stok       integer;
  v_jumlah     integer;
begin
  if not public.is_pengurus() then
    raise exception 'Hanya pengurus barang yang boleh menyiapkan permintaan'
      using errcode = '42501';
  end if;

  select * into v_permintaan
  from public.permintaan
  where id = p_permintaan_id
  for update;

  if not found then
    raise exception 'Permintaan tidak ditemukan' using errcode = 'P0002';
  end if;

  if v_permintaan.status <> 'disetujui' then
    raise exception 'Permintaan berstatus % belum bisa disiapkan; menunggu persetujuan tata usaha',
      v_permintaan.status using errcode = 'P0001';
  end if;

  select count(*) into v_jumlah
  from public.permintaan_item
  where permintaan_id = p_permintaan_id;

  if v_jumlah = 0 then
    raise exception 'Permintaan ini tidak punya satu pun barang' using errcode = 'P0001';
  end if;

  -- Kunci baris barang terkait, berurutan menurut id, supaya dua
  -- penyiapan atas barang yang sama tidak lolos pemeriksaan stok
  -- bersamaan - dan tidak saling deadlock.
  perform 1
  from public.barang b
  where b.id in (
    select pi.barang_id from public.permintaan_item pi
    where pi.permintaan_id = p_permintaan_id
  )
  order by b.id
  for update;

  -- Seluruh item diperiksa lebih dulu, baru satu pun mutasi ditulis.
  -- Sebenarnya transaksi sudah menjamin ini, tapi memisahkan
  -- keduanya membuat pesan galat menunjuk barang yang benar-benar
  -- kurang, bukan barang pertama yang kebetulan diproses.
  for v_item in
    select pi.barang_id, pi.jumlah_diminta, pi.nama_barang_snapshot, pi.satuan_snapshot
    from public.permintaan_item pi
    where pi.permintaan_id = p_permintaan_id
    order by pi.barang_id
  loop
    v_stok := public.stok(v_item.barang_id);

    if v_item.jumlah_diminta > v_stok then
      raise exception 'Stok % tidak cukup: tersisa % %, diminta %. Seluruh permintaan tidak jadi disiapkan.',
        v_item.nama_barang_snapshot, v_stok, v_item.satuan_snapshot, v_item.jumlah_diminta
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.mutasi_stok
    (barang_id, jenis, jumlah, permintaan_item_id, dibuat_oleh)
  select pi.barang_id, 'keluar', -pi.jumlah_diminta, pi.id, v_uid
  from public.permintaan_item pi
  where pi.permintaan_id = p_permintaan_id;

  update public.permintaan
  set status = 'siap_diambil'
  where id = p_permintaan_id
  returning * into v_permintaan;

  return v_permintaan;
end;
$$;

revoke all on function public.siapkan_permintaan(uuid) from public, anon;
grant execute on function public.siapkan_permintaan(uuid) to authenticated;

-- =============================================================
-- catat_penerimaan() - menerbitkan mutasi masuk untuk satu dokumen
-- penerimaan yang barisnya sudah lengkap.
-- =============================================================

create or replace function public.catat_penerimaan(p_penerimaan_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_baris integer := 0;
begin
  if not public.is_pengurus() then
    raise exception 'Hanya pengurus barang yang boleh mencatat penerimaan'
      using errcode = '42501';
  end if;

  insert into public.mutasi_stok (barang_id, jenis, jumlah, penerimaan_item_id, dibuat_oleh)
  select pi.barang_id, 'masuk', pi.jumlah, pi.id, v_uid
  from public.penerimaan_item pi
  where pi.penerimaan_id = p_penerimaan_id
    and not exists (
      select 1 from public.mutasi_stok m where m.penerimaan_item_id = pi.id
    );

  get diagnostics v_baris = row_count;
  return v_baris;
end;
$$;

revoke all on function public.catat_penerimaan(uuid) from public, anon;
grant execute on function public.catat_penerimaan(uuid) to authenticated;

-- =============================================================
-- catat_penyesuaian() - koreksi stok setelah hitung fisik.
--
-- Yang diketik orang adalah HASIL HITUNGAN FISIK, bukan selisihnya.
-- Selisih dihitung di sini justru karena itu bagian yang paling
-- gampang salah: menulis 47 di kolom jumlah tidak membuat stok jadi
-- 47, melainkan menambahkannya. Karena stok = SUM(jumlah), database
-- tidak punya cara menangkap kekeliruan itu - jadi angkanya jangan
-- pernah diminta dari pemanggil.
--
-- Mengembalikan selisih yang ditulis; 0 berarti hitungan fisik sudah
-- cocok dengan buku dan tidak ada baris baru yang terbit.
-- =============================================================

create or replace function public.catat_penyesuaian(
  p_barang_id    uuid,
  p_jumlah_fisik integer,
  p_catatan      text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_nama    text;
  v_selisih integer;
begin
  if not public.is_pengurus() then
    raise exception 'Hanya pengurus barang yang boleh mencatat penyesuaian stok'
      using errcode = '42501';
  end if;

  select b.nama into v_nama from public.barang b where b.id = p_barang_id;
  if not found then
    raise exception 'Barang tidak dikenal' using errcode = 'P0001';
  end if;

  if p_jumlah_fisik is null or p_jumlah_fisik < 0 then
    raise exception 'Hasil hitung fisik tidak boleh kosong atau negatif'
      using errcode = 'P0001';
  end if;

  -- Baris penyesuaian tidak punya dokumen induk, jadi catatan adalah
  -- satu-satunya keterangan yang akan dibaca orang enam bulan lagi.
  if coalesce(btrim(p_catatan), '') = '' then
    raise exception 'Penyesuaian wajib menyertakan catatan alasannya'
      using errcode = 'P0001';
  end if;

  v_selisih := p_jumlah_fisik - public.stok(p_barang_id);

  if v_selisih = 0 then
    return 0;
  end if;

  insert into public.mutasi_stok (barang_id, jenis, jumlah, catatan, dibuat_oleh)
  values (p_barang_id, 'penyesuaian', v_selisih, btrim(p_catatan), v_uid);

  return v_selisih;
end;
$$;

revoke all on function public.catat_penyesuaian(uuid, integer, text) from public, anon;
grant execute on function public.catat_penyesuaian(uuid, integer, text) to authenticated;
