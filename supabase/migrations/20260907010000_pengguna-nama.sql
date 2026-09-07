-- =============================================================
-- SIPB SMPN 14 - nama_pengguna di view pengguna
--
-- Menambah nama_pengguna - separuh alamat sebelum @ - di samping
-- email yang sudah ada. Kelola Pengguna dan pencariannya sejak
-- issue 04 memakai kolom ini, bukan email: domain yang sama di
-- setiap baris berhenti mendesak nama yang sungguh membedakan
-- baris satu sama lain keluar dari sel yang memotong teks, dan
-- pencarian berhenti mencocokkan domain yang tidak lagi ada di
-- kolom itu. split_part yang sama sudah dipakai handle_new_user()
-- di 20260825020000_fungsi.sql untuk nama lengkap cadangan.
--
-- CREATE OR REPLACE VIEW, bukan drop lalu create: kolom lama harus
-- tetap sama nama, urutan, dan tipenya (dipenuhi di sini - tidak
-- satu pun diubah), nama_pengguna sekadar ditambahkan di ujung.
-- Itu pula sebabnya grant select di bawah tidak perlu diulang -
-- drop akan mencabutnya, replace tidak.
-- =============================================================

create or replace view public.pengguna
with (security_invoker = false, security_barrier = true)
as
select
  p.id,
  p.nama_lengkap,
  p.role,
  p.aktif,
  p.unit_kerja_id,
  uk.nama as unit_kerja,
  u.email,
  coalesce((u.raw_app_meta_data ->> 'sandi_sementara')::boolean, false)
    as sandi_sementara,
  p.created_at,
  split_part(u.email, '@', 1) as nama_pengguna
from public.profil p
join auth.users u on u.id = p.id
left join public.unit_kerja uk on uk.id = p.unit_kerja_id
where public.is_tu();

comment on view public.pengguna is
  'Daftar akun untuk halaman Kelola Pengguna. Pegawai yang menanyakannya menerima nol baris, bukan galat. sandi_sementara ikut di sini - bukan diambil lewat Admin API - karena join-nya toh sudah terbuka: satu ekspresi, dan halaman daftar terhindar dari satu panggilan istimewa. nama_pengguna adalah separuh alamat sebelum @ - satu-satunya bentuk yang dirender dan dicari; email tetap ada karena ganti-sandi/actions.ts masih memakai alamat penuh untuk otentikasi ulang.';
