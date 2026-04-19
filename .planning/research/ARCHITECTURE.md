# Architecture Research

**Domain:** Wikipedia fact-checking platform (human-in-the-loop AI pipeline)
**Researched:** 2026-04-18
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├──────────────────┬──────────────────┬───────────────────────────┤
│  Public Site     │  Reviewer        │  Browser Extension        │
│  rosetta.com/    │  Dashboard       │  (content script +        │
│  wiki/:topic     │  (queue + edit)  │   background worker)      │
└────────┬─────────┴────────┬─────────┴────────────┬──────────────┘
         │                  │                       │
         ▼                  ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                                 │
├──────────────────────────────────────────────────────────────────┤
│  /api/articles  /api/reviews  /api/scores  /api/auth            │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼──────────────────────┐
         ▼                   ▼                      ▼
┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐
│  Ingestion     │  │  AI Pipeline   │  │  Moderation          │
│  Service       │  │  Service       │  │  Workflow Engine     │
│                │  │                │  │                      │
│  - Fetch from  │  │  - LLM Adapter │  │  - State machine     │
│    MediaWiki   │  │  - Claim       │  │    (5 states)        │
│  - Parse HTML  │  │    Extraction  │  │  - Queue mgmt        │
│  - Section/    │  │  - Commentary  │  │  - Audit trail       │
│    Para map    │  │    Drafting    │  │                      │
└───────┬────────┘  └───────┬────────┘  └──────────┬───────────┘
        │                   │                       │
        ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                │
├─────────────────┬─────────────────┬────────────────────────────┤
│  PostgreSQL     │  Job Queue      │  Cache / KV Store          │
│  (primary DB)   │  (BullMQ/Redis) │  (Redis)                   │
│                 │                 │                            │
│  articles       │  ingest_job     │  article HTML cache        │
│  sections       │  analysis_job   │  score cache               │
│  paragraphs     │  staleness_job  │  session store             │
│  fact_checks    │                 │                            │
│  reviews        │                 │                            │
│  scores         │                 │                            │
└─────────────────┴─────────────────┴────────────────────────────┘
                             │
         ┌───────────────────┼──────────────────────┐
         ▼                   ▼                      ▼
┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐
│  MediaWiki     │  │  LLM Provider  │  │  Wikimedia           │
│  REST API      │  │  (OpenAI /     │  │  EventStreams        │
│  (en.wiki)     │  │   Anthropic /  │  │  (SSE — revision-    │
│                │  │   other)       │  │   create stream)     │
└────────────────┘  └────────────────┘  └──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Public Site | Render side-by-side article + fact-checks at `rosetta.com/wiki/:topic` | API Layer (read-only) |
| Reviewer Dashboard | Queue of AI-flagged paragraphs, approve/reject/edit interface | API Layer (read + write) |
| Browser Extension | Overlay approved fact-checks on en.wikipedia.org pages | API Layer (read-only), Extension background worker |
| API Layer | Route all client requests, enforce auth, validate input | All internal services, Data Layer |
| Ingestion Service | Fetch Wikipedia article via MediaWiki API, parse HTML into section/paragraph tree, detect staleness | MediaWiki REST API, Job Queue, PostgreSQL |
| AI Pipeline Service | Extract atomic claims from paragraphs, draft commentary with source citations, score confidence | LLM Provider Adapter, Job Queue, PostgreSQL |
| Moderation Workflow Engine | Manage review state transitions, enforce human-approval gate, maintain audit trail | PostgreSQL, API Layer |
| Factual Score Compute | Calculate 0–100 weighted score per article from paragraph review status and claim outcomes | PostgreSQL (read) |
| Staleness Detector | Subscribe to Wikimedia EventStreams, compare article revision IDs, flag affected fact-checks | Wikimedia EventStreams (SSE), PostgreSQL |
| LLM Provider Adapter | Unified interface over OpenAI, Anthropic, others; handle retries, token limits | LLM APIs (external) |

## Recommended Project Structure

```
src/
├── ingestion/              # Wikipedia content fetching and parsing
│   ├── mediawiki-client.ts # Thin wrapper over MediaWiki REST API
│   ├── html-parser.ts      # HTML → section/paragraph tree
│   ├── section-mapper.ts   # Stable paragraph ID generation
│   └── ingestion-jobs.ts   # BullMQ job definitions
│
├── ai-pipeline/            # LLM orchestration
│   ├── adapters/           # Provider-specific adapters
│   │   ├── base.ts         # LLMAdapter interface
│   │   ├── openai.ts
│   │   └── anthropic.ts
│   ├── claim-extractor.ts  # Atomic claim decomposition prompts
│   ├── commentary-drafter.ts # Draft commentary with citations
│   └── pipeline-jobs.ts    # BullMQ job definitions
│
├── moderation/             # Review workflow engine
│   ├── state-machine.ts    # Review state transitions
│   ├── queue-manager.ts    # Prioritization, assignment
│   └── audit-log.ts        # Immutable trail of all actions
│
├── scoring/                # Factual Score computation
│   ├── score-engine.ts     # Weighted algorithm implementation
│   └── coverage-tracker.ts # Paragraph review coverage metrics
│
├── staleness/              # Change detection
│   ├── event-stream.ts     # Wikimedia SSE subscriber
│   └── staleness-checker.ts # Revision ID comparison logic
│
├── api/                    # HTTP API (Next.js API routes or Express)
│   ├── articles/
│   ├── reviews/
│   ├── scores/
│   └── auth/
│
├── db/                     # Database layer
│   ├── schema.ts           # Table definitions (Drizzle or Prisma)
│   ├── migrations/
│   └── queries/            # Typed query helpers per domain
│
└── extension/              # Browser extension (separate build)
    ├── manifest.json
    ├── content-script.ts   # Inject overlay into Wikipedia DOM
    ├── background.ts       # API polling, cache management
    └── ui/                 # Overlay React components
```

### Structure Rationale

- **ingestion/ vs ai-pipeline/:** Kept separate because they have different failure modes, rate limits, and retry policies. Ingestion is I/O bound (MediaWiki API); pipeline is cost and latency bound (LLM calls).
- **moderation/:** Isolated from API routes because the state machine logic must be testable without HTTP context, and the audit log is a compliance requirement.
- **scoring/:** Pure computation, no external I/O — should be a synchronous function called after each review approval, not a job.
- **staleness/:** Long-running SSE subscriber that lives outside the HTTP request lifecycle. Runs as a separate worker process.
- **extension/:** Separate build target with its own bundler config. Shares type definitions with main app but cannot share runtime code.

## Architectural Patterns

### Pattern 1: Provider Adapter for LLM Abstraction

**What:** Define an `LLMAdapter` interface and create one concrete class per provider. The pipeline never imports an SDK directly.

**When to use:** Any code that makes LLM calls. No exceptions.

**Trade-offs:** Adds one indirection layer. Pays for itself immediately when switching providers or A/B testing.

**Example:**
```typescript
interface LLMAdapter {
  complete(prompt: string, options: CompletionOptions): Promise<string>;
  streamComplete(prompt: string, options: CompletionOptions): AsyncIterable<string>;
}

class AnthropicAdapter implements LLMAdapter { /* ... */ }
class OpenAIAdapter implements LLMAdapter { /* ... */ }

// Pipeline only knows about LLMAdapter
class ClaimExtractor {
  constructor(private llm: LLMAdapter) {}
  async extract(paragraph: string): Promise<AtomicClaim[]> { /* ... */ }
}
```

### Pattern 2: Stable Paragraph Addressing

**What:** Assign each paragraph a stable, deterministic ID based on its section path and position (e.g., `intro.p1`, `history.early_life.p2`). Store this ID, not the paragraph text offset.

**When to use:** All data models anchoring commentary to paragraphs. Critical from day one.

**Trade-offs:** Requires a clear ID generation strategy. Addresses the hard problem: Wikipedia articles change layout over time.

**Example:**
```typescript
// ID: "lead.p0", "History.Early_life.p1"
function paragraphId(sectionPath: string[], positionInSection: number): string {
  return [...sectionPath, `p${positionInSection}`].join('.');
}
```

### Pattern 3: Five-State Review Workflow

**What:** Each paragraph's fact-check has exactly five states. Transitions are explicit and logged.

**When to use:** All moderation logic routes through the state machine. No direct DB status updates.

**Trade-offs:** More ceremony than a simple boolean flag. Required because the audit trail is non-negotiable.

```
PENDING → AI_ANALYZED → HUMAN_APPROVED → PUBLISHED
                      → HUMAN_REJECTED  (back to PENDING for re-analysis)
```

### Pattern 4: Staleness Flag, Not Content Versioning

**What:** When Wikimedia EventStreams signals an edit to a tracked article, set `is_stale = true` on affected fact-checks. Do not attempt to version or migrate existing commentary.

**When to use:** All change detection responses. Versioning Wikipedia content in parallel is out of scope for v1.

**Trade-offs:** Reviewers must re-review stale content. Simpler than maintaining version trees. Correct for v1.

## Data Flow

### Flow 1: New Article Submission

```
User pastes URL
    ↓
POST /api/articles { url: "en.wikipedia.org/wiki/Topic" }
    ↓
Ingestion Service: fetch /page/{title}/with_html from MediaWiki API
    ↓
html-parser: parse HTML → section tree → paragraph list
    ↓
Store: articles + sections + paragraphs rows in PostgreSQL
    ↓
Enqueue: analysis_job per paragraph → BullMQ
    ↓
AI Pipeline: for each paragraph
    → claim-extractor: decompose into atomic claims
    → commentary-drafter: draft commentary + suggest sources
    → Store: fact_checks rows (status = AI_ANALYZED)
    ↓
Scoring Engine: compute initial score (0% human-reviewed, AI-only confidence)
    ↓
Notify reviewer dashboard: new items in queue
```

### Flow 2: Human Review Approval

```
Reviewer opens dashboard
    ↓
GET /api/reviews?status=AI_ANALYZED → sorted queue
    ↓
Reviewer edits/approves AI draft
    ↓
POST /api/reviews/:id/approve { edits, commentary }
    ↓
Moderation Engine: transition state AI_ANALYZED → HUMAN_APPROVED
    ↓
Audit Log: record reviewer, timestamp, diff from AI draft
    ↓
PATCH fact_check: status = PUBLISHED
    ↓
Scoring Engine: recompute article score (coverage increases)
    ↓
Public site: reflects updated score + commentary
```

### Flow 3: Staleness Detection

```
Wikimedia EventStreams (SSE): revision-create event for en.wikipedia.org
    ↓
Staleness Detector: check if article title in our tracked articles
    ↓
If YES: compare incoming revision_id vs stored last_revision_id
    ↓
If changed: mark all PUBLISHED fact_checks for article as is_stale = true
    ↓
Update article: last_revision_id = new revision_id
    ↓
Reviewer dashboard: stale items surfaced in queue with "Article Changed" tag
```

### Flow 4: Browser Extension Overlay

```
User visits en.wikipedia.org/wiki/Topic
    ↓
Extension content script: intercepts page load
    ↓
Background worker: GET rosetta.com/api/articles?wiki_url={url}
    ↓
If fact-checks exist and not stale: inject overlay UI into Wikipedia DOM
    ↓
Overlay: highlight paragraphs with fact-check indicators
    ↓
User hovers/clicks paragraph: show fact-check panel (commentary + score)
```

## Factual Score Computation

The score is a weighted function of three dimensions:

```
Score = (Coverage × 0.40) + (Accuracy × 0.40) + (Confidence × 0.20)

Where:
  Coverage  = (paragraphs_human_approved / total_paragraphs) × 100
  Accuracy  = 100 − (false_claims_severity_weighted / total_claims × 100)
  Confidence = AI-only paragraphs reduce confidence vs human-reviewed

Severity weights for false claims:
  CRITICAL (factual inversion)  → weight 3.0
  MAJOR (significant error)     → weight 2.0
  MINOR (nuance/omission)       → weight 1.0
```

The score is recomputed synchronously after every review state transition. It is stored in a `scores` table and cached in Redis with a short TTL (30 seconds) to avoid per-request recomputation.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| MediaWiki REST API (en.wikipedia.org) | HTTP GET with User-Agent header required | Rate limit: 200 req/s for authenticated; anonymous is lower. Cache responses in Redis for 10 min. |
| Wikimedia EventStreams | SSE long-lived connection to `stream.wikimedia.org/v2/stream/revision-create` | Filter by `meta.domain = "en.wikipedia.org"`. Reconnect using `Last-Event-ID` header on disconnect. |
| LLM Provider (OpenAI/Anthropic) | HTTP POST via provider adapter | Wrap in retry with exponential backoff. Store raw prompt+response for audit. |
| OAuth Provider (Google/GitHub) | Standard OAuth 2.0 callback flow | Reviewer-only; no public sign-up. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| API ↔ Ingestion Service | Enqueue job via BullMQ (Redis) | API does not wait for ingestion to complete; returns 202 Accepted |
| API ↔ AI Pipeline | Enqueue job via BullMQ (Redis) | Triggered by ingestion completion event, not API directly |
| API ↔ Moderation Engine | Direct function call (same process) | Moderation is synchronous and lightweight |
| API ↔ Scoring Engine | Direct function call (same process) | Pure computation, no I/O |
| Staleness Detector ↔ DB | Direct PostgreSQL write | Runs as separate worker process; uses same DB |
| Extension ↔ API | HTTPS REST (read-only endpoints) | Extension must handle CORS and offline gracefully |
| Public Site ↔ API | HTTPS REST (or Next.js server components) | Score and commentary are read-only from public |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1K tracked articles | Single process is fine. BullMQ with 1 worker. No Redis cluster. |
| 1K–50K tracked articles | Extract AI Pipeline into separate worker process. Add Redis cluster. Cache scores aggressively. |
| 50K+ articles | Split ingestion + AI pipeline into separate services. Add read replica for public site queries. Partition EventStreams subscriber. |

### Scaling Priorities

1. **First bottleneck: LLM API costs and latency.** Each paragraph triggers an LLM call. At scale, batch paragraphs per article into a single call and parse structured output. This reduces cost by ~80% and latency by ~60%.
2. **Second bottleneck: MediaWiki API rate limits.** Implement request coalescing — if the same article is requested twice within the cache window, serve from cache, not from the API.
3. **Third bottleneck: Factual Score queries.** The score is read on every public page view. Cache aggressively in Redis; invalidate only on review state change.

## Anti-Patterns

### Anti-Pattern 1: Anchoring Commentary to Text Offsets

**What people do:** Store `{ paragraph_text: "In 1969...", commentary: "..." }` and re-match on article reload.

**Why it's wrong:** Wikipedia edits change text constantly. Text matching breaks on trivial edits (typos, punctuation). The commentary silently detaches.

**Do this instead:** Assign stable paragraph IDs based on section path + position at ingest time. Store `{ paragraph_id: "History.p3", commentary: "..." }`. On re-ingest, remap by path. Flag mismatches as stale.

### Anti-Pattern 2: Directly Calling LLM SDK in Business Logic

**What people do:** Import `import Anthropic from "@anthropic-ai/sdk"` in the claim extractor directly.

**Why it's wrong:** Vendor lock-in. Switching providers requires changing every call site. Testing requires live API credentials.

**Do this instead:** All LLM calls go through `LLMAdapter`. Inject the adapter. Test with a mock adapter.

### Anti-Pattern 3: Publishing Without Explicit Human Approval Gate

**What people do:** Set an auto-publish threshold ("if AI confidence > 0.9, publish automatically").

**Why it's wrong:** This is the core product promise: everything published has human sign-off. Violating this makes the product indistinguishable from AI-only fact-checkers and destroys trust.

**Do this instead:** The `PUBLISHED` state is only reachable from `HUMAN_APPROVED`. The API enforces this at the state machine level, not by application convention.

### Anti-Pattern 4: Running the Staleness Detector In-Process with the API

**What people do:** Subscribe to EventStreams inside an Express middleware or Next.js handler.

**Why it's wrong:** SSE connections are long-lived. They don't belong in the HTTP request/response lifecycle. The API will time out, and reconnection logic is fragile inside a web server.

**Do this instead:** Run the staleness detector as a dedicated worker process (`node src/staleness/worker.ts`) with its own process supervision (PM2 or a container). It writes directly to the DB.

## Sources

- MediaWiki REST API reference: https://www.mediawiki.org/wiki/API:REST_API/Reference
- Wikimedia EventStreams documentation: https://wikitech.wikimedia.org/wiki/Event_Platform/EventStreams
- EventStreams revision-create stream: https://stream.wikimedia.org/v2/stream/revision-create (live feed)
- Wikimedia Enterprise article sections API: https://enterprise.wikimedia.com/blog/article-sections-and-description/
- FActScore atomic claim evaluation framework: https://arxiv.org/abs/2305.14251
- Multi-LLM agent claim verification architecture: https://ceur-ws.org/Vol-3962/paper20.pdf
- LLM provider-agnostic adapter pattern (Continue Dev): https://deepwiki.com/continuedev/continue/4.1-extension-architecture
- Chrome Extension content script architecture: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Human-in-the-loop AI content moderation patterns: https://blog.motia.dev/building-ai-content-moderation-with-human-in-the-loop-using-motia-slack-and-openai/
- Wikipedia overlay browser extension case study: https://cs.carleton.edu/cs_comps/2223/wikipediaoverlay/index.php

---
*Architecture research for: Wikipedia fact-checking platform (Project Rosetta)*
*Researched: 2026-04-18*
