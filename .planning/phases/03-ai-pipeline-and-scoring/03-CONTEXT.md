# Phase 3: AI Pipeline and Scoring - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Every ingested article's paragraphs are analyzed by the AI pipeline -- claims extracted, commentary drafted with unverified sources, and a Factual Score computed that encodes human-review coverage as a hard constraint. This phase delivers claim extraction, commentary drafting, the scoring engine, and a benchmark harness for comparing LLM providers. The reviewer dashboard (Phase 4) consumes this output but is not built here.

</domain>

<decisions>
## Implementation Decisions

### Claim Extraction Pipeline
- **D-01:** Use Vercel AI SDK `generateObject()` with a Zod schema per paragraph to extract check-worthy claims as structured output -- one LLM call per paragraph
- **D-02:** Check-worthy claims are factual assertions that can be independently verified -- exclude opinions, definitions, tautologies, and trivially true statements
- **D-03:** Paragraphs with no check-worthy claims still get processed -- store an empty claims array and mark the paragraph as analyzed (status moves to AI_ANALYZED) so coverage tracking is accurate
- **D-04:** Claim severity is assigned during extraction (e.g., "high" for health/safety claims, "medium" for historical facts, "low" for trivial assertions) -- severity drives queue priority in Phase 4
- **D-05:** The Zod schema for claim extraction output includes: claim text, severity level, start/end character offsets within the paragraph, and a confidence score (0-1) from the LLM

### Commentary Drafting
- **D-06:** Commentary drafting is a chained second LLM call per claim -- extract claims first, then draft commentary for each extracted claim separately
- **D-07:** Each commentary includes AI-drafted analysis text and 1-3 suggested source objects (URL, title, relevance note) -- all sources are marked `unverified` by default with no exceptions
- **D-08:** Commentary status starts as PENDING, transitions to AI_ANALYZED after drafting completes -- the five-state workflow (PENDING -> AI_ANALYZED -> HUMAN_APPROVED -> PUBLISHED, HUMAN_REJECTED -> PENDING) is enforced by the pgEnum in schema.ts

### Scoring Algorithm
- **D-09:** Factual Score (0-100) computed per article with configurable weights: Coverage 40%, Accuracy 40%, Confidence 20% (stored as config, not hardcoded)
- **D-10:** Coverage component = (human-reviewed paragraphs / total paragraphs) * 100 -- unreviewed paragraphs contribute 0, making it impossible for an unreviewed article to score well
- **D-11:** Accuracy component = weighted average of claim accuracy ratings from human reviews (0 if no reviews exist)
- **D-12:** Confidence component = average LLM confidence scores across all claims (provides a baseline signal even before human review)
- **D-13:** Score recomputation is event-driven -- triggers on every review status change (approval, rejection, edit) rather than on a schedule
- **D-14:** Score always stored alongside "X of Y sections reviewed by humans" -- these two values are inseparable in the `scores` table (already has `reviewedParagraphs` and `totalParagraphs` columns)

### Benchmark Harness
- **D-15:** CLI script (runnable via `pnpm benchmark` or similar) that sends identical paragraphs through multiple LLM providers and compares extraction quality
- **D-16:** Benchmark outputs a JSON comparison report with metrics: claim count per paragraph, severity distribution, extraction latency, token usage, and a manual review flag for qualitative assessment
- **D-17:** Benchmark runs against a curated set of test paragraphs (diverse article types: featured, stubs, scientific, biographical) -- not against live Wikipedia API calls

### Job Processing Flow
- **D-18:** Analysis runs as a single per-article pg-boss job that iterates all paragraphs -- keeps transaction scope clean and allows atomic status updates
- **D-19:** Ingestion worker automatically enqueues an analysis job on successful completion -- seamless pipeline from URL submission to AI analysis
- **D-20:** Analysis job uses the existing `analysis-jobs` queue (already configured in `workers/index.ts` with retry=3, backoff, dead-letter routing)
- **D-21:** Rate limiting between LLM calls within a single analysis job -- configurable delay between paragraph processing to respect provider rate limits

### Claude's Discretion
- Exact LLM prompt engineering for claim extraction and commentary drafting
- Token budget management strategy (context window splitting for long paragraphs)
- Specific severity classification criteria and thresholds
- Error handling granularity (per-paragraph failure vs entire article failure)
- Whether to store raw LLM responses alongside parsed output for debugging
- Exact benchmark CLI flag design and output formatting

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value prop, provider-agnostic constraint, human-in-the-loop requirement
- `.planning/REQUIREMENTS.md` -- AI-01 through AI-06, SCORE-01 through SCORE-04 (this phase's requirements)
- `.planning/ROADMAP.md` -- Phase 3 success criteria and dependency on Phase 2

### Research & Architecture
- `.planning/research/STACK.md` -- Vercel AI SDK v4 patterns, Zod v4 structured output, pg-boss job queue
- `.planning/research/ARCHITECTURE.md` -- AI pipeline architecture, claim extraction flow
- `.planning/research/PITFALLS.md` -- LLM-related pitfalls (provider switching, structured output edge cases)
- `.planning/research/SUMMARY.md` -- Phase 3 deliverables and risk areas

### Prior Phase Context
- `.planning/phases/01-foundation/01-CONTEXT.md` -- Schema conventions, project structure, auth decisions, LLM abstraction choice
- `.planning/phases/02-wikipedia-ingestion/02-CONTEXT.md` -- Ingestion flow, parsing approach, stable ID generation, worker pattern

### Existing Code (must read before implementing)
- `src/lib/ai-registry.ts` -- Provider registry (anthropic + openai) already configured
- `src/db/schema.ts` -- claims, commentaries, scores tables with all columns defined
- `src/workers/index.ts` -- analysis-jobs queue already created with retry/dead-letter config
- `src/types/index.ts` -- Claim, Commentary, Score types inferred from schema
- `src/features/ingestion/ingest-worker.ts` -- Ingestion worker pattern to follow for analysis worker

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/ai-registry.ts` -- Vercel AI SDK `createProviderRegistry` with anthropic + openai providers. Use `registry.languageModel(process.env.AI_MODEL!)` to get the active model
- `src/db/schema.ts` -- `claims` table (paragraphId, text, severity), `commentaries` table (claimId, draftText, status with reviewStatusEnum), `scores` table (articleId, factualScore, coveragePercent, totalParagraphs, reviewedParagraphs)
- `src/workers/index.ts` -- `analysis-jobs` queue pre-configured with retry=3, 60s delay, exponential backoff, 15min expiry, dead-letter to `analysis-failures`
- `src/types/index.ts` -- Drizzle-inferred types: `Claim`, `Commentary`, `Score` ready to use
- `src/features/ingestion/ingest-worker.ts` -- Reference pattern for pg-boss job handler (fetch -> parse -> transactional insert)

### Established Patterns
- Feature-based folder layout: new AI pipeline code goes in `src/features/analysis/`
- Drizzle ORM for all DB operations: `db.insert()`, `db.select()`, `db.transaction()`
- pg-boss job handlers: export async function, registered in `workers/index.ts`
- Server-only imports for code that touches API keys (`import 'server-only'`)
- Zod v4 already installed for schema validation

### Integration Points
- Ingestion completion -> enqueue analysis job (extend `ingest-worker.ts` or add post-completion hook)
- Analysis worker registered in `workers/index.ts` (placeholder already exists at line 41)
- Score recomputation triggered by review status changes (Phase 4 will call score update on review actions)
- `AI_MODEL` env var selects active provider (e.g., `anthropic:claude-sonnet-4-5-20250929`)

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches. Key constraints:
- The benchmark harness (AI-05) must validate at least two providers before the pipeline is considered complete
- Sources suggested by AI must NEVER appear in a verified state -- this is a core trust contract
- The scoring algorithm must make it mathematically impossible for unreviewed content to inflate the score

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 03-ai-pipeline-and-scoring*
*Context gathered: 2026-04-19*
