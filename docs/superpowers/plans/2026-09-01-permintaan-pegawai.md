# Permintaan Pegawai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two pegawai pages — `/katalog` and `/permintaan-saya` (with its detail route) — plus the pegawai half of `/beranda`, so a request can be composed in a database-backed cart and submitted.

**Architecture:** The cart is a `permintaan` row with `status = 'draft'`; adding a barang writes a `permintaan_item` into it, and emptying it deletes the row. Pages follow sub-project 2–3's shape — server component reads through RLS, server actions that check the rows `.select()` returns rather than only the error, `useActionState` inside `DialogForm` for forms and `useTransition` with a hoisted `FormAlert` for bare buttons. One migration closes the last hole in the state machine: a permintaan with zero items can no longer become `diajukan`.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), React 19.2.4, `@supabase/ssr` 0.10.2 + `@supabase/supabase-js` 2.105.3, Postgres/Supabase with RLS, Tailwind 4 + shadcn (`radix-ui` 1.6.7), PGlite 0.5 for database tests.

**Spec:** `docs/superpowers/specs/2026-09-01-permintaan-pegawai-design.md` — read it before starting. This plan argues from it; where the two disagree, the spec wins unless a deviation is listed below.

## Global Constraints

- **Bahasa Indonesia throughout, identifiers included.** File names, function names, variable names, comments, and every string that reaches a screen. Existing code is the reference for tone. Comments use `-`, not em-dashes.
- **Read the bundled docs before writing framework code.** `AGENTS.md` says this Next.js differs from training data. The relevant files are `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`.
- **Indentation:** 4 spaces in `src/**` (except `src/components/ui/**`, which is shadcn output at 2 spaces) and 2 spaces in `supabase/**/*.sql`. Match the file you are editing.
- **Migration filename:** `supabase/migrations/20260901010000_permintaan-kosong.sql`, exactly.
- **No new dependency, and no new UI test harness.** There is no zod, no react-hook-form, no toast library, and no `Textarea`, `AlertDialog`, or date-picker in `src/components/ui/`. Validate by hand in `actions.ts`; surface errors with `FormAlert`; hand-roll containers as `rounded-xl border border-border bg-card` divs, the way `beranda/page.tsx:72` and `barang-tabel.tsx:74` already do.
- **Every server action re-checks its caller** with `await pastikanPegawai()` on its first line. The page that rendered the control is not a credential.
- **Every mutation is `.select()`-ed and its rows checked.** UPDATE and DELETE refused by RLS raise nothing at all — the rows simply vanish (`aksi.ts:61-64`). An action that checks only `error` reports a refusal as a success.
- **Raw error text goes to `console.error`, never to the screen**, except the `P0001` sentences the triggers wrote for a school administrator. See **Task 2**.
- **Verification commands** (all must pass before a task is done): `npm run db:test`, `npm run lint`, `npx tsc --noEmit`.

## Deviations from the spec

These are deliberate; each is small and reasoned. Do not silently add others.

1. **`src/lib/permintaan.ts` does not start with `import "server-only"`, and `ambilDraft()` takes the Supabase client as an argument.** The spec puts `LABEL_STATUS` and `ambilDraft()` in the same file, and `LABEL_STATUS` is read by a client component (`detail-permintaan.tsx`). A `server-only` import there would break the build; creating the client inside `ambilDraft()` would drag `next/headers` into the browser bundle. Passing the client in keeps one file and one status vocabulary, which is the whole point of the file.
2. **`GALAT_UMUM`'s sentence is written a second time in `permintaan.ts`.** `aksi.ts` holds it as a module-private const and begins with `import "server-only"`, so it cannot be imported from a browser-importable module. The drift the codebase guards against is semantic — which Indonesian word means `siap_diambil` — not a fallback sentence, and a comment in each file names the other.
3. **The `23505` fallback in `tambahKeKeranjang` is a silent success, not an update.** The spec says it "falls back to an update rather than an error." An update would have to pick a number, and the only number "Tambah" knows is 1 — which would overwrite whatever a second tab had already set. Returning `ok` without writing produces the outcome the spec wants (no error, the barang is in the cart) and `revalidatePath` then renders the stepper with the real quantity.
4. **`setelJumlah` takes `permintaanId` explicitly, and both it and the `Penyetel` stepper are shared across route groups.** The detail page imports them from `@/app/(dashboard)/katalog/actions` and `.../katalog-daftar`. Re-resolving the draft inside the action would let a detail page for draft X edit draft Y after a two-tab race, and a second copy of either would let the two steppers drift apart on what pressing minus at one means. This is the same direction as `LencanaStatus`, which the detail page imports from `../daftar-permintaan`.
5. **`setelJumlah(permintaanId, barangId, 0)` removes the item.** The spec describes a stepper bound to `setelJumlah` and, separately, "removing the last item deletes the draft". Making zero mean "remove" keeps the catalog stepper to one action and puts the empty-cart rule in one helper, `hapusDraftBilaKosong()`, that both pages reach.
6. **`disetujui → dibatalkan` is asserted as zero rows, not as a raised error.** The spec's test list says it raises. It does not: `ubah_permintaan` (`rls.sql:111`, amended at `pengguna.sql:44`) narrows a pemohon's UPDATE to `status in ('draft','diajukan')`, so an approved request is invisible to the update and Postgres reports zero rows with no exception. Asserting it as such is exactly what justifies `batalkanPermintaan` checking `.select()`'s rows.
7. **A fourth test account is added inside the new `alur.mjs` section.** "A pegawai cannot read another pegawai's request" needs a second pegawai, and the harness has three accounts. It is created at the end so the `— pengguna —` section's assertion of exactly three accounts still holds.
8. **`catatan_pemohon` and `keperluan` are single-line `Input`s.** There is no `Textarea` in `src/components/ui/`, and adding one for two optional short fields is more machinery than they earn. `maxLength` caps them on the client; the server caps them again.

---

## Task 1: Migration — an empty permintaan cannot be submitted

Today `nomor_ada_setelah_draft` (`skema.sql:114`) and the state machine both pass an item-less request straight through to `diajukan`. The server action in Task 5 will refuse it, but `fungsi.sql:170-173` already states this codebase's position — _"'Disabled' yang hanya hidup di React bukan aturan"_ — and a rule that lives only in a server action is the same rule in a different building.

Two paths need closing. On UPDATE, the transition into `diajukan` is guarded by a count. On INSERT it collapses into something simpler: `permintaan_item` rows cannot exist before their parent, so a request born `diajukan` (permitted today at `fungsi.sql:268-276`) is _necessarily_ empty, and the insert is rejected outright with the same sentence. That also makes the INSERT-path nomor minting unreachable, so it goes.

Nothing is lost: neither `seed.sql` nor any fixture in `alur.mjs` nor `sandbox.mjs:105-108` inserts a submitted request directly — all of them insert a draft, add items, then update the status.

**Files:**

- Create: `supabase/migrations/20260901010000_permintaan-kosong.sql`
- Modify: `supabase/tests/alur.mjs:12-14` and `:99-101` (two new constants), and the end of the file (new section, before the summary lines at `:1067-1069`)

**Interfaces:**

- Consumes: nothing.
- Produces: `public.jaga_alur_permintaan()` refuses `status = 'diajukan'` on INSERT unconditionally, and on UPDATE when the permintaan has no `permintaan_item` rows. Both raise `errcode = 'P0001'` with the message `Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.`

- [x] **Step 1: Add the two barang constants the new section needs**

`alur.mjs` looks barang up by name, never by kode (`alur.mjs:9-11`). The new section needs a barang that has never had stock — `pel` gets stock later in the same section — so add `PULPEN` beside the existing three.

In `supabase/tests/alur.mjs`, replace lines 12–14:

```js
const SPIDOL = "Spidol whiteboard hitam";
const HVS = "Kertas HVS A4 70 gram";
const PEL = "Kain pel";
```

with:

```js
const SPIDOL = "Spidol whiteboard hitam";
const HVS = "Kertas HVS A4 70 gram";
const PEL = "Kain pel";
const PULPEN = "Pulpen tinta hitam";
```

and replace lines 99–101:

```js
const spidol = await cariBarang(SPIDOL);
const hvs = await cariBarang(HVS);
const pel = await cariBarang(PEL);
```

with:

```js
const spidol = await cariBarang(SPIDOL);
const hvs = await cariBarang(HVS);
const pel = await cariBarang(PEL);
const pulpen = await cariBarang(PULPEN);
```

- [x] **Step 2: Write the failing assertions**

Append this whole block to `supabase/tests/alur.mjs`, **between** the last `await as(PGW, …)` of the `— pengguna —` section and the final three lines (`console.log(\`\n${pass} lolos, ${fail} gagal\`)`, `await db.close()`, `process.exit(…)`).

It goes last for the same reason master data and pengguna do: it adds permintaan rows, gives a barang stock, and creates a fourth account, while assertions further up count rows and accounts exactly (`alur.mjs:632-637`, `:871-875`, `:1024-1039`).

```js
// Paling akhir, seperti dua bagian sebelumnya: di sini stok kain pel
// bertambah, akun keempat lahir, dan permintaan baru terbit - semuanya
// hal yang dihitung persis oleh pemeriksaan di atas.
console.log("\n— permintaan pegawai —");

// Pegawai kedua. Dibuat di sini, bukan di setup, karena bagian pengguna
// menghitung tepat tiga akun.
const PGW2 = "44444444-4444-4444-4444-444444444444";
await db.exec(`
insert into auth.users (id, email) values ('${PGW2}', 'guru.mtk@smpn14.sch.id');
update public.profil set
  unit_kerja_id = (select id from public.unit_kerja where nama = 'Guru')
  where id = '${PGW2}';`);

// Kain pel diberi stok supaya bagian ini punya barang tersedia kedua:
// satu untuk keranjang, satu lagi untuk membuktikan bahwa keranjang yang
// sudah diajukan tidak bisa ditambah. Tanpa itu, penolakan RLS akan
// tertutup lebih dulu oleh penolakan "barang kosong" dari trigger.
await as(PGR, async () => {
    await db.exec(`
    insert into public.penerimaan (no_dokumen) values ('INV-9002');
    insert into public.penerimaan_item (penerimaan_id, barang_id, jumlah)
    select p.id, '${pel}', 20 from public.penerimaan p where p.no_dokumen = 'INV-9002';`);
    await db.query(
        `select public.catat_penerimaan((select id from public.penerimaan where no_dokumen = 'INV-9002'))`,
    );
});

let keranjang;
await as(PGW, async () => {
    // keperluan dibiarkan kosong: begitulah halaman katalog membuka draft,
    // dan kolomnya not null tanpa pemeriksaan isi. Keperluannya baru
    // ditanyakan di dialog pengajuan.
    await db.exec(`insert into public.permintaan (keperluan) values ('');`);
    keranjang = (
        await db.query(
            `select id, pemohon_id, unit_kerja_id, status, nomor from public.permintaan
             where keperluan = '' order by created_at desc limit 1`,
        )
    ).rows[0];
    ok(
        "keranjang lahir sebagai draft milik pemohonnya, tanpa nomor",
        keranjang.status === "draft" &&
            keranjang.pemohon_id === PGW &&
            keranjang.nomor === null,
        JSON.stringify(keranjang),
    );
    ok(
        "unit kerja ikut tersalin dari profil",
        keranjang.unit_kerja_id !== null,
        String(keranjang.unit_kerja_id),
    );

    await expectError(
        "barang berstok nol ditolak saat dimasukkan keranjang",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${keranjang.id}', '${pulpen}', 1)`,
            ),
        "kosong",
    );

    await expectError(
        "keranjang kosong tidak bisa diajukan",
        () =>
            db.query(
                `update public.permintaan set status = 'diajukan',
                 keperluan = 'Coba ajukan tanpa barang' where id = '${keranjang.id}'`,
            ),
        "permintaan kosong",
    );

    await expectError(
        "permintaan tidak bisa lahir langsung berstatus diajukan",
        () =>
            db.query(
                `insert into public.permintaan (keperluan, status)
                 values ('Lompat draft', 'diajukan')`,
            ),
        "permintaan kosong",
    );

    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ('${keranjang.id}', '${spidol}', 3)`,
    );
    const it = (
        await db.query(
            `select nama_barang_snapshot, satuan_snapshot, jumlah_diminta
             from public.permintaan_item where permintaan_id = '${keranjang.id}'`,
        )
    ).rows[0];
    ok(
        "snapshot nama dan satuan dibekukan saat barang masuk keranjang",
        it.nama_barang_snapshot === SPIDOL && it.satuan_snapshot === "pcs",
        JSON.stringify(it),
    );

    await expectError(
        "barang yang sama tidak bisa masuk keranjang dua kali",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${keranjang.id}', '${spidol}', 1)`,
            ),
        "duplicate key",
    );

    await db.query(
        `update public.permintaan set status = 'diajukan',
         keperluan = 'Spidol untuk ulangan harian' where id = '${keranjang.id}'`,
    );
    const p = (
        await db.query(
            `select nomor, status, diajukan_at from public.permintaan where id = '${keranjang.id}'`,
        )
    ).rows[0];
    ok(
        "keranjang berisi boleh diajukan dan mendapat nomor SPB",
        p.status === "diajukan" &&
            /^SPB-\d{6}$/.test(p.nomor) &&
            p.diajukan_at !== null,
        JSON.stringify(p),
    );

    const log = (
        await db.query(
            `select status_ke from public.permintaan_log where permintaan_id = $1 order by created_at`,
            [keranjang.id],
        )
    ).rows;
    ok(
        "log mencatat draft lalu diajukan",
        log.length === 2 && log[1].status_ke === "diajukan",
        JSON.stringify(log.map((l) => l.status_ke)),
    );

    await expectError(
        "barang tidak bisa ditambahkan lagi setelah permintaan diajukan",
        () =>
            db.query(
                `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
                 values ('${keranjang.id}', '${pel}', 1)`,
            ),
        "row-level security",
    );

    // DELETE yang ditolak RLS tidak memunculkan galat sama sekali. Itu
    // sebabnya server action memeriksa baris yang kembali dari .select(),
    // bukan hanya kolom error.
    const d = await db.query(
        `delete from public.permintaan where id = '${keranjang.id}'`,
    );
    ok(
        "permintaan yang sudah diajukan tidak bisa dihapus pemohonnya: nol baris, tanpa galat",
        d.affectedRows === 0,
        `(${d.affectedRows} baris)`,
    );

    await db.query(
        `update public.permintaan set status = 'dibatalkan' where id = '${keranjang.id}'`,
    );
    const b = (
        await db.query(
            `select status from public.permintaan where id = '${keranjang.id}'`,
        )
    ).rows[0];
    ok(
        "pemohon boleh membatalkan permintaan yang masih diajukan",
        b.status === "dibatalkan",
        b.status,
    );

    // Keranjang kosong memang boleh dihapus - itulah yang dipakai halaman
    // detail saat barang terakhir dikeluarkan.
    await db.query(`insert into public.permintaan (keperluan) values ('');`);
    const kosong = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    const h = await db.query(
        `delete from public.permintaan where id = '${kosong}'`,
    );
    ok(
        "draft kosong boleh dihapus pemohonnya",
        h.affectedRows === 1,
        `(${h.affectedRows} baris)`,
    );
});

let permE;
await as(PGW, async () => {
    await db.query(`insert into public.permintaan (keperluan) values ('');`);
    permE = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ('${permE}', '${pel}', 2)`,
    );
    await db.query(
        `update public.permintaan set status = 'diajukan',
         keperluan = 'Kain pel untuk piket kelas' where id = '${permE}'`,
    );
});

await as(TU, async () => {
    await db.query(
        `update public.permintaan set status = 'disetujui' where id = '${permE}'`,
    );
});

await as(PGW, async () => {
    // Bukan galat: policy ubah_permintaan menyempitkan UPDATE milik pemohon
    // ke status draft dan diajukan, jadi permintaan yang sudah disetujui
    // sekadar tidak terlihat oleh update ini.
    const u = await db.query(
        `update public.permintaan set status = 'dibatalkan' where id = '${permE}'`,
    );
    ok(
        "permintaan yang sudah disetujui tidak bisa dibatalkan pemohon: nol baris, tanpa galat",
        u.affectedRows === 0,
        `(${u.affectedRows} baris)`,
    );
});

await as(PGW2, async () => {
    const p = (
        await db.query(`select id from public.permintaan where id = '${permE}'`)
    ).rows;
    ok(
        "pegawai lain tidak melihat permintaan milik orang lain",
        p.length === 0,
        `(${p.length} baris)`,
    );

    const it = (
        await db.query(
            `select id from public.permintaan_item where permintaan_id = '${permE}'`,
        )
    ).rows;
    ok(
        "baris permintaan orang lain ikut tak terlihat",
        it.length === 0,
        `(${it.length} baris)`,
    );

    const lg = (
        await db.query(
            `select id from public.permintaan_log where permintaan_id = '${permE}'`,
        )
    ).rows;
    ok(
        "log permintaan orang lain ikut tak terlihat",
        lg.length === 0,
        `(${lg.length} baris)`,
    );
});
```

- [x] **Step 3: Run the tests to verify the new section fails**

Run: `npm run db:test`
Expected: every assertion above `— permintaan pegawai —` still passes, then two failures — `FAIL  keranjang kosong tidak bisa diajukan — tidak ada error sama sekali` and `FAIL  permintaan tidak bisa lahir langsung berstatus diajukan — tidak ada error sama sekali` — and then the run **dies**: the empty keranjang has already become `diajukan`, so the next `insert into public.permintaan_item` is refused by `susun_permintaan_item` and throws outside any `expectError`. The process exits non-zero without printing the summary line. Those two failures, and that crash, are what the migration fixes.

- [x] **Step 4: Write the migration**

Create `supabase/migrations/20260901010000_permintaan-kosong.sql`:

```sql
-- =============================================================
-- SIPB SMPN 14 - Permintaan kosong tidak bisa diajukan
--
-- Sampai berkas ini, permintaan tanpa satu pun barang tetap bisa
-- berpindah ke `diajukan`: nomor_ada_setelah_draft maupun mesin
-- status sama-sama meloloskannya. Server action memang menolaknya,
-- tetapi komentar di siapkan_permintaan_item() sudah menyatakan
-- sikap proyek ini - aturan yang hanya hidup di React bukan aturan -
-- dan hal yang sama berlaku untuk aturan yang hanya hidup di server
-- action.
--
-- Jalur INSERT ikut ditutup, dan di situ aturannya jadi lebih
-- sederhana: baris permintaan_item tidak bisa ada sebelum induknya,
-- jadi permintaan yang lahir langsung berstatus diajukan sudah pasti
-- kosong. Membiarkan jalur itu terbuka berarti lubang yang ditutup
-- migrasi ini tetap terjangkau lewat satu pernyataan.
--
-- create or replace atas seluruh fungsi, sebagaimana dituntut
-- Postgres. Trigger trg_permintaan_alur tidak ikut dibuat ulang:
-- ia menunjuk fungsi ini menurut namanya.
-- =============================================================

create or replace function public.jaga_alur_permintaan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_unit   uuid;
  v_sah    boolean;
  v_belum  integer;
  v_isi    integer;
begin
  if tg_op = 'INSERT' then
    new.pemohon_id := coalesce(new.pemohon_id, v_uid);

    if new.unit_kerja_id is null then
      select p.unit_kerja_id into v_unit from public.profil p where p.id = new.pemohon_id;
      if v_unit is null then
        raise exception 'Akun Anda belum terhubung ke unit kerja. Minta tata usaha mengisinya lebih dulu.'
          using errcode = 'P0001';
      end if;
      new.unit_kerja_id := v_unit;
    end if;

    -- Permintaan yang lahir berstatus diajukan tidak mungkin punya
    -- barang: baris permintaan_item merujuk id yang belum terbit.
    -- Karena itu pesannya sama persis dengan yang di jalur UPDATE -
    -- yang salah memang hal yang sama.
    if new.status = 'diajukan' then
      raise exception 'Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.'
        using errcode = 'P0001';
    end if;

    if new.status <> 'draft' then
      raise exception 'Permintaan baru hanya boleh berstatus draft'
        using errcode = 'P0001';
    end if;

    return new;
  end if;

  new.updated_at := now();

  if new.status = old.status then
    return new;
  end if;

  v_sah := case old.status
    when 'draft'        then new.status = 'diajukan'
    when 'diajukan'     then new.status in ('disetujui', 'ditolak', 'dibatalkan')
    when 'disetujui'    then new.status in ('siap_diambil', 'ditolak')
    when 'siap_diambil' then new.status = 'selesai'
    else false
  end;

  if not v_sah then
    raise exception 'Transisi status % -> % tidak diizinkan', old.status, new.status
      using errcode = 'P0001';
  end if;

  -- v_uid kosong berarti pemanggilnya bukan sesi pengguna: migrasi,
  -- service_role, atau SQL editor. Pemeriksaan peran dilewati di situ,
  -- sama seperti di jaga_profil().
  if v_uid is not null then
    if new.status in ('diajukan', 'dibatalkan')
       and new.pemohon_id is distinct from v_uid then
      raise exception 'Hanya pemohon sendiri yang boleh mengajukan atau membatalkan permintaannya'
        using errcode = '42501';
    end if;

    if new.status in ('disetujui', 'ditolak') and not public.is_tu() then
      raise exception 'Hanya tata usaha yang boleh menyetujui atau menolak permintaan'
        using errcode = '42501';
    end if;

    if new.status in ('siap_diambil', 'selesai') and not public.is_pengurus() then
      raise exception 'Hanya pengurus barang yang boleh menyiapkan dan menyerahkan barang'
        using errcode = '42501';
    end if;
  end if;

  -- Sampai di sini statusnya pasti berubah - fungsi ini sudah pulang
  -- lebih dulu kalau tidak - jadi hitungan ini hanya berjalan pada
  -- perpindahan menuju diajukan, bukan pada setiap penyimpanan draft.
  if new.status = 'diajukan' then
    select count(*) into v_isi
    from public.permintaan_item pi
    where pi.permintaan_id = new.id;

    if v_isi = 0 then
      raise exception 'Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.'
        using errcode = 'P0001';
    end if;
  end if;

  -- siap_diambil hanya sah kalau stoknya benar-benar sudah keluar.
  -- Ini yang menutup jalan pintas "update status" tanpa lewat
  -- siapkan_permintaan(), yang akan membuat barang berpindah tanpa
  -- pernah tercatat di buku mutasi.
  if new.status = 'siap_diambil' then
    select count(*) into v_belum
    from public.permintaan_item pi
    where pi.permintaan_id = new.id
      and not exists (
        select 1 from public.mutasi_stok m where m.permintaan_item_id = pi.id
      );

    if v_belum > 0 then
      raise exception 'Barang belum dikeluarkan dari stok; pakai siapkan_permintaan() untuk menyiapkan permintaan ini'
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'diajukan' and new.nomor is null then
    new.nomor := 'SPB-' || lpad(nextval('public.seq_permintaan')::text, 6, '0');
  end if;

  case new.status
    when 'diajukan'     then new.diajukan_at := now();
    when 'disetujui'    then new.disetujui_at := now();
                             new.disetujui_oleh := coalesce(new.disetujui_oleh, v_uid);
    when 'siap_diambil' then new.siap_at := now();
                             new.disiapkan_oleh := coalesce(new.disiapkan_oleh, v_uid);
    when 'selesai'      then new.selesai_at := now();
                             new.diserahkan_oleh := coalesce(new.diserahkan_oleh, v_uid);
    else null;
  end case;

  return new;
end;
$$;

comment on function public.jaga_alur_permintaan() is
  'Mesin status permintaan. Selain transisi dan peran, ia menjaga dua hal yang tidak bisa dijaga constraint: permintaan yang diajukan harus punya barang, dan siap_diambil harus sudah punya mutasi keluar.';
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm run db:test`
Expected: every assertion passes, the summary line reads `N lolos, 0 gagal`, and the process exits 0.

- [x] **Step 6: Check the sandbox still boots**

`sandbox.mjs:105-108` inserts a draft, adds an item, then submits — the order the new rule requires. This step confirms it.

Run: `echo '\q' | npm run db:sandbox`
Expected: the banner and help text print, then `sampai jumpa`. No error mentioning `Permintaan kosong`.

- [x] **Step 7: Commit**

```bash
git add supabase/migrations/20260901010000_permintaan-kosong.sql supabase/tests/alur.mjs
git commit -m "feat(db): permintaan kosong tidak bisa diajukan"
```

---

## Task 2: `src/lib/permintaan.ts` and `pastikanPegawai()`

Four surfaces need the same status vocabulary — the list badge, the detail header, the timeline, and beranda — and a second copy of "which Indonesian word means `siap_diambil`" is exactly the drift that makes two pages disagree about the same row.

This file is **not** `server-only`, unlike `aksi.ts` and `dal.ts`. `detail-permintaan.tsx` is a client component and imports `LABEL_STATUS` from here. That constraint is what shapes the rest of the file: `ambilDraft()` and `hapusDraftBilaKosong()` take the Supabase client as an argument rather than building one, because importing `@/lib/supabase/server` would pull `next/headers` into the browser bundle.

**Files:**

- Create: `src/lib/permintaan.ts`
- Modify: `src/lib/aksi.ts` (append `pastikanPegawai` after `pastikanTataUsaha` at `:38-39`)

**Interfaces:**

- Consumes: `getUserOrRedirect`, `User` (`@/lib/dal`).
- Produces, from `@/lib/permintaan`:
    1. `type StatusPermintaan` — the seven members of the `status_permintaan` enum.
    2. `LABEL_STATUS: Record<StatusPermintaan, string>`, `NADA_STATUS: Record<StatusPermintaan, NadaStatus>`, `type NadaStatus = "default" | "secondary" | "destructive" | "outline"`.
    3. `kalimatLog(status: StatusPermintaan): string`.
    4. `type BarisKeranjang = { barang_id: string; jumlah_diminta: number }`, `type Draft = { id: string; item: BarisKeranjang[] }`.
    5. `ambilDraft(supabase: SupabaseClient, pemohonId: string): Promise<Draft | null>`.
    6. `hapusDraftBilaKosong(supabase: SupabaseClient, permintaanId: string): Promise<boolean>`.
    7. `type HasilKeranjang = { ok: true; kosong: boolean } | { ok: false; galat: string }`.
    8. `pesanGalatPermintaan(galat: PostgrestError): string`.
    9. `MAKS_JUMLAH: number`, `PANJANG_KEPERLUAN: number`, `PANJANG_CATATAN: number`, `GALAT_KERANJANG_HILANG: string`.
    10. `tanggalHariIni(): string`, `tanggalPanjang(nilai: string): string`, `waktuSingkat(nilai: string): string`.
- Produces, from `@/lib/aksi`: `pastikanPegawai(): Promise<User>`.

- [x] **Step 1: Add `pastikanPegawai` to `src/lib/aksi.ts`**

Insert this immediately after `pastikanTataUsaha` (which ends at `src/lib/aksi.ts:39`) and before the `teks` helper:

```ts
/**
 * Pasangan pastikanTataUsaha untuk halaman pegawai. Peran lain tidak
 * ditolak dengan pesan galat melainkan dipulangkan ke /beranda oleh
 * getUserOrRedirect - laman yang pasti terlihat oleh peran mana pun.
 *
 * Sama seperti pasangannya, ini lapis kedua. Gerbangnya adalah policy
 * buat_permintaan, ubah_permintaan, hapus_permintaan, dan
 * susun_permintaan_item, yang tetap berlaku kalau pemeriksaan ini kelak
 * terlupa dipasang di sebuah aksi baru.
 */
export const pastikanPegawai = async (): Promise<User> =>
    getUserOrRedirect(["pegawai"]);
```

- [x] **Step 2: Write `src/lib/permintaan.ts`**

Create the file:

```ts
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/**
 * Perbendaharaan status permintaan dan kerja keranjang, satu kali untuk
 * empat layar: lencana di daftar, kepala halaman detail, garis waktu, dan
 * beranda.
 *
 * Berkas ini SENGAJA tidak diawali `import "server-only"`, tidak seperti
 * aksi.ts dan dal.ts: detail-permintaan.tsx adalah komponen klien dan
 * mengambil LABEL_STATUS dari sini. Itu pula sebabnya ambilDraft() dan
 * hapusDraftBilaKosong() menerima klien Supabase sebagai argumen alih-alih
 * membuatnya sendiri - mengimpor lib/supabase/server.ts akan menyeret
 * next/headers ke bundel peramban.
 */

/** Cermin enum public.status_permintaan (skema.sql:20-23). */
export type StatusPermintaan =
    | "draft"
    | "diajukan"
    | "disetujui"
    | "siap_diambil"
    | "selesai"
    | "ditolak"
    | "dibatalkan";

/**
 * "Keranjang", bukan "Draft": bagi pegawai, permintaan berstatus draft
 * memang keranjang belanja yang belum dikirim - dan itu satu-satunya
 * bentuk draft yang pernah dilihatnya.
 */
export const LABEL_STATUS: Record<StatusPermintaan, string> = {
    draft: "Keranjang",
    diajukan: "Menunggu persetujuan",
    disetujui: "Disetujui",
    siap_diambil: "Siap diambil",
    selesai: "Selesai",
    ditolak: "Ditolak",
    dibatalkan: "Dibatalkan",
};

/** Varian Badge yang tersedia; tidak ada nada "peringatan" di ui/badge.tsx. */
export type NadaStatus = "default" | "secondary" | "destructive" | "outline";

export const NADA_STATUS: Record<StatusPermintaan, NadaStatus> = {
    draft: "outline",
    diajukan: "secondary",
    disetujui: "secondary",
    siap_diambil: "default",
    selesai: "outline",
    ditolak: "destructive",
    dibatalkan: "outline",
};

/**
 * Kalimat garis waktu, disebutkan menurut status - bukan menurut orang.
 *
 * Policy baca_profil hanya membolehkan pegawai membaca barisnya sendiri,
 * jadi menyambung permintaan_log.oleh ke profil.nama_lengkap menghasilkan
 * null untuk siapa pun yang menyetujui. Itu batas yang disengaja, bukan
 * celah yang perlu ditambal dengan view baru: "Disetujui tata usaha" sudah
 * memberi tahu pemohon apa yang perlu ia tahu.
 */
const KALIMAT_LOG: Record<StatusPermintaan, string> = {
    draft: "Keranjang dibuat",
    diajukan: "Diajukan ke tata usaha",
    disetujui: "Disetujui tata usaha",
    siap_diambil: "Barang disiapkan pengurus barang",
    selesai: "Barang diserahkan",
    ditolak: "Ditolak tata usaha",
    dibatalkan: "Dibatalkan pemohon",
};

export const kalimatLog = (status: StatusPermintaan): string =>
    KALIMAT_LOG[status];

/** Batas yang ditegakkan server; isian di layar hanya mencerminkannya. */
export const MAKS_JUMLAH = 999;
export const PANJANG_KEPERLUAN = 200;
export const PANJANG_CATATAN = 500;

export const GALAT_KERANJANG_HILANG =
    "Keranjang itu sudah tidak ada, atau isinya sudah berubah. Muat ulang halamannya.";

const GALAT_PINDAH_STATUS =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

// Kalimat yang sama dengan GALAT_UMUM di aksi.ts. Disalin, bukan diimpor:
// aksi.ts diawali `import "server-only"`, sedangkan berkas ini harus tetap
// bisa diimpor komponen klien yang menggambar lencana status.
const GALAT_UMUM = "Perubahan gagal disimpan. Coba lagi sebentar lagi.";

export type BarisKeranjang = {
    barang_id: string;
    jumlah_diminta: number;
};

export type Draft = { id: string; item: BarisKeranjang[] };

type BarisDraft = { id: string; permintaan_item: BarisKeranjang[] };

/**
 * Keranjang yang sedang terbuka berikut isinya, dalam satu perjalanan ke
 * basis data - halaman katalog membutuhkan keduanya sekaligus.
 *
 * `.limit(1)` setelah urutan terbaru: tidak ada satu pun batasan di basis
 * data yang melarang dua draft sekaligus. Aplikasilah yang tidak pernah
 * membuka yang kedua; kalau dua tab pernah berlomba dan keduanya terlanjur
 * ada, yang terbaru yang dipakai - bukan galat.
 */
export async function ambilDraft(
    supabase: SupabaseClient,
    pemohonId: string,
): Promise<Draft | null> {
    const { data, error } = await supabase
        .from("permintaan")
        .select("id, permintaan_item ( barang_id, jumlah_diminta )")
        .eq("pemohon_id", pemohonId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<BarisDraft>();

    if (error) {
        console.error("[permintaan] draft", error.code, error.message);
        return null;
    }

    return data ? { id: data.id, item: data.permintaan_item ?? [] } : null;
}

/**
 * Keranjang yang kosong tidak meninggalkan bangkai: baris permintaannya
 * ikut dihapus. Itu yang membuat aturan "satu draft per pegawai" tetap
 * jujur, dan policy hapus_permintaan memang mengizinkan tepat itu.
 *
 * Mengembalikan true kalau draftnya benar-benar ikut terhapus - halaman
 * detail memakainya untuk memulangkan pembacanya ke daftar.
 */
export async function hapusDraftBilaKosong(
    supabase: SupabaseClient,
    permintaanId: string,
): Promise<boolean> {
    const { count, error } = await supabase
        .from("permintaan_item")
        .select("id", { count: "exact", head: true })
        .eq("permintaan_id", permintaanId);

    if (error || count !== 0) return false;

    const { data } = await supabase
        .from("permintaan")
        .delete()
        .eq("id", permintaanId)
        .eq("status", "draft")
        .select("id");

    return (data?.length ?? 0) > 0;
}

/** HasilAksi dengan satu kabar tambahan: keranjangnya ikut terhapus. */
export type HasilKeranjang =
    | { ok: true; kosong: boolean }
    | { ok: false; galat: string };

/**
 * Pasangan pesanGalatDb untuk galat yang datang dari alur permintaan.
 *
 * Bentuknya berbeda: hampir semuanya tiba sebagai P0001 dari trigger, dan
 * sudah ditulis sebagai kalimat untuk orang yang membacanya. "Spidol
 * whiteboard hitam sedang kosong dan belum bisa diminta" dan "Akun Anda
 * belum terhubung ke unit kerja" dikarang untuk seorang tata usaha
 * sekolah; menggantinya dengan kalimat umum justru membuang satu-satunya
 * bagian yang memberi tahu apa yang harus dilakukan.
 *
 * Dua kalimat yang memang untuk pengembang - "Transisi status % -> %
 * tidak diizinkan" (fungsi.sql:296) dan petunjuk siapkan_permintaan()
 * (fungsi.sql:334) - ditangkap lebih dulu lewat teksnya lalu diganti.
 */
export function pesanGalatPermintaan(galat: PostgrestError): string {
    switch (galat.code) {
        case "P0001":
            if (/tidak diizinkan|siapkan_permintaan\(\)/.test(galat.message)) {
                return GALAT_PINDAH_STATUS;
            }
            return galat.message;

        case "23505":
            return "Barang itu sudah ada di keranjang.";

        case "42501":
            return "Akun Anda tidak berhak mengubah permintaan ini.";

        default:
            console.error("[permintaan]", galat.code, galat.message);
            return GALAT_UMUM;
    }
}

const ZONA = "Asia/Jakarta";

/**
 * Tanggal hari ini di Jakarta, dalam bentuk YYYY-MM-DD - persis yang
 * diminta dan dikembalikan <input type="date">. Format pendek en-CA
 * memang ISO; menyusunnya dari getFullYear() dan kawan-kawan akan memakai
 * zona waktu server, bukan zona waktu sekolah.
 */
export const tanggalHariIni = (): string =>
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

/** "3 September 2026" - tanggal dibutuhkan dan tanggal pengajuan. */
export const tanggalPanjang = (nilai: string): string =>
    new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: ZONA,
    }).format(new Date(nilai));

/** "3 Sep 2026, 14.05" - garis waktu dan aktivitas terbaru. */
export const waktuSingkat = (nilai: string): string =>
    new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ZONA,
    }).format(new Date(nilai));
```

- [x] **Step 3: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run: `grep -n "server-only" src/lib/permintaan.ts`
Expected: no output. If that line ever appears, every client component importing `LABEL_STATUS` breaks at build time — that is what this check exists to catch.

- [x] **Step 4: Commit**

```bash
git add src/lib/permintaan.ts src/lib/aksi.ts
git commit -m "feat: perbendaharaan status permintaan dan penjaga halaman pegawai"
```

---

## Task 3: `/katalog` — browse, search, and fill the cart

The first page a pegawai ever opens. It reads `public.katalog_pemohon` (`view.sql:34-48`), which has **no numeric column at all** — hiding the stock figure is a structural property of the view, not a `select` list the UI is trusted to keep short.

`Pencarian` and `siapkanKataKunci` get their third consumer here, unchanged; the move made in sub-project 3 pays for itself.

If `user.unitKerja` is null the page renders a banner instead of the Tambah buttons. The trigger (`fungsi.sql:259-266`) would raise anyway — the database keeps its guard; the UI simply stops setting someone up to fail.

**Files:**

- Create: `src/app/(dashboard)/katalog/page.tsx`
- Create: `src/app/(dashboard)/katalog/actions.ts`
- Create: `src/app/(dashboard)/katalog/katalog-daftar.tsx`

**Interfaces:**

- Consumes: `pastikanPegawai`, `siapkanKataKunci`, `HasilAksi` (`@/lib/aksi`); `ambilDraft`, `hapusDraftBilaKosong`, `pesanGalatPermintaan`, `GALAT_KERANJANG_HILANG`, `MAKS_JUMLAH`, `HasilKeranjang` (`@/lib/permintaan`); `createClient` (`@/lib/supabase/server`); `Pencarian` (`@/components/admin/pencarian`); `FormAlert` (`@/components/form-parts`).
- Produces:
    1. `tambahKeKeranjang(barangId: string): Promise<HasilAksi>` from `./actions`.
    2. `setelJumlah(permintaanId: string, barangId: string, jumlah: number): Promise<HasilKeranjang>` from `./actions` — Task 5 imports this one across route groups.
    3. `type BarisKatalog = { barang_id: string; kode: string; nama: string; satuan: string; tersedia: boolean }` and `KatalogDaftar` from `./katalog-daftar`.
    4. `Penyetel({ nama, jumlah, menunggu, onUbah })` from `./katalog-daftar` — Task 5 imports this one too.

- [x] **Step 1: Write the server actions**

Create `src/app/(dashboard)/katalog/actions.ts`:

```ts
"use server";

import { pastikanPegawai, type HasilAksi } from "@/lib/aksi";
import {
    ambilDraft,
    GALAT_KERANJANG_HILANG,
    hapusDraftBilaKosong,
    MAKS_JUMLAH,
    pesanGalatPermintaan,
    type HasilKeranjang,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR_KATALOG = "/katalog";
const JALUR_DAFTAR = "/permintaan-saya";

/**
 * Ketiga halaman yang bisa sedang menampilkan isi keranjang yang sama.
 * Tidak ada lencana keranjang di nav - keputusan yang disengaja - jadi
 * ketiganya inilah seluruh tempat yang perlu tahu.
 */
const segarkan = (permintaanId: string) => {
    revalidatePath(JALUR_KATALOG);
    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${permintaanId}`);
};

/**
 * Memasukkan satu barang ke keranjang, membuka keranjangnya kalau belum ada.
 *
 * Draftnya adalah keranjang - ia hidup di Postgres, bukan di peramban, jadi
 * ia selamat dari muat ulang, laptop yang ditutup, dan perpindahan ke
 * ponsel. Itu juga yang membuat penolakan barang berstok nol terjadi di
 * detik barang ditambahkan, bukan di saat pengajuan - saat penolakan paling
 * mahal harganya.
 */
export async function tambahKeKeranjang(barangId: string): Promise<HasilAksi> {
    const user = await pastikanPegawai();
    const supabase = await createClient();

    const draft = await ambilDraft(supabase, user.id);
    let permintaanId = draft?.id ?? null;
    const baruDibuka = permintaanId === null;

    if (permintaanId === null) {
        // keperluan diisi string kosong, bukan dibiarkan kosong: kolomnya
        // not null. Isinya ditanyakan nanti di dialog pengajuan - orang yang
        // cuma mau mengambil sekotak spidol tidak disodori formulir dulu.
        //
        // pemohon_id ditulis sendiri walau trigger sanggup mengisinya, sebab
        // policy buat_permintaan menguji kolom itu lewat WITH CHECK.
        const { data, error } = await supabase
            .from("permintaan")
            .insert({ pemohon_id: user.id, keperluan: "" })
            .select("id")
            .single();

        if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
        if (!data) return { ok: false, galat: GALAT_KERANJANG_HILANG };

        permintaanId = data.id;
    }

    const { error } = await supabase.from("permintaan_item").insert({
        permintaan_id: permintaanId,
        barang_id: barangId,
        jumlah_diminta: 1,
    });

    // 23505 berarti barangnya sudah ada di keranjang - hampir selalu karena
    // tab kedua sudah menambahkannya. Yang diminta pengguna sudah terpenuhi,
    // jadi ini bukan kegagalan. Sengaja tidak ditimpa dengan angka 1:
    // jumlah yang sudah disetel di tab itu bukan milik aksi ini.
    if (error && error.code !== "23505") {
        // Keranjang yang baru dibuka untuk barang yang ternyata ditolak -
        // stoknya nol - tidak boleh tertinggal sebagai keranjang kosong.
        if (baruDibuka) await hapusDraftBilaKosong(supabase, permintaanId);
        return { ok: false, galat: pesanGalatPermintaan(error) };
    }

    segarkan(permintaanId);
    return { ok: true };
}

/**
 * Menyetel jumlah satu barang di keranjang. Nol berarti mengeluarkannya,
 * dan barang terakhir yang keluar membawa serta keranjangnya.
 *
 * permintaanId datang dari pemanggil, bukan dicari ulang di sini: halaman
 * detail tahu keranjang mana yang sedang dibukanya, dan mencarinya ulang
 * akan membuat halaman itu menyunting keranjang lain kalau dua tab pernah
 * berlomba membuka draft.
 *
 * Tidak ada pemeriksaan kepemilikan. Policy susun_permintaan_item
 * menyempitkannya ke keranjang sendiri yang masih draft; pagar kedua di
 * sini hanya menambah satu tempat yang bisa melenceng.
 */
export async function setelJumlah(
    permintaanId: string,
    barangId: string,
    jumlah: number,
): Promise<HasilKeranjang> {
    await pastikanPegawai();

    const bulat = Math.trunc(jumlah);
    if (!Number.isFinite(bulat) || bulat < 0 || bulat > MAKS_JUMLAH) {
        return {
            ok: false,
            galat: `Jumlah harus antara 1 dan ${MAKS_JUMLAH}.`,
        };
    }

    const supabase = await createClient();

    const { data, error } =
        bulat === 0
            ? await supabase
                  .from("permintaan_item")
                  .delete()
                  .eq("permintaan_id", permintaanId)
                  .eq("barang_id", barangId)
                  .select("id")
            : await supabase
                  .from("permintaan_item")
                  .update({ jumlah_diminta: bulat })
                  .eq("permintaan_id", permintaanId)
                  .eq("barang_id", barangId)
                  .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_KERANJANG_HILANG };

    const kosong =
        bulat === 0 && (await hapusDraftBilaKosong(supabase, permintaanId));

    segarkan(permintaanId);
    return { ok: true, kosong };
}
```

- [x] **Step 2: Write the page**

Create `src/app/(dashboard)/katalog/page.tsx`:

```tsx
import { pastikanPegawai, siapkanKataKunci } from "@/lib/aksi";
import { ambilDraft } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { KatalogDaftar, type BarisKatalog } from "./katalog-daftar";

export const metadata: Metadata = {
    title: "Katalog Barang — SIPB SMPN 14",
};

/**
 * Tanpa paginasi: katalog sekolah ini puluhan baris, bukan ribuan, dan
 * pencarian yang mempersempitnya. Kalau kelak tumbuh melewati itu,
 * penanganan PGRST103 di master-barang adalah polanya.
 */
export default async function KatalogPage({
    searchParams,
}: {
    searchParams: Promise<{ cari?: string }>;
}) {
    const user = await pastikanPegawai();

    const parameter = await searchParams;
    const cari = (parameter.cari ?? "").trim();

    const supabase = await createClient();

    // katalog_pemohon, bukan barang: view itu tidak punya satu pun kolom
    // angka, jadi angka stok tidak bisa bocor lewat halaman ini bahkan
    // kalau select-nya kelak ditulis dengan "*".
    let kueri = supabase
        .from("katalog_pemohon")
        .select("barang_id, kode, nama, satuan, tersedia");

    const kataKunci = siapkanKataKunci(cari);
    if (kataKunci) {
        kueri = kueri.or(
            `kode.ilike."%${kataKunci}%",nama.ilike."%${kataKunci}%"`,
        );
    }

    // Dua permintaan yang tidak saling menunggu: katalognya panjang,
    // keranjangnya satu baris beserta isinya.
    const [katalog, draft] = await Promise.all([
        kueri.order("nama"),
        ambilDraft(supabase, user.id),
    ]);

    if (katalog.error) {
        console.error("[katalog]", katalog.error.code, katalog.error.message);
        return (
            <p className="mx-auto max-w-5xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Katalog gagal dimuat. Muat ulang halamannya sebentar lagi.
            </p>
        );
    }

    const isi = Object.fromEntries(
        (draft?.item ?? []).map((i) => [i.barang_id, i.jumlah_diminta]),
    );

    return (
        <KatalogDaftar
            baris={(katalog.data ?? []) as BarisKatalog[]}
            cari={cari}
            draftId={draft?.id ?? null}
            isi={isi}
            tanpaUnitKerja={user.unitKerja === null}
        />
    );
}
```

- [x] **Step 3: Write the list**

Create `src/app/(dashboard)/katalog/katalog-daftar.tsx`:

```tsx
"use client";

import { Pencarian } from "@/components/admin/pencarian";
import { FormAlert } from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MAKS_JUMLAH } from "@/lib/permintaan";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { setelJumlah, tambahKeKeranjang } from "./actions";

export type BarisKatalog = {
    barang_id: string;
    kode: string;
    nama: string;
    satuan: string;
    tersedia: boolean;
};

/**
 * Katalog belanja. Satu bentuk kartu di semua lebar layar, bukan tabel di
 * layar lebar: tiap baris memuat kontrolnya sendiri, dan kartu membuat
 * kontrol itu berada di tempat yang sama di ponsel maupun di laptop.
 */
export function KatalogDaftar({
    baris,
    cari,
    draftId,
    isi,
    tanpaUnitKerja,
}: {
    baris: BarisKatalog[];
    cari: string;
    /** Keranjang yang sedang terbuka, kalau ada. */
    draftId: string | null;
    /** barang_id -> jumlah yang sudah ada di keranjang. */
    isi: Record<string, number>;
    tanpaUnitKerja: boolean;
}) {
    // Tombol di baris tidak punya dialog tempat menaruh pesan galatnya, jadi
    // pesannya naik ke satu tempat di atas daftar - terbaca dari baris mana
    // pun kegagalannya datang.
    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();

    const tambah = (barang: BarisKatalog) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await tambahKeKeranjang(barang.barang_id);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    const setel = (barang: BarisKatalog, jumlah: number) => {
        if (!draftId) return;
        setGalat(null);
        mulai(async () => {
            const hasil = await setelJumlah(draftId, barang.barang_id, jumlah);
            if (!hasil.ok) setGalat(hasil.galat);
        });
    };

    const jumlahBarang = Object.keys(isi).length;

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Pencarian
                awal={cari}
                jalur="/katalog"
                placeholder="Cari nama atau kode barang"
                ariaLabel="Cari barang"
            />

            {tanpaUnitKerja && (
                <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-[13px] leading-relaxed text-destructive">
                    Akun Anda belum terhubung ke unit kerja, jadi permintaan
                    belum bisa dibuat. Minta tata usaha mengisinya lebih dulu.
                </p>
            )}

            {galat && <FormAlert>{galat}</FormAlert>}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {cari
                        ? `Tidak ada barang yang cocok dengan “${cari}”.`
                        : "Katalog masih kosong. Barang muncul di sini setelah pengurus barang mencatat penerimaan pertama."}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((barang) => (
                        <li
                            key={barang.barang_id}
                            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">
                                    {barang.nama}
                                </p>
                                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                                    {barang.kode}
                                </p>
                                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Satuan: {barang.satuan}</span>
                                    {!barang.tersedia && (
                                        <Badge
                                            variant="outline"
                                            className="text-muted-foreground"
                                        >
                                            Sedang kosong
                                        </Badge>
                                    )}
                                </p>
                            </div>

                            {/* Barang kosong tidak menawarkan tombol apa pun.
                                Penolakannya sendiri tetap milik database:
                                trigger siapkan_permintaan_item yang menolak,
                                bukan atribut disabled ini. */}
                            {tanpaUnitKerja || !barang.tersedia ? null : isi[
                                  barang.barang_id
                              ] ? (
                                <Penyetel
                                    nama={barang.nama}
                                    jumlah={isi[barang.barang_id]}
                                    menunggu={menunggu}
                                    onUbah={(n) => setel(barang, n)}
                                />
                            ) : (
                                <Button
                                    variant="outline"
                                    className="h-9.5 shrink-0"
                                    disabled={menunggu}
                                    onClick={() => tambah(barang)}
                                    aria-label={`Tambahkan ${barang.nama} ke keranjang`}
                                >
                                    <Plus />
                                    Tambah
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Keranjang mengumumkan dirinya di tempat ia sedang diisi.
                Lencana hidup di nav akan berarti menyalurkan hitungan lewat
                layout dashboard ke AppShell pada setiap navigasi. */}
            {jumlahBarang > 0 && draftId && (
                <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
                    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                        <p className="text-[13px] text-muted-foreground">
                            <span className="font-medium text-foreground">
                                {jumlahBarang} barang
                            </span>{" "}
                            di keranjang
                        </p>
                        <Button asChild className="h-9.5 shrink-0">
                            <Link href={`/permintaan-saya/${draftId}`}>
                                <ShoppingCart />
                                Lihat Keranjang
                            </Link>
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Tombol kurang / angka / tombol tambah. Diekspor karena halaman detail
 * memakai penyetel yang sama persis - dua salinan akan berarti dua tempat
 * yang bisa berbeda soal apa arti menekan minus di angka satu.
 */
export function Penyetel({
    nama,
    jumlah,
    menunggu,
    onUbah,
}: {
    nama: string;
    jumlah: number;
    menunggu: boolean;
    onUbah: (jumlah: number) => void;
}) {
    return (
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={menunggu}
                onClick={() => onUbah(jumlah - 1)}
                aria-label={
                    jumlah === 1
                        ? `Keluarkan ${nama} dari keranjang`
                        : `Kurangi jumlah ${nama}`
                }
            >
                <Minus className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
            <span className="w-7 text-center text-[13px] font-medium tabular-nums text-foreground">
                {jumlah}
            </span>
            <Button
                variant="ghost"
                size="icon-sm"
                disabled={menunggu || jumlah >= MAKS_JUMLAH}
                onClick={() => onUbah(jumlah + 1)}
                aria-label={`Tambah jumlah ${nama}`}
            >
                <Plus className="text-muted-foreground" strokeWidth={1.6} />
            </Button>
        </div>
    );
}
```

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev` and, signed in as a pegawai whose profil has a unit kerja, open `http://localhost:3000/katalog`:

1. The list shows every barang. Items with no stock carry a "Sedang kosong" badge and no button.
2. "Tambah" on an available barang turns into a stepper reading 1, and a sticky bar appears at the bottom reading "1 barang di keranjang".
3. `+` and `−` change the number. Pressing `−` at 1 removes the row from the cart and the sticky bar disappears.
4. Reload the page. The stepper and its number are still there — the cart is in Postgres, not in the browser.
5. Search for a partial name, then for a term containing a comma and a `%` (e.g. `spidol, 50%`). Both return a list — the second most likely empty — and never the red "Katalog gagal dimuat" banner. That banner here would mean `siapkanKataKunci` is not being applied.
6. As Tata Usaha, type `/katalog` in the address bar. Expected: you land on `/beranda`.
7. In the Supabase SQL editor run `update public.profil set unit_kerja_id = null where id = '<pegawai uuid>'`, reload `/katalog`, and confirm the red banner replaces every Tambah button. Set the unit kerja back afterwards.

- [x] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/katalog"
git commit -m "feat: katalog barang dengan keranjang yang hidup di basis data"
```

---

## Task 4: `/permintaan-saya` — the draft, then every submitted request

The draft is pinned at the top as a card, then submitted requests newest-first. No pagination, for the reason `/pengguna` declined it (`pengguna/page.tsx:14-19`): a pegawai files tens of requests, not thousands. `master-barang`'s `Paginasi` is the pattern to lift if that ever stops being true.

`daftar-permintaan.tsx` carries no `"use client"`. It has no interactivity at all — a list of links and badges — and Task 5's client component imports `LencanaStatus` from it. **Do not add `"use client"` to it.** A module without the directive that a client component imports is bundled as client code anyway; leaving it off means the list page itself ships no JavaScript for it. That works only because nothing in the file is server-only: `Badge`, `Link`, lucide icons, and `@/lib/permintaan` are all importable from either side.

**Files:**

- Create: `src/app/(dashboard)/permintaan-saya/page.tsx`
- Create: `src/app/(dashboard)/permintaan-saya/daftar-permintaan.tsx`

**Interfaces:**

- Consumes: `pastikanPegawai` (`@/lib/aksi`); `ambilDraft`, `LABEL_STATUS`, `NADA_STATUS`, `StatusPermintaan`, `Draft`, `tanggalPanjang` (`@/lib/permintaan`); `createClient` (`@/lib/supabase/server`); `Badge` (`@/components/ui/badge`).
- Produces, from `./daftar-permintaan`:
    1. `type BarisPermintaan = { id: string; nomor: string | null; status: StatusPermintaan; keperluan: string; created_at: string; permintaan_item: { id: string }[] }`
    2. `LencanaStatus({ status }: { status: StatusPermintaan })` — Task 5 imports this.
    3. `DaftarPermintaan({ draft, baris }: { draft: Draft | null; baris: BarisPermintaan[] })`

- [x] **Step 1: Write the list component**

Create `src/app/(dashboard)/permintaan-saya/daftar-permintaan.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import {
    LABEL_STATUS,
    NADA_STATUS,
    tanggalPanjang,
    type Draft,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { ChevronRight, ShoppingCart } from "lucide-react";
import Link from "next/link";

export type BarisPermintaan = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    created_at: string;
    permintaan_item: { id: string }[];
};

/**
 * Lencana status, satu bentuk untuk daftar dan halaman detail. Nada
 * "outline" dipakai untuk status yang sudah selesai berjalan, jadi
 * teksnya diredupkan sekalian - sama seperti LencanaAktif di pengguna.
 */
export function LencanaStatus({ status }: { status: StatusPermintaan }) {
    const nada = NADA_STATUS[status];
    return (
        <Badge
            variant={nada}
            className={nada === "outline" ? "text-muted-foreground" : ""}
        >
            {LABEL_STATUS[status]}
        </Badge>
    );
}

export function DaftarPermintaan({
    draft,
    baris,
}: {
    draft: Draft | null;
    baris: BarisPermintaan[];
}) {
    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {draft && (
                <Link
                    href={`/permintaan-saya/${draft.id}`}
                    className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3.5 transition-colors outline-none hover:bg-primary/12 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                    <ShoppingCart
                        aria-hidden
                        className="size-4 shrink-0 text-primary"
                        strokeWidth={1.6}
                    />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                            Keranjang
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {draft.item.length} barang, belum diajukan
                        </p>
                    </div>
                    <ChevronRight
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.6}
                    />
                </Link>
            )}

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    Belum ada permintaan yang diajukan.
                    <br />
                    Mulai dari{" "}
                    <Link
                        href="/katalog"
                        className="font-medium text-foreground underline underline-offset-4"
                    >
                        Katalog Barang
                    </Link>
                    .
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((p) => (
                        <li key={p.id}>
                            <Link
                                href={`/permintaan-saya/${p.id}`}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-[13px] font-medium text-foreground">
                                            {p.nomor ?? "Tanpa nomor"}
                                        </span>
                                        <LencanaStatus status={p.status} />
                                    </div>
                                    <p className="mt-1 truncate text-[13px] text-muted-foreground">
                                        {p.keperluan}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {p.permintaan_item.length} barang ·{" "}
                                        {tanggalPanjang(p.created_at)}
                                    </p>
                                </div>
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground"
                                    strokeWidth={1.6}
                                />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

- [x] **Step 2: Write the page**

Create `src/app/(dashboard)/permintaan-saya/page.tsx`:

```tsx
import { pastikanPegawai } from "@/lib/aksi";
import { ambilDraft } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { DaftarPermintaan, type BarisPermintaan } from "./daftar-permintaan";

export const metadata: Metadata = {
    title: "Permintaan Saya — SIPB SMPN 14",
};

/**
 * Tanpa paginasi, dengan sengaja: seorang pegawai mengajukan puluhan
 * permintaan, bukan ribuan. Kalau kelak daftarnya tumbuh melewati itu,
 * Paginasi di master-barang/page.tsx adalah polanya.
 */
export default async function PermintaanSayaPage() {
    const user = await pastikanPegawai();
    const supabase = await createClient();

    const [draft, riwayat] = await Promise.all([
        ambilDraft(supabase, user.id),
        // .eq("pemohon_id") tidak menggantikan RLS - policy baca_permintaan
        // sudah menyempitkannya - tetapi menuliskannya membuat maksud kueri
        // ini terbaca tanpa harus membuka rls.sql.
        supabase
            .from("permintaan")
            .select(
                "id, nomor, status, keperluan, created_at, permintaan_item ( id )",
            )
            .eq("pemohon_id", user.id)
            .neq("status", "draft")
            .order("created_at", { ascending: false }),
    ]);

    if (riwayat.error) {
        console.error(
            "[permintaan saya]",
            riwayat.error.code,
            riwayat.error.message,
        );
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar permintaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    return (
        <DaftarPermintaan
            draft={draft}
            baris={(riwayat.data ?? []) as BarisPermintaan[]}
        />
    );
}
```

- [x] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev` and, as a pegawai, open `http://localhost:3000/permintaan-saya`:

1. With an empty cart and no history: the page reads "Belum ada permintaan yang diajukan." and the "Katalog Barang" link lands on `/katalog`.
2. Add two barang on `/katalog`, come back: a "Keranjang — 2 barang, belum diajukan" card is pinned at the top. Clicking it goes to `/permintaan-saya/<uuid>`, which 404s for now — Task 5 builds it.
3. The topbar title reads "Permintaan Saya" on both the list and the detail URL. That comes free from `app-shell.tsx:25-30`; no shell change was needed.

- [x] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/permintaan-saya"
git commit -m "feat: daftar permintaan saya dengan keranjang tersemat di atas"
```

---

## Task 5: `/permintaan-saya/[id]` — edit the draft, submit it, read the rest

The first dynamic route in this codebase, and the first `notFound()`. It needs no ownership check of its own: RLS returns no row for someone else's request, and a missing row renders `notFound()` — the absence of a leak, rather than a second gate that can drift from the first.

The page renders in one of two modes. **Draft:** quantities editable, items removable, "Kosongkan keranjang", and the submit dialog. **Anything else:** read-only items shown from their snapshots, plus the timeline; `alasan_tolak` gets its own block when the status is `ditolak`, not a line in the timeline — it is the one thing the pegawai came to read.

Cancelling is offered only at `diajukan`. The state machine allows `diajukan → dibatalkan` and nothing after it, so once tata usaha approves, the page says so instead of showing a button that would silently affect zero rows.

`setelJumlah` is imported from `@/app/(dashboard)/katalog/actions` — one implementation for both steppers, keyed by `permintaanId` so this page always edits the draft it is displaying.

**Files:**

- Create: `src/app/(dashboard)/permintaan-saya/[id]/page.tsx`
- Create: `src/app/(dashboard)/permintaan-saya/[id]/detail-permintaan.tsx`
- Create: `src/app/(dashboard)/permintaan-saya/actions.ts`

**Interfaces:**

- Consumes: `pastikanPegawai`, `teks`, `HasilAksi` (`@/lib/aksi`); `pesanGalatPermintaan`, `GALAT_KERANJANG_HILANG`, `PANJANG_KEPERLUAN`, `PANJANG_CATATAN`, `tanggalHariIni`, `tanggalPanjang`, `waktuSingkat`, `kalimatLog`, `StatusPermintaan` (`@/lib/permintaan`); `setelJumlah` (`@/app/(dashboard)/katalog/actions`); `Penyetel` (`@/app/(dashboard)/katalog/katalog-daftar`); `LencanaStatus` (`../daftar-permintaan`); `DialogForm`, `BidangDialog` (`@/components/admin/dialog-form`); `FormAlert` (`@/components/form-parts`).
- Produces, from `./actions` (i.e. `src/app/(dashboard)/permintaan-saya/actions.ts`):
    1. `ajukanPermintaan(id: string, sebelumnya: HasilAksi | null, formData: FormData): Promise<HasilAksi>`
    2. `batalkanPermintaan(id: string): Promise<HasilAksi>`
    3. `kosongkanKeranjang(id: string): Promise<HasilAksi>` — redirects to `/permintaan-saya` on success and never returns.
- Produces, from `./[id]/detail-permintaan`: `type ItemDetail`, `type BarisLog`, `type BarisDetail`, `DetailPermintaan`.

- [x] **Step 1: Write the server actions**

Create `src/app/(dashboard)/permintaan-saya/actions.ts`:

```ts
"use server";

import { pastikanPegawai, teks, type HasilAksi } from "@/lib/aksi";
import {
    GALAT_KERANJANG_HILANG,
    PANJANG_CATATAN,
    PANJANG_KEPERLUAN,
    pesanGalatPermintaan,
    tanggalHariIni,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const JALUR_KATALOG = "/katalog";
const JALUR_DAFTAR = "/permintaan-saya";

const GALAT_PINDAH =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

/**
 * Mengajukan keranjang. Keperluan, tanggal dibutuhkan, dan catatan baru
 * ditanyakan di sini - bukan di klik pertama - karena di titik ini
 * pemohonnya sudah melihat seluruh daftar barangnya.
 *
 * Ketiganya ditulis bersama status dalam satu UPDATE. Trigger yang
 * menerbitkan nomor SPB dan mencap diajukan_at; baris lognya ditulis
 * catat_log_permintaan(). Tidak ada satu pun dari itu yang perlu diketik
 * di sini.
 */
export async function ajukanPermintaan(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanPegawai();

    const keperluan = teks(formData, "keperluan");
    const tanggal = teks(formData, "tanggal_dibutuhkan");
    const catatan = teks(formData, "catatan_pemohon");

    if (!keperluan) return { ok: false, galat: "Keperluan belum diisi." };
    if (keperluan.length > PANJANG_KEPERLUAN) {
        return {
            ok: false,
            galat: `Keperluan terlalu panjang, maksimal ${PANJANG_KEPERLUAN} karakter.`,
        };
    }
    if (catatan.length > PANJANG_CATATAN) {
        return {
            ok: false,
            galat: `Catatan terlalu panjang, maksimal ${PANJANG_CATATAN} karakter.`,
        };
    }
    // Perbandingan teks, bukan Date: keduanya YYYY-MM-DD dan keduanya
    // dihitung di zona waktu sekolah, jadi tidak ada tengah malam UTC yang
    // membuat "hari ini" jadi kemarin.
    if (tanggal && tanggal < tanggalHariIni()) {
        return {
            ok: false,
            galat: "Tanggal dibutuhkan tidak boleh sebelum hari ini.",
        };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({
            keperluan,
            tanggal_dibutuhkan: tanggal || null,
            catatan_pemohon: catatan || null,
            status: "diajukan",
        })
        .eq("id", id)
        .eq("status", "draft")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    // Nol baris berarti RLS menolak update ini tanpa memunculkan galat -
    // keadaan yang didokumentasikan aksi.ts:61-64. Di sini penyebabnya
    // hampir selalu keranjang yang sudah diajukan dari tab lain.
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_KATALOG);
    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    return { ok: true };
}

/**
 * Membatalkan permintaan yang masih menunggu persetujuan.
 *
 * `.eq("status", "diajukan")` bukan pengulangan mesin status: tanpa itu,
 * permintaan yang sudah disetujui akan tetap terkirim ke server dan
 * ditolak diam-diam oleh policy ubah_permintaan - nol baris, tanpa galat.
 * Dengan itu, hasilnya sama tetapi maksudnya terbaca.
 */
export async function batalkanPermintaan(id: string): Promise<HasilAksi> {
    await pastikanPegawai();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "dibatalkan" })
        .eq("id", id)
        .eq("status", "diajukan")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    return { ok: true };
}

/**
 * Mengosongkan keranjang: barisnya sendiri yang dihapus, dan
 * permintaan_item ikut lewat on delete cascade.
 *
 * Berakhir dengan redirect(), bukan { ok: true }, karena halaman yang
 * memanggilnya baru saja berhenti ada. redirect() melempar - itu memang
 * caranya bekerja - jadi ia tidak boleh berada di dalam try/catch.
 */
export async function kosongkanKeranjang(id: string): Promise<HasilAksi> {
    await pastikanPegawai();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .delete()
        .eq("id", id)
        .eq("status", "draft")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_KERANJANG_HILANG };

    revalidatePath(JALUR_KATALOG);
    revalidatePath(JALUR_DAFTAR);
    redirect(JALUR_DAFTAR);
}
```

- [x] **Step 2: Write the page**

Create `src/app/(dashboard)/permintaan-saya/[id]/page.tsx`:

```tsx
import { pastikanPegawai } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    DetailPermintaan,
    type BarisDetail,
    type BarisLog,
} from "./detail-permintaan";

export const metadata: Metadata = {
    title: "Detail Permintaan — SIPB SMPN 14",
};

/**
 * Tidak ada pemeriksaan kepemilikan di halaman ini, dan itu disengaja.
 * Policy baca_permintaan tidak mengembalikan baris milik orang lain, jadi
 * permintaan orang lain tiba di sini sebagai "tidak ada" - persis seperti
 * uuid karangan. Gerbang kedua di sini hanya akan jadi gerbang yang bisa
 * melenceng dari gerbang pertama.
 */
export default async function DetailPermintaanPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await pastikanPegawai();

    const { id } = await params;
    const supabase = await createClient();

    // Kalau id-nya bukan uuid, Postgres menolaknya (22P02) dan data-nya
    // null - jalur yang sama dengan permintaan yang memang tidak ada.
    const { data } = await supabase
        .from("permintaan")
        .select(
            `id, nomor, status, keperluan, tanggal_dibutuhkan, catatan_pemohon,
             alasan_tolak, created_at, diajukan_at,
             permintaan_item ( id, barang_id, nama_barang_snapshot, satuan_snapshot, jumlah_diminta )`,
        )
        .eq("id", id)
        .maybeSingle<BarisDetail>();

    if (!data) notFound();

    const { data: log } = await supabase
        .from("permintaan_log")
        .select("id, status_ke, created_at")
        .eq("permintaan_id", id)
        .order("created_at");

    const item = [...(data.permintaan_item ?? [])].sort((a, b) =>
        a.nama_barang_snapshot.localeCompare(b.nama_barang_snapshot, "id"),
    );

    return (
        <DetailPermintaan
            permintaan={{ ...data, permintaan_item: item }}
            log={(log ?? []) as BarisLog[]}
        />
    );
}
```

- [x] **Step 3: Write the detail component**

Create `src/app/(dashboard)/permintaan-saya/[id]/detail-permintaan.tsx`:

```tsx
"use client";

import { setelJumlah } from "@/app/(dashboard)/katalog/actions";
import { Penyetel } from "@/app/(dashboard)/katalog/katalog-daftar";
import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { FormAlert } from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import {
    kalimatLog,
    PANJANG_CATATAN,
    PANJANG_KEPERLUAN,
    tanggalHariIni,
    tanggalPanjang,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { LencanaStatus } from "../daftar-permintaan";
import {
    ajukanPermintaan,
    batalkanPermintaan,
    kosongkanKeranjang,
} from "../actions";

export type ItemDetail = {
    id: string;
    barang_id: string;
    nama_barang_snapshot: string;
    satuan_snapshot: string;
    jumlah_diminta: number;
};

export type BarisLog = {
    id: string;
    status_ke: StatusPermintaan;
    created_at: string;
};

export type BarisDetail = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    catatan_pemohon: string | null;
    alasan_tolak: string | null;
    created_at: string;
    diajukan_at: string | null;
    permintaan_item: ItemDetail[];
};

export function DetailPermintaan({
    permintaan,
    log,
}: {
    permintaan: BarisDetail;
    log: BarisLog[];
}) {
    const router = useRouter();

    const [galat, setGalat] = React.useState<string | null>(null);
    const [menunggu, mulai] = React.useTransition();
    const [ajukan, setAjukan] = React.useState(false);
    const [kosongkan, setKosongkan] = React.useState(false);
    const [batalkan, setBatalkan] = React.useState(false);

    const draft = permintaan.status === "draft";

    const setel = (item: ItemDetail, jumlah: number) => {
        setGalat(null);
        mulai(async () => {
            const hasil = await setelJumlah(
                permintaan.id,
                item.barang_id,
                jumlah,
            );
            if (!hasil.ok) {
                setGalat(hasil.galat);
                return;
            }
            // Barang terakhir yang keluar membawa serta keranjangnya, jadi
            // halaman ini baru saja berhenti ada.
            if (hasil.kosong) router.replace("/permintaan-saya");
        });
    };

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Link
                href="/permintaan-saya"
                className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ArrowLeft className="size-4" strokeWidth={1.6} />
                Permintaan Saya
            </Link>

            <header className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-mono text-base font-semibold text-foreground">
                    {permintaan.nomor ?? "Keranjang"}
                </h2>
                <LencanaStatus status={permintaan.status} />
            </header>

            {galat && <FormAlert>{galat}</FormAlert>}

            {permintaan.status === "ditolak" && permintaan.alasan_tolak && (
                <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3.5">
                    <p className="text-[13px] font-medium text-destructive">
                        Alasan penolakan
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-destructive">
                        {permintaan.alasan_tolak}
                    </p>
                </div>
            )}

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Barang ({permintaan.permintaan_item.length})
                </h3>

                {permintaan.permintaan_item.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Keranjang ini kosong.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {permintaan.permintaan_item.map((item) => (
                            <li
                                key={item.id}
                                className="flex items-center gap-3 px-4 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-medium text-foreground">
                                        {item.nama_barang_snapshot}
                                    </p>
                                    {!draft && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {item.jumlah_diminta}{" "}
                                            {item.satuan_snapshot}
                                        </p>
                                    )}
                                </div>

                                {draft ? (
                                    <>
                                        <span className="shrink-0 text-xs text-muted-foreground">
                                            {item.satuan_snapshot}
                                        </span>
                                        <Penyetel
                                            nama={item.nama_barang_snapshot}
                                            jumlah={item.jumlah_diminta}
                                            menunggu={menunggu}
                                            onUbah={(n) => setel(item, n)}
                                        />
                                    </>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {draft ? (
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="outline" className="h-9.5">
                        <Link href="/katalog">
                            <Plus />
                            Tambah Barang
                        </Link>
                    </Button>
                    <Button
                        className="h-9.5"
                        disabled={permintaan.permintaan_item.length === 0}
                        onClick={() => setAjukan(true)}
                    >
                        <Send />
                        Ajukan Permintaan
                    </Button>
                    <Button
                        variant="ghost"
                        className="ml-auto h-9.5 text-muted-foreground"
                        onClick={() => setKosongkan(true)}
                    >
                        <Trash2 strokeWidth={1.6} />
                        Kosongkan
                    </Button>
                </div>
            ) : (
                <Keterangan permintaan={permintaan} />
            )}

            {permintaan.status === "diajukan" && (
                <Button
                    variant="outline"
                    className="h-9.5 w-fit text-destructive"
                    onClick={() => setBatalkan(true)}
                >
                    Batalkan Permintaan
                </Button>
            )}

            {!draft && (
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                    <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                        Riwayat
                    </h3>
                    {/* Disebutkan menurut status, bukan menurut orang: policy
                        baca_profil hanya membuka baris sendiri, jadi nama
                        penyetujunya memang tidak terjangkau dari sini. */}
                    <ol className="divide-y divide-border">
                        {log.map((l) => (
                            <li
                                key={l.id}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3"
                            >
                                <span className="text-[13px] text-foreground">
                                    {kalimatLog(l.status_ke)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {waktuSingkat(l.created_at)}
                                </span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            <DialogForm
                key={ajukan ? "ajukan" : "ajukan-tertutup"}
                terbuka={ajukan}
                onTerbukaBerubah={setAjukan}
                judul="Ajukan Permintaan"
                keterangan="Setelah diajukan, daftar barangnya tidak bisa diubah lagi - permintaan dilayani utuh atau tidak sama sekali."
                aksi={ajukanPermintaan.bind(null, permintaan.id)}
                labelSimpan="Ajukan"
                labelMenyimpan="Mengajukan"
            >
                <BidangDialog
                    id="keperluan"
                    label="Keperluan"
                    defaultValue={permintaan.keperluan}
                    placeholder="Praktikum kelas 8 semester ganjil"
                    petunjuk="Dibaca tata usaha saat menimbang persetujuan."
                    required
                    autoFocus
                    maxLength={PANJANG_KEPERLUAN}
                />
                <BidangDialog
                    id="tanggal_dibutuhkan"
                    label="Tanggal Dibutuhkan (opsional)"
                    type="date"
                    min={tanggalHariIni()}
                    defaultValue={permintaan.tanggal_dibutuhkan ?? ""}
                />
                <BidangDialog
                    id="catatan_pemohon"
                    label="Catatan (opsional)"
                    defaultValue={permintaan.catatan_pemohon ?? ""}
                    placeholder="Diambil sore hari"
                    maxLength={PANJANG_CATATAN}
                />
            </DialogForm>

            <DialogForm
                key={kosongkan ? "kosongkan" : "kosongkan-tertutup"}
                terbuka={kosongkan}
                onTerbukaBerubah={setKosongkan}
                judul="Kosongkan keranjang?"
                keterangan="Seluruh barang di keranjang ini dikeluarkan dan keranjangnya ikut hilang. Barangnya bisa ditambahkan lagi dari katalog."
                aksi={kosongkanKeranjang.bind(null, permintaan.id)}
                labelSimpan="Kosongkan"
                labelMenyimpan="Mengosongkan"
                merusak
            />

            <DialogForm
                key={batalkan ? "batalkan" : "batalkan-tertutup"}
                terbuka={batalkan}
                onTerbukaBerubah={setBatalkan}
                judul="Batalkan permintaan ini?"
                keterangan="Permintaan yang dibatalkan tidak bisa diajukan lagi. Buat permintaan baru dari katalog kalau masih dibutuhkan."
                aksi={batalkanPermintaan.bind(null, permintaan.id)}
                labelSimpan="Batalkan"
                labelMenyimpan="Membatalkan"
                merusak
            />
        </div>
    );
}

function Keterangan({ permintaan }: { permintaan: BarisDetail }) {
    return (
        <dl className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <Baris label="Keperluan" nilai={permintaan.keperluan} />
            <Baris
                label="Tanggal dibutuhkan"
                nilai={
                    permintaan.tanggal_dibutuhkan
                        ? tanggalPanjang(permintaan.tanggal_dibutuhkan)
                        : "Tidak ditentukan"
                }
            />
            <Baris
                label="Diajukan"
                nilai={
                    permintaan.diajukan_at
                        ? tanggalPanjang(permintaan.diajukan_at)
                        : "—"
                }
            />
            {permintaan.catatan_pemohon && (
                <Baris label="Catatan" nilai={permintaan.catatan_pemohon} />
            )}
        </dl>
    );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
    return (
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground sm:w-40 sm:text-[13px]">
                {label}
            </dt>
            <dd className="text-[13px] leading-relaxed text-foreground">
                {nilai}
            </dd>
        </div>
    );
}
```

`Penyetel` is imported from `katalog-daftar.tsx`, not redefined here. Both files are `"use client"`, so the import crosses no boundary — and one definition means the two steppers cannot drift apart on what pressing minus at one does.

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev` and, as a pegawai:

1. Add two barang from `/katalog`, click "Lihat Keranjang". The detail page shows both with steppers and a "Kosongkan" button; the header reads "Keranjang" with a "Keranjang" badge.
2. Change a quantity here, then go back to `/katalog`. The stepper there shows the same number — one action, two pages.
3. Press `−` down to zero on **one** of two items: the row disappears and you stay on the page. Do it on the last remaining item: you land back on `/permintaan-saya` and the pinned draft card is gone.
4. Rebuild a cart, click "Ajukan Permintaan", leave Keperluan empty and submit. Expected: "Keperluan belum diisi." inside the dialog, which stays open.
5. Fill Keperluan, set Tanggal Dibutuhkan to yesterday. Expected: "Tanggal dibutuhkan tidak boleh sebelum hari ini."
6. Submit properly. Expected: the dialog closes, the page reloads as read-only with an `SPB-000xxx` number, a "Menunggu persetujuan" badge, a Keterangan block, a Riwayat list reading "Keranjang dibuat" then "Diajukan ke tata usaha", and a "Batalkan Permintaan" button. No steppers.
7. Cancel it. Expected: the badge becomes "Dibatalkan", the cancel button is gone, and the timeline gains "Dibatalkan pemohon".
8. Visit `/permintaan-saya/00000000-0000-0000-0000-000000000000` and `/permintaan-saya/bukan-uuid`. Expected: the 404 page both times, not a crash.
9. In another browser, sign in as a second pegawai and open the first pegawai's request URL. Expected: 404.

- [x] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/permintaan-saya"
git commit -m "feat: detail permintaan - sunting keranjang, ajukan, dan baca riwayatnya"
```

---

## Task 6: Beranda for pegawai

`RINGKASAN` in `beranda/page.tsx:9-24` currently holds three label arrays and a comment saying the numbers arrive in sub-projects 2–4. Tata usaha and pengurus keep their dashes; only the pegawai branch gains data, and the comment is updated to name the sub-projects that will fill the other two.

One select of `status` across the user's own requests, counted in JS — three `head: true` counts would be three round trips for numbers that fit in one — plus the five newest `permintaan_log` rows, phrased by `kalimatLog()`, the same helper the timeline uses.

**Files:**

- Modify: `src/app/(dashboard)/beranda/page.tsx` (whole file)

**Interfaces:**

- Consumes: `getUserOrRedirect`, `Role` (`@/lib/dal`); `createClient` (`@/lib/supabase/server`); `kalimatLog`, `waktuSingkat`, `StatusPermintaan` (`@/lib/permintaan`); `cn` (`@/lib/utils`).
- Produces: nothing other modules import.

- [x] **Step 1: Rewrite `src/app/(dashboard)/beranda/page.tsx`**

Replace the whole file with:

```tsx
import { getUserOrRedirect, type Role } from "@/lib/dal";
import {
    kalimatLog,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Beranda — SIPB SMPN 14",
};

// Angka pegawai terisi di sub-proyek 4. Angka tata usaha menyusul bersama
// halaman persetujuan di sub-proyek 5, angka pengurus barang bersama stok
// dan penerimaan di sub-proyek 6. Label dan tata letaknya sudah terpasang
// supaya kerangka ini yang tinggal diisi, bukan dirombak.
const RINGKASAN: Record<Role, string[]> = {
    pegawai: ["Permintaan Aktif", "Menunggu Persetujuan", "Siap Diambil"],
    tata_usaha: [
        "Menunggu Persetujuan",
        "Disetujui Bulan Ini",
        "Total Pengguna",
    ],
    pengurus_barang: [
        "Barang Kosong",
        "Siap Disiapkan",
        "Penerimaan Bulan Ini",
    ],
};

/** Permintaan yang masih berjalan - belum selesai, ditolak, atau dibatalkan. */
const AKTIF: StatusPermintaan[] = [
    "draft",
    "diajukan",
    "disetujui",
    "siap_diambil",
];

const WAKTU_JAKARTA = "Asia/Jakarta";

type Aktivitas = {
    id: string;
    status_ke: StatusPermintaan;
    created_at: string;
    permintaan: { nomor: string | null } | null;
};

const sapaan = (jam: number) => {
    if (jam < 11) return "Selamat pagi";
    if (jam < 15) return "Selamat siang";
    if (jam < 18) return "Selamat sore";
    return "Selamat malam";
};

/**
 * Satu select status untuk ketiga angka, dihitung di JavaScript. Tiga
 * count(head: true) akan jadi tiga perjalanan ke Supabase demi tiga angka
 * yang muat dalam satu jawaban.
 *
 * Log tidak perlu disaring per pemohon: policy baca_permintaan_log hanya
 * membuka log yang induknya boleh dibaca, dan fungsi ini hanya dipanggil
 * untuk peran pegawai.
 */
async function ringkasanPegawai(userId: string) {
    const supabase = await createClient();

    const [status, aktivitas] = await Promise.all([
        supabase.from("permintaan").select("status").eq("pemohon_id", userId),
        supabase
            .from("permintaan_log")
            .select("id, status_ke, created_at, permintaan ( nomor )")
            .order("created_at", { ascending: false })
            .limit(5),
    ]);

    if (status.error) {
        console.error("[beranda]", status.error.code, status.error.message);
    }

    const daftar = (status.data ?? []).map((r) => r.status as StatusPermintaan);

    return {
        angka: [
            daftar.filter((s) => AKTIF.includes(s)).length,
            daftar.filter((s) => s === "diajukan").length,
            daftar.filter((s) => s === "siap_diambil").length,
        ],
        aktivitas: (aktivitas.data ?? []) as unknown as Aktivitas[],
    };
}

export default async function BerandaPage() {
    // Sudah dibungkus cache(), jadi pemanggilan kedua dalam render pass yang
    // sama ini tidak menambah perjalanan ke Supabase.
    const user = await getUserOrRedirect();

    const ringkasan =
        user.role === "pegawai" ? await ringkasanPegawai(user.id) : null;

    const sekarang = new Date();
    const jam = Number(
        new Intl.DateTimeFormat("id-ID", {
            hour: "numeric",
            hour12: false,
            timeZone: WAKTU_JAKARTA,
        }).format(sekarang),
    );
    const tanggal = new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: WAKTU_JAKARTA,
    }).format(sekarang);

    const namaDepan = user.namaLengkap.split(" ")[0];

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-5 md:gap-6">
            <header>
                <h2 className="text-[17px] font-semibold text-foreground md:text-lg">
                    {sapaan(jam)}, {namaDepan}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground md:text-[13px]">
                    {tanggal}
                </p>
            </header>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
                {RINGKASAN[user.role].map((label, i) => {
                    const nilai = ringkasan?.angka[i] ?? null;
                    return (
                        <div
                            key={label}
                            className={cn(
                                "rounded-xl border border-border bg-card p-4 md:p-5",
                                i === 0 && "col-span-2 md:col-span-1",
                            )}
                        >
                            <p className="text-[11px] font-medium text-muted-foreground md:text-xs">
                                {label}
                            </p>
                            <p
                                className={cn(
                                    "mt-1.5 text-2xl font-bold md:mt-2 md:text-[28px]",
                                    nilai === null
                                        ? "text-muted-foreground/50"
                                        : "text-foreground",
                                )}
                            >
                                {nilai === null ? <>&mdash;</> : nilai}
                            </p>
                        </div>
                    );
                })}
            </div>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
                    Aktivitas Terbaru
                </h3>

                {ringkasan === null ? (
                    <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Belum ada aktivitas.
                        <br />
                        Riwayat permintaan dan penerimaan muncul di sini begitu
                        modulnya aktif.
                    </p>
                ) : ringkasan.aktivitas.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Belum ada aktivitas.
                        <br />
                        Riwayat permintaan Anda muncul di sini begitu keranjang
                        pertama dibuat.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {ringkasan.aktivitas.map((a) => (
                            <li
                                key={a.id}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 py-3"
                            >
                                <p className="text-[13px] text-foreground">
                                    {a.permintaan?.nomor && (
                                        <span className="font-mono">
                                            {a.permintaan.nomor} &middot;{" "}
                                        </span>
                                    )}
                                    {kalimatLog(a.status_ke)}
                                </p>
                                <span className="text-xs text-muted-foreground">
                                    {waktuSingkat(a.created_at)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
```

- [x] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev`:

1. As a pegawai with one submitted request and one draft, open `/beranda`. Expected: "Permintaan Aktif" reads 2, "Menunggu Persetujuan" reads 1, "Siap Diambil" reads 0, and all three are in full-strength text, not the grey dash.
2. "Aktivitas Terbaru" lists the newest log lines, newest first, each reading `SPB-000001 · Diajukan ke tata usaha` with a Jakarta timestamp. The draft's own line reads "Keranjang dibuat" with no number, since a draft has none.
3. As Tata Usaha and as Pengurus Barang, open `/beranda`. Expected: three grey em-dashes and the original "Riwayat permintaan dan penerimaan muncul di sini begitu modulnya aktif." paragraph — unchanged from before this task.
4. As a brand-new pegawai with no requests at all: three zeros, and "Riwayat permintaan Anda muncul di sini begitu keranjang pertama dibuat."

- [x] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/beranda/page.tsx"
git commit -m "feat: beranda pegawai menampilkan angka dan aktivitas permintaannya"
```

---

## Task 7: End-to-end verification

Nothing is written in this task; it is the gate that says the sub-project is done. If any check fails, fix it here and note what changed.

**Files:** none created or modified unless a check fails.

- [x] **Step 1: Run every automated check**

```bash
npm run db:test
npm run test:sandi
npm run lint
npx tsc --noEmit
npm run build
```

Expected: `db:test` ends `N lolos, 0 gagal`; `test:sandi` ends `6 lolos, 0 gagal`; ESLint and `tsc` print no errors; `next build` completes.

- [x] **Step 2: Apply the migration to the real project**

Run `supabase/migrations/20260901010000_permintaan-kosong.sql` against the Supabase project. Then, in the SQL editor, confirm the rule is live:

```sql
insert into public.permintaan (pemohon_id, keperluan, status)
values ('<uuid pegawai>', 'Uji', 'diajukan');
```

Expected: `ERROR: Permintaan kosong tidak bisa diajukan. Tambahkan barang dulu.` This duplicates Task 1's automated coverage on purpose — the migration must be applied to the real project, not only to PGlite.

- [x] **Step 3: Stock at least two barang**

Sign in as Pengurus Barang, or use the SQL editor, and make sure at least two barang have positive stock and at least one has zero. Without that, `/katalog` has nothing to add and nothing to grey out. (There is no `/penerimaan` page yet — that is sub-project 6 — so this is a SQL-editor step: insert a `penerimaan`, its `penerimaan_item` rows, then `select public.catat_penerimaan('<id>')`.)

- [x] **Step 4: The whole cart, start to finish**

As a pegawai: `/katalog` → add two barang → raise one to 3 → "Lihat Keranjang" → "Ajukan Permintaan" with a keperluan and a date → back to `/permintaan-saya`.

Expected: the request appears newest-first with an `SPB-` number, a "Menunggu persetujuan" badge, the right item count, and no pinned Keranjang card — the draft became the request.

- [x] **Step 5: The cart really is server-side**

With items in the cart, close the browser, reopen it, sign in again, and open `/katalog` on a phone-sized window (or a second browser).

Expected: the same steppers with the same numbers. The cart survived because it is a `permintaan` row, not `localStorage`.

- [x] **Step 6: The zero-stock refusal comes from the database**

Pick a barang that is currently in someone's cart, then drive its stock to zero from the SQL editor (`select public.catat_penyesuaian('<barang uuid>', 0, 'Uji habis')` as the pengurus barang account). Back on `/katalog`, press `+` on that row.

Expected: the red alert above the list reads `<nama barang> sedang kosong dan belum bisa diminta` — the trigger's own sentence, passed through verbatim by `pesanGalatPermintaan`. Not "Perubahan gagal disimpan."

- [x] **Step 7: Empty submission and the two-tab races**

- Open the draft's detail page in two tabs. Submit in tab A, then submit in tab B. Expected in tab B: "Permintaan ini sudah berpindah status. Muat ulang halamannya." The dialog stays open.
- With a draft open in two `/katalog` tabs, press "Tambah" on the same barang in both. Expected: no error in either; both settle on the same stepper after reload.
- Remove every item from a draft in tab A, then press a stepper in tab B. Expected: "Keranjang itu sudah tidak ada, atau isinya sudah berubah. Muat ulang halamannya."

- [x] **Step 8: No stock figure is reachable from a pegawai session**

With the browser devtools Network tab open, walk `/katalog`, `/permintaan-saya`, and a detail page. Search the RSC payloads for the word `stok`.

Expected: no numeric stock anywhere. `katalog_pemohon` has no numeric column at all, so this is structural — the check exists to catch a future `select` that reaches for `stok_barang` instead.

- [x] **Step 9: 375px pass**

At 375px width, walk `/katalog` (including the sticky cart bar and a stepper), `/permintaan-saya`, a draft detail page with all three dialogs, a submitted detail page with its timeline, and `/beranda`.

Expected: no horizontal scrolling anywhere, every stepper button reachable with a thumb, the sticky bar not covering the last list row's controls, and the date input usable.

- [x] **Step 10: Commit any fixes and finish**

```bash
git add -A
git commit -m "fix: perbaikan dari verifikasi menyeluruh permintaan pegawai"
```

If nothing needed fixing, there is nothing to commit — say so rather than making an empty commit.

---

## What this sub-project does NOT include

Carried from the spec, so no one adds it mid-plan:

- Editing a request after it is submitted. The schema forbids it — `susun_permintaan_item` scopes to `draft` for everyone, staff included — and all-or-nothing fulfilment is why: the item list is an agreement, not a draft that keeps moving.
- "Pesan lagi" — duplicating a past request into a new cart. Worth building once there is history to duplicate.
- Any notification when a request is approved, rejected, or ready. There is no mail or push channel in this project yet.
- Pagination on `/permintaan-saya`.
- A live cart badge on the nav item. It would mean threading a count through the dashboard layout into `AppShell` on every navigation; the cart announces itself where it is being filled instead.
- Naming the approver in the timeline. `baca_profil` lets a pegawai read only their own row, so the name is not reachable — and that is a deliberate limit, not a gap to work around with a view.
- Stock figures anywhere a pegawai can see them. Structurally impossible by way of `katalog_pemohon`, and it stays that way.
- `/persetujuan`, `/permintaan-masuk`, `/stok`, `/penerimaan`, `/penyesuaian` — sub-projects 5 and 6. Until 5 exists, a submitted request has nowhere to go, and that is expected.
