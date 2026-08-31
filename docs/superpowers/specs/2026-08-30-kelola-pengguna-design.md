# Sub-project 3: Kelola Pengguna

## Overview

Third deliverable for SIPB SMPN 14. Covers the last Tata Usaha master page —
**Kelola Pengguna** — and the two things it drags in with it: a way for a person
to set their own password, and teeth for `profil.aktif`.

Sub-project 2 settled the table / dialog / server-action pattern over data that
RLS already guarded. This one keeps that pattern for reading and editing, but
adds the first privileged path in the codebase: accounts can only be *created*
with the service-role key, because `auth.users` is not a table the application's
own session may write.

`seed.sql:10-18` currently says non-pegawai accounts are minted by hand-editing
SQL. This is the page that replaces those instructions.

## Why this one is different

Master data could be careless in one specific way and stay safe: if a role check
in a server action were ever forgotten, `kelola_barang` and `kelola_unit_kerja`
would still refuse the write. RLS was the gate; `pastikanTataUsaha()` was
defence in depth.

**The service-role client inverts that.** It bypasses RLS entirely, so in the
three actions that hold it, `pastikanTataUsaha()` *is* the gate and there is
nothing behind it. The privileged surface is therefore kept as small as the
feature allows:

| Path | Client | What actually gates it |
|---|---|---|
| List, search | ordinary SSR client | `where public.is_tu()` inside the view |
| Edit nama/role/unit, aktif toggle | ordinary SSR client | `ubah_profil` + `jaga_profil()` |
| Create, reset password, delete | **service-role** | `pastikanTataUsaha()` alone |
| Clear `sandi_sementara` | **service-role** | own session only |

Note what this buys: even account *creation* touches `profil` under RLS. The
admin client creates the `auth.users` row and nothing else; role and unit kerja
are then written by the ordinary client, where `jaga_profil()` still applies.

`SUPABASE_SECRET_KEY` is read in `src/lib/supabase/admin.ts`, which begins with
`import "server-only"`. It does **not** go in `src/config/environment.ts`: that
module is imported by `client.ts` (the browser client) and by `proxy.ts`, and
carries no guard of its own. A secret placed there is one careless import away
from the client bundle.

## Decisions

- **Temporary password, not an invite email.** `admin.createUser()` with
  `email_confirm: true` and a generated password, shown once on screen. The
  school's Supabase project has no custom SMTP, and the built-in sender is
  rate-limited to a couple of messages an hour and only delivers to project team
  addresses — a staff roster would never receive them. This also means
  `/auth/konfirmasi` needs **no** `type=invite` branch: it stays a
  recovery-only landing point.
- **The password is generated, never typed.** Twelve characters from an
  alphabet with no `0/O/1/l/I`, drawn from `crypto.getRandomValues` with
  rejection sampling so the modulo bias is not quietly baked in. Letting Tata
  Usaha invent one invites a single house pattern across every account, which is
  the exact risk a temporary password already carries.
- **A temporary password must have somewhere to be replaced.** There is no
  signed-in change-password screen today; `/login/lupa-sandi` is the only route
  and it goes through email — the dependency this design set out to avoid. So
  `/ganti-sandi` ships with this sub-project, and it is **forced**: the flag
  lives in `app_metadata`, which only the service role may write, so the user
  cannot skip it by clearing it themselves.
- **`profil.aktif` gets real teeth.** Today it is read only by `peran_saya()`
  (`fungsi.sql:23`), so deactivating a *pegawai* removes staff privileges they
  never had. `buat_permintaan` (`rls.sql:107`) checks only
  `pemohon_id = auth.uid()`, which means a deactivated teacher can still sign
  in, browse the catalog, and file requests. Since "nonaktifkan" is the main
  offboarding action this page offers, that hole is closed here — in RLS, where
  `rls.sql:5-11` says the role model lives.
- **Delete is offered, and refusal is explained** — the same call as master
  data. `permintaan.pemohon_id` and `disetujui_oleh` are `on delete restrict`,
  so anyone with history is refused and told to deactivate instead, while a
  freshly mistyped account stays removable.
- **Email cannot be edited.** A typo caught before the person files anything is
  fixed by delete-and-recreate. After that the address is fixed until a later
  pass. `admin.updateUserById({ email })` is a small addition, but it widens the
  service-role surface for a case that delete already covers.
- **Bahasa Indonesia throughout, identifiers included**, as in sub-projects 1
  and 2.

## Routes

| Path | Auth | Purpose |
|------|------|---------|
| `/pengguna` | Tata Usaha | List with search, create, edit, activate/deactivate, reset password, delete |
| `/ganti-sandi` | any session | Set your own password; forced while `sandi_sementara` is set |
| `/auth/keluar` | any session | Sign out where cookies can actually be written |

`/pengguna` already exists in `src/config/nav-items.ts` with
`roles: ["tata_usaha"]`, so no nav change is needed.

`/ganti-sandi` sits in the `(auth)` route group — it is a signed-in page, but
rendering the dashboard shell around it would be a lie, since the point is that
the user is not through the door yet. The proxy needs no change for either new
route: neither is in `TANPA_SESI`, and both are reached with a live session.

## SQL — `supabase/migrations/20260830010000_pengguna.sql`

The first migration since sub-project 1. Three parts.

**1. `is_aktif()`**, matching the shape of the existing role helpers —
`stable`, `security definer`, `set search_path = ''`:

```sql
select exists (
  select 1 from public.profil p
  where p.id = (select auth.uid()) and p.aktif
)
```

**2. Four policies gain it.** Only the pegawai-path policies need changing; the
staff policies route through `peran_saya()`, which already requires `aktif`.

| Policy | Table | Change |
|---|---|---|
| `buat_permintaan` | `permintaan` | `with check` gains `and public.is_aktif()` |
| `ubah_permintaan` | `permintaan` | own-row branch of `using` and `with check` gains it |
| `hapus_permintaan` | `permintaan` | `using` gains it |
| `susun_permintaan_item` | `permintaan_item` | both branches gain it |

`alter policy` rather than drop-and-create, so the migration reads as the
amendment it is. The rule after this migration is flat: **an inactive account
writes nothing.**

**3. The view.**

```sql
create view public.pengguna with (security_barrier = true) as
select p.id, p.nama_lengkap, p.role, p.aktif, p.unit_kerja_id,
       uk.nama as unit_kerja, u.email,
       coalesce((u.raw_app_meta_data ->> 'sandi_sementara')::boolean, false)
         as sandi_sementara,
       p.created_at
from public.profil p
join auth.users u on u.id = p.id
left join public.unit_kerja uk on uk.id = p.unit_kerja_id
where public.is_tu();

grant select on public.pengguna to authenticated;
```

Three things about it are deliberate and easy to get wrong later:

- It runs as its **owner**, not the invoker. That is the only reason it can
  reach `auth.users`, and it means RLS on `profil` is bypassed — so
  `where public.is_tu()` is the entire gate, not a convenience. It gets its own
  test for exactly that reason.
- The **explicit grant is required.** `rls.sql:17` granted "all tables in
  schema public", but that ran before this view existed.
- `security_barrier` keeps a caller's own `WHERE` clause from being evaluated
  ahead of `is_tu()`. It costs predicate pushdown, which is meaningless across a
  staff roster.

This trips Supabase's `security_definer_view` linter. That is the accepted
trade: the alternative is granting `authenticated` read access to all of
`auth.users`.

`sandi_sementara` is exposed here rather than fetched through the admin API
because the join is already open — it costs one expression and saves the list
page a privileged call, so Tata Usaha can see at a glance who has not yet set
their own password.

## Files

```text
supabase/migrations/20260830010000_pengguna.sql

src/lib/supabase/admin.ts               service-role client, import "server-only"
src/lib/sandi.ts                        sandiSementara(): generated password
src/lib/dal.ts                    edit  ambilAkun() + the two new guards
src/lib/aksi.ts                   edit  pesanGalatAuth, siapkanKataKunci
src/components/admin/pencarian.tsx      moved from master-barang/, + jalur prop
src/components/ui/select.tsx            shadcn, for peran and unit kerja
src/app/(dashboard)/master-barang/page.tsx
                                  edit  follows both moves above

src/app/auth/keluar/route.ts
src/app/(auth)/ganti-sandi/
  page.tsx  actions.ts  ganti-sandi-form.tsx
src/app/(auth)/login/page.tsx     edit  reads ?alasan=nonaktif
src/app/(auth)/login/login-form.tsx edit shows that message

src/app/(dashboard)/pengguna/
  page.tsx  actions.ts  pengguna-tabel.tsx  akun-dialog.tsx
```

`akun-dialog.tsx` deliberately does **not** reuse `DialogForm`. That component
closes on success (`dialog-form.tsx:99-101`), which is what edit and delete
want and exactly what create and reset-password must not do — both stay open and
swap the form for the show-once password panel. Bending `DialogForm` to support
both would add a prop meaning "actually, don't do the one thing you exist to
do". So: edit and delete use `DialogForm` unchanged, create and reset password
get their own dialog, and the aktif toggle uses no dialog at all — it calls its
action from the switch and surfaces failures above the table, the way
`unit-kerja-tabel.tsx:37-43` already does.

`Pencarian` moves to `src/components/admin/` and takes a `jalur`, `placeholder`,
and `aria-label`; it hardcoded `/master-barang` in three places. `siapkanKataKunci`
moves from `master-barang/page.tsx` into `aksi.ts` for the same reason — a
second caller, and the sanitation is not something to reimplement per page.

## Flow: creating an account

1. `pastikanTataUsaha()`.
2. `admin.createUser({ email, password, email_confirm: true, user_metadata: { nama_lengkap }, app_metadata: { sandi_sementara: true } })`.
   `email_confirm` skips the verification mail, which nothing would deliver.
   `handle_new_user()` (`fungsi.sql:126`) reads `nama_lengkap` out of
   `raw_user_meta_data` and creates the `profil` row in the same transaction, so
   it exists by the time the call returns.
3. Ordinary client: `update profil set role, unit_kerja_id where id = ...`,
   with `.select("id")` — a RLS-refused update reports no error, only zero rows.
4. `revalidatePath("/pengguna")`, and the dialog swaps to the password panel.

**Unit kerja is required.** `jaga_alur_permintaan()` (`fungsi.sql:262`) raises
"Akun Anda belum terhubung ke unit kerja" when a pegawai with a null unit first
submits a request — days later, at the wrong desk, to someone who cannot fix it.
The dropdown offers active units only, honouring the promise the unit-kerja page
already makes on screen; the *edit* dialog additionally includes the row's own
unit when it has since been deactivated, so renaming someone cannot silently
reassign them.

**Closing the panel loses the password.** That is the intended cost of showing
it once, and the remedy is the "Setel ulang sandi" button, which does precisely
this flow again with `admin.updateUserById()`.

## Flow: the forced password change

`getUserOrRedirect()` sends anyone carrying `sandi_sementara` to `/ganti-sandi`
**before** the role check, so a Tata Usaha with a temporary password is held
back like everyone else. `/ganti-sandi/page.tsx` calls `getUser()` directly
rather than `getUserOrRedirect()`, which is what keeps that from looping.

The guard lives in the DAL, not in `proxy.ts`. The bundled docs are explicit
that Proxy "should not be used as a full session management or authorization
solution" and is for optimistic checks only
(`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:29`), and
the project already keeps the proxy to the single question "is there a session".

The action takes current + new + repeat. The current password is verified with
`signInWithPassword` before `updateUser({ password })` — Supabase does not
require the old password, but an unattended session should not be enough to take
an account over. On success the admin client clears the flag. That the *user*
cannot clear it is the whole reason it lives in `app_metadata` rather than
`user_metadata`.

Reading the flag costs nothing extra: `supabase.auth.getUser()` already round-
trips to the Auth server and returns `app_metadata` fresh from the database, so
a stale JWT cannot keep someone in the loop after they have changed their
password.

## Flow: deactivation, and why `/auth/keluar` exists

Tata Usaha flips `aktif` to false. RLS refuses that account every write from
that moment. On its next request `getUserOrRedirect()` sends it to
`/auth/keluar?alasan=nonaktif`, which signs out and lands on
`/login?alasan=nonaktif` showing "Akun Anda dinonaktifkan. Hubungi tata usaha."
— the same `?galat=`-style convention `/login/lupa-sandi` already uses.

The route handler exists because **the DAL cannot sign anyone out.**
`server.ts:16-20` wraps its cookie writes in an empty `catch`, and the Next docs
confirm why: "Setting cookies is not supported during Server Component
rendering"
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:80`).
So `dal.ts:51`'s `signOut()` clears nothing in the browser today. Without a real
sign-out, a deactivated user with a still-valid access token bounces between
`/login` (proxy sees a session, redirects to `/beranda`) and `/beranda` (DAL
sees no valid account, redirects to `/login`) until the token expires.

`/auth/keluar` builds its redirect first and binds the Supabase client's cookie
writes straight onto that response, the way `proxy.ts:26-38` does, rather than
going through `next/headers` — leaving no question about whether the `Set-Cookie`
headers survive onto a returned `NextResponse`. Only the known value
`alasan=nonaktif` is echoed forward; arbitrary query input is never reflected.

This also repairs the existing "profil unreachable" branch, which
`dal.ts:45-53` documents as cutting the session but does not, for the same
reason. It now redirects to `/auth/keluar` too.

## `dal.ts` after the change

`getUser()` cannot express "signed in but not allowed in", so an internal
`ambilAkun()` — the one wrapped in `cache()` — returns the distinction and the
two public functions read from it:

```text
tanpa-sesi              -> redirect /login
profil-hilang           -> redirect /auth/keluar
nonaktif                -> redirect /auth/keluar?alasan=nonaktif
ok, sandi_sementara     -> redirect /ganti-sandi
ok, role not permitted  -> redirect /beranda
ok                      -> the User
```

`getUser()` keeps returning `User | null` for its existing callers, mapping
everything that is not `ok` to `null`.

## Guards and refusals

**Tata Usaha cannot act on their own row**: no role change, no deactivation, no
delete. The controls are absent in the UI and each action re-checks
`id === user.id` server-side, because the page that rendered a form is not a
credential.

That guard alone is sufficient to keep the school out of a locked drawer, and it
is worth being explicit about why no "last administrator" count is needed:
demoting the *only* Tata Usaha means demoting yourself, which is refused; and
with two, whoever demotes the other still remains. At least one active Tata
Usaha therefore always survives, with no count query and no race between two
tabs.

## Error translation

`pesanGalatAuth()` joins `pesanGalatDb()` in `src/lib/aksi.ts`. Auth Admin
errors are `AuthError`, not `PostgrestError`, so they need their own mapping;
raw messages go to the server log and never to the screen, as before.

| Condition | Shown |
|---|---|
| `email_exists` | "Email itu sudah dipakai akun lain." |
| `validation_failed` on email | "Alamat email itu tidak bisa dipakai." |
| `weak_password` | "Kata sandi terlalu pendek, minimal 8 karakter." |
| `23503` surfacing through `admin.deleteUser` | "Akun ini sudah punya riwayat permintaan, jadi tidak bisa dihapus. Nonaktifkan saja." |
| other | Generic sentence; details to the server log |

`weak_password` should be unreachable for a generated password and is mapped
because `/ganti-sandi` accepts a typed one.

## Testing

**`supabase/tests/alur.mjs`** gains a `— pengguna —` section at the **end** of
the file, for the reason the master-data section is there: earlier assertions
check exact row counts. The PGlite stub needs `raw_app_meta_data jsonb` added to
its `auth.users` table — the view reads it.

Covered:

- Tata Usaha selecting from `public.pengguna` sees every account, with the email
  joined from `auth.users`.
- A pegawai selecting from `public.pengguna` gets **zero rows**, not an error —
  the view's `is_tu()` predicate is the only thing standing between a teacher
  and every staff email address.
- A deactivated pegawai cannot insert a `permintaan`, cannot edit their own
  draft, and cannot add a `permintaan_item` — the three holes this migration
  closes. Each must fail with a row-level-security refusal.
- Reactivating restores all three.
- Tata Usaha can still flip another account's `role` and `aktif`; a pegawai
  raising their own `role` still hits `jaga_profil()`'s 42501.

**Browser**, as Tata Usaha: create an account and carry the temporary password
through login and the forced change to `/beranda`; confirm `/ganti-sandi` cannot
be walked past by typing another URL; reset someone's password; delete an
account with request history (refused, with the sentence) and one without
(succeeds); search by name and by email, including a term with a comma and a
`%`; the page at 375px.

**Browser**, as pegawai: typing `/pengguna` lands on `/beranda`. Then, while
signed in, have Tata Usaha deactivate the account in another browser and confirm
the next navigation ends on the login screen with the message rather than in a
redirect loop.

## What this sub-project does NOT include

- Changing an account's email address. Delete-and-recreate covers the typo case
  until history exists.
- Pagination on `/pengguna`. Roughly forty staff is one screen, and search
  narrows it; the `PGRST103` handling in `master-barang/page.tsx` is the pattern
  to copy if the roster ever outgrows it.
- Bulk import of the staff roster, and Excel/CSV import of the real inventory —
  the codes in `seed.sql` are still placeholders.
- Any pegawai- or pengurus-facing page. After this, every Tata Usaha nav item
  except `/persetujuan` exists.
