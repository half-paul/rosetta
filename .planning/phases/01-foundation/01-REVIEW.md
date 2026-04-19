---
phase: 01-foundation
reviewed: 2026-04-18T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - drizzle.config.ts
  - proxy.ts
  - src/app/api/auth/[...nextauth]/route.ts
  - src/app/dashboard/page.tsx
  - src/app/layout.tsx
  - src/app/login/page.tsx
  - src/auth.ts
  - src/components/ui/alert.tsx
  - src/components/ui/card.tsx
  - src/components/ui/input.tsx
  - src/components/ui/label.tsx
  - src/components/ui/separator.tsx
  - src/db/index.ts
  - src/db/schema.ts
  - src/lib/ai-registry.ts
  - src/lib/boss.ts
  - src/lib/mediawiki.ts
  - src/types/index.ts
  - src/workers/index.ts
  - tests/auth/credentials.test.ts
  - tests/db/schema.test.ts
  - tests/jobs/boss.test.ts
  - tests/lib/ai-registry.test.ts
  - tests/lib/mediawiki.test.ts
  - tests/setup.ts
  - vitest.config.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-18T00:00:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

This is a well-structured foundation phase. Auth configuration follows NextAuth v5 conventions correctly, the schema design is sound, and security fundamentals (bcrypt work factor, password hash exclusion from session, JWT strategy for credentials provider) are properly implemented. The `server-only` import guards are applied consistently across server modules.

Two critical issues require fixes before this phase is signed off: missing OAuth provider env var guards that will produce opaque runtime failures in production, and a `PgBoss` singleton that is returned before `.start()` is called, making it unusable by callers. Four warnings address unsafe array destructuring in worker handlers, an incomplete `mediawikiFetch` contract, a nullable-unique email edge case, and incomplete test isolation. Three informational items cover minor inconsistencies.

---

## Critical Issues

### CR-01: OAuth providers initialized without env var guards

**File:** `src/auth.ts:14-21`

**Issue:** `GITHUB_ID`, `GITHUB_SECRET`, `GOOGLE_ID`, and `GOOGLE_SECRET` are passed directly to the provider constructors without any null/undefined guard. NextAuth accepts `undefined` silently at module load time, but OAuth flows will fail at runtime with cryptic errors when these vars are absent (e.g., in a new deployment or CI environment that hasn't set them). This is inconsistent with the explicit fail-fast guard applied to `DATABASE_URL` in `src/db/index.ts`.

**Fix:**
```typescript
// src/auth.ts — add guards before the NextAuth() call
if (!process.env.GITHUB_ID || !process.env.GITHUB_SECRET) {
  throw new Error('GITHUB_ID and GITHUB_SECRET are required')
}
if (!process.env.GOOGLE_ID || !process.env.GOOGLE_SECRET) {
  throw new Error('GOOGLE_ID and GOOGLE_SECRET are required')
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // ... rest unchanged
})
```

Alternatively, if OAuth providers are intentionally optional in some environments, conditionally include them in the `providers` array only when the vars are present. Either approach is acceptable; the current silent acceptance of `undefined` is not.

---

### CR-02: `getBoss()` returns an unstarted `PgBoss` instance

**File:** `src/lib/boss.ts:7-16`

**Issue:** `getBoss()` constructs and returns a `PgBoss` instance but never calls `boss.start()`. `PgBoss` requires `.start()` to be awaited before any job operations (send, work, fetch) can succeed — the internal polling loop and schema setup happen in `start()`. Any caller that obtains the instance from `getBoss()` and immediately enqueues or registers workers will receive errors or silently dropped operations. The `src/workers/index.ts` correctly calls `.start()` on its own locally constructed instance, but any future server-side code that calls `getBoss()` from this module will not.

**Fix:**
```typescript
// src/lib/boss.ts — export a started-boss promise, not a raw instance

import 'server-only'
import { PgBoss } from 'pg-boss'

let bossPromise: Promise<PgBoss> | null = null

export function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for pg-boss')
    }
    const instance = new PgBoss(process.env.DATABASE_URL)
    instance.on('error', console.error)
    bossPromise = instance.start().then(() => instance)
  }
  return bossPromise
}
```

Callers then `await getBoss()` and receive a ready instance. This matches the pattern used throughout the test suite and `src/workers/index.ts`.

---

## Warnings

### WR-01: Unsafe `[job]` destructuring in worker callbacks — no empty-batch guard

**File:** `src/workers/index.ts:25`
**File:** `tests/jobs/boss.test.ts:24`, `tests/jobs/boss.test.ts:51`

**Issue:** Worker callbacks destructure the batch array as `async ([job]) => { ... }`. If `pg-boss` delivers an empty batch (which can happen during graceful shutdown or certain edge cases), `job` is `undefined` and any access to `job.id` or `job.data` will throw a `TypeError` at runtime, causing the job to be retried unnecessarily.

**Fix:**
```typescript
// src/workers/index.ts
await boss.work('analysis-jobs', async (jobs) => {
  const job = jobs[0]
  if (!job) return  // defensive guard
  console.log(`Processing job ${job.id}`, job.data)
})
```

Apply the same pattern to the test worker callbacks in `tests/jobs/boss.test.ts`.

---

### WR-02: `mediawikiFetch` does not validate HTTP response status

**File:** `src/lib/mediawiki.ts:3-14`

**Issue:** The function returns the raw `Response` object without checking `response.ok`. Every future caller must independently remember to check the status code. When the Wikipedia API returns a 4xx or 5xx, callers that omit this check will silently process an error response body as if it were a valid article payload. Given that this is the sole HTTP abstraction for all Wikipedia fetches in the system, a contract-level guard here prevents a class of bugs across all future consumers.

**Fix:**
```typescript
export async function mediawikiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(
      `MediaWiki fetch failed: ${response.status} ${response.statusText} — ${url}`
    )
  }

  return response
}
```

If some callers legitimately need to inspect non-2xx responses (e.g., 404 for missing articles), consider adding an `{ throwOnError?: boolean }` option parameter.

---

### WR-03: `users.email` is nullable-unique — multiple NULL emails bypass uniqueness

**File:** `src/db/schema.ts:32`

**Issue:** `email: text('email').unique()` without `.notNull()` means PostgreSQL will allow multiple rows with `email = NULL` (ANSI SQL: `NULL != NULL`). OAuth providers that don't supply an email can create multiple user rows with `null` emails. While the credentials `authorize` function safely handles this (it would find zero matching rows for `null` email), the adapter could theoretically create duplicate null-email users, and any future query joining on email would produce unpredictable results. The `@auth/drizzle-adapter` schema reference uses the same nullable pattern, so this may be intentional — but it warrants an explicit decision and, if null emails are expected, a partial unique index.

**Fix (if null emails should be rejected):**
```typescript
email: text('email').unique().notNull(),
```

**Fix (if null emails are permitted for emailless OAuth providers, enforce uniqueness only on non-null):**
```sql
-- Add to migration:
CREATE UNIQUE INDEX user_email_unique_non_null ON "user" (email) WHERE email IS NOT NULL;
-- And remove the Drizzle-level .unique() to avoid generating a full unique index
```

---

### WR-04: Test database cleanup does not remove `users` rows — cross-test contamination risk

**File:** `tests/db/schema.test.ts:11-19`

**Issue:** `cleanTestData()` deletes all domain tables in reverse FK order, but does not delete from `users`. The `reviews` table references `users.reviewer_id`. If a future test inserts a `review` row referencing a test user, and that user was created by `tests/auth/credentials.test.ts` running in the same DB session, `cleanTestData()` will fail on the FK constraint when deleting `reviews`. More broadly, `users` rows persist across test runs, which can cause the `credentials.test.ts` `beforeAll` delete to be the only cleanup mechanism — and it only cleans its own email address.

**Fix:**
```typescript
async function cleanTestData() {
  await db.delete(schema.reviews)
  await db.delete(schema.commentaries)
  await db.delete(schema.claims)
  await db.delete(schema.scores)
  await db.delete(schema.paragraphs)
  await db.delete(schema.sections)
  await db.delete(schema.articles)
  // Add user cleanup — only test-scoped users, or use a test-email prefix convention
  // e.g.: await db.delete(schema.users).where(like(schema.users.email, '%-test@%'))
}
```

Alternatively, wrap each test suite in a database transaction that is rolled back in `afterAll`, eliminating the need for manual cleanup entirely.

---

## Info

### IN-01: `vitest.config.ts` sets `globals: true` but tests use explicit imports

**File:** `vitest.config.ts:9`
**File:** `tests/auth/credentials.test.ts:1`, `tests/db/schema.test.ts:1`, `tests/jobs/boss.test.ts:1`, etc.

**Issue:** `globals: true` in the Vitest config makes `describe`, `it`, `expect`, `vi`, etc. available globally without imports. However, all test files explicitly import these from `'vitest'`. The config setting is therefore unused. This is not a bug, but the inconsistency means `globals: true` provides no benefit and could be removed to avoid misleading future contributors about the intended import style.

**Fix:** Either remove `globals: true` from `vitest.config.ts` (recommended — keep explicit imports), or remove the explicit `vitest` imports from all test files and rely on globals. The explicit import approach is preferable for IDE type support without additional `tsconfig` configuration.

---

### IN-02: `src/lib/boss.ts` error handler uses `console.error` directly

**File:** `src/lib/boss.ts:13`

**Issue:** `boss.on('error', console.error)` pipes all pg-boss internal errors to stderr with no context (no timestamp, no severity label, no queue name). In a production environment this makes errors difficult to correlate with job activity. This matches the pattern in `src/workers/index.ts:9`, so it's consistent — but worth noting for Phase 3 when observability becomes more important.

**Fix:** Wrap in a labeled handler:
```typescript
boss.on('error', (err) => {
  console.error('[pg-boss error]', err)
})
```

---

### IN-03: `src/lib/mediawiki.ts` uses a placeholder contact URL

**File:** `src/lib/mediawiki.ts:1`

**Issue:** The `USER_AGENT` string contains `rosetta.example.com` and `contact@rosetta.example.com`. Wikimedia's API bot policy requires a real contact address. These should come from environment variables or be updated before the service makes real Wikipedia API calls.

**Fix:**
```typescript
const USER_AGENT = `Rosetta/1.0 (${process.env.APP_URL ?? 'https://rosetta.example.com'}; ${process.env.CONTACT_EMAIL ?? 'contact@rosetta.example.com'})`
```

Or enforce via env var guards consistent with the project's fail-fast pattern.

---

_Reviewed: 2026-04-18T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
