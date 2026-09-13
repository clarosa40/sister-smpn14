# Pengurus barang approves; tata usaha moves the stock

The two staff roles do not mean what their duties in this repo first said they
meant. **Pengurus barang** — the school's appointed asset officer — approves or
refuses every permintaan and reads stok in order to judge them, and does
nothing else. **Tata usaha** keeps all master data and additionally performs
every physical act in the stockroom: catat penerimaan, siapkan, serahkan,
penyesuaian. Tata usaha is now the only role that moves stok.

This inverts the original build, in which tata usaha approved and pengurus
barang moved goods. The original was a misreading of the school's own division
of labour, corrected by the client. In an Indonesian school, *pengurus barang*
is an appointed position whose authority is a signature on the request; the
clerical staff of *tata usaha* are the ones who open boxes, count what is on
the shelf, and hand things over. The name says steward, and stewardship here
means answering for the goods, not carrying them.

Menu access follows exactly:

| Menu | Pengurus Barang | Tata Usaha |
| --- | --- | --- |
| Persetujuan | y | |
| Master Barang | | y |
| Kelola Unit Kerja | | y |
| Kelola Pengguna | | y |
| Stok Barang | y | y |
| Penerimaan | | y |
| Permintaan Masuk | | y |
| Penyesuaian | | y |

Pegawai is untouched. A blank cell means no menu and no write; reads stay open
to `is_staf()`, because pengurus barang is better for seeing the stock story
and narrowing them would be RLS churn against no stated need.

## Considered options

**Renaming the roles instead of re-mapping their duties.** The tempting reading
was that the duties were right and the labels were swapped, which would be a
rename of the `role_user` enum values rather than a redistribution of
capability. The arithmetic refuses it: a straight swap would drag master barang,
unit kerja, and kelola pengguna onto pengurus barang, and those stay with tata
usaha. Only approval crosses in one direction; everything else crosses in the
other. A rename would also mean an enum migration against live rows to express
a change that is entirely about capability.

**Introducing duty-named predicates** — `bisa_menyetujui()`,
`bisa_menggerakkan_stok()` — so that a future re-map is one line in one file.
Rejected as speculative. `is_tu()` and `is_pengurus()` name *who a person is*,
which stays true no matter which duties attach; the policy name beside them
already says what the gate is for. The mapping has moved once, and an
indirection layer built in anticipation of a second move buys nothing today
except a second name for every check.

**Freezing historical labels.** The status sentences in `src/lib/permintaan.ts`
are derived from `status`, not stored, so a permintaan approved last month by a
tata usaha now renders as "Disetujui pengurus barang". Storing the role on
`permintaan_log` would keep history in its own words, at the cost of a schema
change and a backfill. Declined: `permintaan.disetujui_oleh`, `disiapkan_oleh`,
and `diserahkan_oleh` still point at the actual person, and every screen shows
the name beside the label. The audit trail is a person, not a role word.

## Consequences

`is_pengurus()` now gates approval and `is_tu()` now gates stock movement,
which is the reverse of what a reader expects from the names and the reason
this decision is written down at all. Anyone who meets a "pengurus barang" that
cannot touch barang should read this file before filing it as a bug.

Tata usaha holds master data, the whole stock ledger, and kelola pengguna —
which sets roles. The role that executes therefore appoints the role that
approves it. `pengguna/actions.ts` prevents changing one's own role, but
nothing prevents a tata usaha from demoting the sitting pengurus barang and
appointing another. This is the school's arrangement, accepted as specified,
and it is a smaller separation of duties than the build originally had.

ADR 0001 still holds unchanged in substance: the three SECURITY DEFINER
functions remain the ledger's only doors. Only the role permitted through them
has changed.
