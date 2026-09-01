# Sub-project 4: Permintaan Pegawai

## Overview

Fourth deliverable for SIPB SMPN 14. Covers the two pegawai pages — **Katalog
Barang** and **Permintaan Saya** — plus the pegawai half of `/beranda`. With
this, a request can be composed and submitted; approving and fulfilling it are
sub-projects 5 and 6.

Sub-projects 1–3 built the shell, the master data, and the accounts. Every page
so far has been Tata Usaha's. This is the first page a pegawai ever opens, and
the first time the `permintaan` tables — the reason the schema exists — carry a
row written by the application rather than by a test.

## What is already built

Almost all of it, in SQL. This sub-project is UI and server actions over
machinery `alur.mjs` already covers:

- `public.katalog_pemohon` (`view.sql:34`) is the catalog. It is `security
  definer` and has **no numeric column at all** — a pegawai gets `tersedia
  true/false`, never a stock figure. Hiding the number is a structural property
  of the view, not a `select` list the UI is trusted to keep short.
- `siapkan_permintaan_item()` (`fungsi.sql:176`) freezes `nama_barang_snapshot`
  and `satuan_snapshot` server-side, and refuses any item whose stock is zero
  (`fungsi.sql:197`).
- `jaga_alur_permintaan()` (`fungsi.sql:244`) owns the state machine: it fills
  `pemohon_id` and `unit_kerja_id` on insert, mints the `SPB-000123` nomor on
  the move to `diajukan` (`fungsi.sql:274`), stamps every `*_at` column, and
  rejects both illegal transitions and transitions made by the wrong role.
- `catat_log_permintaan()` writes `permintaan_log` on every status change. The
  table has no INSERT policy for anyone; the trigger is the only author.
- RLS already scopes a pegawai to their own requests: `buat_permintaan`
  (`rls.sql:107`), `ubah_permintaan` (`rls.sql:111`), `hapus_permintaan`
  (`rls.sql:119`, draft only), `susun_permintaan_item` (`rls.sql:140`, draft
  only), `baca_permintaan_log` (`rls.sql:164`).

One migration is added, and it is small — see **SQL** below.

## Decisions

- **The draft row is the cart.** "Tambah" on `/katalog` writes a
  `permintaan_item` into the pegawai's open draft, creating the draft if there
  is none. The cart therefore lives in Postgres: it survives a refresh, a
  closed laptop, and a move to a phone. This is what `status = 'draft'`,
  `susun_permintaan_item`, and `hapus_permintaan` were built for — a
  client-side cart would leave all three unused and would defer the zero-stock
  refusal to the moment of submission, when it is most expensive.
- **At most one draft per pegawai.** "Keranjang" has to mean one thing. A
  second request starts after the first is submitted. Nothing in the schema
  enforces this; the application simply never opens a second draft, and
  `ambilDraft()` takes the newest if two ever exist (two tabs, one race).
- **Keperluan is asked at submission, not at the first click.** The draft is
  opened with `keperluan: ''` — the column is `not null`, and an empty string
  satisfies it — and the purpose, `tanggal_dibutuhkan`, and `catatan_pemohon`
  are collected in the submit dialog, where the pegawai can already see the
  whole list. Asking first would put a dialog in front of someone who only
  wanted to grab a box of markers.
- **An emptied cart deletes its draft.** Removing the last item deletes the
  `permintaan` row too, so an empty cart leaves no ghost behind and the "one
  draft" rule stays honest. `hapus_permintaan` permits exactly that delete.
- **The timeline names no one.** `baca_profil` (`rls.sql:50`) lets a pegawai
  read only their own row, so joining `permintaan_log.oleh` to
  `profil.nama_lengkap` returns null for whoever approved. The timeline is
  phrased by status instead — "Disetujui tata usaha", not "Disetujui oleh Ibu
  Sari". This is a deliberate limit, not a gap to work around with a view.
- **No app-shell change.** A live cart badge on the nav item would mean
  threading a count through the dashboard layout into `AppShell` on every
  navigation. The cart announces itself where it is being filled: a sticky bar
  on `/katalog`, and a pinned draft card atop `/permintaan-saya`.
- **Bahasa Indonesia throughout, identifiers included**, as in sub-projects
  1–3.

## Routes

| Path | Auth | Purpose |
|------|------|---------|
| `/katalog` | Pegawai | Browse and search available barang; add to the cart |
| `/permintaan-saya` | Pegawai | The draft, then every submitted request |
| `/permintaan-saya/[id]` | Pegawai (own row) | Edit the draft and submit it; or read a submitted request with its timeline |
| `/beranda` | Pegawai | Three tiles and recent activity, filled for this role only |

Both nav items already exist in `src/config/nav-items.ts` with `roles:
["pegawai"]`, so no nav change is needed. Role enforcement is per page:
`getUserOrRedirect(["pegawai"])` (`dal.ts:116`) sends any other role to
`/beranda`.

`/permintaan-saya/[id]` needs no ownership check of its own. RLS returns no row
for someone else's request, and a missing row renders `notFound()` — the
absence of a leak, rather than a second gate that can drift from the first.

## SQL — `supabase/migrations/20260901010000_permintaan-kosong.sql`

Today a `diajukan` permintaan may have zero items. `nomor_ada_setelah_draft`
(`skema.sql:114`) and the state machine both pass, so nothing stops it. The
server action will refuse it, but this codebase's own comment on
`siapkan_permintaan_item()` says a rule that only lives in React is not a rule,
and the same applies to a rule that only lives in a server action.

`jaga_alur_permintaan()` gains the check on the UPDATE path, guarding the
transition into `diajukan`. Reaching that point already means the status
changed — the function returns early when `new.status = old.status`:

```sql
if new.status = 'diajukan' and not exists (
     select 1 from public.permintaan_item pi where pi.permintaan_id = new.id
   ) then
  raise exception 'Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.'
    using errcode = 'P0001';
end if;
```

The INSERT path needs the same rule, and there it collapses into something
simpler. `permintaan_item` rows cannot exist before their parent, so a request
born `diajukan` (`fungsi.sql:269` permits it today) is *necessarily* empty —
the insert is rejected outright with the same sentence. Nothing is lost:
neither `seed.sql` nor any fixture in `alur.mjs` inserts a submitted request
directly; all of them insert a draft, add items, then update the status
(`alur.mjs:233-283`). Leaving this path open would mean the hole the migration
exists to close stays reachable in one statement.

The migration is a `create or replace` of the whole function, as Postgres
requires; the plan will carry its full text.

## Files

```text
src/lib/permintaan.ts                    LABEL_STATUS, tone per status, ambilDraft(),
                                         pesanGalatPermintaan(), kalimatLog()
src/lib/aksi.ts                          + pastikanPegawai()
src/app/(dashboard)/katalog/
  page.tsx  actions.ts  katalog-daftar.tsx
src/app/(dashboard)/permintaan-saya/
  page.tsx  actions.ts  daftar-permintaan.tsx
  [id]/page.tsx  detail-permintaan.tsx
src/app/(dashboard)/beranda/page.tsx     pegawai tiles + recent activity
supabase/migrations/20260901010000_permintaan-kosong.sql
supabase/tests/alur.mjs                  + the pegawai section
```

`Pencarian` and `siapkanKataKunci` (`aksi.ts:138`) get their third consumer,
unchanged — the move made in sub-project 3 pays for itself here.

`src/lib/permintaan.ts` exists because four surfaces need the same status
vocabulary: the list badge, the detail header, the timeline, and beranda. A
second copy of "which Indonesian word means `siap_diambil`" is exactly the kind
of drift that makes two pages disagree about the same row.

## Flow: filling the cart

1. `/katalog` guards with `pastikanPegawai()`, then reads `katalog_pemohon`
   with the search term and the current draft's items in parallel.
2. If `user.unitKerja` is null the page renders a banner in place of the Tambah
   buttons: the trigger (`fungsi.sql:262`) would raise anyway, but a pegawai
   should not discover a missing unit kerja by clicking. The database keeps its
   guard; the UI simply stops setting them up to fail.
3. `tambahKeKeranjang(barangId)` finds the draft or inserts one with an
   explicit `pemohon_id` and `keperluan: ''`, then inserts the item at
   `jumlah_diminta: 1`.
4. A row already in the cart shows a stepper instead of a button, bound to
   `setelJumlah(barangId, jumlah)`. A `23505` on `(permintaan_id, barang_id)`
   (`skema.sql:139`) — two tabs — falls back to an update rather than an error.
5. Both actions `revalidatePath` `/katalog` and `/permintaan-saya`.

## Flow: submitting

The submit dialog collects keperluan (required, trimmed non-empty),
`tanggal_dibutuhkan` (optional, today or later), and `catatan_pemohon`
(optional). `ajukanPermintaan` writes all three plus `status: 'diajukan'` in
one UPDATE `.select()`ed back. The trigger mints the nomor and stamps
`diajukan_at`; the log row is written by `catat_log_permintaan()`.

Zero rows returned means RLS refused the update — the case `aksi.ts:62-67`
documents, where UPDATE and DELETE fail silently rather than raising. Every
action in this sub-project checks the returned rows, not only the error.

Cancelling is offered only at `diajukan`: the state machine allows `diajukan →
dibatalkan` and nothing after it, so once tata usaha approves, the detail page
says so instead of showing a button that would raise.

## Error translation

`pesanGalatPermintaan(galat)` sits beside `pesanGalatDb`, because the errors
here have a different shape: most arrive as `P0001` from a trigger, already
written as a sentence for the person reading it.

| Case | Shown |
|---|---|
| `P0001`, transition or `siapkan_permintaan()` hint | "Permintaan ini sudah berpindah status. Muat ulang halamannya." |
| `P0001`, any other | The trigger's own message, verbatim |
| `23505` | "Barang itu sudah ada di keranjang." |
| `42501` | "Akun Anda tidak berhak mengubah permintaan ini." |
| anything else | Logged server-side; "Perubahan gagal disimpan. Coba lagi sebentar lagi." |

The pass-through is the point: `"Spidol Whiteboard sedang kosong dan belum bisa
diminta"` and `"Akun Anda belum terhubung ke unit kerja. Minta tata usaha
mengisinya lebih dulu."` were written for a school administrator, and replacing
them with a generic sentence would throw away the only part of the message that
says what to do. The two developer-facing strings — `"Transisi status % -> %
tidak diizinkan"` (`fungsi.sql:296`) and the `siapkan_permintaan()` hint
(`fungsi.sql:334`) — are caught first, by matching on their text, and replaced.

## `/permintaan-saya`

The draft is pinned at the top as a card ("Keranjang — 3 barang, belum
diajukan"), then submitted requests newest-first: nomor, status badge, item
count, date. No pagination, for the reason `/pengguna` declined it — a pegawai
files tens of requests, not thousands. `master-barang`'s `Paginasi` is the
pattern to lift if that ever stops being true.

The detail route renders in one of two modes:

- **Draft:** quantities editable, items removable, "Kosongkan keranjang", and
  the submit dialog. Removing the last item deletes the draft and redirects
  back to the list.
- **Anything else:** read-only items shown from their snapshots, plus the
  timeline. `alasan_tolak` is rendered as its own block when the status is
  `ditolak`, not as a line in the timeline — it is the one thing the pegawai
  came to read.

## Beranda

For `pegawai` only. One select of `status` across the user's own requests,
counted in JS — three `head: true` counts would be three round trips for
numbers that fit in one — plus the five newest `permintaan_log` rows, phrased
by `kalimatLog()`, the same helper the timeline uses.

| Tile | Counts |
|---|---|
| Permintaan Aktif | `draft`, `diajukan`, `disetujui`, `siap_diambil` |
| Menunggu Persetujuan | `diajukan` |
| Siap Diambil | `siap_diambil` |

`RINGKASAN` in `beranda/page.tsx` currently holds three label arrays and a
comment saying the numbers arrive in sub-projects 2–4. Tata usaha and pengurus
keep their dashes; only the pegawai branch gains data, and the comment is
updated to name the sub-projects that will fill the other two.

## Testing

`supabase/tests/alur.mjs` gains a pegawai section:

- A draft is created with `keperluan` empty and takes `pemohon_id` and
  `unit_kerja_id` from the profil.
- Adding a zero-stock barang raises; adding a stocked one succeeds and freezes
  the snapshots.
- Submitting an **empty** draft raises the new message, and so does inserting a
  permintaan straight into `diajukan` — the migration's own
  coverage — and submitting a non-empty one mints a `SPB-` nomor and writes a
  log row.
- A pegawai cannot add items to a submitted request (`susun_permintaan_item`
  scopes to `draft`), cannot delete a submitted request, and cannot read
  another pegawai's request.
- `diajukan → dibatalkan` succeeds for the pemohon; `disetujui → dibatalkan`
  raises.

No UI test harness is introduced — consistent with sub-projects 1–3. The rest
of verification is `npm run db:test`, `npm run test:sandi`, `npm run lint`,
`npx tsc --noEmit`, `npm run build`, and a manual walkthrough at 375px.

## What this sub-project does NOT include

- Editing a request after it is submitted. The schema forbids it, and
  all-or-nothing fulfilment is why: the item list is an agreement, not a draft
  that keeps moving.
- "Pesan lagi" — duplicating a past request into a new cart. Worth building
  once there is history to duplicate.
- Any notification when a request is approved, rejected, or ready. There is no
  mail or push channel in this project yet.
- Pagination on `/permintaan-saya`.
- Stock figures anywhere a pegawai can see them. Structurally impossible by way
  of `katalog_pemohon`, and it stays that way.
- `/persetujuan`, `/permintaan-masuk`, `/stok`, `/penerimaan`, `/penyesuaian` —
  sub-projects 5 and 6. Until 5 exists, a submitted request has nowhere to go,
  and that is expected.
