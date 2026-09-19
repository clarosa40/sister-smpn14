# SIPB SMPN 14

Sistem Permintaan Barang: a school stockroom system where staff request
consumable supplies, an asset officer approves them, and an administrator
fulfils them. One school, one stockroom, three roles.

## Running it

Add a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Then:

```bash
npm run dev
```

## Testing

```bash
npm test
```

## Docs

- [`CONTEXT.md`](./CONTEXT.md) — domain language and roles
- [`docs/adr/`](./docs/adr/) — architecture decision records
- [`docs/agents/`](./docs/agents/) — how agents work in this repo
- [`impor/README.md`](./impor/README.md) — importing pegawai from an Excel file
