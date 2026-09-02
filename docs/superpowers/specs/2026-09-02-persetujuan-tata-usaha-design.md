# Sub-project 5: Persetujuan Tata Usaha

## Overview

Fifth deliverable for SIPB SMPN 14. Covers the one Tata Usaha page left —
**Persetujuan** — plus the tata usaha third of `/beranda`. With this, a
submitted request can be approved or refused; preparing and handing it over
are sub-project 6.

Sub-project 4 gave a pegawai a way to fill a cart and submit it, and nothing
receives what they submit. A `diajukan` permintaan sits in the table with a
`SPB-` nomor and no reader — its spec said as much: *"Until 5 exists, a
submitted request has nowhere to go, and that is expected."* This is the
receiving end, and the first time a row written by one person is read by
another.

It is the smallest of the five. Tata usaha has exactly one nav item left
(`nav-items.ts:44-52`), and `RINGKASAN` in `beranda/page.tsx:15-18` already
names this sub-project as the one that fills its tiles.

## What is already built

Everything that decides. This is UI, server actions, and one migration over
machinery `alur.mjs` already covers:

- `jaga_alur_permintaan()` (`20260901010000_permintaan-kosong.sql:23`) allows
  `diajukan → disetujui | ditolak` and `disetujui → ditolak`, refuses both
  from any role but tata usaha (`:94-97`, errcode `42501`), stamps
  `disetujui_at`, and fills `disetujui_oleh` from `auth.uid()` (`:143-144`).
- `alasan_tolak_wajib` (`skema.sql:117`) refuses a `ditolak` row whose reason
  is blank. A rejection cannot be reasonless at any layer.
- `catat_log_permintaan()` (`fungsi.sql:364`) writes the log row and carries
  `alasan_tolak` into `catatan` on rejection (`:379`).
- RLS already opens everything tata usaha needs, all via `is_staf()`:
  `baca_permintaan` (`rls.sql:103`), `baca_permintaan_item` (`:130`),
  `baca_permintaan_log` (`:164`), `baca_profil` (`:50`). `ubah_permintaan`
  (`:111`, amended `20260830010000_pengguna.sql:40`) lets tata usaha write.
- `stok_barang` (`view.sql:16`) carries the real figures and is gated by
  `where public.is_staf()`. `rls.sql:174-177` says why in as many words:
  *"tata usaha ikut membaca supaya bisa menimbang persetujuan."*

One migration is added, and it closes a hole rather than adding a feature.

## Decisions

- **The queue drains; history is a second view.** `/persetujuan` defaults to
  `status = 'diajukan'` only — a working queue with a bottom, whose empty
  state means "done for today" rather than "nothing here". `?lihat=riwayat`
  shows every decided request, newest first, paginated. The tab is a pair of
  server-rendered `<Link>`s rather than client state, for the reason
  `Pencarian` writes its keyword to the URL: the server keeps the data, and
  no copy in the browser can go stale.
- **Setujui and Tolak live only on `/persetujuan/[id]`.** Fulfilment is
  all-or-nothing (`skema.sql:128-130`), so approving is agreeing to the whole
  list. Requiring that the list be on screen first costs one click per
  request, and that is the point — inline buttons on a queue row would
  approve contents nobody read.
- **Tata usaha never sees a draft.** RLS would show them: `baca_permintaan`
  is scoped by `is_staf()`, not by status. So the exclusion is written into
  both queries (`.neq("status", "draft")`), and `/persetujuan/[id]` renders
  `notFound()` for one. Someone else's unsubmitted cart is not tata usaha's
  business, and a queue that counted drafts would be wrong.
- **The timeline names people here.** `baca_profil` lets `is_staf()` read
  every row, so the join that returns null for a pegawai returns a name for
  tata usaha. "Disetujui oleh Sari Wijaya" is what an approval surface is
  for — with two tata usaha accounts, "Disetujui tata usaha" answers nothing.
  The pegawai timeline is unchanged; the limit there stays deliberate.
- **Stock is shown, never enforced.** An item whose `jumlah_diminta` exceeds
  its stock gets a quiet marker, not a disabled button.
  `siapkan_permintaan()` (`fungsi.sql:473`) is the real check, and
  `fungsi.sql:404-406` already states the policy: stock can arrive tomorrow,
  and refusing someone stays a human decision.
- **Rejecting an approved request stays possible.** The state machine allows
  `disetujui → ditolak` for exactly that case. Such a request lives in
  Riwayat, and its detail page keeps the Tolak button.
- **Bahasa Indonesia throughout, identifiers included**, as in sub-projects
  1–4.

## Routes

| Path | Auth | Purpose |
|------|------|---------|
| `/persetujuan` | Tata usaha | The `diajukan` queue; `?lihat=riwayat` for decided requests |
| `/persetujuan/[id]` | Tata usaha | Items with stock, keterangan, timeline, Setujui/Tolak |
| `/beranda` | Tata usaha | Three tiles and recent activity, filled for this role |

The nav item already exists with `roles: ["tata_usaha"]`, so no nav change is
needed. `pastikanTataUsaha()` (`aksi.ts:38`) guards both pages and both
actions — already written in sub-project 2, no new helper.

`/persetujuan/[id]` needs no ownership check. RLS returns the row to any
staf, the query excludes drafts, and a missing row renders `notFound()` — the
same absence-of-a-leak reasoning as `permintaan-saya/[id]`, rather than a
second gate that can drift from the first.

## SQL — `supabase/migrations/20260902010000_permintaan-beku.sql`

Sub-project 4's spec claims *"Editing a request after it is submitted — the
schema forbids it."* It does not. `susun_permintaan_item` freezes the items;
nothing freezes the header. `ubah_permintaan` lets `is_staf()` UPDATE any
column of any request at any status, and `jaga_alur_permintaan()` returns
early when the status is unchanged
(`20260901010000_permintaan-kosong.sql:67-69`) — so a tata usaha can rewrite
someone's `keperluan`, or their `pemohon_id`, leaving no trace at all, since
`catat_log_permintaan()` only fires on a status change. A pegawai can do the
same to their own `diajukan` request.

This is the sub-project that puts a second person in front of that row, so
the claim gets made true here. The new block goes **after
`new.updated_at := now()` and before the `new.status = old.status` early
return** — behind that return is exactly where a same-status content edit
sails through today:

```sql
  if old.status <> 'draft' then
    if new.pemohon_id            is distinct from old.pemohon_id
       or new.unit_kerja_id      is distinct from old.unit_kerja_id
       or new.keperluan          is distinct from old.keperluan
       or new.tanggal_dibutuhkan is distinct from old.tanggal_dibutuhkan
       or new.catatan_pemohon    is distinct from old.catatan_pemohon then
      raise exception 'Isi permintaan yang sudah diajukan tidak bisa diubah lagi.'
        using errcode = 'P0001';
    end if;

    if new.alasan_tolak is distinct from old.alasan_tolak
       and (new.status <> 'ditolak' or new.status = old.status) then
      raise exception 'Alasan penolakan hanya bisa ditulis saat permintaan ditolak.'
        using errcode = 'P0001';
    end if;
  end if;
```

`old.status <> 'draft'` is what keeps `ajukanPermintaan` working untouched:
it writes `keperluan`, `tanggal_dibutuhkan`, `catatan_pemohon`, and `status`
in one UPDATE off a draft. The second guard is the same rule for
`alasan_tolak`, which may ride the move into `ditolak` and only that — not be
rewritten later on a row whose status is standing still.

Checked against every UPDATE in `alur.mjs`: `:971` and `:1010` edit a draft,
`:1184` and `:1281` ride the `draft → diajukan` transition, and `:504` writes
`alasan_tolak` on the move into `ditolak`. None of them break.

The migration is a `create or replace` of the whole function, as Postgres
requires; the plan will carry its full text.

## Files

```text
src/lib/permintaan.ts                   + PELAKU_LOG, kalimatLogBernama(), PANJANG_ALASAN
src/components/permintaan-parts.tsx     LencanaStatus + BarisKeterangan, lifted out of
                                        permintaan-saya/ so two roles can share them
src/components/admin/paginasi.tsx       Paginasi, lifted out of master-barang/page.tsx
src/app/(dashboard)/persetujuan/
  page.tsx  actions.ts  daftar-persetujuan.tsx
  [id]/page.tsx  keputusan-permintaan.tsx
src/app/(dashboard)/beranda/page.tsx    + ringkasanTataUsaha()
supabase/migrations/20260902010000_permintaan-beku.sql
supabase/tests/alur.mjs                 + the tata usaha section
```

Two extractions, each paid for by a second consumer inside this sub-project
and neither speculative:

- `LencanaStatus` lives in `permintaan-saya/daftar-permintaan.tsx:26` and
  `Baris` in `[id]/detail-permintaan.tsx:343`. A tata usaha page reaching
  into a pegawai page for them would be the wrong dependency. Both move to
  `src/components/permintaan-parts.tsx`, echoing `components/form-parts.tsx`,
  and the two pegawai files import from there. Neither needs `"use client"` —
  they hold no hooks, and a client component importing them bundles them fine.
- `Paginasi` is private to `master-barang/page.tsx:105`, with the noun
  "barang" hardcoded and `alamatDaftar` closed over. It moves to
  `src/components/admin/paginasi.tsx` taking `satuan` and an
  `href: (halaman: number) => string`, and `master-barang` is updated to call
  it that way.

`Pencarian` and `siapkanKataKunci` (`aksi.ts:151`) get their fourth consumer,
unchanged, on the Riwayat view.

## Flow: the queue

`/persetujuan` guards with `pastikanTataUsaha()`, reads `?lihat` and — on
riwayat — `?cari` and `?hal`, then runs one select:

```ts
supabase.from("permintaan").select(
  `id, nomor, status, keperluan, tanggal_dibutuhkan, diajukan_at,
   pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
   unit_kerja ( nama ),
   permintaan_item ( id )`,
  { count: "exact" },
)
```

The FK hint is not decoration. `permintaan` has four foreign keys into
`profil` — `pemohon_id`, `disetujui_oleh`, `disiapkan_oleh`,
`diserahkan_oleh` — so a bare `profil ( nama_lengkap )` is ambiguous and
PostgREST answers `PGRST201`. `unit_kerja` has one and needs none.

**Queue:** `.eq("status", "diajukan").order("diajukan_at")` — oldest first,
because a queue is served in the order it arrived. No pagination; it drains.

**Riwayat:** `.not("status", "in", '("draft","diajukan")')`,
`.order("diajukan_at", { ascending: false })`, `.range()` at 25 per page,
with the `PGRST103` → redirect-to-page-one handling that
`master-barang/page.tsx:59-65` explains. `cari` filters `nomor` and
`keperluan` through `.or()`.

Pemohon name is deliberately **not** searchable. PostgREST's
`referencedTable` filters the embedded resource rather than the parent row,
so searching a name would blank the embed instead of dropping the row.
Making it work needs a flattening view, which is not worth a migration yet —
so the placeholder reads "Cari nomor atau keperluan" and the box claims only
what it does.

Each row carries the nomor, the status badge,
`pemohon.nama_lengkap · unit_kerja.nama`, the keperluan truncated, and then
`N barang · diajukan <tanggal>`, with `· dibutuhkan <tanggal>` appended only
when `tanggal_dibutuhkan` is set. One row component serves both views.

## Flow: deciding

`/persetujuan/[id]` selects the request with its items, then `stok_barang`
for those `barang_id`s, then the log with names:

```ts
supabase.from("stok_barang").select("barang_id, stok").in("barang_id", ids)

supabase.from("permintaan_log")
  .select("id, status_ke, catatan, created_at, oleh:profil ( nama_lengkap )")
  .eq("permintaan_id", id).order("created_at")
```

The timeline is phrased by `kalimatLogBernama(status, nama)`, a sibling of
`kalimatLog()` in `lib/permintaan.ts`. It reads from a second record,
`PELAKU_LOG`, that holds each status as a bare participle — "Diajukan",
"Disetujui", "Barang disiapkan" — and joins it to the name with "oleh", which
reads correctly for all seven: *"Keranjang dibuat oleh Sari Wijaya"*,
*"Ditolak oleh Budi Santoso"*. A null name falls back to `kalimatLog()`, so
the two helpers cannot disagree about a row whose author was deleted.

`.neq("status", "draft")` on the request select is what makes a draft 404
here. `22P02` — the id is not a uuid — joins the missing-row path for the
reason `permintaan-saya/[id]/page.tsx:42-47` gives: neither is a load failure
that reloading can fix. Other errors get the reload banner. `stok_barang`
coming back empty is not fatal; the item renders without a figure rather than
the page failing.

`setujuiPermintaan(id)` mirrors `batalkanPermintaan`
(`permintaan-saya/actions.ts:98`), `.eq("status", "diajukan")` included for
the reason its comment gives — the policy would refuse it silently anyway,
but written out, the intent is readable:

```ts
.update({ status: "disetujui" }).eq("id", id).eq("status", "diajukan").select("id")
```

`tolakPermintaan(id, _sebelumnya, formData)` mirrors `ajukanPermintaan`: the
reason is trimmed, required, and capped at `PANJANG_ALASAN` (500, alongside
`PANJANG_CATATAN` and for the same reason), then written
with the status in one UPDATE, `.in("status", ["diajukan", "disetujui"])`.
The `alasan_tolak_wajib` constraint stays the backstop; if it ever fires, the
action's own validation has drifted, and the generic sentence is the right
answer to a developer's bug.

Both check the returned rows, not only `error` — `aksi.ts:74-77` documents
why an UPDATE refused by RLS is silent. Zero rows means the request moved in
another tab. Both `revalidatePath` `/persetujuan`, `/persetujuan/${id}`, and
`/beranda`.

Both run through `DialogForm`: Setujui as a plain confirmation, Tolak with
one `BidangDialog` for the reason and `merusak` set.

## Error translation

`pesanGalatPermintaan()` (`lib/permintaan.ts:179`) is reused unchanged. The
migration's two new sentences arrive as `P0001` and pass through verbatim,
which is the behaviour that helper exists for — both were written for a
school administrator to read, and replacing them with a generic sentence
would throw away the only part that says what happened.

## Beranda

`ringkasanTataUsaha()` sits beside `ringkasanPegawai()` and returns the same
`{ angka, aktivitas }` shape, so the page's rendering is untouched apart from
picking the function by role and one line of empty-state copy.

| Tile | Source |
|---|---|
| Menunggu Persetujuan | `count(status = 'diajukan')` |
| Disetujui Bulan Ini | `count(disetujui_at >= awal bulan)` |
| Total Pengguna | `count(*)` on `profil` |

The month boundary is built from `tanggalHariIni()`
(`lib/permintaan.ts:207`) — `"2026-09"` plus `"-01T00:00:00+07:00"` — rather
than from `getMonth()`, for the same reason that helper exists at all: the
server's timezone is not the school's.

Recent activity is the five newest `permintaan_log` rows across every request
— `baca_permintaan_log` opens all of them to `is_staf()` — phrased by
`kalimatLog()`, unnamed, as it is today. Naming stays on the detail timeline,
where the reader is deciding something; a dashboard ticker is not that.

`RINGKASAN`'s comment is updated to name sub-project 6 as the one that fills
pengurus barang.

## Testing

`supabase/tests/alur.mjs` gains a tata usaha section:

- Tata usaha approves a `diajukan` request: the status moves,
  `disetujui_oleh` is the TU uid, `disetujui_at` is stamped, and a log row is
  written.
- A pegawai and a pengurus barang each fail to approve (`42501`).
- Rejecting without a reason fails on `alasan_tolak_wajib`; rejecting with
  one succeeds, and the log row carries the reason in `catatan`.
- `disetujui → ditolak` succeeds for tata usaha.
- The migration's own coverage: tata usaha cannot rewrite `keperluan` on a
  `diajukan` request, and neither can the pemohon; `alasan_tolak` cannot be
  rewritten on a row whose status is not moving; a draft's `keperluan` is
  still freely editable; and the `draft → diajukan` UPDATE that writes
  `keperluan` and `status` together still passes — the regression guard for
  `ajukanPermintaan`.

No UI test harness is introduced, consistent with sub-projects 1–4. The rest
of verification is `npm run db:test`, `npm run lint`, `npx tsc --noEmit`,
`npm run build`, and a manual walkthrough at 375px: submit a request as
pegawai and approve it as tata usaha; submit a second and reject it with a
reason; confirm the pegawai's detail page shows the rejection block; confirm
a `disetujui` request can still be rejected from Riwayat; and confirm
`/persetujuan` sends a pegawai and a pengurus barang to `/beranda`.

## What this sub-project does NOT include

- Bulk approval. Each approval is a judgment on a whole item list, and a
  partial failure mid-batch would need an error story of its own.
- Searching the history by pemohon name. It needs a flattening view; until
  then the search box claims only the columns it can reach.
- Editing a request before approving it. All-or-nothing is why the item list
  is an agreement, and the migration here is what finally makes that true of
  the header too.
- Any notification to the pemohon on approval or rejection. There is still no
  mail or push channel in this project.
- Pagination on the queue. It drains; only Riwayat accumulates.
- `/stok`, `/penerimaan`, `/permintaan-masuk`, `/penyesuaian` — sub-project 6.
  Until it exists, an approved request has nowhere further to go, and that is
  expected.
