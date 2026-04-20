# Phase 3: AI Pipeline and Scoring - Research

**Researched:** 2026-04-19
**Domain:** Vercel AI SDK v6 structured output, pg-boss job patterns, scoring engine, benchmark harness
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use Vercel AI SDK `generateObject()` with a Zod schema per paragraph to extract check-worthy claims as structured output — one LLM call per paragraph
- **D-02:** Check-worthy claims are factual assertions that can be independently verified — exclude opinions, definitions, tautologies, and trivially true statements
- **D-03:** Paragraphs with no check-worthy claims still get processed — store an empty claims array and mark the paragraph as analyzed (status moves to AI_ANALYZED) so coverage tracking is accurate
- **D-04:** Claim severity is assigned during extraction (e.g., "high" for health/safety claims, "medium" for historical facts, "low" for trivial assertions) — severity drives queue priority in Phase 4
- **D-05:** The Zod schema for claim extraction output includes: claim text, severity level, start/end character offsets within the paragraph, and a confidence score (0-1) from the LLM
- **D-06:** Commentary drafting is a chained second LLM call per claim — extract claims first, then draft commentary for each extracted claim separately
- **D-07:** Each commentary includes AI-drafted analysis text and 1-3 suggested source objects (URL, title, relevance note) — all sources are marked `unverified` by default with no exceptions
- **D-08:** Commentary status starts as PENDING, transitions to AI_ANALYZED after drafting completes — the five-state workflow (PENDING -> AI_ANALYZED -> HUMAN_APPROVED -> PUBLISHED, HUMAN_REJECTED -> PENDING) is enforced by the pgEnum in schema.ts
- **D-09:** Factual Score (0-100) computed per article with configurable weights: Coverage 40%, Accuracy 40%, Confidence 20% (stored as config, not hardcoded)
- **D-10:** Coverage component = (human-reviewed paragraphs / total paragraphs) * 100 — unreviewed paragraphs contribute 0, making it impossible for an unreviewed article to score well
- **D-11:** Accuracy component = weighted average of claim accuracy ratings from human reviews (0 if no reviews exist)
- **D-12:** Confidence component = average LLM confidence scores across all claims (provides a baseline signal even before human review)
- **D-13:** Score recomputation is event-driven — triggers on every review status change (approval, rejection, edit) rather than on a schedule
- **D-14:** Score always stored alongside "X of Y sections reviewed by humans" — these two values are inseparable in the `scores` table (already has `reviewedParagraphs` and `totalParagraphs` columns)
- **D-15:** CLI script (runnable via `pnpm benchmark` or similar) that sends identical paragraphs through multiple LLM providers and compares extraction quality
- **D-16:** Benchmark outputs a JSON comparison report with metrics: claim count per paragraph, severity distribution, extraction latency, token usage, and a manual review flag for qualitative assessment
- **D-17:** Benchmark runs against a curated set of test paragraphs (diverse article types: featured, stubs, scientific, biographical) — not against live Wikipedia API calls
- **D-18:** Analysis runs as a single per-article pg-boss job that iterates all paragraphs — keeps transaction scope clean and allows atomic status updates
- **D-19:** Ingestion worker automatically enqueues an analysis job on successful completion — seamless pipeline from URL submission to AI analysis
- **D-20:** Analysis job uses the existing `analysis-jobs` queue (already configured in `workers/index.ts` with retry=3, backoff, dead-letter routing)
- **D-21:** Rate limiting between LLM calls within a single analysis job — configurable delay between paragraph processing to respect provider rate limits

### Claude's Discretion

- Exact LLM prompt engineering for claim extraction and commentary drafting
- Token budget management strategy (context window splitting for long paragraphs)
- Specific severity classification criteria and thresholds
- Error handling granularity (per-paragraph failure vs entire article failure)
- Whether to store raw LLM responses alongside parsed output for debugging
- Exact benchmark CLI flag design and output formatting

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AI-02 | System extracts check-worthy claims from each paragraph using structured output (Zod schemas) | D-01–D-05; AI SDK v6 `generateText` + `Output.object()` pattern verified |
| AI-03 | System drafts commentary for each extracted claim with suggested primary sources marked as unverified | D-06–D-08; source must be JSONB in `commentaries` table |
| AI-04 | System queues AI analysis jobs via background job processor (pg-boss) with retry and failure handling | D-18–D-21; `analysis-jobs` queue already exists in `workers/index.ts` |
| AI-05 | System includes a benchmark harness to compare claim extraction quality across LLM providers | D-15–D-17; CLI script against curated fixture paragraphs |
| SCORE-01 | System computes a weighted Factual Score (0–100) per article based on claim accuracy, severity of distortions, and proportion of human-reviewed content | D-09–D-12; pure function; schema migration needed |
| SCORE-02 | Score always displays alongside "X of Y sections reviewed by humans" coverage indicator | D-14; `reviewedParagraphs` + `totalParagraphs` already in `scores` table |
| SCORE-03 | Unreviewed sections cannot contribute positively to the article's Factual Score | D-10; Coverage component = 0 for unreviewed paragraphs |
| SCORE-04 | Score weights are configurable (default: Coverage 40%, Accuracy 40%, Confidence 20%) | D-09; weights stored as config column or env-based config object |
</phase_requirements>

---

## Summary

Phase 3 delivers the AI analysis pipeline, scoring engine, and benchmark harness. The code is entirely server-side and background-worker-based — no UI changes, no Next.js route additions. The pipeline is: analysis-jobs worker iterates all paragraphs for an article, calls the LLM twice per paragraph (claim extraction then commentary drafting), persists results, and the scoring engine recomputes on each state change.

**Critical discovery:** The project has `ai@^6.0.168` installed (AI SDK v6), not v4.x as STACK.md references. In v6, `generateObject()` is deprecated. The canonical v6 API for structured output is `generateText` with `Output.object({ schema })`. The deprecated `generateObject` is still exported and functional but should not be used in new code. Decision D-01 references `generateObject()` — the implementation MUST use `generateText` + `Output.object()` instead. [VERIFIED: Context7 /vercel/ai migration guide]

**Schema gap:** The existing `claims` and `commentaries` tables are missing columns required by the locked decisions. A Drizzle migration is Wave 0 work:
- `claims`: missing `confidenceScore` (real/numeric), `charOffsetStart` (integer), `charOffsetEnd` (integer) — required by D-05
- `commentaries`: missing `suggestedSources` (JSONB) — required by D-07
- `scores`: missing `coverageComponent`, `accuracyComponent`, `confidenceComponent` (integer/real) and `scoreWeightsConfig` (JSONB) — required by D-09/D-12 and SCORE-04

**Primary recommendation:** Build analysis worker in `src/features/analysis/`, use `generateText` + `Output.object()` for all LLM calls, add schema migration as Wave 0 task before any LLM code, and wire benchmark as `scripts/benchmark.ts` runnable via `pnpm benchmark`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Claim extraction (LLM call) | Background Worker | — | CPU/IO-bound LLM call; must not block HTTP request lifecycle |
| Commentary drafting (LLM call) | Background Worker | — | Second chained LLM call per claim; same worker iteration |
| Factual Score computation | API/Backend (synchronous) | — | Pure math function; called inline when review status changes (D-13); no external I/O |
| Score persistence | Database | — | `scores` table; upsert on every recompute |
| Analysis job queue | pg-boss / Worker | — | `analysis-jobs` queue already configured; worker in `src/workers/index.ts` |
| Benchmark harness | CLI Script | — | Not part of app; standalone `scripts/benchmark.ts` using same `src/features/analysis/` modules |
| Schema migration (new columns) | Database | — | Wave 0; Drizzle migration required before any code that reads/writes new columns |

## Standard Stack

### Core (all already installed — verified via package.json)

| Library | Installed Version | Purpose | Verified Version |
|---------|------------------|---------|-----------------|
| `ai` | ^6.0.168 | Vercel AI SDK v6 — `generateText` + `Output.object()` for structured output | 6.0.168 [VERIFIED: package.json] |
| `zod` | ^4.3.6 | Schema definitions for `Output.object({ schema })` | 4.3.6 [VERIFIED: package.json] |
| `pg-boss` | ^12.15.0 | Background job queue — `analysis-jobs` queue already created | 12.15.0 [VERIFIED: package.json] |
| `drizzle-orm` | ^0.45.2 | All DB operations — insert claims, commentaries, scores | 0.45.2 [VERIFIED: package.json] |
| `@ai-sdk/anthropic` | ^3.0.71 | Anthropic provider for registry | 3.0.71 [VERIFIED: package.json] |
| `@ai-sdk/openai` | ^3.0.53 | OpenAI provider for registry | 3.0.53 [VERIFIED: package.json] |

### No Additional Installations Required

All libraries needed for Phase 3 are already installed. The benchmark script needs no new dependencies beyond what exists. [VERIFIED: package.json]

## Architecture Patterns

### System Architecture Diagram

```
POST /api/articles (Phase 2 route)
         |
         v
  ingest-worker.ts
  (fetch + parse + persist paragraphs)
         |
         v  (D-19: enqueue on completion)
  pg-boss: analysis-jobs queue
         |
         v
  analysis-worker.ts  (new — src/features/analysis/analysis-worker.ts)
         |
         +---> for each paragraph:
         |       |
         |       v
         |   claim-extractor.ts
         |   generateText + Output.object({ schema: claimExtractionSchema })
         |   --> returns: ClaimExtraction[] | []
         |       |
         |       v
         |   db.insert(claims) for each claim
         |       |
         |       v
         |   commentary-drafter.ts  (chained per claim — D-06)
         |   generateText + Output.object({ schema: commentarySchema })
         |   --> returns: { draftText, suggestedSources[] }
         |       |
         |       v
         |   db.insert(commentaries) with status=PENDING
         |
         v
  score-engine.ts (pure function — src/features/analysis/score-engine.ts)
  computeScore(articleId) -> { factualScore, coveragePercent, ... }
         |
         v
  db.insert/update scores table (upsert)
```

Phase 4 reviewer actions call `computeScore` again (D-13: event-driven recomputation).

### Recommended Project Structure

```
src/
├── features/
│   ├── ingestion/            # Phase 2 — existing, unchanged
│   └── analysis/             # Phase 3 — new
│       ├── index.ts          # Barrel export
│       ├── analysis-worker.ts   # pg-boss job handler (mirrors ingest-worker.ts)
│       ├── claim-extractor.ts   # generateText + Output.object for claim extraction
│       ├── commentary-drafter.ts # generateText + Output.object for commentary
│       ├── score-engine.ts      # Pure scoring function (no LLM, no I/O)
│       └── schemas.ts           # Zod schemas for claim extraction + commentary output
├── workers/
│   └── index.ts              # Phase 2 — extend: register analysis worker
scripts/
└── benchmark.ts              # CLI script (pnpm benchmark) — D-15
tests/
└── features/
    └── analysis/             # New test files (mirrors ingestion test pattern)
        ├── claim-extractor.test.ts
        ├── commentary-drafter.test.ts
        ├── score-engine.test.ts
        ├── analysis-worker.test.ts
        └── benchmark.test.ts
```

### Pattern 1: AI SDK v6 Structured Output (CRITICAL — replaces D-01 reference to generateObject)

**What:** `generateText` with `Output.object()` is the v6 canonical API for structured generation. `generateObject` is deprecated but still functional. New code must use `generateText + Output.object`.

**When to use:** All LLM calls that require typed structured output.

```typescript
// Source: Context7 /vercel/ai — migration-guide-6-0.mdx
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { registry } from '@/lib/ai-registry'

const claimExtractionSchema = z.object({
  claims: z.array(z.object({
    text: z.string().describe('The exact factual claim as stated'),
    severity: z.enum(['high', 'medium', 'low']).describe('Severity level'),
    charOffsetStart: z.number().int().describe('Start character offset in paragraph'),
    charOffsetEnd: z.number().int().describe('End character offset in paragraph'),
    confidenceScore: z.number().min(0).max(1).describe('LLM confidence 0-1'),
  })),
})

const { output } = await generateText({
  model: registry.languageModel(process.env.AI_MODEL!),
  output: Output.object({ schema: claimExtractionSchema }),
  system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
  prompt: paragraphText,
})
// output.claims is typed as the array above
```

### Pattern 2: pg-boss Analysis Worker (mirrors ingest-worker.ts)

**What:** Register a handler for `analysis-jobs` in `workers/index.ts`. The job payload is `{ articleId: string }`.

```typescript
// Source: existing src/workers/index.ts — extend the placeholder at line 41
await boss.work('analysis-jobs', async ([job]) => {
  const { articleId } = job.data as { articleId: string }
  await runAnalysisJob({ articleId })
})
```

```typescript
// Source: pattern from src/features/ingestion/ingest-worker.ts
import 'server-only'
import { db } from '@/db'
// ... extractClaims, draftCommentary, computeAndPersistScore
export async function runAnalysisJob(data: { articleId: string }): Promise<void> {
  const paragraphList = await db.select()...
  for (const para of paragraphList) {
    const claims = await extractClaims(para.content)
    // persist claims, draft commentary per claim
    // apply rate limiting delay (D-21)
  }
  await computeAndPersistScore(data.articleId)
}
```

### Pattern 3: Factual Score Engine — Pure Function

**What:** Synchronous computation, no LLM calls, no async I/O. Called after each analysis job completion and after each reviewer action (Phase 4 will call it on status changes — D-13).

```typescript
// Source: CONTEXT.md D-09 through D-12 + ARCHITECTURE.md scoring section
export interface ScoreWeights {
  coverage: number  // default 0.4
  accuracy: number  // default 0.4
  confidence: number // default 0.2
}

export function computeFactualScore(
  paragraphs: { isReviewed: boolean; confidenceScores: number[] }[],
  accuracyRatings: number[],  // from human reviews (empty = 0 accuracy component)
  weights: ScoreWeights = { coverage: 0.4, accuracy: 0.4, confidence: 0.2 }
): { factualScore: number; coveragePercent: number } {
  const coverage = (paragraphs.filter(p => p.isReviewed).length / paragraphs.length) * 100
  const accuracy = accuracyRatings.length > 0
    ? (accuracyRatings.reduce((a, b) => a + b, 0) / accuracyRatings.length) * 100
    : 0
  const allConfidences = paragraphs.flatMap(p => p.confidenceScores)
  const confidence = allConfidences.length > 0
    ? (allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) * 100
    : 0
  const score = Math.round(
    coverage * weights.coverage +
    accuracy * weights.accuracy +
    confidence * weights.confidence
  )
  return { factualScore: Math.min(100, Math.max(0, score)), coveragePercent: Math.round(coverage) }
}
```

### Pattern 4: Ingestion-to-Analysis Handoff (D-19)

**What:** Extend `ingest-worker.ts` to enqueue an analysis job after the transaction commits.

```typescript
// In src/features/ingestion/ingest-worker.ts — add after the transaction block
import { getBoss } from '@/jobs/boss'

// After db.transaction(...) completes:
const boss = await getBoss()
await boss.send('analysis-jobs', { articleId: article.id })
console.log('Analysis job enqueued for article:', article.id)
```

### Anti-Patterns to Avoid

- **Using `generateObject` in new code:** It is deprecated in AI SDK v6. Use `generateText` + `Output.object({ schema })`. The deprecated function still works but signals to future developers that this code predates v6.
- **Synchronous analysis in the HTTP handler:** Never await LLM calls in the POST /api/articles route. Always enqueue to pg-boss and return 202.
- **Wrapping entire article analysis in one DB transaction:** The transaction scope for AI output must be per-paragraph, not per-article. A 30-paragraph article with a mid-point LLM failure should retain what succeeded.
- **Hardcoding score weights as constants:** D-09 requires weights stored as config. Use a JSONB column `score_weights_config` in the `scores` table or a separate config object injected at compute time.
- **Marking AI-suggested sources as `verified = true`:** Sources MUST start as `unverified`. There is no code path where an AI-suggested source is born verified. This is a core trust contract.
- **Accessing `output.object` from deprecated `generateObject`:** In v6, the return shape changed. `generateObject` returned `{ object }`. `generateText` with `Output.object` returns `{ output }`. Use `result.output` not `result.object`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured LLM output with type safety | Custom JSON parser + regex on LLM response | `generateText` + `Output.object({ schema: zodSchema })` | AI SDK v6 handles retry on malformed JSON, schema validation, provider normalization |
| Provider-agnostic LLM calls | Custom adapter interface | `registry.languageModel(process.env.AI_MODEL!)` from existing `ai-registry.ts` | Already built in Phase 1; switches providers via env var |
| Background job retry + dead-letter | Custom retry loop | `analysis-jobs` queue in pg-boss (already configured: retry=3, exponential backoff, dead-letter to `analysis-failures`) | Already exists in `workers/index.ts`; just register the handler |
| Score caching | Redis or memory cache | Compute synchronously and store in `scores` table | At this phase's scale (small reviewer team), DB read is fast enough; Phase 4/5 can add caching when needed |

**Key insight:** The hardest part of this phase is prompt engineering, not infrastructure. The infrastructure (AI registry, job queue, DB schema types) is already built.

## Common Pitfalls

### Pitfall 1: AI SDK v6 API Mismatch
**What goes wrong:** Code written using `generateObject` (v4/v5 pattern) returns `result.object` — but in v6, this deprecated function is still exported and may return `result.object`. New code using `generateText + Output.object` returns `result.output`. Mixing the two patterns causes type errors or runtime undefined access.

**Why it happens:** CONTEXT.md and STACK.md reference `generateObject` (pre-v6 vocabulary). The installed package is v6.

**How to avoid:** Use only `generateText + Output.object` in all new Phase 3 code. If you see `result.object`, that's the deprecated API. If you see `result.output`, that's v6.

**Warning signs:** TypeScript type error on `result.object` being undefined; `output` being undefined when using deprecated import.

### Pitfall 2: Schema Column Gaps Cause Runtime Errors
**What goes wrong:** `claims` table is missing `confidence_score`, `char_offset_start`, `char_offset_end`. `commentaries` is missing `suggested_sources`. Drizzle insert calls will fail or silently drop data without a migration.

**Why it happens:** The Phase 1 schema defined these tables with minimal columns as placeholders. Phase 3 is where they get fully populated.

**How to avoid:** Run schema migration (Wave 0) before writing any LLM pipeline code. Use `drizzle-kit generate` then `drizzle-kit migrate` (or `push` in dev).

**Warning signs:** Drizzle type errors on insert; columns not appearing in DB after insert.

### Pitfall 3: LLM Confidence Score vs. Zod Validation
**What goes wrong:** The LLM is asked to provide a `confidenceScore: number` between 0 and 1. LLMs sometimes return values slightly outside this range (e.g., 1.001 or -0.001) or omit the field entirely. Zod `.min(0).max(1)` validation will throw `NoObjectGeneratedError` or similar.

**Why it happens:** LLMs don't always honor numeric constraints precisely. JSON output mode helps but doesn't guarantee.

**How to avoid:** Use Zod `.min(0).max(1)` but also add `.transform(v => Math.max(0, Math.min(1, v)))` as a safety clamp. Wrap LLM calls in try/catch with fallback to `confidenceScore: 0.5` on parse failure.

**Warning signs:** `ZodError` in analysis worker logs; jobs failing in dead-letter queue with parse errors.

### Pitfall 4: Analysis Job Atomicity vs. Per-Paragraph Failure Handling
**What goes wrong:** If the entire article analysis is one DB transaction, a LLM failure on paragraph 15 rolls back all the work on paragraphs 1-14. The job retries from scratch (pg-boss retry=3) and may fail again on the same paragraph.

**Why it happens:** Mirroring the ingestion worker pattern too closely. Ingestion is a single atomic operation (article didn't exist before); analysis is additive (claims accumulate per paragraph).

**How to avoid:** Commit each paragraph's claims + commentary independently. On LLM failure for a single paragraph, log the error and continue to the next paragraph (per-paragraph error handling). Only mark the job as failed if the article-level score computation fails.

**Warning signs:** All claims for an article disappearing and reappearing on retry; dead-letter queue filling with jobs that partially succeeded.

### Pitfall 5: Benchmark Harness Making Live API Calls in CI
**What goes wrong:** `scripts/benchmark.ts` calls real LLM providers. If run accidentally in CI or tests, it incurs API costs and is non-deterministic.

**Why it happens:** The benchmark is a dev tool but lives in the project. A test runner that glob-includes all `.ts` files could execute it.

**How to avoid:** Keep benchmark output in `scripts/`, not `tests/`. Add a `BENCHMARK_MODE=1` guard at the top of the script so it only runs when explicitly invoked. The benchmark test (`tests/features/analysis/benchmark.test.ts`) should only test the output format validation, not make live LLM calls.

## Code Examples

### Claim Extraction Zod Schema (D-05)

```typescript
// Source: CONTEXT.md D-05, AI SDK v6 Output.object pattern
import { z } from 'zod'

export const ClaimExtractionSchema = z.object({
  claims: z.array(z.object({
    text: z.string().describe('The exact factual claim as stated in the paragraph'),
    severity: z.enum(['high', 'medium', 'low']).describe(
      'high = health/safety/legal; medium = historical/scientific fact; low = trivial assertion'
    ),
    charOffsetStart: z.number().int().nonnegative(),
    charOffsetEnd: z.number().int().nonnegative(),
    confidenceScore: z.number().min(0).max(1)
      .transform(v => Math.max(0, Math.min(1, v))),
  })).describe('Empty array if no check-worthy claims found'),
})

export type ClaimExtractionOutput = z.infer<typeof ClaimExtractionSchema>
```

### Commentary Drafting Zod Schema (D-07)

```typescript
// Source: CONTEXT.md D-07
export const SuggestedSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  relevanceNote: z.string(),
  isVerified: z.literal(false).default(false), // NEVER true — core trust contract
})

export const CommentaryDraftSchema = z.object({
  analysisText: z.string().describe('AI-drafted fact-check analysis'),
  suggestedSources: z.array(SuggestedSourceSchema).min(1).max(3),
})
```

### Score Engine Invocation

```typescript
// Source: CONTEXT.md D-09 through D-14
// Called from analysis worker after all paragraphs processed,
// and from Phase 4 review handler on each status change (D-13)
import { computeFactualScore } from '@/features/analysis/score-engine'
import { db } from '@/db'
import { scores } from '@/db/schema'

const scoreResult = computeFactualScore(paragraphData, accuracyRatings, weights)
await db.insert(scores)
  .values({
    articleId,
    factualScore: scoreResult.factualScore,
    coveragePercent: scoreResult.coveragePercent,
    totalParagraphs: paragraphData.length,
    reviewedParagraphs: paragraphData.filter(p => p.isReviewed).length,
  })
  .onConflictDoUpdate({
    target: scores.articleId,
    set: { factualScore: scoreResult.factualScore, coveragePercent: scoreResult.coveragePercent, updatedAt: new Date() }
  })
```

### Benchmark CLI Script Pattern (D-15)

```typescript
// Source: CONTEXT.md D-15 through D-17
// scripts/benchmark.ts — run with: pnpm tsx scripts/benchmark.ts
if (!process.env.BENCHMARK_MODE) {
  console.error('Set BENCHMARK_MODE=1 to run benchmark')
  process.exit(1)
}

const PROVIDERS = ['anthropic:claude-sonnet-4-5-20250929', 'openai:gpt-4.1']
const results = []
for (const provider of PROVIDERS) {
  for (const fixture of BENCHMARK_FIXTURES) {
    const start = Date.now()
    const { output, usage } = await generateText({
      model: registry.languageModel(provider),
      output: Output.object({ schema: ClaimExtractionSchema }),
      prompt: fixture.paragraphText,
    })
    results.push({
      provider,
      fixtureId: fixture.id,
      claimCount: output.claims.length,
      severityDistribution: /* count by severity */,
      latencyMs: Date.now() - start,
      tokensUsed: usage.totalTokens,
      manualReview: false,
    })
  }
}
// Write JSON report
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateObject({ model, schema, prompt })` | `generateText({ model, output: Output.object({ schema }), prompt })` | AI SDK v6 (2025) | `result.object` -> `result.output`; deprecated API still works but avoid in new code |
| Direct provider SDK imports (`@anthropic-ai/sdk`) | `registry.languageModel(process.env.AI_MODEL!)` via `createProviderRegistry` | Phase 1 (established) | Provider switch = env var change only |

**Deprecated/outdated:**
- `generateObject`: Deprecated in AI SDK v6. Do not use in new Phase 3 code. [VERIFIED: Context7 migration guide]
- `streamObject`: Deprecated in favor of `streamText` with `Output.object`. Not needed for this phase (non-streaming job processing).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `computeAndPersistScore` is called after each analysis job — Phase 4 will call it again on review state changes without needing a separate trigger | Architecture Patterns | If Phase 4 doesn't import from `score-engine.ts`, score recomputation breaks; design the function signature to be importable by Phase 4 handlers |
| A2 | Per-paragraph error handling (continue on LLM failure) is the right granularity for D-03 (empty claims array stored for no-claims paragraphs) | Common Pitfalls | If claim extraction fails vs. returning empty, the distinction matters for analysis worker retry logic |
| A3 | The `getBoss()` singleton pattern used in other workers is already implemented in `src/jobs/boss.ts` — the ingestion worker and analysis worker can both call it | Code Examples | If `getBoss()` is not implemented, the enqueue-on-completion pattern (D-19) needs a different approach |

## Open Questions

1. **Where do score weights live?**
   - What we know: D-09 says "stored as config, not hardcoded". The `scores` table doesn't have a weight config column.
   - What's unclear: Do weights live in a `JSONB score_weights_config` column on the `scores` row, a separate config table, or an env var?
   - Recommendation: Add `scoreWeightsConfig JSONB DEFAULT '{"coverage":0.4,"accuracy":0.4,"confidence":0.2}'` to the `scores` table via migration. Simplest, no separate config table needed.

2. **Accuracy component source (D-11) in Phase 3 context**
   - What we know: D-11 says accuracy = weighted average of claim accuracy ratings from human reviews. In Phase 3, no human reviews exist yet.
   - What's unclear: Should accuracy always be 0 until Phase 4, or should the score engine accept an optional accuracy array that defaults to empty?
   - Recommendation: Score engine always accepts `accuracyRatings: number[]` — empty array = 0 accuracy component. This makes the Phase 3 score reflect 0% coverage and 0% accuracy (only confidence component is non-zero), which is the correct initial state.

3. **`getBoss()` singleton exists?**
   - What we know: `src/workers/index.ts` creates `new PgBoss(...)` directly. The ingestion worker does not import any boss singleton.
   - What's unclear: Is there a `src/jobs/boss.ts` that exports `getBoss()`?
   - Recommendation: Check `src/jobs/` directory. If no singleton, either pass the boss instance to `runIngestionJob` after completion, or create `src/lib/boss.ts` with a lazy singleton pattern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ai` package | Claim extraction, commentary drafting | Yes | 6.0.168 | — |
| `zod` | Schema definitions | Yes | 4.3.6 | — |
| `pg-boss` | Analysis job queue | Yes | 12.15.0 | — |
| PostgreSQL (via DATABASE_URL) | All DB operations | Yes (Docker Compose) | 16.x | — |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | LLM calls (integration tests and benchmark) | Assumed present in .env | — | Mock with vi.mock for unit tests |
| `pnpm tsx` | Benchmark CLI script | [ASSUMED] pnpm available | — | `npx tsx scripts/benchmark.ts` |

**Step 2.6: No blocking missing dependencies.** All required packages are installed. Tests mock LLM calls.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `pnpm vitest run tests/features/analysis/` |
| Full suite command | `pnpm vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AI-02 | `extractClaims()` returns typed claim array for a factual paragraph | unit | `pnpm vitest run tests/features/analysis/claim-extractor.test.ts -x` | No — Wave 0 |
| AI-02 | `extractClaims()` returns empty array for non-factual paragraph (D-03) | unit | same | No — Wave 0 |
| AI-02 | Claim schema includes all D-05 fields (text, severity, offsets, confidence) | unit | same | No — Wave 0 |
| AI-03 | `draftCommentary()` returns commentary with suggestedSources all marked `isVerified: false` | unit | `pnpm vitest run tests/features/analysis/commentary-drafter.test.ts -x` | No — Wave 0 |
| AI-04 | Analysis worker persists claims and commentaries to DB | integration | `pnpm vitest run tests/features/analysis/analysis-worker.test.ts -x` | No — Wave 0 |
| AI-04 | Ingestion worker enqueues analysis job after completion | integration | extend `tests/features/ingestion/ingest-worker.test.ts` | Partially — Wave 0 gap |
| AI-05 | Benchmark outputs valid JSON with required metrics fields (D-16) | unit (output shape) | `pnpm vitest run tests/features/analysis/benchmark.test.ts -x` | No — Wave 0 |
| SCORE-01 | `computeFactualScore()` returns 0 for fully unreviewed article | unit | `pnpm vitest run tests/features/analysis/score-engine.test.ts -x` | No — Wave 0 |
| SCORE-01 | `computeFactualScore()` reaches 100 only when all paragraphs reviewed and all claims accurate | unit | same | No — Wave 0 |
| SCORE-03 | Unreviewed paragraph contributes 0 to coverage component | unit | same | No — Wave 0 |
| SCORE-04 | Score weights are overridable (custom weights produce different score) | unit | same | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm vitest run tests/features/analysis/score-engine.test.ts tests/features/analysis/claim-extractor.test.ts`
- **Per wave merge:** `pnpm vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/features/analysis/claim-extractor.test.ts` — covers AI-02; mock `generateText` with `vi.mock('ai')`
- [ ] `tests/features/analysis/commentary-drafter.test.ts` — covers AI-03; assert `isVerified: false` on all sources
- [ ] `tests/features/analysis/score-engine.test.ts` — covers SCORE-01, SCORE-03, SCORE-04; pure function, no mocks needed
- [ ] `tests/features/analysis/analysis-worker.test.ts` — covers AI-04; mock LLM + use test DB (pattern from `ingest-worker.test.ts`)
- [ ] `tests/features/analysis/benchmark.test.ts` — covers AI-05 output shape only; no live LLM calls
- [ ] Schema migration file — `drizzle-kit generate` for new columns on `claims`, `commentaries`, `scores`
- [ ] Verify `src/jobs/boss.ts` exists or create lazy singleton pattern needed by D-19

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | AI pipeline is internal background worker; no public endpoint |
| V3 Session Management | No | No HTTP session in background worker |
| V4 Access Control | Yes | Analysis trigger must only be possible via authenticated ingestion path — analysis-jobs queue must not be directly enqueue-able from public routes |
| V5 Input Validation | Yes | `Output.object({ schema: zodSchema })` validates all LLM output; Zod prevents malformed claim data persisting to DB |
| V6 Cryptography | No | No crypto operations in this phase |

### Known Threat Patterns for AI Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via Wikipedia paragraph content | Tampering | System prompt explicitly separates instructions from paragraph content; paragraph goes in `prompt:`, system instructions in `system:`; never concatenate user/article content into system prompt |
| Unlimited LLM cost via unconstrained job queue | Denial of Service | pg-boss analysis-jobs queue feeds from authenticated ingestion only; rate limiting (D-21) between paragraph calls; analysis-failures dead-letter caps blast radius |
| AI-hallucinated sources appearing as verified | Information Disclosure | `isVerified: false` is hardcoded by schema default — no code path exists to set `true` on AI-generated sources; Zod schema enforces `z.literal(false)` |
| LLM API key exposure | Information Disclosure | `import 'server-only'` at top of all analysis modules (pattern from `ai-registry.ts`); keys never in client bundle |

## Sources

### Primary (HIGH confidence)

- Context7 `/vercel/ai` — `generateObject` deprecation, `generateText + Output.object()` migration guide, `createProviderRegistry` API [VERIFIED: Context7 tool output in this session]
- `package.json` (project root) — verified installed versions: ai@6.0.168, zod@4.3.6, pg-boss@12.15.0, drizzle-orm@0.45.2 [VERIFIED: file read]
- `src/db/schema.ts` — exact current column definitions; confirmed missing columns for Phase 3 [VERIFIED: file read]
- `src/workers/index.ts` — analysis-jobs queue configuration; placeholder at line 41 [VERIFIED: file read]
- `src/lib/ai-registry.ts` — `createProviderRegistry` usage; `registry.languageModel(process.env.AI_MODEL!)` pattern [VERIFIED: file read]
- `.planning/phases/03-ai-pipeline-and-scoring/03-CONTEXT.md` — all locked decisions D-01 through D-21 [VERIFIED: file read]

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — Stack overview (note: references AI SDK v4; installed version is v6) [CITED: project research file]
- `.planning/research/ARCHITECTURE.md` — AI Pipeline architecture, data flow [CITED: project research file]
- `.planning/research/PITFALLS.md` — Pitfall 3 (hallucinated citations), Pitfall 7 (provider semantic drift) [CITED: project research file]

### Tertiary (LOW confidence)

- Score weight formula (40/40/20 split) is a design recommendation from prior research, not validated against actual reviewers [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified via package.json; AI SDK version mismatch discovered and documented
- Architecture: HIGH — existing code patterns verified; integration points confirmed from file reads
- API patterns: HIGH — AI SDK v6 `generateText + Output.object` verified via Context7
- Schema gaps: HIGH — verified by reading schema.ts; missing columns listed explicitly
- Pitfalls: HIGH — grounded in AI SDK v6 migration docs, existing test patterns, and project pitfalls research

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (AI SDK v6 stable; schema verified against live codebase)
