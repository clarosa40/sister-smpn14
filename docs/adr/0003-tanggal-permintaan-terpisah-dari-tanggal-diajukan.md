# A permintaan carries two dates, and the system's own is never rewritten

A pegawai who hands in a request on Monday but only types it into SIPB on
Thursday can now state the Monday: `permintaan.tanggal` is the **tanggal
permintaan**, the day they actually asked, bounded to the last thirty days and
never in the future. `diajukan_at` — the **tanggal diajukan** — keeps being
stamped by `jaga_alur_permintaan()` at the moment the status moves, is frozen
like every other field once the permintaan leaves draft, and is displayed
beside the tanggal permintaan rather than replaced by it.

The alternative was one date: let a late request overwrite `diajukan_at` and be
done. It fails on the system's own account of itself. `permintaan_log` is
described in the schema as the *pengganti bukti serah terima digital* — the
stand-in for a signed handover slip — and its rows are written with `now()`, so
an overwritten `diajukan_at` would have the permintaan claiming Monday while its
own log said Thursday. `nomor` comes from one running sequence issued in the
same statement, so back-dating would also break the correspondence between SPB
order and date order that a reader of the riwayat reasonably assumes. Two dates
cost a column and a label; one date costs the ability to say when anything
actually happened.

## Considered options

**Overwriting `diajukan_at`.** Rejected, above. Worth adding that it is the
cheaper option only until the first dispute: the moment someone asks when a
request was really received, a system that can only answer with a date its own
users chose has no answer at all.

**Letting tata usaha submit on a pegawai's behalf.** Rejected, and deliberately
not built. It solves the same Monday-to-Thursday gap by moving the typing rather
than the date, but it means opening `Hanya pemohon sendiri yang boleh mengajukan`
— a far larger hole than a date field, and one that puts requests in people's
names that they never pressed a button for. Bu Ani types her own request; only
the date travels.

**A `timestamptz` for the tanggal permintaan.** Rejected. A person recalling
last Monday knows the day and not the hour, and a timestamp column invites a
fabricated 09:14 that nobody witnessed. `date` makes the precision honest.

## Consequences

The thirty-day bound lives in `ajukanPermintaan`, not in the database. The DB
check is only `tanggal <= (now() at time zone 'Asia/Jakarta')::date`, because
the migration backfills existing rows from `diajukan_at` and most of those are
older than thirty days — a validating constraint carrying the full bound could
not be added at all. Both halves are computed in Jakarta time: Postgres
`current_date` is UTC on Supabase, which is yesterday until 07:00 at the school,
and a constraint that disagrees with the action by seven hours would reject
every request submitted before breakfast.

`tanggal_dibutuhkan` no longer has to be today or later; it has to be on or
after the tanggal permintaan. The old rule read as "you cannot need it in the
past", but what it always meant was "you cannot need it before you asked" —
those were the same sentence only while the two dates were the same day.

Antrean and riwayat now sort by different dates on purpose. An antrean is
drained in the order work arrived at the desk, which is genuinely `diajukan_at`;
a riwayat is a record of what the school did, so it sorts by tanggal permintaan.
A back-dated request therefore appears near the top of a riwayat and at the
bottom of the antrean, and that is correct in both places.
