# Pitfalls Research

**Domain:** Wikipedia fact-checking and content verification platform
**Researched:** 2026-04-18
**Confidence:** HIGH (multiple authoritative sources cross-referenced)

## Critical Pitfalls

### Pitfall 1: Paragraph Anchor Drift — Commentary Becomes Detached After Edits

**What goes wrong:**
Fact-check commentary is anchored to a specific paragraph or section at analysis time. When Wikipedia editors revise that article — reordering sections, splitting paragraphs, renaming headings, or adding new content — the anchor references break silently. The system either serves commentary against the wrong paragraph, or loses the anchor entirely. Users read fact-check notes that don't match the text they're seeing.

**Why it happens:**
Teams anchor commentary by paragraph index (e.g., "paragraph 3 of section 'History'") or by string-matching the first N characters of paragraph text. Index-based anchoring breaks whenever content is inserted above. String-matching breaks when the paragraph is lightly edited. Neither approach is revision-stable.

**How to avoid:**
Anchor commentary to a combination of: (1) section heading text, (2) a content hash of the exact paragraph at review time, and (3) revision ID of the Wikipedia article version analyzed. When serving fact-checks, compare the stored revision ID against the current article revision. If they differ, flag the commentary as "anchored to a different version" rather than silently showing potentially mismatched notes. Stale flagging (already in project scope) is the correct response — do not attempt to auto-re-anchor.

**Warning signs:**
- Integration tests pass but manual inspection shows notes appearing next to wrong paragraphs
- Reviewers report that approved commentary "doesn't make sense" next to the paragraph it's attached to
- Wikipedia API returns a different `revid` than what was stored at analysis time

**Phase to address:**
Data model phase — the paragraph anchor schema must include `revision_id`, `section_title`, and `paragraph_content_hash` from day one. Retrofitting this later requires a full data migration.

---

### Pitfall 2: Treating Wikipedia HTML as Stable or Parseable Structure

**What goes wrong:**
Teams parse Wikipedia's rendered HTML to extract paragraphs, assuming `<p>` tags reliably represent article paragraphs. In practice, Wikipedia's wikitext produces unpredictable HTML: templates can generate partial table tags, infoboxes interrupt paragraph flow, footnotes inject inline elements, and some "paragraphs" are actually nested inside `<div>` structures from templates. Regex-based or naive DOM traversal approaches produce noisy, incomplete, or wrongly-split paragraph lists.

**Why it happens:**
Wikipedia's wikitext has no formal grammar — the only complete specification is the MediaWiki PHP runtime itself. The rendered HTML is "tag soup" produced by a pipeline of regex transformations. Developers assume HTML structure maps cleanly to visual paragraph structure; it does not.

**How to avoid:**
Use the Wikimedia REST API's `/page/summary` and `/page/sections` endpoints or the newer Structured Contents beta (which delivers sections and paragraphs as JSON) rather than attempting to parse raw HTML. For paragraph-level granularity, use the `action=parse` MediaWiki API with `prop=sections` to get section structure, then fetch section text and strip wikitext or HTML to plain text. Use an established library (e.g., `wtf_wikipedia` for JavaScript) rather than writing a custom parser. Validate extraction against 20+ real articles across article quality tiers before committing to the approach.

**Warning signs:**
- Paragraph counts vary wildly across article types (stubs vs. featured articles)
- Infobox content appears as paragraph text
- References section content bleeds into article body paragraphs
- Empty paragraphs or single-character paragraphs appear in the extracted list

**Phase to address:**
Wikipedia ingestion phase — validate parsing output against a diverse test corpus before wiring the AI pipeline to it. A bad parser silently corrupts every downstream analysis.

---

### Pitfall 3: LLM Hallucinated Sources Presented as Verified Citations

**What goes wrong:**
The AI drafts fact-check commentary with suggested primary sources. The LLM fabricates plausible-looking citations — real journal names, real author surnames, plausible titles — that don't exist. These citations pass casual human review because reviewers assume the AI retrieved them. The platform publishes fact-checks citing non-existent papers.

**Why it happens:**
LLMs generate text that looks like citations based on patterns from training data, not from actual retrieval. Even RAG-based systems hallucinate 17–33% of the time in factual domains. The risk is highest when the AI is asked to suggest sources for niche or technical claims where the training distribution is sparse.

**How to avoid:**
Separate claim extraction (what the AI asserts) from source suggestion (what the AI recommends as evidence). Treat every AI-suggested source as unverified by default — make it technically impossible for a reviewer to approve commentary without explicitly marking whether they verified each cited source. In the reviewer UI, sources should appear in a distinct "unverified" state until the reviewer confirms the link resolves and the source supports the claim. Never display AI-suggested sources on the public-facing site without this human verification step.

**Warning signs:**
- AI consistently suggests sources with DOIs or URLs that 404
- Reviewers report they "just trust the AI" on sources and do not check them individually
- Source verification is not a distinct step in the review workflow
- AI-suggested sources cluster around well-known domains (Wikipedia itself, major newspapers) rather than primary research

**Phase to address:**
AI pipeline phase and reviewer workflow phase — both must treat source verification as a first-class step, not an afterthought.

---

### Pitfall 4: Confidence Score Gaming and Misrepresentation

**What goes wrong:**
The 0–100 Factual Score is displayed to public users who interpret it as a definitive, objective rating. Users don't understand that a score of 72 might mean "only 30% of paragraphs have been reviewed" — they treat it as an absolute truth quality signal. Additionally, if the score algorithm is known, adversarial actors could select which paragraphs to submit for review to game the score upward while leaving problematic content unreviewed.

**Why it happens:**
Aggregate numeric scores are legible to users but strip out the nuance that makes them meaningful. Teams optimize for the "clean" user experience of a single number and defer adding transparency. Score algorithms based on review coverage percentages reward quantity of reviews over quality, which creates perverse incentives.

**How to avoid:**
The score must always display review coverage alongside the numeric value — not as a tooltip, but as a primary UI element (e.g., "Score: 74 — 4 of 11 sections reviewed"). Make it visually obvious when a score is based on partial review. In the algorithm, do not allow a section to contribute positively to the score if it has not been human-reviewed — only reviewed sections should move the score. Unreviewed sections should count against the score or hold it neutral. This removes the incentive to cherry-pick easy paragraphs.

**Warning signs:**
- Score is displayed without review coverage context anywhere in the UI
- Users in testing believe a score of 60+ means "mostly accurate" regardless of coverage
- The review queue shows only short or easy paragraphs being submitted while long complex sections remain untouched

**Phase to address:**
Factual Score algorithm design phase — the weighting formula must encode this constraint before any reviewer workflow is built on top of it.

---

### Pitfall 5: Staleness Detection That Misses Semantically Significant Edits

**What goes wrong:**
The system flags a fact-check as stale whenever the Wikipedia article's revision ID changes. Wikipedia articles receive minor edits constantly — typo fixes, punctuation corrections, wikilink additions, category changes — that don't affect the factual claims being reviewed. The result is excessive false-positive staleness alerts that exhaust the reviewer team, who begin ignoring them. Meanwhile, genuinely significant edits (new claims added, sources changed, entire sections rewritten) get buried in noise.

**Why it happens:**
Revision ID comparison is the simplest implementation: any edit triggers a flag. Teams implement the easy version first and never build the discrimination layer because "it works."

**How to avoid:**
Implement two-level staleness detection: (1) revision ID change triggers a diff fetch, (2) the diff is compared against the stored paragraph content hashes for each reviewed section. Only sections whose stored content hash no longer matches the current article content should be flagged for re-review. Minor edits to unreviewed sections are silent. Significant edits to reviewed sections trigger targeted re-review requests rather than a blanket "article changed" flag. Use the MediaWiki `action=compare` API to fetch structured diffs between revision IDs.

**Warning signs:**
- Reviewer queue fills with staleness alerts after any Wikipedia edit, including minor ones
- Reviewers report that "stale" articles look unchanged to them
- The team implements "bulk dismiss" staleness alerts as a workaround
- High-traffic Wikipedia articles (edited dozens of times per day) are effectively impossible to maintain

**Phase to address:**
Staleness detection phase — build content-hash comparison from the start. The Wikipedia EventStreams SSE feed (stream.wikimedia.org) provides real-time edit events, but the public endpoint is explicitly documented as "not for production services" — use polling via `action=query&prop=revisions` for production staleness checks.

---

### Pitfall 6: Reviewer Fatigue from Undifferentiated Queue Depth

**What goes wrong:**
The reviewer queue becomes a flat list of every AI-flagged paragraph across every article. With a team of 2–5 reviewers and AI that flags aggressively, the queue depth grows faster than it can be cleared. Reviewers experience decision fatigue, begin rubber-stamping AI analyses without genuine scrutiny, and the "human-in-the-loop" guarantee degrades to a formality.

**Why it happens:**
Teams focus on building the AI pipeline and reviewer approval UI, but treat queue management as a future problem. A queue that grows unboundedly is a queue that breaks the core product promise.

**How to avoid:**
Queue design must include: (1) priority signals (article traffic, claim severity flagged by AI, time since last review), (2) per-reviewer daily limits that force triage decisions rather than endless scrolling, (3) a "skip for now" mechanism that doesn't dismiss items permanently, and (4) reviewer-specific assignment to prevent duplicated effort. Build queue depth monitoring from day one — if depth exceeds a threshold, the system should alert the project owner rather than silently accumulating backlog. Research (CHI 2025) confirms that professional fact-checkers specifically need systems that explain their reasoning, not just verdicts — an AI that shows its work reduces reviewer cognitive load significantly.

**Warning signs:**
- Queue items are older than 48 hours on a regular basis
- Reviewers report spending more time navigating the queue than reviewing content
- Review approval rate per reviewer per day is declining over time
- Reviewers are approving items in under 30 seconds that should require 3–5 minutes of source verification

**Phase to address:**
Reviewer dashboard phase — queue management is not a secondary concern. It is the primary usability problem for the reviewer persona.

---

### Pitfall 7: Provider-Agnostic LLM Abstraction That Leaks Provider-Specific Behavior

**What goes wrong:**
A single prompt is written that works well on Claude, then the system is "switched" to GPT-4 or another model. The outputs change — not in format (the abstraction handles that) but in quality, reasoning style, and claim extraction granularity. The abstraction layer hides the failure: API calls return 200 OK, but the claims extracted are shallower, more conservative, or structured differently. The fact-check quality silently degrades.

**Why it happens:**
Provider abstraction focuses on API format normalization (request/response shapes, authentication, streaming) but cannot normalize semantic behavior. Different models have different training data, fine-tuning policies, and tendencies — Claude tends toward detailed reasoning chains, GPT-4 toward brevity. A prompt optimized for one model's behavior is implicitly coupled to that model.

**How to avoid:**
Maintain a model evaluation harness alongside the provider abstraction. For each supported provider, run a benchmark suite of 10–20 representative Wikipedia paragraphs and compare: claim count, claim specificity, source suggestion quality, and false positive rate. When switching providers, run this benchmark first — do not rely on manual spot-checking. Write prompts that state requirements explicitly (e.g., "extract every factual claim as a separate item") rather than relying on model defaults. Test with at minimum two providers before declaring the abstraction layer complete.

**Warning signs:**
- Claim count per paragraph varies by more than 30% when switching providers with identical prompts
- The AI stops flagging claims that were reliably flagged under the previous provider
- Reviewers notice that "the AI seems worse lately" coinciding with a provider change
- No automated benchmark exists to detect output quality regression

**Phase to address:**
AI pipeline phase — build the evaluation harness as part of the provider abstraction layer, not after it.

---

### Pitfall 8: MediaWiki API Rate Limiting Without Retry Architecture

**What goes wrong:**
During article ingestion or bulk processing, the system hits Wikimedia API rate limits and either crashes, drops requests silently, or retries immediately in a tight loop that triggers IP blocking. The Wikimedia Foundation introduced global API rate limits in March/April 2026, making this a live and worsening constraint.

**Why it happens:**
Developers treat the Wikipedia API like an internal service with no limits. The etiquette documentation is clear (sequential requests, meaningful User-Agent, exponential backoff on `ratelimited` errors) but is often skimmed rather than implemented. Parallel HTTP requests — the default pattern in most async frameworks — are explicitly prohibited.

**How to avoid:**
Implement a request queue that enforces sequential Wikipedia API calls (one outstanding request at a time). Set a descriptive User-Agent header with project name and contact email before making a single API call. Implement exponential backoff with jitter on `ratelimited` (HTTP 429) responses. Cache API responses aggressively — Wikipedia article content doesn't change in milliseconds; a 60-second TTL cache eliminates most redundant requests. Register for an API key to access elevated rate limits. For bulk operations (initial corpus ingestion), implement a rate limiter that caps requests to no more than 200/minute.

**Warning signs:**
- HTTP 429 errors appearing in logs
- Article ingestion timing correlates with Wikipedia load spikes
- User-Agent header is missing or set to a browser string
- Multiple parallel fetch requests for the same or different Wikipedia articles

**Phase to address:**
Wikipedia ingestion phase — rate limiting architecture must be in place before any production or staging environment talks to the live Wikipedia API.

---

### Pitfall 9: CC-BY-SA ShareAlike Obligation Propagating to Platform Content

**What goes wrong:**
Wikipedia text is licensed under CC-BY-SA 4.0. The ShareAlike clause requires that derivative works be published under the same or a compatible license. If the platform republishes Wikipedia text (even excerpts shown alongside fact-check commentary), that content and potentially the surrounding annotation must also be CC-BY-SA licensed. Teams don't realize this until legal review, then must either remove Wikipedia text from the UI or restructure the licensing model.

**Why it happens:**
Developers treat attribution as the only license requirement ("just link back to Wikipedia"). The ShareAlike obligation — that derivative works inherit the license — is overlooked, particularly for mixed-content pages that show both Wikipedia text and original platform commentary.

**How to avoid:**
Establish the legal model early: (1) Wikipedia text is displayed read-only and attributed with a visible link to the original article and license, (2) platform commentary is clearly distinguished as original work and is not a derivative of the Wikipedia text, (3) no Wikipedia text is modified or incorporated into the fact-check commentary itself. If the platform ever reproduces Wikipedia paragraphs verbatim in fact-check reports, those reports may inherit CC-BY-SA. Consider a design where fact-checks reference paragraph position and quote at most a few sentences, rather than reproducing full sections. Have a lawyer review the specific use case before launch.

**Warning signs:**
- The UI displays full Wikipedia article text alongside commentary without distinguishing attribution
- Fact-check export features reproduce Wikipedia text without license statements
- No explicit license statement distinguishes platform commentary from Wikipedia content

**Phase to address:**
Public-facing site phase — the side-by-side reading experience needs a content licensing review before launch.

---

### Pitfall 10: Browser Extension DOM Injection Breaking on Wikipedia Layout Changes

**What goes wrong:**
The browser extension injects fact-check overlays by finding Wikipedia DOM elements (article body, section headings, paragraphs) using CSS selectors or class names. Wikipedia periodically updates its skin (Vector 2022, future skins) or DOM structure. A Wikipedia layout update silently breaks the extension — overlays stop appearing, appear in wrong positions, or cause layout disruptions — and users assume the extension is broken or the platform is unreliable.

**Why it happens:**
Extensions that target a third-party site's DOM are inherently fragile. Wikipedia's class names (`.mw-parser-output`, `.mw-heading`, etc.) are MediaWiki internals and can change. Manifest V3 adds additional constraints: no dynamic code execution from external sources, stricter CSP, CORS restrictions in content scripts, and service workers instead of persistent background pages.

**How to avoid:**
Target only the most stable Wikipedia DOM selectors — prefer semantic HTML elements (`<h2>`, `<p>`, `<section>`) over class-name selectors. Wrap all extension injection in a fallback detection layer: if the expected DOM structure is not found, log a diagnostic and fail gracefully rather than injecting broken overlays. Add an automated test that visits Wikipedia pages in a headless browser and verifies that the extension correctly identifies paragraphs. Pin the test to Wikipedia's production skin and run it weekly in CI. Build the extension so that if injection fails, the extension icon still indicates that a fact-check is available for the article (degraded, not broken). Note: content scripts cannot make cross-origin fetch requests under Manifest V3 — route all platform API calls through the extension service worker.

**Warning signs:**
- Extension overlays appear on incorrect DOM elements after a Wikipedia update
- Content scripts fail silently with no user-visible error state
- Extension has no automated integration test against the live Wikipedia DOM
- API calls from the content script fail due to CORS restrictions

**Phase to address:**
Browser extension phase — this is lower priority than the core site, but its architecture must account for DOM fragility from design, not after first breakage.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code a single LLM provider (e.g., Claude only) | Faster initial development | Cannot swap providers without rewriting pipeline; vendor lock-in if pricing changes | Never — provider abstraction is a project requirement |
| Index-based paragraph anchoring (paragraph[3]) | Trivial to implement | Every Wikipedia edit that inserts content breaks existing fact-checks | Never — use content hash + revision ID from day one |
| Display score without review coverage | Cleaner UI | Misleads users; score loses meaning; gameable | Never — coverage is inseparable from the score's meaning |
| Skip source verification in reviewer UI | Simpler reviewer workflow | AI-hallucinated citations reach published fact-checks | Never — source verification is a core trust guarantee |
| Poll Wikipedia API without rate limiting | Simpler code | IP blocking, ToS violation, production outage | Never |
| Rely on Wikipedia's public EventStreams SSE for staleness | Real-time change detection | Documented as "not for production services"; unreliable under load | Prototyping only — use polling for production |
| Parse Wikipedia HTML with regex or custom DOM traversal | Avoids library dependency | Brittle against Wikipedia template changes; high maintenance | Prototyping only — use Wikimedia REST API or `wtf_wikipedia` |
| Flat reviewer queue with no prioritization | Faster to build | Reviewer fatigue; quality degradation; core value proposition breaks | Acceptable in very early internal testing only |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MediaWiki Action API | Parallel async requests to speed up ingestion | Sequential requests with exponential backoff on 429s; one outstanding request at a time |
| MediaWiki Action API | No User-Agent header or generic browser User-Agent | `"ProjectRosetta/1.0 (contact@rosetta.com)"` set on every request |
| MediaWiki Action API | Re-fetching article content on every page view | Cache API responses with 60-second TTL minimum; Wikipedia content is stable within that window |
| Wikimedia REST API | Using `action=parse` to get plain text paragraphs | Use `/page/sections` REST endpoint or Structured Contents JSON API for cleaner section-level text |
| Wikimedia EventStreams | Treating SSE stream as production-grade staleness source | Use `action=query&prop=revisions` polling for production; EventStreams is for small-scale tools only |
| LLM providers | Same prompt across all providers without evaluation | Run benchmark suite on each provider before switching; test claim extraction quality, not just API success |
| Chrome Extension / Manifest V3 | Background persistent page (MV2 pattern) | Service worker with efficient event filtering; no remote code execution from external sources |
| Chrome Extension | Fetch from content script to platform API | Route all platform API calls through the extension service worker, which has elevated cross-domain privileges |
| Wikipedia CC-BY-SA | Showing Wikipedia text without license statement | Attribute with link to original article + CC-BY-SA 4.0 license on every page that displays Wikipedia content |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full Wikipedia article HTML for every fact-check page view | High latency, Wikipedia rate limit exhaustion | Cache rendered Wikipedia content; serve from platform cache on repeat visits | From day one at any traffic level |
| LLM API call per paragraph in a single synchronous pipeline | Article analysis takes 10+ minutes; timeout errors | Queue-based async pipeline; paragraphs processed in background jobs | At ~10+ paragraph articles with synchronous processing |
| Running AI claim extraction and human review in the same DB transaction | DB lock contention; reviewer UI hangs during analysis | Separate read/write models; AI writes to draft state, reviewer reads from finalized state | At first concurrent reviewer + ingestion event |
| Storing full Wikipedia article HTML in the fact-check DB record | DB size balloons; slow queries | Store only paragraph hashes + section structure; fetch fresh content from Wikipedia API or platform cache on demand | At ~1,000 articles |
| Re-evaluating the Factual Score on every reviewer action | Score computation blocks the UI | Pre-compute and cache score; recompute asynchronously on state change | At any article with 5+ reviewed paragraphs |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reviewer authentication with no session expiry | Compromised reviewer account publishes manipulated fact-checks indefinitely | Short session TTLs; re-authentication before publishing actions |
| Exposing the AI pipeline endpoint without authentication | External actors can trigger unlimited LLM API calls, generating massive cost | Pipeline endpoints are internal-only; all ingestion triggered via authenticated reviewer actions |
| Storing LLM provider API keys accessible to the frontend | Key exfiltration; unlimited billing exposure | Keys stored server-side only; never in browser environment; rotate on any suspected exposure |
| No rate limiting on public fact-check API | Allows bulk scraping of platform's human-curated content | Rate-limit public API endpoints; require attribution for bulk access |
| Browser extension requesting overly broad host permissions | Chrome Web Store rejection; user distrust | Declare minimal host permissions (`*://en.wikipedia.org/*` only); use `activeTab` where possible |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Displaying a score of 65 with no context | Users treat it as "65% accurate" — meaningless without knowing what was reviewed | Always show "X of Y sections reviewed" alongside the score; use a visual coverage bar |
| Numerical confidence on AI-drafted content without a clear label | Users confuse AI confidence with human verification | Clear visual distinction between "AI analyzed" and "Human verified" states throughout the UI |
| Reviewer UI that shows no indication of what the AI analyzed vs. what was skipped | Reviewer doesn't know which paragraphs still need attention | Queue shows explicit "analyzed / not yet analyzed" state for every paragraph; unreviewed sections visually distinct |
| Public site that shows AI-only fact-checks as equivalent to human-approved ones | User trust collapses when an error is found; platform credibility damaged | Enforce the human-in-the-loop constraint in the data model — unpublished without human approval is not just a UI rule |
| Score shown on partially-reviewed article with no disclaimer | User makes trust decision on incomplete information | Score with fewer than 50% coverage must carry a prominent "partial review" indicator, not just the number |

---

## "Looks Done But Isn't" Checklist

- [ ] **Wikipedia ingestion:** Paragraph extraction tested against stub articles, disambiguation pages, articles with infoboxes, articles with citation templates, and redirect pages — not just clean long-form articles
- [ ] **AI pipeline:** Source citation verification is a distinct reviewer UI step, not a freeform text field the AI fills in
- [ ] **Factual Score:** Score algorithm encodes review coverage as a first-class variable — a 100% score is impossible until 100% of sections are human-reviewed
- [ ] **Staleness detection:** Stale flag is based on content hash comparison against reviewed sections, not just revision ID change
- [ ] **Reviewer workflow:** Queue has priority ordering and per-reviewer assignment — not just a global FIFO list
- [ ] **LLM abstraction:** Benchmark suite exists and runs against all supported providers; a provider switch requires a benchmark run before deployment
- [ ] **Browser extension:** DOM injection has a graceful fallback when Wikipedia's structure is not found; tested after each Wikipedia skin update
- [ ] **Legal:** Wikipedia text attribution (CC-BY-SA 4.0) is displayed on every page showing Wikipedia content; platform commentary is clearly distinguished as original work
- [ ] **Rate limiting:** MediaWiki API requests are sequential with exponential backoff; no parallel requests; User-Agent header set correctly in all environments
- [ ] **Publishing gate:** It is technically impossible to publish a fact-check or score without a reviewer's explicit approval — not just enforced by UI convention

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Paragraph anchors drift after production launch | HIGH | Data migration to add content-hash anchors to all existing records; re-review flagging for all published fact-checks against affected articles |
| AI-hallucinated citations published publicly | HIGH | Immediate retraction of affected fact-checks; manual re-review of all AI-suggested sources in published content; public disclosure if significant |
| Rate limiting triggers Wikipedia IP block | MEDIUM | Immediate halt of all automated requests; contact Wikimedia with explanation; implement request queue before resuming; may require different IP |
| Score algorithm needs redesign after launch | HIGH | All published scores become unreliable; user confusion; requires re-review of previously approved content under new algorithm |
| Browser extension breaks on Wikipedia update | LOW | Hotfix release with updated selectors; typically 1–3 day Chrome Web Store review for updates |
| LLM provider discontinued or cost-prohibitive | MEDIUM | Provider abstraction limits blast radius; benchmark against replacement; prompt tuning needed before switch |
| CC-BY-SA compliance gap found post-launch | MEDIUM-HIGH | Legal counsel required; may need to remove Wikipedia text from specific features; retroactive attribution additions |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Paragraph anchor drift | Data model / Wikipedia ingestion | Every stored paragraph has `revision_id` + `content_hash`; integration test verifies anchor survives a simulated article edit |
| Wikipedia HTML parsing failures | Wikipedia ingestion | Extraction tested against 20+ article types; infobox content does not appear in paragraph list |
| LLM hallucinated sources | AI pipeline + Reviewer workflow | Source verification is a distinct UI step; no published fact-check has an unverified source field |
| Score gaming and misrepresentation | Factual Score algorithm | Score is impossible to compute without review coverage metadata; UI test confirms coverage is always displayed |
| Staleness false positives | Staleness detection | Minor edits (typos) do not trigger staleness flags; section-level content-hash comparison is in place |
| Reviewer fatigue | Reviewer dashboard | Queue has priority ordering; depth monitoring alert is configured; daily review throughput is tracked |
| LLM provider semantic drift | AI pipeline | Benchmark suite exists; provider switch triggers benchmark before deployment |
| MediaWiki API rate limiting | Wikipedia ingestion | Sequential request queue implemented; exponential backoff on 429; User-Agent verified in all environments |
| CC-BY-SA license obligations | Public-facing site | Attribution displayed on every Wikipedia-content page; legal review completed before launch |
| Browser extension DOM fragility | Browser extension | Automated integration test visits Wikipedia in headless browser weekly; graceful fallback when selectors fail |

---

## Sources

- MediaWiki API Etiquette: https://www.mediawiki.org/wiki/API:Etiquette
- Wikimedia API Rate Limits (new 2026 global limits): https://lists.wikimedia.org/hyperkitty/list/wikitech-l@lists.wikimedia.org/thread/GBFZTN3A233IR6F4HEENCIUCVI2ZH6YB/
- Wikimedia API Usage Guidelines: https://foundation.wikimedia.org/wiki/Policy:API_usage_guidelines
- MediaWiki Wikitext Parser complexity: Sweble Wikitext Parser paper, https://www.researchgate.net/publication/221367823
- Wikimedia Structured Contents Initiative: https://enterprise.wikimedia.com/api/structured-contents/
- Wikipedia EventStreams ("not for production services"): https://wikitech.wikimedia.org/wiki/Event_Platform/EventStreams_HTTP_Service
- Wikipedia CC-BY-SA reuse requirements: https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content
- Show Me the Work: Fact-Checkers' Requirements for Explainable Automated Fact-Checking (CHI 2025): https://dl.acm.org/doi/full/10.1145/3706598.3713277
- Hallucination to Truth: Review of Fact-Checking in LLMs (2025): https://arxiv.org/html/2508.03860
- Hallucination rates in legal RAG systems (Stanford): https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf
- LLM provider abstraction pitfalls: https://medium.com/@rajasekar-venkatesan/your-prompts-are-technical-debt-a-migration-framework-for-production-llm-systems-942f9668a2c7
- Manifest V3 content script limitations: https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
- Chrome Web Store review process: https://developer.chrome.com/docs/webstore/review-process
- Cognitive biases in fact-checking: https://www.sciencedirect.com/article/pii/S0306457324000323

---
*Pitfalls research for: Wikipedia fact-checking platform (Project Rosetta)*
*Researched: 2026-04-18*
