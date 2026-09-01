-- =============================================================
-- SIPB SMPN 14 - Permintaan kosong tidak bisa diajukan
--
-- Sampai berkas ini, permintaan tanpa satu pun barang tetap bisa
-- berpindah ke `diajukan`: nomor_ada_setelah_draft maupun mesin
-- status sama-sama meloloskannya. Server action memang menolaknya,
-- tetapi komentar di siapkan_permintaan_item() sudah menyatakan
-- sikap proyek ini - aturan yang hanya hidup di React bukan aturan -
-- dan hal yang sama berlaku untuk aturan yang hanya hidup di server
-- action.
--
-- Jalur INSERT ikut ditutup, dan di situ aturannya jadi lebih
-- sederhana: baris permintaan_item tidak bisa ada sebelum induknya,
-- jadi permintaan yang lahir langsung berstatus diajukan sudah pasti
-- kosong. Membiarkan jalur itu terbuka berarti lubang yang ditutup
-- migrasi ini tetap terjangkau lewat satu pernyataan.
--
-- create or replace atas seluruh fungsi, sebagaimana dituntut
-- Postgres. Trigger trg_permintaan_alur tidak ikut dibuat ulang:
-- ia menunjuk fungsi ini menurut namanya.
-- =============================================================

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

comment on function public.jaga_alur_permintaan() is
  'Mesin status permintaan. Selain transisi dan peran, ia menjaga dua hal yang tidak bisa dijaga constraint: permintaan yang diajukan harus punya barang, dan siap_diambil harus sudah punya mutasi keluar.';

-- =============================================================
-- tolak_ubah_hapus() - izinkan DELETE lewat cascade FK
--
-- permintaan_log.permintaan_id adalah ON DELETE CASCADE, dan setiap
-- permintaan (termasuk draft kosong) sudah punya satu baris log sejak
-- lahir (trg_permintaan_log). Tanpa perubahan ini, menghapus draft mana
-- pun - jalur yang justru diuji bagian "permintaan pegawai" di atas -
-- selalu ditolak trigger append-only ini, membuat policy
-- hapus_permintaan tidak pernah bisa tercapai.
--
-- pg_trigger_depth() > 1 hanya benar saat DELETE ini datang dari cascade
-- FK (dipicu dari dalam proses penghapusan baris induk), tidak pernah
-- benar untuk DELETE atau UPDATE langsung ke tabel ini - itulah yang
-- tetap menjaga "permintaan_log append-only walau lewat SQL editor" di
-- alur.mjs. Fungsi ini juga dipakai trg_mutasi_append_only pada
-- mutasi_stok; aman di sana juga karena setiap FK yang mengarah ke
-- mutasi_stok sudah ON DELETE RESTRICT, jadi jalur cascade ke tabel itu
-- tidak pernah ada.
-- =============================================================

create or replace function public.tolak_ubah_hapus()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  raise exception 'Tabel % bersifat append-only; tulis baris lawan, jangan ubah baris lama', tg_table_name
    using errcode = 'P0001';
end;
$$;
