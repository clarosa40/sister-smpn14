-- =============================================================
-- SIPB SMPN 14 - Data awal
--
-- Hanya master data. Akun dibuat lewat Supabase Auth; profilnya
-- terbentuk otomatis lewat trigger on_auth_user_created dengan
-- peran `pegawai`. Naikkan akun pertama jadi tata usaha secara
-- manual - setelah itu tata usaha bisa mengatur peran orang lain
-- lewat aplikasi:
--
--   update public.profil
--      set role = 'tata_usaha',
--          unit_kerja_id = (select id from public.unit_kerja where nama = 'Tata Usaha')
--    where id = '<uuid akun>';
--
--   update public.profil
--      set role = 'pengurus_barang',
--          unit_kerja_id = (select id from public.unit_kerja where nama = 'Sarana Prasarana')
--    where id = '<uuid akun sarpras>';
-- =============================================================

insert into public.unit_kerja (nama) values
  ('Tata Usaha'),
  ('Kepala Sekolah'),
  ('Wakil Kurikulum'),
  ('Wakil Kesiswaan'),
  ('Sarana Prasarana'),
  ('Guru')
on conflict (nama) do nothing;

-- Seluruh barang lahir dengan stok nol, jadi katalog awal memang
-- kosong seluruhnya sampai pengurus barang mencatat penerimaan
-- pertama. Itu perilaku yang benar, bukan data yang kurang.
--
-- PERHATIAN: kode di bawah ini masih contoh, bukan kode inventaris
-- SMPN 14 yang sebenarnya. Bentuknya sudah mengikuti Excel sekolah
-- (1.1.7.01.02.01.001.00852), tapi angkanya karangan. Ganti seluruh
-- blok ini dengan hasil ekspor Excel sebelum dipakai sungguhan.
insert into public.barang (kode, nama, satuan) values
  ('1.1.7.01.01.01.001.00001', 'Spidol whiteboard hitam',   'pcs'),
  ('1.1.7.01.01.01.001.00002', 'Spidol whiteboard biru',    'pcs'),
  ('1.1.7.01.01.01.001.00003', 'Penghapus whiteboard',      'pcs'),
  ('1.1.7.01.01.01.001.00004', 'Pulpen tinta hitam',        'pcs'),
  ('1.1.7.01.01.01.001.00005', 'Buku tulis folio bergaris', 'buku'),
  ('1.1.7.01.01.01.001.00006', 'Lem kertas stik',           'pcs'),
  ('1.1.7.01.01.01.001.00007', 'Isi staples nomor 10',      'box'),
  ('1.1.7.01.02.01.001.00001', 'Kertas HVS A4 70 gram',     'rim'),
  ('1.1.7.01.02.01.001.00002', 'Kertas HVS F4 70 gram',     'rim'),
  ('1.1.7.01.02.01.001.00003', 'Tinta printer hitam',       'botol'),
  ('1.1.7.01.02.01.001.00004', 'Amplop kop sekolah',        'pcs'),
  ('1.1.7.01.03.01.001.00001', 'Sabun cuci tangan cair',    'botol'),
  ('1.1.7.01.03.01.001.00002', 'Pembersih lantai',          'botol'),
  ('1.1.7.01.03.01.001.00003', 'Kantong sampah besar',      'pack'),
  ('1.1.7.01.03.01.001.00004', 'Kain pel',                  'pcs'),
  ('1.1.7.01.04.01.001.00001', 'Sarung tangan lateks',      'box'),
  ('1.1.7.01.04.01.001.00002', 'Kertas lakmus',             'pack'),
  ('1.1.7.01.04.01.001.00003', 'Alkohol 70 persen',         'botol'),
  ('1.1.7.01.05.01.001.00001', 'Plester luka',              'box'),
  ('1.1.7.01.05.01.001.00002', 'Kasa steril',               'pack'),
  ('1.1.7.01.06.01.001.00001', 'Baterai AA',                'pack'),
  ('1.1.7.01.06.01.001.00002', 'Lampu LED 12 watt',         'pcs')
on conflict (kode) do nothing;
