# Password recovery is a tata usaha errand, not an email link

A forgotten password is settled by asking tata usaha, who issues a **sandi
sementara** from `/pengguna` and reads it out; the holder is then forced
through `/ganti-sandi` on their next visit. The self-service recovery chain —
`/login/lupa-sandi`, `/auth/konfirmasi`, `/login/reset-sandi`, the token-parking
cookie in `lib/pemulihan.ts`, and the `Lupa kata sandi?` link on the login form
— is removed, and `/login` is the only path the proxy lets through without a
session.

The chain was built, worked, and was never reachable by a real user. Supabase's
free tier ships no email delivery of its own: the shared SMTP sender is capped
at a handful of messages an hour and is explicitly not for production, so a
recovery email addressed to a teacher would either not arrive or arrive too late
to matter. Making it real needs a paid SMTP provider and a domain to send from —
a running cost and an ownership question for a one-school system whose entire
staff can walk to the tata usaha office. Every account already sits on a fixed
domain that receives nothing, chosen to identify a person rather than reach
one — recovery by email was never reachable, not even on paper.

## Considered options

**Keeping the code and waiting for SMTP.** Rejected. Working code that no one
can reach still has to be read, kept compiling, and reasoned about on every
change to authentication. It also carried a parked bug of its own: recovering
through the link ran `updateUser()` on the user's own session, which cannot
write `app_metadata`, so an account that reset this way kept `sandi_sementara`
attached and was sent back to `/ganti-sandi` anyway. The proxy paid for it too —
a whole `PEMULIHAN` list existed only because `/login/reset-sandi` expects a
session while sitting under `/login`, which does not.

**Wiring a paid SMTP provider now.** Rejected as premature, not as wrong. It is
the option to revisit the day the school outgrows walking distance — multiple
campuses, staff who work off-site, or a tata usaha who cannot be reached the
same day. Until then the recurring cost buys a convenience that a two-minute
conversation already provides.

**Signposting the login form with "hubungi tata usaha".** Deliberately not
added. The people affected already know who tata usaha is; a line of text on a
login screen is not what teaches them.

## Consequences

Nobody can regain access to an account without another human, which is the point
and also the risk: if the only tata usaha loses their password, no one in the
application can help them. That case is recovered through SQL against the
database — the same escape hatch that seeds the first tata usaha in `seed.sql`,
and the same one noted in `pengguna/actions.ts` for a school that demotes its
way down to zero administrators.

`sandi_sementara` is now the sole route by which a password is set without
knowing the old one, so it is the only path that has to be right. `/ganti-sandi`
clears the marker with the service-role client, and the parked
`app_metadata` bug above disappears with the code that caused it.

Everything under `docs/superpowers/` still describes the recovery chain — the
specs that designed it, and the plans that name `/auth/konfirmasi` as a live
landing point or point at `HasilReset` for the shape a server action returns.
Those are kept as a record of what was built and why, not as a description of
the system; where they and this ADR disagree, this ADR is what the code follows.
