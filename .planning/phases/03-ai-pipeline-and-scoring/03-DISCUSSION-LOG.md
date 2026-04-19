# Phase 3: AI Pipeline and Scoring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 03-ai-pipeline-and-scoring
**Mode:** auto (all recommended defaults selected)
**Areas discussed:** Claim Extraction Pipeline, Commentary Drafting, Scoring Algorithm, Benchmark Harness, Job Processing Flow

---

## Claim Extraction Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Single generateObject call per paragraph | One LLM call with Zod schema per paragraph, structured output | :heavy_check_mark: |
| Batch multiple paragraphs per call | Send multiple paragraphs in one prompt, parse output | |
| Two-pass extraction | First pass identifies claims, second pass classifies | |

**User's choice:** Single generateObject call per paragraph (auto-selected recommended default)
**Notes:** Aligns with Vercel AI SDK's `generateObject()` pattern. Per-paragraph granularity keeps context windows manageable and failures isolated.

| Option | Description | Selected |
|--------|-------------|----------|
| Include opinions and definitions | Broad extraction of all statement types | |
| Factual assertions only | Exclude opinions, definitions, tautologies | :heavy_check_mark: |

**User's choice:** Factual assertions only (auto-selected recommended default)
**Notes:** Check-worthy claims should be independently verifiable. Opinions and definitions waste reviewer time.

| Option | Description | Selected |
|--------|-------------|----------|
| Skip paragraphs with no claims | Don't create records for claim-free paragraphs | |
| Store empty result, mark analyzed | Track all paragraphs for coverage accuracy | :heavy_check_mark: |

**User's choice:** Store empty result, mark analyzed (auto-selected recommended default)
**Notes:** Coverage tracking requires knowing which paragraphs were analyzed, even if no claims were found.

---

## Commentary Drafting

| Option | Description | Selected |
|--------|-------------|----------|
| Single combined call | Extract claims + draft commentary in one LLM call | |
| Chained calls | Extract first, then draft commentary per claim | :heavy_check_mark: |

**User's choice:** Chained calls (auto-selected recommended default)
**Notes:** Separation of concerns -- extraction quality is measurable independently from commentary quality. Also enables benchmarking extraction separately.

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text sources | Just include source URLs in commentary text | |
| Structured source objects | URL, title, relevance note as structured data | :heavy_check_mark: |

**User's choice:** Structured source objects (auto-selected recommended default)
**Notes:** Structured sources enable the mandatory source verification step in Phase 4 (MOD-04).

---

## Scoring Algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Event-driven recomputation | Recompute on every review status change | :heavy_check_mark: |
| Scheduled batch recomputation | Recompute scores on a cron schedule | |
| On-demand only | Recompute when score is requested | |

**User's choice:** Event-driven recomputation (auto-selected recommended default)
**Notes:** Scores should reflect current state immediately after reviewer action. Event-driven keeps scores fresh without polling overhead.

| Option | Description | Selected |
|--------|-------------|----------|
| Unreviewed = 0 contribution | Unreviewed sections add nothing to score | :heavy_check_mark: |
| Unreviewed = penalty | Unreviewed sections actively reduce score | |

**User's choice:** Unreviewed = 0 contribution (auto-selected recommended default)
**Notes:** Per SCORE-03, unreviewed sections "cannot contribute positively." Zero contribution is the simplest correct implementation.

---

## Benchmark Harness

| Option | Description | Selected |
|--------|-------------|----------|
| CLI script with JSON output | Runnable script comparing providers, outputs JSON report | :heavy_check_mark: |
| Web UI dashboard | Visual comparison interface | |
| CI integration test | Automated benchmark in CI pipeline | |

**User's choice:** CLI script with JSON output (auto-selected recommended default)
**Notes:** Simplest approach that satisfies AI-05. Can be promoted to CI later if needed.

---

## Job Processing Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Per-article job | Single job iterates all paragraphs in article | :heavy_check_mark: |
| Per-paragraph job | Individual job per paragraph | |
| Chunked batch jobs | Groups of N paragraphs per job | |

**User's choice:** Per-article job (auto-selected recommended default)
**Notes:** Per-article keeps transaction scope clean and matches the ingestion worker pattern. Avoids job explosion for large articles.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-enqueue after ingestion | Ingestion worker triggers analysis automatically | :heavy_check_mark: |
| Manual trigger via API | Separate API call to start analysis | |

**User's choice:** Auto-enqueue after ingestion (auto-selected recommended default)
**Notes:** Seamless pipeline. User submits URL -> ingestion -> analysis runs automatically.

---

## Claude's Discretion

- Exact LLM prompt engineering for claim extraction and commentary drafting
- Token budget management strategy
- Severity classification criteria and thresholds
- Error handling granularity
- Raw LLM response storage for debugging
- Benchmark CLI flag design

## Deferred Ideas

None -- discussion stayed within phase scope
