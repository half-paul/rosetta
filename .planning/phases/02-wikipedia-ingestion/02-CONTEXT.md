# Phase 2: Wikipedia Ingestion - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Any English Wikipedia URL entered by a reviewer results in the article's full content — sections, paragraphs, and stable anchor IDs — persisted in the database. This phase delivers the MediaWiki API client, HTML parsing pipeline, stable paragraph ID generation, and ingestion job processing. Staleness detection is Phase 5 scope.

</domain>

<decisions>
## Implementation Decisions

### Parsing Approach
- **D-01:** Use MediaWiki `action=parse` API with `prop=text|sections` as the primary content source — stable, well-documented, provides rendered HTML and section structure
- **D-02:** Do NOT use the Wikimedia Structured Contents JSON API (beta) — production readiness is unconfirmed (flagged as blocker in STATE.md). May revisit if it reaches stable status
- **D-03:** Do NOT use `wtf_wikipedia` library — adds an opaque dependency layer with uncertain edge case handling; prefer direct API + DOM parsing for full control

### Ingestion Flow
- **D-04:** API endpoint (`POST /api/articles`) accepts a Wikipedia URL, validates it (must be en.wikipedia.org/wiki/...), and enqueues a pg-boss ingestion job — returns 202 Accepted immediately
- **D-05:** pg-boss worker processes the job: fetches article metadata, fetches and parses section content, generates stable IDs, persists article/section/paragraph rows in a single transaction
- **D-06:** Sequential MediaWiki API requests within a single ingestion job — one section at a time, exponential backoff on HTTP 429 (per INGEST-04)

### Content Extraction
- **D-07:** Use JSDOM (server-side DOM parsing) to process `action=parse` HTML output — more robust than regex, more controllable than library abstractions
- **D-08:** Strip non-content elements before paragraph extraction: infoboxes (`.infobox`), navboxes (`.navbox`), reference lists (`.reflist`), table of contents (`#toc`), edit section links (`.mw-editsection`), metadata boxes (`.ambox`, `.tmbox`)
- **D-09:** Extract `<p>` elements from the content body after stripping — each non-empty paragraph becomes a row in the paragraphs table
- **D-10:** Content hash computed on stripped plain text (`.textContent` after stripping), not on raw HTML — ensures hash stability across minor HTML rendering changes

### Stable ID Generation
- **D-11:** Stable ID formula: `{section_path}:{content_hash}:{revision_id}` — already locked in schema as `stableId` column (section path + content hash + revision ID)
- **D-12:** Section path = normalized heading hierarchy (e.g., `History/Early_period`) — spaces replaced with underscores, lowercased
- **D-13:** Content hash = SHA-256 of plain text content, truncated to first 12 hex characters for readability while maintaining collision resistance

### Rate Limiting
- **D-14:** Sequential request queue — no concurrent MediaWiki API calls from the ingestion worker
- **D-15:** Exponential backoff on HTTP 429: initial delay 1s, doubling up to 32s, max 5 retries before job failure
- **D-16:** `mediawikiFetch()` wrapper (already exists in `src/lib/mediawiki.ts`) extended with backoff logic and response status checking

### Claude's Discretion
- URL normalization strategy (handling redirects, URL-encoded titles, mobile URLs)
- Exact pg-boss job configuration (retry count, retry delay, job expiration)
- How to handle disambiguation pages (skip, flag, or parse as regular article)
- Error states and user feedback when ingestion fails (retry UX deferred to Phase 4 dashboard)
- Whether to store raw HTML alongside parsed content for debugging

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value prop, constraints (MediaWiki rate limits, English-only)
- `.planning/REQUIREMENTS.md` — INGEST-01 through INGEST-04 requirements (this phase)
- `.planning/ROADMAP.md` — Phase 2 success criteria and dependency on Phase 1

### Research & Pitfalls
- `.planning/research/PITFALLS.md` — Pitfall 1 (anchor drift) and Pitfall 2 (HTML parsing) are directly relevant
- `.planning/research/ARCHITECTURE.md` — Ingestion service architecture, API flow diagrams, feature folder layout
- `.planning/research/STACK.md` — Technology stack decisions
- `.planning/research/SUMMARY.md` §Phase 2 — Ingestion pipeline deliverables and risk areas

### Prior Phase Context
- `.planning/phases/01-foundation/01-CONTEXT.md` — Schema conventions (CUID2, soft deletes, timestamps), project structure, auth decisions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/mediawiki.ts` — `mediawikiFetch()` wrapper with User-Agent header (INFRA-03). Needs extension for backoff/retry logic
- `src/db/schema.ts` — `articles`, `sections`, `paragraphs` tables already defined with all required columns including `stableId`, `contentHash`, `revisionId`
- `src/lib/boss.ts` — `getBoss()` singleton for pg-boss job queue
- `src/types/index.ts` — Drizzle-inferred types (`Article`, `NewArticle`, `Section`, `NewSection`, `Paragraph`) ready to use

### Established Patterns
- Feature-based folder layout: new ingestion code goes in `src/features/ingestion/` or `src/features/articles/`
- Drizzle ORM for all database operations — use `db.insert()`, `db.select()`, transactions via `db.transaction()`
- pg-boss for async job processing — enqueue with `boss.send()`, process with `boss.work()`
- CUID2 for primary keys, auto-generated via schema `$defaultFn`

### Integration Points
- API route: `src/app/api/articles/route.ts` — POST handler accepts URL, enqueues job
- Worker: `src/workers/` directory — ingestion worker subscribes to pg-boss queue
- Database: existing Drizzle connection in `src/db/index.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key constraint from research: validate parsing against diverse article types (featured articles, stubs, disambiguation pages, articles with heavy infoboxes/tables) before wiring the AI pipeline in Phase 3.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-wikipedia-ingestion*
*Context gathered: 2026-04-19*
