---
phase: 02-wikipedia-ingestion
plan: 01
subsystem: api
tags: [mediawiki, wikipedia, sha256, stable-id, exponential-backoff, jsdom, server-only]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: src/lib/mediawiki.ts mediawikiFetch function and project scaffolding
provides:
  - computeContentHash: SHA-256 12-char hex content hash in src/features/ingestion/stable-id.ts
  - buildStableId: sectionPath:contentHash:revisionId stable ID builder
  - normalizeSectionPath: heading array to lowercase/underscore path normalizer
  - normalizeWikipediaUrl: canonical Wikipedia URL normalizer (mobile, HTTP, encoded)
  - fetchArticle: MediaWiki action=parse API client using prop=text|tocdata|revid
  - mediawikiFetchWithBackoff: exponential backoff fetch (1s-32s cap, 5 retries) in src/lib/mediawiki.ts
  - ingestion barrel: src/features/ingestion/index.ts re-exports all public symbols
affects: [02-02, 02-03, wikipedia-ingestion, jsdom-parser, ingestion-worker]

# Tech tracking
tech-stack:
  added: [jsdom, "@types/jsdom"]
  patterns:
    - server-only guard on all ingestion feature modules
    - exponential backoff with configurable maxRetries and 32s cap
    - stable paragraph IDs using section path + SHA-256 hash + revision ID
    - URL validation by hostname whitelist before any processing

key-files:
  created:
    - src/features/ingestion/stable-id.ts
    - src/features/ingestion/mediawiki-client.ts
    - src/features/ingestion/index.ts
    - tests/features/ingestion/stable-id.test.ts
    - tests/features/ingestion/mediawiki-client.test.ts
  modified:
    - src/lib/mediawiki.ts
    - tests/lib/mediawiki.test.ts
    - package.json

key-decisions:
  - "Use prop=text|tocdata|revid not prop=text|sections — tocdata is the non-deprecated replacement since MediaWiki 1.46"
  - "Hostname whitelist in normalizeWikipediaUrl rejects all non-Wikipedia URLs before any processing (T-02-01)"
  - "fetchArticle builds URL with searchParams.set() — title never interpolated raw into query string (T-02-02)"
  - "Rejection handler must be registered before vi.advanceTimersByTimeAsync() to avoid unhandled rejection warnings in fake-timer tests"

patterns-established:
  - "Pattern 1: All server-side feature modules import 'server-only' at the top"
  - "Pattern 2: Barrel index.ts re-exports public API of each feature directory"
  - "Pattern 3: Fake timer tests register .rejects handler before advancing timers"

requirements-completed: [INGEST-01, INGEST-04]

# Metrics
duration: 8min
completed: 2026-04-19
---

# Phase 02 Plan 01: Wikipedia Ingestion Utilities Summary

**MediaWiki fetch client with exponential backoff, SHA-256 stable ID builder, and Wikipedia URL normalizer — all fully unit tested (25 tests passing)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-19T07:43:00Z
- **Completed:** 2026-04-19T07:45:30Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended `src/lib/mediawiki.ts` with `mediawikiFetchWithBackoff` — exponential backoff from 1s to 32s cap, 5 retries, throws on exhaustion
- Created `src/features/ingestion/stable-id.ts` with three pure functions: `computeContentHash` (SHA-256, 12 hex chars), `buildStableId` (sectionPath:hash:revid), `normalizeSectionPath` (lowercase/underscore join)
- Created `src/features/ingestion/mediawiki-client.ts` with `normalizeWikipediaUrl` (hostname validation, mobile normalization, HTTPS enforcement) and `fetchArticle` (action=parse with tocdata)
- 25 unit tests passing across 3 test files with no unhandled rejections

## Task Commits

1. **Task 1: Install jsdom, create source modules** - `f294285` (feat)
2. **Task 2: Unit tests for all pure functions** - `3686edc` (test)

## Files Created/Modified
- `src/lib/mediawiki.ts` - Added `mediawikiFetchWithBackoff` with exponential backoff below existing `mediawikiFetch`
- `src/features/ingestion/stable-id.ts` - Three pure exported functions: computeContentHash, buildStableId, normalizeSectionPath
- `src/features/ingestion/mediawiki-client.ts` - URL normalizer and fetchArticle using mediawikiFetchWithBackoff; `server-only` guarded
- `src/features/ingestion/index.ts` - Barrel re-exports with `server-only` guard
- `tests/features/ingestion/stable-id.test.ts` - 10 tests for hash determinism, format, edge cases
- `tests/features/ingestion/mediawiki-client.test.ts` - 7 tests for URL normalization (mobile, HTTP, encoded, errors); uses `vi.mock('server-only')`
- `tests/lib/mediawiki.test.ts` - Extended with 5 backoff tests (immediate return, retry-then-success, throw-on-exhaustion, delay doubling, 32s cap)
- `package.json` - Added jsdom and @types/jsdom to dependencies

## Decisions Made
- Used `prop=text|tocdata|revid` not `prop=text|sections` — research confirmed `tocdata` is the non-deprecated replacement since MediaWiki 1.46. Plan's D-01 specified `prop=text|sections` but the research file explicitly identified this as a pitfall.
- `normalizeWikipediaUrl` validates hostname against explicit whitelist (`en.wikipedia.org`, `en.m.wikipedia.org`) before any URL processing — satisfies T-02-01.
- `fetchArticle` builds the API URL using `searchParams.set()` — user-supplied title is a single parameter, never interpolated raw — satisfies T-02-02.
- Fake-timer tests must register `.rejects` handler before calling `vi.advanceTimersByTimeAsync()` — otherwise the promise rejects while unhandled, causing Vitest unhandled-rejection errors even when the test itself passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `toStartWith` to valid Vitest/Chai matcher**
- **Found during:** Task 2 (mediawiki-client tests)
- **Issue:** Used `toStartWith` which is Jest-specific; Chai/Vitest reports "Invalid Chai property: toStartWith"
- **Fix:** Replaced with `toMatch(/^https:\/\//)` and added a specific `.toBe()` assertion
- **Files modified:** tests/features/ingestion/mediawiki-client.test.ts
- **Verification:** Test passes with exit 0
- **Committed in:** 3686edc (Task 2 commit)

**2. [Rule 1 - Bug] Fixed unhandled rejection warnings in backoff timer tests**
- **Found during:** Task 2 (mediawiki.test.ts backoff tests)
- **Issue:** Awaiting `vi.advanceTimersByTimeAsync()` caused the promise to reject before `.rejects.toThrow()` was attached — Vitest emitted unhandled rejection warnings and marked the test file failed
- **Fix:** Register `expect(promise).rejects.toThrow()` before advancing fake timers, then await the rejection expectation afterwards
- **Files modified:** tests/lib/mediawiki.test.ts
- **Verification:** 3 unhandled rejection warnings gone; all 25 tests pass cleanly
- **Committed in:** 3686edc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for tests to pass cleanly. No scope creep. All plan acceptance criteria met.

## Issues Encountered
None beyond the two auto-fixed test bugs above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All ingestion utility contracts verified — Plan 02-02 (JSDOM parser) can import from `src/features/ingestion/` with confidence
- `mediawikiFetchWithBackoff` is the only fetch primitive Plans 02-02 and 02-03 should use
- jsdom installed and available for the HTML parsing work in Plan 02-02

---
*Phase: 02-wikipedia-ingestion*
*Completed: 2026-04-19*
