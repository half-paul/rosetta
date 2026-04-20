---
phase: 03-ai-pipeline-and-scoring
plan: "03"
subsystem: analysis-pipeline
tags: [analysis-worker, pg-boss, claim-extraction, commentary-drafting, score-engine, integration-tests]
dependency_graph:
  requires:
    - 03-01 (schemas, score-engine, claim-extractor, commentary-drafter)
    - 03-02 (extractClaims, draftCommentary, computeAndPersistScore implementations)
  provides:
    - runAnalysisJob (pg-boss handler for analysis-jobs queue)
    - analysis/index.ts barrel export
    - ingestion-to-analysis pipeline handoff
    - analysis worker registration in workers/index.ts
  affects:
    - src/workers/index.ts
    - src/features/ingestion/ingest-worker.ts
tech_stack:
  added: []
  patterns:
    - per-paragraph commit pattern (no wrapping transaction — RESEARCH Pitfall 4)
    - pg-boss job handler with rate limiting (D-21)
    - barrel export pattern for feature modules
key_files:
  created:
    - src/features/analysis/analysis-worker.ts
    - src/features/analysis/index.ts
    - tests/features/analysis/analysis-worker.test.ts
  modified:
    - src/workers/index.ts
    - src/features/ingestion/ingest-worker.ts
decisions:
  - "D-08: Commentary status inserts directly as AI_ANALYZED — no observable PENDING state because draft and persist are atomic from worker perspective"
  - "D-18: Single per-article job iterates all paragraphs — one job, not N jobs"
  - "D-19: Ingestion worker refactored to return article from transaction so articleId available for boss.send"
  - "D-21: ANALYSIS_RATE_LIMIT_MS env var controls rate limiting delay (default 500ms)"
metrics:
  duration_seconds: 293
  completed_date: "2026-04-19"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase 03 Plan 03: Analysis Worker, Worker Registration, and Integration Tests Summary

Analysis worker orchestrates per-paragraph claim extraction + commentary drafting + score computation; registered in workers/index.ts; ingestion auto-enqueues analysis job on completion; 5 integration tests pass with mocked LLM calls.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create analysis-worker.ts, barrel export, wire workers/index.ts, ingest-worker.ts | 3b93f46 | src/features/analysis/analysis-worker.ts, src/features/analysis/index.ts, src/workers/index.ts, src/features/ingestion/ingest-worker.ts |
| 2 | Push schema changes to database and run integration tests | bcb9b9b | tests/features/analysis/analysis-worker.test.ts |

## What Was Built

### analysis-worker.ts

`runAnalysisJob({ articleId })` is the pg-boss handler for the `analysis-jobs` queue. It:

1. Queries all paragraphs for the article via section join
2. Iterates each paragraph with per-paragraph try/catch (D-18, RESEARCH Pitfall 4)
3. Calls `extractClaims` for each paragraph; inserts each claim with all D-05 fields (severity, confidenceScore, charOffsetStart, charOffsetEnd)
4. Calls `draftCommentary` for each claim; inserts commentary with `status: 'AI_ANALYZED'` (D-08) and `suggestedSources` JSONB
5. Applies `ANALYSIS_RATE_LIMIT_MS` delay between paragraphs (D-21, default 500ms)
6. Calls `computeAndPersistScore` after all paragraphs complete

Paragraphs with no claims (D-03) are still processed — they count toward coverage in the score engine.

### analysis/index.ts

Barrel export following the `features/ingestion/index.ts` pattern. Exports: `runAnalysisJob`, `extractClaims`, `draftCommentary`, `computeFactualScore`, `computeAndPersistScore`, `ClaimExtractionSchema`, `CommentaryDraftSchema`, and associated types.

### workers/index.ts

Replaced the Phase 3 placeholder comment with a proper `runAnalysisJob` call and import.

### ingest-worker.ts

Refactored `db.transaction(...)` to return the inserted article, then enqueues `analysis-jobs` with `{ articleId: article.id }` after the transaction commits (D-19). Added `getStartedBoss` import.

### Schema

All schema columns were already present from Plan 01: `claim.confidence_score`, `claim.char_offset_start`, `claim.char_offset_end`, `commentary.suggested_sources`, `score.coverage_component`, `score.accuracy_component`, `score.confidence_component`, `score.score_weights_config`.

`npx drizzle-kit push` confirmed no changes needed (schema was already in sync).

### Integration Tests (analysis-worker.test.ts)

5 tests covering:
1. Claims persisted with all D-05 fields (severity, confidenceScore, charOffsetStart, charOffsetEnd)
2. Commentary persisted with `status: 'AI_ANALYZED'` and JSONB suggestedSources with `isVerified: false` (D-07, D-08)
3. Paragraphs with no claims complete without error (D-03)
4. Per-paragraph LLM failure — subsequent paragraphs still processed
5. `computeAndPersistScore` called once with article ID after all paragraphs

All 21 tests across 4 files in `tests/features/analysis/` pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ingest-worker transaction needed to return article for D-19 handoff**
- **Found during:** Task 1
- **Issue:** The plan noted that `article` would be scoped inside the transaction callback and provided the refactoring pattern. The refactor was applied: transaction now returns `insertedArticle` so `article.id` is available after the transaction.
- **Fix:** Renamed inner variable to `insertedArticle`, returned it from transaction, reassigned to `const article` outside.
- **Files modified:** `src/features/ingestion/ingest-worker.ts`
- **Commit:** 3b93f46

**2. [Rule 1 - Bug] computeAndPersistScore mock not cleared between tests**
- **Found during:** Task 2 test run
- **Issue:** `computeAndPersistScore` accumulated 5 calls (1 per test) instead of 1 per test because `vi.clearAllMocks()` was missing from `beforeEach`.
- **Fix:** Added `vi.clearAllMocks()` to `beforeEach`.
- **Files modified:** `tests/features/analysis/analysis-worker.test.ts`
- **Commit:** bcb9b9b

**3. [Rule 3 - Blocking] Vitest alias resolution in worktree context**
- **Found during:** Task 2
- **Issue:** Running vitest from the project root with `tests/features/analysis/analysis-worker.test.ts` picked up the worktree path but resolved `@/` to the root `./src` — path not found. Other worktree tests show same issue is resolved by running with `--root` pointing to the worktree.
- **Fix:** Run tests using `vitest run --config worktree/vitest.config.ts --root worktree/`. The plan's `<verify>` command `pnpm vitest run tests/features/analysis/analysis-worker.test.ts` also works when run from the worktree root.
- **No file change needed** — worktree vitest.config.ts already configured correctly.

## Threat Model Compliance

| Threat | Mitigation Applied |
|--------|-------------------|
| T-03-05 Tampering | Per-paragraph commit (no wrapping transaction) prevents single LLM failure from corrupting entire article; Zod validated claim/commentary shapes before DB insert |
| T-03-06 DoS | ANALYSIS_RATE_LIMIT_MS rate limiting applied; pg-boss retry limit + dead-letter already configured in workers/index.ts |
| T-03-07 EoP | Analysis queue only populated by ingest-worker (internal path); no public endpoint enqueues analysis directly |

## Known Stubs

None — all data fields are wired to live database.

## Self-Check: PASSED

- `src/features/analysis/analysis-worker.ts` exists: FOUND
- `src/features/analysis/index.ts` exists: FOUND
- `tests/features/analysis/analysis-worker.test.ts` exists: FOUND (280 lines, 5 tests)
- Task 1 commit 3b93f46: FOUND
- Task 2 commit bcb9b9b: FOUND
- All 21 analysis tests pass: CONFIRMED
- Schema columns present in DB: CONFIRMED
