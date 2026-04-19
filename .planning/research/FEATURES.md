# Feature Research

**Domain:** Wikipedia fact-checking / content verification platform (human-reviewed, AI-assisted)
**Researched:** 2026-04-18
**Confidence:** MEDIUM-HIGH (ecosystem patterns confirmed via multiple sources; Wikipedia-specific overlay is a novel combination)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| URL-based article lookup | Primary entry point — users paste a Wikipedia URL and expect instant results | LOW | Must mirror Wikipedia URL structure (`/wiki/Topic`) so URLs are predictable and shareable |
| Paragraph-level commentary | All serious annotation tools (Hypothesis, WikiTrust, ClaimBuster) operate at sub-article granularity; page-level verdicts are too coarse | HIGH | Requires DOM-level paragraph mapping from MediaWiki API; each paragraph needs a stable anchor ID |
| Factual score / trust signal | Snopes, PolitiFact, and Media Bias/Fact Check all use a verdict rating; users need a single scannable summary | MEDIUM | 0–100 numeric score with visible "% human-reviewed" breakdown prevents score-washing of partially checked articles |
| Source citations for each claim | Every major fact-checker (Snopes, FullFact, PolitiFact) links claims to primary sources; missing sources = users can't verify independently | MEDIUM | AI suggests sources; reviewer confirms. Citations must be machine-readable (URL + quote excerpt) |
| Human approval badge / status label | Users need to distinguish AI-only analysis from human-verified content — this is the platform's core trust contract | LOW | Tiered labels: Unreviewed / AI Analyzed / Human Approved. Must be visible at article and paragraph level |
| Stale content detection | Wikipedia edits frequently; serving old fact-checks on changed articles is actively misleading | MEDIUM | Poll MediaWiki `revisions` API or subscribe to EventStreams (launched 2017, still active); compare stored `revid` against current. Flag changed sections, not whole articles |
| Reviewer authentication | Any platform with a moderation workflow needs identity management | LOW | Email/password + OAuth (Google) for small trusted team — no public sign-up in v1 |
| Reviewer queue / dashboard | Human-in-loop AI pipelines universally require a triage interface; without it reviewers have no workflow | MEDIUM | Queue shows AI-flagged paragraphs sorted by confidence score. Reviewer actions: Approve / Edit / Reject |
| Public article page (`/wiki/Topic`) | The core public-facing surface — without it there is no product | MEDIUM | Side-by-side layout: Wikipedia content left, Rosetta commentary right. Mirrors how tools like Wikiwand augment Wikipedia |
| Mobile-responsive layout | >60% of Wikipedia traffic is mobile; fact-check pages must not break on small screens | LOW | CSS responsive — no native app needed in v1 |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI claim extraction pipeline | Competitors (Snopes, PolitiFact) hand-pick articles to check; Rosetta can analyze *any* Wikipedia URL on demand — this is the scalability unlock | HIGH | Provider-agnostic LLM abstraction (Claude / GPT-4 / Gemini swappable). ClaimBuster showed 0.96 precision on check-worthy claim detection in political text; similar NLP approach works for encyclopedic content |
| Weighted Factual Score with coverage transparency | Most fact-checkers give binary verdicts (true/false). Rosetta's 0–100 score weighted by claim severity AND review coverage is more nuanced and honest about uncertainty | HIGH | Score must clearly communicate "X% of article reviewed by humans" — prevents false confidence on partially checked articles. Media Bias/Fact Check uses a similar multi-factor weighting (failed checks 40%, sourcing 25%, transparency 25%, one-sidedness 10%) |
| Section-level staleness flagging | Existing Wikipedia monitoring tools (WikiMonitoring, PageCrawl, Visualping) only alert *that* a change happened — they don't know which sections changed or whether those sections had approved fact-checks | MEDIUM | Map changed paragraphs (via diff API) to existing approved commentary. Only re-flag sections whose underlying text changed, not the whole article |
| Browser extension overlay on wikipedia.org | WikiTrust (now defunct) proved the UX value of in-situ annotation. No current tool does human-reviewed fact-checks directly on Wikipedia pages | HIGH | Extension injects Rosetta badges into Wikipedia DOM. Lower v1 priority than core site — ship after core is stable |
| Provider-agnostic AI layer | Avoids LLM vendor lock-in; lets Rosetta optimize cost/quality as models improve | MEDIUM | Abstract LLM calls behind a provider interface with Claude, GPT-4, and a fallback stub. Critical for long-term cost control |
| Structured claim-to-source data model | Most fact-checkers store verdicts as prose; Rosetta's structured model (claim → evidence → verdict → score) enables future filtering, export, and API use | MEDIUM | Design the data model to support machine-readable output even if the v1 API is not exposed publicly |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Open / crowdsourced reviewer sign-up | More reviewers = faster coverage; Wikipedia itself uses a crowd model | Crowdsourced fact-checking research (2024, Information Processing and Management) shows crowd workers overestimate truthfulness, exhibit herd behavior, and produce inconsistent results — especially on polarizing topics. Quality collapses without expert curation | Small trusted team (~2–5) onboarded directly. Add reviewers manually as trust is established |
| Real-time collaborative editing of fact-checks | Google Docs-style multi-reviewer editing feels natural | Concurrency conflicts on short comment fields are expensive to implement correctly; small team does not need it; risk of one reviewer overwriting another's work silently | Sequential claim-level ownership: only one reviewer actively edits a paragraph at a time. Locking is simpler than CRDT |
| Multi-language Wikipedia support | Global reach; non-English Wikipedia has significant content | MediaWiki API, ORES quality scores, and LLM claim extraction all behave differently per language. V1 scope explodes | English-only for v1. Design data model with `language` field so expansion is possible without schema migration |
| Automatic publishing without human approval | Speed — AI pipelines can analyze articles in seconds | This violates the platform's core trust contract. Users on AI-only platforms (e.g., generic AI fact-checkers) cannot distinguish hallucinated sources from real ones. Human approval is the differentiation | Enforce the human approval gate as a hard system constraint, not a soft convention |
| Publicly editable commentary (Wikipedia-style) | Familiar UX; community scales content creation | Introduces the same vandalism and bias risks Wikipedia itself struggles with. Fact-checks require domain credibility, not just community consensus | Curated reviewer team. Future v2 could add a read-only public comment/discussion thread beneath approved fact-checks |
| Versioned fact-checks per Wikipedia revision | Complete audit trail if Wikipedia changes | Significant database and query complexity (storing full commentary snapshots per `revid`). Storage grows fast for popular articles | Flag stale fact-checks when underlying text changes; require re-review of affected sections. Full versioning is v2+ |
| Social sharing vanity metrics (likes, shares) | Increases engagement; common on content platforms | Gamifies credibility signals. A fact-check with 10k shares is not more accurate than one with 10. Creates incentives to write popular verdicts, not accurate ones | Share buttons for external sharing (Twitter/X, link copy) are fine. No on-platform like/upvote counts on fact-checks |

---

## Feature Dependencies

```
[Wikipedia content ingestion]
    └──requires──> [MediaWiki API integration]
                       └──requires──> [Stale detection / revision tracking]

[Factual Score]
    └──requires──> [Paragraph-level commentary data model]
                       └──requires──> [Claim extraction pipeline]
                                          └──requires──> [Provider-agnostic LLM abstraction]

[Human approval workflow]
    └──requires──> [Reviewer authentication]
    └──requires──> [Reviewer queue / dashboard]
                       └──requires──> [Paragraph-level commentary data model]

[Public article page]
    └──requires──> [Human approval workflow] (to show approved vs pending)
    └──requires──> [Factual Score]
    └──requires──> [Paragraph-level commentary data model]

[Stale content detection] ──enhances──> [Human approval workflow]
    (flags approved sections for re-review when Wikipedia changes)

[Browser extension] ──requires──> [Public article page]
    (extension reads from the same data the site displays)

[Browser extension] ──conflicts──> [Core site stability]
    (extension adds Manifest V3 / cross-origin complexity; ship after core is stable)
```

### Dependency Notes

- **Paragraph-level commentary data model requires MediaWiki API:** Wikipedia's section and paragraph structure comes from the API's `parse` action with `prop=sections`. Without this, anchoring commentary to specific content is unreliable.
- **Factual Score requires complete paragraph-level model:** Score is computed over claim-level verdicts; score computation cannot begin until the granular data model is defined.
- **Stale detection enhances human approval workflow:** When Wikipedia changes a section, the system must re-queue affected paragraphs for human review — the workflows are coupled.
- **Browser extension conflicts with core site stability:** Extension introduces a separate release surface (Chrome Web Store / Firefox Add-ons), cross-origin data fetching, and Manifest V3 constraints. Building it before the API surface is stable creates churn. Ship last.
- **LLM abstraction layer must precede any AI pipeline work:** All claim extraction, commentary drafting, and source suggestion routes through this layer. Building it first prevents vendor lock-in from day one.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] MediaWiki API integration with paragraph-level DOM mapping — without this, nothing works
- [ ] Provider-agnostic LLM abstraction layer — required before any AI pipeline work begins
- [ ] AI claim extraction and commentary drafting pipeline — core value generation
- [ ] Paragraph-level data model anchoring claims to Wikipedia sections — foundation for score and UX
- [ ] Weighted Factual Score (0–100) with human-review coverage percentage — the core trust signal
- [ ] Reviewer authentication (email/password + Google OAuth) — gate for the moderation workflow
- [ ] Reviewer dashboard with AI-flagged paragraph queue — enables human approval
- [ ] Human moderation workflow (Unreviewed → AI Analyzed → Human Approved → Published) — non-negotiable trust contract
- [ ] Public article page at `/wiki/Topic` with side-by-side reading experience — the user-facing product
- [ ] Stale content detection — flags fact-checks when Wikipedia article changes (flagging, not auto-invalidation)

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Browser extension that overlays approved fact-checks on Wikipedia pages — high UX value, but adds deployment surface; ship after core API is stable
- [ ] Section-level staleness precision — currently flag at article level; refine to flag only changed paragraphs
- [ ] Shareable fact-check URLs — SEO and virality; add once content volume warrants it
- [ ] Reviewer email notifications when new articles are queued — workflow improvement for small team

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Public read-only discussion threads on approved fact-checks — community engagement without quality risk
- [ ] Full versioned fact-checks per Wikipedia revision — complete audit trail; high storage cost
- [ ] Multi-language support — expand beyond English Wikipedia
- [ ] Public API for third-party consumption of Rosetta scores — enables ecosystem integrations
- [ ] Expanded reviewer team with role-based permissions — needed when reviewer count exceeds ~10

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Wikipedia content ingestion + paragraph mapping | HIGH | MEDIUM | P1 |
| Provider-agnostic LLM abstraction | HIGH | MEDIUM | P1 |
| AI claim extraction pipeline | HIGH | HIGH | P1 |
| Paragraph-level data model | HIGH | MEDIUM | P1 |
| Factual Score (0–100) with coverage % | HIGH | MEDIUM | P1 |
| Reviewer authentication | HIGH | LOW | P1 |
| Reviewer queue / dashboard | HIGH | MEDIUM | P1 |
| Human moderation workflow | HIGH | MEDIUM | P1 |
| Public article page (side-by-side) | HIGH | MEDIUM | P1 |
| Stale content detection | HIGH | MEDIUM | P1 |
| Browser extension overlay | HIGH | HIGH | P2 |
| Section-level staleness precision | MEDIUM | MEDIUM | P2 |
| Shareable fact-check URLs | MEDIUM | LOW | P2 |
| Reviewer email notifications | LOW | LOW | P2 |
| Public discussion threads | MEDIUM | MEDIUM | P3 |
| Versioned fact-checks per revision | LOW | HIGH | P3 |
| Multi-language support | HIGH | HIGH | P3 |
| Public API | MEDIUM | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Snopes | PolitiFact | ClaimBuster | WikiTrust (defunct) | Rosetta (planned) |
|---------|--------|------------|-------------|---------------------|-------------------|
| Verdict rating system | 5-point scale (True → False + Satire/Outdated) | 6-point Truth-O-Meter | Check-worthiness score (0–1) per sentence | Trust color overlay (orange/yellow gradient) | 0–100 Factual Score with human-coverage % |
| Granularity | Article-level | Article-level | Sentence-level (automated) | Word/edit level (automated) | Paragraph-level (human-approved) |
| Human review | Every claim | Every claim | None — fully automated | None — algorithmic | Every published claim (non-negotiable) |
| Source citations | Yes, inline | Yes, inline | Matched to existing fact-check DB | No | Yes, per claim with URL + excerpt |
| Wikipedia-specific | No | No | No | Yes | Yes |
| Browser extension | No | No | No | Yes (now defunct) | Planned (v1.x) |
| AI assistance | FactBot (Snopes app, 2024) | No | Core feature | No | Core feature (AI drafts, human approves) |
| Stale detection | N/A | N/A | N/A | N/A | Yes (flag on Wikipedia edit) |
| Public API | No | Limited (RSS) | Yes (claim spotter API) | No | Planned (v2+) |
| Open reviewer sign-up | No | No | N/A | No | No (small trusted team) |

---

## Sources

- [Wikipedia and fact-checking — Wikipedia](https://en.wikipedia.org/wiki/Wikipedia_and_fact-checking)
- [ClaimBuster: First end-to-end fact-checking system — VLDB 2017](https://vldb.org/pvldb/vol10/p1945-li.pdf)
- [WikiTrust — Wikipedia](https://en.wikipedia.org/wiki/WikiTrust)
- [ORES: Lowering Barriers with Participatory Machine Learning in Wikipedia — arXiv 2019](https://arxiv.org/pdf/1909.05189)
- [Media Bias/Fact Check Methodology](https://mediabiasfactcheck.com/methodology/)
- [Crowdsourced Fact-checking: Does It Actually Work? — Information Processing and Management 2024](https://www.sciencedirect.com/science/article/pii/S0306457324001523)
- [A Browser Extension for in-place Signaling and Assessment of Misinformation — CHI 2024](https://dl.acm.org/doi/abs/10.1145/3613904.3642473)
- [Human-in-the-Loop AI Review Queues: Workflow Patterns That Scale — AllDaysTech 2025](https://alldaystech.com/guides/artificial-intelligence/human-in-the-loop-ai-review-queue-workflows)
- [MediaWiki API:Revisions](https://www.mediawiki.org/wiki/API:Revisions)
- [MediaWiki API:Recent changes stream (EventStreams)](https://www.mediawiki.org/wiki/API:Recent_changes_stream)
- [The 3 building blocks of trustworthy information: Lessons from Wikipedia — Wikimedia Foundation 2025](https://wikimediafoundation.org/news/2025/10/02/the-3-building-blocks-of-trustworthy-information-lessons-from-wikipedia/)
- [Fact-Checking at a Crossroads: Challenges, Alternatives, and Pathways — JRC European Commission](https://publications.jrc.ec.europa.eu/repository/bitstream/JRC141580/JRC141580_01.pdf)

---
*Feature research for: Wikipedia fact-checking platform (Project Rosetta)*
*Researched: 2026-04-18*
