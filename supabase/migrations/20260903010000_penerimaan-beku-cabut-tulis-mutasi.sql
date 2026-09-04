-- =============================================================
-- SIPB SMPN 14 - Bekukan penerimaan tercatat, cabut tulis_mutasi
--
-- Dua aturan yang belum ditegakkan database.
--
-- 1. Penerimaan yang sudah tercatat - salah satu baris penerimaan_item-
--    nya sudah punya mutasi_stok - tidak bisa diubah atau dihapus lagi,
--    baik kepala maupun barisnya. tanggal adalah patokan tanggal setiap
--    laporan pergerakan barang, jadi suntingan belakangan akan membuat
--    dokumen dan buku mutasi berselisih tanpa jejak. Penghapusan baris
--    sebenarnya sudah ditolak foreign key mutasi_stok_penerimaan_item_id_fkey
--    (on delete restrict); trigger ini menggantinya dengan kalimat yang
--    bisa dibaca tata usaha, bukan pelanggaran constraint mentah.
--
--    Pembekuan terikat pada terbitnya mutasi, bukan pada keberadaan
--    dokumennya sendiri: penerimaan yang belum diposting lewat
--    catat_penerimaan() tetap bebas disunting dan dihapus.
--
-- 2. Policy tulis_mutasi dicabut. Policy itu memberi pengurus barang
--    INSERT langsung ke mutasi_stok, jalan pintas yang melewati ketiga
--    fungsi SECURITY DEFINER - bisa menerbitkan stok tanpa dokumen di
--    baliknya, dan menulis selisih penyesuaian yang diketik tangan alih-
--    alih dihitung dari hasil hitung fisik. Tidak ada satu pun bagian
--    aplikasi yang memakainya. Lihat
--    docs/adr/0001-mutasi-hanya-lewat-fungsi.md.
--
--    Koreksi tetap mengikuti disiplin buku mutasi yang sudah ada: tulis
--    baris lawan, jangan pernah menulis ulang riwayat.
-- =============================================================

create or replace function public.tolak_penerimaan_diposting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.penerimaan_item pi
    join public.mutasi_stok m on m.penerimaan_item_id = pi.id
    where pi.penerimaan_id = old.id
  ) then
    raise exception 'Penerimaan % sudah tercatat di buku mutasi dan tidak bisa diubah atau dihapus lagi. Koreksi lewat penyesuaian.',
      old.nomor using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger trg_penerimaan_beku
  before update or delete on public.penerimaan
  for each row execute function public.tolak_penerimaan_diposting();

create or replace function public.tolak_penerimaan_item_diposting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.mutasi_stok m where m.penerimaan_item_id = old.id
  ) then
    raise exception 'Baris penerimaan ini sudah tercatat di buku mutasi dan tidak bisa diubah atau dihapus lagi. Koreksi lewat penyesuaian.'
      using errcode = 'P0001';
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger trg_penerimaan_item_beku
  before update or delete on public.penerimaan_item
  for each row execute function public.tolak_penerimaan_item_diposting();

drop policy tulis_mutasi on public.mutasi_stok;
