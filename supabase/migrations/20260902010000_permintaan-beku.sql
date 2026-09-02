-- =============================================================
-- SIPB SMPN 14 - Isi permintaan beku setelah diajukan
--
-- Spesifikasi sub-proyek 4 menyatakan permintaan yang sudah diajukan
-- tidak bisa diubah lagi. Yang benar-benar dijaga baru daftar
-- barangnya: policy susun_permintaan_item menyempit ke status draft.
-- Kepala permintaannya tidak dijaga siapa pun. ubah_permintaan
-- membuka seluruh kolom untuk is_staf(), dan jaga_alur_permintaan()
-- pulang lebih dulu ketika statusnya tidak berubah - jadi keperluan,
-- pemohon_id, atau tanggal_dibutuhkan bisa ditulis ulang tanpa
-- meninggalkan jejak sama sekali, sebab catat_log_permintaan() hanya
-- menulis baris saat status berpindah.
--
-- Sub-proyek inilah yang menaruh orang kedua di depan baris itu, jadi
-- pernyataan tadi dibuat benar di sini. Bloknya diletakkan sebelum
-- "pulang lebih dulu" tersebut: justru di balik pulang itulah
-- suntingan diam-diam lolos selama ini.
--
-- Dua pengecualiannya disengaja:
--
--   old.status = 'draft' dibiarkan bebas. Di situ keranjang diisi, dan
--   di situ pula ajukanPermintaan menulis keperluan,
--   tanggal_dibutuhkan, catatan_pemohon, dan status dalam satu UPDATE.
--
--   alasan_tolak boleh menumpang perpindahan menuju 'ditolak', sebab
--   constraint alasan_tolak_wajib memang menuntutnya ditulis dalam
--   pernyataan yang sama. Yang dilarang adalah menulis ulang alasan
--   itu belakangan, pada baris yang statusnya sedang diam.
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

  -- Isi permintaan beku begitu ia keluar dari draft. Pemeriksaan ini
  -- harus berada di atas "pulang lebih dulu" di bawahnya: suntingan
  -- diam-diam justru yang statusnya tidak berpindah.
  if old.status <> 'draft' then
    if new.pemohon_id            is distinct from old.pemohon_id
       or new.unit_kerja_id      is distinct from old.unit_kerja_id
       or new.keperluan          is distinct from old.keperluan
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
  'Mesin status permintaan. Selain transisi dan peran, ia menjaga tiga hal yang tidak bisa dijaga constraint: permintaan yang diajukan harus punya barang, siap_diambil harus sudah punya mutasi keluar, dan isi permintaan yang sudah keluar dari draft tidak bisa ditulis ulang lagi.';
