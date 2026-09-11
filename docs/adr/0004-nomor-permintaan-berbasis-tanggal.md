# Nomor permintaan encodes the tanggal permintaan instead of a global sequence

The old format `SPB-000001` is a single running counter with no date component.
The new format `SPB/2026/09/001` carries the year and month from
`permintaan.tanggal` and a three-digit counter that resets each calendar year.

The school's paper SPB documents have always carried the year. The digital
system's global counter was a simplification that grew awkward the moment two
calendar years' worth of documents sat side by side — an `SPB-000347` in
January 2027 looks like it belongs to the same year as `SPB-000340` from
December, and a reader has to open the record to tell them apart.

ADR 0003 noted that back-dating `diajukan_at` would break the correspondence
between SPB order and date order. This change trades that property on purpose:
the nomor now tracks the pegawai's stated tanggal permintaan, not submission
order. Submission order survives in `diajukan_at`, and the antrean still sorts
by it; the nomor now tells a reader the claimed month at a glance, which is
what the riwayat — sorted by tanggal — already cares about.

## Considered options

**Keep a global sequence and just prepend the date.** A format like
`SPB/2026/09/000347` would have kept the global counter and added the date.
Rejected: the six-digit counter would reset visually each year anyway (from
the reader's perspective, `001` in January is "the first one this year"), and
two numbering schemes in one string confuse more than they clarify.

**Per-month counter.** Reset the counter every month instead of every year.
Rejected: a per-year counter is simpler (one row per year in the counter
table), and the month is already visible in the nomor — the counter doesn't
need to repeat that information.

**Keep using a Postgres sequence.** Sequences are lock-free and gap-tolerant,
but they cannot reset per year without DDL. A counter table with `FOR UPDATE`
serialises concurrent submissions on a single row, but at the volume of a
school (single-digit concurrent writes) the difference is unmeasurable.

## Consequences

`nomor_counter` is a new table with one row per year. The trigger locks the
row, increments, and uses the value. Gaps are possible if a transaction rolls
back after incrementing, same as with a sequence.

Old `SPB-NNNNNN` nomors remain in the database. The unique constraint covers
both formats. Search (ilike) still works because neither format is a substring
of the other.

The counter caps at 999 per year. Exceeding it raises an error. At this
school's volume this is unreachable; if it ever is reached, widening the format
is a new migration.

Cross-year backdating is allowed: a pegawai submitting in January 2027 with
`tanggal` = December 2026 mints `SPB/2026/12/NNN`. The 30-day bound in
`ajukanPermintaan` already limits how far back a tanggal can reach.
