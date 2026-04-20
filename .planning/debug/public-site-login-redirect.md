---
status: resolved
trigger: "the public site asks for login — visiting localhost:3000 redirects to /login instead of showing a public landing page"
created: 2026-04-19
updated: 2026-04-19
---

## Symptoms

- **Expected behavior:** Public landing page visible at localhost:3000 without login
- **Actual behavior:** Redirected to /login automatically
- **Error messages:** None — clean redirect
- **Timeline:** Never worked — has always required login
- **Reproduction:** Visit localhost:3000

## Current Focus

- hypothesis: CONFIRMED — proxy.ts re-export pattern prevents Next.js 16 Turbopack from extracting config.matcher, causing auth proxy to run globally
- test: Check .next/dev/server/middleware-manifest.json for empty matcher arrays
- expecting: Both manifests show empty middleware config despite proxy.ts having a matcher
- next_action: none — fix applied
- reasoning_checkpoint: Root cause confirmed and fix applied

## Evidence

- timestamp: 2026-04-19 evidence_type: file_inspection
  file: proxy.ts
  finding: Exports `auth as default` from @/auth with matcher config for /dashboard/:path* and /api/reviews/:path*. But Next.js 16 middleware manifest is empty — matcher not registered.

- timestamp: 2026-04-19 evidence_type: file_inspection
  file: .next/dev/server/middleware-manifest.json
  finding: `"middleware": {}, "sorted_middleware": []` — no matchers registered despite proxy.ts having config.matcher

- timestamp: 2026-04-19 evidence_type: file_inspection
  file: .next/dev/server/middleware.js
  finding: Compiled middleware references proxy.ts as INNER_MIDDLEWARE_MODULE — the proxy IS running, just without matcher filtering

- timestamp: 2026-04-19 evidence_type: file_inspection
  file: src/auth.ts
  finding: No `authorized` callback in NextAuth config — default behavior requires auth on all proxy-intercepted routes

- timestamp: 2026-04-19 evidence_type: config_inspection
  file: src/auth.ts line 56-58
  finding: `pages: { signIn: '/login' }` — this is the redirect target for unauthenticated users

## Eliminated

- src/app/page.tsx — plain public component, no auth logic
- src/app/layout.tsx — no auth wrapper, no session check
- next.config.ts — empty config, no redirects
- No middleware.ts exists (correctly migrated to proxy.ts)
- src/app/dashboard/page.tsx — has its own auth check with redirect, but that's for dashboard only

## Resolution

- root_cause: proxy.ts used `export { auth as default } from '@/auth'` — a re-export pattern that Next.js 16 Turbopack static analysis cannot extract config.matcher from. The middleware manifest was empty, so the auth proxy ran on ALL routes. Unauthenticated visitors to `/` were redirected to `/login`.
- fix: Rewrote proxy.ts to use next-auth v5's `auth(handler)` wrapper pattern with explicit route-pattern checking inside the handler. The proxy function now returns `NextResponse.next()` for non-protected routes and only redirects unauthenticated users on `/dashboard` and `/api/reviews` paths.
- specialist_hint: typescript
