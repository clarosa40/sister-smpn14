-- =============================================================
-- SIPB SMPN 14 - Kelola pengguna
--
-- Tiga hal: helper is_aktif(), gigi untuk profil.aktif di kelima
-- policy jalur pegawai, dan view yang menyatukan profil dengan
-- alamat email milik Supabase Auth.
-- =============================================================

-- Sebangun dengan peran_saya() dan kawan-kawan: stable, security
-- definer, search_path dikosongkan supaya tidak bisa dibajak.
create or replace function public.is_aktif()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profil p
    where p.id = (select auth.uid()) and p.aktif
  )
$$;

comment on function public.is_aktif() is
  'Akun yang sedang masuk masih aktif? Dipakai policy jalur pegawai. Policy jalur staf tidak memerlukannya: peran_saya() sudah menyaring aktif.';

-- -------------------------------------------------------------
-- Sampai migrasi ini, `aktif` hanya dibaca peran_saya() - jadi
-- menonaktifkan seorang pegawai mencabut hak staf yang memang tidak
-- pernah ia punya, dan ia tetap bisa masuk lalu mengajukan permintaan.
-- Sejak sini aturannya rata: akun nonaktif tidak menulis apa pun.
--
-- `alter policy`, bukan drop-and-create, supaya berkas ini terbaca
-- sebagai amandemen atas rls.sql - bukan salinan keduanya.
-- -------------------------------------------------------------

alter policy buat_permintaan on public.permintaan
  with check (pemohon_id = (select auth.uid()) and public.is_aktif());

alter policy ubah_permintaan on public.permintaan
  using (
    (
      pemohon_id = (select auth.uid())
      and public.is_aktif()
      and status in ('draft', 'diajukan')
    )
    or public.is_staf()
  )
  with check (
    (pemohon_id = (select auth.uid()) and public.is_aktif())
    or public.is_staf()
  );

alter policy hapus_permintaan on public.permintaan
  using (
    pemohon_id = (select auth.uid())
    and public.is_aktif()
    and status = 'draft'
  );

alter policy susun_permintaan_item on public.permintaan_item
  using (
    public.is_aktif()
    and exists (
      select 1 from public.permintaan p
      where p.id = permintaan_id
        and p.pemohon_id = (select auth.uid())
        and p.status = 'draft'
    )
  )
  with check (
    public.is_aktif()
    and exists (
      select 1 from public.permintaan p
      where p.id = permintaan_id
        and p.pemohon_id = (select auth.uid())
        and p.status = 'draft'
    )
  );

-- Cabang "id = auth.uid()" pada ubah_profil sebelumnya lolos tanpa syarat
-- aktif, jadi akun yang baru saja dinonaktifkan tetap bisa menulis ulang
-- nama_lengkap-nya sendiri di baris profil - tanpa batas waktu, sebab
-- menonaktifkan akun tidak mencabut token Supabase Auth yang sedang
-- dipegangnya. Digigit dengan cara yang sama seperti keempat policy di
-- atas: is_tu() tetap lolos tanpa syarat aktif, sebab tata usaha
-- menyunting baris orang lain, bukan barisnya sendiri.
alter policy ubah_profil on public.profil
  using ((id = (select auth.uid()) and public.is_aktif()) or public.is_tu())
  with check ((id = (select auth.uid()) and public.is_aktif()) or public.is_tu());

-- -------------------------------------------------------------
-- View pengguna
--
-- Berjalan sebagai PEMILIKNYA, bukan pemanggil. Itu satu-satunya
-- alasan ia bisa menjangkau auth.users - dan artinya RLS di profil
-- tidak berlaku di sini, sehingga `where public.is_tu()` bukan
-- kenyamanan melainkan seluruh gerbangnya.
--
-- security_barrier menahan WHERE milik pemanggil supaya tidak
-- dievaluasi lebih dulu daripada is_tu(). Harganya predicate
-- pushdown, yang tidak berarti apa-apa untuk seukuran daftar staf.
--
-- Ini memang memicu linter security_definer_view di Supabase.
-- Itu pertukaran yang diterima: pilihan lainnya adalah memberi
-- seluruh `authenticated` hak baca ke auth.users.
-- -------------------------------------------------------------

create view public.pengguna
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
  p.created_at
from public.profil p
join auth.users u on u.id = p.id
left join public.unit_kerja uk on uk.id = p.unit_kerja_id
where public.is_tu();

comment on view public.pengguna is
  'Daftar akun untuk halaman Kelola Pengguna. Pegawai yang menanyakannya menerima nol baris, bukan galat. sandi_sementara ikut di sini - bukan diambil lewat Admin API - karena join-nya toh sudah terbuka: satu ekspresi, dan halaman daftar terhindar dari satu panggilan istimewa.';

-- Wajib. rls.sql memberi grant "all tables in schema public", tetapi
-- itu berjalan jauh sebelum view ini ada.
grant select on public.pengguna to authenticated;
