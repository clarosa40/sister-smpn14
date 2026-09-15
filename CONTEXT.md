# SIPB SMPN 14

Sistem Permintaan Barang: a school stockroom system where staff request
consumable supplies, an asset officer approves them, and an administrator
fulfils them. One school, one stockroom, three roles.

Prose in this repo is English; identifiers, UI copy, and the terms below are
Bahasa Indonesia. That split is deliberate — the people using the system read
Indonesian, and every name they see should match what they say out loud.

## Language

### People and roles

**Pegawai**:
A teacher or other school employee who requests supplies. The default role
every new account gets, and the one role that is not staf.
_Avoid_: user, requester, employee (as a role name)

**Pengurus Barang**:
The school's appointed asset officer. Approves or refuses every permintaan, and
reads stok in order to judge them — but moves nothing. The authority is a
signature, not a pair of hands. Known in the school as sarpras.
_Avoid_: sarpras (in code), approver, warehouse staff, admin gudang

**Tata Usaha**:
School administration. Owns all master data — barang, unit kerja, profil — and
performs every physical act in the stockroom: receiving goods, preparing
requests, handing them over, correcting counts. The only role that moves stok.
_Avoid_: admin, TU (in code)

**Staf**:
Pengurus barang and tata usaha together — the two roles that run the stockroom,
as against the pegawai who request from it. Narrower than the school's own use
of the word, where every employee is staff: here a pegawai is deliberately not
staf. What the two share is the right to read stok, which is why stok is the
one screen both of them reach.
_Avoid_: karyawan, petugas, staff (for pegawai)

**Unit Kerja**:
The department a pegawai belongs to, and the department a permintaan is
charged to. A table, not free text, so the laporan konsumsi never splits over a
spelling.
_Avoid_: department, divisi, bagian

**Profil**:
The application's record of a person: name, unit kerja, role, active flag.
Passwords and sessions belong to Supabase Auth, never to profil.
_Avoid_: user, akun (for the row itself)

**Sandi Sementara**:
The password tata usaha hands over when they create an account or when someone
has locked themselves out. Always generated, never composed — shown on screen
once, read aloud, and never retrievable afterwards. It leaves a marker on the
account that holds its owner at /ganti-sandi until they choose a password of
their own, and only the marker's absence means they have. The single way a
password is set without knowing the old one: there is no recovery email, and a
forgotten password is an errand to tata usaha.
_Avoid_: sandi awal, password default, reset password (for the act)

**Alamat Email**:
The address stored in Supabase Auth, not in profil — like passwords and
sessions, it belongs to Auth. Its domain is fixed for the whole school and
receives nothing: it identifies a person, it does not reach them. Only the
half before the @, the nama pengguna, is ever typed, shown in a list, or read
aloud; the domain sits beside an input and nowhere else. Tata usaha chooses it
once, when the account is created, and it never changes afterwards.
_Avoid_: username, user ID, akun (for the address)

### Goods and stock

**Barang**:
A kind of consumable supply — kode, nama, satuan. Kode is copied verbatim
from the school's inventory spreadsheet and means something outside this
application.
_Avoid_: item, produk, inventaris

**Kode**:
The barang's identifier, copied verbatim from the school's inventory
spreadsheet: `1.1.7.01.02.01.001.00852`, a national asset-classification
number. Segments of it do group barang — stationery, paper, cleaning, lab —
but the school has no word for those groups and no column holding them; the
grouping exists only inside the digits. SIPB does not model it. A screen that
groups barang by kode is reading meaning that belongs to the classification
scheme rather than to SMPN 14. Twenty-four characters long, and identical in
its first twenty across a whole category, so it disambiguates two similar
barang only at the very end — which is why no screen uses it as a label.
_Avoid_: SKU, nomor barang, kategori (there is no kategori here)

**Satuan**:
The unit a barang is counted in: buah, rim, kotak.
_Avoid_: unit, UOM

**Stok**:
The quantity of a barang on hand. Never a stored column — always
`SUM(mutasi_stok.jumlah)`. Any sentence that treats stok as something a person
types is wrong.
_Avoid_: saldo, quantity on hand, inventory level

**Mutasi**:
One signed line in the stock ledger: positive adds, negative removes. The
ledger is append-only; a mistake is corrected by writing the opposite line,
never by editing the old one.
_Avoid_: transaksi stok, stock movement, adjustment (for the line itself)

**Penerimaan**:
Goods arriving into the stockroom, recorded as a document with a nomor and
its lines. The only way stok goes up in the ordinary course of business.
_Avoid_: pembelian, purchase order, GRN, barang masuk (as a noun)

**Penyesuaian**:
A correction to stok after a physical count. What a person enters is the
**physical count**, never the difference — the difference is computed, and a
catatan explaining it is mandatory.
_Avoid_: koreksi, opname, adjustment

**Kosong / Tersedia**:
A barang whose stok is at or below zero is _kosong_; otherwise _tersedia_. A
kosong barang stays visible in the katalog so a pegawai knows the school
stocks it at all — it simply cannot be requested.
_Avoid_: habis, out of stock, inactive

**Katalog**:
What a pegawai browses to build a keranjang. It carries no stok figures:
tersedia is a yes-or-no. A screen that tells a pegawai how many are left is
reading from a place the katalog does not reach.
_Avoid_: daftar barang, product list

### Requests

**Permintaan**:
One staff member's request for supplies, from keranjang through to handover.
Carries a nomor once submitted, and is charged to the unit kerja copied from
the requester at that moment.
_Avoid_: pengajuan (for the noun), order, requisition

**Keranjang**:
What a pegawai calls a permintaan that has not been submitted yet — the only
kind of draft they ever see. Say _draft_ only when talking about the stored
status value.
_Avoid_: draft (in UI copy), cart

**Permintaan Item**:
One barang and its `jumlah_diminta` on a permintaan. Frozen once the permintaan
leaves keranjang, and the exact quantity that leaves stok on fulfilment.
_Avoid_: baris permintaan, line item, detail

**Keperluan**:
The reason the requester gives for needing the supplies.
_Avoid_: alasan, tujuan, purpose

**Tanggal Permintaan**:
The day a pegawai actually asked for the supplies. Theirs to state, and it may
fall before the day they typed the request in — riwayat and the laporan
konsumsi count by this date, not by the day the row appeared.
_Avoid_: tanggal pengajuan, tanggal input, backdate

**Tanggal Diajukan**:
The day the permintaan reached SIPB, stamped by the system and chosen by no
one. It is what the antrean is ordered by, and the one date on a permintaan
that a person cannot write.
_Avoid_: tanggal masuk, tanggal dicatat, created date

**Dilayani utuh**:
The fulfilment rule: a permintaan is prepared in full or not at all. One short
barang aborts the whole preparation and no mutasi is written. There is no
partial fulfilment and therefore no quantity for an operator to type.
_Avoid_: all-or-nothing (in UI copy), partial fulfilment

**Siapkan**:
The tata usaha collecting a permintaan's barang and taking them out of stok.
The act that writes the outgoing mutasi.
_Avoid_: proses, fulfil, pick

**Serahkan**:
The tata usaha handing prepared goods to the requester. Moves nothing in the
ledger — the stok already left at siapkan.
_Avoid_: kirim, deliver, release

**Alasan Tolak**:
The pengurus barang's written reason for refusing a permintaan. A refusal can
never be reasonless, and the reason can only be written in the same breath as
the refusal.
_Avoid_: catatan penolakan, rejection note

**Antrean**:
A working queue with a bottom — the requests awaiting one specific act, meant
to be drained. Its empty state means "done for today", not "nothing here".
_Avoid_: inbox, daftar tugas, backlog

**Riwayat**:
The accumulating record of requests already decided or completed, newest
first. The counterpart to an antrean.
_Avoid_: histori, arsip, log

### Documents

**Ekspor**:
Handing the rows now on screen — as filtered, in the order shown — to Excel,
where they are sorted, printed, and pasted into whatever the school actually
files. Offered on stok, penerimaan, and permintaan masuk. A copy of a screen,
never a document: it carries no nomor, totals nothing, and decides nothing.
_Avoid_: unduh, download, cetak, laporan

**Laporan Konsumsi**:
The school's account of what each unit kerja consumed over a period. Built by
hand in Excel from the permintaan masuk ekspor — SIPB has no screen for it and
produces no such document. It is nonetheless why several things in here are
strict: unit kerja is a table rather than free text, satuan is reused rather
than retyped, and the count runs by tanggal permintaan. A satuan typed once as
"Pcs" and once as "pcs" becomes two rows in the pivot, and the laporan is wrong
before anyone reads it.
_Avoid_: rekap, laporan pemakaian, report

**Nomor**:
A document's human-readable identifier. A permintaan's nomor encodes the
tanggal permintaan and a per-year sequence: `SPB/2026/09/001` — prefix, year,
month, three-digit counter that resets each year. A penerimaan keeps a single
running sequence: `TRM-000001`. A permintaan gets its nomor at submission,
never before.
_Avoid_: kode, ID, reference number
