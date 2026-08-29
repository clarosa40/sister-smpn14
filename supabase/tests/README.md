# Menguji skema tanpa Docker

Keduanya menjalankan seluruh migration di atas Postgres asli (PGlite, WASM —
tanpa Docker dan tanpa koneksi ke Supabase). Skema `auth` dan fungsi
`auth.uid()` distub di awal skrip karena keduanya milik Supabase dan tidak ada
di Postgres polos. Selebihnya SQL yang sama persis dengan yang nanti dijalankan
`supabase db push`.

## Uji otomatis

```
npm run db:test
```

Memerankan tiga akun sungguhan — pegawai, pengurus barang, dan tata usaha —
untuk memastikan RLS, mesin status, aturan all-or-nothing, dan penulisan mutasi
berperilaku benar. Setiap baris `ok` adalah satu aturan yang dijamin; baca
`alur.mjs` untuk melihat SQL yang membuktikannya. Jalankan ulang setiap kali
migration berubah.

## Coba sendiri

```
npm run db:sandbox
```

REPL SQL dengan tiga akun siap pakai. Ganti akun dengan `\siapa`, lalu ketik
SQL apa saja — RLS dan seluruh trigger berlaku persis seperti nanti di
produksi, jadi penolakan yang muncul di sini adalah penolakan yang sungguhan.

| perintah | guna |
|---|---|
| `\siapa tu\|sarpras\|guru` | ganti akun yang sedang login |
| `\alur` | diagram status permintaan |
| `\stok` | angka stok — hanya tu dan sarpras yang dapat isinya |
| `\katalog` | katalog seperti yang dilihat pegawai |
| `\permintaan` | permintaan yang boleh dilihat akun ini |
| `\log SPB-000001` | riwayat status satu permintaan |
| `\reset` | kosongkan transaksi, master dan akun tetap |
| `\?` | seluruh perintah dan contoh alur lengkap |

Yang paling layak dicoba adalah hal-hal yang **seharusnya gagal**: minta barang
berstok nol, setujui permintaan sebagai `guru`, siapkan permintaan yang satu
barangnya kurang lalu periksa `\stok` — tidak ada yang berkurang.
