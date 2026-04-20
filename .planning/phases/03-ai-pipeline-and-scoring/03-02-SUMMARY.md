---
phase: 03-ai-pipeline-and-scoring
plan: 02
subsystem: ai-pipeline
tags: [ai-sdk-v6, claim-extraction, commentary-drafting, structured-output, prompt-injection]
dependency_graph:
  requires:
    - src/lib/ai-registry.ts
    - src/features/analysis/schemas.ts
  provides:
    - src/features/analysis/claim-extractor.ts
    - src/features/analysis/commentary-drafter.ts
  affects:
    - src/features/analysis/analysis-worker.ts (Plan 03 — consumes extractClaims, draftCommentary)
tech_stack:
  added: []
  patterns:
    - AI SDK v6 generateText + Output.object structured output
    - System/prompt separation for prompt injection prevention (T-03-01)
    - Server-only guard on all LLM-calling modules
    - Graceful error fallback with typed empty responses
key_files:
  created:
    - src/features/analysis/claim-extractor.ts
    - src/features/analysis/commentary-drafter.ts
    - src/features/analysis/schemas.ts
    - tests/features/analysis/claim-extractor.test.ts
    - tests/features/analysis/commentary-drafter.test.ts
  modified: []
decisions:
  - "Created schemas.ts in this worktree as Plan 01 and Plan 02 run in parallel (Wave 1); schemas.ts is required at import time by both modules"
metrics:
  duration: "2 minutes"
  completed: "2026-04-20T00:24:25Z"
  tasks_completed: 2
  tasks_total: 2
  tests_passing: 9
---

# Phase 03 Plan 02: Claim Extractor and Commentary Drafter Summary

**One-liner:** LLM claim extraction and commentary drafting using AI SDK v6 `generateText + Output.object` with prompt injection prevention and trust-safe `isVerified: false` enforcement.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create claim-extractor.ts and its unit tests | e07a564 | src/features/analysis/claim-extractor.ts, src/features/analysis/schemas.ts, tests/features/analysis/claim-extractor.test.ts |
| 2 | Create commentary-drafter.ts and its unit tests | 82dfcb7 | src/features/analysis/commentary-drafter.ts, tests/features/analysis/commentary-drafter.test.ts |

## What Was Built

### claim-extractor.ts
Exports `extractClaims(paragraphText: string): Promise<ClaimExtractionOutput>`. Uses AI SDK v6 `generateText` with `Output.object({ schema: ClaimExtractionSchema })`. Returns typed array of claims with all D-05 fields (text, severity, charOffsetStart, charOffsetEnd, confidenceScore). Falls back to `{ claims: [] }` on any error per D-03.

### commentary-drafter.ts
Exports `draftCommentary(paragraphText, claim): Promise<CommentaryDraftOutput>`. Same AI SDK v6 pattern. Returns `analysisText` and `suggestedSources` array (1-3 items). Fallback always produces `isVerified: false` sources. No code path can produce a verified AI source (D-07, T-03-03).

### schemas.ts (prerequisite — created in this plan)
Defines `ClaimExtractionSchema` and `CommentaryDraftSchema` Zod schemas. `SuggestedSourceSchema` uses `z.literal(false)` on `isVerified` to enforce D-07 trust contract at the type level. Includes confidence score clamping transform per RESEARCH Pitfall 3.

## Verification Results

```
Tests: 9 passed (2 test files)
- claim-extractor.test.ts: 5 tests passed
- commentary-drafter.test.ts: 4 tests passed
```

## Deviations from Plan

### Deviation: schemas.ts created in Plan 02 worktree

**Found during:** Task 1 setup
**Issue:** Plan 01 (which creates schemas.ts) runs in parallel Wave 1 with Plan 02. The `@/features/analysis/schemas.ts` file did not exist in this worktree when Plan 02 began execution. Plan 02's imports would fail without it.
**Fix:** Created schemas.ts in this worktree's `src/features/analysis/` using the exact schema definitions specified in PATTERNS.md. This is consistent with what Plan 01 produces — the merge will have two identical or near-identical versions to reconcile.
**Files modified:** src/features/analysis/schemas.ts
**Commit:** e07a564
**Rule applied:** Rule 3 (auto-fix blocking issue — missing file prevented compilation)

## Threat Model Coverage

All T-03-0x mitigations from the plan's threat model are implemented:

| Threat ID | Status | Implementation |
|-----------|--------|----------------|
| T-03-01 | Mitigated | System prompt contains only instructions; paragraph/claim text always passed via `prompt:` parameter |
| T-03-03 | Mitigated | `isVerified: z.literal(false)` in schema; fallback hardcodes `isVerified: false`; no code path produces `true` |
| T-03-04 | Mitigated | Both modules have `import 'server-only'` at line 1 |

## Known Stubs

None — both functions are fully wired to the AI SDK. In tests, the LLM is mocked, but production execution will call the configured provider via `registry.languageModel(process.env.AI_MODEL!)`.

## Threat Flags

None — no new network endpoints or auth paths introduced. Both modules are server-only and accessed via internal function calls only.

## Self-Check: PASSED

All created files verified present on disk. Both task commits (e07a564, 82dfcb7) verified in git log. All 9 tests pass.
