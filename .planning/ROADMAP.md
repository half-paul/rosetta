# Roadmap: Project Rosetta

## Overview

Rosetta is built in six phases following the hard dependency graph from the research. The data model and infrastructure come first because stable paragraph addressing cannot be retrofitted — every other feature anchors to it. Wikipedia ingestion validates real parsing before the AI pipeline runs on it. The Factual Score algorithm is locked in before reviewers touch it, so coverage constraints are encoded from day one. The reviewer dashboard is built as a coherent unit: workflow state machine, queue prioritization, source verification, and audit log together. The public site and staleness detection ship together because the public surface must correctly surface stale indicators. The browser extension is last: it depends on a stable public API and introduces a separate release surface.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Database schema, pg-boss, LLM adapter layer, and reviewer authentication
- [x] **Phase 2: Wikipedia Ingestion** - MediaWiki API client, HTML parsing, stable paragraph ID generation (Completed 2026-04-19)
- [ ] **Phase 3: AI Pipeline and Scoring** - Claim extraction, commentary drafting, Factual Score engine
- [ ] **Phase 4: Reviewer Dashboard** - Five-state workflow, prioritized queue, source verification, audit log
- [ ] **Phase 5: Public Site and Staleness** - Public article pages, side-by-side layout, staleness detection
- [ ] **Phase 6: Browser Extension** - WXT overlay injecting approved fact-checks onto Wikipedia pages

## Phase Details

### Phase 1: Foundation
**Goal**: The infrastructure skeleton that every other phase builds on is in place — stable paragraph-anchored schema, background job queue, provider-agnostic LLM interface, and reviewer authentication
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, MOD-01, AI-01, AI-06
**Success Criteria** (what must be TRUE):
  1. A reviewer can log in with email/password and via OAuth (Google/GitHub) and reach a protected dashboard route
  2. The database schema accepts article, section, paragraph, claim, commentary, review, reviewer, and score rows with referential integrity enforced
  3. A pg-boss job can be enqueued, picked up by a worker, and completed with exactly-once delivery confirmed in tests
  4. Switching the active LLM provider (e.g., Claude to GPT-4) requires only a configuration change — no code changes
  5. All MediaWiki API requests include a descriptive User-Agent header per Wikimedia policy
**Plans:** 5 plans
Plans:
- [ ] 01-01-PLAN.md — Bootstrap Next.js project, Docker Compose, Drizzle schema with all domain tables
- [ ] 01-02-PLAN.md — pg-boss job queue, AI provider registry, MediaWiki client with tests
- [ ] 01-03-PLAN.md — NextAuth v5 authentication, login page, dashboard shell
- [ ] 01-04-PLAN.md — Integration tests for schema integrity and credentials auth
- [ ] 01-05-PLAN.md — Gap closure: fix getBoss() singleton, OAuth env guards, mediawikiFetch status check, worker batch guard
**UI hint**: yes

### Phase 2: Wikipedia Ingestion
**Goal**: Any English Wikipedia URL entered by a reviewer results in the article's full content — sections, paragraphs, and stable anchor IDs — persisted in the database
**Depends on**: Phase 1
**Requirements**: INGEST-01, INGEST-02, INGEST-03, INGEST-04
**Success Criteria** (what must be TRUE):
  1. A reviewer pastes a Wikipedia URL and the system fetches and stores the live article content including title, revision ID, fetch timestamp, and language
  2. The parsed article tree exposes each paragraph with a stable ID composed of section path + content hash + revision ID
  3. The ingestion client enforces sequential requests with exponential backoff on HTTP 429 responses
  4. Article metadata and parsed content are queryable from the database after ingestion completes
**Plans:** 3 plans
Plans:
- [ ] 02-01-PLAN.md — Install jsdom, create stable-id utilities, mediawiki backoff extension, mediawiki-client, unit tests
- [ ] 02-02-PLAN.md — JSDOM HTML parser (parse-article.ts) with section walk algorithm, unit tests
- [ ] 02-03-PLAN.md — Ingestion worker, POST /api/articles route, pg-boss queue wiring, schema push, integration tests

### Phase 3: AI Pipeline and Scoring
**Goal**: Every ingested article's paragraphs are analyzed by the AI pipeline — claims extracted, commentary drafted with unverified sources, and a Factual Score computed that encodes human-review coverage as a hard constraint
**Depends on**: Phase 2
**Requirements**: AI-02, AI-03, AI-04, AI-05, SCORE-01, SCORE-02, SCORE-03, SCORE-04
**Success Criteria** (what must be TRUE):
  1. For any ingested paragraph, the system extracts check-worthy claims using structured output (Zod schemas) and stores them as PENDING commentary
  2. Each extracted claim has AI-drafted commentary with suggested sources marked as unverified by default — no AI source appears in a verified state
  3. A Factual Score (0-100) is computed per article with configurable weights (default: Coverage 40%, Accuracy 40%, Confidence 20%), and unreviewed sections cannot contribute positively to it
  4. The score always displays alongside "X of Y sections reviewed by humans" — these two values are inseparable in the data layer
  5. A benchmark harness can run claim extraction against at least two LLM providers and compare output quality
**Plans:** 4 plans
Plans:
- [ ] 03-01-PLAN.md — Schema columns, Zod schemas, Factual Score engine with TDD
- [ ] 03-02-PLAN.md — Claim extractor and commentary drafter LLM modules with unit tests
- [ ] 03-03-PLAN.md — Analysis worker, ingestion handoff, worker registration, schema push, integration tests
- [ ] 03-04-PLAN.md — Benchmark harness CLI script with curated fixtures and output validation

### Phase 4: Reviewer Dashboard
**Goal**: A small team of reviewers can work through a prioritized queue of AI-flagged content, verify sources, approve or reject commentary, and every action is immutably logged — with it being technically impossible to publish without human approval
**Depends on**: Phase 3
**Requirements**: MOD-02, MOD-03, MOD-04, MOD-05, MOD-06, MOD-07, MOD-08, MOD-09, MOD-10, MOD-11
**Success Criteria** (what must be TRUE):
  1. The reviewer dashboard shows a queue of AI-flagged paragraphs sorted by claim severity and article traffic, with per-reviewer assignment visible
  2. Content flows through exactly five states (PENDING -> AI_ANALYZED -> HUMAN_APPROVED -> PUBLISHED, with HUMAN_REJECTED returning to PENDING) enforced at the state machine level — PUBLISHED is unreachable without passing through HUMAN_APPROVED
  3. A reviewer cannot approve commentary without first explicitly marking each cited source as verified — source verification is a mandatory, distinct UI step that the system enforces
  4. A reviewer can approve, edit, reject, or flag any word/sentence/paragraph/section for fact-checking — including content not flagged by the AI
  5. Every reviewer action (who, what, when, before/after) is written to an immutable audit log, and an alert fires when queue depth exceeds a configurable threshold
**Plans**: TBD
**UI hint**: yes

### Phase 5: Public Site and Staleness
**Goal**: Any published fact-check is accessible at a public URL with side-by-side Wikipedia content and Rosetta commentary, the Factual Score and review coverage are displayed prominently, and the system detects when Wikipedia edits affect existing fact-checks
**Depends on**: Phase 4
**Requirements**: INGEST-05, INGEST-06, PUB-01, PUB-02, PUB-03, PUB-04, PUB-05, PUB-06, PUB-09
**Success Criteria** (what must be TRUE):
  1. A public reader visiting `/wiki/[Topic]` sees Wikipedia content and approved fact-check commentary side by side, with each paragraph showing its review status badge (Unreviewed / AI Analyzed / Human Approved)
  2. The article page displays the Factual Score prominently alongside the human-review coverage percentage — these always appear together
  3. Human-written reviewer explanations display inline at the correct granularity (word, sentence, paragraph, or section) describing why specific content is incorrect or distorted
  4. The public page is usable on a phone screen (mobile-responsive) and carries CC-BY-SA attribution for Wikipedia content
  5. When a Wikipedia article is edited, the system detects the change and re-flags only sections whose content actually changed (not the entire article) for re-review
**Plans**: TBD
**UI hint**: yes

### Phase 6: Browser Extension
**Goal**: A reviewer or reader using the Chrome extension sees approved Rosetta fact-check badges and commentary overlaid directly on Wikipedia article pages, with all API traffic routed safely through the service worker
**Depends on**: Phase 5
**Requirements**: PUB-07, PUB-08
**Success Criteria** (what must be TRUE):
  1. Installing the extension and visiting a Wikipedia article with published Rosetta fact-checks overlays the approved badges and commentary directly on the Wikipedia page
  2. All extension API calls are routed through the service worker, not the content script
  3. The extension degrades gracefully when the Wikipedia DOM structure is unrecognized — no errors surface to the user
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/5 | Gap closure planned | - |
| 2. Wikipedia Ingestion | 3/3 | Complete | 2026-04-19 |
| 3. AI Pipeline and Scoring | 0/4 | Planned | - |
| 4. Reviewer Dashboard | 0/TBD | Not started | - |
| 5. Public Site and Staleness | 0/TBD | Not started | - |
| 6. Browser Extension | 0/TBD | Not started | - |
