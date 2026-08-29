-- =============================================================
-- SIPB SMPN 14 - View turunan
--
-- Kedua view sengaja dibuat SECURITY DEFINER (security_invoker = false)
-- lalu dijaga oleh klausa WHERE-nya sendiri. Alasannya:
--
--   katalog_pemohon harus bisa menjawab "barang ini tersedia?" untuk
--   pegawai, padahal pegawai tidak punya - dan tidak boleh punya -
--   hak baca ke mutasi_stok. Kalau view berjalan sebagai pemanggil,
--   RLS mutasi_stok akan membuat setiap barang tampak kosong.
--
-- Karena itu penyembunyian angka stok jadi batasan database:
-- view pegawai secara struktural tidak punya kolom angka sama sekali.
-- =============================================================

create view public.stok_barang
with (security_invoker = false)
as
select
  b.id                                as barang_id,
  b.kode,
  b.nama,
  b.satuan,
  coalesce(sum(m.jumlah), 0)::integer as stok,
  case when coalesce(sum(m.jumlah), 0) <= 0 then 'kosong' else 'tersedia' end as status
from public.barang b
left join public.mutasi_stok m on m.barang_id = b.id
where public.is_staf()
group by b.id;

comment on view public.stok_barang is
  'Angka stok penuh, untuk pengurus barang dan tata usaha. Pegawai yang menanyakannya menerima nol baris, bukan angka nol.';

create view public.katalog_pemohon
with (security_invoker = false)
as
select
  b.id                           as barang_id,
  b.kode,
  b.nama,
  b.satuan,
  coalesce(sum(m.jumlah), 0) > 0 as tersedia
from public.barang b
left join public.mutasi_stok m on m.barang_id = b.id
group by b.id;

comment on view public.katalog_pemohon is
  'Katalog belanja. Tidak ada satu pun kolom angka. Barang kosong tetap ditampilkan dengan tersedia = false supaya pegawai tahu barangnya memang ada di sekolah ini - hanya sedang habis - tapi barisnya nonaktif: trigger permintaan_item menolak barang berstok nol.';

revoke all on public.stok_barang     from anon, authenticated;
revoke all on public.katalog_pemohon from anon, authenticated;

grant select on public.stok_barang     to authenticated;
grant select on public.katalog_pemohon to authenticated;
