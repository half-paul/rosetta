---
phase: 02
slug: wikipedia-ingestion
status: draft
nyquist_compliant: false
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
| 02-01-01 | 01 | 1 | INGEST-01 | — | URL validation rejects non-Wikipedia URLs | unit | `pnpm vitest run src/features/ingestion/__tests__/url-parser.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | INGEST-02 | — | HTML parser extracts paragraphs with stable IDs | unit | `pnpm vitest run src/features/ingestion/__tests__/parser.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | INGEST-03 | — | Article metadata stored with revision ID and timestamp | integration | `pnpm vitest run src/features/ingestion/__tests__/ingestion-job.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 1 | INGEST-04 | — | Rate limiter backs off on HTTP 429 | unit | `pnpm vitest run src/features/ingestion/__tests__/rate-limiter.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/features/ingestion/__tests__/url-parser.test.ts` — stubs for INGEST-01
- [ ] `src/features/ingestion/__tests__/parser.test.ts` — stubs for INGEST-02
- [ ] `src/features/ingestion/__tests__/ingestion-job.test.ts` — stubs for INGEST-03
- [ ] `src/features/ingestion/__tests__/rate-limiter.test.ts` — stubs for INGEST-04
- [ ] `pnpm add jsdom @types/jsdom` — JSDOM not in production dependencies

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live MediaWiki API response | INGEST-01 | Requires network access to en.wikipedia.org | Paste a Wikipedia URL and verify article appears in DB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
