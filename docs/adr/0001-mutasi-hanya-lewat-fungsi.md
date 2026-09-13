# The mutasi ledger is written only through functions

Every legitimate write to `mutasi_stok` happens inside one of three
SECURITY DEFINER functions — `siapkan_permintaan()`, `catat_penerimaan()`,
`catat_penyesuaian()` — each of which enforces something the table itself
cannot: fulfilment is all-or-nothing, incoming goods have a document behind
them, and a penyesuaian's difference is computed from a physical count rather
than typed. The `tulis_mutasi` RLS policy granted pengurus barang a direct
INSERT that walked past all three, so it is revoked; the functions are the
only doors. The `rusak_kadaluarsa` value in `jenis_mutasi` consequently has no
writer at all, and is left in place rather than removed.

## Considered options

**Removing `rusak_kadaluarsa` from the enum.** Postgres has no
`ALTER TYPE … DROP VALUE`, so removal means a replacement type, a rewrite of
the ledger table, and rebuilding the `tanda_cocok_jenis` constraint that names
the value — while adding it back later is a one-line `ADD VALUE`. Expensive to
remove, free to restore: the unused value is the cheap side of that trade, and
costs nothing at runtime.

**Recording damaged and expired goods as a penyesuaian instead** (the current
behaviour, with the loss explained in the mandatory catatan). Accepted for now
as a deliberate deferral, not as the end state: the ledger is append-only, so
rows written this way stay classified this way permanently, and if the
distinction is built later, today's losses will be indistinguishable from
today's miscounts. Whoever builds it should add a `catat_kerusakan()` function
beside its three siblings rather than reopening direct inserts.

## Consequences

Nothing outside the database can write a mutasi row, including a pengurus
barang using the API directly. Any future kind of stock movement needs a new
function, which is the intended cost — it forces the rule that movement obeys
to be written down somewhere the application cannot skip.

## Amendment (ADR 0006)

Every mention of "pengurus barang" above should now be read as "whoever holds
the stock-moving role", which since ADR 0006 is **tata usaha**. The prose is
left as written because it was accurate when the decision was made and the
decision itself is unchanged: the three functions are still the ledger's only
doors, and `tulis_mutasi` is still revoked. Only the role that passes through
`is_pengurus()` inside them has moved, and that check is now `is_tu()`.
