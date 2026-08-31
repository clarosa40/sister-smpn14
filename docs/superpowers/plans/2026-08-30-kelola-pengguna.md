# Kelola Pengguna Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pengguna` (the last Tata Usaha master page), the forced password-change screen it needs, and the RLS teeth that make `profil.aktif` mean something.

**Architecture:** Reading and editing keep sub-project 2's page/table/dialog/server-action shape over RLS-guarded data. Account creation, password reset, and deletion are the first privileged paths in the codebase: they hold a service-role client that bypasses RLS, so `pastikanTataUsaha()` is the only gate on exactly those three actions and the privileged surface is kept as small as the feature allows. A new SQL migration adds `is_aktif()`, threads it through the four pegawai-path policies, and adds a `public.pengguna` view that joins `auth.users` behind a `where public.is_tu()` predicate.

**Tech Stack:** Next.js 16.2.6 (App Router, Proxy, Server Actions), React 19.2.4, `@supabase/ssr` 0.10.2 + `@supabase/supabase-js` 2.105.3, Postgres/Supabase with RLS, Tailwind 4 + shadcn (`radix-ui` 1.6.7), PGlite 0.5 for database tests.

**Spec:** `docs/superpowers/specs/2026-08-30-kelola-pengguna-design.md` — read it before starting. This plan argues from it; where the two disagree, the spec wins unless a deviation is listed below.

## Global Constraints

- **Bahasa Indonesia throughout, identifiers included.** File names, function names, variable names, comments, and every string that reaches a screen. Existing code is the reference for tone.
- **Read the bundled docs before writing framework code.** `AGENTS.md` says this Next.js differs from training data. The relevant files are `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`, and `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`.
- **`SUPABASE_SECRET_KEY` is read in exactly one file:** `src/lib/supabase/admin.ts`, which begins with `import "server-only";`. It must **never** be added to `src/config/environment.ts` — that module is imported by `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/proxy.ts` and carries no guard. The key already exists in `.env.local`; do not create or commit env files.
- **The service-role client appears in four call sites only:** `buatAkun`, `setelUlangSandi`, `hapusAkun` (all in `src/app/(dashboard)/pengguna/actions.ts`), and the flag-clearing line of `gantiSandi` in `src/app/(auth)/ganti-sandi/actions.ts`. Nowhere else.
- **Every server action re-checks its caller.** Tata Usaha actions begin with `await pastikanTataUsaha()`. Own-session actions begin with `await ambilAkun()` and bail on a non-`ok` status. The page that rendered a form is not a credential.
- **Raw error text goes to `console.error`, never to the screen.** Follow `pesanGalatDb` in `src/lib/aksi.ts`.
- **Indentation:** 4 spaces in `src/**` (except `src/components/ui/**`, which is shadcn output at 2 spaces) and 2 spaces in `supabase/**/*.sql`. Match the file you are editing.
- **Migration filename:** `supabase/migrations/20260830010000_pengguna.sql`, exactly.
- **Verification commands** (all must pass before a task is done): `npm run db:test`, `npm run lint`, `npx tsc --noEmit`.

## Deviations from the spec

These are deliberate; each is small and reasoned. Do not silently add others.

1. **`ambilAkun()` is exported, not private.** The spec calls it "an internal `ambilAkun()`". `/ganti-sandi/page.tsx` needs the `nonaktif` / `profil-hilang` distinction that `getUser()` flattens to `null`, and inventing a third public wrapper is more machinery than exporting the primitive. `dal.ts` starts with `import "server-only"`, so it stays server-side either way.
2. **The view is written `with (security_invoker = false, security_barrier = true)`.** The spec shows only `security_barrier`. `security_invoker = false` is the Postgres default, so this changes nothing — it just states the "runs as owner" contract explicitly, matching `supabase/migrations/20260825030000_view.sql`.
3. **`supabase/tests/sandbox.mjs` gets the `raw_app_meta_data` column too.** The spec only names `alur.mjs`, but `sandbox.mjs` builds the same `auth.users` stub and runs the same migrations; without the column the new view fails to create and the sandbox dies on startup.
4. **`pesanGalatAuth` also maps `user_already_exists` and `same_password`.** The first is the same condition as `email_exists` from a different GoTrue path; the second is reachable from `/ganti-sandi` and would otherwise show the generic sentence for a case the user can fix.
5. **Tata Usaha cannot reset their _own_ password from `/pengguna`.** The spec's self-guard list is role / deactivate / delete. Self-reset is not dangerous but is a footgun: it stamps `sandi_sementara` on your own account and the next navigation drops you at `/ganti-sandi`, where the only way through is the password you would have had to copy out of the panel first. The button is hidden on your own row and the action refuses, pointing at `/ganti-sandi` instead.
6. **`Pencarian` takes `ariaLabel`, not `aria-label`.** The spec names the prop `aria-label`; a hyphenated prop on a custom component reads as a DOM passthrough it is not. The value still lands on the input's `aria-label` attribute.

---

## Task 1: Migration — `is_aktif()`, the four policy amendments, and the `pengguna` view

**Files:**

- Create: `supabase/migrations/20260830010000_pengguna.sql`
- Modify: `supabase/tests/alur.mjs:67-72` (stub) and end of file (new section)
- Modify: `supabase/tests/sandbox.mjs:27-32` (stub only)

**Interfaces:**

- Produces: SQL function `public.is_aktif() returns boolean`; view `public.pengguna` with columns `id uuid, nama_lengkap text, role public.role_user, aktif boolean, unit_kerja_id uuid, unit_kerja text, email text, sandi_sementara boolean, created_at timestamptz`, readable by `authenticated` and returning zero rows unless `public.is_tu()`.
- Consumes: nothing.

- [ ] **Step 1: Give both PGlite stubs the `raw_app_meta_data` column**

The new view reads `u.raw_app_meta_data`. Without this column the migration cannot even be created, and both harnesses die at startup rather than at an assertion.

In `supabase/tests/alur.mjs`, replace the `create table auth.users (...)` line inside the setup `db.exec` with:

```js
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
```

Make the identical replacement in `supabase/tests/sandbox.mjs`.

- [ ] **Step 2: Write the failing assertions**

Append this whole block to `supabase/tests/alur.mjs`, **between** the `— master data —` section and the final `console.log(...pass...gagal)` lines. It goes last for the same reason master data does: it adds `permintaan` rows and flips `aktif`, and earlier assertions count rows exactly.

```js
// Sama seperti master data: ditaruh paling akhir karena bagian ini
// menambah permintaan dan mengutak-atik kolom aktif.
console.log("\n— pengguna —");

// Draft disusun selagi akunnya masih aktif. Nanti dipakai membuktikan
// bahwa penonaktifan ikut mengunci baris yang sudah terlanjur ada.
let permD;
await as(PGW, async () => {
    await db.exec(
        `insert into public.permintaan (keperluan) values ('Draft sebelum akun dinonaktifkan');`,
    );
    permD = (
        await db.query(
            `select id from public.permintaan order by created_at desc limit 1`,
        )
    ).rows[0].id;
});

await as(TU, async () => {
    const p = (
        await db.query(`select * from public.pengguna order by nama_lengkap`)
    ).rows;
    ok(
        "tata usaha melihat seluruh akun lewat view pengguna",
        p.length === 3,
        `(${p.length} baris)`,
    );

    const email = Object.fromEntries(p.map((r) => [r.id, r.email]));
    ok(
        "email ikut terbawa dari auth.users",
        email[TU] === "tu@smpn14.sch.id" &&
            email[PGW] === "guru.ipa@smpn14.sch.id",
        JSON.stringify(email),
    );

    const guru = p.find((r) => r.id === PGW);
    ok(
        "unit kerja ikut terbaca lewat left join",
        guru.unit_kerja === "Guru",
        String(guru.unit_kerja),
    );
    ok(
        "sandi_sementara tanpa app_metadata -> false, bukan null",
        guru.sandi_sementara === false,
        String(guru.sandi_sementara),
    );
});

// Ditulis sebagai pemilik tabel, bukan lewat as(): app_metadata memang
// hanya bisa disentuh service role, persis seperti nanti di Supabase.
await db.exec(
    `update auth.users set raw_app_meta_data = jsonb_build_object('sandi_sementara', true) where id = '${PGW}'`,
);

await as(TU, async () => {
    const r = (
        await db.query(
            `select sandi_sementara from public.pengguna where id = '${PGW}'`,
        )
    ).rows[0];
    ok(
        "sandi_sementara terbaca dari app_metadata",
        r.sandi_sementara === true,
        String(r.sandi_sementara),
    );
});

// Inilah satu-satunya yang berdiri antara seorang guru dan seluruh
// alamat email staf: view ini berjalan sebagai pemiliknya, jadi RLS
// profil tidak berlaku dan where is_tu() adalah gerbangnya.
await as(PGW, async () => {
    const p = (await db.query(`select * from public.pengguna`)).rows;
    ok(
        "pegawai membaca view pengguna -> 0 baris, bukan galat",
        p.length === 0,
        `(${p.length} baris)`,
    );
});

await as(TU, async () => {
    const u = await db.query(
        `update public.profil set aktif = false where id = '${PGW}'`,
    );
    ok(
        "tata usaha menonaktifkan akun pegawai",
        u.affectedRows === 1,
        `(${u.affectedRows} baris)`,
    );
});

await as(PGW, async () => {
    await expectError(
        "akun nonaktif tidak bisa membuat permintaan",
        () =>
            db.query(
                `insert into public.permintaan (keperluan) values ('Setelah dinonaktifkan')`,
            ),
        "row-level security",
    );

    await expectError(
        "akun nonaktif tidak bisa menambah baris permintaan",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${permD}', '${spidol}', 1)`,
            ),
        "row-level security",
    );

    // UPDATE dan DELETE yang ditolak RLS tidak memunculkan galat sama
    // sekali - barisnya sekadar hilang dari pandangan. Itu sebabnya
    // server action memeriksa baris yang kembali, bukan hanya error.
    const u = await db.query(
        `update public.permintaan set keperluan = 'diubah diam-diam' where id = '${permD}'`,
    );
    ok(
        "akun nonaktif mengubah draftnya sendiri: nol baris, tanpa galat",
        u.affectedRows === 0,
        `(${u.affectedRows} baris)`,
    );

    const d = await db.query(
        `delete from public.permintaan where id = '${permD}'`,
    );
    ok(
        "akun nonaktif menghapus draftnya sendiri: nol baris",
        d.affectedRows === 0,
        `(${d.affectedRows} baris)`,
    );
});

await as(TU, async () => {
    await db.query(`update public.profil set aktif = true where id = '${PGW}'`);
});

await as(PGW, async () => {
    const u = await db.query(
        `update public.permintaan set keperluan = 'Boleh lagi setelah diaktifkan' where id = '${permD}'`,
    );
    ok(
        "diaktifkan lagi -> boleh mengubah draftnya",
        u.affectedRows === 1,
        `(${u.affectedRows} baris)`,
    );

    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ('${permD}', '${spidol}', 1)`,
    );
    const n = (
        await db.query(
            `select count(*)::int as n from public.permintaan_item where permintaan_id = '${permD}'`,
        )
    ).rows[0].n;
    ok("diaktifkan lagi -> boleh menambah baris permintaan", n === 1, `(${n})`);

    await db.query(
        `insert into public.permintaan (keperluan) values ('Permintaan setelah diaktifkan')`,
    );
    const b = (
        await db.query(
            `select count(*)::int as n from public.permintaan where keperluan = 'Permintaan setelah diaktifkan'`,
        )
    ).rows[0].n;
    ok("diaktifkan lagi -> boleh membuat permintaan baru", b === 1, `(${b})`);
});

await as(TU, async () => {
    const naik = await db.query(
        `update public.profil set role = 'pengurus_barang' where id = '${PGW}'`,
    );
    ok(
        "tata usaha boleh mengganti peran akun lain",
        naik.affectedRows === 1,
        `(${naik.affectedRows} baris)`,
    );
    await db.query(
        `update public.profil set role = 'pegawai' where id = '${PGW}'`,
    );
});

await as(PGW, async () => {
    await expectError(
        "pegawai tetap tidak bisa menaikkan perannya sendiri",
        () =>
            db.query(
                `update public.profil set role = 'tata_usaha' where id = '${PGW}'`,
            ),
        "tata usaha",
    );
});
```

- [ ] **Step 3: Run the tests to verify the new section fails**

Run: `npm run db:test`
Expected: every assertion above `— pengguna —` still passes; the run then fails on `relation "public.pengguna" does not exist` (the script throws out of the first `db.query` against the view, so the process exits non-zero without printing the summary). That is the failure we are fixing.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260830010000_pengguna.sql`:

```sql
-- =============================================================
-- SIPB SMPN 14 - Kelola pengguna
--
-- Tiga hal: helper is_aktif(), gigi untuk profil.aktif di keempat
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run db:test`
Expected: every assertion passes, the summary line reads `N lolos, 0 gagal`, and the process exits 0.

- [ ] **Step 6: Check the sandbox still boots**

Run: `echo '\q' | npm run db:sandbox`
Expected: the banner and help text print, then `sampai jumpa`. No error about `raw_app_meta_data` or `public.pengguna`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260830010000_pengguna.sql supabase/tests/alur.mjs supabase/tests/sandbox.mjs
git commit -m "feat(db): gigi untuk profil.aktif dan view pengguna"
```

---

## Task 2: Temporary-password generator

**Files:**

- Create: `src/lib/sandi.ts`
- Create: `src/lib/sandi.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**

- Consumes: nothing.
- Produces: `sandiSementara(panjang?: number): string` — 12 characters by default, drawn from a 57-symbol alphabet with no `0`, `O`, `1`, `l`, or `I`.

Node 24 strips TypeScript types natively, so a plain `.mjs` file can `import { sandiSementara } from "./sandi.ts"` and run under `node` with no build step and no new dependency. That is why `sandi.ts` deliberately does **not** start with `import "server-only"`: it holds no secret, works in either runtime, and staying importable is what makes it testable. `admin.ts` is the file that carries the guard.

- [ ] **Step 1: Write the failing test**

Create `src/lib/sandi.test.mjs`:

```js
// Dijalankan tanpa build: Node 24 melepas anotasi tipe sendiri.
//
//   npm run test:sandi

import { sandiSementara } from "./sandi.ts";

let lolos = 0;
let gagal = 0;

const ok = (label, syarat, extra = "") => {
    if (syarat) {
        lolos++;
        console.log(`  ok    ${label}`);
    } else {
        gagal++;
        console.log(`  FAIL  ${label} ${extra}`);
    }
};

const CONTOH = Array.from({ length: 400 }, () => sandiSementara());

console.log("\n— sandi sementara —");

ok(
    "panjangnya 12 karakter",
    CONTOH.every((s) => s.length === 12),
    CONTOH.find((s) => s.length !== 12),
);

ok(
    "panjang bisa diminta lain",
    sandiSementara(20).length === 20,
    String(sandiSementara(20).length),
);

// 0/O/1/l/I dibuang: sandi ini dibacakan dari layar lalu diketik ulang.
const MEMBINGUNGKAN = /[0O1lI]/;
ok(
    "tidak pernah memuat 0, O, 1, l, atau I",
    CONTOH.every((s) => !MEMBINGUNGKAN.test(s)),
    CONTOH.find((s) => MEMBINGUNGKAN.test(s)),
);

const SAH = /^[A-HJ-NP-Za-km-z2-9]+$/;
ok(
    "seluruh karakternya berasal dari alfabet yang dimaksud",
    CONTOH.every((s) => SAH.test(s)),
    CONTOH.find((s) => !SAH.test(s)),
);

ok(
    "400 sandi berturut-turut semuanya berbeda",
    new Set(CONTOH).size === 400,
    `(${new Set(CONTOH).size} unik)`,
);

// Rejection sampling yang keliru batasnya membuang simbol-simbol
// terakhir alfabet tanpa suara. 4800 karakter membuat setiap simbol
// muncul ~84 kali; satu yang hilang berarti batasnya salah.
const terpakai = new Set(CONTOH.join(""));
ok(
    "seluruh 57 simbol alfabet pernah terpakai",
    terpakai.size === 57,
    `(${terpakai.size} simbol)`,
);

console.log(`\n${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
```

Add the script to `package.json`, after `"db:sandbox"`:

```json
    "test:sandi": "node src/lib/sandi.test.mjs",
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:sandi`
Expected: `ERR_MODULE_NOT_FOUND` — `Cannot find module .../src/lib/sandi.ts`.

- [ ] **Step 3: Write the generator**

Create `src/lib/sandi.ts`:

```ts
/**
 * Sandi sementara untuk akun yang baru dibuat tata usaha.
 *
 * Selalu dibangkitkan, tidak pernah diketik. Membiarkan tata usaha
 * mengarangnya sendiri berujung pada satu pola rumahan yang sama di
 * seluruh akun sekolah - persis risiko yang sudah dibawa oleh gagasan
 * "sandi sementara" itu sendiri.
 *
 * Alfabetnya membuang 0, O, 1, l, dan I. Sandi ini dibacakan dari layar
 * lalu diketik ulang di perangkat lain; sepasang karakter kembar bentuk
 * mengubah "belum sempat mencatat" menjadi "sandinya salah".
 */
const ALFABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const PANJANG_BAKU = 12;

/**
 * Rejection sampling, bukan `byte % 57`. 256 tidak habis dibagi 57, jadi
 * modulo polos membuat empat simbol pertama alfabet muncul lebih sering
 * daripada sisanya. Bias itu kecil dan tidak pernah terlihat - justru
 * karena itu ia harus ditutup di sini, bukan diingat belakangan.
 */
export function sandiSementara(panjang: number = PANJANG_BAKU): string {
    const batas = 256 - (256 % ALFABET.length);
    const kantong = new Uint8Array(panjang);
    let hasil = "";

    while (hasil.length < panjang) {
        crypto.getRandomValues(kantong);
        for (const byte of kantong) {
            if (byte >= batas) continue;
            hasil += ALFABET[byte % ALFABET.length];
            if (hasil.length === panjang) break;
        }
    }

    return hasil;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:sandi`
Expected: six `ok` lines and `6 lolos, 0 gagal`.

- [ ] **Step 5: Verify the file did not break the build's type check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sandi.ts src/lib/sandi.test.mjs package.json
git commit -m "feat: pembangkit sandi sementara tanpa bias modulo"
```

---

## Task 3: Service-role client and `pesanGalatAuth`

**Files:**

- Create: `src/lib/supabase/admin.ts`
- Modify: `src/lib/aksi.ts`

**Interfaces:**

- Consumes: `GALAT_UMUM` (module-private in `aksi.ts`).
- Produces:
    1. `createAdminClient(): SupabaseClient` from `@/lib/supabase/admin` — a service-role client; call `.auth.admin.createUser`, `.auth.admin.updateUserById`, `.auth.admin.deleteUser` on it.
    2. `pesanGalatAuth(galat: AuthError): string` from `@/lib/aksi`.
    3. `GALAT_RIWAYAT: string` from `@/lib/aksi`.

- [ ] **Step 1: Write the service-role client**

Create `src/lib/supabase/admin.ts`:

```ts
import "server-only";

import { ENVIRONMENT } from "@/config/environment";
import { createClient } from "@supabase/supabase-js";

/**
 * Klien service-role. Melewati RLS sepenuhnya.
 *
 * Di seluruh kode lain, pemeriksaan peran di server action adalah lapis
 * kedua dan policy RLS-lah gerbangnya. Di sini urutannya terbalik:
 * pastikanTataUsaha() ADALAH gerbangnya, dan di belakangnya tidak ada
 * apa-apa lagi. Karena itu berkas ini hanya dipanggil dari empat tempat -
 * buat akun, setel ulang sandi, hapus akun, dan pembersihan penanda
 * sandi_sementara milik sesi sendiri.
 *
 * `import "server-only"` di baris pertama bukan hiasan: kuncinya dibaca
 * di sini, bukan di src/config/environment.ts, sebab modul itu diimpor
 * oleh klien peramban dan oleh proxy, dan tidak punya penjaga apa pun.
 * Rahasia yang ditaruh di sana tinggal berjarak satu impor ceroboh dari
 * bundel peramban.
 *
 * createClient() dari @supabase/supabase-js, bukan @supabase/ssr: klien
 * ini tidak boleh menyentuh cookie sesi siapa pun. Ia bukan "pengguna
 * yang sedang masuk", ia alat administrasi.
 *
 * Alamat proyeknya tetap diambil dari ENVIRONMENT - itu memang nilai
 * publik, dan tidak ada gunanya menuliskannya dua kali. Hanya kuncinya
 * yang dibaca langsung di sini.
 */
export const createAdminClient = () => {
    const kunci = process.env.SUPABASE_SECRET_KEY;

    if (!kunci) {
        throw new Error(
            "SUPABASE_SECRET_KEY belum diatur. Tanpa itu akun tidak bisa dibuat, sandinya tidak bisa disetel ulang, dan akun tidak bisa dihapus.",
        );
    }

    return createClient(ENVIRONMENT.supabaseUrl!, kunci, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
};
```

- [ ] **Step 2: Add `pesanGalatAuth` to `src/lib/aksi.ts`**

Change the import line at the top of `src/lib/aksi.ts` from:

```ts
import type { PostgrestError } from "@supabase/supabase-js";
```

to:

```ts
import type { AuthError, PostgrestError } from "@supabase/supabase-js";
```

Then append to the end of the file:

```ts
export const GALAT_RIWAYAT =
    "Akun ini sudah punya riwayat permintaan, jadi tidak bisa dihapus. Nonaktifkan saja.";

/**
 * Pasangan pesanGalatDb untuk galat yang datang dari Supabase Auth.
 *
 * Auth Admin API mengembalikan AuthError, bukan PostgrestError: tidak ada
 * kolom `code` berisi SQLSTATE, melainkan kode kata seperti `email_exists`.
 * Karena itu ia butuh pemetaannya sendiri - bukan cabang tambahan di
 * pesanGalatDb yang harus menebak-nebak bentuk galat yang masuk.
 */
export function pesanGalatAuth(galat: AuthError): string {
    switch (galat.code) {
        case "email_exists":
        case "user_already_exists":
            return "Email itu sudah dipakai akun lain.";

        case "weak_password":
            // Mestinya tidak terjangkau untuk sandi yang dibangkitkan
            // sendiri; dipetakan karena /ganti-sandi menerima sandi ketikan.
            return "Kata sandi terlalu pendek, minimal 8 karakter.";

        case "same_password":
            return "Kata sandi baru harus berbeda dari yang lama.";

        case "validation_failed":
            // validation_failed dipakai untuk banyak hal. Hanya yang
            // menyebut email yang bisa diterjemahkan dengan yakin.
            if (/email/i.test(galat.message)) {
                return "Alamat email itu tidak bisa dipakai.";
            }
            break;
    }

    // Penghapusan akun yang tertahan foreign key sampai ke sini sebagai
    // kegagalan tak terduga dari GoTrue, bukan sebagai kode kata: yang
    // menolak adalah Postgres, di ujung rantai on delete cascade menuju
    // profil. Bukan kerusakan - justru penjaga yang membuat riwayat
    // permintaan lama tetap punya nama pemohon.
    if (/23503|foreign key|permintaan/i.test(galat.message)) {
        return GALAT_RIWAYAT;
    }

    console.error("[auth]", galat.code, galat.status, galat.message);
    return GALAT_UMUM;
}
```

- [ ] **Step 3: Verify nothing leaked the secret into the client bundle**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; ESLint reports no errors.

Then run: `grep -rn "SUPABASE_SECRET_KEY" src/`
Expected: exactly one hit, `src/lib/supabase/admin.ts`. If `src/config/environment.ts` appears, that is the failure this step exists to catch — remove it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/admin.ts src/lib/aksi.ts
git commit -m "feat: klien service-role dan terjemahan galat Auth"
```

---

## Task 4: Move `Pencarian` and `siapkanKataKunci` so a second page can use them

Pure refactor, no behaviour change. `/master-barang` must look and work exactly as it does now when this task is done.

**Files:**

- Create: `src/components/admin/pencarian.tsx`
- Delete: `src/app/(dashboard)/master-barang/pencarian.tsx`
- Modify: `src/lib/aksi.ts`, `src/app/(dashboard)/master-barang/page.tsx:26-30`, `src/app/(dashboard)/master-barang/barang-tabel.tsx:16,44`

**Interfaces:**

- Consumes: nothing new.
- Produces:
    1. `Pencarian({ awal, jalur, placeholder, ariaLabel }: { awal: string; jalur: string; placeholder: string; ariaLabel: string })` from `@/components/admin/pencarian`.
    2. `siapkanKataKunci(kata: string): string` from `@/lib/aksi`.

- [ ] **Step 1: Move `siapkanKataKunci` into `src/lib/aksi.ts`**

Append to `src/lib/aksi.ts` (keeping the doc comment verbatim from where it came — the reasoning is the whole value of this function):

```ts
/**
 * PostgREST menerima .or() sebagai satu string filter, bukan nilai
 * berparameter: koma memisahkan cabang dan tanda kurung mengelompokkannya.
 * Kata kunci mentah karena itu bisa merusak seluruh ekspresinya - pencarian
 * "HVS, A4" terbaca sebagai cabang ketiga yang tidak sah, dan permintaannya
 * gagal alih-alih menghasilkan nol baris.
 *
 * Nilainya dikutip ganda supaya koma dan kurung di dalamnya ikut terbawa apa
 * adanya, sementara joker ilike dibuang supaya "50%" mencari "50", bukan
 * mencocokkan segalanya.
 *
 * Tinggal di sini, bukan di salah satu page.tsx, sejak pemanggilnya lebih
 * dari satu: sanitasi seperti ini tidak boleh ditulis ulang per halaman.
 */
export const siapkanKataKunci = (kata: string): string =>
    kata.replace(/[%_]/g, "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
```

Then delete the local `siapkanKataKunci` const and its comment block from `src/app/(dashboard)/master-barang/page.tsx` (currently lines 15–30) and import it instead. The import at the top of that file becomes:

```ts
import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
```

- [ ] **Step 2: Move `Pencarian` and give it the three props**

Create `src/components/admin/pencarian.tsx` with the contents of `src/app/(dashboard)/master-barang/pencarian.tsx`, changed as follows — the old file hardcoded `/master-barang` in three places:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

const JEDA_KETIK = 300;

/**
 * Kotak pencarian yang menulis kata kuncinya ke URL, bukan ke state komponen.
 * Dengan begitu hasil pencarian bisa ditautkan dan dimuat ulang, dan halaman
 * server yang tetap memegang datanya - tidak ada salinan daftar di peramban
 * yang bisa basi.
 *
 * Nilai awal datang sebagai prop, bukan dari useSearchParams(), supaya
 * komponen ini tidak menuntut batas Suspense di sekelilingnya.
 */
export function Pencarian({
    awal,
    jalur,
    placeholder,
    ariaLabel,
}: {
    awal: string;
    /** Alamat halaman pemakainya, mis. "/master-barang". */
    jalur: string;
    placeholder: string;
    ariaLabel: string;
}) {
    const router = useRouter();
    const [nilai, setNilai] = React.useState(awal);
    const jeda = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const jalankan = React.useCallback(
        (kata: string) => {
            const bersih = kata.trim();
            // `hal` sengaja tidak dibawa: hasil pencarian baru selalu mulai
            // dari halaman pertama. Berpindah kata kunci sambil tetap di
            // halaman 4 hampir selalu berarti mendarat di daftar kosong.
            router.replace(
                bersih ? `${jalur}?cari=${encodeURIComponent(bersih)}` : jalur,
                { scroll: false },
            );
        },
        [router, jalur],
    );

    const ketik = (kata: string) => {
        setNilai(kata);
        if (jeda.current) clearTimeout(jeda.current);
        jeda.current = setTimeout(() => jalankan(kata), JEDA_KETIK);
    };

    const kosongkan = () => {
        if (jeda.current) clearTimeout(jeda.current);
        setNilai("");
        jalankan("");
    };

    React.useEffect(
        () => () => {
            if (jeda.current) clearTimeout(jeda.current);
        },
        [],
    );

    return (
        <div className="relative flex-1 sm:max-w-xs">
            <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.6}
            />
            <Input
                type="search"
                value={nilai}
                onChange={(e) => ketik(e.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel}
                className="h-9.5 pr-9 pl-8.5"
            />
            {nilai && (
                <button
                    type="button"
                    onClick={kosongkan}
                    aria-label="Kosongkan pencarian"
                    className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    <X className="size-4" strokeWidth={1.6} />
                </button>
            )}
        </div>
    );
}
```

Then delete the old file:

```bash
git rm "src/app/(dashboard)/master-barang/pencarian.tsx"
```

- [ ] **Step 3: Point `barang-tabel.tsx` at the new location**

In `src/app/(dashboard)/master-barang/barang-tabel.tsx`, replace the import:

```tsx
import { Pencarian } from "./pencarian";
```

with:

```tsx
import { Pencarian } from "@/components/admin/pencarian";
```

and replace the usage `<Pencarian awal={cari} />` with:

```tsx
<Pencarian
    awal={cari}
    jalur="/master-barang"
    placeholder="Cari kode atau nama barang"
    ariaLabel="Cari barang"
/>
```

- [ ] **Step 4: Verify nothing changed**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors. In particular there must be no unresolved `./pencarian` import left anywhere — `grep -rn "from \"./pencarian\"" src/` should return nothing.

Then run: `npm run dev`, open `http://localhost:3000/master-barang` as Tata Usaha, and confirm: typing in the box still narrows the list after ~300ms, the URL becomes `/master-barang?cari=...`, the X clears it, and searching `HVS, A4` returns an empty list rather than an error banner.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/admin/pencarian.tsx src/lib/aksi.ts "src/app/(dashboard)/master-barang"
git commit -m "refactor: Pencarian dan siapkanKataKunci dipakai bersama dua halaman"
```

---

## Task 5: DAL rework, `/auth/keluar`, and the deactivation message on `/login`

This is the task that gives deactivation somewhere to land. `dal.ts:51`'s `signOut()` clears nothing today: `server.ts:16-20` swallows its cookie writes in an empty `catch`, and the bundled docs say why — "Setting cookies is not supported during Server Component rendering" (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:80`). Without a real sign-out, a deactivated user with a still-valid access token bounces between `/login` (proxy sees a session → `/beranda`) and `/beranda` (DAL sees no valid account → `/login`) until the token expires.

The guard stays in the DAL, not in `proxy.ts`: the docs say Proxy "should not be used as a full session management or authorization solution" (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md:29`), and this project already keeps the proxy to the single question "is there a session".

**Files:**

- Modify: `src/lib/dal.ts` (whole file)
- Create: `src/app/auth/keluar/route.ts`
- Modify: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces, from `@/lib/dal`:
    1. `type StatusTolak = "tanpa-sesi" | "profil-hilang" | "nonaktif"`
    2. `type Akun = { status: StatusTolak } | { status: "ok"; user: User; sandiSementara: boolean }`
    3. `ambilAkun(): Promise<Akun>`
    4. `jalurTolak(status: StatusTolak): string`
    5. `getUser(): Promise<User | null>` — unchanged signature, existing callers untouched
    6. `getUserOrRedirect(peranDibolehkan?: readonly Role[]): Promise<User>` — unchanged signature
    7. Route `GET /auth/keluar?alasan=nonaktif`

- [ ] **Step 1: Rewrite `src/lib/dal.ts`**

Replace the whole file with:

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cache } from "react";

export type Role = "pegawai" | "pengurus_barang" | "tata_usaha";

export type User = {
    id: string;
    email: string;
    namaLengkap: string;
    role: Role;
    unitKerja: string | null;
};

type BarisProfil = {
    nama_lengkap: string;
    role: Role;
    aktif: boolean;
    unit_kerja: { nama: string } | null;
};

/** Sebab-sebab sebuah sesi tidak boleh diteruskan ke dalam aplikasi. */
export type StatusTolak = "tanpa-sesi" | "profil-hilang" | "nonaktif";

export type Akun =
    | { status: StatusTolak }
    | { status: "ok"; user: User; sandiSementara: boolean };

export const JALUR_GANTI_SANDI = "/ganti-sandi";

/**
 * Ke mana sebuah sesi yang ditolak dipulangkan.
 *
 * Dua di antaranya lewat /auth/keluar, bukan langsung ke /login: sesinya
 * masih hidup di peramban, dan DAL tidak bisa mencabutnya sendiri -
 * penulisan cookie saat merender Server Component memang tidak didukung.
 * Tanpa singgah ke route handler itu, pengguna akan memantul antara
 * /login dan /beranda sampai tokennya kedaluwarsa sendiri.
 */
export const jalurTolak = (status: StatusTolak): string => {
    switch (status) {
        case "tanpa-sesi":
            return "/login";
        case "nonaktif":
            return "/auth/keluar?alasan=nonaktif";
        case "profil-hilang":
            return "/auth/keluar";
    }
};

/**
 * Satu-satunya tempat yang benar-benar bertanya ke Supabase.
 *
 * getUser() tidak bisa mengungkapkan "sudah masuk tetapi tidak boleh
 * lewat" - ia hanya punya User atau null. Perbedaan itu justru yang
 * menentukan ke mana orangnya dikirim, jadi ia hidup di sini dan kedua
 * fungsi umum di bawah membacanya.
 *
 * Dipakai layout dashboard dan halaman-halaman di bawahnya dalam satu
 * render pass yang sama. Tanpa cache() itu berarti satu perjalanan ke
 * Supabase per pemanggil, padahal jawabannya sama persis.
 */
export const ambilAkun = cache(async (): Promise<Akun> => {
    const supabase = await createClient();

    // getUser(), bukan getSession(): yang terakhir hanya membaca cookie tanpa
    // memvalidasikannya ke Supabase. Sekalian, ini yang membuat penanda
    // sandi_sementara selalu segar dari basis data - JWT basi di peramban
    // tidak bisa menahan siapa pun di /ganti-sandi setelah sandinya diganti.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { status: "tanpa-sesi" };

    // Satu select saja. `role` dibaca langsung dari baris ini - peran_saya()
    // ada untuk kebijakan RLS, yang memang tidak memegang barisnya.
    const { data, error } = await supabase
        .from("profil")
        .select("nama_lengkap, role, aktif, unit_kerja ( nama )")
        .eq("id", user.id)
        .single<BarisProfil>();

    // Sesi Auth valid tetapi profilnya tidak terjangkau - baris hilang, RLS
    // menolak, atau sambungan sedang tersendat.
    if (error || !data) return { status: "profil-hilang" };

    // Baris sendiri tetap terbaca walau nonaktif (policy baca_profil), jadi
    // "nonaktif" memang bisa dibedakan dari "profil hilang".
    if (!data.aktif) return { status: "nonaktif" };

    return {
        status: "ok",
        user: {
            id: user.id,
            // profil tidak punya kolom email; alamatnya milik Supabase Auth.
            email: user.email ?? "",
            namaLengkap: data.nama_lengkap,
            role: data.role,
            unitKerja: data.unit_kerja?.nama ?? null,
        },
        // app_metadata hanya bisa ditulis service role. Itulah sebabnya
        // penanda ini tinggal di sana dan bukan di user_metadata: pemiliknya
        // sendiri tidak boleh bisa membersihkannya.
        sandiSementara: user.app_metadata?.sandi_sementara === true,
    };
});

export const getUser = cache(async (): Promise<User | null> => {
    const akun = await ambilAkun();
    return akun.status === "ok" ? akun.user : null;
});

export const getUserOrRedirect = cache(
    async (peranDibolehkan?: readonly Role[]): Promise<User> => {
        const akun = await ambilAkun();

        if (akun.status !== "ok") redirect(jalurTolak(akun.status));

        // Sebelum pemeriksaan peran, dengan sengaja: tata usaha yang masih
        // memegang sandi sementara ditahan sama seperti orang lain.
        if (akun.sandiSementara) redirect(JALUR_GANTI_SANDI);

        // Pagar per-halaman untuk rute khusus peran. Beranda memanggil tanpa
        // filter; halaman yang dibatasi meneruskan daftar peran yang berhak.
        // Alih ke /beranda supaya salah-alamat dari URL tetap membawa pengguna
        // ke laman yang pasti terlihat oleh perannya.
        if (peranDibolehkan && !peranDibolehkan.includes(akun.user.role)) {
            redirect("/beranda");
        }

        return akun.user;
    },
);
```

- [ ] **Step 2: Write the sign-out route handler**

Create `src/app/auth/keluar/route.ts`:

```ts
import { ENVIRONMENT } from "@/config/environment";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keluar sungguhan, di tempat cookie memang boleh ditulis.
 *
 * DAL tidak bisa melakukannya: createClient() di server.ts membungkus
 * penulisan cookie-nya dalam catch kosong, karena merender Server
 * Component memang bukan tempat menyetel cookie. Akibatnya signOut()
 * dari sana tidak membersihkan apa pun di peramban, dan akun yang baru
 * dinonaktifkan memantul antara /login dan /beranda sampai tokennya
 * kedaluwarsa sendiri.
 *
 * Pengalihannya dibangun lebih dulu, lalu penulisan cookie milik klien
 * Supabase diikatkan langsung ke response itu - cara yang sama dipakai
 * proxy.ts:26-38 - supaya tidak ada pertanyaan apakah header Set-Cookie
 * ikut terbawa pada NextResponse yang dikembalikan.
 */
export async function GET(request: NextRequest) {
    // Hanya nilai yang sudah dikenal yang diteruskan. Query dari luar tidak
    // pernah dipantulkan apa adanya ke halaman berikutnya.
    const nonaktif = request.nextUrl.searchParams.get("alasan") === "nonaktif";

    const tujuan = new URL("/login", request.url);
    if (nonaktif) tujuan.searchParams.set("alasan", "nonaktif");

    const response = NextResponse.redirect(tujuan);

    const supabase = createServerClient(
        ENVIRONMENT.supabaseUrl!,
        ENVIRONMENT.supabaseKey!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Galatnya sengaja tidak dihiraukan. Token yang sudah tidak sah membuat
    // panggilan ke server Auth gagal, tetapi sesi lokal tetap dibuang - dan
    // membuang sesi lokal itulah seluruh gunanya berkas ini.
    await supabase.auth.signOut();

    return response;
}
```

- [ ] **Step 3: Show the reason on `/login`**

Replace `src/app/(auth)/login/page.tsx` with:

```tsx
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
    title: "Masuk — SIPB SMPN 14",
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ alasan?: string }>;
}) {
    // Satu-satunya alasan yang dikenali. /auth/keluar yang memasangnya, dan
    // hanya untuk nilai itu - jadi tidak ada teks dari luar yang sampai ke
    // layar lewat jalur ini.
    const { alasan } = await searchParams;

    return <LoginForm nonaktif={alasan === "nonaktif"} />;
}
```

In `src/app/(auth)/login/login-form.tsx`, change the component signature and the alert. The function becomes:

```tsx
export function LoginForm({ nonaktif = false }: { nonaktif?: boolean }) {
```

and the alert line inside the returned form becomes:

```tsx
{
    galat ? (
        <FormAlert>{galat}</FormAlert>
    ) : (
        nonaktif && (
            <FormAlert>Akun Anda dinonaktifkan. Hubungi tata usaha.</FormAlert>
        )
    );
}
```

The rest of the file is unchanged. Note the ordering: once the user has actually tried to sign in, their own error is what matters, not the message that brought them here.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Run `npm run dev` and check, signed in as any account:

1. Visit `http://localhost:3000/auth/keluar` directly. Expected: you land on `/login`, signed out, with no message. Reloading `/beranda` sends you back to `/login` — no bouncing.
2. Sign in again, then visit `http://localhost:3000/auth/keluar?alasan=nonaktif`. Expected: `/login?alasan=nonaktif` showing "Akun Anda dinonaktifkan. Hubungi tata usaha."
3. Sign in again and confirm `/beranda`, `/master-barang`, and `/unit-kerja` still load — the DAL rewrite must not have changed anything for a healthy account.
4. In the Supabase SQL editor, run `update public.profil set aktif = false where id = '<your uuid>'`, then navigate anywhere in the app. Expected: you end on `/login?alasan=nonaktif` with the message, in one hop. Set it back to `true` afterwards.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dal.ts "src/app/auth/keluar/route.ts" "src/app/(auth)/login"
git commit -m "feat: akun nonaktif dikeluarkan dengan pesan, bukan dipantulkan"
```

---

## Task 6: `/ganti-sandi` — the forced password change

Sits in the `(auth)` route group. It is a signed-in page, but rendering the dashboard shell around it would be a lie: the point is that the user is not through the door yet. The proxy needs no change — `/ganti-sandi` is not in `TANPA_SESI` and is always reached with a live session.

The page calls `ambilAkun()` directly rather than `getUserOrRedirect()`; that is exactly what keeps `sandiSementara → /ganti-sandi` from looping.

**Files:**

- Create: `src/app/(auth)/ganti-sandi/page.tsx`
- Create: `src/app/(auth)/ganti-sandi/actions.ts`
- Create: `src/app/(auth)/ganti-sandi/ganti-sandi-form.tsx`

**Interfaces:**

- Consumes: `ambilAkun`, `jalurTolak` (`@/lib/dal`); `createAdminClient` (`@/lib/supabase/admin`); `pesanGalatAuth` (`@/lib/aksi`); `AuthField`, `PasswordInput`, `PanelSukses`, `KELAS_TAUTAN_HALUS` (`@/components/auth/form-parts`); `FormAlert`, `SubmitButton` (`@/components/form-parts`).
- Produces: `gantiSandi(sebelumnya: HasilGanti | null, formData: FormData): Promise<HasilGanti>` and `type HasilGanti = { ok: true } | { ok: false; galat: string }`, both from `./actions`.

- [ ] **Step 1: Write the server action**

Create `src/app/(auth)/ganti-sandi/actions.ts`:

```ts
"use server";

import { pesanGalatAuth } from "@/lib/aksi";
import { ambilAkun, jalurTolak } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const PANJANG_MINIMAL = 8;

export type HasilGanti = { ok: true } | { ok: false; galat: string };

/**
 * Mengganti kata sandi sendiri, dengan sandi lama sebagai syarat.
 *
 * Supabase tidak menuntut sandi lama pada updateUser() - sesi yang hidup
 * sudah cukup baginya. Di sini ia tetap diminta: laptop yang ditinggal
 * terbuka di ruang guru seharusnya tidak cukup untuk mengambil alih akun
 * orang. Karena itu signInWithPassword() dijalankan lebih dulu, memakai
 * akun yang sama, semata-mata sebagai pembuktian.
 */
export async function gantiSandi(
    _sebelumnya: HasilGanti | null,
    formData: FormData,
): Promise<HasilGanti> {
    const akun = await ambilAkun();
    if (akun.status !== "ok") redirect(jalurTolak(akun.status));

    const lama = String(formData.get("lama") ?? "");
    const baru = String(formData.get("baru") ?? "");
    const ulangi = String(formData.get("ulangi") ?? "");

    if (!lama) return { ok: false, galat: "Kata sandi lama belum diisi." };
    if (baru.length < PANJANG_MINIMAL) {
        return {
            ok: false,
            galat: `Kata sandi baru minimal ${PANJANG_MINIMAL} karakter.`,
        };
    }
    if (baru !== ulangi) {
        return { ok: false, galat: "Kedua kata sandi baru belum sama." };
    }
    if (baru === lama) {
        return {
            ok: false,
            galat: "Kata sandi baru harus berbeda dari yang lama.",
        };
    }

    const supabase = await createClient();

    const { error: galatMasuk } = await supabase.auth.signInWithPassword({
        email: akun.user.email,
        password: lama,
    });
    if (galatMasuk) {
        return { ok: false, galat: "Kata sandi lama salah." };
    }

    const { error: galatSimpan } = await supabase.auth.updateUser({
        password: baru,
    });
    if (galatSimpan) {
        return { ok: false, galat: pesanGalatAuth(galatSimpan) };
    }

    // Penanda dibersihkan dengan klien service-role, sebab app_metadata
    // memang tidak bisa disentuh sesi pengguna - dan itu justru gunanya.
    const admin = createAdminClient();
    const { error: galatPenanda } = await admin.auth.admin.updateUserById(
        akun.user.id,
        { app_metadata: { sandi_sementara: false } },
    );

    if (galatPenanda) {
        // Sandinya sudah berganti; yang tersisa hanya penandanya. Jangan
        // berpura-pura gagal seluruhnya - katakan apa adanya, sebab memuat
        // ulang halaman ini dan mencoba sekali lagi memang jalan keluarnya.
        console.error("[ganti sandi]", galatPenanda.code, galatPenanda.message);
        return {
            ok: false,
            galat: "Kata sandi baru sudah tersimpan, tetapi status akun belum ikut diperbarui. Muat ulang halaman ini lalu coba sekali lagi.",
        };
    }

    return { ok: true };
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(auth)/ganti-sandi/page.tsx`:

```tsx
import { ambilAkun, jalurTolak } from "@/lib/dal";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GantiSandiForm } from "./ganti-sandi-form";

export const metadata: Metadata = {
    title: "Ganti Kata Sandi — SIPB SMPN 14",
};

export default async function GantiSandiPage() {
    // ambilAkun(), bukan getUserOrRedirect(): fungsi itu mengalihkan setiap
    // pemegang sandi sementara ke halaman ini, jadi memanggilnya dari sini
    // berarti mengalihkan halaman ini ke dirinya sendiri, terus-menerus.
    const akun = await ambilAkun();
    if (akun.status !== "ok") redirect(jalurTolak(akun.status));

    // Tanpa penanda, halaman ini tetap boleh dibuka: inilah satu-satunya
    // layar ganti kata sandi bagi orang yang sudah masuk.
    return <GantiSandiForm dipaksa={akun.sandiSementara} />;
}
```

- [ ] **Step 3: Write the form**

Create `src/app/(auth)/ganti-sandi/ganti-sandi-form.tsx`:

```tsx
"use client";

import {
    AuthField,
    KELAS_TAUTAN_HALUS,
    PanelSukses,
    PasswordInput,
} from "@/components/auth/form-parts";
import { FormAlert, SubmitButton } from "@/components/form-parts";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { gantiSandi, type HasilGanti } from "./actions";

const PANJANG_MINIMAL = 8;
const JEDA_ALIH_MS = 2000;

export function GantiSandiForm({ dipaksa }: { dipaksa: boolean }) {
    const router = useRouter();
    const [hasil, kirim, pending] = React.useActionState<
        HasilGanti | null,
        FormData
    >(gantiSandi, null);

    const sukses = hasil?.ok === true;
    const galat = hasil?.ok === false ? hasil.galat : null;

    // refresh() membuang Router Cache yang terisi selagi penanda
    // sandi_sementara masih terpasang. Tanpa itu /beranda bisa dilayani
    // dari salinan lama yang justru memantulkan kembali ke halaman ini.
    const keBeranda = React.useCallback(() => {
        router.push("/beranda");
        router.refresh();
    }, [router]);

    React.useEffect(() => {
        if (!sukses) return;
        const jeda = setTimeout(keBeranda, JEDA_ALIH_MS);
        return () => clearTimeout(jeda);
    }, [sukses, keBeranda]);

    if (sukses) {
        return (
            <PanelSukses icon={ShieldCheck} judul="Kata sandi berhasil diganti">
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Mulai sekarang pakai kata sandi baru itu untuk masuk.
                    Sebentar lagi diarahkan ke beranda.
                </p>
                <button
                    type="button"
                    onClick={keBeranda}
                    className={`${KELAS_TAUTAN_HALUS} mt-1`}
                >
                    Ke beranda sekarang
                </button>
            </PanelSukses>
        );
    }

    return (
        <form action={kirim} className="flex flex-col gap-4.5">
            <div className="flex flex-col gap-1">
                <h1 className="text-[15px] font-semibold text-foreground">
                    {dipaksa ? "Ganti kata sandi dulu" : "Ganti kata sandi"}
                </h1>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {dipaksa
                        ? "Akun ini masih memakai kata sandi sementara dari tata usaha. Buat kata sandi Anda sendiri untuk melanjutkan."
                        : `Gunakan minimal ${PANJANG_MINIMAL} karakter. Kata sandi lama diminta sebagai pembuktian.`}
                </p>
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            <AuthField
                id="lama"
                label={dipaksa ? "Kata Sandi Sementara" : "Kata Sandi Lama"}
            >
                <PasswordInput
                    id="lama"
                    name="lama"
                    autoComplete="current-password"
                    required
                    autoFocus
                />
            </AuthField>

            <AuthField id="baru" label="Kata Sandi Baru">
                <PasswordInput
                    id="baru"
                    name="baru"
                    autoComplete="new-password"
                    minLength={PANJANG_MINIMAL}
                    required
                />
            </AuthField>

            <AuthField id="ulangi" label="Ulangi Kata Sandi Baru">
                <PasswordInput
                    id="ulangi"
                    name="ulangi"
                    autoComplete="new-password"
                    minLength={PANJANG_MINIMAL}
                    required
                />
            </AuthField>

            <SubmitButton pending={pending} pendingLabel="Menyimpan">
                Simpan kata sandi
            </SubmitButton>
        </form>
    );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Run `npm run dev` and, signed in as any account, open `http://localhost:3000/ganti-sandi`:

1. The page renders inside the auth card (no sidebar), heading "Ganti kata sandi".
2. Submitting a wrong old password shows "Kata sandi lama salah." and you stay signed in.
3. Submitting two different new passwords shows "Kedua kata sandi baru belum sama."
4. Submitting a correct old password with a valid new one shows the success panel and lands on `/beranda`. Sign out and back in with the new password to confirm it took.
5. The forced variant is verified in Task 9, once accounts with `sandi_sementara` exist.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/ganti-sandi"
git commit -m "feat: halaman ganti kata sandi sendiri"
```

---

## Task 7: `/pengguna` — list, search, edit, activate/deactivate, delete

Everything in this task runs through the **ordinary** SSR client. The list is gated by `where public.is_tu()` inside the view; the edits are gated by the `ubah_profil` policy and the `jaga_profil()` trigger. `pastikanTataUsaha()` is defence in depth here, exactly as on the other two master pages. Task 8 adds the privileged paths.

Delete is the one exception in this task: it needs the admin client, because `profil` rows are removed by cascade from `auth.users` and nothing else can delete an account. It lives here rather than in Task 8 because it belongs to the same `DialogForm` shape as edit; the show-once password panel is what Task 8 is really about.

**Files:**

- Create: `src/components/ui/select.tsx`
- Create: `src/app/(dashboard)/pengguna/page.tsx`
- Create: `src/app/(dashboard)/pengguna/actions.ts`
- Create: `src/app/(dashboard)/pengguna/pengguna-tabel.tsx`

**Interfaces:**

- Consumes: `pastikanTataUsaha`, `siapkanKataKunci`, `teks`, `pesanGalatDb`, `pesanGalatAuth`, `GALAT_HILANG`, `GALAT_RIWAYAT`, `type HasilAksi`, `type PesanKhas` (`@/lib/aksi`); `type Role` (`@/lib/dal`); `LABEL_PERAN` (`@/config/nav-items`); `Pencarian` (`@/components/admin/pencarian`); `DialogForm`, `BidangDialog` (`@/components/admin/dialog-form`); `createAdminClient` (`@/lib/supabase/admin`).
- Produces, from `./actions`: `ubahAkun(id, sebelumnya, formData) => Promise<HasilAksi>`, `setAktifAkun(id, aktif) => Promise<HasilAksi>`, `hapusAkun(id) => Promise<HasilAksi>`. From `./pengguna-tabel`: `PenggunaTabel`, `type BarisPengguna`, `type OpsiUnit`.
- Produces for Task 8: the table renders a "Tambah Akun" button and the reset-password row button only after Task 8 wires them; this task leaves them out.

- [ ] **Step 1: Add the Select component**

Run: `npx shadcn@latest add select`
Expected: `src/components/ui/select.tsx` is created, exporting at least `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, and `SelectItem`, importing from `"radix-ui"` the way `src/components/ui/switch.tsx` does.

Verify: `grep -n "^export\|from \"radix-ui\"" src/components/ui/select.tsx`

If the CLI cannot reach the registry, hand-write the file instead — it is a thin wrapper and the project already vendors its siblings:

```tsx
"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

function Select({
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
    return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue({
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
    return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
    className,
    children,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
    return (
        <SelectPrimitive.Trigger
            data-slot="select-trigger"
            className={cn(
                "flex h-9.5 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                className,
            )}
            {...props}
        >
            {children}
            <SelectPrimitive.Icon asChild>
                <ChevronDownIcon />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    );
}

function SelectContent({
    className,
    children,
    position = "popper",
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
    return (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                data-slot="select-content"
                position={position}
                className={cn(
                    "relative z-50 max-h-72 min-w-32 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
                    className,
                )}
                {...props}
            >
                <SelectPrimitive.Viewport className="min-w-(--radix-select-trigger-width)">
                    {children}
                </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    );
}

function SelectItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
    return (
        <SelectPrimitive.Item
            data-slot="select-item"
            className={cn(
                "relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-[13px] outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
                className,
            )}
            {...props}
        >
            <span className="absolute right-2 flex size-3.5 items-center justify-center">
                <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="size-4" />
                </SelectPrimitive.ItemIndicator>
            </span>
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </SelectPrimitive.Item>
    );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
```

- [ ] **Step 2: Write the server actions**

Create `src/app/(dashboard)/pengguna/actions.ts`:

```ts
"use server";

import {
    GALAT_HILANG,
    GALAT_RIWAYAT,
    pastikanTataUsaha,
    pesanGalatAuth,
    pesanGalatDb,
    teks,
    type HasilAksi,
    type PesanKhas,
} from "@/lib/aksi";
import type { Role } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR = "/pengguna";

const PANJANG_NAMA = 120;

const PERAN: readonly Role[] = ["pegawai", "pengurus_barang", "tata_usaha"];

const PESAN: PesanKhas = {
    ganda: "Data itu sudah dipakai akun lain.",
    terpakai: GALAT_RIWAYAT,
};

/**
 * Tata usaha tidak boleh menurunkan, menonaktifkan, atau menghapus
 * dirinya sendiri.
 *
 * Pagar ini saja sudah cukup menjaga sekolah dari laci terkunci, dan
 * tidak perlu hitungan "administrator terakhir": menurunkan satu-satunya
 * tata usaha berarti menurunkan diri sendiri, yang ditolak di sini; dan
 * kalau ada dua, siapa pun yang menurunkan yang lain tetap tersisa. Selalu
 * ada satu tata usaha aktif, tanpa satu pun query hitung dan tanpa balapan
 * antara dua tab.
 */
const PESAN_DIRI = {
    peran: "Peran akun sendiri tidak bisa diubah. Minta tata usaha lain yang melakukannya.",
    aktif: "Akun sendiri tidak bisa dinonaktifkan.",
    hapus: "Akun sendiri tidak bisa dihapus.",
};

type Isian = { nama_lengkap: string; role: Role; unit_kerja_id: string };

export async function ubahAkun(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    const saya = await pastikanTataUsaha();

    const nama = teks(formData, "nama_lengkap");
    const unitKerjaId = teks(formData, "unit_kerja_id");
    const peranDiminta = teks(formData, "role");

    if (!nama) return { ok: false, galat: "Nama lengkap belum diisi." };
    if (nama.length > PANJANG_NAMA) {
        return {
            ok: false,
            galat: `Nama terlalu panjang, maksimal ${PANJANG_NAMA} karakter.`,
        };
    }

    // Unit kerja wajib. jaga_alur_permintaan() menolak pemohon tanpa unit
    // kerja dengan "Akun Anda belum terhubung ke unit kerja" - berhari-hari
    // kemudian, di meja yang salah, kepada orang yang tidak bisa membetulkannya.
    if (!unitKerjaId) {
        return { ok: false, galat: "Unit kerja belum dipilih." };
    }

    // Formulir untuk baris sendiri memang tidak memuat pilihan peran; kalau
    // toh ada yang mengirimkannya, itu bukan dari halaman yang kita render.
    if (id === saya.id && peranDiminta && peranDiminta !== saya.role) {
        return { ok: false, galat: PESAN_DIRI.peran };
    }

    const role = id === saya.id ? saya.role : (peranDiminta as Role);
    if (!PERAN.includes(role)) {
        return { ok: false, galat: "Peran belum dipilih." };
    }

    const isian: Isian = {
        nama_lengkap: nama,
        role,
        unit_kerja_id: unitKerjaId,
    };

    const supabase = await createClient();
    // .select() bukan hiasan: UPDATE yang ditolak RLS tidak memunculkan galat,
    // barisnya sekadar tak terlihat dan nol baris tersentuh.
    const { data, error } = await supabase
        .from("profil")
        .update(isian)
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}

/**
 * Dipanggil langsung dari sakelar, bukan lewat formulir - karena itu tidak
 * memakai bentuk (sebelumnya, formData) seperti aksi yang lain.
 */
export async function setAktifAkun(
    id: string,
    aktif: boolean,
): Promise<HasilAksi> {
    const saya = await pastikanTataUsaha();

    if (id === saya.id) return { ok: false, galat: PESAN_DIRI.aktif };

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("profil")
        .update({ aktif })
        .eq("id", id)
        .select("id");

    if (error) return { ok: false, galat: pesanGalatDb(error, PESAN) };
    if (!data?.length) return { ok: false, galat: GALAT_HILANG };

    revalidatePath(JALUR);
    return { ok: true };
}

/**
 * Satu-satunya cara menghapus akun: baris profil ikut lenyap lewat
 * on delete cascade dari auth.users, jadi klien biasa tidak punya jalan
 * ke sana sama sekali.
 *
 * Riwayat diperiksa lebih dulu supaya penolakannya berbentuk kalimat yang
 * bisa ditindaklanjuti, bukan galat basis data yang menyeberang dari
 * ujung rantai cascade. Pemeriksaan itu bisa saja terlewat balapan dengan
 * permintaan yang baru masuk - karena itu foreign key tetap dipetakan
 * sebagai jaring terakhir di pesanGalatAuth.
 */
export async function hapusAkun(id: string): Promise<HasilAksi> {
    const saya = await pastikanTataUsaha();

    if (id === saya.id) return { ok: false, galat: PESAN_DIRI.hapus };

    const supabase = await createClient();
    const { data: riwayat, error: galatRiwayat } = await supabase
        .from("permintaan")
        .select("id")
        .or(
            `pemohon_id.eq.${id},disetujui_oleh.eq.${id},disiapkan_oleh.eq.${id},diserahkan_oleh.eq.${id}`,
        )
        .limit(1);

    if (galatRiwayat) {
        return { ok: false, galat: pesanGalatDb(galatRiwayat, PESAN) };
    }
    if (riwayat?.length) return { ok: false, galat: GALAT_RIWAYAT };

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);

    if (error) return { ok: false, galat: pesanGalatAuth(error) };

    revalidatePath(JALUR);
    return { ok: true };
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(dashboard)/pengguna/page.tsx`:

```tsx
import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import {
    PenggunaTabel,
    type BarisPengguna,
    type OpsiUnit,
} from "./pengguna-tabel";

export const metadata: Metadata = {
    title: "Kelola Pengguna — SIPB SMPN 14",
};

/**
 * Tanpa paginasi, dengan sengaja: kurang lebih empat puluh orang staf
 * muat dalam satu layar, dan pencarian yang mempersempitnya. Kalau kelak
 * daftarnya tumbuh melewati itu, penanganan PGRST103 di master-barang
 * adalah polanya.
 */
export default async function PenggunaPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string }>;
}) {
    const saya = await pastikanTataUsaha();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();

    const supabase = await createClient();

    let kueri = supabase
        .from("pengguna")
        .select(
            "id, nama_lengkap, role, aktif, unit_kerja_id, unit_kerja, email, sandi_sementara",
        );

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `nama_lengkap.ilike."%${kataKunci}%",email.ilike."%${kataKunci}%"`,
        );
    }

    const [daftar, unit] = await Promise.all([
        kueri.order("nama_lengkap"),
        // Seluruh unit kerja, bukan yang aktif saja. Dialog tambah hanya
        // menawarkan yang aktif, tetapi dialog ubah harus tetap bisa
        // menampilkan unit milik barisnya sendiri walau unit itu sudah
        // dinonaktifkan - kalau tidak, mengganti nama seseorang diam-diam
        // memindahkan unit kerjanya.
        supabase.from("unit_kerja").select("id, nama, aktif").order("nama"),
    ]);

    if (daftar.error || unit.error) {
        const galat = daftar.error ?? unit.error;
        console.error("[pengguna]", galat?.code, galat?.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar pengguna gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    return (
        <PenggunaTabel
            baris={(daftar.data ?? []) as BarisPengguna[]}
            unit={(unit.data ?? []) as OpsiUnit[]}
            cari={cari}
            idSaya={saya.id}
        />
    );
}
```

- [ ] **Step 4: Write the table**

Create `src/app/(dashboard)/pengguna/pengguna-tabel.tsx`:

```tsx
"use client";

import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { Pencarian } from "@/components/admin/pencarian";
import { FormAlert } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { LABEL_PERAN } from "@/config/nav-items";
import type { Role } from "@/lib/dal";
import { Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { hapusAkun, setAktifAkun, ubahAkun } from "./actions";

export type BarisPengguna = {
    id: string;
    nama_lengkap: string;
    role: Role;
    aktif: boolean;
    unit_kerja_id: string | null;
    unit_kerja: string | null;
    email: string;
    sandi_sementara: boolean;
};

export type OpsiUnit = { id: string; nama: string; aktif: boolean };

const PERAN: Role[] = ["pegawai", "pengurus_barang", "tata_usaha"];

export function PenggunaTabel({
    baris,
    unit,
    cari,
    idSaya,
}: {
    baris: BarisPengguna[];
    unit: OpsiUnit[];
    cari: string;
    /** Baris milik sendiri: tanpa sakelar, tanpa hapus, tanpa ganti peran. */
    idSaya: string;
}) {
    const [diubah, setDiubah] = React.useState<BarisPengguna | null>(null);
    const [dihapus, setDihapus] = React.useState<BarisPengguna | null>(null);

    // Sakelar aktif tidak punya dialog tempat menaruh pesan galatnya, jadi
    // pesannya naik ke sini - satu tempat di atas tabel, terbaca dari baris
    // mana pun kegagalannya datang.
    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();

    const ubahAktif = (akun: BarisPengguna, aktif: boolean) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await setAktifAkun(akun.id, aktif);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    // Unit yang aktif, ditambah unit milik baris yang sedang diubah walau
    // sudah dinonaktifkan - supaya menyimpan perubahan nama tidak diam-diam
    // memindahkan orangnya ke unit lain.
    const opsiUnit = (akun: BarisPengguna | null): OpsiUnit[] =>
        unit.filter((u) => u.aktif || u.id === akun?.unit_kerja_id);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
            <div className="flex items-center gap-2.5">
                <Pencarian
                    awal={cari}
                    jalur="/pengguna"
                    placeholder="Cari nama atau email"
                    ariaLabel="Cari pengguna"
                />
            </div>

            {galat && <FormAlert>{galat}</FormAlert>}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {cari
                        ? `Tidak ada akun yang cocok dengan “${cari}”.`
                        : "Belum ada akun."}
                </p>
            ) : (
                <>
                    {/* Ponsel: satu kartu per baris. Enam kolom tidak terbaca
                        di layar 375px. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {baris.map((akun) => (
                            <li
                                key={akun.id}
                                className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {akun.nama_lengkap}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {akun.email}
                                        </p>
                                    </div>
                                    <TombolBaris
                                        akun={akun}
                                        idSaya={idSaya}
                                        onUbah={setDiubah}
                                        onHapus={setDihapus}
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline">
                                        {LABEL_PERAN[akun.role]}
                                    </Badge>
                                    <Badge variant="outline">
                                        {akun.unit_kerja ?? "Tanpa unit kerja"}
                                    </Badge>
                                    <LencanaStatus akun={akun} />
                                    <span className="ml-auto">
                                        <SakelarAktif
                                            akun={akun}
                                            idSaya={idSaya}
                                            menunggu={menunggu}
                                            onUbah={ubahAktif}
                                        />
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="px-5 text-xs text-muted-foreground">
                                        Nama
                                    </TableHead>
                                    <TableHead className="w-40 text-xs text-muted-foreground">
                                        Peran
                                    </TableHead>
                                    <TableHead className="w-44 text-xs text-muted-foreground">
                                        Unit Kerja
                                    </TableHead>
                                    <TableHead className="w-40 text-xs text-muted-foreground">
                                        Status
                                    </TableHead>
                                    <TableHead className="w-20 text-xs text-muted-foreground">
                                        Aktif
                                    </TableHead>
                                    <TableHead className="w-24 px-5 text-right text-xs text-muted-foreground">
                                        Tindakan
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {baris.map((akun) => (
                                    <TableRow key={akun.id}>
                                        <TableCell className="max-w-0 px-5 py-3">
                                            <p className="truncate text-[13px] font-medium text-foreground">
                                                {akun.nama_lengkap}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {akun.email}
                                            </p>
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] text-muted-foreground">
                                            {LABEL_PERAN[akun.role]}
                                        </TableCell>
                                        <TableCell className="py-3 text-[13px] text-muted-foreground">
                                            {akun.unit_kerja ?? "—"}
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <LencanaStatus akun={akun} />
                                        </TableCell>
                                        <TableCell className="py-3">
                                            <SakelarAktif
                                                akun={akun}
                                                idSaya={idSaya}
                                                menunggu={menunggu}
                                                onUbah={ubahAktif}
                                            />
                                        </TableCell>
                                        <TableCell className="px-5 py-3 text-right">
                                            <TombolBaris
                                                akun={akun}
                                                idSaya={idSaya}
                                                onUbah={setDiubah}
                                                onHapus={setDihapus}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </>
            )}

            <DialogForm
                key={diubah?.id}
                terbuka={diubah !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDiubah(null)}
                judul="Ubah Akun"
                keterangan="Alamat email tidak bisa diubah. Kalau alamatnya salah ketik dan akunnya belum punya riwayat permintaan, hapus lalu buat ulang."
                aksi={ubahAkun.bind(null, diubah?.id ?? "")}
                labelSimpan="Simpan"
                labelMenyimpan="Menyimpan"
            >
                <BidangDialog
                    id="nama_lengkap"
                    label="Nama Lengkap"
                    defaultValue={diubah?.nama_lengkap}
                    required
                    autoFocus
                    maxLength={120}
                />

                {diubah && diubah.id !== idSaya && (
                    <BidangPilih
                        id="role"
                        label="Peran"
                        defaultValue={diubah.role}
                        opsi={PERAN.map((p) => ({
                            nilai: p,
                            label: LABEL_PERAN[p],
                        }))}
                    />
                )}

                <BidangPilih
                    id="unit_kerja_id"
                    label="Unit Kerja"
                    defaultValue={diubah?.unit_kerja_id ?? undefined}
                    petunjuk="Wajib diisi. Pegawai tanpa unit kerja tertahan saat mengajukan permintaan pertamanya."
                    opsi={opsiUnit(diubah).map((u) => ({
                        nilai: u.id,
                        label: u.aktif ? u.nama : `${u.nama} (nonaktif)`,
                    }))}
                />
            </DialogForm>

            <DialogForm
                key={`hapus-${dihapus?.id}`}
                terbuka={dihapus !== null}
                onTerbukaBerubah={(terbuka) => !terbuka && setDihapus(null)}
                judul={`Hapus ${dihapus?.nama_lengkap ?? ""}?`}
                keterangan="Akun yang sudah punya riwayat permintaan tidak bisa dihapus - nonaktifkan saja. Penghapusan tidak bisa dibatalkan."
                aksi={hapusAkun.bind(null, dihapus?.id ?? "")}
                labelSimpan="Hapus"
                labelMenyimpan="Menghapus"
                merusak
            />
        </div>
    );
}

function LencanaStatus({ akun }: { akun: BarisPengguna }) {
    return (
        <span className="flex flex-wrap items-center gap-1.5">
            <Badge
                variant={akun.aktif ? "secondary" : "outline"}
                className={akun.aktif ? "" : "text-muted-foreground"}
            >
                {akun.aktif ? "Aktif" : "Nonaktif"}
            </Badge>
            {akun.sandi_sementara && (
                <Badge variant="outline" className="text-muted-foreground">
                    Sandi sementara
                </Badge>
            )}
        </span>
    );
}

function SakelarAktif({
    akun,
    idSaya,
    menunggu,
    onUbah,
}: {
    akun: BarisPengguna;
    idSaya: string;
    menunggu: boolean;
    onUbah: (akun: BarisPengguna, aktif: boolean) => void;
}) {
    // Baris sendiri tidak punya sakelar sama sekali. Aksinya tetap memeriksa
    // ulang di server - halaman yang merender sebuah kontrol bukan bukti apa pun.
    if (akun.id === idSaya) {
        return <span className="text-xs text-muted-foreground">Anda</span>;
    }

    return (
        <Switch
            checked={akun.aktif}
            disabled={menunggu}
            onCheckedChange={(aktif) => onUbah(akun, aktif)}
            aria-label={`${akun.aktif ? "Nonaktifkan" : "Aktifkan"} ${akun.nama_lengkap}`}
        />
    );
}

function TombolBaris({
    akun,
    idSaya,
    onUbah,
    onHapus,
}: {
    akun: BarisPengguna;
    idSaya: string;
    onUbah: (akun: BarisPengguna) => void;
    onHapus: (akun: BarisPengguna) => void;
}) {
    return (
        <div className="flex shrink-0 items-center justify-end gap-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onUbah(akun)}
                aria-label={`Ubah ${akun.nama_lengkap}`}
            >
                <Pencil className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            {akun.id !== idSaya && (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onHapus(akun)}
                    aria-label={`Hapus ${akun.nama_lengkap}`}
                >
                    <Trash2
                        className="text-muted-foreground"
                        strokeWidth={1.6}
                    />
                </Button>
            )}
        </div>
    );
}

/**
 * Pasangan BidangDialog untuk pilihan tertutup.
 *
 * Radix Select menitipkan nilainya pada satu <select> tersembunyi begitu
 * ia berada di dalam <form> dan diberi `name`, jadi FormData tetap terisi
 * tanpa input bayangan buatan sendiri.
 */
export function BidangPilih({
    id,
    label,
    opsi,
    defaultValue,
    petunjuk,
}: {
    id: string;
    label: string;
    opsi: { nilai: string; label: string }[];
    defaultValue?: string;
    petunjuk?: string;
}) {
    const [nilai, setNilai] = React.useState(defaultValue ?? "");

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="text-[13px]">
                {label}
            </Label>
            <Select name={id} value={nilai} onValueChange={setNilai}>
                <SelectTrigger id={id}>
                    <SelectValue placeholder="Pilih salah satu" />
                </SelectTrigger>
                <SelectContent>
                    {opsi.map((o) => (
                        <SelectItem key={o.nilai} value={o.nilai}>
                            {o.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {petunjuk && (
                <p className="text-xs text-muted-foreground">{petunjuk}</p>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Run `npm run dev` and, signed in as Tata Usaha, open `http://localhost:3000/pengguna`:

1. Every account appears with its email, role, unit kerja, and status. The sidebar item "Kelola Pengguna" is already there and now leads somewhere.
2. Your own row shows "Anda" instead of a switch, and has no trash button.
3. Search by name and by email narrows the list; a term containing a comma and a `%` (e.g. `guru, 50%`) returns an empty list, not an error banner.
4. Edit another account: change the name, role, and unit kerja; the row updates. Open the edit dialog on your own row: there is no Peran select.
5. Toggle another account inactive and back; the badge follows. Any failure appears above the table.
6. Delete an account that has request history: refused with "Akun ini sudah punya riwayat permintaan, jadi tidak bisa dihapus. Nonaktifkan saja."
7. At 375px, the table becomes cards and nothing overflows horizontally.

Also confirm the guard from the other side: sign in as a pegawai and type `/pengguna`. Expected: you land on `/beranda`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/select.tsx "src/app/(dashboard)/pengguna"
git commit -m "feat: halaman kelola pengguna - daftar, ubah, aktif, hapus"
```

---

## Task 8: Creating an account and resetting a password

Both flows end at the same place: a generated password shown once on screen. That is why they share a dialog and why that dialog is not `DialogForm` — `dialog-form.tsx:99-101` closes on success, which is exactly right for edit and delete and exactly wrong here. Bending it to support both would mean adding a prop that says "actually, don't do the one thing you exist to do".

No invite email: the school's Supabase project has no custom SMTP, and the built-in sender is rate-limited to a couple of messages an hour and only delivers to project team addresses. `email_confirm: true` skips a verification mail that nothing would deliver.

**Files:**

- Create: `src/app/(dashboard)/pengguna/akun-dialog.tsx`
- Modify: `src/app/(dashboard)/pengguna/actions.ts` (append)
- Modify: `src/app/(dashboard)/pengguna/pengguna-tabel.tsx`

**Interfaces:**

- Consumes: `sandiSementara` (`@/lib/sandi`), `createAdminClient` (`@/lib/supabase/admin`), `pesanGalatAuth` (`@/lib/aksi`), and everything Task 7 produced.
- Produces, from `./actions`: `type HasilSandi = { ok: true; sandi: string } | { ok: false; galat: string }`, `buatAkun(sebelumnya, formData) => Promise<HasilSandi>`, `setelUlangSandi(id) => Promise<HasilSandi>`. From `./akun-dialog`: `AkunDialog`.

- [ ] **Step 1: Append the two privileged actions**

Add to the imports at the top of `src/app/(dashboard)/pengguna/actions.ts`:

```ts
import { sandiSementara } from "@/lib/sandi";
```

Then append to the end of the file:

```ts
export type HasilSandi =
    | { ok: true; sandi: string }
    | { ok: false; galat: string };

const BENTUK_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Membuat akun. Satu-satunya jalur di aplikasi ini yang menulis ke
 * auth.users, dan karena itu satu-satunya yang memegang klien
 * service-role sejak baris pertamanya.
 *
 * Urutannya penting: admin client hanya membuat baris auth.users, tidak
 * lebih. Peran dan unit kerja ditulis belakangan oleh klien biasa,
 * sehingga jaga_profil() dan policy ubah_profil tetap berlaku bahkan
 * pada pembuatan akun.
 *
 * handle_new_user() membaca nama_lengkap dari raw_user_meta_data dan
 * membuat baris profil dalam transaksi yang sama, jadi baris itu sudah
 * ada begitu createUser() kembali.
 */
export async function buatAkun(
    _sebelumnya: HasilSandi | null,
    formData: FormData,
): Promise<HasilSandi> {
    await pastikanTataUsaha();

    const nama = teks(formData, "nama_lengkap");
    const email = teks(formData, "email").toLowerCase();
    const role = teks(formData, "role") as Role;
    const unitKerjaId = teks(formData, "unit_kerja_id");

    if (!nama) return { ok: false, galat: "Nama lengkap belum diisi." };
    if (nama.length > PANJANG_NAMA) {
        return {
            ok: false,
            galat: `Nama terlalu panjang, maksimal ${PANJANG_NAMA} karakter.`,
        };
    }
    if (!BENTUK_EMAIL.test(email)) {
        return { ok: false, galat: "Alamat email belum benar bentuknya." };
    }
    if (!PERAN.includes(role)) {
        return { ok: false, galat: "Peran belum dipilih." };
    }
    if (!unitKerjaId) {
        return { ok: false, galat: "Unit kerja belum dipilih." };
    }

    const sandi = sandiSementara();

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password: sandi,
        // Melewati surel verifikasi, yang memang tidak akan terkirim ke
        // mana-mana: proyek ini tanpa SMTP sendiri.
        email_confirm: true,
        user_metadata: { nama_lengkap: nama },
        // app_metadata, bukan user_metadata: hanya service role yang boleh
        // menulisnya, jadi pemiliknya tidak bisa membersihkan penandanya
        // sendiri lalu melewati /ganti-sandi.
        app_metadata: { sandi_sementara: true },
    });

    if (error) return { ok: false, galat: pesanGalatAuth(error) };

    const supabase = await createClient();
    const { data: baris, error: galatProfil } = await supabase
        .from("profil")
        .update({ role, unit_kerja_id: unitKerjaId })
        .eq("id", data.user.id)
        .select("id");

    if (galatProfil || !baris?.length) {
        // Akunnya sudah terlanjur ada. Menyebutnya "gagal" begitu saja akan
        // menuntun tata usaha membuatnya sekali lagi dan bertemu
        // "email sudah dipakai" - jadi katakan persis apa yang tersisa.
        console.error(
            "[pengguna] profil baru gagal dilengkapi",
            galatProfil?.code,
            galatProfil?.message,
        );
        revalidatePath(JALUR);
        return {
            ok: false,
            galat: "Akun sudah dibuat, tetapi peran dan unit kerjanya belum tersimpan. Lengkapi lewat tombol Ubah pada barisnya, lalu setel ulang sandinya.",
        };
    }

    revalidatePath(JALUR);
    return { ok: true, sandi };
}

/**
 * Menerbitkan sandi sementara baru - alur yang sama persis dengan
 * pembuatan akun, dengan updateUserById() menggantikan createUser().
 * Inilah obat untuk panel sandi yang sudah terlanjur ditutup.
 */
export async function setelUlangSandi(id: string): Promise<HasilSandi> {
    const saya = await pastikanTataUsaha();

    // Menyetel ulang sandi sendiri berarti memasang penanda pada akun
    // sendiri, lalu tertahan di /ganti-sandi dengan sandi yang hanya sempat
    // terlihat sekejap. Untuk keperluan itu ada halamannya sendiri.
    if (id === saya.id) {
        return {
            ok: false,
            galat: "Untuk mengganti kata sandi sendiri, buka halaman Ganti Kata Sandi.",
        };
    }

    const sandi = sandiSementara();

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, {
        password: sandi,
        app_metadata: { sandi_sementara: true },
    });

    if (error) return { ok: false, galat: pesanGalatAuth(error) };

    revalidatePath(JALUR);
    return { ok: true, sandi };
}
```

- [ ] **Step 2: Write the show-once dialog**

Create `src/app/(dashboard)/pengguna/akun-dialog.tsx`:

```tsx
"use client";

import { FormAlert, SubmitButton } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Check, Copy } from "lucide-react";
import * as React from "react";
import type { HasilSandi } from "./actions";

export type AksiSandi = (
    sebelumnya: HasilSandi | null,
    formData: FormData,
) => Promise<HasilSandi>;

/**
 * Dialog yang tidak menutup diri saat berhasil.
 *
 * DialogForm menutup begitu servernya menjawab ok - persis yang diinginkan
 * ubah dan hapus, dan persis yang tidak boleh terjadi di sini: sandi yang
 * baru terbit hanya muncul sekali, dan menutup dialognya berarti
 * kehilangannya. Menambahkan prop "jangan tutup" ke DialogForm berarti
 * meminta komponen itu membatalkan satu-satunya hal yang jadi alasannya ada.
 *
 * useActionState hidup di komponen anak di bawah portal Radix, seperti pada
 * DialogForm dan karena alasan yang sama: hook itu menyimpan hasil terakhir
 * dan tidak bisa direset, jadi pembukaan berikutnya harus benar-benar
 * memasang ulang komponennya.
 */
export function AkunDialog({
    terbuka,
    onTerbukaBerubah,
    judul,
    keterangan,
    aksi,
    labelSimpan,
    labelMenyimpan,
    catatanSandi,
    children,
}: {
    terbuka: boolean;
    onTerbukaBerubah: (terbuka: boolean) => void;
    judul: string;
    keterangan: string;
    aksi: AksiSandi;
    labelSimpan: string;
    labelMenyimpan: string;
    /** Kalimat di bawah sandi, berbeda untuk akun baru dan setel ulang. */
    catatanSandi: string;
    children?: React.ReactNode;
}) {
    return (
        <Dialog open={terbuka} onOpenChange={onTerbukaBerubah}>
            <DialogContent>
                <IsiAkunDialog
                    judul={judul}
                    keterangan={keterangan}
                    aksi={aksi}
                    labelSimpan={labelSimpan}
                    labelMenyimpan={labelMenyimpan}
                    catatanSandi={catatanSandi}
                >
                    {children}
                </IsiAkunDialog>
            </DialogContent>
        </Dialog>
    );
}

function IsiAkunDialog({
    judul,
    keterangan,
    aksi,
    labelSimpan,
    labelMenyimpan,
    catatanSandi,
    children,
}: {
    judul: string;
    keterangan: string;
    aksi: AksiSandi;
    labelSimpan: string;
    labelMenyimpan: string;
    catatanSandi: string;
    children?: React.ReactNode;
}) {
    const [hasil, kirim, pending] = React.useActionState<
        HasilSandi | null,
        FormData
    >(aksi, null);

    if (hasil?.ok) {
        return (
            <>
                <DialogHeader>
                    <DialogTitle>Kata sandi sementara</DialogTitle>
                    <DialogDescription>{catatanSandi}</DialogDescription>
                </DialogHeader>
                <PanelSandi sandi={hasil.sandi} />
            </>
        );
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle>{judul}</DialogTitle>
                <DialogDescription>{keterangan}</DialogDescription>
            </DialogHeader>

            <form action={kirim} className="flex flex-col gap-4">
                {hasil && !hasil.ok && <FormAlert>{hasil.galat}</FormAlert>}

                {children}

                <DialogFooter className="mt-1">
                    <DialogClose asChild>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-9.5"
                        >
                            Batal
                        </Button>
                    </DialogClose>
                    <SubmitButton
                        pending={pending}
                        pendingLabel={labelMenyimpan}
                        className="mt-0 h-9.5 w-full sm:w-auto"
                    >
                        {labelSimpan}
                    </SubmitButton>
                </DialogFooter>
            </form>
        </>
    );
}

function PanelSandi({ sandi }: { sandi: string }) {
    const [tersalin, setTersalin] = React.useState(false);

    const salin = async () => {
        try {
            await navigator.clipboard.writeText(sandi);
            setTersalin(true);
            setTimeout(() => setTersalin(false), 2000);
        } catch {
            // Papan klip ditolak peramban - sandinya toh sudah terbaca di
            // layar dan bisa disalin dengan tangan. Tidak ada yang hilang.
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <code className="flex-1 font-mono text-base tracking-wide break-all text-foreground select-all">
                    {sandi}
                </code>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={salin}
                    aria-label="Salin kata sandi"
                >
                    {tersalin ? (
                        <Check className="text-primary" strokeWidth={1.8} />
                    ) : (
                        <Copy
                            className="text-muted-foreground"
                            strokeWidth={1.6}
                        />
                    )}
                </Button>
            </div>

            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Catat atau salin sekarang. Setelah kotak ini ditutup, kata
                sandinya tidak bisa ditampilkan lagi — yang bisa dilakukan
                hanyalah menerbitkan yang baru lewat tombol “Setel ulang sandi”.
            </p>

            <DialogFooter className="mt-1">
                <DialogClose asChild>
                    <Button type="button" className="h-9.5 w-full sm:w-auto">
                        Sudah dicatat
                    </Button>
                </DialogClose>
            </DialogFooter>
        </div>
    );
}
```

- [ ] **Step 3: Wire the button and the two dialogs into the table**

In `src/app/(dashboard)/pengguna/pengguna-tabel.tsx`:

Add to the imports:

```tsx
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import {
    buatAkun,
    hapusAkun,
    setAktifAkun,
    setelUlangSandi,
    ubahAkun,
} from "./actions";
import { AkunDialog } from "./akun-dialog";
```

(replace the two existing `lucide-react` and `./actions` import lines).

Add two pieces of state next to the existing ones:

```tsx
const [tambah, setTambah] = React.useState(false);
const [disetel, setDisetel] = React.useState<BarisPengguna | null>(null);
```

Put the create button beside the search box — replace the `<div className="flex items-center gap-2.5">` block with:

```tsx
<div className="flex items-center gap-2.5">
    <Pencarian
        awal={cari}
        jalur="/pengguna"
        placeholder="Cari nama atau email"
        ariaLabel="Cari pengguna"
    />
    <Button onClick={() => setTambah(true)} className="h-9.5 shrink-0">
        <Plus />
        <span className="hidden sm:inline">Tambah Akun</span>
        <span className="sr-only sm:hidden">Tambah akun</span>
    </Button>
</div>
```

Give `TombolBaris` a third callback. Change its props and body to:

```tsx
function TombolBaris({
    akun,
    idSaya,
    onUbah,
    onSetel,
    onHapus,
}: {
    akun: BarisPengguna;
    idSaya: string;
    onUbah: (akun: BarisPengguna) => void;
    onSetel: (akun: BarisPengguna) => void;
    onHapus: (akun: BarisPengguna) => void;
}) {
    return (
        <div className="flex shrink-0 items-center justify-end gap-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onUbah(akun)}
                aria-label={`Ubah ${akun.nama_lengkap}`}
            >
                <Pencil className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            {akun.id !== idSaya && (
                <>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onSetel(akun)}
                        aria-label={`Setel ulang sandi ${akun.nama_lengkap}`}
                    >
                        <KeyRound
                            className="text-muted-foreground"
                            strokeWidth={1.6}
                        />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onHapus(akun)}
                        aria-label={`Hapus ${akun.nama_lengkap}`}
                    >
                        <Trash2
                            className="text-muted-foreground"
                            strokeWidth={1.6}
                        />
                    </Button>
                </>
            )}
        </div>
    );
}
```

and pass `onSetel={setDisetel}` at both `<TombolBaris ... />` call sites (the mobile list and the table row).

Finally add the two new dialogs after the existing `DialogForm` for delete:

```tsx
<AkunDialog
    key={tambah ? "tambah" : "tambah-tertutup"}
    terbuka={tambah}
    onTerbukaBerubah={setTambah}
    judul="Tambah Akun"
    keterangan="Akun langsung aktif dengan kata sandi sementara yang ditampilkan satu kali. Alamat email tidak bisa diubah setelah akun terbentuk."
    aksi={buatAkun}
    labelSimpan="Buat Akun"
    labelMenyimpan="Membuat"
    catatanSandi="Serahkan kata sandi ini kepada pemiliknya. Ia akan diminta menggantinya sendiri saat pertama kali masuk."
>
    <BidangDialog
        id="nama_lengkap"
        label="Nama Lengkap"
        placeholder="Sari Widyaningrum, S.Pd."
        required
        autoFocus
        maxLength={120}
    />
    <BidangDialog
        id="email"
        label="Alamat Email"
        type="email"
        placeholder="nama@smpn14.sch.id"
        required
        petunjuk="Dipakai untuk masuk, dan tidak bisa diubah lagi setelah ini."
    />
    <BidangPilih
        id="role"
        label="Peran"
        defaultValue="pegawai"
        opsi={PERAN.map((p) => ({ nilai: p, label: LABEL_PERAN[p] }))}
    />
    <BidangPilih
        id="unit_kerja_id"
        label="Unit Kerja"
        petunjuk="Wajib diisi. Pegawai tanpa unit kerja tertahan saat mengajukan permintaan pertamanya."
        opsi={unit
            .filter((u) => u.aktif)
            .map((u) => ({ nilai: u.id, label: u.nama }))}
    />
</AkunDialog>

<AkunDialog
    key={`setel-${disetel?.id}`}
    terbuka={disetel !== null}
    onTerbukaBerubah={(terbuka) => !terbuka && setDisetel(null)}
    judul={`Setel ulang sandi ${disetel?.nama_lengkap ?? ""}?`}
    keterangan="Kata sandi lamanya langsung tidak berlaku, dan pemiliknya diminta membuat kata sandi baru saat masuk berikutnya."
    aksi={setelUlangSandi.bind(null, disetel?.id ?? "")}
    labelSimpan="Setel Ulang"
    labelMenyimpan="Menyetel"
    catatanSandi="Serahkan kata sandi ini kepada pemiliknya. Kata sandi lamanya sudah tidak berlaku."
/>
```

Note on `setelUlangSandi.bind(null, id)`: the bound function takes no further arguments, and `useActionState` calls it with two. That is harmless in JavaScript and is the same shape `hapusUnit`/`hapusBarang` already use.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then confirm the privileged surface is still exactly four call sites:

Run: `grep -rln "createAdminClient" src/`
Expected: exactly three files — `src/lib/supabase/admin.ts` (the definition), `src/app/(auth)/ganti-sandi/actions.ts`, and `src/app/(dashboard)/pengguna/actions.ts`. Then `grep -rn "createAdminClient()" src/` must show four call sites: one in `gantiSandi`, and one each in `buatAkun`, `setelUlangSandi`, `hapusAkun`. Any other file appearing here means the privileged surface grew.

Run `npm run dev`, signed in as Tata Usaha on `/pengguna`:

1. "Tambah Akun" opens the dialog. Submitting with an email that already exists shows "Email itu sudah dipakai akun lain." and the form stays filled.
2. Creating a fresh account swaps the dialog for the password panel. Copy the password. Close it; the new row appears with role, unit kerja, and a "Sandi sementara" badge.
3. Reopening "Tambah Akun" shows an empty form, not the previous password.
4. "Setel ulang sandi" on another row shows a confirm dialog, then a new password. That row keeps its "Sandi sementara" badge.
5. The key button and trash button are absent on your own row.
6. At 375px, both dialogs fit and the password wraps rather than overflowing.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/pengguna"
git commit -m "feat: buat akun dan setel ulang sandi dengan panel sekali tampil"
```

---

## Task 9: End-to-end verification

Nothing is written in this task; it is the gate that says the sub-project is done. If any check fails, fix it here and note what changed.

**Files:** none created or modified unless a check fails.

- [ ] **Step 1: Run every automated check**

```bash
npm run db:test
npm run test:sandi
npm run lint
npx tsc --noEmit
npm run build
```

Expected: `db:test` ends `N lolos, 0 gagal`; `test:sandi` ends `6 lolos, 0 gagal`; ESLint and `tsc` print no errors; `next build` completes.

- [ ] **Step 2: Carry a temporary password all the way through**

As Tata Usaha, create an account for an address you can sign in with. Copy the password. Sign out, sign in as the new account.

Expected: you land on `/ganti-sandi`, heading "Ganti kata sandi dulu", first field labelled "Kata Sandi Sementara".

- [ ] **Step 3: Confirm `/ganti-sandi` cannot be walked past**

While still holding the temporary password, type `/beranda`, `/katalog`, and `/permintaan-saya` into the address bar.

Expected: every one lands back on `/ganti-sandi`. The redirect comes from `getUserOrRedirect()` **before** the role check, so it holds regardless of the account's role.

Then complete the change: old = the temporary password, new = something you choose. Expected: success panel, then `/beranda`. Navigate around freely; `/ganti-sandi` no longer catches you, and the account's row on `/pengguna` has lost its "Sandi sementara" badge.

- [ ] **Step 4: Reset someone's password**

As Tata Usaha, use "Setel ulang sandi" on the account from Step 2. Sign in as it with the new temporary password.

Expected: the old password is rejected; the new one works and lands on `/ganti-sandi` again.

- [ ] **Step 5: Deletion, both outcomes**

As Tata Usaha:

- Delete an account that has filed a permintaan. Expected: "Akun ini sudah punya riwayat permintaan, jadi tidak bisa dihapus. Nonaktifkan saja." The dialog stays open.
- Delete a freshly created account with no history. Expected: it succeeds and the row disappears.

- [ ] **Step 6: Search, including the awkward terms**

On `/pengguna`, search by a partial name, by a partial email, then by a term containing a comma and a `%` (e.g. `sari, 50%`).

Expected: all three return a result list — the last one most likely empty — and never the "Daftar pengguna gagal dimuat" banner. That banner here would mean `siapkanKataKunci` is not being applied.

- [ ] **Step 7: The deactivation round trip, across two browsers**

Sign in as a pegawai in browser A. Confirm typing `/pengguna` lands on `/beranda`.

In browser B, as Tata Usaha, deactivate that account. Back in browser A, navigate anywhere.

Expected: exactly one hop to `/login?alasan=nonaktif`, showing "Akun Anda dinonaktifkan. Hubungi tata usaha." Not a redirect loop, and not a bare `/login`. Signing in again from that screen fails, since the account is inactive.

Reactivate from browser B and confirm browser A can sign in and use the app again.

- [ ] **Step 8: The RLS teeth, from the application side**

With a pegawai account deactivated, confirm from the Supabase SQL editor (or `npm run db:sandbox`) that the account cannot insert a `permintaan`, cannot update its own draft, and cannot add a `permintaan_item`. This duplicates Task 1's automated coverage on purpose: the migration must be applied to the real project, not only to PGlite.

If the migration has not been applied yet, apply it now and re-run the check.

- [ ] **Step 9: 375px pass**

At 375px width, walk `/pengguna`: the card list, the create dialog, the edit dialog, the delete dialog, and the password panel. Then `/ganti-sandi`.

Expected: no horizontal scrolling anywhere, every control reachable, the generated password readable without zooming.

- [ ] **Step 10: Commit any fixes and finish**

```bash
git add -A
git commit -m "fix: perbaikan dari verifikasi menyeluruh kelola pengguna"
```

If nothing needed fixing, there is nothing to commit — say so rather than making an empty commit.

---

## What this sub-project does NOT include

Carried from the spec, so no one adds it mid-plan:

- Changing an account's email address. Delete-and-recreate covers the typo case until history exists.
- Pagination on `/pengguna`. Roughly forty staff is one screen, and search narrows it; the `PGRST103` handling in `master-barang/page.tsx` is the pattern to copy if the roster ever outgrows it.
- Bulk import of the staff roster, and Excel/CSV import of the real inventory — the codes in `seed.sql` are still placeholders.
- Any pegawai- or pengurus-facing page. After this, every Tata Usaha nav item except `/persetujuan` exists.
- A `type=invite` branch in `/auth/konfirmasi`. It stays a recovery-only landing point.
- Updating `seed.sql`'s hand-editing instructions. They still describe how the _first_ Tata Usaha is minted, which this page cannot do for itself.
