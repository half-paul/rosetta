# Phase 3: AI Pipeline and Scoring - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 12 new/modified files
**Analogs found:** 10 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/features/analysis/analysis-worker.ts` | service / worker | event-driven | `src/features/ingestion/ingest-worker.ts` | exact |
| `src/features/analysis/claim-extractor.ts` | service | request-response | `src/lib/ai-registry.ts` | role-match |
| `src/features/analysis/commentary-drafter.ts` | service | request-response | `src/lib/ai-registry.ts` | role-match |
| `src/features/analysis/score-engine.ts` | utility | transform | `src/features/ingestion/stable-id.ts` | role-match |
| `src/features/analysis/schemas.ts` | utility / config | transform | `src/features/ingestion/stable-id.ts` | partial-match |
| `src/features/analysis/index.ts` | config | — | `src/features/ingestion/index.ts` | exact |
| `src/workers/index.ts` *(modify)* | config | event-driven | `src/workers/index.ts` | exact (self) |
| `src/features/ingestion/ingest-worker.ts` *(modify)* | service / worker | event-driven | `src/features/ingestion/ingest-worker.ts` | exact (self) |
| `scripts/benchmark.ts` | utility / CLI | batch | — | no analog |
| `tests/features/analysis/claim-extractor.test.ts` | test | — | `tests/features/ingestion/ingest-worker.test.ts` | role-match |
| `tests/features/analysis/commentary-drafter.test.ts` | test | — | `tests/features/ingestion/ingest-worker.test.ts` | role-match |
| `tests/features/analysis/score-engine.test.ts` | test | — | `tests/features/ingestion/ingest-worker.test.ts` | role-match |
| `tests/features/analysis/analysis-worker.test.ts` | test | — | `tests/features/ingestion/ingest-worker.test.ts` | exact |
| `tests/features/analysis/benchmark.test.ts` | test | — | `tests/lib/ai-registry.test.ts` | partial-match |
| Schema migration (Drizzle) | migration | — | `src/db/schema.ts` | exact (source) |

---

## Pattern Assignments

### `src/features/analysis/analysis-worker.ts` (service, event-driven)

**Analog:** `src/features/ingestion/ingest-worker.ts`

**Imports pattern** (lines 1–6):
```typescript
import 'server-only'
import { fetchArticle } from './mediawiki-client'
import { parseWikipediaHtml } from './parse-article'
import { db } from '@/db'
import { articles, sections, paragraphs } from '@/db/schema'
```
Apply same shape — replace ingestion imports with analysis imports:
```typescript
import 'server-only'
import { extractClaims } from './claim-extractor'
import { draftCommentary } from './commentary-drafter'
import { computeAndPersistScore } from './score-engine'
import { db } from '@/db'
import { paragraphs, claims, commentaries } from '@/db/schema'
```

**Core job-handler pattern** (lines 13–48 of `ingest-worker.ts`):
```typescript
export async function runIngestionJob(data: { url: string; title: string }): Promise<void> {
  // ...fetch and parse...
  await db.transaction(async (tx) => {
    const [article] = await tx.insert(articles).values({ ... }).returning()
    for (const section of parsedSections) {
      // ...nested inserts...
    }
  })
  console.log('Ingestion complete:', data.title, '- sections:', parsedSections.length)
}
```
For analysis, iterate paragraphs without a wrapping transaction (per-paragraph commit — RESEARCH Pitfall 4):
```typescript
export async function runAnalysisJob(data: { articleId: string }): Promise<void> {
  const paragraphList = await db.select().from(paragraphs).where(...)
  for (const para of paragraphList) {
    try {
      const extracted = await extractClaims(para.content)
      // db.insert(claims) for each extracted claim
      for (const claim of extracted.claims) {
        const [savedClaim] = await db.insert(claims).values({ ... }).returning()
        const commentary = await draftCommentary(para.content, claim)
        await db.insert(commentaries).values({ claimId: savedClaim.id, ... })
      }
      // update paragraph status to AI_ANALYZED
    } catch (err) {
      console.error('Paragraph analysis failed, continuing:', para.id, err)
    }
    // D-21: configurable rate-limit delay between paragraphs
    await new Promise(r => setTimeout(r, Number(process.env.ANALYSIS_RATE_LIMIT_MS ?? 500)))
  }
  await computeAndPersistScore(data.articleId)
  console.log('Analysis complete:', data.articleId)
}
```

**Error handling pattern** (from `ingest-worker.ts` via `workers/index.ts` lines 35–38):
```typescript
await boss.work('ingestion-jobs', async ([job]) => {
  console.log(`Processing ingestion job ${job.id}`, job.data)
  await runIngestionJob(job.data as { url: string; title: string })
})
```
Any thrown error propagates to pg-boss, which retries up to `retryLimit: 3` then routes to dead-letter.

---

### `src/features/analysis/claim-extractor.ts` (service, request-response)

**Analog:** `src/lib/ai-registry.ts`

**Imports pattern** (lines 1–5 of `ai-registry.ts`):
```typescript
import 'server-only'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'
```
For claim extractor:
```typescript
import 'server-only'
import { generateText, Output } from 'ai'
import { registry } from '@/lib/ai-registry'
import { ClaimExtractionSchema, type ClaimExtractionOutput } from './schemas'
```

**Core AI SDK v6 pattern** (from RESEARCH.md Pattern 1 — verified `generateText + Output.object`):
```typescript
export async function extractClaims(paragraphText: string): Promise<ClaimExtractionOutput> {
  const { output } = await generateText({
    model: registry.languageModel(process.env.AI_MODEL!),
    output: Output.object({ schema: ClaimExtractionSchema }),
    system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
    prompt: paragraphText,
  })
  return output  // typed as ClaimExtractionOutput
}
```
Note: return `output` (NOT `object` — that is the deprecated v5 API shape).

**Error handling pattern** (from RESEARCH.md Pitfall 3):
Wrap LLM call in try/catch; on Zod parse failure fall back gracefully:
```typescript
try {
  const { output } = await generateText({ ... })
  return output
} catch (err) {
  console.error('extractClaims failed, returning empty:', err)
  return { claims: [] }
}
```

---

### `src/features/analysis/commentary-drafter.ts` (service, request-response)

**Analog:** `src/lib/ai-registry.ts` + claim-extractor pattern (same shape, different schema)

**Imports pattern:**
```typescript
import 'server-only'
import { generateText, Output } from 'ai'
import { registry } from '@/lib/ai-registry'
import { CommentaryDraftSchema, type CommentaryDraftOutput } from './schemas'
```

**Core pattern** — chained call per claim (D-06), same `generateText + Output.object` as claim extractor:
```typescript
export async function draftCommentary(
  paragraphText: string,
  claim: { text: string; severity: string }
): Promise<CommentaryDraftOutput> {
  const { output } = await generateText({
    model: registry.languageModel(process.env.AI_MODEL!),
    output: Output.object({ schema: CommentaryDraftSchema }),
    system: COMMENTARY_SYSTEM_PROMPT,
    prompt: `Paragraph: ${paragraphText}\n\nClaim to analyze: ${claim.text}`,
  })
  return output
}
```
The `suggestedSources` array items MUST have `isVerified: false` — enforced by `z.literal(false)` in the schema, but assert in the DB insert too.

---

### `src/features/analysis/score-engine.ts` (utility, transform)

**Analog:** `src/features/ingestion/stable-id.ts` (pure functions, no async, no I/O)

**Imports pattern** (lines 1 of `stable-id.ts` — no imports; pure Node):
```typescript
import { createHash } from 'node:crypto'
```
For score engine, only `@/db` and `@/db/schema` needed for the `computeAndPersistScore` persistence wrapper:
```typescript
import { db } from '@/db'
import { scores, claims, paragraphs } from '@/db/schema'
import { eq } from 'drizzle-orm'
```

**Core pure-function pattern** (from `stable-id.ts` lines 6–31 — exported named functions, JSDoc, no side effects):
```typescript
export interface ScoreWeights {
  coverage: number   // default 0.4
  accuracy: number   // default 0.4
  confidence: number // default 0.2
}

export const DEFAULT_WEIGHTS: ScoreWeights = { coverage: 0.4, accuracy: 0.4, confidence: 0.2 }

export function computeFactualScore(
  paragraphs: { isReviewed: boolean; confidenceScores: number[] }[],
  accuracyRatings: number[],
  weights: ScoreWeights = DEFAULT_WEIGHTS
): { factualScore: number; coveragePercent: number; coverageComponent: number; accuracyComponent: number; confidenceComponent: number } {
  // ...pure math per D-09–D-12...
}
```
Separate async wrapper for DB upsert (`computeAndPersistScore`) follows the Drizzle upsert pattern from `ingest-worker.ts`.

**DB upsert pattern** (from RESEARCH.md Code Examples — score engine invocation):
```typescript
await db.insert(scores)
  .values({ articleId, factualScore, coveragePercent, totalParagraphs, reviewedParagraphs })
  .onConflictDoUpdate({
    target: scores.articleId,
    set: { factualScore, coveragePercent, updatedAt: new Date() }
  })
```

---

### `src/features/analysis/schemas.ts` (utility, transform)

**Analog:** No exact analog. Closest in spirit: `src/db/schema.ts` (schema definitions as the single source of truth).

**Imports pattern:**
```typescript
import { z } from 'zod'
```

**Core pattern** (from RESEARCH.md Code Examples — claim extraction schema):
```typescript
export const ClaimExtractionSchema = z.object({
  claims: z.array(z.object({
    text: z.string().describe('The exact factual claim as stated in the paragraph'),
    severity: z.enum(['high', 'medium', 'low']).describe(
      'high = health/safety/legal; medium = historical/scientific fact; low = trivial assertion'
    ),
    charOffsetStart: z.number().int().nonnegative(),
    charOffsetEnd: z.number().int().nonnegative(),
    confidenceScore: z.number().min(0).max(1)
      .transform(v => Math.max(0, Math.min(1, v))),  // RESEARCH Pitfall 3: clamp
  })).describe('Empty array if no check-worthy claims found'),
})
export type ClaimExtractionOutput = z.infer<typeof ClaimExtractionSchema>

export const SuggestedSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  relevanceNote: z.string(),
  isVerified: z.literal(false).default(false),  // NEVER true — trust contract (D-07)
})

export const CommentaryDraftSchema = z.object({
  analysisText: z.string().describe('AI-drafted fact-check analysis'),
  suggestedSources: z.array(SuggestedSourceSchema).min(1).max(3),
})
export type CommentaryDraftOutput = z.infer<typeof CommentaryDraftSchema>
```

---

### `src/features/analysis/index.ts` (barrel, config)

**Analog:** `src/features/ingestion/index.ts` (lines 1–8) — exact structural match.

**Pattern** (copy shape exactly):
```typescript
import 'server-only'
export { runAnalysisJob } from './analysis-worker'
export { extractClaims } from './claim-extractor'
export type { ClaimExtractionOutput } from './schemas'
export { draftCommentary } from './commentary-drafter'
export type { CommentaryDraftOutput } from './schemas'
export { computeFactualScore, computeAndPersistScore } from './score-engine'
export type { ScoreWeights } from './score-engine'
export { ClaimExtractionSchema, CommentaryDraftSchema } from './schemas'
```

---

### `src/workers/index.ts` *(modify — register analysis worker)*

**Analog:** Self — `src/workers/index.ts` (lines 35–44).

**Existing placeholder** (lines 40–44):
```typescript
// Worker registration:
await boss.work('analysis-jobs', async ([job]) => {
  console.log(`Processing job ${job.id}`, job.data)
  // Job handlers will be registered here in Phase 3
})
```
Replace placeholder body — mirror the ingestion worker registration at lines 35–38:
```typescript
import { runAnalysisJob } from '@/features/analysis/analysis-worker'

await boss.work('analysis-jobs', async ([job]) => {
  console.log(`Processing analysis job ${job.id}`, job.data)
  await runAnalysisJob(job.data as { articleId: string })
})
```

---

### `src/features/ingestion/ingest-worker.ts` *(modify — enqueue analysis job on completion, D-19)*

**Analog:** Self — `src/features/ingestion/ingest-worker.ts` (lines 1–48).

**Integration point** — add after the `db.transaction(...)` block (after line 45), before the `console.log`:
```typescript
// D-19: enqueue analysis job on ingestion completion
// boss instance must be passed in or obtained via singleton
// Pattern from workers/index.ts — boss.send(queueName, payload)
const boss = new PgBoss(process.env.DATABASE_URL!)
await boss.start()
await boss.send('analysis-jobs', { articleId: article.id })
```
Note: RESEARCH.md Open Question 3 — `src/jobs/boss.ts` singleton does not yet exist. The planner should create a `src/lib/boss.ts` lazy singleton so both workers share the same boss instance. The pattern for a lazy singleton is:
```typescript
// src/lib/boss.ts
import 'server-only'
import { PgBoss } from 'pg-boss'

let _boss: PgBoss | null = null

export async function getBoss(): Promise<PgBoss> {
  if (!_boss) {
    _boss = new PgBoss(process.env.DATABASE_URL!)
    _boss.on('error', console.error)
    await _boss.start()
  }
  return _boss
}
```
Then in `ingest-worker.ts`:
```typescript
import { getBoss } from '@/lib/boss'
// after transaction:
const boss = await getBoss()
await boss.send('analysis-jobs', { articleId: article.id })
```

---

### `scripts/benchmark.ts` (utility / CLI, batch)

**Analog:** None in codebase. No existing scripts directory. Pattern is from RESEARCH.md Code Examples directly.

**Core pattern** (RESEARCH.md lines 422–453 — benchmark CLI script):
```typescript
// scripts/benchmark.ts — guard against accidental CI execution (RESEARCH Pitfall 5)
if (!process.env.BENCHMARK_MODE) {
  console.error('Set BENCHMARK_MODE=1 to run benchmark')
  process.exit(1)
}

import { generateText, Output } from 'ai'
import { registry } from '../src/lib/ai-registry'
import { ClaimExtractionSchema } from '../src/features/analysis/schemas'

const PROVIDERS = ['anthropic:claude-sonnet-4-5-20250929', 'openai:gpt-4.1']

for (const provider of PROVIDERS) {
  for (const fixture of BENCHMARK_FIXTURES) {
    const start = Date.now()
    const { output, usage } = await generateText({
      model: registry.languageModel(provider),
      output: Output.object({ schema: ClaimExtractionSchema }),
      system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
      prompt: fixture.paragraphText,
    })
    results.push({
      provider, fixtureId: fixture.id,
      claimCount: output.claims.length,
      severityDistribution: /* group by severity */,
      latencyMs: Date.now() - start,
      tokensUsed: usage.totalTokens,
      manualReview: false,
    })
  }
}
// Write JSON report to stdout or file
```
Note: Uses `import` from `../src/...` (relative paths) since there's no tsconfig path alias resolution for standalone scripts outside Next.js. Run via `pnpm tsx scripts/benchmark.ts`.

---

### Test Files (`tests/features/analysis/*.test.ts`)

**Analog:** `tests/features/ingestion/ingest-worker.test.ts` — exact structural match for integration tests.

**Imports + mock pattern** (lines 1–32 of `ingest-worker.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'

vi.mock('server-only', () => ({}))

// Mock AI SDK for unit tests — no live LLM calls
vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn() },
}))

// Mock @/db to use test pool
vi.mock('@/db', async () => {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('@/db/schema')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return { db: drizzle(pool, { schema }) }
})
```

**Test cleanup pattern** (lines 37–41):
```typescript
async function cleanTestData() {
  await testDb.delete(schema.commentaries)
  await testDb.delete(schema.claims)
  // foreign key order: children before parents
}
```

**Describe + beforeEach pattern** (lines 101–108):
```typescript
describe('runAnalysisJob integration (AI-04)', () => {
  beforeEach(async () => {
    await cleanTestData()
    vi.mocked(generateText).mockResolvedValue({ output: MOCK_CLAIMS_OUTPUT, usage: { totalTokens: 100 } })
  })
  afterAll(async () => { await cleanTestData(); await pool.end() })
  it('...', async () => { ... })
})
```

**Unit test pattern for pure functions** (from `tests/lib/ai-registry.test.ts` lines 1–30 — no mocks, no DB):
```typescript
// score-engine.test.ts — pure function, no mocks, no DB
import { describe, it, expect } from 'vitest'
import { computeFactualScore, DEFAULT_WEIGHTS } from '@/features/analysis/score-engine'

describe('computeFactualScore (SCORE-01, SCORE-03, SCORE-04)', () => {
  it('returns 0 for fully unreviewed article', () => {
    const result = computeFactualScore(
      [{ isReviewed: false, confidenceScores: [0.8] }],
      [],
      DEFAULT_WEIGHTS
    )
    expect(result.factualScore).toBe(0)  // coverage=0, accuracy=0, confidence=~16
    // Actually: confidence contributes 0.2 * 80 = 16 — test should reflect this
  })
})
```

---

## Shared Patterns

### `import 'server-only'` Guard
**Source:** `src/lib/ai-registry.ts` line 1; `src/db/index.ts` line 1; `src/features/ingestion/ingest-worker.ts` line 1
**Apply to:** ALL files in `src/features/analysis/` that import `ai-registry`, `@/db`, or contain API keys
```typescript
import 'server-only'
```

### Drizzle Insert + Returning
**Source:** `src/features/ingestion/ingest-worker.ts` lines 18–23
```typescript
const [article] = await tx.insert(articles).values({
  title: response.parse.title,
  wikiUrl: data.url,
  revisionId: response.parse.revid,
  language: 'en',
}).returning()
```
Apply to all `db.insert(claims)`, `db.insert(commentaries)`, `db.insert(scores)` calls that need the inserted row's `id`.

### Drizzle Upsert (`onConflictDoUpdate`)
**Source:** RESEARCH.md Code Examples (score engine invocation)
**Apply to:** `computeAndPersistScore` in `score-engine.ts` — `scores` table has unique constraint on `articleId`
```typescript
await db.insert(scores)
  .values({ articleId, factualScore, ... })
  .onConflictDoUpdate({
    target: scores.articleId,
    set: { factualScore, coveragePercent, updatedAt: new Date() }
  })
```

### pg-boss Worker Registration
**Source:** `src/workers/index.ts` lines 35–38
```typescript
await boss.work('ingestion-jobs', async ([job]) => {
  console.log(`Processing ingestion job ${job.id}`, job.data)
  await runIngestionJob(job.data as { url: string; title: string })
})
```
Apply to analysis worker registration: replace queue name and job handler.

### CUID2 Primary Keys
**Source:** `src/db/schema.ts` lines 89, 101, 113, 128, 140
```typescript
id: text('id').primaryKey().$defaultFn(() => createId()),
```
Apply to any new table columns added in schema migration.

### Timestamps (createdAt / updatedAt / deletedAt)
**Source:** `src/db/schema.ts` lines 94–98 (articles table pattern, repeated on all domain tables)
```typescript
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```
Apply to new columns added to `claims`, `commentaries`, `scores` in migration.

### AI SDK v6 Structured Output
**Source:** `src/lib/ai-registry.ts` (registry) + RESEARCH.md Pattern 1 (verified via Context7)
```typescript
import { generateText, Output } from 'ai'
import { registry } from '@/lib/ai-registry'

const { output } = await generateText({
  model: registry.languageModel(process.env.AI_MODEL!),
  output: Output.object({ schema: MyZodSchema }),
  system: SYSTEM_PROMPT,
  prompt: userContent,
})
// use `output` — NOT `result.object` (that is the deprecated v5 shape)
```
Apply to: `claim-extractor.ts`, `commentary-drafter.ts`, `scripts/benchmark.ts`.

---

## Schema Migration Required (Wave 0)

**Source:** `src/db/schema.ts` — current columns verified. New columns required before any Phase 3 LLM code.

| Table | Missing Columns (must add via Drizzle migration) | Decision |
|---|---|---|
| `claims` | `confidenceScore` (real), `charOffsetStart` (integer), `charOffsetEnd` (integer) | D-05 |
| `commentaries` | `suggestedSources` (JSONB) | D-07 |
| `scores` | `coverageComponent` (integer), `accuracyComponent` (integer), `confidenceComponent` (integer), `scoreWeightsConfig` (JSONB) | D-09/D-12/SCORE-04 |

Migration pattern from `src/db/schema.ts` column definitions:
```typescript
import { real, jsonb } from 'drizzle-orm/pg-core'

// claims additions:
confidenceScore: real('confidence_score'),
charOffsetStart: integer('char_offset_start'),
charOffsetEnd: integer('char_offset_end'),

// commentaries additions:
suggestedSources: jsonb('suggested_sources'),

// scores additions:
coverageComponent: integer('coverage_component').notNull().default(0),
accuracyComponent: integer('accuracy_component').notNull().default(0),
confidenceComponent: integer('confidence_component').notNull().default(0),
scoreWeightsConfig: jsonb('score_weights_config').notNull().default({ coverage: 0.4, accuracy: 0.4, confidence: 0.2 }),
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `scripts/benchmark.ts` | utility / CLI | batch | No CLI scripts exist in the codebase; no `scripts/` directory exists |
| `src/lib/boss.ts` (new singleton) | utility | — | No pg-boss singleton exists; boss is instantiated directly in `workers/index.ts` line 9 — singleton needed for D-19 handoff |

---

## Metadata

**Analog search scope:** `src/features/`, `src/lib/`, `src/db/`, `src/workers/`, `tests/`
**Files scanned:** 14 source files + 10 test files
**Pattern extraction date:** 2026-04-19
