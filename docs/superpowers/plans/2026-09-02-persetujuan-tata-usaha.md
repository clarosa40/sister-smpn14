# Persetujuan Tata Usaha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/persetujuan` and `/persetujuan/[id]` plus the tata usaha third of `/beranda`, so a submitted request can finally be read, approved, or refused — and add the migration that freezes a submitted request's contents.

**Architecture:** Two server-rendered pages over machinery that already exists. `/persetujuan` is a `diajukan` queue with `?lihat=riwayat` as its second view, both server-rendered from one select; `/persetujuan/[id]` shows the item list with stock figures and two server actions (`setujuiPermintaan`, `tolakPermintaan`) that move the status and let `jaga_alur_permintaan()` stamp the rest. Three pieces move out of pegawai files into shared modules because a second role now needs them. One migration closes a hole: `keperluan`, `pemohon_id`, and the rest of a submitted request's header can currently be rewritten by anyone `ubah_permintaan` lets through, leaving no log line at all.

**Tech Stack:** Next.js 16.2.6 (App Router, Server Actions), React 19.2.4, `@supabase/ssr` 0.10.2 + `@supabase/supabase-js` 2.105.3, Postgres/Supabase with RLS, Tailwind 4 + shadcn (`radix-ui` 1.6.7), PGlite 0.5 for database tests.

**Spec:** `docs/superpowers/specs/2026-09-02-persetujuan-tata-usaha-design.md` — read it before starting. This plan argues from it; where the two disagree, the spec wins unless a deviation is listed below.

## Global Constraints

- **Bahasa Indonesia throughout, identifiers included.** File names, function names, variable names, comments, and every string that reaches a screen. Existing code is the reference for tone. Comments use `-`, never `—`; the em dash appears only in page titles (`"Persetujuan — SIPB SMPN 14"`) and in `&mdash;` placeholders.
- **Read the bundled docs before writing framework code.** `AGENTS.md` says this Next.js differs from training data. The relevant files are `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`.
- **Indentation:** 4 spaces in `src/**` (except `src/components/ui/**`, which is shadcn output at 2 spaces) and 2 spaces in `supabase/**/*.sql`. Match the file you are editing.
- **Migration filename:** `supabase/migrations/20260902010000_permintaan-beku.sql`, exactly. Filename order is load order in `alur.mjs:75-79`.
- **No new dependency, and no new UI test harness.** There is no zod, no react-hook-form, no toast library, and no `Textarea`, `AlertDialog`, or `Tabs` in `src/components/ui/`. Validate by hand in `actions.ts`; surface errors with `FormAlert`; hand-roll containers as `rounded-xl border border-border bg-card` divs.
- **Every server action re-checks its caller** with `await pastikanTataUsaha()` on its first line. The page that rendered the control is not a credential.
- **Every mutation is `.select()`-ed and its rows checked.** UPDATE and DELETE refused by RLS raise nothing at all — the rows simply vanish (`aksi.ts:74-77`). An action that checks only `error` reports a refusal as a success.
- **Raw error text goes to `console.error`, never to the screen**, except the `P0001` sentences the triggers wrote for a school administrator. `pesanGalatPermintaan()` (`lib/permintaan.ts:179`) is reused unchanged and already does exactly this.
- **The pegawai timeline stays unnamed.** `kalimatLog()` and `detail-permintaan.tsx`'s Riwayat section are not touched. Naming happens only on the tata usaha detail page, where `baca_profil` actually returns a name.
- **Verification commands** (all must pass before a task is done): `npm run db:test`, `npm run lint`, `npx tsc --noEmit`.
- **Commits:** the subject line is given in each task's commit step. Append whatever attribution trailer your session is instructed to use; do not invent one.

## Deviations from the spec

These are deliberate; each is small and reasoned. Do not silently add others.

1. **`Pencarian` gains a three-line change so `jalur` may already carry a query string.** The spec says it is reused unchanged. It cannot be: `pencarian.tsx:42` concatenates `${jalur}?cari=...`, so `jalur="/persetujuan?lihat=riwayat"` would produce a second `?`, and clearing the box navigates to the bare `jalur`, which for `jalur="/persetujuan"` would drop the reader out of Riwayat and back into the queue. Choosing `&` when `jalur` already contains `?` fixes both, and the three existing call sites (`barang-tabel.tsx`, `pengguna-tabel.tsx`, `katalog-daftar.tsx`) pass paths with no query string, so their behaviour is byte-identical.
2. **`PELAKU_LOG` is module-private**, exactly like `KALIMAT_LOG` beside it. Only `kalimatLogBernama()` is exported; nothing outside `lib/permintaan.ts` needs the bare participles, and one exported door per vocabulary is the file's existing shape.
3. **Beranda's three tata usaha numbers are three `head: true` counts inside one `Promise.all`, not one select counted in JavaScript.** `ringkasanPegawai` counts in JS and says why (`beranda/page.tsx:57-61`), but that reasoning does not carry: its three numbers come from one table under one filter. These three come from two tables and a date boundary, so folding them is not possible. `Promise.all` keeps them one round trip's worth of waiting, which is what the original comment was actually protecting.
4. **`stok_barang` is queried even when the item list would be empty.** The spec keys the query to the item ids; `.in("barang_id", [])` is legal PostgREST and returns zero rows, and an item-less `diajukan` request cannot exist anyway since `20260901010000_permintaan-kosong.sql`. Skipping the call conditionally would give the two branches different types for no gain.
5. **The queue's own page renders `Paginasi`, and `DaftarPersetujuan` renders the tabs and the search box.** The spec lists the files but not the split. This mirrors `master-barang/page.tsx:85-100` exactly: the list component owns its header controls, the page owns pagination because only the page knows `count`.

---

## Task 1: Migration — a submitted request's contents are frozen

Sub-project 4's spec claimed _"Editing a request after it is submitted — the schema forbids it."_ It forbids editing the **items**: `susun_permintaan_item` (`rls.sql:139-158`) narrows to `status = 'draft'` for everyone. Nothing guards the header. `ubah_permintaan` (`rls.sql:111`, amended `20260830010000_pengguna.sql:40`) opens every column of every request to `is_staf()`, and `jaga_alur_permintaan()` returns early when the status is unchanged (`20260901010000_permintaan-kosong.sql:67-69`). Behind that early return, a tata usaha can rewrite someone's `keperluan` — or their `pemohon_id` — and `catat_log_permintaan()` writes nothing, because it only fires on a status change (`fungsi.sql:374`). A pegawai can do the same to their own `diajukan` request.

This is the sub-project that puts a second person in front of that row, so the claim gets made true here.

The new block goes **after `new.updated_at := now();` and before the `if new.status = old.status then return new; end if;` early return.** Two exceptions are deliberate: `old.status = 'draft'` is left alone (that is where the cart is filled, and where `ajukanPermintaan` writes `keperluan`, `tanggal_dibutuhkan`, `catatan_pemohon`, and `status` in one UPDATE), and `alasan_tolak` may ride the move into `ditolak` — `alasan_tolak_wajib` (`skema.sql:117`) demands it be written in the same statement — but may not be rewritten later on a row whose status is standing still.

Checked against every UPDATE that exists: `alur.mjs:971` and `:1010` edit a draft; `:1184` and `:1281` ride `draft → diajukan`; `:504` writes `alasan_tolak` on the move into `ditolak`; `siapkan_permintaan()` (`fungsi.sql:486`) sets `status` alone. None of them break.

**Files:**

- Create: `supabase/migrations/20260902010000_permintaan-beku.sql`
- Modify: `supabase/tests/alur.mjs` — a new section appended at the end, before the two summary lines at `:1364-1365`

**Interfaces:**

- Consumes: nothing.
- Produces: `public.jaga_alur_permintaan()` additionally raises `P0001` with `Isi permintaan yang sudah diajukan tidak bisa diubah lagi.` when a non-draft row's `pemohon_id`, `unit_kerja_id`, `keperluan`, `tanggal_dibutuhkan`, or `catatan_pemohon` changes, and `P0001` with `Alasan penolakan hanya bisa ditulis saat permintaan ditolak.` when `alasan_tolak` changes outside the move into `ditolak`.

- [ ] **Step 1: Write the failing assertions**

Append this section to `supabase/tests/alur.mjs`, immediately **before** the final two lines (`console.log(\`\n${pass} lolos, ${fail} gagal\`);`and`await db.close();`). It reuses `TU`, `PGR`, `PGW`, `pel`, `as`, `ok`, and `expectError` already defined in the file.

```js
// Bagian terakhir, seperti dua bagian sebelumnya: di sini permintaan
// baru terbit lalu diputuskan tata usaha - keduanya hal yang dihitung
// persis oleh pemeriksaan di bagian pengguna di atas.
console.log("\n— persetujuan tata usaha —");

/**
 * Keranjang berisi satu barang, lalu diajukan - persis jalur yang
 * ditempuh ajukanPermintaan: keperluan dan status ditulis dalam satu
 * UPDATE. Itu sekaligus penjaga regresi untuk migrasi pembekuan, sebab
 * UPDATE itulah yang paling mirip dengan yang dilarangnya.
 */
const ajukanBaru = async (keperluan, barangId) => {
    await db.query(`insert into public.permintaan (keperluan) values ('')`);
    const id = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    await db.query(
        `insert into public.permintaan_item (permintaan_id, barang_id, jumlah_diminta)
         values ($1, $2, 2)`,
        [id, barangId],
    );
    await db.query(
        `update public.permintaan set status = 'diajukan', keperluan = $1 where id = $2`,
        [keperluan, id],
    );
    return id;
};

let permF, permG;
await as(PGW, async () => {
    permF = await ajukanBaru("Kain pel untuk ruang guru", pel);
    permG = await ajukanBaru("Kain pel untuk lab IPA", pel);

    const p = (
        await db.query(
            `select status, keperluan from public.permintaan where id = '${permF}'`,
        )
    ).rows[0];
    ok(
        "draft -> diajukan yang menulis keperluan sekalian tetap lolos",
        p.status === "diajukan" && p.keperluan === "Kain pel untuk ruang guru",
        JSON.stringify(p),
    );
});

await as(TU, async () => {
    await expectError(
        "tata usaha tidak bisa menulis ulang keperluan permintaan yang sudah diajukan",
        () =>
            db.query(
                `update public.permintaan set keperluan = 'Diubah tata usaha' where id = '${permF}'`,
            ),
        "tidak bisa diubah lagi",
    );

    await expectError(
        "alasan penolakan tidak bisa ditulis pada baris yang statusnya diam",
        () =>
            db.query(
                `update public.permintaan set alasan_tolak = 'Ditulis diam-diam' where id = '${permF}'`,
            ),
        "hanya bisa ditulis saat permintaan ditolak",
    );

    // Nama pemohon terjangkau tata usaha - inilah yang membuat garis
    // waktu di halaman keputusan bisa menyebut orang, bukan cuma status.
    const nama = (
        await db.query(
            `select pr.nama_lengkap from public.permintaan p
             join public.profil pr on pr.id = p.pemohon_id where p.id = '${permG}'`,
        )
    ).rows;
    ok(
        "tata usaha ikut membaca nama pemohon permintaan orang lain",
        nama.length === 1 && typeof nama[0].nama_lengkap === "string",
        JSON.stringify(nama),
    );

    // Halaman keputusan menaruh angka ini di samping jumlah yang diminta.
    const stok = (
        await db.query(
            `select barang_id, stok from public.stok_barang where barang_id = '${pel}'`,
        )
    ).rows;
    ok(
        "tata usaha membaca angka stok lewat stok_barang",
        stok.length === 1 && Number(stok[0].stok) > 0,
        JSON.stringify(stok),
    );
});

await as(PGW, async () => {
    await expectError(
        "pemohon pun tidak bisa mengubah isi permintaannya setelah diajukan",
        () =>
            db.query(
                `update public.permintaan set tanggal_dibutuhkan = current_date + 7
                 where id = '${permF}'`,
            ),
        "tidak bisa diubah lagi",
    );

    // Draft tetap bebas disunting - di situlah keranjang sedang diisi.
    await db.query(`insert into public.permintaan (keperluan) values ('')`);
    const draft = (
        await db.query(
            `select id from public.permintaan where keperluan = '' and status = 'draft'
             order by created_at desc limit 1`,
        )
    ).rows[0].id;
    const u = await db.query(
        `update public.permintaan set keperluan = 'Masih keranjang' where id = '${draft}'`,
    );
    ok(
        "isi draft masih bebas diubah",
        u.affectedRows === 1,
        `(${u.affectedRows} baris)`,
    );

    await expectError(
        "pemohon tidak bisa menyetujui permintaannya sendiri",
        () =>
            db.query(
                `update public.permintaan set status = 'disetujui' where id = '${permF}'`,
            ),
        "hanya tata usaha",
    );
});

await as(PGR, async () => {
    await expectError(
        "pengurus barang tidak bisa menyetujui permintaan",
        () =>
            db.query(
                `update public.permintaan set status = 'disetujui' where id = '${permF}'`,
            ),
        "hanya tata usaha",
    );
});

await as(TU, async () => {
    await db.query(
        `update public.permintaan set status = 'disetujui' where id = '${permF}'`,
    );
    const p = (
        await db.query(
            `select status, disetujui_at, disetujui_oleh from public.permintaan
             where id = '${permF}'`,
        )
    ).rows[0];
    ok(
        "tata usaha menyetujui - stempel waktu dan namanya terisi sendiri",
        p.status === "disetujui" &&
            p.disetujui_at !== null &&
            p.disetujui_oleh === TU,
        JSON.stringify(p),
    );

    const log = (
        await db.query(
            `select oleh from public.permintaan_log
             where permintaan_id = $1 and status_ke = 'disetujui'`,
            [permF],
        )
    ).rows;
    ok(
        "persetujuan meninggalkan satu baris log atas nama tata usaha",
        log.length === 1 && log[0].oleh === TU,
        JSON.stringify(log),
    );

    await expectError(
        "penolakan tanpa alasan ditolak constraint",
        () =>
            db.query(
                `update public.permintaan set status = 'ditolak' where id = '${permG}'`,
            ),
        "alasan_tolak_wajib",
    );

    await db.query(
        `update public.permintaan set status = 'ditolak', alasan_tolak = $1 where id = $2`,
        ["Kain pel baru saja habis, tunggu penerimaan berikutnya", permG],
    );
    const g = (
        await db.query(
            `select status, alasan_tolak from public.permintaan where id = '${permG}'`,
        )
    ).rows[0];
    ok(
        "penolakan yang membawa alasannya sekalian diterima",
        g.status === "ditolak" && /baru saja habis/.test(g.alasan_tolak),
        JSON.stringify(g),
    );

    const logTolak = (
        await db.query(
            `select catatan from public.permintaan_log
             where permintaan_id = $1 and status_ke = 'ditolak'`,
            [permG],
        )
    ).rows[0];
    ok(
        "alasan penolakan ikut turun ke log",
        /baru saja habis/.test(logTolak.catatan ?? ""),
        JSON.stringify(logTolak),
    );

    // disetujui -> ditolak: stok yang tak kunjung datang masih bisa
    // membatalkan persetujuan yang sudah terlanjur diberikan.
    await db.query(
        `update public.permintaan set status = 'ditolak', alasan_tolak = $1 where id = $2`,
        ["Stok tak kunjung ada sampai akhir bulan", permF],
    );
    const f = (
        await db.query(
            `select status from public.permintaan where id = '${permF}'`,
        )
    ).rows[0];
    ok(
        "permintaan yang sudah disetujui masih bisa ditolak tata usaha",
        f.status === "ditolak",
        f.status,
    );
});
```

- [ ] **Step 2: Run the tests to verify the new section fails**

Run: `npm run db:test`

Expected: the run ends with a non-zero `gagal` count, and exactly these three lines are `FAIL`:

```
  FAIL  tata usaha tidak bisa menulis ulang keperluan permintaan yang sudah diajukan — tidak ada error sama sekali
  FAIL  alasan penolakan tidak bisa ditulis pada baris yang statusnya diam — tidak ada error sama sekali
  FAIL  pemohon pun tidak bisa mengubah isi permintaannya setelah diajukan — tidak ada error sama sekali
```

Everything else in the section passes already — approval, the role refusals, the rejection constraint, and `disetujui → ditolak` are machinery `alur.mjs` and the existing triggers already provide. Those assertions are here because this sub-project is the first code to depend on them, not because they are new behaviour. If any of _them_ fails, stop: something is wrong beyond this task.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260902010000_permintaan-beku.sql`. This is the whole function again — Postgres has no way to patch one — with the new block inserted between `new.updated_at := now();` and the `new.status = old.status` early return.

```sql
-- =============================================================
-- SIPB SMPN 14 - Isi permintaan beku setelah diajukan
--
-- Spesifikasi sub-proyek 4 menyatakan permintaan yang sudah diajukan
-- tidak bisa diubah lagi. Yang benar-benar dijaga baru daftar
-- barangnya: policy susun_permintaan_item menyempit ke status draft.
-- Kepala permintaannya tidak dijaga siapa pun. ubah_permintaan
-- membuka seluruh kolom untuk is_staf(), dan jaga_alur_permintaan()
-- pulang lebih dulu ketika statusnya tidak berubah - jadi keperluan,
-- pemohon_id, atau tanggal_dibutuhkan bisa ditulis ulang tanpa
-- meninggalkan jejak sama sekali, sebab catat_log_permintaan() hanya
-- menulis baris saat status berpindah.
--
-- Sub-proyek inilah yang menaruh orang kedua di depan baris itu, jadi
-- pernyataan tadi dibuat benar di sini. Bloknya diletakkan sebelum
-- "pulang lebih dulu" tersebut: justru di balik pulang itulah
-- suntingan diam-diam lolos selama ini.
--
-- Dua pengecualiannya disengaja:
--
--   old.status = 'draft' dibiarkan bebas. Di situ keranjang diisi, dan
--   di situ pula ajukanPermintaan menulis keperluan,
--   tanggal_dibutuhkan, catatan_pemohon, dan status dalam satu UPDATE.
--
--   alasan_tolak boleh menumpang perpindahan menuju 'ditolak', sebab
--   constraint alasan_tolak_wajib memang menuntutnya ditulis dalam
--   pernyataan yang sama. Yang dilarang adalah menulis ulang alasan
--   itu belakangan, pada baris yang statusnya sedang diam.
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

  -- Isi permintaan beku begitu ia keluar dari draft. Pemeriksaan ini
  -- harus berada di atas "pulang lebih dulu" di bawahnya: suntingan
  -- diam-diam justru yang statusnya tidak berpindah.
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
  'Mesin status permintaan. Selain transisi dan peran, ia menjaga tiga hal yang tidak bisa dijaga constraint: permintaan yang diajukan harus punya barang, siap_diambil harus sudah punya mutasi keluar, dan isi permintaan yang sudah keluar dari draft tidak bisa ditulis ulang lagi.';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run db:test`

Expected: the run ends `N lolos, 0 gagal`.

- [ ] **Step 5: Check the sandbox still boots**

Run: `npm run db:sandbox` and type `\q` at the prompt (or pipe: `echo "\q" | npm run db:sandbox`).

Expected: it loads every migration and reaches the prompt without an error. `sandbox.mjs:105-115` walks a request through the whole flow on startup; if the new guard were too wide, it would fail here.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902010000_permintaan-beku.sql supabase/tests/alur.mjs
git commit -m "feat: isi permintaan yang sudah diajukan tidak bisa ditulis ulang"
```

---

## Task 2: Shared pieces — three extractions and one vocabulary

Nothing in this task is new behaviour; it is the groundwork Tasks 3–4 stand on, and it is verified by the existing pages still rendering exactly as before.

Three things move, each paid for by a second consumer inside this sub-project:

- `LencanaStatus` lives in a pegawai page (`permintaan-saya/daftar-permintaan.tsx:26`) and `Baris` inside a pegawai component (`[id]/detail-permintaan.tsx:343`). A tata usaha page reaching into a pegawai page for them would be the wrong dependency. Both move to `src/components/permintaan-parts.tsx`, echoing `components/form-parts.tsx`. **Neither file gets `"use client"`** — they hold no hooks, and a client component that imports them bundles them as client code anyway, while a server page that imports them ships no JavaScript for them.
- `Paginasi` is private to `master-barang/page.tsx:105`, with the noun "barang" hardcoded and `alamatDaftar` closed over. Both become props.
- `PELAKU_LOG`, `kalimatLogBernama()`, and `PANJANG_ALASAN` join `lib/permintaan.ts`.

**Files:**

- Create: `src/components/permintaan-parts.tsx`
- Create: `src/components/admin/paginasi.tsx`
- Modify: `src/lib/permintaan.ts` (append to the existing sections)
- Modify: `src/components/admin/pencarian.tsx:35-47` (the `jalankan` callback)
- Modify: `src/app/(dashboard)/permintaan-saya/daftar-permintaan.tsx` (imports; delete `LencanaStatus`)
- Modify: `src/app/(dashboard)/permintaan-saya/[id]/detail-permintaan.tsx` (imports; delete `Baris`)
- Modify: `src/app/(dashboard)/master-barang/page.tsx` (imports; delete `Paginasi` and `TautanHalaman`)
- Modify: `src/app/(dashboard)/permintaan-saya/page.tsx:14` (one comment line that names the old home of `Paginasi`)

**Do not touch `pengguna-tabel.tsx:338`.** It has a module-private `LencanaStatus({ akun })` that is a different component wearing the same name — it renders "Aktif"/"Nonaktif" for an account, not a request status. Merging the two would be wrong.

**Interfaces:**

- Consumes: `LABEL_STATUS`, `NADA_STATUS`, `StatusPermintaan` (`@/lib/permintaan`); `Badge` (`@/components/ui/badge`); `cn` (`@/lib/utils`).
- Produces:
    1. From `@/components/permintaan-parts`: `LencanaStatus({ status }: { status: StatusPermintaan })` and `BarisKeterangan({ label, nilai }: { label: string; nilai: string })`.
    2. From `@/components/admin/paginasi`: `Paginasi({ halaman, jumlahHalaman, dari, ditampilkan, total, satuan, href }: { halaman: number; jumlahHalaman: number; dari: number; ditampilkan: number; total: number; satuan: string; href: (halaman: number) => string })`.
    3. From `@/lib/permintaan`: `kalimatLogBernama(status: StatusPermintaan, nama: string | null | undefined): string` and `PANJANG_ALASAN = 500`.

- [ ] **Step 1: Add the naming vocabulary to `src/lib/permintaan.ts`**

Insert this **directly after** the `kalimatLog` export (currently `lib/permintaan.ts:73-74`), before the `MAKS_JUMLAH` block:

```ts
/**
 * Pelaku setiap status sebagai partisip telanjang, tanpa menyebut siapa.
 * Pasangannya kalimatLogBernama() yang menyambungnya dengan "oleh" dan
 * sebuah nama - dan sambungan itu terbaca benar untuk ketujuhnya:
 * "Keranjang dibuat oleh Sari Wijaya", "Ditolak oleh Budi Santoso".
 *
 * Ada dua catatan status di berkas ini, dan itu disengaja. KALIMAT_LOG
 * dipakai di layar pegawai, tempat nama penyetuju memang tidak
 * terjangkau (policy baca_profil). PELAKU_LOG dipakai di layar tata
 * usaha, tempat nama itu justru inti persoalannya: dengan dua akun tata
 * usaha, "Disetujui tata usaha" tidak menjawab apa pun.
 */
const PELAKU_LOG: Record<StatusPermintaan, string> = {
    draft: "Keranjang dibuat",
    diajukan: "Diajukan",
    disetujui: "Disetujui",
    siap_diambil: "Barang disiapkan",
    selesai: "Barang diserahkan",
    ditolak: "Ditolak",
    dibatalkan: "Dibatalkan",
};

/**
 * Nama kosong jatuh ke kalimatLog(), bukan ke "oleh —". Baris log yang
 * penulisnya sudah dihapus (permintaan_log.oleh adalah on delete set
 * null) karena itu tetap terbaca, dan kedua penyusun kalimat ini tidak
 * pernah bisa berselisih tentang baris yang sama.
 */
export const kalimatLogBernama = (
    status: StatusPermintaan,
    nama: string | null | undefined,
): string => (nama ? `${PELAKU_LOG[status]} oleh ${nama}` : kalimatLog(status));
```

Then add `PANJANG_ALASAN` to the limits block, directly under `PANJANG_CATATAN` (`lib/permintaan.ts:79`):

```ts
export const PANJANG_ALASAN = 500;
```

- [ ] **Step 2: Write `src/components/permintaan-parts.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import {
    LABEL_STATUS,
    NADA_STATUS,
    type StatusPermintaan,
} from "@/lib/permintaan";

/**
 * Potongan tampilan permintaan yang dipakai dua peran. Keduanya lahir di
 * halaman pegawai dan pindah ke sini begitu halaman persetujuan ikut
 * memakainya - halaman tata usaha yang mengimpor dari halaman pegawai
 * akan jadi ketergantungan yang salah arah.
 *
 * Sengaja tanpa "use client". Tidak ada hook di sini, jadi komponen
 * server bisa memakainya tanpa mengirim JavaScript apa pun, sementara
 * komponen klien yang mengimpornya tetap membundelnya seperti biasa.
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

/** Satu baris <dt>/<dd> di kartu keterangan permintaan. */
export function BarisKeterangan({
    label,
    nilai,
}: {
    label: string;
    nilai: string;
}) {
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

- [ ] **Step 3: Point the two pegawai files at it**

In `src/app/(dashboard)/permintaan-saya/daftar-permintaan.tsx`: delete the `LencanaStatus` function (lines 21-36) and replace the top imports so `Badge`, `LABEL_STATUS`, and `NADA_STATUS` are no longer imported — leaving them would fail lint as unused. The file's import block becomes:

```tsx
import { LencanaStatus } from "@/components/permintaan-parts";
import {
    tanggalPanjang,
    type Draft,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { ChevronRight, ShoppingCart } from "lucide-react";
import Link from "next/link";
```

Nothing else in that file changes; `<LencanaStatus status={p.status} />` still resolves.

In `src/app/(dashboard)/permintaan-saya/[id]/detail-permintaan.tsx`: replace `import { LencanaStatus } from "../daftar-permintaan";` (line 21) with

```tsx
import { BarisKeterangan, LencanaStatus } from "@/components/permintaan-parts";
```

delete the local `Baris` function (lines 343-354), and rename its four call sites inside `Keterangan` from `<Baris ... />` to `<BarisKeterangan ... />`.

- [ ] **Step 4: Write `src/components/admin/paginasi.tsx`**

```tsx
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Ringkasan "menampilkan x-y dari N" berikut tombol maju-mundurnya.
 *
 * Lahir sebagai bagian dalam master-barang/page.tsx dan pindah ke sini
 * begitu Riwayat persetujuan ikut memakainya. Dua hal yang dulu dipatri
 * - kata benda yang dihitung dan alamat halaman tetangga - kini datang
 * sebagai prop, sebab keduanya berbeda di setiap pemakainya.
 *
 * Tanpa "use client", dan prop href sengaja sebuah fungsi: berkas ini
 * hanya pernah dirender di server, jadi fungsi itu tidak pernah
 * menyeberangi batas serialisasi. Jangan mengimpornya dari komponen
 * klien.
 */
export function Paginasi({
    halaman,
    jumlahHalaman,
    dari,
    ditampilkan,
    total,
    satuan,
    href,
}: {
    halaman: number;
    jumlahHalaman: number;
    /** Indeks baris pertama halaman ini, dihitung dari 0. */
    dari: number;
    ditampilkan: number;
    total: number;
    /** Kata benda yang dihitung: "barang", "permintaan". */
    satuan: string;
    href: (halaman: number) => string;
}) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>
                Menampilkan {dari + 1}–{dari + ditampilkan} dari {total}{" "}
                {satuan}
            </p>

            {jumlahHalaman > 1 && (
                <div className="flex shrink-0 items-center gap-1.5">
                    <TautanHalaman href={href(halaman - 1)} aktif={halaman > 1}>
                        Sebelumnya
                    </TautanHalaman>
                    <span className="px-1 tabular-nums">
                        {halaman} / {jumlahHalaman}
                    </span>
                    <TautanHalaman
                        href={href(halaman + 1)}
                        aktif={halaman < jumlahHalaman}
                    >
                        Berikutnya
                    </TautanHalaman>
                </div>
            )}
        </div>
    );
}

function TautanHalaman({
    href,
    aktif,
    children,
}: {
    href: string;
    aktif: boolean;
    children: React.ReactNode;
}) {
    const kelas =
        "rounded-md border border-border px-2.5 py-1.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

    // Batas daftar disajikan sebagai teks mati, bukan tautan yang tidak
    // menuju ke mana-mana: pembaca layar ikut tahu tombolnya memang habis.
    if (!aktif) {
        return (
            <span aria-disabled className={cn(kelas, "opacity-40")}>
                {children}
            </span>
        );
    }

    return (
        <Link
            href={href}
            scroll={false}
            className={cn(kelas, "hover:bg-muted hover:text-foreground")}
        >
            {children}
        </Link>
    );
}
```

- [ ] **Step 5: Point `master-barang` at it**

In `src/app/(dashboard)/master-barang/page.tsx`, delete both local functions (`Paginasi` at lines 105-147 and `TautanHalaman` at 149-179), then fix the import block — `cn` and `Link` were only used by those two, so leaving them fails lint:

```tsx
import { Paginasi } from "@/components/admin/paginasi";
import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarangTabel, type BarisBarang } from "./barang-tabel";
```

and change the call site (lines 91-100) to pass the two new props:

```tsx
{
    total > 0 && (
        <Paginasi
            halaman={halaman}
            jumlahHalaman={jumlahHalaman}
            dari={dari}
            ditampilkan={daftar.data?.length ?? 0}
            total={total}
            satuan="barang"
            href={(h) => alamatDaftar(cari, h)}
        />
    );
}
```

`alamatDaftar` (lines 16-22) stays exactly where it is — it is still the only thing that knows about `?cari=`.

- [ ] **Step 6: Let `Pencarian` keep a query string it was handed**

In `src/components/admin/pencarian.tsx`, replace the `jalankan` callback (lines 35-47) with:

```tsx
const jalankan = React.useCallback(
    (kata: string) => {
        const bersih = kata.trim();
        // `hal` sengaja tidak dibawa: hasil pencarian baru selalu mulai
        // dari halaman pertama. Berpindah kata kunci sambil tetap di
        // halaman 4 hampir selalu berarti mendarat di daftar kosong.
        //
        // `jalur` boleh sudah membawa kuerinya sendiri - Riwayat
        // persetujuan memakainya untuk mempertahankan ?lihat=riwayat,
        // baik saat kata kunci ditulis maupun saat dikosongkan.
        const pemisah = jalur.includes("?") ? "&" : "?";
        router.replace(
            bersih
                ? `${jalur}${pemisah}cari=${encodeURIComponent(bersih)}`
                : jalur,
            { scroll: false },
        );
    },
    [router, jalur],
);
```

Also update the `jalur` prop's doc comment (line 26) so it stops promising a bare path:

```tsx
/** Alamat halaman pemakainya, mis. "/master-barang" - boleh berkueri. */
```

- [ ] **Step 7: Fix the one comment that now points at nothing**

`permintaan-saya/page.tsx:11-15` tells a future reader where the pagination pattern lives. It just moved. Replace that docblock's last line so the pointer still lands:

```tsx
/**
 * Tanpa paginasi, dengan sengaja: seorang pegawai mengajukan puluhan
 * permintaan, bukan ribuan. Kalau kelak daftarnya tumbuh melewati itu,
 * Paginasi di components/admin/paginasi.tsx adalah polanya.
 */
```

The two similar comments in `katalog/page.tsx:12-15` and `pengguna/page.tsx:14-19` point at "penanganan PGRST103 di master-barang", which did not move. Leave them alone.

- [ ] **Step 8: Verify nothing regressed**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors. In particular, no "is defined but never used" for `cn`, `Link`, `Badge`, `LABEL_STATUS`, or `NADA_STATUS`.

Then run `npm run dev` and confirm the three pages that just changed are untouched to the eye:

1. As tata usaha, `/master-barang` with more than 25 barang: the "Menampilkan 1–25 dari N barang" line and both page buttons work exactly as before, and typing in the search box still lands on `/master-barang?cari=...`.
2. As a pegawai, `/permintaan-saya`: status badges render unchanged.
3. As a pegawai, a submitted request's detail page: the Keterangan card still shows Keperluan / Tanggal dibutuhkan / Diajukan / Catatan in the same layout.
4. As tata usaha, `/pengguna`: the Aktif/Nonaktif badges are untouched — that page has its own same-named component, and this task must not have reached it.

- [ ] **Step 9: Commit**

```bash
git add src/components/permintaan-parts.tsx src/components/admin/paginasi.tsx src/components/admin/pencarian.tsx src/lib/permintaan.ts "src/app/(dashboard)/master-barang/page.tsx" "src/app/(dashboard)/permintaan-saya"
git commit -m "refactor: angkat lencana status, baris keterangan, dan paginasi ke komponen bersama"
```

---

## Task 3: `/persetujuan` — the queue, and Riwayat as its second view

The default view is `status = 'diajukan'` only: a working queue with a bottom, whose empty state means "done for today" rather than "nothing here". It is ordered oldest-first, because a queue is served in the order it arrived, and it is not paginated, because it drains. `?lihat=riwayat` is every decided request, newest first, 25 per page, searchable by `nomor` and `keperluan`.

The tab is a pair of server-rendered `<Link>`s rather than client state, for the reason `Pencarian` writes its keyword to the URL: the server keeps the data, and no copy in the browser can go stale.

Drafts are excluded in the query, not by RLS. `baca_permintaan` is scoped by `is_staf()`, not by status, so someone else's unsubmitted cart _would_ be returned. `.eq("status", "diajukan")` excludes it on the queue and `.not("status", "in", ...)` excludes it in Riwayat.

Pemohon name is deliberately **not** searchable. PostgREST's `referencedTable` filters the embedded resource rather than the parent row, so searching a name would blank the embed instead of dropping the row. Making it work needs a flattening view, which is not worth a migration yet — so the placeholder claims only what the box does.

**Files:**

- Create: `src/app/(dashboard)/persetujuan/page.tsx`
- Create: `src/app/(dashboard)/persetujuan/daftar-persetujuan.tsx`

**Interfaces:**

- Consumes: `pastikanTataUsaha`, `siapkanKataKunci` (`@/lib/aksi`); `createClient` (`@/lib/supabase/server`); `Paginasi` (`@/components/admin/paginasi`); `Pencarian` (`@/components/admin/pencarian`); `LencanaStatus` (`@/components/permintaan-parts`); `tanggalPanjang`, `StatusPermintaan` (`@/lib/permintaan`); `cn` (`@/lib/utils`).
- Produces, from `./daftar-persetujuan`:
    1. `type BarisPersetujuan = { id: string; nomor: string | null; status: StatusPermintaan; keperluan: string; tanggal_dibutuhkan: string | null; diajukan_at: string | null; pemohon: { nama_lengkap: string } | null; unit_kerja: { nama: string } | null; permintaan_item: { id: string }[] }`
    2. `DaftarPersetujuan({ baris, riwayat, cari }: { baris: BarisPersetujuan[]; riwayat: boolean; cari: string })`

- [ ] **Step 1: Write the list component**

Create `src/app/(dashboard)/persetujuan/daftar-persetujuan.tsx`:

```tsx
import { Pencarian } from "@/components/admin/pencarian";
import { LencanaStatus } from "@/components/permintaan-parts";
import { tanggalPanjang, type StatusPermintaan } from "@/lib/permintaan";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type BarisPersetujuan = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    diajukan_at: string | null;
    pemohon: { nama_lengkap: string } | null;
    unit_kerja: { nama: string } | null;
    permintaan_item: { id: string }[];
};

const JALUR_ANTREAN = "/persetujuan";
const JALUR_RIWAYAT = "/persetujuan?lihat=riwayat";

/**
 * Tanpa "use client", dan tabnya sepasang <Link> biasa - bukan state.
 * Alasannya sama dengan alasan Pencarian menulis kata kuncinya ke URL:
 * datanya tetap dipegang server, jadi tidak ada salinan di peramban yang
 * bisa basi, dan tampilan yang sedang dibuka bisa ditautkan apa adanya.
 */
export function DaftarPersetujuan({
    baris,
    riwayat,
    cari,
}: {
    baris: BarisPersetujuan[];
    riwayat: boolean;
    cari: string;
}) {
    const kosong = !riwayat
        ? "Tidak ada permintaan yang menunggu persetujuan. Semuanya sudah diputuskan."
        : cari
          ? `Tidak ada permintaan yang cocok dengan “${cari}”.`
          : "Belum ada permintaan yang sudah diputuskan.";

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
                <nav
                    aria-label="Tampilan permintaan"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card p-1"
                >
                    <TautanLihat href={JALUR_ANTREAN} aktif={!riwayat}>
                        Menunggu
                    </TautanLihat>
                    <TautanLihat href={JALUR_RIWAYAT} aktif={riwayat}>
                        Riwayat
                    </TautanLihat>
                </nav>

                {/* Nama pemohon sengaja di luar jangkauan kotak ini: filter
                    PostgREST atas tabel tersemat menyaring tersematnya, bukan
                    baris induknya, jadi mencari nama akan mengosongkan kolom
                    pemohon alih-alih menyisihkan barisnya. Placeholder-nya
                    karena itu hanya menjanjikan yang benar-benar bisa. */}
                {riwayat && (
                    <Pencarian
                        awal={cari}
                        jalur={JALUR_RIWAYAT}
                        placeholder="Cari nomor atau keperluan"
                        ariaLabel="Cari permintaan"
                    />
                )}
            </div>

            {baris.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-5 py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
                    {kosong}
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {baris.map((p) => (
                        <BarisAntrean key={p.id} permintaan={p} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function TautanLihat({
    href,
    aktif,
    children,
}: {
    href: string;
    aktif: boolean;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            scroll={false}
            aria-current={aktif ? "page" : undefined}
            className={cn(
                "rounded-md px-3 py-1.5 text-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                aktif
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            {children}
        </Link>
    );
}

/** Satu baris, dipakai kedua tampilan - yang membedakan hanya isinya. */
function BarisAntrean({ permintaan }: { permintaan: BarisPersetujuan }) {
    const orang = [
        permintaan.pemohon?.nama_lengkap,
        permintaan.unit_kerja?.nama,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <li>
            <Link
                href={`/persetujuan/${permintaan.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-foreground">
                            {permintaan.nomor ?? "Tanpa nomor"}
                        </span>
                        <LencanaStatus status={permintaan.status} />
                    </div>
                    {orang && (
                        <p className="mt-1 truncate text-[13px] font-medium text-foreground">
                            {orang}
                        </p>
                    )}
                    <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {permintaan.keperluan}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {permintaan.permintaan_item.length} barang
                        {permintaan.diajukan_at &&
                            ` · diajukan ${tanggalPanjang(permintaan.diajukan_at)}`}
                        {permintaan.tanggal_dibutuhkan &&
                            ` · dibutuhkan ${tanggalPanjang(permintaan.tanggal_dibutuhkan)}`}
                    </p>
                </div>
                <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.6}
                />
            </Link>
        </li>
    );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(dashboard)/persetujuan/page.tsx`:

```tsx
import { Paginasi } from "@/components/admin/paginasi";
import { pastikanTataUsaha, siapkanKataKunci } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DaftarPersetujuan, type BarisPersetujuan } from "./daftar-persetujuan";

export const metadata: Metadata = {
    title: "Persetujuan — SIPB SMPN 14",
};

const PER_HALAMAN = 25;

/**
 * Petunjuk foreign key pada pemohon bukan hiasan: permintaan punya empat
 * FK ke profil - pemohon_id, disetujui_oleh, disiapkan_oleh,
 * diserahkan_oleh - jadi `profil ( nama_lengkap )` telanjang membuat
 * PostgREST menjawab PGRST201 alih-alih memilih salah satu. unit_kerja
 * hanya punya satu dan karena itu tidak membutuhkannya.
 */
const KOLOM = `id, nomor, status, keperluan, tanggal_dibutuhkan, diajukan_at,
     pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
     unit_kerja ( nama ),
     permintaan_item ( id )`;

/** `hal` dihilangkan di halaman pertama supaya alamatnya tetap bersih. */
const alamatRiwayat = (cari: string, halaman = 1): string => {
    const parameter = new URLSearchParams({ lihat: "riwayat" });
    if (cari) parameter.set("cari", cari);
    if (halaman > 1) parameter.set("hal", String(halaman));
    return `/persetujuan?${parameter.toString()}`;
};

export default async function PersetujuanPage({
    searchParams,
}: {
    searchParams: Promise<{ lihat?: string; cari?: string; hal?: string }>;
}) {
    await pastikanTataUsaha();

    const parameter = await searchParams;
    const riwayat = parameter.lihat === "riwayat";
    // Keduanya hanya berlaku di Riwayat; antrean tidak dicari dan tidak
    // dipaginasi, jadi parameter nyasar di sana diabaikan saja.
    const cari = riwayat ? (parameter.cari ?? "").trim() : "";
    const halaman = Math.max(1, Number.parseInt(parameter.hal ?? "1", 10) || 1);
    const dari = (halaman - 1) * PER_HALAMAN;

    const supabase = await createClient();

    // Draft disisihkan di kueri, bukan oleh RLS: baca_permintaan
    // disempitkan oleh is_staf(), bukan oleh status, jadi keranjang orang
    // lain memang akan ikut terbawa kalau tidak diminta menyingkir.
    let kueri = supabase.from("permintaan").select(KOLOM, { count: "exact" });

    if (riwayat) {
        kueri = kueri.not("status", "in", '("draft","diajukan")');

        const kataKunci = siapkanKataKunci(cari);
        if (kataKunci) {
            kueri = kueri.or(
                `nomor.ilike."%${kataKunci}%",keperluan.ilike."%${kataKunci}%"`,
            );
        }
    } else {
        kueri = kueri.eq("status", "diajukan");
    }

    // Antrean dilayani menurut urutan datang dan tidak dipaginasi - ia
    // memang untuk dihabiskan. Riwayat justru sebaliknya: menumpuk, jadi
    // yang terbaru di atas dan 25 per halaman.
    const daftar = riwayat
        ? await kueri
              .order("diajukan_at", { ascending: false })
              .range(dari, dari + PER_HALAMAN - 1)
        : await kueri.order("diajukan_at");

    // PostgREST menjawab rentang yang mulai di luar jumlah baris dengan 416,
    // bukan dengan daftar kosong - tautan lama, penanda buku, atau baris
    // terakhir sebuah halaman yang baru saja berpindah status. Pembacanya
    // dipulangkan ke halaman pertama, bukan disuguhi pesan kerusakan.
    if (daftar.error?.code === "PGRST103" && halaman > 1) {
        redirect(alamatRiwayat(cari));
    }

    if (daftar.error) {
        console.error("[persetujuan]", daftar.error.code, daftar.error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Daftar permintaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    const total = daftar.count ?? 0;
    const jumlahHalaman = Math.max(1, Math.ceil(total / PER_HALAMAN));

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <DaftarPersetujuan
                baris={(daftar.data ?? []) as unknown as BarisPersetujuan[]}
                riwayat={riwayat}
                cari={cari}
            />

            {riwayat && total > 0 && (
                <Paginasi
                    halaman={halaman}
                    jumlahHalaman={jumlahHalaman}
                    dari={dari}
                    ditampilkan={daftar.data?.length ?? 0}
                    total={total}
                    satuan="permintaan"
                    href={(h) => alamatRiwayat(cari, h)}
                />
            )}
        </div>
    );
}
```

`as unknown as BarisPersetujuan[]` and not a plain `as`: the select carries embedded resources, and `beranda/page.tsx:96` already casts that way for the same reason.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev`. You need at least two `diajukan` requests from a pegawai account — make them through `/katalog` if there are none.

1. As tata usaha, open `/persetujuan`. Expected: the "Menunggu" tab is active, every row carries an `SPB-` number, a "Menunggu persetujuan" badge, `Nama Pemohon · Unit Kerja`, the keperluan, and `N barang · diajukan <tanggal>`. Oldest at the top. No pagination line.
2. The topbar reads "Persetujuan" and the sidebar item is highlighted. Both come free from `nav-items.ts:44-52` and `app-shell.tsx:23-30`; no nav change was needed.
3. Click "Riwayat". Expected: the URL becomes `/persetujuan?lihat=riwayat`, the search box appears, and the list holds only decided requests — a request still waiting must **not** appear here, and neither view may ever show a `draft`. Verify the last part deliberately: leave an item in a pegawai's cart, then reload both views.
4. Type into the search box. Expected: the URL becomes `/persetujuan?lihat=riwayat&cari=...` — one `?`, one `&` — and the Riwayat tab stays active. Press the X. Expected: back to `/persetujuan?lihat=riwayat`, still on Riwayat.
5. Search a keperluan word, then a partial `SPB-` number. Both must narrow the list. Searching a pemohon's name must return "Tidak ada permintaan yang cocok…" — that is the documented limit, not a bug.
6. As a pegawai and as a pengurus barang, open `/persetujuan`. Expected: both land on `/beranda`.
7. With fewer than 26 decided requests, hand-edit the URL to `?lihat=riwayat&hal=9`. Expected: redirected to `/persetujuan?lihat=riwayat`, no error card.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/persetujuan"
git commit -m "feat: antrean persetujuan tata usaha dengan riwayat sebagai tampilan kedua"
```

---

## Task 4: `/persetujuan/[id]` — read the list, then decide

Setujui and Tolak live only here. Fulfilment is all-or-nothing (`skema.sql:128-130`), so approving is agreeing to the whole list; requiring that the list be on screen first costs one click per request, and that is the point. Inline buttons on a queue row would approve contents nobody read.

The page needs no ownership check: RLS returns the row to any staf, `.neq("status", "draft")` keeps someone else's cart out, and a missing row renders `notFound()` — the same absence-of-a-leak reasoning as `permintaan-saya/[id]/page.tsx:15-21`, rather than a second gate that can drift from the first.

Stock is shown, never enforced. An item asking for more than there is gets a quiet marker, not a disabled button: `siapkan_permintaan()` (`fungsi.sql:473`) is the real check, and `fungsi.sql:404-406` already states the policy — stock can arrive tomorrow, and refusing someone stays a human decision.

Rejecting an approved request stays possible; the state machine allows `disetujui → ditolak` for exactly that case, so a request found through Riwayat keeps its Tolak button.

**Files:**

- Create: `src/app/(dashboard)/persetujuan/actions.ts`
- Create: `src/app/(dashboard)/persetujuan/[id]/page.tsx`
- Create: `src/app/(dashboard)/persetujuan/[id]/keputusan-permintaan.tsx`

**Interfaces:**

- Consumes: `pastikanTataUsaha`, `teks`, `HasilAksi` (`@/lib/aksi`); `PANJANG_ALASAN`, `pesanGalatPermintaan`, `kalimatLogBernama`, `tanggalPanjang`, `waktuSingkat`, `StatusPermintaan` (`@/lib/permintaan`); `BarisKeterangan`, `LencanaStatus` (`@/components/permintaan-parts`); `BidangDialog`, `DialogForm` (`@/components/admin/dialog-form`); `Button` (`@/components/ui/button`); `cn` (`@/lib/utils`); `createClient` (`@/lib/supabase/server`).
- Produces:
    1. From `./actions`: `setujuiPermintaan(id: string): Promise<HasilAksi>` and `tolakPermintaan(id: string, _sebelumnya: HasilAksi | null, formData: FormData): Promise<HasilAksi>`.
    2. From `./[id]/keputusan-permintaan`: `type ItemKeputusan`, `type BarisLogBernama`, `type BarisKeputusan`, and `KeputusanPermintaan({ permintaan, log, stok }: { permintaan: BarisKeputusan; log: BarisLogBernama[]; stok: Record<string, number> })`.

- [ ] **Step 1: Write the server actions**

Create `src/app/(dashboard)/persetujuan/actions.ts`:

```ts
"use server";

import { pastikanTataUsaha, teks, type HasilAksi } from "@/lib/aksi";
import { PANJANG_ALASAN, pesanGalatPermintaan } from "@/lib/permintaan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const JALUR_DAFTAR = "/persetujuan";
const JALUR_BERANDA = "/beranda";

const GALAT_PINDAH =
    "Permintaan ini sudah berpindah status. Muat ulang halamannya.";

/**
 * Menyetujui permintaan yang masih menunggu.
 *
 * `.eq("status", "diajukan")` bukan pengulangan mesin status: tanpa itu,
 * permintaan yang sudah diputuskan dari tab lain tetap terkirim ke server
 * dan ditolak diam-diam - nol baris, tanpa galat. Dengan itu, hasilnya
 * sama tetapi maksudnya terbaca.
 *
 * Tidak ada satu pun kolom lain yang ditulis di sini. disetujui_at dan
 * disetujui_oleh diisi jaga_alur_permintaan() dari auth.uid(), dan baris
 * lognya ditulis catat_log_permintaan().
 */
export async function setujuiPermintaan(id: string): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "disetujui" })
        .eq("id", id)
        .eq("status", "diajukan")
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    // Nol baris berarti RLS menolak update ini tanpa memunculkan galat -
    // keadaan yang didokumentasikan aksi.ts:74-77. Di sini penyebabnya
    // hampir selalu permintaan yang sudah diputuskan dari tab lain.
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    revalidatePath(JALUR_BERANDA);
    return { ok: true };
}

/**
 * Menolak permintaan, berikut alasannya.
 *
 * Alasan dan status ditulis dalam satu UPDATE karena keduanya memang
 * harus tiba bersamaan: constraint alasan_tolak_wajib (skema.sql:117)
 * menolak baris ditolak yang alasannya kosong, dan sejak
 * 20260902010000_permintaan-beku.sql alasan itu tidak bisa ditulis
 * belakangan pada baris yang statusnya sudah diam.
 *
 * Constraint itu tetap jaring terakhir, bukan penyaring: kalau ia sampai
 * berbunyi, validasi di atas inilah yang melenceng, dan kalimat umum
 * memang jawaban yang benar untuk cacat pengembang.
 */
export async function tolakPermintaan(
    id: string,
    _sebelumnya: HasilAksi | null,
    formData: FormData,
): Promise<HasilAksi> {
    await pastikanTataUsaha();

    const alasan = teks(formData, "alasan_tolak");

    if (!alasan) return { ok: false, galat: "Alasan penolakan belum diisi." };
    if (alasan.length > PANJANG_ALASAN) {
        return {
            ok: false,
            galat: `Alasan terlalu panjang, maksimal ${PANJANG_ALASAN} karakter.`,
        };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("permintaan")
        .update({ status: "ditolak", alasan_tolak: alasan })
        .eq("id", id)
        // disetujui ikut, bukan diajukan saja: mesin status memang
        // membolehkan disetujui -> ditolak, untuk stok yang tak kunjung ada.
        .in("status", ["diajukan", "disetujui"])
        .select("id");

    if (error) return { ok: false, galat: pesanGalatPermintaan(error) };
    if (!data?.length) return { ok: false, galat: GALAT_PINDAH };

    revalidatePath(JALUR_DAFTAR);
    revalidatePath(`${JALUR_DAFTAR}/${id}`);
    revalidatePath(JALUR_BERANDA);
    return { ok: true };
}
```

- [ ] **Step 2: Write the detail component**

Create `src/app/(dashboard)/persetujuan/[id]/keputusan-permintaan.tsx`:

```tsx
"use client";

import { BidangDialog, DialogForm } from "@/components/admin/dialog-form";
import { BarisKeterangan, LencanaStatus } from "@/components/permintaan-parts";
import { Button } from "@/components/ui/button";
import {
    kalimatLogBernama,
    PANJANG_ALASAN,
    tanggalPanjang,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { setujuiPermintaan, tolakPermintaan } from "../actions";

export type ItemKeputusan = {
    id: string;
    barang_id: string;
    nama_barang_snapshot: string;
    satuan_snapshot: string;
    jumlah_diminta: number;
};

export type BarisLogBernama = {
    id: string;
    status_ke: StatusPermintaan;
    catatan: string | null;
    created_at: string;
    oleh: { nama_lengkap: string } | null;
};

export type BarisKeputusan = {
    id: string;
    nomor: string | null;
    status: StatusPermintaan;
    keperluan: string;
    tanggal_dibutuhkan: string | null;
    catatan_pemohon: string | null;
    alasan_tolak: string | null;
    diajukan_at: string | null;
    pemohon: { nama_lengkap: string } | null;
    unit_kerja: { nama: string } | null;
    permintaan_item: ItemKeputusan[];
};

export function KeputusanPermintaan({
    permintaan,
    log,
    stok,
}: {
    permintaan: BarisKeputusan;
    log: BarisLogBernama[];
    /** Stok per barang_id. Barang yang tidak ada di sini tampil tanpa angka. */
    stok: Record<string, number>;
}) {
    const [setujui, setSetujui] = React.useState(false);
    const [tolak, setTolak] = React.useState(false);

    const bolehSetujui = permintaan.status === "diajukan";
    // disetujui ikut: permintaan yang stoknya tak kunjung ada masih boleh
    // ditolak belakangan, dan mesin status memang mengizinkannya.
    const bolehTolak =
        permintaan.status === "diajukan" || permintaan.status === "disetujui";

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <Link
                href="/persetujuan"
                className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
                <ArrowLeft className="size-4" strokeWidth={1.6} />
                Persetujuan
            </Link>

            <header className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-mono text-base font-semibold text-foreground">
                    {permintaan.nomor ?? "Tanpa nomor"}
                </h2>
                <LencanaStatus status={permintaan.status} />
            </header>

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

            <dl className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
                <BarisKeterangan
                    label="Pemohon"
                    nilai={permintaan.pemohon?.nama_lengkap ?? "—"}
                />
                <BarisKeterangan
                    label="Unit kerja"
                    nilai={permintaan.unit_kerja?.nama ?? "—"}
                />
                <BarisKeterangan
                    label="Keperluan"
                    nilai={permintaan.keperluan}
                />
                <BarisKeterangan
                    label="Tanggal dibutuhkan"
                    nilai={
                        permintaan.tanggal_dibutuhkan
                            ? tanggalPanjang(permintaan.tanggal_dibutuhkan)
                            : "Tidak ditentukan"
                    }
                />
                <BarisKeterangan
                    label="Diajukan"
                    nilai={
                        permintaan.diajukan_at
                            ? tanggalPanjang(permintaan.diajukan_at)
                            : "—"
                    }
                />
                {permintaan.catatan_pemohon && (
                    <BarisKeterangan
                        label="Catatan pemohon"
                        nilai={permintaan.catatan_pemohon}
                    />
                )}
            </dl>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Barang ({permintaan.permintaan_item.length})
                </h3>
                <ul className="divide-y divide-border">
                    {permintaan.permintaan_item.map((item) => (
                        <BarisBarang
                            key={item.id}
                            item={item}
                            stok={stok[item.barang_id]}
                        />
                    ))}
                </ul>
            </section>

            {(bolehSetujui || bolehTolak) && (
                <div className="flex flex-wrap items-center gap-2">
                    {bolehSetujui && (
                        <Button
                            className="h-9.5"
                            onClick={() => setSetujui(true)}
                        >
                            <Check />
                            Setujui
                        </Button>
                    )}
                    {bolehTolak && (
                        <Button
                            variant="outline"
                            className="h-9.5 text-destructive"
                            onClick={() => setTolak(true)}
                        >
                            <X strokeWidth={1.6} />
                            Tolak
                        </Button>
                    )}
                </div>
            )}

            <section className="overflow-hidden rounded-xl border border-border bg-card">
                <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                    Riwayat
                </h3>
                {/* Disebutkan berikut namanya, tidak seperti garis waktu
                    pegawai: policy baca_profil membuka seluruh baris untuk
                    is_staf(), dan dengan dua akun tata usaha, "Disetujui tata
                    usaha" tidak menjawab apa pun. */}
                <ol className="divide-y divide-border">
                    {log.map((l) => (
                        <li
                            key={l.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-3"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-foreground">
                                    {kalimatLogBernama(
                                        l.status_ke,
                                        l.oleh?.nama_lengkap,
                                    )}
                                </p>
                                {l.catatan && (
                                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                                        {l.catatan}
                                    </p>
                                )}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                                {waktuSingkat(l.created_at)}
                            </span>
                        </li>
                    ))}
                </ol>
            </section>

            <DialogForm
                key={setujui ? "setujui" : "setujui-tertutup"}
                terbuka={setujui}
                onTerbukaBerubah={setSetujui}
                judul="Setujui permintaan ini?"
                keterangan="Permintaan dilayani utuh atau tidak sama sekali, jadi menyetujuinya berarti menyetujui seluruh daftar barang di atas."
                aksi={setujuiPermintaan.bind(null, permintaan.id)}
                labelSimpan="Setujui"
                labelMenyimpan="Menyetujui"
            />

            <DialogForm
                key={tolak ? "tolak" : "tolak-tertutup"}
                terbuka={tolak}
                onTerbukaBerubah={setTolak}
                judul="Tolak permintaan ini?"
                keterangan="Alasannya dibaca pemohon di halaman permintaannya, jadi tulis yang bisa ditindaklanjutinya."
                aksi={tolakPermintaan.bind(null, permintaan.id)}
                labelSimpan="Tolak"
                labelMenyimpan="Menolak"
                merusak
            >
                <BidangDialog
                    id="alasan_tolak"
                    label="Alasan penolakan"
                    placeholder="Stok habis, diusulkan masuk pengadaan triwulan depan"
                    required
                    autoFocus
                    maxLength={PANJANG_ALASAN}
                />
            </DialogForm>
        </div>
    );
}

/**
 * Angka stok ditampilkan, tidak pernah menggerbangi tombol. Barang bisa
 * datang besok, dan menolak seseorang tetap keputusan orang - sikap yang
 * sudah tertulis di fungsi.sql:404-406. Penjaga sesungguhnya adalah
 * siapkan_permintaan(), yang menggagalkan seluruh penyiapan kalau satu
 * barang saja kurang.
 *
 * Stok yang tidak terjangkau tampil sebagai tidak ada angka, bukan
 * sebagai nol: nol adalah pernyataan, dan pernyataan itu belum tentu benar.
 */
function BarisBarang({
    item,
    stok,
}: {
    item: ItemKeputusan;
    stok: number | undefined;
}) {
    const kurang = stok !== undefined && item.jumlah_diminta > stok;

    return (
        <li className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">
                    {item.nama_barang_snapshot}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.jumlah_diminta} {item.satuan_snapshot}
                </p>
            </div>

            {stok !== undefined && (
                <span
                    className={cn(
                        "flex shrink-0 items-center gap-1 text-xs",
                        kurang ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {kurang && (
                        <TriangleAlert
                            aria-hidden
                            className="size-3.5"
                            strokeWidth={1.8}
                        />
                    )}
                    {kurang ? `Stok ${stok}, kurang` : `Stok ${stok}`}
                </span>
            )}
        </li>
    );
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(dashboard)/persetujuan/[id]/page.tsx`:

```tsx
import { pastikanTataUsaha } from "@/lib/aksi";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    KeputusanPermintaan,
    type BarisKeputusan,
    type BarisLogBernama,
} from "./keputusan-permintaan";

export const metadata: Metadata = {
    title: "Detail Permintaan — SIPB SMPN 14",
};

type BarisStok = { barang_id: string; stok: number };

/**
 * Tanpa pemeriksaan kepemilikan, dan itu disengaja - sama seperti
 * permintaan-saya/[id]. Policy baca_permintaan mengembalikan baris mana
 * pun kepada staf, kueri di bawah menyisihkan draft, dan baris yang tidak
 * ada berakhir di notFound(). Gerbang kedua di sini hanya akan jadi
 * gerbang yang bisa melenceng dari gerbang pertama.
 */
export default async function KeputusanPermintaanPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await pastikanTataUsaha();

    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("permintaan")
        .select(
            `id, nomor, status, keperluan, tanggal_dibutuhkan, catatan_pemohon,
             alasan_tolak, diajukan_at,
             pemohon:profil!permintaan_pemohon_id_fkey ( nama_lengkap ),
             unit_kerja ( nama ),
             permintaan_item ( id, barang_id, nama_barang_snapshot, satuan_snapshot, jumlah_diminta )`,
        )
        .eq("id", id)
        // Keranjang orang lain yang belum diajukan bukan urusan tata usaha,
        // dan RLS tidak menyisihkannya: baca_permintaan disempitkan oleh
        // is_staf(), bukan oleh status.
        .neq("status", "draft")
        .maybeSingle<BarisKeputusan>();

    // Kalau id-nya bukan uuid, Postgres menolaknya (22P02) - jalur yang sama
    // dengan permintaan yang memang tidak ada, sebab keduanya sama-sama
    // bukan kesalahan pemuatan yang bisa hilang dengan memuat ulang.
    if (error && error.code !== "22P02") {
        console.error("[persetujuan detail]", error.code, error.message);
        return (
            <p className="mx-auto max-w-3xl rounded-xl border border-destructive/25 bg-destructive/8 px-5 py-8 text-center text-[13px] text-destructive">
                Detail permintaan gagal dimuat. Muat ulang halamannya sebentar
                lagi.
            </p>
        );
    }

    if (!data) notFound();

    const item = [...(data.permintaan_item ?? [])].sort((a, b) =>
        a.nama_barang_snapshot.localeCompare(b.nama_barang_snapshot, "id"),
    );

    const [stok, log] = await Promise.all([
        supabase
            .from("stok_barang")
            .select("barang_id, stok")
            .in(
                "barang_id",
                item.map((i) => i.barang_id),
            ),
        supabase
            .from("permintaan_log")
            .select(
                "id, status_ke, catatan, created_at, oleh:profil ( nama_lengkap )",
            )
            .eq("permintaan_id", id)
            .order("created_at"),
    ]);

    // Keduanya tidak fatal. Angka stok yang gagal dimuat membuat barisnya
    // tampil tanpa angka - keputusannya tetap bisa diambil, sebab angka itu
    // memang tidak pernah menggerbangi tombol apa pun.
    if (stok.error) {
        console.error(
            "[persetujuan detail] stok",
            stok.error.code,
            stok.error.message,
        );
    }
    if (log.error) {
        console.error(
            "[persetujuan detail] log",
            log.error.code,
            log.error.message,
        );
    }

    return (
        <KeputusanPermintaan
            permintaan={{ ...data, permintaan_item: item }}
            log={(log.data ?? []) as unknown as BarisLogBernama[]}
            stok={Object.fromEntries(
                ((stok.data ?? []) as BarisStok[]).map((s) => [
                    s.barang_id,
                    s.stok,
                ]),
            )}
        />
    );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev`, with at least two `diajukan` requests and one barang whose stock is lower than what a request asks for.

1. As tata usaha, open a queue row. Expected: the item list with `jumlah + satuan` per row and `Stok N` on the right; the under-stocked row reads `Stok N, kurang` in red with a warning triangle, and the Setujui button is **still enabled**.
2. The Keterangan card shows Pemohon, Unit kerja, Keperluan, Tanggal dibutuhkan, Diajukan, and Catatan pemohon when the pegawai wrote one.
3. The Riwayat section reads "Keranjang dibuat oleh <nama pegawai>" then "Diajukan oleh <nama pegawai>", each with a Jakarta timestamp. Names, not "Diajukan ke tata usaha" — that phrasing belongs to the pegawai's own page, which must stay unchanged.
4. Press Setujui, confirm. Expected: the dialog closes, the badge becomes "Disetujui", the Setujui button disappears, Tolak remains, and the timeline gains "Disetujui oleh <nama tata usaha>". The request is gone from the queue and present in Riwayat.
5. Press Tolak on that same approved request, submit with an empty reason. Expected: "Alasan penolakan belum diisi." inside the dialog, which stays open. Submit with a reason. Expected: badge "Ditolak", the red rejection block appears at the top, and the timeline's last line carries the reason underneath it.
6. As that pegawai, open the request in `/permintaan-saya`. Expected: the rejection block shows the same sentence, and its timeline is still status-only — no names.
7. Open a request's detail page in two tabs. Approve in tab A, then approve in tab B. Expected in tab B: "Permintaan ini sudah berpindah status. Muat ulang halamannya." with the dialog still open.
8. Visit `/persetujuan/bukan-uuid` and `/persetujuan/<uuid acak>`. Expected: the Indonesian 404 card from `(dashboard)/not-found.tsx` in both cases, not the red "gagal dimuat" banner.
9. Have a pegawai leave a cart open, take its id from the URL of their own detail page, and visit `/persetujuan/<id draft>` as tata usaha. Expected: 404.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/persetujuan"
git commit -m "feat: halaman keputusan permintaan dengan stok, garis waktu bernama, dan aksi setujui-tolak"
```

---

## Task 5: Beranda for tata usaha

`RINGKASAN` (`beranda/page.tsx:19-31`) already holds the three tata usaha labels and the layout; only the numbers and one line of empty-state copy are missing. `ringkasanTataUsaha()` sits beside `ringkasanPegawai()` and returns the same `{ angka, aktivitas }` shape, so the rendering below is untouched apart from picking the function by role.

| Tile                 | Source                              |
| -------------------- | ----------------------------------- |
| Menunggu Persetujuan | `count(status = 'diajukan')`        |
| Disetujui Bulan Ini  | `count(disetujui_at >= awal bulan)` |
| Total Pengguna       | `count(*)` on `profil`              |

Recent activity is the five newest `permintaan_log` rows across every request — `baca_permintaan_log` (`rls.sql:164`) opens all of them to `is_staf()` — phrased by `kalimatLog()`, unnamed, as it is today. Naming stays on the detail timeline, where the reader is deciding something; a dashboard ticker is not that.

**Files:**

- Modify: `src/app/(dashboard)/beranda/page.tsx`

**Interfaces:**

- Consumes: `tanggalHariIni` (`@/lib/permintaan`), on top of what the file already imports.
- Produces: nothing other modules import.

- [ ] **Step 1: Import `tanggalHariIni`**

Extend the existing import at `beranda/page.tsx:2-6`:

```tsx
import {
    kalimatLog,
    tanggalHariIni,
    waktuSingkat,
    type StatusPermintaan,
} from "@/lib/permintaan";
```

- [ ] **Step 2: Update the `RINGKASAN` comment**

Replace the comment above `RINGKASAN` (lines 15-18) — sub-project 5 is no longer in the future:

```tsx
// Angka pegawai terisi di sub-proyek 4, angka tata usaha di sub-proyek 5.
// Angka pengurus barang menyusul bersama stok dan penerimaan di
// sub-proyek 6. Label dan tata letaknya sudah terpasang sejak awal supaya
// kerangka ini yang tinggal diisi, bukan dirombak.
```

- [ ] **Step 3: Add the empty-state sentences**

Insert this directly after the `WAKTU_JAKARTA` const (line 41):

```tsx
/**
 * Kalimat kedua di bawah "Belum ada aktivitas", satu per peran yang
 * angkanya sudah terisi. Peran yang belum - dan karena itu tidak punya
 * ringkasan sama sekali - memakai kalimat "modulnya aktif" di bawah.
 */
const KOSONG_AKTIVITAS: Partial<Record<Role, string>> = {
    pegawai:
        "Riwayat permintaan Anda muncul di sini begitu keranjang pertama dibuat.",
    tata_usaha:
        "Riwayat permintaan sekolah muncul di sini begitu ada yang diajukan.",
};
```

- [ ] **Step 4: Add `ringkasanTataUsaha()`**

Insert directly after `ringkasanPegawai()` ends (line 98), before `export default async function BerandaPage()`:

```tsx
/**
 * Tiga angka tata usaha, tiga count(head: true) yang berjalan bersamaan.
 *
 * Berbeda dengan ringkasanPegawai di atas, ketiganya tidak bisa dilipat
 * jadi satu select: yang pertama menghitung status, yang kedua sebuah
 * batas tanggal, dan yang ketiga tabel lain sama sekali. Promise.all yang
 * menjaga maksud komentar di sana - satu kali menunggu, bukan tiga.
 *
 * Log tidak perlu disaring: policy baca_permintaan_log membuka seluruh
 * log kepada is_staf(), dan itu memang yang diinginkan di sini - ticker
 * ini tentang seluruh sekolah, bukan tentang satu orang.
 */
async function ringkasanTataUsaha() {
    const supabase = await createClient();

    // "2026-09" + "-01T00:00:00+07:00". Batas bulannya disusun dari tanggal
    // Jakarta, bukan dari getMonth(): zona waktu server bukan zona waktu
    // sekolah, dan itu pula sebabnya tanggalHariIni() ada.
    const awalBulan = `${tanggalHariIni().slice(0, 7)}-01T00:00:00+07:00`;

    const [menunggu, disetujui, pengguna, aktivitas] = await Promise.all([
        supabase
            .from("permintaan")
            .select("id", { count: "exact", head: true })
            .eq("status", "diajukan"),
        supabase
            .from("permintaan")
            .select("id", { count: "exact", head: true })
            .gte("disetujui_at", awalBulan),
        supabase.from("profil").select("id", { count: "exact", head: true }),
        supabase
            .from("permintaan_log")
            .select("id, status_ke, created_at, permintaan ( nomor )")
            .order("created_at", { ascending: false })
            .limit(5),
    ]);

    const galat =
        menunggu.error ?? disetujui.error ?? pengguna.error ?? aktivitas.error;
    if (galat) console.error("[beranda]", galat.code, galat.message);

    return {
        angka: [menunggu.count ?? 0, disetujui.count ?? 0, pengguna.count ?? 0],
        aktivitas: (aktivitas.data ?? []) as unknown as Aktivitas[],
    };
}
```

- [ ] **Step 5: Pick the function by role, and use the new copy**

Replace the `ringkasan` assignment (lines 105-106):

```tsx
const ringkasan =
    user.role === "pegawai"
        ? await ringkasanPegawai(user.id)
        : user.role === "tata_usaha"
          ? await ringkasanTataUsaha()
          : null;
```

Then, in the empty-activity branch (lines 179-184), replace the hardcoded pegawai sentence with the record lookup:

```tsx
                ) : ringkasan.aktivitas.length === 0 ? (
                    <p className="px-5 py-8 text-center text-[13px] leading-relaxed text-muted-foreground">
                        Belum ada aktivitas.
                        <br />
                        {KOSONG_AKTIVITAS[user.role]}
                    </p>
                ) : (
```

Nothing else in the file changes: the tiles, the greeting, and the activity list all read from `ringkasan` and already handle both shapes.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output from `tsc`; no ESLint errors.

Then run `npm run dev`:

1. As tata usaha with one waiting request and one approved this month, open `/beranda`. Expected: "Menunggu Persetujuan" 1, "Disetujui Bulan Ini" 1, "Total Pengguna" the real account count — all in full-strength text, no grey dashes.
2. Approve the waiting one. Expected: after `revalidatePath("/beranda")` from Task 4's action, the tiles read 0 and 2 without a manual reload.
3. "Aktivitas Terbaru" lists the five newest lines across every pegawai — `SPB-000003 · Disetujui tata usaha` — unnamed, and a draft's line reads "Keranjang dibuat" with no number.
4. As a pegawai, `/beranda` is unchanged from sub-project 4.
5. As a pengurus barang, `/beranda` still shows three grey em-dashes and "Riwayat permintaan dan penerimaan muncul di sini begitu modulnya aktif."
6. A tata usaha account in a school with no requests at all: three zeros and "Riwayat permintaan sekolah muncul di sini begitu ada yang diajukan."

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/beranda/page.tsx"
git commit -m "feat: beranda tata usaha menampilkan antrean, persetujuan bulan ini, dan jumlah pengguna"
```

---

## Task 6: End-to-end verification

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

Run `supabase/migrations/20260902010000_permintaan-beku.sql` against the Supabase project. Then, in the SQL editor, confirm the rule is live against a request that is already `diajukan`:

```sql
update public.permintaan set keperluan = 'Uji' where nomor = 'SPB-000001';
```

Expected: `ERROR: Isi permintaan yang sudah diajukan tidak bisa diubah lagi.` This duplicates Task 1's automated coverage on purpose — the migration must be applied to the real project, not only to PGlite.

- [x] **Step 3: Approve one, reject another**

As a pegawai, submit two requests through `/katalog`. As tata usaha:

- Approve the first from `/persetujuan/<id>`. Expected: it leaves the queue, appears in Riwayat with a "Disetujui" badge, and `disetujui_oleh` in the SQL editor is that tata usaha's uid.
- Reject the second with a reason. Expected: "Ditolak" badge, and `select catatan from permintaan_log where status_ke = 'ditolak'` returns the reason.

- [x] **Step 4: The pegawai sees the decision**

Sign back in as that pegawai and open both requests under `/permintaan-saya`.

Expected: the approved one reads "Disetujui" and the rejected one shows the red "Alasan penolakan" block with the exact sentence tata usaha typed. Both timelines remain status-only — no names anywhere on the pegawai's side.

- [x] **Step 5: An approved request can still be rejected**

From `/persetujuan?lihat=riwayat`, open the approved request and press Tolak with a reason.

Expected: it succeeds — `disetujui → ditolak` is a legal transition — the badge becomes "Ditolak", and the pegawai's page now shows the rejection block on a request that was approved an hour ago.

- [x] **Step 6: The other two roles cannot get in**

As a pegawai and as a pengurus barang, open `/persetujuan` and `/persetujuan/<id nyata>`.

Expected: both land on `/beranda` in both cases. Then, from a pegawai session, confirm the ban is not only in the page: in the SQL editor as that account, `update public.permintaan set status = 'disetujui' where id = '<id>'` must raise "Hanya tata usaha yang boleh menyetujui atau menolak permintaan".

- [x] **Step 7: Two-tab races**

- Two tabs on the same detail page: approve in A, approve in B. Expected in B: "Permintaan ini sudah berpindah status. Muat ulang halamannya."
- Approve in A, then reject in B. Expected in B: it succeeds — that is the legal `disetujui → ditolak`, not a race.
- Reject in A, then reject in B. Expected in B: the same "sudah berpindah status" sentence, since `ditolak` is in neither of `tolakPermintaan`'s allowed statuses.

- [x] **Step 8: 375px pass**

At 375px width, walk `/persetujuan` (both tabs, with the search box and a pagination row), a detail page with a long item list and a long keperluan, both dialogs, and `/beranda`.

Expected: no horizontal scrolling anywhere, the tab pair and the search box wrap onto two rows rather than squeezing, the `Stok N, kurang` marker stays on one line beside its item, and both dialog buttons are reachable with a thumb.

- [ ] **Step 9: Commit any fixes and finish**

```bash
git add -A
git commit -m "fix: perbaikan dari verifikasi menyeluruh persetujuan tata usaha"
```

If nothing needed fixing, there is nothing to commit — say so rather than making an empty commit.

---

## What this sub-project does NOT include

Carried from the spec, so no one adds it mid-plan:

- Bulk approval. Each approval is a judgment on a whole item list, and a partial failure mid-batch would need an error story of its own.
- Searching the history by pemohon name. PostgREST filters on an embedded resource narrow the embed, not the parent row, so it needs a flattening view; until then the search box claims only the columns it can reach.
- Editing a request before approving it. All-or-nothing is why the item list is an agreement, and Task 1's migration is what finally makes that true of the header too.
- Any notification to the pemohon on approval or rejection. There is still no mail or push channel in this project.
- Pagination on the queue. It drains; only Riwayat accumulates.
- Naming people in the beranda activity ticker. `kalimatLogBernama()` exists for the detail timeline, where the reader is deciding something.
- `/stok`, `/penerimaan`, `/permintaan-masuk`, `/penyesuaian` — sub-project 6. Until it exists, an approved request has nowhere further to go, and that is expected.
