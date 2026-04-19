---
phase: 02
slug: wikipedia-ingestion
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-19
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | INGEST-01, INGEST-04 | T-02-01, T-02-02, T-02-03 | URL normalization rejects non-Wikipedia URLs; backoff retries on 429 | unit | `pnpm vitest run tests/features/ingestion/mediawiki-client.test.ts tests/lib/mediawiki.test.ts` | Plan 01 Task 2 creates | ⬜ pending |
| 02-01-02 | 01 | 1 | INGEST-02 | — | Stable ID generation produces correct format | unit | `pnpm vitest run tests/features/ingestion/stable-id.test.ts` | Plan 01 Task 2 creates | ⬜ pending |
| 02-02-01 | 02 | 2 | INGEST-02 | T-02-04 | HTML parser extracts paragraphs with stable IDs, strips non-content | unit | `pnpm vitest run tests/features/ingestion/parse-article.test.ts` | Plan 02 Task 2 creates | ⬜ pending |
| 02-03-01 | 03 | 3 | INGEST-03 | T-02-08 | Article metadata stored with revision ID and timestamp in transaction | integration | `pnpm vitest run tests/features/ingestion/ingest-worker.test.ts` | Plan 03 Task 2 creates | ⬜ pending |
| 02-03-02 | 03 | 3 | INGEST-01 | T-02-06, T-02-07 | POST handler returns 401/422/200/202 for auth/validation/duplicate/new | unit | `pnpm vitest run tests/features/ingestion/route.test.ts` | Plan 03 Task 2 creates | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/features/ingestion/stable-id.test.ts` — created by Plan 01 Task 2 (INGEST-02)
- [ ] `tests/features/ingestion/mediawiki-client.test.ts` — created by Plan 01 Task 2 (INGEST-01)
- [ ] `tests/lib/mediawiki.test.ts` — extended by Plan 01 Task 2 (INGEST-04)
- [ ] `tests/features/ingestion/parse-article.test.ts` — created by Plan 02 Task 2 (INGEST-02)
- [ ] `tests/features/ingestion/ingest-worker.test.ts` — created by Plan 03 Task 2 (INGEST-03)
- [ ] `tests/features/ingestion/route.test.ts` — created by Plan 03 Task 2 (INGEST-01)
- [ ] `pnpm add jsdom @types/jsdom` — JSDOM not in production dependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live MediaWiki API response | INGEST-01 | Requires network access to en.wikipedia.org | Paste a Wikipedia URL and verify article appears in DB |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
