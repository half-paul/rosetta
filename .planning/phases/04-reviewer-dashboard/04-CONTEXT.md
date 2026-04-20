# Phase 4: Reviewer Dashboard - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

A small team of reviewers (2–5 people) can work through a prioritized queue of AI-flagged content, verify sources with structured ratings, approve/edit/reject commentary, manually flag content the AI missed, attach explanations, and every action is immutably logged. Publishing without human approval is technically impossible — enforced at the state machine level.

</domain>

<decisions>
## Implementation Decisions

### Queue Layout & Prioritization
- **D-01:** Flat priority list — single list sorted by severity (HIGH → MED → LOW), then newest first within same severity. Linear-style, filterable by status/assignee/severity.
- **D-02:** Compact row per queue item — severity badge, article title, section name, claim count, assignee avatar, status tag. One line per item, click to open review view.
- **D-03:** Manual assignment — any reviewer can assign a queue item to themselves or another reviewer via dropdown on each item. No auto-distribution.

### Source Verification UX
- **D-04:** Inline checklist — each source displayed as a card with URL, title, relevance note, and a traffic light rating selector. All sources must be rated before the Approve button enables (enforces MOD-04).
- **D-05:** Traffic light rating per source — Confirms (1.0) / Partially supports (0.5) / Does not support (0.0). These ratings feed directly into the accuracy component of the Factual Score via the existing `computeAndPersistScore()` engine.
- **D-06:** Source verification progress shown as "X of Y verified" counter above the source list.

### Review Workflow Interactions
- **D-07:** Split pane review view — left pane shows Wikipedia paragraph with claims highlighted inline (using char offsets from claim extraction), right pane shows AI commentary, sources, and action buttons.
- **D-08:** Inline editing — click Edit button, commentary text becomes an editable textarea in-place with save/cancel buttons. No modals.
- **D-09:** Text selection flagging (MOD-10) — reviewer highlights text in the Wikipedia content pane, clicks a "Flag" button that appears, fills a mini form (severity + notes) to create a new manually-flagged claim.
- **D-10:** Explanations attached to flag/claim (MOD-11) — textarea alongside each claim at whatever granularity it was flagged (word, sentence, paragraph, section). Stored with the claim for display on the public site in Phase 5.

### Audit Log & Monitoring
- **D-11:** Separate `audit_log` table — dedicated append-only table for all reviewer actions (approve, reject, edit, assign, flag, explain, source verify). More flexible than extending the reviews table. Captures who, what, when, before/after state.
- **D-12:** Activity feed per claim — bottom of the review pane shows a timeline of actions for that claim. Plus a dedicated /dashboard/activity page with filterable global activity across all articles.
- **D-13:** Dashboard banner alert (MOD-07) — warning banner at the top of the queue when unreviewed item count exceeds a configurable threshold. No email infrastructure needed for v1.

### State Machine Enforcement
- **D-14:** The five-state workflow (PENDING → AI_ANALYZED → HUMAN_APPROVED → PUBLISHED, HUMAN_REJECTED → PENDING) is already enforced by `reviewStatusEnum` in schema.ts. The dashboard API routes must validate transitions server-side — the Approve button is not sufficient; the API must reject invalid transitions (MOD-09).
- **D-15:** Score recomputation triggers on every review status change by calling `computeAndPersistScore()` — already built in Phase 3 (D-13).

### Claude's Discretion
- Exact filter/sort UI components (dropdowns, chips, etc.)
- Keyboard shortcuts for common actions (approve, reject, next item)
- Loading states and skeleton screens
- Empty state design when queue is empty
- Exact threshold default for queue depth alert (suggest 50)
- How to handle the transition from AI_ANALYZED directly to PUBLISHED (must pass through HUMAN_APPROVED — enforce in API)
- Pagination strategy for the queue (infinite scroll vs paginated)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value: human-in-the-loop non-negotiable, invite-only reviewers
- `.planning/REQUIREMENTS.md` — MOD-02 through MOD-11 (this phase's requirements)
- `.planning/ROADMAP.md` — Phase 4 success criteria and dependency on Phase 3

### Prior Phase Context
- `.planning/phases/01-foundation/01-CONTEXT.md` — Schema conventions (CUID2, soft deletes, timestamps), Tailwind + shadcn/ui, feature-based folders, NextAuth JWT strategy
- `.planning/phases/02-wikipedia-ingestion/02-CONTEXT.md` — Ingestion flow, stable ID generation, paragraph structure
- `.planning/phases/03-ai-pipeline-and-scoring/03-CONTEXT.md` — Claim extraction output shape, commentary drafting, score engine, five-state workflow

### Existing Code (must read before implementing)
- `src/db/schema.ts` — `reviewStatusEnum`, `reviews` table, `commentaries.suggestedSources` jsonb shape, `claims` table with severity/confidence/char offsets
- `src/features/analysis/score-engine.ts` — `computeAndPersistScore()` to call on every review action
- `src/app/dashboard/page.tsx` — Existing dashboard shell (auth-gated, empty state placeholder)
- `src/components/ui/` — Available shadcn/ui components: Button, Card, Input, Label, Alert, Separator

### Research & Architecture
- `.planning/research/STACK.md` — Technology stack decisions
- `.planning/research/ARCHITECTURE.md` — System architecture, feature folder layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/card.tsx` — Card component for queue items and source cards
- `src/components/ui/button.tsx` — Button variants for approve/reject/edit actions
- `src/components/ui/alert.tsx` — Alert component for queue depth warning banner
- `src/components/ui/input.tsx` — Input for filter/search functionality
- `src/features/analysis/score-engine.ts` — `computeAndPersistScore(articleId)` ready to call from review handlers

### Established Patterns
- Feature-based folders: new code goes in `src/features/reviews/`
- Drizzle ORM for all DB operations with transactions
- pg-boss for async jobs (if needed for alert monitoring)
- NextAuth JWT session for auth checks on all dashboard routes
- Server Components for data fetching, Client Components for interactivity

### Integration Points
- Dashboard route: `src/app/dashboard/` — expand from empty shell to full review queue
- API routes: `src/app/api/reviews/` — new routes for approve, reject, edit, assign, flag actions
- Score engine: call `computeAndPersistScore()` after every status change
- `commentaries.suggestedSources` jsonb: extend `isVerified` boolean to include `rating` field (confirms/partially/does-not-support)

</code_context>

<specifics>
## Specific Ideas

- Linear-style aesthetic throughout — clean, minimal chrome, keyboard-driven feel
- Split pane review view mirrors a "diff review" pattern — original content on left, commentary on right
- Traffic light source ratings (Confirms/Partially/Does not support) feeding into the Factual Score accuracy component creates a direct link between reviewer diligence and score quality
- Text selection for manual flagging should feel like annotating a document — natural, not form-heavy

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-reviewer-dashboard*
*Context gathered: 2026-04-19*
