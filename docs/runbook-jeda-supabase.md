# Runbook: proyek Supabase dijeda saat libur

Proyek Supabase SIPB pakai paket Free, yang otomatis menjeda (pause) proyek
kalau tidak ada permintaan sama sekali selama 7 hari. Libur sekolah yang lebih
panjang dari seminggu pasti memicu ini.

## Ciri-cirinya

Setelah libur, situs SIPB bermasalah: halaman login tetap muncul tapi gagal
saat mencoba masuk, atau halaman dasbor menampilkan layar error ("Coba lagi").

## Siapa yang bisa memperbaiki

**Tata usaha** — pemegang login akun Supabase.

## Langkah-langkah

1. Masuk (login) ke [supabase.com](https://supabase.com).
2. Buka proyek SIPB.
3. Halaman proyek akan menampilkan status **"Paused"** dan tombol **"Restore
   project"**.
4. Klik tombol itu.
5. Tunggu beberapa menit sampai proyek aktif kembali.
6. Muat ulang (reload) situs SIPB dan coba login lagi.

Catatan: label tombol di atas ("Restore project") sesuai tampilan dasbor
Supabase saat runbook ini ditulis. Kalau tampilannya berubah, cari tombol yang
fungsinya sama (mengaktifkan kembali proyek yang dijeda).

## Apa yang hilang

Tidak ada. Semua data dan akun pengguna tetap ada setelah proyek dijeda —
proyek hanya perlu diaktifkan kembali, tidak dipulihkan dari cadangan.

## Kenapa tidak dicegah dari awal

Dua opsi sudah dipertimbangkan dan sengaja tidak dipakai:

- **Ping terjadwal** supaya proyek selalu aktif — menambah satu hal lagi yang
  bisa diam-diam berhenti bekerja tanpa ketahuan.
- **Naik ke paket Pro** — tidak sepadan untuk ~30 pengguna.

Keputusan ini ada di `.scratch/perbaikan-realistis/issues/11-jeda-proyek-supabase.md`.
Jangan menambahkan ping terjadwal tanpa membuka ulang keputusan itu.
