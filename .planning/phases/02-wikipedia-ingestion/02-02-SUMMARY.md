---
phase: 02-wikipedia-ingestion
plan: "02"
subsystem: ingestion
tags: [parser, jsdom, wikipedia, stable-id, unit-tests]
dependency_graph:
  requires: [02-01]
  provides: [parse-article]
  affects: [02-03]
tech_stack:
  added: [jsdom]
  patterns: [dom-walk, section-hierarchy, stable-id-generation]
key_files:
  created:
    - src/features/ingestion/parse-article.ts
    - tests/features/ingestion/parse-article.test.ts
  modified:
    - src/features/ingestion/index.ts
decisions:
  - "Use mw-heading wrapper div class (not bare h2/h3) for heading detection — matches current MediaWiki HTML output format"
  - "Lead section initialized with path 'lead' before any heading is encountered"
  - "Heading stack rebuilt from level number to handle arbitrary nesting depth"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-19"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 02 Plan 02: Wikipedia HTML Parser Summary

JSDOM-based MediaWiki HTML parser extracting sections/paragraphs with hierarchical path building and stable ID generation from sectionPath:contentHash:revisionId.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create parse-article.ts with JSDOM section walk | fcba1ef | src/features/ingestion/parse-article.ts, src/features/ingestion/index.ts |
| 2 | Unit tests for parseWikipediaHtml with fixture HTML | bfe68e5 | tests/features/ingestion/parse-article.test.ts |

## What Was Built

### parse-article.ts

Core Wikipedia HTML parser using JSDOM. The `parseWikipediaHtml(html, revisionId)` function:

1. Parses raw MediaWiki `action=parse` HTML into a JSDOM document
2. Strips non-content elements via `STRIP_SELECTORS` (infobox, navbox, reflist, toc, mw-editsection, ambox, tmbox, reference, mw-references-wrap, style, script)
3. Walks children of `.mw-parser-output`, accumulating lead paragraphs and detecting `div.mw-heading` wrappers
4. Builds a heading stack per level (h2 resets to `[title]`, h3 produces `[parent, title]`, h4+ extends appropriately)
5. Extracts `textContent` from `P` elements, filters those under 10 characters
6. Delegates to stable-id.ts: `computeContentHash` + `buildStableId` + `normalizeSectionPath`
7. Returns only sections with at least one valid paragraph

### parse-article.test.ts

11 unit tests with inline HTML fixtures mimicking real MediaWiki output:

- Lead section extraction
- Multiple sections with paths
- Hierarchical nested heading paths (`history/early_period`)
- Paragraph position ordering
- Stable ID format regex validation (`/^[a-z_/]+:[a-f0-9]{12}:\d+$/`)
- Stripping of infobox/navbox/reflist
- Empty and short paragraph filtering
- Empty array for missing `.mw-parser-output` root
- Sections with only short paragraphs excluded from output
- Deterministic hash across multiple parse calls
- `mw-editsection` spans stripped so heading title is clean

## Deviations from Plan

None - plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or trust-boundary changes introduced. The JSDOM parser runs server-side without script execution (T-02-04 mitigated by design — only `textContent` is read, no innerHTML is used). The paragraph count concern (T-02-05) is bounded by the HTML input size and will be enforced in Plan 03's ingestion worker.

## Self-Check: PASSED

- src/features/ingestion/parse-article.ts: EXISTS
- tests/features/ingestion/parse-article.test.ts: EXISTS
- src/features/ingestion/index.ts: MODIFIED with re-exports
- Commit fcba1ef: EXISTS
- Commit bfe68e5: EXISTS
- All 11 tests: PASS (28/28 ingestion tests total)
