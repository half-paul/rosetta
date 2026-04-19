---
phase: 01-foundation
plan: 03
subsystem: authentication
tags: [nextauth, credentials, oauth, login, dashboard, jwt, middleware]
dependency_graph:
  requires:
    - 01-01 (drizzle schema + users table with passwordHash, shadcn components)
  provides:
    - nextauth-v5-config
    - credentials-auth
    - oauth-providers
    - login-page
    - dashboard-shell
    - route-protection
  affects:
    - all future authenticated routes
    - phase 2+ API routes protected via proxy matcher
tech_stack:
  added:
    - next-auth 5.0.0-beta.31 (Credentials + GitHub + Google providers, JWT strategy)
    - bcryptjs (timing-safe password comparison)
    - @auth/drizzle-adapter 1.11.2 (NextAuth <> Drizzle ORM bridge)
  patterns:
    - NextAuth v5 JWT session strategy (D-04, avoids Pitfall 2)
    - DrizzleAdapter connecting NextAuth to PostgreSQL via existing users table
    - proxy.ts (Next.js 16 renamed middleware.ts to proxy.ts)
    - Client Component login form with signIn from next-auth/react
    - Server Component dashboard with auth() session check
    - Generic error messages to prevent user enumeration (T-03-05)
key_files:
  created:
    - src/auth.ts (NextAuth v5 config — exports handlers, signIn, signOut, auth)
    - proxy.ts (Next.js 16 proxy — route protection for /dashboard and /api/reviews)
    - src/app/api/auth/[...nextauth]/route.ts (NextAuth route handler — GET + POST)
    - src/app/login/page.tsx (full UI-SPEC.md login page implementation)
    - src/app/dashboard/page.tsx (protected dashboard shell with empty state)
  modified:
    - src/app/layout.tsx (updated metadata title/description to Rosetta)
decisions:
  - proxy.ts used instead of middleware.ts — Next.js 16 renamed middleware to proxy (deprecated)
  - JWT session strategy (D-04) — avoids Credentials + database session conflict (Pitfall 2)
  - Generic error messages in login form — prevents user enumeration (T-03-05)
  - Error messages mapped from NextAuth error codes (URL searchParam) to UI copy
metrics:
  duration: 3 minutes
  completed: 2026-04-19
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 1
---

# Phase 01 Plan 03: Authentication and UI Shell Summary

**One-liner:** NextAuth v5 with JWT strategy, DrizzleAdapter, Credentials + Google + GitHub providers wired to login page and protected dashboard shell following complete UI-SPEC.md contract.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Configure NextAuth v5 with Credentials + OAuth, route handler, and proxy | bab23b1 | src/auth.ts, proxy.ts, src/app/api/auth/[...nextauth]/route.ts |
| 2 | Create login page and dashboard shell per UI-SPEC.md | f5ba24a | src/app/login/page.tsx, src/app/dashboard/page.tsx, src/app/layout.tsx |
| 3 | Human-verify checkpoint (auto-approved in --auto mode) | — | — |

## What Was Built

### Authentication (src/auth.ts)
- NextAuth v5 configured with three providers: Credentials (email/password), GitHub OAuth, Google OAuth
- `DrizzleAdapter(db)` connects NextAuth to the existing `users` table in PostgreSQL
- JWT session strategy (`strategy: 'jwt'`) per D-04 — avoids Pitfall 2 (Credentials + database session conflict)
- `authorize()` callback uses `bcryptjs.compare` for timing-safe password validation (T-03-01)
- Returns null (not error details) on invalid credentials — prevents user enumeration (T-03-05)
- Session callback exposes only `id`, `name`, `email`, `image` — no sensitive fields (T-03-06)
- `pages: { signIn: '/login' }` routes unauthenticated users to the login page

### Route Protection (proxy.ts)
- Next.js 16 renamed `middleware.ts` to `proxy.ts` (middleware is deprecated in v16)
- Re-exports NextAuth `auth` as default proxy function
- Matcher protects `/dashboard/:path*` and `/api/reviews/:path*`
- T-03-04: Matcher explicitly excludes `/api/auth/*` — avoids intercepting NextAuth callback handlers

### Login Page (src/app/login/page.tsx)
- Client Component implementing full UI-SPEC.md Layout, Copywriting, Accessibility, and Interaction contracts
- Floating header above card: "Welcome back" (24px semibold) + "Sign in to your Rosetta account" (14px muted)
- Card with `p-8` containing: conditional error Alert, email/password form, OAuth separator, OAuth buttons
- Error display: `<Alert variant="destructive" role="alert">` — screen readers announce on insertion
- Generic error messages mapped from NextAuth URL error codes (prevents enumeration)
- Submit button: `aria-disabled="true"` + `aria-busy="true"` when loading, text changes to "Signing in..."
- OAuth buttons: `variant="outline"`, `min-h-[44px]` touch targets, `aria-hidden="true"` on SVG icons
- Tab order: Email → Password → Sign in → Google → GitHub (matches visual order)
- `signIn('credentials', { email, password, redirectTo: '/dashboard' })` for credentials
- `signIn('google'/'github', { redirectTo: '/dashboard' })` for OAuth

### Dashboard Shell (src/app/dashboard/page.tsx)
- Server Component with `const session = await auth()` — redirects to `/login` if no session
- Topnav: `h-14 border-b bg-background px-6` with "Rosetta" wordmark and reviewer display name
- Main: `flex-1 flex items-center justify-center` centering empty state
- Empty state: "No articles yet" heading + exact UI-SPEC.md body copy

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Breaking Change] Used proxy.ts instead of middleware.ts**
- **Found during:** Task 1 (pre-execution AGENTS.md docs check)
- **Issue:** Next.js 16 renamed `middleware` to `proxy`. The plan spec says to create `middleware.ts`, but AGENTS.md requires reading Next.js docs and heeding deprecation notices. The proxy.md API reference states: "The middleware file convention is deprecated and has been renamed to proxy."
- **Fix:** Created `proxy.ts` at project root instead of `middleware.ts`. The export pattern is compatible: NextAuth's `auth` function works as a default proxy export.
- **Files modified:** proxy.ts (created; middleware.ts not created)
- **Commits:** bab23b1

**2. [Rule 2 - Missing Copy] Layout metadata updated to Rosetta**
- **Found during:** Task 2 — existing layout.tsx had "Create Next App" title
- **Fix:** Updated `title: "Rosetta"` and `description: "AI-accelerated Wikipedia fact-checking"` in metadata
- **Files modified:** src/app/layout.tsx
- **Commits:** f5ba24a

## Checkpoint Handling

**Task 3 (checkpoint:human-verify):** Auto-approved via `--auto` mode (`_auto_chain_active: true`).
What was built: Login page at /login and dashboard shell at /dashboard with NextAuth v5 authentication.

## Known Stubs

None — all UI copy is final per UI-SPEC.md Copywriting Contract. Error messages are fully mapped. Dashboard empty state copy is intentional (populated in Phase 4 when article queue exists).

## Threat Flags

No new threat surface beyond the plan's threat model. All STRIDE mitigations applied:
- T-03-01: bcryptjs.compare timing-safe; authorize returns null (not error detail)
- T-03-02: NextAuth handles PKCE and state parameter internally for OAuth
- T-03-03: AUTH_SECRET env var required; NextAuth refuses to start without it
- T-03-04: proxy.ts matcher excludes /api/auth/* to avoid intercepting callbacks
- T-03-05: Error messages are generic — never reveal whether email exists
- T-03-06: JWT session callback only exposes id/name/email/image

## Self-Check: PASSED

Files verified present:
- src/auth.ts — FOUND
- proxy.ts — FOUND
- src/app/api/auth/[...nextauth]/route.ts — FOUND
- src/app/login/page.tsx — FOUND
- src/app/dashboard/page.tsx — FOUND
- src/app/layout.tsx — FOUND (modified)

Commits verified:
- bab23b1 (Task 1) — FOUND in git log
- f5ba24a (Task 2) — FOUND in git log

TypeScript compile: PASS (zero errors)
