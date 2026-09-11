-- =============================================================
-- SIPB SMPN 14 – Nomor permintaan berbasis tanggal
--
-- Format lama: SPB-000001  (satu urutan global tanpa tanggal)
-- Format baru: SPB/2026/09/001  (tahun+bulan dari tanggal, urutan per tahun)
--
-- Lihat docs/adr/0004-nomor-permintaan-berbasis-tanggal.md.
--
-- Tabel nomor_counter menyimpan satu baris per tahun dengan urutan
-- terakhir yang sudah terpakai. Trigger mengunci baris itu dengan
-- FOR UPDATE lalu menaikkan — aman untuk dua orang bersamaan,
-- meskipun sedikit lebih berat daripada sequence. Di volume sekolah
-- ini perbedaannya tidak terukur.
--
-- Nomor lama (SPB-NNNNNN) yang sudah ada dibiarkan apa adanya.
-- Constraint unique masih menutup kedua format.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tabel counter
-- -------------------------------------------------------------

create table public.nomor_counter (
  tahun  int  primary key,
  seq    int  not null default 0
);

comment on table public.nomor_counter is
  'Satu baris per tahun, menyimpan urutan nomor permintaan terakhir yang terpakai.';

alter table public.nomor_counter enable row level security;

-- Kalau sudah ada permintaan lama, kita tidak perlu seed — counter
-- baru dimulai dari 0 dan baris lama memakai format berbeda.

-- -------------------------------------------------------------
-- 2. Ganti pembuatan nomor di jaga_alur_permintaan()
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

  if new.status = 'diajukan' then
    select count(*) into v_isi
    from public.permintaan_item pi
    where pi.permintaan_id = new.id;

    if v_isi = 0 then
      raise exception 'Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.'
        using errcode = 'P0001';
    end if;
  end if;

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

-- -------------------------------------------------------------
-- 3. Buang sequence yang tidak terpakai lagi
-- -------------------------------------------------------------

drop sequence public.seq_permintaan;
