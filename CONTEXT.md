# SIPB SMPN 14

Sistem Permintaan Barang: a school stockroom system where staff request
consumable supplies, an administrator approves them, and a storekeeper
fulfils them. One school, one stockroom, three roles.

Prose in this repo is English; identifiers, UI copy, and the terms below are
Bahasa Indonesia. That split is deliberate — the people using the system read
Indonesian, and every name they see should match what they say out loud.

## Language

### People and roles

**Pegawai**:
A member of school staff who requests supplies. The default role every new
account gets.
_Avoid_: user, requester, employee (as a role name)

**Pengurus Barang**:
The storekeeper. The only role that moves physical stock — receiving goods,
preparing requests, handing them over, correcting counts. Known in the school
as sarpras.
_Avoid_: sarpras (in code), warehouse staff, admin gudang

**Tata Usaha**:
School administration. Approves or refuses requests and owns all master data.
_Avoid_: admin, TU (in code)

**Unit Kerja**:
The department a pegawai belongs to, and the department a permintaan is
charged to. A table, not free text, so consumption reports never split over a
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
What a pegawai browses to build a keranjang. It carries no numbers at all,
only tersedia as a yes-or-no.
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
fall before the day they typed the request in — riwayat and consumption reports
count by this date, not by the day the row appeared.
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
The pengurus barang collecting a permintaan's barang and taking them out of
stok. The act that writes the outgoing mutasi.
_Avoid_: proses, fulfil, pick

**Serahkan**:
The pengurus barang handing prepared goods to the requester. Moves nothing in
the ledger — the stok already left at siapkan.
_Avoid_: kirim, deliver, release

**Alasan Tolak**:
The tata usaha's written reason for refusing a permintaan. A refusal can never
be reasonless, and the reason can only be written in the same breath as the
refusal.
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

**Nomor**:
A document's human-readable identifier, from a single running sequence:
`SPB-000001` for a permintaan, `TRM-000001` for a penerimaan. A permintaan
gets one at submission, never before.
_Avoid_: kode, ID, reference number
