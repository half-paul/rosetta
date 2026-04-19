# Requirements: Project Rosetta

**Defined:** 2026-04-18
**Core Value:** Every published fact-check has been verified by a human — AI accelerates the work, humans guarantee the quality.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Content Ingestion

- [ ] **INGEST-01**: User can paste a Wikipedia URL and the system fetches the live article content
- [ ] **INGEST-02**: System parses Wikipedia HTML into a section/paragraph tree with stable anchor IDs (section path + content hash + revision ID)
- [ ] **INGEST-03**: System stores article metadata (title, revision ID, fetch timestamp, language) alongside parsed content
- [ ] **INGEST-04**: System respects MediaWiki API rate limits with sequential request queue and exponential backoff
- [ ] **INGEST-05**: System detects when a Wikipedia article has been edited since last ingestion and flags affected sections for re-review
- [ ] **INGEST-06**: System re-flags only sections whose underlying content actually changed, not the entire article

### AI Pipeline

- [ ] **AI-01**: System provides a provider-agnostic LLM abstraction layer that supports at minimum two providers (e.g., Claude and GPT-4)
- [ ] **AI-02**: System extracts check-worthy claims from each paragraph using structured output (Zod schemas)
- [ ] **AI-03**: System drafts commentary for each extracted claim with suggested primary sources marked as unverified
- [ ] **AI-04**: System queues AI analysis jobs via background job processor (pg-boss) with retry and failure handling
- [ ] **AI-05**: System includes a benchmark harness to compare claim extraction quality across LLM providers
- [ ] **AI-06**: Switching LLM providers requires only configuration changes, not code changes

### Scoring

- [ ] **SCORE-01**: System computes a weighted Factual Score (0–100) per article based on claim accuracy, severity of distortions, and proportion of human-reviewed content
- [ ] **SCORE-02**: Score always displays alongside "X of Y sections reviewed by humans" coverage indicator
- [ ] **SCORE-03**: Unreviewed sections cannot contribute positively to the article's Factual Score
- [ ] **SCORE-04**: Score weights are configurable (default: Coverage 40%, Accuracy 40%, Confidence 20%)

### Moderation

- [ ] **MOD-01**: Reviewers can log in with email/password or OAuth (Google/GitHub)
- [ ] **MOD-02**: Reviewer dashboard shows a prioritized queue of AI-flagged paragraphs sorted by claim severity and article traffic
- [ ] **MOD-03**: System enforces a five-state workflow: PENDING → AI_ANALYZED → HUMAN_APPROVED → PUBLISHED (with HUMAN_REJECTED returning to PENDING)
- [ ] **MOD-04**: Reviewer must explicitly verify each cited source before approving commentary — source verification is a mandatory distinct step
- [ ] **MOD-05**: Reviewer can approve, edit, or reject AI-drafted commentary per paragraph
- [ ] **MOD-06**: Specific claims can be assigned to specific reviewers
- [ ] **MOD-07**: System monitors queue depth and alerts when backlog exceeds configurable thresholds
- [ ] **MOD-08**: All reviewer actions are recorded in an immutable audit log (who, what, when, before/after)
- [ ] **MOD-09**: It is technically impossible to reach PUBLISHED state without passing through HUMAN_APPROVED — enforced at the state machine level, not by convention
- [ ] **MOD-10**: Reviewer can manually select and flag specific words, sentences, paragraphs, or sections for fact-checking — not limited to AI-flagged content
- [ ] **MOD-11**: Reviewer can attach explanations to any content granularity (word, sentence, paragraph, section) describing why the content is incorrect or distorted

### Public Experience

- [ ] **PUB-01**: Public article page at `/wiki/[Topic]` displays Wikipedia content alongside approved fact-check commentary in a side-by-side layout
- [ ] **PUB-02**: Each paragraph shows its review status (Unreviewed / AI Analyzed / Human Approved) via visible badges
- [ ] **PUB-03**: Article page displays the Factual Score prominently with human-review coverage percentage
- [ ] **PUB-04**: Public pages are mobile-responsive and usable on phone screens
- [ ] **PUB-05**: Each fact-checked article has a shareable URL that resolves to its Rosetta page
- [ ] **PUB-06**: Wikipedia content displays CC-BY-SA attribution on every page
- [ ] **PUB-07**: Browser extension overlays approved fact-check badges and commentary directly on Wikipedia article pages
- [ ] **PUB-08**: Browser extension routes all API calls through its service worker (not content script) and degrades gracefully when DOM structure is unrecognized
- [ ] **PUB-09**: Public article page displays human-written explanations inline at the appropriate granularity (word, sentence, paragraph, or section) showing why specific content is incorrect or distorted

### Infrastructure

- [ ] **INFRA-01**: Database schema supports articles, sections, paragraphs, claims, commentaries, reviews, reviewers, and scores with proper relational integrity
- [ ] **INFRA-02**: Background job queue (pg-boss on PostgreSQL) handles ingestion and AI analysis jobs with exactly-once delivery
- [ ] **INFRA-03**: System sends a descriptive User-Agent header with all MediaWiki API requests per Wikimedia policy

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Multi-language

- **LANG-01**: System supports non-English Wikipedia editions (data model includes `language` field from v1)
- **LANG-02**: AI pipeline handles non-English claim extraction

### Community

- **COMM-01**: Public read-only discussion threads beneath approved fact-checks
- **COMM-02**: Role-based permissions for expanded reviewer team (>10 reviewers)

### Data

- **DATA-01**: Full versioned fact-checks stored per Wikipedia revision (complete audit trail)
- **DATA-02**: Public API for third-party consumption of Rosetta scores and fact-checks

### Notifications

- **NOTIF-01**: Reviewers receive email notifications when new articles are queued
- **NOTIF-02**: Reviewers receive email when assigned claims need attention

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Open/crowdsourced reviewer sign-up | Research shows quality collapse without expert curation (2024 study) |
| Auto-publish without human approval | Violates core trust contract — non-negotiable |
| Publicly editable commentary | Introduces vandalism risk; fact-checks require domain credibility |
| Social like/upvote counts on fact-checks | Gamifies credibility signals; popularity ≠ accuracy |
| Real-time collaborative editing | Concurrency complexity not justified for 2–5 person team |
| Multi-language support in v1 | API behavior and LLM quality differ per language; scope explosion |
| Native mobile app | Web-first; responsive layout is sufficient for v1 |
| EventStreams SSE for production staleness | Wikimedia docs say "not for production services"; use polling instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | Phase 2 | Pending |
| INGEST-02 | Phase 2 | Pending |
| INGEST-03 | Phase 2 | Pending |
| INGEST-04 | Phase 2 | Pending |
| INGEST-05 | Phase 5 | Pending |
| INGEST-06 | Phase 5 | Pending |
| AI-01 | Phase 1 | Pending |
| AI-02 | Phase 3 | Pending |
| AI-03 | Phase 3 | Pending |
| AI-04 | Phase 3 | Pending |
| AI-05 | Phase 3 | Pending |
| AI-06 | Phase 1 | Pending |
| SCORE-01 | Phase 3 | Pending |
| SCORE-02 | Phase 3 | Pending |
| SCORE-03 | Phase 3 | Pending |
| SCORE-04 | Phase 3 | Pending |
| MOD-01 | Phase 1 | Pending |
| MOD-02 | Phase 4 | Pending |
| MOD-03 | Phase 4 | Pending |
| MOD-04 | Phase 4 | Pending |
| MOD-05 | Phase 4 | Pending |
| MOD-06 | Phase 4 | Pending |
| MOD-07 | Phase 4 | Pending |
| MOD-08 | Phase 4 | Pending |
| MOD-09 | Phase 4 | Pending |
| MOD-10 | Phase 4 | Pending |
| MOD-11 | Phase 4 | Pending |
| PUB-01 | Phase 5 | Pending |
| PUB-02 | Phase 5 | Pending |
| PUB-03 | Phase 5 | Pending |
| PUB-04 | Phase 5 | Pending |
| PUB-05 | Phase 5 | Pending |
| PUB-06 | Phase 5 | Pending |
| PUB-07 | Phase 6 | Pending |
| PUB-08 | Phase 6 | Pending |
| PUB-09 | Phase 5 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 after roadmap creation*
