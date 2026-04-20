---
phase: 03-ai-pipeline-and-scoring
plan: "01"
subsystem: schema-and-scoring
tags: [schema, zod, score-engine, tdd, drizzle, pure-function]
dependency_graph:
  requires: []
  provides:
    - schema columns for claims/commentaries/scores (Phase 3 data contracts)
    - ClaimExtractionSchema and CommentaryDraftSchema Zod definitions
    - computeFactualScore pure function
    - computeAndPersistScore async DB wrapper
  affects:
    - src/db/schema.ts (adds 8 new columns across 3 tables)
    - src/features/analysis/ (new directory with schemas.ts and score-engine.ts)
    - tests/features/analysis/ (new test directory with score-engine.test.ts)
tech_stack:
  added: []
  patterns:
    - Pure function scoring with explicit return type
    - Zod schema safety clamp via .transform() for LLM confidence scores
    - z.literal(false) to enforce isVerified trust contract at schema level
    - Drizzle onConflictDoUpdate upsert for score persistence
    - TDD RED/GREEN/REFACTOR cycle with vi.mock for server-only and @/db
key_files:
  created:
    - src/features/analysis/schemas.ts
    - src/features/analysis/score-engine.ts
    - tests/features/analysis/score-engine.test.ts
  modified:
    - src/db/schema.ts
decisions:
  - "Score weights stored as config in scoreWeightsConfig JSONB column (D-09), not hardcoded"
  - "computeFactualScore is pure — no I/O; computeAndPersistScore wraps it with DB logic"
  - "Tests mock @/db to keep score engine unit tests free of DATABASE_URL requirement"
  - "Worktree tests run with --root and --config flags pointing to worktree; post-merge pnpm vitest run works as normal"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-20"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 1
---

# Phase 03 Plan 01: Schema Columns, Zod Schemas, and Score Engine Summary

**One-liner:** Added 8 schema columns across 3 tables, created ClaimExtractionSchema and CommentaryDraftSchema with D-05/D-07 fields, and built the Factual Score engine as a pure function with 7 passing TDD unit tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add missing columns to claims, commentaries, and scores tables | 8c05293 | src/db/schema.ts |
| 2 | Create Zod schemas for claim extraction and commentary drafting | 24c69fe | src/features/analysis/schemas.ts |
| 3 (RED) | Add failing tests for score engine | f622e04 | tests/features/analysis/score-engine.test.ts |
| 3 (GREEN+REFACTOR) | Implement Factual Score engine — all 7 tests green | d0dbe1c | src/features/analysis/score-engine.ts, tests/features/analysis/score-engine.test.ts |

## Decisions Made

1. **Score weights in JSONB column:** `scoreWeightsConfig` JSONB column on the `scores` table stores the weights used for each recomputation. Default `{"coverage":0.4,"accuracy":0.4,"confidence":0.2}` per D-09. No separate config table needed.

2. **Pure function separation:** `computeFactualScore` is a pure function (no imports, no async, no I/O) suitable for calling from any context — analysis worker, review handler (Phase 4), or tests. `computeAndPersistScore` is the DB wrapper, kept separate to maintain testability.

3. **Test mocking strategy:** Score engine unit tests mock `server-only` and `@/db` so they run without a database connection. The pure function (`computeFactualScore`) never touches the DB — only the wrapper does.

4. **Worktree test execution:** In the parallel worktree context, vitest must be invoked with `--root` and `--config` flags pointing to the worktree. After wave merge, `pnpm vitest run tests/features/analysis/score-engine.test.ts` from the project root will work normally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added vi.mock for @/db to score engine unit tests**
- **Found during:** Task 3 GREEN phase
- **Issue:** `score-engine.ts` imports `@/db` (for the `computeAndPersistScore` wrapper), which throws `Error: DATABASE_URL is required` when imported in the test environment — even though only the pure `computeFactualScore` was under test
- **Fix:** Added `vi.mock('server-only', () => ({}))` and `vi.mock('@/db', () => ({ db: {} }))` at the top of the test file, following the same pattern already established in `tests/features/ingestion/ingest-worker.test.ts`
- **Files modified:** tests/features/analysis/score-engine.test.ts
- **Commit:** d0dbe1c

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | f622e04 | test(03-01): failing tests written before implementation |
| GREEN | d0dbe1c | feat(03-01): all 7 tests pass |
| REFACTOR | d0dbe1c | Dead code removed from computeAndPersistScore (intermediate fetches); tests still pass |

## Verification Results

- `npx tsc --noEmit` — 0 errors in `src/` (pre-existing test errors in `tests/lib/ai-registry.test.ts` are out of scope)
- `pnpm vitest run tests/features/analysis/score-engine.test.ts` (via `--root` flag) — 7/7 tests pass
- Score engine returns 16 (not 0) for fully unreviewed articles — confidence component contributes even without reviews (per D-12)
- Score engine returns 100 for fully reviewed + perfect accuracy + perfect confidence
- Custom weights {coverage:0.8, accuracy:0.1, confidence:0.1} produce different scores than default
- Empty paragraphs array returns all zeros (no division by zero)

## Known Stubs

None — all exported functions are fully implemented. The `computeAndPersistScore` function correctly handles Phase 3 state where no human reviews exist (accuracy always 0, coverage always 0 until Phase 4 reviews are added).

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or trust boundary changes introduced. The threat model items were addressed:
- T-03-01 (Tampering on score-engine.ts): Output clamped to [0,100] via `Math.min(100, Math.max(0, Math.round(rawScore)))`. Weights validation not added (weights are internal config, not LLM input).
- T-03-02 (Information Disclosure in schemas.ts): `isVerified: z.literal(false)` enforces trust contract at schema level.

## Self-Check: PASSED

All created files verified to exist on disk. All 4 task commits verified in git log.

| Check | Result |
|-------|--------|
| src/db/schema.ts | FOUND |
| src/features/analysis/schemas.ts | FOUND |
| src/features/analysis/score-engine.ts | FOUND |
| tests/features/analysis/score-engine.test.ts | FOUND |
| .planning/phases/03-ai-pipeline-and-scoring/03-01-SUMMARY.md | FOUND |
| Commit 8c05293 (schema columns) | FOUND |
| Commit 24c69fe (Zod schemas) | FOUND |
| Commit f622e04 (RED tests) | FOUND |
| Commit d0dbe1c (GREEN implementation) | FOUND |
