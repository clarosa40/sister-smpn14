-- =============================================================
-- SIPB SMPN 14 - Pindahkan gerbang peran: pengurus barang menyetujui,
-- tata usaha menggerakkan stok
--
-- Lihat docs/adr/0006-pengurus-barang-menyetujui-tata-usaha-melayani.md.
-- Ini murni pemindahan kapabilitas antara dua peran yang sudah ada -
-- enum role_user, akun, dan siapa yang memegangnya tidak berubah sama
-- sekali. Master data (kelola_barang, kelola_unit_kerja, kelola_profil)
-- dan is_staf() tidak disentuh; hanya persetujuan yang berpindah ke
-- pengurus barang, dan seluruh pergerakan fisik stok - penerimaan,
-- penyiapan, penyerahan, penyesuaian - berpindah ke tata usaha.
-- =============================================================

-- -------------------------------------------------------------
-- Helper peran. Badannya tidak berubah - keduanya tetap predikat
-- "siapa orangnya", bukan "apa yang boleh dia lakukan"; hanya
-- komentar di atasnya yang diperbarui supaya tidak lagi menyesatkan.
-- -------------------------------------------------------------

-- Tata usaha: memegang master data dan sekarang juga seluruh
-- pergerakan fisik stok - barang masuk, penyiapan, penyerahan,
-- penyesuaian.
create or replace function public.is_tu()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.peran_saya() = 'tata_usaha', false)
$$;

-- Pengurus barang: satu-satunya yang menyetujui atau menolak
-- permintaan. Tidak lagi menggerakkan stok.
create or replace function public.is_pengurus()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.peran_saya() = 'pengurus_barang', false)
$$;

-- -------------------------------------------------------------
-- Penerimaan: mencatat barang masuk sekarang tugas tata usaha.
-- -------------------------------------------------------------

drop policy kelola_penerimaan on public.penerimaan;
create policy kelola_penerimaan on public.penerimaan
  for all to authenticated using (public.is_tu()) with check (public.is_tu());

drop policy kelola_penerimaan_item on public.penerimaan_item;
create policy kelola_penerimaan_item on public.penerimaan_item
  for all to authenticated using (public.is_tu()) with check (public.is_tu());

-- -------------------------------------------------------------
-- siapkan_permintaan() - sekarang tata usaha yang menyiapkan.
-- -------------------------------------------------------------

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
  if not public.is_tu() then
    raise exception 'Hanya tata usaha yang boleh menyiapkan permintaan'
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
    raise exception 'Permintaan berstatus % belum bisa disiapkan; menunggu persetujuan pengurus barang',
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

-- -------------------------------------------------------------
-- catat_penerimaan() - sekarang tata usaha yang mencatat.
-- -------------------------------------------------------------

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
  if not public.is_tu() then
    raise exception 'Hanya tata usaha yang boleh mencatat penerimaan'
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

-- -------------------------------------------------------------
-- catat_penyesuaian() - sekarang tata usaha yang mencatat.
-- -------------------------------------------------------------

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
  if not public.is_tu() then
    raise exception 'Hanya tata usaha yang boleh mencatat penyesuaian stok'
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

-- -------------------------------------------------------------
-- jaga_alur_permintaan() - persetujuan berpindah ke pengurus barang,
-- penyiapan dan penyerahan berpindah ke tata usaha. Direkreasi utuh
-- dari versi terbarunya, 20260911010000_nomor-permintaan-tanggal.sql,
-- bukan dari 20260825020000_fungsi.sql maupun 20260907020000: nomor
-- permintaan berbasis tanggal dan aturan tanggalnya ikut terbawa, alih-alih
-- diam-diam kembali ke versi lama. Komentar penjelas yang ada sejak
-- 20260907020000 dipertahankan; versi 20260911010000 menjatuhkannya tanpa
-- alasan yang tercatat.
--
-- Nama berkas migrasi ini pernah 20260908010000. Dinaikkan ke 20260913010000
-- saat rebase supaya ia berjalan SESUDAH 20260911010000 - yang menciptakan
-- ulang fungsi yang sama dan, dengan urutan lama, mengembalikan gerbang peran
-- ke versi sebelum migrasi ini.
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
  v_isi    integer;
  v_tahun  int;
  v_seq    int;
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

    -- Permintaan yang lahir berstatus diajukan tidak mungkin punya
    -- barang: baris permintaan_item merujuk id yang belum terbit.
    -- Karena itu pesannya sama persis dengan yang di jalur UPDATE -
    -- yang salah memang hal yang sama.
    if new.status = 'diajukan' then
      raise exception 'Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.'
        using errcode = 'P0001';
    end if;

    if new.status <> 'draft' then
      raise exception 'Permintaan baru hanya boleh berstatus draft'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  new.updated_at := now();

  -- Isi permintaan beku begitu ia keluar dari draft. Pemeriksaan ini
  -- harus berada di atas "pulang lebih dulu" di bawahnya: suntingan
  -- diam-diam justru yang statusnya tidak berpindah.
  if old.status <> 'draft' then
    if new.pemohon_id            is distinct from old.pemohon_id
       or new.unit_kerja_id      is distinct from old.unit_kerja_id
       or new.keperluan          is distinct from old.keperluan
       or new.tanggal            is distinct from old.tanggal
       or new.tanggal_dibutuhkan is distinct from old.tanggal_dibutuhkan
       or new.catatan_pemohon    is distinct from old.catatan_pemohon
       or new.nomor              is distinct from old.nomor
       or new.diajukan_at        is distinct from old.diajukan_at
       or new.disetujui_at       is distinct from old.disetujui_at
       or new.disetujui_oleh     is distinct from old.disetujui_oleh
       or new.siap_at            is distinct from old.siap_at
       or new.disiapkan_oleh     is distinct from old.disiapkan_oleh
       or new.selesai_at         is distinct from old.selesai_at
       or new.diserahkan_oleh    is distinct from old.diserahkan_oleh then
      raise exception 'Isi permintaan yang sudah diajukan tidak bisa diubah lagi.'
        using errcode = 'P0001';
    end if;

    if new.alasan_tolak is distinct from old.alasan_tolak
       and (new.status <> 'ditolak' or new.status = old.status) then
      raise exception 'Alasan penolakan hanya bisa ditulis saat permintaan ditolak.'
        using errcode = 'P0001';
    end if;
  end if;

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

    if new.status in ('disetujui', 'ditolak') and not public.is_pengurus() then
      raise exception 'Hanya pengurus barang yang boleh menyetujui atau menolak permintaan'
        using errcode = '42501';
    end if;

    if new.status in ('siap_diambil', 'selesai') and not public.is_tu() then
      raise exception 'Hanya tata usaha yang boleh menyiapkan dan menyerahkan barang'
        using errcode = '42501';
    end if;
  end if;

  -- Sampai di sini statusnya pasti berubah - fungsi ini sudah pulang
  -- lebih dulu kalau tidak - jadi hitungan ini hanya berjalan pada
  -- perpindahan menuju diajukan, bukan pada setiap penyimpanan draft.
  if new.status = 'diajukan' then
    select count(*) into v_isi
    from public.permintaan_item pi
    where pi.permintaan_id = new.id;

    if v_isi = 0 then
      raise exception 'Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.'
        using errcode = 'P0001';
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
    if new.tanggal is null then
      raise exception 'new row for relation "permintaan" violates check constraint "tanggal_ada_setelah_draft"'
        using errcode = '23514';
    end if;

    v_tahun := extract(year from new.tanggal)::int;

    insert into public.nomor_counter (tahun, seq)
    values (v_tahun, 1)
    on conflict (tahun) do update set seq = public.nomor_counter.seq + 1
    returning seq into v_seq;

    if v_seq > 999 then
      raise exception 'Urutan nomor untuk tahun % sudah penuh (maksimal 999)', v_tahun
        using errcode = 'P0001';
    end if;

    new.nomor := 'SPB/'
      || v_tahun::text
      || '/'
      || lpad(extract(month from new.tanggal)::int::text, 2, '0')
      || '/'
      || lpad(v_seq::text, 3, '0');
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
