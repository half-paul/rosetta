# Project Research Summary

**Project:** Rosetta — Wikipedia Fact-Checking Platform
**Domain:** Human-in-the-loop AI content verification (Wikipedia-specific)
**Researched:** 2026-04-18
**Confidence:** HIGH

## Executive Summary

Rosetta is a Wikipedia fact-checking platform where AI extracts claims from articles and human reviewers approve or reject the analysis before anything is published. This is a human-in-the-loop AI pipeline — the AI accelerates throughput, but human approval is an enforced system constraint, not a soft convention. The recommended build is a Next.js 16 monolith on Vercel backed by PostgreSQL (Neon), with pg-boss for background job queuing and Vercel AI SDK for provider-agnostic LLM calls.

The recommended approach is to build in strict dependency order: data model first, Wikipedia ingestion second, AI pipeline third, reviewer workflow fourth, public site fifth, and browser extension last. This order follows the feature dependency graph: every downstream feature depends on stable paragraph anchoring. If the paragraph ID scheme is designed wrong, every other component built on top requires a painful data migration. The single most important architectural decision is the stable paragraph addressing scheme (section path + content hash + revision ID), and it must be locked down before any other work begins.

The two largest risks are: (1) paragraph anchor drift — if commentary is anchored to text offsets rather than stable IDs, Wikipedia edits silently break every published fact-check; and (2) AI-hallucinated citations reaching publication — if source verification is not a mandatory, distinct step in the reviewer UI, the platform's core trust contract is broken before users realize it. Both risks are avoidable if the data model and reviewer workflow are designed correctly from the start. A third structural risk is reviewer fatigue from a flat, unprioritized queue — with 2–5 reviewers and an AI that flags aggressively, queue design is not a UI detail but a core product constraint.

## Key Findings

### Recommended Stack

The stack is tightly optimized for the Vercel deployment target and small-team operation. Next.js 16 with App Router handles both the public fact-check site and the reviewer dashboard in a single framework. PostgreSQL (via Neon serverless) is the only correct database choice for this domain — JSONB for AI output storage, SKIP LOCKED for the job queue, full-text search for claims — and pg-boss replaces Redis/BullMQ entirely for the job volume Rosetta requires. The Vercel AI SDK is the only sanctioned LLM abstraction; using provider SDKs directly is explicitly ruled out.

**Important conflict:** ARCHITECTURE.md shows BullMQ/Redis in the data layer. STACK.md correctly recommends pg-boss on PostgreSQL. Follow STACK.md — Redis is not needed.

**Core technologies:**
- Next.js 16 (App Router): Full-stack framework for public site, reviewer dashboard, and API — single deployment target
- PostgreSQL 16 (Neon serverless): Primary data store — JSONB, SKIP LOCKED job queue, full-text search all required
- Drizzle ORM 0.45: Type-safe DB access with code-first schema — leaner than Prisma for serverless cold starts
- Vercel AI SDK 4.x + Zod 4.x: Provider-agnostic LLM abstraction with typed structured output — non-negotiable per project requirements
- pg-boss 12.x: Background job queue on existing PostgreSQL — eliminates Redis dependency for this job volume
- Auth.js v5 (next-auth): Reviewer authentication — email/password + OAuth, native Next.js 16 middleware
- Tailwind CSS 4.2 + shadcn/ui: Styling and accessible UI primitives — required for paragraph annotation and reviewer queue UI
- WXT: Browser extension framework (v1.x phase only) — Plasmo is in maintenance mode; use WXT

### Expected Features

All 10 table-stakes features are required for v1. There is no viable MVP that omits the human approval workflow, the paragraph-level data model, or the factual score — they are mutually interdependent.

**Must have (table stakes):**
- URL-based article lookup and Wikipedia content ingestion — primary entry point; nothing works without it
- Stable paragraph-level commentary anchoring — every downstream feature depends on this; design it correctly first
- Weighted Factual Score (0–100) with human-review coverage percentage — score must always display coverage
- Source citations per claim (human-verified) — AI suggests, reviewer confirms; no citation publishes without human sign-off
- Human approval badge / status labels (Unreviewed / AI Analyzed / Human Approved) — non-negotiable trust contract
- Stale content detection — flag fact-checks when Wikipedia changes; critical to prevent serving outdated analysis
- Reviewer authentication (email/password + OAuth)
- Reviewer queue and dashboard with priority ordering
- Public article page at `/wiki/Topic` with side-by-side layout
- Mobile-responsive layout

**Should have (competitive differentiators):**
- Provider-agnostic AI claim extraction pipeline — any Wikipedia URL analyzed on demand
- Section-level staleness precision — re-flag only changed sections, not whole articles
- Browser extension overlaying approved fact-checks on Wikipedia pages (v1.x — after core API is stable)
- Shareable fact-check URLs
- Reviewer email notifications for newly queued articles

**Defer (v2+):**
- Multi-language support — English-only for v1; include `language` field in data model now
- Public read-only discussion threads
- Full versioned fact-checks per Wikipedia revision
- Public API for third-party consumption
- Role-based permissions for expanded reviewer team

### Architecture Approach

The system is a layered monolith with a separate long-running staleness worker process. Ingestion, AI pipeline, and moderation workflow are internal modules within the same Next.js process — not microservices. The staleness detector runs as a dedicated worker subscribing to Wikimedia EventStreams SSE. The browser extension is a separate WXT build target reading from the public API. The five-state review workflow (PENDING → AI_ANALYZED → HUMAN_APPROVED → PUBLISHED, with HUMAN_REJECTED returning to PENDING) is enforced via a state machine that is the only path to PUBLISHED.

**Major components:**
1. Wikipedia Ingestion Service — MediaWiki API fetching, HTML parsing into section/paragraph tree, stable paragraph ID generation
2. AI Pipeline Service — LLM adapter layer (provider-agnostic), claim extraction, commentary drafting, queued via pg-boss
3. Moderation Workflow Engine — five-state state machine, queue prioritization, immutable audit log
4. Factual Score Engine — weighted computation (Coverage 40% + Accuracy 40% + Confidence 20%); pure synchronous function called after each state transition
5. Staleness Detector — dedicated worker process; section-level content hash comparison, not just revision ID comparison
6. Public Site + Reviewer Dashboard — Next.js App Router; public is read-only, dashboard gated by Auth.js
7. Browser Extension (v1.x) — WXT content script; all API calls routed through extension service worker, not content script

### Critical Pitfalls

1. **Paragraph anchor drift** — Never anchor to text offsets or paragraph indexes. Store `section_title + content_hash + revision_id` from day one. Compare content hashes per reviewed section to determine which are actually affected by a Wikipedia edit. This must be in the schema before any other development begins.

2. **AI-hallucinated citations reaching publication** — Sources must appear in a distinct "unverified" state in the reviewer UI. It must be technically impossible to approve commentary without explicitly marking each cited source as verified. No AI-suggested sources appear publicly without this step.

3. **Score displayed without review coverage** — Always show "X of Y sections reviewed" as a primary UI element. The score algorithm must encode coverage as a first-class variable — unreviewed sections cannot contribute positively to the score. Design this before building the reviewer workflow.

4. **MediaWiki API rate limiting** — New 2026 global rate limits are a live constraint. Implement sequential request queue, exponential backoff on HTTP 429, and a descriptive User-Agent header before any calls to the live API. EventStreams SSE is "not for production services" — use `action=query&prop=revisions` polling for production staleness detection.

5. **Reviewer fatigue from undifferentiated queue depth** — Queue must include priority signals, per-reviewer assignment, daily throughput limits, and depth monitoring alerts from day one. A flat FIFO queue with no prioritization breaks the human-in-the-loop promise as backlog grows.

## Implications for Roadmap

Based on the feature dependency graph and pitfall phase mapping, the research strongly suggests a 6-phase structure. The ordering follows hard dependencies.

### Phase 1: Foundation — Data Model and Project Infrastructure
**Rationale:** Every other phase depends on stable paragraph addressing, the database schema, and the LLM abstraction layer. Retrofitting these later requires full data migrations.
**Delivers:** Database schema (Drizzle/PostgreSQL), paragraph addressing scheme (section path + content hash + revision ID), LLM adapter interface with two provider implementations, pg-boss setup, Auth.js reviewer authentication
**Addresses:** Provider-agnostic LLM abstraction, reviewer authentication, paragraph-level data model
**Avoids:** Paragraph anchor drift (schema must have this from day one), LLM vendor lock-in (adapter interface before any pipeline code)

### Phase 2: Wikipedia Ingestion Pipeline
**Rationale:** Without reliable paragraph extraction, no feature has real data. Validate parsing against diverse article corpus before wiring AI pipeline.
**Delivers:** MediaWiki API client (sequential, backoff, User-Agent), HTML parsing via Wikimedia REST, stable paragraph ID generation, article/section/paragraph rows in PostgreSQL, pg-boss ingest jobs
**Addresses:** URL-based article lookup, Wikipedia content ingestion
**Avoids:** Wikipedia HTML parsing failures (validate against 20+ article types), MediaWiki API rate limiting

### Phase 3: AI Claim Extraction and Scoring Pipeline
**Rationale:** With stable ingestion, the AI pipeline can run on real data. The Factual Score algorithm must be designed here — before the reviewer workflow — because the coverage constraint must be encoded in the algorithm.
**Delivers:** Claim extraction via generateObject with Zod schemas, commentary drafting with sources marked unverified by default, Factual Score engine with configurable weights, pg-boss analysis jobs, model benchmark harness
**Addresses:** AI claim extraction pipeline, weighted Factual Score, source citations (AI draft)
**Avoids:** Score gaming, LLM provider semantic drift, AI-hallucinated citations

### Phase 4: Reviewer Dashboard and Moderation Workflow
**Rationale:** The five-state workflow, queue prioritization, and source verification UI must be built as a coherent unit.
**Delivers:** Prioritized reviewer queue, per-reviewer assignment, five-state workflow state machine, source verification as mandatory distinct UI step, immutable audit log, queue depth monitoring alerts
**Addresses:** Reviewer queue/dashboard, human moderation workflow, source citations (human verification)
**Avoids:** Reviewer fatigue, AI-hallucinated citations publishing, publishing without human approval

### Phase 5: Public Site and Stale Content Detection
**Rationale:** The public surface and staleness detection are built together because the public site must surface stale indicators correctly.
**Delivers:** Public article page at `/wiki/Topic` (side-by-side, mobile-responsive), human approval badges, score with coverage indicator, staleness worker process, CC-BY-SA attribution
**Addresses:** Public article page, stale content detection, mobile-responsive layout, human approval badge
**Avoids:** Score without coverage context, staleness false positives, CC-BY-SA compliance gap

### Phase 6: Browser Extension Overlay (v1.x)
**Rationale:** Deferred until core API surface is stable. Extension introduces a separate release surface and DOM fragility.
**Delivers:** WXT content script injecting overlays into Wikipedia DOM, API calls routed through service worker, graceful fallback, automated integration tests
**Addresses:** Browser extension overlay
**Avoids:** DOM injection breakage, Manifest V3 failures, Chrome Web Store rejection

### Phase Ordering Rationale

- Data model before everything: paragraph anchor drift has the highest recovery cost of any pitfall
- Ingestion before AI pipeline: the pipeline cannot be validated without real Wikipedia data
- Score algorithm before reviewer workflow: the score must encode coverage as a hard constraint before reviewers start using it
- Reviewer workflow before public site: the public site requires PUBLISHED records, which requires the workflow
- Extension last: depends on stable public API

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Validate Wikimedia Structured Contents JSON API (beta) vs. `action=parse` for paragraph extraction
- **Phase 3:** LLM prompt engineering for claim extraction is model-specific — benchmark harness must validate against at least two providers
- **Phase 5:** Staleness polling frequency — validate rate limits while providing acceptable detection latency
- **Phase 6:** Manifest V3 service worker constraints and Chrome Web Store review process

Phases with standard patterns (skip research-phase):
- **Phase 1:** Drizzle schema design, Auth.js v5 setup, pg-boss config, LLM adapter interfaces are all well-documented
- **Phase 4:** Next.js App Router dashboard patterns, nuqs URL state, shadcn/ui composition are standard

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies verified against official docs and current npm versions. One conflict (BullMQ/Redis in ARCHITECTURE.md vs. pg-boss in STACK.md) — follow STACK.md. |
| Features | MEDIUM-HIGH | Table stakes and anti-features well-grounded in competitor analysis and research. The 40/40/20 score weighting is a design recommendation; make weights configurable. |
| Architecture | HIGH | Component boundaries and data flows internally consistent and grounded in documented patterns. |
| Pitfalls | HIGH | All pitfalls grounded in authoritative sources. 2026 MediaWiki rate limit changes confirmed as a live constraint. |

**Overall confidence:** HIGH

### Gaps to Address

- **Wikimedia Structured Contents API maturity:** Recommended over raw HTML parsing, but documented as beta. Verify production readiness in Phase 2 planning.
- **Score formula validation:** The 40/40/20 weighting should be validated with actual reviewers before hardening. Design with configurable weights.
- **LLM cost modeling:** Estimate token budget per article and validate pg-boss worker concurrency before Phase 3.
- **EventStreams production eligibility:** Confirm whether a registered Wikimedia API key changes the "not for production services" constraint.
- **Legal review timing:** Schedule CC-BY-SA compliance review at the start of Phase 5 planning, not at the end.

## Sources

### Primary (HIGH confidence)
- MediaWiki REST API reference — ingestion endpoint patterns, rate limit documentation
- Wikimedia API Rate Limits (2026 rollout) — confirmed live constraint
- Vercel AI SDK docs (ai-sdk.dev) — generateObject, provider-agnostic architecture
- Drizzle ORM docs — version 0.45.x schema patterns
- Auth.js v5 (authjs.dev) — Next.js 16 compatibility
- pg-boss GitHub releases — v12.15.0 current
- Wikipedia CC-BY-SA reuse requirements
- CHI 2025: "Show Me the Work" — fact-checker explainability requirements
- ClaimBuster VLDB 2017 — claim extraction benchmarks
- Wikimedia EventStreams documentation

### Secondary (MEDIUM confidence)
- Crowdsourced fact-checking research (Information Processing and Management 2024)
- Media Bias/Fact Check methodology — score weighting basis
- Drizzle vs Prisma 2026 comparisons
- WXT vs Plasmo comparison

### Tertiary (LOW confidence — validate during implementation)
- Wikimedia Structured Contents JSON API (beta) — production maturity unconfirmed
- LLM hallucination rates (17–33% in factual domains) — from RAG system studies

---
*Research completed: 2026-04-18*
*Ready for roadmap: yes*
