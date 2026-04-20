---
phase: 03-ai-pipeline-and-scoring
plan: "04"
subsystem: benchmark-harness
tags: [benchmark, llm, claim-extraction, fixtures, testing]
dependency_graph:
  requires: [03-01]
  provides: [benchmark-cli, fixture-paragraphs, output-shape-test]
  affects: []
tech_stack:
  added: []
  patterns: [provider-registry-inline, zod-output-validation, static-fixture-testing]
key_files:
  created:
    - scripts/benchmark.ts
    - scripts/fixtures/benchmark-paragraphs.json
    - tests/features/analysis/benchmark.test.ts
  modified:
    - package.json
decisions:
  - "Inline registry in benchmark.ts to avoid server-only import chain from src/lib/ai-registry.ts"
  - "Inline ClaimExtractionSchema and SYSTEM_PROMPT to keep benchmark self-contained and outside Next.js module graph"
  - "Used fileURLToPath(import.meta.url) for __dirname equivalent in ESM context"
  - "Cast provider string to template literal type to satisfy registry.languageModel() overloads"
metrics:
  duration: "144s"
  completed_date: "2026-04-20"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 03 Plan 04: Benchmark Harness Summary

One-liner: CLI benchmark harness comparing Anthropic and OpenAI claim extraction quality across 5 curated fixture paragraphs with JSON report output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create benchmark fixtures and CLI script | 1e3cceb | scripts/benchmark.ts, scripts/fixtures/benchmark-paragraphs.json, package.json |
| 2 | Create benchmark output shape validation test | 959d7c5 | tests/features/analysis/benchmark.test.ts |

## What Was Built

### scripts/benchmark.ts
CLI harness that:
- Exits immediately unless `BENCHMARK_MODE=1` is set (T-03-08 guard)
- Creates an inline provider registry (avoids `server-only` import from `src/lib/`)
- Duplicates `ClaimExtractionSchema` and `SYSTEM_PROMPT` inline for the same reason
- Runs each of 5 fixture paragraphs through at least 2 LLM providers
- Collects per-result: provider, fixtureId, fixtureCategory, claimCount, severityDistribution (high/medium/low), latencyMs, tokensUsed, manualReviewFlag
- Outputs a JSON report to stdout; optionally writes to file via `BENCHMARK_OUTPUT` env var
- Provider list overridable via `BENCHMARK_PROVIDERS` env var

### scripts/fixtures/benchmark-paragraphs.json
5 curated paragraphs from diverse article types per D-17:
- `featured-history` — Treaty of Westphalia (historical facts, medium severity)
- `scientific-health` — Aspirin mechanism (health/safety, high severity)
- `biographical` — Marie Curie (biographical facts, medium severity)
- `stub-minimal` — Greenfield Township (low-density, few claims)
- `opinion-nonfactual` — Democracy paragraph (opinions, expected zero claims)

### tests/features/analysis/benchmark.test.ts
7 tests with no live LLM calls:
1. Validates well-formed BenchmarkReportSchema (D-16)
2. Rejects missing `severityDistribution` field
3. Rejects missing `latencyMs` field
4. Accepts `manualReviewFlag: true` for failed extractions
5. Validates fixture file has 4+ entries with required fields
6. Validates fixture diversity covers 3+ distinct categories (D-17)
7. Static analysis confirms `BENCHMARK_MODE` guard present in script (T-03-08)

### package.json
Added `"benchmark": "BENCHMARK_MODE=1 tsx scripts/benchmark.ts"` to scripts section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error: registry.languageModel() overload**
- **Found during:** Task 1 verification
- **Issue:** `registry.languageModel(provider)` where `provider` is `string` failed TS overload check — the method expects `` `anthropic:${string}` | `openai:${string}` ``
- **Fix:** Cast the provider parameter: `registry.languageModel(provider as \`anthropic:${string}\` | \`openai:${string}\`)`
- **Files modified:** scripts/benchmark.ts
- **Commit:** 1e3cceb (inline with Task 1)

## Threat Surface Scan

All threat mitigations from plan's `<threat_model>` were applied:
- T-03-08 (DoS guard): `BENCHMARK_MODE=1` check at top of script with `process.exit(1)` — verified by static analysis test
- T-03-09 (API key disclosure): inline registry uses env vars from `@ai-sdk/anthropic` and `@ai-sdk/openai` providers — no hardcoded secrets

No new threat surface introduced (script is a dev-only CLI tool, not a network endpoint).

## Verification Results

- `pnpm vitest run tests/features/analysis/benchmark.test.ts` — 7 tests passed
- `scripts/fixtures/benchmark-paragraphs.json` — valid JSON, 5 fixtures across 5 distinct categories
- `package.json` — benchmark script alias confirmed
- TypeScript: no errors in scripts/benchmark.ts under project tsconfig

## Self-Check

Files exist:
- scripts/benchmark.ts: created
- scripts/fixtures/benchmark-paragraphs.json: created
- tests/features/analysis/benchmark.test.ts: created
- package.json: contains "benchmark" script alias

Commits exist:
- 1e3cceb: feat(03-04): benchmark CLI harness with fixtures and package.json alias
- 959d7c5: test(03-04): benchmark output shape validation tests (D-16, D-17)
