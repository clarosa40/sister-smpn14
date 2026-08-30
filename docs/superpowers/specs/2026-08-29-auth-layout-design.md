# Sub-project 1: Auth + Layout Shell

## Overview

First deliverable for SIPB SMPN 14. Covers authentication (login, session management, password reset) and the authenticated layout shell (sidebar, topbar, responsive drawer). No feature pages yet — those come in sub-projects 2–4.

## Decisions

- **Admin-only registration.** No self-signup. Tata Usaha creates accounts via a future "Kelola Pengguna" page (sub-project 3). This sub-project only builds login + password reset.
- **Next.js 16 Proxy** (not middleware). Session refresh and route protection happen in `src/proxy.ts` → `src/lib/supabase/proxy.ts`.
- **Indonesian language UI** throughout. All labels, messages, and nav items in Bahasa Indonesia.
- **Supabase Auth with SSR.** `@supabase/ssr` handles cookies. Server client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`.
- **Role from `profil` table.** The `handle_new_user` trigger auto-creates a profil row on signup. The app reads `profil.role` directly in the DAL's single profile query; `peran_saya()` stays where it belongs, inside the RLS policies.
- **PKCE flow, not implicit.** `@supabase/ssr` hardcodes `flowType: "pkce"` (`createBrowserClient.js:38`, `createServerClient.js:31`) *after* spreading user options, so it cannot be overridden. Every email link therefore arrives as a one-time token in the **query string** — `?token_hash=` with the template below, `?code=` with the stock one — never as `#access_token=` in the fragment, and must be redeemed by a route handler before a session exists.

## Routes

| Path | Type | Auth | Purpose |
|------|------|------|---------|
| `/login` | Page | Public | Email/password login form |
| `/login/lupa-sandi` | Page | Public | Password reset request (enter email) |
| `/auth/konfirmasi` | Route handler | Public | Redeems the `?token_hash=` from the recovery email, then redirects to `/login/reset-sandi` |
| `/login/reset-sandi` | Page | Recovery session | Set new password (arrives with a session, courtesy of `/auth/konfirmasi`) |
| `/` | Redirect | Private | Redirects to `/beranda` |
| `/beranda` | Page | Private | Dashboard home (placeholder content) |

`/login/reset-sandi` is the odd one out: it is nested under `/login` because it reads as part of the login story, but unlike its siblings the user **does** have a session when they reach it — otherwise `updateUser({ password })` would have nothing to authorize against. The proxy must not treat it as a plain `/login*` path. See [Proxy](#proxy-route-protection).

## Auth Flow

### Login (`/login`)

1. User enters email + password.
2. Client calls `supabase.auth.signInWithPassword()`.
3. On success → `router.push('/beranda')` followed by `router.refresh()`. The push alone can be served from the client-side Router Cache, which was populated while logged out; `refresh()` discards it and re-fetches the server components with the new cookie in place.
4. On error → inline error message below the form ("Email atau kata sandi salah").
5. Already-authenticated users visiting `/login` are redirected to `/beranda`.

### Password Reset

Four steps, because PKCE puts a code-redemption hop between the email and the form.

1. `/login/lupa-sandi`: user enters email → `supabase.auth.resetPasswordForEmail(email, { redirectTo })` where `redirectTo` points at **`/auth/konfirmasi`**, not at the form. The call stashes a code verifier in a cookie.
2. Success shows confirmation message ("Tautan reset telah dikirim ke email Anda").
3. `/auth/konfirmasi` (route handler, `src/app/auth/konfirmasi/route.ts`): reads `token_hash` + `type` from the query string, calls `supabase.auth.verifyOtp({ type: 'recovery', token_hash })` on the server client, and on success redirects to `/login/reset-sandi`. On failure redirects to `/login/lupa-sandi?galat=tautan` so the page can show "Tautan tidak valid atau sudah kedaluwarsa".
4. `/login/reset-sandi`: the session now exists. Page shows new-password form → `supabase.auth.updateUser({ password })` → redirect to `/beranda`.

The Supabase dashboard's **Reset Password** email template must be changed to point at the handler; the stock `{{ .ConfirmationURL }}` assumes the implicit flow:

```
{{ .SiteURL }}/auth/konfirmasi?token_hash={{ .TokenHash }}&type=recovery
```

Do not write the reset page against `window.location.hash` — under PKCE there is nothing in the fragment to read.

### Logout

1. Sidebar logout icon calls `supabase.auth.signOut()`.
2. Redirect to `/login`.

### Proxy (Route Protection)

`src/lib/supabase/proxy.ts` — already scaffolded; the redirect block at lines 39-43 needs uncommenting, and the reverse redirect adding. Two rules, but neither can be a bare `startsWith("/login")` prefix match.

**Public paths are an explicit list, not a prefix.** `/login/reset-sandi` sits under `/login` yet expects a session, so a prefix match sends recovering users to `/beranda` and they can never set a new password. Name the sets instead — it survives sub-project 3 adding more `/login/*` pages:

```ts
// No session expected. Send a logged-in visitor away.
const TANPA_SESI = ["/login", "/login/lupa-sandi"];
// Session expected, but not a normal one. Leave it alone in both directions.
const PEMULIHAN = ["/auth/konfirmasi", "/login/reset-sandi"];
```

- Refresh the session on every request (already done).
- Path in `PEMULIHAN` → pass through untouched, whatever the session state.
- No user, path not in `TANPA_SESI` → redirect to `/login`.
- User exists, path in `TANPA_SESI` → redirect to `/beranda`.

**Every redirect must carry the refreshed cookies.** `supabase.auth.getUser()` spends the refresh token when the access token is stale, and hands the new pair back through `setAll`, which writes `Set-Cookie` onto `supabaseResponse`. Returning a bare `NextResponse.redirect(url)` throws those headers away: the refresh happened server-side but the browser never learns about it, so it retries with the old cookies on the next request. Since Supabase rotates refresh tokens on use, that is at best a wasted round-trip per request and at worst a `/login` ↔ `/beranda` bounce once reuse detection revokes the family. Copy them across:

```ts
const redirectWithCookies = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c));
    return response;
};
```

## Layout Structure

### Route Groups

```
src/app/
  page.tsx             ← redirect to /beranda (outside both route groups)
  auth/
    konfirmasi/
      route.ts         ← redeems ?token_hash= from the recovery email
  (auth)/              ← public routes, no sidebar
    layout.tsx         ← centered card layout (warm gray bg, green accent bar)
    login/
      page.tsx         ← login form
      lupa-sandi/
        page.tsx       ← forgot password
      reset-sandi/
        page.tsx       ← set new password
  (dashboard)/         ← private routes, sidebar layout
    layout.tsx         ← sidebar + topbar shell
    beranda/
      page.tsx         ← dashboard home
```

### Dashboard Layout (`(dashboard)/layout.tsx`)

Server component that:
1. Reads the session via `createClient()` (server).
2. Queries `profil` to get `nama_lengkap`, `role`, `unit_kerja`.
3. Passes user info to the client-side `<AppShell>` component.

### AppShell Component

Client component (`src/components/app-shell.tsx`) containing:

- **Sidebar** (desktop: fixed 240px left column; mobile: hidden).
- **Mobile drawer** (slide-out overlay triggered by hamburger button).
- **Topbar** (56px height, shows current page title; on mobile includes hamburger icon).
- **Content area** (renders `{children}`).

### Sidebar Content

Top section:
- Brand mark: green icon (package) + "SIPB" / "SMPN 14"

Navigation (role-based):

| Pegawai | Tata Usaha | Pengurus Barang |
|---------|-----------|-----------------|
| Beranda | Beranda | Beranda |
| Katalog Barang | Persetujuan | Stok Barang |
| Permintaan Saya | Master Barang | Penerimaan |
| | Unit Kerja | Permintaan Masuk |
| | Kelola Pengguna | Penyesuaian |

Bottom section:
- User avatar (initials) + name + role label
- Logout button (icon)

Active nav item: muted background (`sidebar-accent` token), semibold text. Inactive: no background, muted text.

### Mobile Behavior

- Sidebar hidden by default.
- Topbar gains a hamburger icon on the left.
- Tapping hamburger opens the sidebar as an overlay drawer (280px wide) with a semi-transparent backdrop.
- Tapping backdrop or X icon closes the drawer.

## Components to Build

| Component | Location | Type | Notes |
|-----------|----------|------|-------|
| Auth layout | `(auth)/layout.tsx` | Server | Centered card container, warm gray bg, top accent bar, footer |
| Login form | `(auth)/login/page.tsx` | Server page + client form | Uses shadcn `Input`, `Button`, `Card` |
| Forgot password form | `(auth)/login/lupa-sandi/page.tsx` | Server page + client form | `redirectTo` targets `/auth/konfirmasi`; renders the `?galat=tautan` error |
| Recovery code handler | `auth/konfirmasi/route.ts` | Route handler | `verifyOtp({ type: 'recovery', token_hash })` → redirect to `/login/reset-sandi` |
| Reset password form | `(auth)/login/reset-sandi/page.tsx` | Server page + client form | Session already established by the handler — do **not** read `window.location.hash` |
| AppShell | `src/components/app-shell.tsx` | Client | Sidebar + drawer + topbar |
| SidebarNav | `src/components/sidebar-nav.tsx` | Client | Nav items, role-based filtering |
| `nav-items.ts` | `src/config/nav-items.ts` | Config | Nav item definitions with role, href, icon, label |

## Data Access

### `src/lib/dal.ts` (Data Access Layer)

Opens with `import 'server-only'` so an accidental import from a client component fails at build time rather than shipping the query to the browser. **This package is not currently installed — `npm i server-only`.**

Both exports are wrapped in React `cache()`, per Next's own auth guide. The dashboard layout and the pages beneath it all need the user in the same render pass; without `cache()` that is one Supabase round-trip each.

```typescript
import 'server-only'
import { cache } from 'react'

export const getUser = cache(async (): Promise<User | null> => { ... })
export const getUserOrRedirect = cache(async (): Promise<User> => { ... })
```

`User` shape:
```typescript
type User = {
  id: string
  email: string
  namaLengkap: string
  role: 'pegawai' | 'pengurus_barang' | 'tata_usaha'
  unitKerja: string | null
}
```

The shape spans two sources, and the spelling matters:

- `id` and `email` come from `supabase.auth.getUser()` — `profil` has no email column (`skema.sql:54-62`); Supabase Auth owns the address.
- `namaLengkap`, `role`, `unitKerja` come from one `profil` select joined to `unit_kerja`, resolving the `unit_kerja_id` FK into `unit_kerja.nama`. `unitKerja` is nullable because `profil.unit_kerja_id` is (`skema.sql:57`).

Use `getUser()`, never `getSession()` — the latter reads the cookie without revalidating it against Supabase.

Read `role` straight off that select. Do **not** also call `peran_saya()`: the row is already in hand, and the function is a second round-trip that answers a question the query just answered. `peran_saya()` exists for RLS policies, which have no such row available.

`getUserOrRedirect()` calls `getUser()` and if null, calls `redirect('/login')`. Used by `(dashboard)/layout.tsx`.

## Prerequisites

- `npm i server-only` — guards `src/lib/dal.ts`. Not currently in `package.json`.
- Supabase dashboard → Authentication → Email Templates → **Reset Password**: repoint at `/auth/konfirmasi` (see [Password Reset](#password-reset)).

## Existing Code to Modify

1. **`src/lib/supabase/proxy.ts`** — Uncomment the redirect block; add the authenticated-user-on-login redirect; replace prefix matching with the `TANPA_SESI` / `PEMULIHAN` lists; copy `supabaseResponse` cookies onto every redirect.
2. **`src/app/layout.tsx`** — Update metadata title/description to "SIPB SMPN 14" and lang to "id".
3. **`src/app/page.tsx`** — Replace "Hello world" with redirect to `/beranda`.

## What This Sub-project Does NOT Include

- User management (creating/editing accounts) — sub-project 3.
- Any feature pages (catalog, requests, stock, approvals) — sub-projects 2–4.
- Dark mode toggle — just respects system preference via existing CSS tokens.
- Profile editing — future scope.

## Testing Approach

- Manual browser testing: login flow, redirect behavior, sidebar navigation, mobile drawer.
- Verify proxy redirects work for both unauthenticated and authenticated users.
- Check each role shows correct nav items (requires test accounts in Supabase).
- **Walk the whole reset chain end to end** — request the link, open the real email, land on `/auth/konfirmasi`, arrive at the form with a session, set the password, log in with it. The PKCE hop and the proxy exception only fail together in the real flow; neither shows up when visiting `/login/reset-sandi` directly.
- **Test a reset link twice.** `verifyOtp` codes are single-use, so the second click must land on `/login/lupa-sandi?galat=tautan`, not on a blank form.
- **Test with an expired access token.** Log in, wait out the token lifetime (or shorten it in the dashboard), then hit `/login` — the redirect to `/beranda` must keep you logged in. This is the case that catches dropped cookies; a fresh session passes even when the bug is present.
