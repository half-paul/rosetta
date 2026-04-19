# Phase 2: Wikipedia Ingestion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 02-wikipedia-ingestion
**Mode:** auto (all decisions auto-selected)
**Areas discussed:** Parsing approach, Ingestion flow, Content extraction, Validation strategy

---

## Parsing Approach

| Option | Description | Selected |
|--------|-------------|----------|
| action=parse with prop=text\|sections | Stable MediaWiki API, well-documented, provides rendered HTML and section structure | ✓ |
| Wikimedia Structured Contents JSON API (beta) | Newer JSON-native API but production readiness unconfirmed — flagged as blocker in STATE.md | |
| wtf_wikipedia library | JavaScript library for parsing wikitext — adds opaque dependency layer | |

**User's choice:** action=parse (auto-selected — recommended default)
**Notes:** STATE.md explicitly flags Structured Contents API as a validation blocker. action=parse is the conservative, production-proven choice.

---

## Ingestion Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Async via pg-boss job | API endpoint returns 202, worker processes in background | ✓ |
| Synchronous in API handler | Parse and persist during the HTTP request | |
| Hybrid (quick metadata sync, full parse async) | Return basic article info immediately, queue full parsing | |

**User's choice:** Async via pg-boss (auto-selected — recommended default)
**Notes:** Aligns with INFRA-02 (pg-boss for ingestion jobs), existing getBoss() singleton, and ARCHITECTURE.md flow diagrams.

---

## Content Extraction

| Option | Description | Selected |
|--------|-------------|----------|
| JSDOM server-side DOM parsing | Full DOM API, strip non-content elements, extract <p> tags | ✓ |
| Cheerio (lightweight jQuery-like) | Faster than JSDOM, good for HTML traversal, less memory | |
| Regex-based extraction | Fast but brittle — Wikipedia HTML is "tag soup" per PITFALLS.md | |

**User's choice:** JSDOM (auto-selected — recommended default)
**Notes:** PITFALLS.md Pitfall 2 warns against regex/naive parsing. JSDOM provides full DOM API for robust stripping and extraction.

---

## Validation Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture-based tests (10+ article types) | Store representative HTML, deterministic CI tests | ✓ |
| Live API integration tests | Hit MediaWiki in CI — realistic but slow, rate-limited, non-deterministic | |
| Snapshot tests on parsed output | Compare full parsed tree against snapshots — catches regressions | |

**User's choice:** Fixture-based tests (auto-selected — recommended default)
**Notes:** Research recommends validating against 20+ article types. Fixtures ensure deterministic CI without API dependency.

---

## Claude's Discretion

- URL normalization strategy
- pg-boss job configuration details
- Disambiguation page handling
- Error state UX (deferred to Phase 4 dashboard)
- Whether to store raw HTML for debugging

## Deferred Ideas

None — all discussion stayed within phase scope.
