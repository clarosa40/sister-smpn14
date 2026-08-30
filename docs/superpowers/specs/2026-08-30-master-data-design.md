# Sub-project 2: Master Data

## Overview

Second deliverable for SIPB SMPN 14. Covers the two Tata Usaha pages that own
reference data: **Unit Kerja** and **Master Barang**. Both are plain CRUD over
tables that RLS already guards. No new SQL, no service-role key, no admin API.

Sub-project 1 built the shell; every nav item past `/beranda` still points at a
route that does not exist. This builds the first two of them, and with them the
table / dialog / server-action pattern that Kelola Pengguna, Penerimaan, and
Persetujuan will reuse.

## Why master data comes first

The schema has a bootstrap chain. Every `barang` is born with stock zero, and
`siapkan_permintaan_item()` (`fungsi.sql:196`) refuses to put a zero-stock item
into a request — so the pegawai catalog is structurally empty until a
`penerimaan` exists. Non-pegawai accounts, meanwhile, can only be minted by
hand-editing SQL (`seed.sql:10-18`).

Master data is the one piece with no upstream dependency of its own. It is also
the lowest-risk place to settle a pattern that four later pages inherit.

## Decisions

- **Server Actions, not client Supabase calls.** Mutations run through the SSR
  server client (`src/lib/supabase/server.ts`), so RLS evaluates them as the
  signed-in user. `is_tu()` inside `kelola_barang` and `kelola_unit_kerja`
  (`rls.sql:38-44`) is the actual authorization. The role check in the page and
  in each action is defence in depth, not the gate.
- **Every action re-verifies the role.** An action is a public HTTP endpoint;
  the page that rendered the form is not a credential. `pastikanTataUsaha()`
  runs first in all seven of them.
- **Delete is offered, and refusal is explained.** Both tables are referenced
  `on delete restrict`, so deleting a row that is in use comes back as SQLSTATE
  23503. That is translated into a plain Indonesian sentence rather than shown
  as an error. This is what makes a freshly mistyped `kode` removable — the
  common case — while history stays safe. Guarding the button instead would
  cost a reference-count query per row and still race.
- **`unit_kerja.aktif` gets a toggle, `barang` does not get one.** The column
  exists on `unit_kerja` and will feed the unit dropdown in Kelola Pengguna. It
  is built now because the delete-refusal copy points at it ("nonaktifkan
  saja"), and that sentence has to be honest. `barang` deliberately has no such
  column (`skema.sql:66-77`): availability is computed from mutations, not
  typed by a person.
- **Bahasa Indonesia throughout, identifiers included** — matching `galat`,
  `kirim`, `alihkan`, `TANPA_SESI` in sub-project 1.

## Routes

| Path | Auth | Purpose |
|------|------|---------|
| `/unit-kerja` | Tata Usaha | List, create, rename, activate/deactivate, delete unit kerja |
| `/master-barang` | Tata Usaha | List with search + pagination, create, edit, delete barang |

Both already exist as nav items in `src/config/nav-items.ts` with
`roles: ["tata_usaha"]`, so no nav change is needed.

Role enforcement is per page, not in the proxy: `src/lib/supabase/proxy.ts`
only answers "is there a session". `getUserOrRedirect(["tata_usaha"])`
(`dal.ts:65-78`) already accepts a role filter and sends the wrong role to
`/beranda` — a page they can be sure of seeing.

## Files

```text
src/lib/aksi.ts                         HasilAksi, pesanGalatDb, pastikanTataUsaha
src/components/form-parts.tsx           FormAlert + SubmitButton, moved out of auth/
src/components/admin/
  dialog-form.tsx                       DialogForm + BidangDialog
src/app/(dashboard)/unit-kerja/
  page.tsx  actions.ts  unit-kerja-tabel.tsx
src/app/(dashboard)/master-barang/
  page.tsx  actions.ts  barang-tabel.tsx  pencarian.tsx
```

Only the dialog is shared. The two tables looked alike on paper but differ in
their columns, their row controls, and their empty states, so each page keeps
its own — a shared table shell would have been a parameter bag pretending to be
an abstraction. That call is worth revisiting once a third page exists.

shadcn `table`, `dialog`, `badge`, and `switch` are added from the existing
`radix-vega` / `olive` config. They resolve against the `radix-ui` unified
package already in `package.json`; no new dependency.

`FormAlert` and `SubmitButton` move from `src/components/auth/form-parts.tsx`
to a neutral `src/components/form-parts.tsx` — both are generic, and the auth
folder is the wrong home once dialogs use them. `SubmitButton` gains a
`className` override so a dialog footer is not stuck with the auth screen's
`h-11 w-full`. `AuthField`, `AuthInput`, `PasswordInput`, `PanelSukses`, and
`KELAS_TAUTAN_HALUS` stay put.

## Error translation

`src/lib/aksi.ts` maps SQLSTATE to a sentence a school administrator can act
on. The raw Postgres message is logged server-side and never shown.

| SQLSTATE | Meaning | Shown |
|---|---|---|
| `23505` | unique violation | "Kode … sudah dipakai barang lain." / "Unit kerja … sudah ada." |
| `23503` | FK restrict | "… sudah dipakai, jadi tidak bisa dihapus." (+ "Nonaktifkan saja." for unit kerja) |
| `42501` | insufficient privilege | "Hanya tata usaha yang boleh mengubah data ini." |
| other | — | Generic sentence; details to the server log |

`HasilAksi` mirrors `HasilReset` in
`src/app/(auth)/login/reset-sandi/actions.ts`: `{ ok: true }` or
`{ ok: false, galat: string }`, rendered through `FormAlert` by
`useActionState`.

`UPDATE` and `DELETE` refused by RLS raise no error at all — the row is simply
invisible and zero rows are touched. Reporting that as success would be a lie,
so every update and delete adds `.select("id")` and treats an empty result as a
failure. The PGlite suite pins this down: *"pegawai mengubah barang: nol baris,
tanpa galat"*.

**Dialog fields are controlled.** React resets a form once its action resolves,
including when the action failed. With uncontrolled inputs, a Tata Usaha who
types a duplicate `kode` gets the error message *and* loses everything they
typed — exactly when they are trying to correct it. `BidangDialog` therefore
holds its value in state, seeded from `defaultValue`.

## Master Barang: search and pagination

`page.tsx` awaits `searchParams` (a Promise in Next 16) for `cari` and `hal`,
then runs one query with `count: "exact"`, `order("kode")`, and a 25-row
`range()`.

Search matches `kode` or `nama`. PostgREST's `.or()` takes a filter **string**,
so a term containing `,` `(` `)` or `%` corrupts the expression — the term is
sanitized before interpolation. A teacher searching `HVS, A4` must get zero
results, not a 500.

`satuan` is a free-text field backed by a `<datalist>` of the values already in
the table, so "pcs" does not also get entered as "Pcs" and "buah". Same reason
`unit_kerja` is a table rather than free text (`skema.sql:49-50`) — reports
break on spelling, and the schema will not catch it.

**A page past the end is not an error.** PostgREST answers a range that starts
beyond the row count with `416 PGRST103`, not with an empty list. That is
reachable from an ordinary bookmark, a stale link, or deleting the last row of
the final page, so `page.tsx` catches `PGRST103` and redirects to the first
page, keeping `cari`. Only the genuine failures reach the error panel.

## Cache invalidation

`cacheComponents` is off in `next.config.ts`, so this is the classic model:
each action ends with `revalidatePath()` for its own route. Not `updateTag` —
that requires Cache Components.

## Testing

- **`supabase/tests/alur.mjs`** gains a `— master data —` section at the **end**
  of the file. Several existing assertions check exact row counts, so anything
  inserted earlier would disturb them. Covered: only Tata Usaha may write
  `barang` and `unit_kerja`; duplicate `kode` and duplicate unit `nama`
  rejected; an unused barang deletes cleanly; a used barang and a referenced
  unit kerja both raise 23503; Tata Usaha can flip `aktif`.
- **Browser**, as Tata Usaha: create / rename / delete on both pages, including
  one delete that must be refused; search by kode and by nama; a search term
  containing a comma and a `%`; paging; both pages at 375px.
- **Browser**, as pegawai: typing `/master-barang` must land on `/beranda`.

## What this sub-project does NOT include

- Kelola Pengguna — next pass. `SUPABASE_SECRET_KEY` is already in
  `.env.local`; the open question is whether Tata Usaha sets a temporary
  password or sends an invite email.
- Excel/CSV bulk import of the real inventory. The codes in `seed.sql` are
  still placeholders.
- Any pegawai- or pengurus-facing page.
