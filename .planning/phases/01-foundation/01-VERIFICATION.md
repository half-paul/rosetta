---
phase: 01-foundation
verified: 2026-04-18T12:00:00Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
re_verification: false
gaps:
  - truth: "pg-boss can enqueue a job, a worker picks it up, and it completes exactly once"
    status: partial
    reason: "The pg-boss integration tests pass using a locally-constructed PgBoss instance in the test file. The getBoss() singleton in src/lib/boss.ts is architecturally broken: it constructs and returns a PgBoss instance without ever calling .start(). Any API route that calls getBoss() then attempts boss.send() will fail at runtime because PgBoss requires .start() to be awaited before any job operations succeed. The worker (src/workers/index.ts) correctly calls .start() on its own local instance, so the worker side works. The sending side — the singleton API routes will use in Phase 4 — does not."
    artifacts:
      - path: "src/lib/boss.ts"
        issue: "getBoss() returns an unstarted PgBoss instance. PgBoss.send() called on an unstarted instance fails silently or throws. The tests bypass this module entirely, using raw `new PgBoss(...)` directly."
    missing:
      - "Change getBoss() to return Promise<PgBoss> and call instance.start() before resolving. Pattern: let bossPromise: Promise<PgBoss> | null = null; then bossPromise = instance.start().then(() => instance). Callers await getBoss() to receive a started instance."
---

# Phase 1: Foundation Verification Report

**Phase Goal:** The infrastructure skeleton that every other phase builds on is in place — stable paragraph-anchored schema, background job queue, provider-agnostic LLM interface, and reviewer authentication
**Verified:** 2026-04-18T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All five come from ROADMAP.md Phase 1 Success Criteria.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A reviewer can log in with email/password and via OAuth (Google/GitHub) and reach a protected dashboard route | VERIFIED | `src/auth.ts` exports `{ handlers, signIn, signOut, auth }` with Credentials + GitHub + Google providers using JWT strategy. `proxy.ts` protects `/dashboard/:path*`. Login page implements full UI-SPEC.md contract with signIn() calls. Dashboard performs server-side auth() check and redirects on no session. |
| 2 | The database schema accepts article, section, paragraph, claim, commentary, review, reviewer, and score rows with referential integrity enforced | VERIFIED | 11 tables in `src/db/schema.ts` (4 auth + 7 domain): `user`, `account`, `session`, `verificationToken`, `article`, `section`, `paragraph`, `claim`, `commentary`, `review`, `score`. FK constraints with `onDelete: 'cascade'` on all domain FK columns. `reviewStatusEnum` pgEnum enforces valid status values. Integration tests in `tests/db/schema.test.ts` verify FK cascade, unique constraints, and enum rejection against live PostgreSQL. |
| 3 | A pg-boss job can be enqueued, picked up by a worker, and completed with exactly-once delivery confirmed in tests | PARTIAL | Tests in `tests/jobs/boss.test.ts` pass — exactly-once delivery and dead-letter routing confirmed using raw `new PgBoss(...)` instances. However, `src/lib/boss.ts` `getBoss()` returns an **unstarted** PgBoss instance. PgBoss requires `.start()` before any job operations. Any Phase 4 API route calling `getBoss().send()` will fail at runtime. The singleton is the intended API surface for job sending — it is currently broken for that purpose. |
| 4 | Switching the active LLM provider (e.g., Claude to GPT-4) requires only a configuration change — no code changes | VERIFIED | `src/lib/ai-registry.ts` uses `createProviderRegistry({ anthropic, openai })`. All LLM calls go through `registry.languageModel(process.env.AI_MODEL!)`. Tests in `tests/lib/ai-registry.test.ts` confirm both providers resolve via the registry and env var switching works without code changes. |
| 5 | All MediaWiki API requests include a descriptive User-Agent header per Wikimedia policy | VERIFIED | `src/lib/mediawiki.ts` sets `User-Agent: Rosetta/1.0 (https://rosetta.example.com; contact@rosetta.example.com)` on every request. Tests in `tests/lib/mediawiki.test.ts` verify format matches Wikimedia policy (`/^Rosetta\/\d+\.\d+\s*\(/`) and caller headers are preserved alongside User-Agent. |

**Score:** 4/5 truths verified (1 partial = gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docker-compose.yml` | PostgreSQL 16 + pgAdmin services | VERIFIED | `image: postgres:16`, `image: dpage/pgadmin4`, `depends_on: postgres`, volume mounted |
| `src/db/schema.ts` | Full Drizzle schema with auth + domain tables | VERIFIED | 11 pgTable exports + reviewStatusEnum pgEnum. All domain tables have CUID2 PKs, deletedAt, createdAt, updatedAt, FK constraints with cascade. `stableId` on paragraphs. `passwordHash` on users. |
| `src/db/index.ts` | Singleton db instance export | VERIFIED | `import 'server-only'`, Pool with DATABASE_URL guard, `export const db = drizzle(pool, { schema })` |
| `src/types/index.ts` | Domain type exports inferred from schema | VERIFIED | Exports Article, NewArticle, Section, NewSection, Paragraph, Claim, Commentary, Review, Score, User, ReviewStatus via `$inferSelect` |
| `drizzle.config.ts` | Drizzle Kit config scoped to src/db/schema.ts | VERIFIED | `schema: './src/db/schema.ts'` (explicit path, not glob), `dialect: 'postgresql'` |
| `vitest.config.ts` | Test framework config with path alias and setupFiles | VERIFIED | `resolve.alias['@']`, `setupFiles: ['./tests/setup.ts']`, `environment: 'node'` |
| `src/lib/boss.ts` | pg-boss singleton for job sending | PARTIAL | Exports `getBoss()` with server-only guard and no `boss.start()` anti-pattern. **Critical defect:** returns unstarted instance — callers cannot send jobs without calling .start() themselves, defeating the singleton pattern. |
| `src/workers/index.ts` | Worker entrypoint with queue registration | VERIFIED | Calls `boss.start()`, creates `analysis-jobs` queue with `retryLimit: 3`, `retryDelay: 60`, `retryBackoff: true`, `expireInSeconds: 900`, `deadLetter: 'analysis-failures'`. Registers worker. |
| `src/lib/ai-registry.ts` | Provider-agnostic LLM registry | VERIFIED | `import 'server-only'`, `export const registry = createProviderRegistry({ anthropic, openai })`. No direct provider usage outside this file. |
| `src/lib/mediawiki.ts` | MediaWiki fetch wrapper with User-Agent | VERIFIED | `export async function mediawikiFetch`, `USER_AGENT = 'Rosetta/1.0 (...)'`, header set on every call |
| `src/auth.ts` | NextAuth v5 config with Credentials + GitHub + Google | VERIFIED | Exports `{ handlers, signIn, signOut, auth }`. DrizzleAdapter, JWT strategy, bcryptjs.compare, pages: { signIn: '/login' }, jwt + session callbacks. |
| `proxy.ts` | Route protection (Next.js 16 renames middleware.ts to proxy.ts) | VERIFIED | `export { auth as default } from '@/auth'`, matcher: `['/dashboard/:path*', '/api/reviews/:path*']`, excludes `/api/auth/*`. Next.js 16 dist confirms `proxy.ts` is the correct filename replacing `middleware.ts`. |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler | VERIFIED | `import { handlers } from '@/auth'`, `export const { GET, POST } = handlers` |
| `src/app/login/page.tsx` | Login page with email/password form + OAuth buttons | VERIFIED | `'use client'`, "Welcome back", "Sign in to your Rosetta account", "Email address", "or continue with", "Continue with Google", "Continue with GitHub", `signIn('credentials', ...)`, `role="alert"`, `aria-disabled`, `aria-hidden="true"` on SVG icons, `min-h-[44px]` |
| `src/app/dashboard/page.tsx` | Protected dashboard shell with empty state | VERIFIED | `const session = await auth()`, `redirect('/login')` on no session, "No articles yet", "h-14 border-b", "Rosetta" wordmark, `session.user.name || session.user.email` |
| `tests/lib/ai-registry.test.ts` | AI registry unit tests | VERIFIED | Contains `registry.languageModel`, 3 tests covering both providers + env var switching |
| `tests/lib/mediawiki.test.ts` | MediaWiki client unit tests | VERIFIED | Contains `User-Agent` assertion, 3 tests covering header format, caller headers, Wikimedia policy format |
| `tests/jobs/boss.test.ts` | pg-boss lifecycle integration test | VERIFIED | Contains `boss.start()`, 2 tests: exactly-once delivery + dead-letter routing |
| `tests/db/schema.test.ts` | Schema integration tests | VERIFIED | Imports `from '@/db/schema'`, 6 tests: insert, full chain, FK cascade, score uniqueness, enum enforcement, wikiUrl uniqueness |
| `tests/auth/credentials.test.ts` | Credentials auth integration tests | VERIFIED | Contains `bcryptjs.hash`, `bcryptjs.compare`, 5 tests: valid login, wrong password, missing user, OAuth-only user, work factor >= 12 |
| `tests/setup.ts` | Vitest server-only mock | VERIFIED | `vi.mock('server-only', () => ({}))` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/db/index.ts` | `src/db/schema.ts` | `import * as schema from './schema'` | VERIFIED | Line 4: `import * as schema from './schema'` |
| `src/types/index.ts` | `src/db/schema.ts` | `$inferSelect` type extraction | VERIFIED | Imports named tables, uses `$inferSelect` on each |
| `src/lib/boss.ts` | `pg-boss` | `new PgBoss` constructor with DATABASE_URL | VERIFIED | `boss = new PgBoss(process.env.DATABASE_URL)` — constructor wired, but `.start()` missing |
| `src/lib/ai-registry.ts` | `ai` SDK | `createProviderRegistry` | VERIFIED | `import { createProviderRegistry } from 'ai'`, `export const registry = createProviderRegistry(...)` |
| `src/workers/index.ts` | `pg-boss` | `new PgBoss` (separate instance for worker) | VERIFIED | Own PgBoss instance with `.start()` called |
| `src/auth.ts` | `src/db/schema.ts` | `DrizzleAdapter` reading users table | VERIFIED | `DrizzleAdapter(db)` where `db` uses the full schema including `users` |
| `proxy.ts` | `src/auth.ts` | re-exports `auth` as default | VERIFIED | `export { auth as default } from '@/auth'` |
| `src/app/api/auth/[...nextauth]/route.ts` | `src/auth.ts` | imports `handlers` | VERIFIED | `import { handlers } from '@/auth'` |
| `src/app/dashboard/page.tsx` | `src/auth.ts` | calls `auth()` for session check | VERIFIED | `import { auth } from '@/auth'`, `const session = await auth()` |

### Data-Flow Trace (Level 4)

Dashboard is the only component rendering dynamic data in Phase 1.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/app/dashboard/page.tsx` | `session.user.name`, `session.user.email` | `auth()` call reads JWT session signed by AUTH_SECRET, populated during login by NextAuth credential + OAuth flows | Yes — session is populated by a real auth flow (credentials from DB or OAuth provider) | FLOWING |

The dashboard "No articles yet" empty state is intentional — it is the correct UI for Phase 1 before any articles exist. The articles table exists and is queryable; Phase 4 will wire the article list to this page.

### Behavioral Spot-Checks

Step 7b SKIPPED for integration tests and DB-dependent modules — requires running PostgreSQL and app server. The test suite output (from SUMMARY.md) confirms all 19 tests passed. Cannot re-run tests here without Docker PostgreSQL running.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| getBoss() does not call boss.start() | `grep "boss\.start()" src/lib/boss.ts` | No output | PASS — anti-pattern absent |
| mediawikiFetch exports correct function | `grep "export async function mediawikiFetch" src/lib/mediawiki.ts` | Line 3 matches | PASS |
| ai-registry does not use direct provider calls | `grep -r "@ai-sdk/anthropic\|@ai-sdk/openai" src/ --include="*.ts" \| grep -v ai-registry.ts` | No output | PASS |
| proxy.ts excludes /api/auth from matcher | `grep "api/auth" proxy.ts` | No output | PASS — callback routes not intercepted |
| boss.ts uses server-only guard | `grep "import 'server-only'" src/lib/boss.ts` | Line 2 matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INFRA-01 | 01-01, 01-04 | Database schema supports all entity types with relational integrity | SATISFIED | 11-table Drizzle schema with FK constraints, pgEnum, unique constraints. schema.test.ts (6 tests) verifies cascade deletes, uniqueness, enum enforcement against live PostgreSQL. |
| INFRA-02 | 01-02 | Background job queue with exactly-once delivery | PARTIAL | pg-boss worker entrypoint is correct. Integration tests confirm exactly-once delivery. getBoss() singleton intended for API route sending is architecturally broken (no .start() call). Phase 4 API routes that call getBoss() will fail at runtime. |
| INFRA-03 | 01-02 | Descriptive User-Agent on all MediaWiki API requests | SATISFIED | mediawikiFetch sets User-Agent on every call. mediawiki.test.ts (3 tests) verifies format and header preservation. |
| MOD-01 | 01-03, 01-04 | Reviewers can log in with email/password or OAuth | SATISFIED | NextAuth v5 with Credentials (bcryptjs), GitHub, Google providers. credentials.test.ts (5 tests) verifies auth flow against live DB. Login page implements full UI-SPEC.md contract. |
| AI-01 | 01-02 | Provider-agnostic LLM abstraction supporting at minimum two providers | SATISFIED | createProviderRegistry with anthropic + openai. ai-registry.test.ts (3 tests) confirms both providers resolve. |
| AI-06 | 01-02 | Switching LLM providers requires only configuration changes | SATISFIED | All LLM usage goes through registry.languageModel(process.env.AI_MODEL!). Test explicitly verifies env var switching without code changes. |

**Orphaned requirements:** None. All 6 Phase 1 requirement IDs (INFRA-01, INFRA-02, INFRA-03, MOD-01, AI-01, AI-06) are claimed across the four plans and verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/lib/boss.ts` | 7-16 | `getBoss()` constructs PgBoss but never calls `.start()`. Returns unstarted instance. | Blocker | Any Phase 4 API route using `getBoss()` to enqueue jobs will fail at runtime. Tests bypass this module, masking the defect. |
| `src/workers/index.ts` | 25 | `async ([job]) => { ... }` — unsafe array destructuring without empty-batch guard | Warning | If pg-boss delivers an empty batch, `job` is `undefined`, causing `TypeError` on `job.id` access and unnecessary retries |
| `src/auth.ts` | 14-21 | OAuth provider vars (`GITHUB_ID`, `GITHUB_SECRET`, `GOOGLE_ID`, `GOOGLE_SECRET`) passed to constructors without null guards | Warning | NextAuth silently accepts `undefined`; OAuth flows fail at runtime with cryptic errors in environments missing these vars |
| `src/lib/mediawiki.ts` | 3-14 | `mediawikiFetch` returns raw Response without checking `response.ok` | Warning | Future callers that omit status checks will silently process error responses as valid article payloads |
| `src/app/login/page.tsx` | 157, 170 | `placeholder=""` on Input fields | Info | Empty string placeholder is harmless but unnecessary; not a stub — field labels are implemented via Label components |

**Note on workers/index.ts job handler placeholder:** `src/workers/index.ts` line 27 contains `// Job handlers will be registered here in Phase 3`. This is intentional scaffolding — the queue and worker registration infrastructure is real; only the Phase 3 job handler logic is deferred. This is NOT a stub for Phase 1 purposes.

### Human Verification Required

#### 1. Login Page Visual Correctness

**Test:** Start dev server (`pnpm dev`) with Docker PostgreSQL running. Visit http://localhost:3000/login.
**Expected:** Centered card layout with "Welcome back" heading above the card, "Sign in to your Rosetta account" subtitle, Email address field (autoFocus), Password field, "Sign in" submit button full-width, separator with "or continue with" flanked by lines, "Continue with Google" and "Continue with GitHub" outline buttons with SVG icons.
**Why human:** Visual layout, font rendering, shadcn component styling, and touch target sizes (min-h-[44px]) cannot be verified programmatically.

#### 2. Unauthenticated Dashboard Redirect

**Test:** Visit http://localhost:3000/dashboard without a session.
**Expected:** HTTP 307 redirect to /login, served by proxy.ts route protection before the page renders.
**Why human:** Requires running Next.js server; the proxy function invocation and redirect HTTP status code cannot be verified by static analysis alone.

#### 3. Authenticated Dashboard Session Display

**Test:** Log in with a seeded test user (email/password) and observe the dashboard.
**Expected:** "Rosetta" wordmark in top-left, reviewer's display name or email in top-right, "No articles yet" centered empty state.
**Why human:** Requires a running database with a seeded user and a live NextAuth session.

### Gaps Summary

**1 gap blocking full INFRA-02 goal achievement:**

`src/lib/boss.ts` exports `getBoss()` which returns an unstarted PgBoss instance. PgBoss requires `.start()` to initialize its internal polling loop and pgboss schema before any job operation (send, work, fetch) will succeed. The test suite (`tests/jobs/boss.test.ts`) bypasses this module entirely, constructing raw `new PgBoss(...)` instances directly — so the tests pass while the defect is masked. The worker process (`src/workers/index.ts`) also constructs its own PgBoss instance directly, correctly calling `.start()`. The intended architecture has API routes calling `getBoss()` to send jobs (Phase 4 will do this). As currently written, that will fail.

The fix is to change `getBoss()` to return a `Promise<PgBoss>` that resolves only after `.start()` completes:

```typescript
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

This gap does not block Phase 1's other four success criteria — authentication, schema, AI registry, and MediaWiki client are all fully functional. However, INFRA-02 ("background job queue handles jobs with exactly-once delivery") is only partially satisfied because the API-facing sending mechanism is broken.

---

_Verified: 2026-04-18T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
