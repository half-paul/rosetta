---
phase: 01-foundation
plan: 02
subsystem: infrastructure
tags: [pg-boss, vercel-ai-sdk, mediawiki, background-jobs, ai-registry, server-only]
dependency_graph:
  requires:
    - 01-01 (next.js-project, vitest-config, dependencies installed)
  provides:
    - pg-boss-singleton
    - worker-entrypoint
    - ai-provider-registry
    - mediawiki-client
  affects:
    - Phase 2: ingestion pipeline uses mediawikiFetch and pg-boss job sending
    - Phase 3: AI pipeline uses registry.languageModel(process.env.AI_MODEL!)
    - Phase 4: dashboard API routes use getBoss() to enqueue jobs
tech_stack:
  added: []
  patterns:
    - pg-boss named export { PgBoss } (no default export in ESM)
    - Singleton pattern for getBoss() — API routes send without calling start()
    - Worker process: start() once at startup, then createQueue + work
    - server-only import guard on boss.ts and ai-registry.ts (T-02-01, T-02-02)
    - createProviderRegistry with anthropic + openai (AI-06: env-var-only switching)
    - mediawikiFetch fetch wrapper with spread-then-User-Agent header pattern
    - vi.mock('server-only') in tests/setup.ts to unblock unit test imports
key_files:
  created:
    - src/lib/boss.ts (getBoss singleton, server-only, no start() anti-pattern)
    - src/workers/index.ts (worker entrypoint with analysis-jobs queue, retry/DL config)
    - src/lib/ai-registry.ts (createProviderRegistry with Anthropic + OpenAI)
    - src/lib/mediawiki.ts (mediawikiFetch with Rosetta/1.0 User-Agent)
    - tests/jobs/boss.test.ts (exactly-once + dead-letter integration tests)
    - tests/lib/ai-registry.test.ts (registry + AI_MODEL env-var switching tests)
    - tests/lib/mediawiki.test.ts (User-Agent header correctness tests)
    - tests/setup.ts (vi.mock server-only for test environment)
  modified:
    - vitest.config.ts (added setupFiles: ['./tests/setup.ts'])
decisions:
  - Used named import { PgBoss } from 'pg-boss' — pg-boss 12.x has no default ESM export
  - server-only import guard applied to both boss.ts and ai-registry.ts per threat model T-02-01/T-02-02
  - Worker process validates DATABASE_URL before creating PgBoss instance (Rule 2: missing guard)
metrics:
  duration: 3 minutes
  completed: 2026-04-19
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 1
---

# Phase 01 Plan 02: Infrastructure Modules Summary

**One-liner:** pg-boss singleton + worker entrypoint with exactly-once job delivery, Vercel AI SDK provider registry with config-only provider switching via AI_MODEL env var, and MediaWiki fetch client with Wikimedia-policy-compliant User-Agent — all with passing tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | pg-boss singleton, worker entrypoint, and integration test | 6ae9acf | src/lib/boss.ts, src/workers/index.ts, tests/jobs/boss.test.ts |
| 2 | AI provider registry, MediaWiki client, and unit tests | 71617c0 | src/lib/ai-registry.ts, src/lib/mediawiki.ts, tests/lib/ai-registry.test.ts, tests/lib/mediawiki.test.ts, tests/setup.ts, vitest.config.ts |

## What Was Built

### pg-boss Background Job Queue (INFRA-02)

- `src/lib/boss.ts`: singleton `getBoss()` exported for API route use. Guards against `boss.start()` anti-pattern — `start()` is never called here. `server-only` import prevents client bundle inclusion (T-02-02).
- `src/workers/index.ts`: worker process entrypoint. Calls `boss.start()` once at startup, creates `analysis-jobs` queue with `retryLimit: 3`, `retryDelay: 60`, `retryBackoff: true`, `expireInSeconds: 900`, and dead-letter routing to `analysis-failures`. Prevents infinite retry loops (T-02-03).
- `tests/jobs/boss.test.ts`: two integration tests — exactly-once delivery confirmed (callCount === 1 after poll cycle), dead-letter routing verified (failed job appears in DL queue after retry exhaustion).

### AI Provider Registry (AI-01, AI-06)

- `src/lib/ai-registry.ts`: `createProviderRegistry({ anthropic, openai })` exported as `registry`. `server-only` import prevents API key exposure (T-02-01). Usage: `registry.languageModel(process.env.AI_MODEL!)`. Switching from Claude to GPT-4 requires only `AI_MODEL` env var change — zero code changes.
- `tests/lib/ai-registry.test.ts`: 3 tests — registry returns defined model objects for both providers, AI_MODEL env var switching confirmed without code changes.

### MediaWiki Fetch Client (INFRA-03)

- `src/lib/mediawiki.ts`: `mediawikiFetch(url, init?)` wrapper sets `User-Agent: Rosetta/1.0 (https://rosetta.example.com; contact@rosetta.example.com)` on every request. Caller headers spread after User-Agent so callers can add but not accidentally override the required header.
- `tests/lib/mediawiki.test.ts`: 3 tests — User-Agent set on every request, caller headers preserved alongside User-Agent, Wikimedia policy format validated (`/^Rosetta\/\d+\.\d+\s*\(/`).

### Test Infrastructure

- `tests/setup.ts`: `vi.mock('server-only', () => ({}))` unblocks unit test imports of server-only-guarded modules.
- `vitest.config.ts`: `setupFiles: ['./tests/setup.ts']` added.

## Test Results

All 8 tests pass:
- 3 AI registry tests (unit, no live LLM calls)
- 3 MediaWiki tests (unit, mocked fetch)
- 2 pg-boss tests (integration, live PostgreSQL via Docker)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pg-boss has no default ESM export**
- **Found during:** Task 1 implementation
- **Issue:** Plan action body showed `import PgBoss from 'pg-boss'` but pg-boss 12.x only exports named `{ PgBoss }` in ESM (verified: `default` key is `undefined` in `import * as m from 'pg-boss'`). Default import would fail at runtime.
- **Fix:** Used `import { PgBoss } from 'pg-boss'` in all three files (boss.ts, workers/index.ts, boss.test.ts). PATTERNS.md already showed correct named import pattern.
- **Files modified:** src/lib/boss.ts, src/workers/index.ts, tests/jobs/boss.test.ts
- **Commit:** 6ae9acf

**2. [Rule 3 - Blocking] Another agent's PostgreSQL container occupying port 5432**
- **Found during:** Task 1 verification (docker compose up for pg-boss integration test)
- **Issue:** A parallel worktree agent had already started a PostgreSQL container on port 5432 (`agent-a6358abd-postgres-1`). `docker compose up -d postgres` failed with port allocation error.
- **Fix:** Confirmed the existing container used the same `rosetta/rosetta@localhost:5432/rosetta` credentials and was accessible. Ran integration tests against it directly — no behavioral difference.
- **Files modified:** None (operational)

## Known Stubs

None — this plan creates server-side library modules and tests. No UI components, no placeholder data, no unconnected data sources.

## Threat Flags

No new threat surface beyond the plan's threat model. All mitigations applied:
- T-02-01: `import 'server-only'` in src/lib/ai-registry.ts prevents client bundle inclusion
- T-02-02: `import 'server-only'` in src/lib/boss.ts prevents client access; job enqueue endpoints will require auth in Phase 4
- T-02-03: Queue config enforces retryLimit=3, expireInSeconds=900, dead-letter routing — no infinite retries
- T-02-04: User-Agent is policy compliance, not a security boundary — accepted

## Self-Check: PASSED

All 9 created/modified files verified present on disk. Both task commits (6ae9acf, 71617c0) found in git log. No unexpected file deletions detected.
