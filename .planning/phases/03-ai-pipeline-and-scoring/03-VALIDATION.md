---
phase: 3
slug: ai-pipeline-and-scoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run tests/features/analysis/` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run tests/features/analysis/`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | AI-02 | — | N/A | unit stub | `pnpm vitest run tests/features/analysis/claim-extractor.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | AI-03 | — | N/A | unit stub | `pnpm vitest run tests/features/analysis/commentary-drafter.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 0 | SCORE-01, SCORE-03, SCORE-04 | — | N/A | unit stub | `pnpm vitest run tests/features/analysis/score-engine.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 0 | AI-04 | — | N/A | integration stub | `pnpm vitest run tests/features/analysis/analysis-worker.test.ts` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 0 | AI-05 | — | N/A | unit stub | `pnpm vitest run tests/features/analysis/benchmark.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | AI-02 | T-03-01 | System prompt separates instructions from content | unit | `pnpm vitest run tests/features/analysis/claim-extractor.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | AI-02 | — | Zod validates all LLM output | unit | same | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 1 | AI-03 | T-03-03 | isVerified always false on AI sources | unit | `pnpm vitest run tests/features/analysis/commentary-drafter.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | SCORE-01 | — | Unreviewed sections cannot inflate score | unit | `pnpm vitest run tests/features/analysis/score-engine.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | SCORE-02 | — | Score + coverage always paired | unit | same | ❌ W0 | ⬜ pending |
| 03-05-01 | 05 | 2 | AI-04 | T-03-02 | Queue only accepts jobs from authenticated ingestion | integration | `pnpm vitest run tests/features/analysis/analysis-worker.test.ts` | ❌ W0 | ⬜ pending |
| 03-06-01 | 06 | 3 | AI-05 | — | Benchmark guard prevents accidental CI runs | unit | `pnpm vitest run tests/features/analysis/benchmark.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/features/analysis/claim-extractor.test.ts` — stubs for AI-02 (structured output, empty array, schema fields)
- [ ] `tests/features/analysis/commentary-drafter.test.ts` — stubs for AI-03 (sources always unverified)
- [ ] `tests/features/analysis/score-engine.test.ts` — stubs for SCORE-01, SCORE-03, SCORE-04 (pure function, no mocks)
- [ ] `tests/features/analysis/analysis-worker.test.ts` — stubs for AI-04 (mock LLM + test DB)
- [ ] `tests/features/analysis/benchmark.test.ts` — stubs for AI-05 (output shape validation only)
- [ ] Schema migration — `drizzle-kit generate` for new columns on claims, commentaries, scores tables

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Benchmark comparison quality across providers | AI-05 | Requires live LLM API calls with real API keys | Run `BENCHMARK_MODE=1 pnpm tsx scripts/benchmark.ts`, review JSON output for claim count/severity/latency differences |
| Score weights produce expected behavior at scale | SCORE-04 | Quality judgment on weight balance | Review score outputs for a set of articles with varying review coverage |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
