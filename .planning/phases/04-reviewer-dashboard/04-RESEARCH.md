# Phase 4: Reviewer Dashboard - Research

**Researched:** 2026-04-19
**Domain:** Human-in-the-loop moderation dashboard — state machine enforcement, immutable audit log, source verification, text selection flagging
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Queue Layout & Prioritization**
- D-01: Flat priority list — single list sorted by severity (HIGH → MED → LOW), then newest first within same severity. Linear-style, filterable by status/assignee/severity.
- D-02: Compact row per queue item — severity badge, article title, section name, claim count, assignee avatar, status tag. One line per item, click to open review view.
- D-03: Manual assignment — any reviewer can assign a queue item to themselves or another reviewer via dropdown on each item. No auto-distribution.

**Source Verification UX**
- D-04: Inline checklist — each source displayed as a card with URL, title, relevance note, and a traffic light rating selector. All sources must be rated before the Approve button enables (enforces MOD-04).
- D-05: Traffic light rating per source — Confirms (1.0) / Partially supports (0.5) / Does not support (0.0). These ratings feed directly into the accuracy component of the Factual Score via the existing `computeAndPersistScore()` engine.
- D-06: Source verification progress shown as "X of Y verified" counter above the source list.

**Review Workflow Interactions**
- D-07: Split pane review view — left pane shows Wikipedia paragraph with claims highlighted inline (using char offsets from claim extraction), right pane shows AI commentary, sources, and action buttons.
- D-08: Inline editing — click Edit button, commentary text becomes an editable textarea in-place with save/cancel buttons. No modals.
- D-09: Text selection flagging (MOD-10) — reviewer highlights text in the Wikipedia content pane, clicks a "Flag" button that appears, fills a mini form (severity + notes) to create a new manually-flagged claim.
- D-10: Explanations attached to flag/claim (MOD-11) — textarea alongside each claim at whatever granularity it was flagged (word, sentence, paragraph, section). Stored with the claim for display on the public site in Phase 5.

**Audit Log & Monitoring**
- D-11: Separate `audit_log` table — dedicated append-only table for all reviewer actions (approve, reject, edit, assign, flag, explain, source verify). More flexible than extending the reviews table. Captures who, what, when, before/after state.
- D-12: Activity feed per claim — bottom of the review pane shows a timeline of actions for that claim. Plus a dedicated /dashboard/activity page with filterable global activity across all articles.
- D-13: Dashboard banner alert (MOD-07) — warning banner at the top of the queue when unreviewed item count exceeds a configurable threshold. No email infrastructure needed for v1.

**State Machine Enforcement**
- D-14: The five-state workflow (PENDING → AI_ANALYZED → HUMAN_APPROVED → PUBLISHED, HUMAN_REJECTED → PENDING) is already enforced by `reviewStatusEnum` in schema.ts. The dashboard API routes must validate transitions server-side — the Approve button is not sufficient; the API must reject invalid transitions (MOD-09).
- D-15: Score recomputation triggers on every review status change by calling `computeAndPersistScore()` — already built in Phase 3 (D-13).

### Claude's Discretion
- Exact filter/sort UI components (dropdowns, chips, etc.)
- Keyboard shortcuts for common actions (approve, reject, next item)
- Loading states and skeleton screens
- Empty state design when queue is empty
- Exact threshold default for queue depth alert (suggest 50)
- How to handle the transition from AI_ANALYZED directly to PUBLISHED (must pass through HUMAN_APPROVED — enforce in API)
- Pagination strategy for the queue (infinite scroll vs paginated)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MOD-02 | Reviewer dashboard shows a prioritized queue of AI-flagged paragraphs sorted by claim severity and article traffic | Queue page at `/dashboard` with Drizzle JOIN across articles/claims/commentaries, sorted by severity enum order |
| MOD-03 | System enforces five-state workflow: PENDING → AI_ANALYZED → HUMAN_APPROVED → PUBLISHED (HUMAN_REJECTED → PENDING) | `reviewStatusEnum` already in schema; API-level transition validator needed |
| MOD-04 | Reviewer must explicitly verify each cited source before approving commentary | Client-side gate (Approve disabled) + API-side gate (reject if any source unverified) |
| MOD-05 | Reviewer can approve, edit, or reject AI-drafted commentary per paragraph | API routes for approve/edit/reject; inline textarea edit (no modal) |
| MOD-06 | Specific claims can be assigned to specific reviewers | `assignedTo` column added to `commentaries` table; Select dropdown in queue row |
| MOD-07 | System monitors queue depth and alerts when backlog exceeds configurable thresholds | Count query in Server Component; Alert banner when count > threshold |
| MOD-08 | All reviewer actions recorded in immutable audit log (who, what, when, before/after) | New `audit_log` table — append-only, no UPDATE/DELETE operations |
| MOD-09 | Technically impossible to reach PUBLISHED state without passing through HUMAN_APPROVED | State machine validator function enforced in every API route; never bypass |
| MOD-10 | Reviewer can manually select and flag specific words/sentences/paragraphs/sections | Text selection API + `window.getSelection()`, floating Flag button, new claim creation |
| MOD-11 | Reviewer can attach explanations to any content granularity | `explanation` field on claims table; populated per claim during review |
</phase_requirements>

---

## Summary

Phase 4 builds the reviewer dashboard on top of the data model and score engine delivered by Phases 1–3. The core challenge is not UI complexity — the shadcn/ui components and `@base-ui/react` primitives are already installed and wired — but enforcing workflow correctness at multiple layers simultaneously: the database state machine, the API boundary, and the client gate.

Three technical problems deserve careful planning. First, schema extension: the current `schema.ts` lacks an `audit_log` table, an `assignedTo` column on `commentaries`, an `explanation` field on `claims`, and a `rating` field on the `suggestedSources` JSONB. These must be added via Drizzle migration before any API work begins. Second, the state machine validator must be a pure function in `src/features/reviews/state-machine.ts` that both the API routes and tests can call — no inline status-string comparisons in route handlers. Third, text selection flagging (`window.getSelection()`) is a client-side browser API that must be isolated to a Client Component; it cannot exist in a Server Component.

The UI-SPEC is already approved and fully specifies the visual contract. The planner can treat UI-SPEC sections as locked specifications. Research here focuses on implementation patterns, schema gaps, and the transaction model for atomic audit-log writes.

**Primary recommendation:** Plan schema migration first, then state machine module, then API routes, then UI components. Each layer depends on the previous.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Queue display (sorted list) | Frontend Server (SSR) | — | Read-only data fetch; Server Component with Drizzle query; no client state needed |
| Filter/sort state (status, severity, assignee) | Browser / Client | Frontend Server | URL search params via `nuqs`; Server Component re-renders on param change |
| Review pane (split view) | Browser / Client | Frontend Server | Interactive; requires `useState` for edit mode, text selection, source ratings |
| State machine enforcement | API / Backend | — | Must be server-enforced; client gate is UX only, never the real guard |
| Audit log writes | API / Backend | Database / Storage | Append-only INSERT inside the same transaction as status update |
| Source verification gate | API / Backend | Browser / Client | API checks all sources rated before allowing approve; client disables button as UX aid |
| Assignment | API / Backend | Browser / Client | PATCH commentary.assignedTo; session.user.id provides actor identity |
| Queue depth alert | Frontend Server (SSR) | — | COUNT query on Server Component; render Alert banner when over threshold |
| Score recomputation | API / Backend | — | Direct call to `computeAndPersistScore()` within API route after status change |
| Text selection flagging | Browser / Client | API / Backend | `window.getSelection()` is browser API; new claim creation calls API |
| Activity feed | Frontend Server (SSR) | — | Read from `audit_log` table; Server Component query |

---

## Standard Stack

All packages below are already installed in `package.json` unless marked `(add)`.

### Core (verified against `package.json` and `node_modules`)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Next.js | 16.2.4 | App Router, Server Components, Route Handlers | Installed [VERIFIED: package.json] |
| React | 19.2.4 | UI runtime | Installed [VERIFIED: package.json] |
| Drizzle ORM | 0.45.2 | Database queries, migrations, transactions | Installed [VERIFIED: package.json] |
| drizzle-kit | 0.31.10 | Schema migration generation | Installed [VERIFIED: package.json] |
| next-auth | 5.0.0-beta.31 | Session auth; `auth()` call in Server Components and API routes | Installed [VERIFIED: package.json] |
| shadcn/ui | 4.3.0 (CLI) | Component scaffolding; base-nova style using `@base-ui/react` | Installed [VERIFIED: package.json] |
| @base-ui/react | 1.4.0 | Accessible primitives (Button, Select, Tooltip, ScrollArea, Popover, Avatar) | Installed [VERIFIED: node_modules] |
| lucide-react | 1.8.0 | Icons (ChevronDown, Check, X, Flag, etc.) | Installed [VERIFIED: package.json] |
| Zod | 4.3.6 | API request validation | Installed [VERIFIED: package.json] |
| pg | 8.20.0 | PostgreSQL driver | Installed [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| nuqs | 2.8.9 | URL-serialized filter/sort state for queue page | NOT installed — add [VERIFIED: npm view] |
| class-variance-authority | 0.7.1 | Component variant styling | Installed [VERIFIED: package.json] |
| tailwind-merge | 3.5.0 | Class merging utility | Installed [VERIFIED: package.json] |

### shadcn Components to Add

The following shadcn components are specified in the UI-SPEC but not yet in `src/components/ui/`. Install with `npx shadcn@latest add`:

| Component | Purpose | Install Command |
|-----------|---------|-----------------|
| `badge` | Severity (HIGH/MED/LOW) and status (AI_ANALYZED etc.) tags | `npx shadcn@latest add badge` |
| `avatar` | Reviewer assignee display in queue rows | `npx shadcn@latest add avatar` |
| `textarea` | Inline commentary editing (D-08), explanation field (D-10), flag notes (D-09) | `npx shadcn@latest add textarea` |
| `select` | Assignee dropdown (D-03), filter dropdowns | `npx shadcn@latest add select` |
| `skeleton` | Loading states for queue list and review pane | `npx shadcn@latest add skeleton` |
| `tooltip` | Keyboard shortcut hints on action buttons | `npx shadcn@latest add tooltip` |
| `scroll-area` | Independent scrolling in split pane left/right panes | `npx shadcn@latest add scroll-area` |

[VERIFIED: `@base-ui/react` has `scroll-area`, `select`, `tooltip`, `popover`, `avatar` as primitives — shadcn's base-nova style wraps these; `badge`, `skeleton`, `textarea` are pure CSS/HTML components with no primitive dependency]

**Installation:**
```bash
npm install nuqs
npx shadcn@latest add badge avatar textarea select skeleton tooltip scroll-area
```

---

## Architecture Patterns

### System Architecture Diagram

```
Reviewer Browser
       │
       ▼
GET /dashboard  (Server Component — queue list)
       │ Drizzle JOIN: articles + sections + paragraphs + claims + commentaries
       │ COUNT unreviewed → queue depth check → Alert banner if > threshold
       │ URL params (nuqs): status, severity, assignee → filter WHERE clause
       ▼
Queue List (Server Component render)
       │ Click row
       ▼
GET /dashboard/review/[claimId]  (Server Component — review pane shell)
       │ Drizzle: fetch claim + paragraph + commentary + suggestedSources + audit_log
       ▼
Split Pane (Client Component — interactive)
   LEFT PANE                          RIGHT PANE
   Wikipedia paragraph                AI Commentary
   Claim highlights (char offsets)    Source checklist (ratings)
   Text selection → Flag button       Approve / Edit / Reject buttons
   Flag mini form                     Activity feed (audit_log)
       │                                     │
       ▼                                     ▼
POST /api/reviews/[id]/approve        POST /api/reviews/[id]/reject
POST /api/reviews/[id]/edit           POST /api/reviews/[id]/flag
POST /api/reviews/[id]/assign         POST /api/reviews/[id]/verify-source
       │
       ▼
State Machine Validator  ←── src/features/reviews/state-machine.ts
       │ (pure function: validateTransition(from, to) → boolean)
       │
       ▼
db.transaction():
  UPDATE commentaries SET status = newStatus
  INSERT audit_log (actor, action, claimId, before, after, timestamp)
  PATCH suggestedSources JSONB (for source verify action)
       │
       ▼
computeAndPersistScore(articleId)  ←── src/features/analysis/score-engine.ts
       │
       ▼
revalidatePath('/dashboard')        ←── queue list refreshes
revalidatePath('/dashboard/review/[claimId]')
```

### Recommended Project Structure

```
src/
├── features/
│   └── reviews/                       # NEW — all Phase 4 logic
│       ├── state-machine.ts           # pure validateTransition(), VALID_TRANSITIONS map
│       ├── audit-log.ts               # insertAuditEntry() — always called inside transaction
│       ├── queue-queries.ts           # getQueue(), getQueueDepth() — server-only Drizzle queries
│       ├── review-queries.ts          # getClaim(), getCommentary(), getAuditFeed()
│       ├── actions/
│       │   ├── approve.ts             # approve action: validates sources, transitions state
│       │   ├── reject.ts              # reject action: AI_ANALYZED → HUMAN_REJECTED
│       │   ├── edit.ts                # edit action: updates draftText, logs before/after
│       │   ├── assign.ts              # assign action: sets assignedTo on commentary
│       │   ├── flag.ts                # flag action: creates new claim record
│       │   └── verify-source.ts       # patches suggestedSources JSONB rating
│       └── index.ts
├── app/
│   └── dashboard/
│       ├── page.tsx                   # REPLACE empty shell — queue list (Server Component)
│       ├── layout.tsx                 # NEW — topnav + alert banner wrapper (Server Component)
│       ├── review/
│       │   └── [claimId]/
│       │       └── page.tsx           # NEW — review pane page (Server Component shell)
│       └── activity/
│           └── page.tsx               # NEW — global activity feed (Server Component)
├── components/
│   ├── ui/                            # shadcn: add badge, avatar, textarea, select, skeleton, tooltip, scroll-area
│   └── dashboard/                     # NEW — dashboard-specific Client Components
│       ├── queue-item-row.tsx         # Client: row click, assignee Select stop-propagation
│       ├── queue-filters.tsx          # Client: nuqs filter state, URL sync
│       ├── split-pane.tsx             # Client: scroll areas, text selection, state
│       ├── source-checklist.tsx       # Client: rating state, progress counter
│       ├── commentary-editor.tsx      # Client: inline textarea edit mode
│       ├── flag-form.tsx              # Client: text selection → floating Flag button → mini form
│       ├── action-buttons.tsx         # Client: approve/reject/edit with keyboard shortcuts
│       ├── activity-feed.tsx          # Client: formatted audit log timeline
│       └── queue-depth-alert.tsx      # Client: dismissible banner (localStorage)
└── db/
    └── schema.ts                      # EXTEND: audit_log table, assignedTo on commentaries,
                                       #          explanation on claims, rating in suggestedSources JSONB
```

---

## Schema Gaps (Critical — Must Address First)

The current `src/db/schema.ts` is missing four elements required by Phase 4 decisions. These must be added in a Wave 0 migration before any feature code is written.

[VERIFIED: by reading src/db/schema.ts — none of these fields exist]

### Gap 1: `audit_log` table (D-11)

```typescript
// Source: Drizzle ORM docs — transactions pattern
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  reviewerId: text('reviewer_id')
    .notNull()
    .references(() => users.id),
  claimId: text('claim_id')
    .references(() => claims.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // 'approve' | 'reject' | 'edit' | 'assign' | 'flag' | 'explain' | 'verify-source'
  beforeState: jsonb('before_state'),   // snapshot before action
  afterState: jsonb('after_state'),     // snapshot after action
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // NO updatedAt — append-only, never updated
})
```

**Append-only enforcement:** Only INSERT is ever called on this table. No UPDATE, no DELETE. Route handlers must not expose any mutation endpoint for audit_log. [ASSUMED — no framework-enforced append-only in PostgreSQL/Drizzle; rely on application-level convention + code review]

### Gap 2: `assignedTo` on `commentaries` (D-03/MOD-06)

```typescript
// Add to existing commentaries table definition:
assignedTo: text('assigned_to').references(() => users.id),
```

### Gap 3: `explanation` on `claims` (D-10/MOD-11)

```typescript
// Add to existing claims table definition:
explanation: text('explanation'), // nullable — filled when reviewer attaches explanation
```

### Gap 4: `rating` field in `suggestedSources` JSONB (D-05)

The existing `suggestedSources` JSONB stores: `{url, title, relevanceNote, isVerified: false}`.

Extend to: `{url, title, relevanceNote, isVerified: boolean, rating: 1.0 | 0.5 | 0.0 | null}`.

This is a data model change only (JSONB is schema-less at the DB level); the TypeScript type in the feature layer must be updated to reflect the new shape. The score engine's `accuracyRatings` array (currently empty in Phase 3) is populated from these `rating` values in Phase 4.

---

## State Machine Enforcement Pattern

### Valid Transitions (D-14/MOD-09)

```typescript
// Source: schema.ts reviewStatusEnum + Phase 3 CONTEXT.md D-14
// src/features/reviews/state-machine.ts

export type ReviewStatus = 'PENDING' | 'AI_ANALYZED' | 'HUMAN_APPROVED' | 'HUMAN_REJECTED' | 'PUBLISHED'

export const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  PENDING: ['AI_ANALYZED'],
  AI_ANALYZED: ['HUMAN_APPROVED', 'HUMAN_REJECTED'],
  HUMAN_APPROVED: ['PUBLISHED'],
  HUMAN_REJECTED: ['PENDING'],
  PUBLISHED: [], // terminal — no outbound transitions
}

export function validateTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
```

**Critical enforcement point:** Every API route that changes `commentaries.status` MUST call `validateTransition()` before the DB write and return HTTP 422 if the transition is invalid. The client-side Approve button being disabled is UX only — it is not the security gate.

**PUBLISHED is unreachable without HUMAN_APPROVED (MOD-09):** The transition map enforces this structurally. `AI_ANALYZED → PUBLISHED` has no entry. Only `HUMAN_APPROVED → PUBLISHED` is valid.

### Atomic Transaction Pattern (D-11)

Every review action that changes state must write the audit log entry in the same transaction as the status update:

```typescript
// Source: Drizzle ORM transactions docs [CITED: context7/drizzle-team/drizzle-orm-docs]
await db.transaction(async (tx) => {
  // 1. Validate transition (outside tx is fine — pure function)
  if (!validateTransition(current.status, newStatus)) {
    throw new Error('INVALID_TRANSITION')
  }

  // 2. Update commentary status
  await tx
    .update(commentaries)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(commentaries.id, commentaryId))

  // 3. Insert audit log entry (append-only)
  await tx.insert(auditLog).values({
    reviewerId: session.user.id,
    claimId: commentary.claimId,
    action: actionType,
    beforeState: { status: current.status },
    afterState: { status: newStatus },
  })
})

// 4. Score recomputation AFTER transaction commits
await computeAndPersistScore(articleId)

// 5. Revalidate cached pages
revalidatePath('/dashboard')
revalidatePath(`/dashboard/review/${claimId}`)
```

---

## Architecture Patterns

### Pattern 1: Server Component for Queue Data Fetching

**What:** `/dashboard/page.tsx` is a Server Component. It runs a Drizzle JOIN to fetch queue items, counts unreviewed items for the alert, and passes data as props to Client Components.

**When to use:** Any read-only data display in the dashboard.

**Why:** Server Components eliminate client-side fetching complexity, run DB queries directly (no API round-trip), and produce smaller client bundles. The queue is read-only from the browser's perspective — mutations go through API routes, then `revalidatePath` triggers a Server Component re-render.

```typescript
// Source: Next.js docs — Server Components + Data Access Layer pattern
// [CITED: node_modules/next/dist/docs/01-app/02-guides/data-security.md]
import 'server-only'
import { db } from '@/db'
import { commentaries, claims, paragraphs, sections, articles } from '@/db/schema'

export async function getQueue(filters: QueueFilters) {
  return db
    .select({ /* fields */ })
    .from(commentaries)
    .innerJoin(claims, eq(commentaries.claimId, claims.id))
    .innerJoin(paragraphs, eq(claims.paragraphId, paragraphs.id))
    .innerJoin(sections, eq(paragraphs.sectionId, sections.id))
    .innerJoin(articles, eq(sections.articleId, articles.id))
    .where(/* filter conditions */)
    .orderBy(/* severity then createdAt */)
    .limit(25)
    .offset(page * 25)
}
```

### Pattern 2: nuqs for URL Filter State

**What:** The queue filter state (status, severity, assignee, page) is serialized to URL search params using `nuqs`. Server Components read the URL params, Client Components update them.

**When to use:** The queue filter bar (status dropdown, severity filter, assignee filter, pagination).

**Why:** URL state means deep links work. A reviewer can share a filtered queue view. Browser Back/Forward navigation works correctly. `nuqs` handles the serialization and React Suspense compatibility. [VERIFIED: nuqs@2.8.9 supports next>=14.2.0 per peer deps; compatible with Next.js 16.2.4]

```typescript
// Client Component (queue-filters.tsx)
'use client'
import { useQueryState } from 'nuqs'

export function QueueFilters() {
  const [status, setStatus] = useQueryState('status')
  const [severity, setSeverity] = useQueryState('severity')
  // ...
}

// Server Component (page.tsx) — reads from searchParams prop
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; page?: string }>
}) {
  const params = await searchParams
  const items = await getQueue({ status: params.status, severity: params.severity })
  // ...
}
```

### Pattern 3: Text Selection Flagging (MOD-10)

**What:** A Client Component listens for `mouseup` events in the left pane, checks `window.getSelection()`, and shows a floating "Flag" button at the selection endpoint.

**When to use:** Left pane of the split view review page.

**Key implementation detail:** The flag button must appear at the selection's bounding rect, not a fixed position. Use `selection.getRangeAt(0).getBoundingClientRect()` to position the floating button. On submit, the selected text + char offsets from the paragraph are sent to `POST /api/reviews/[claimId]/flag` to create a new claim record.

```typescript
'use client'
import { useEffect, useState } from 'react'

export function ParagraphPane({ content }: { content: string }) {
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null)

  useEffect(() => {
    function handleMouseUp() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) { setSelection(null); return }
      const range = sel.getRangeAt(0)
      setSelection({
        text: sel.toString(),
        rect: range.getBoundingClientRect(),
      })
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Render floating Flag button at selection.rect position
}
```

### Pattern 4: Source Verification Gate (D-04/MOD-04)

**What:** The Approve button is disabled in the Client Component until all `suggestedSources` have a non-null `rating`. The API also validates this before allowing the status transition.

**Two-layer enforcement:**
1. Client: `disabled={!allSourcesRated}` with `aria-disabled` and `aria-describedby` pointing to the "Verify all sources" tooltip.
2. API: before accepting `AI_ANALYZED → HUMAN_APPROVED`, query `suggestedSources` JSONB and reject with HTTP 422 if any source has `rating: null`.

```typescript
// API-side gate (approve route)
const sources = commentary.suggestedSources as Source[]
if (sources.some(s => s.rating === null || s.rating === undefined)) {
  return NextResponse.json(
    { error: 'All sources must be verified before approving' },
    { status: 422 }
  )
}
```

### Anti-Patterns to Avoid

- **Status update without audit log:** Never call `UPDATE commentaries SET status = ...` outside a transaction that also writes to `audit_log`. Split these and the audit log becomes unreliable.
- **Client-side state machine enforcement only:** The Approve button being disabled is UX. The API MUST independently validate the transition. A direct API call bypasses the button.
- **Optimistic update without rollback:** The UI-SPEC calls for optimistic updates on save. Implement with a `try/catch` that calls `revert()` to restore prior state on API error — don't leave the UI in an inconsistent state.
- **Reading `session.user.id` in Client Components for auth decisions:** Session is available server-side. Use it there. Only pass display fields (name, image) to Client Components.
- **PUBLISHED status set directly from client button:** The approve action sets `HUMAN_APPROVED`; a separate publish step (Phase 5) sets `PUBLISHED`. Phase 4 does not expose a "Publish" button — that transition is out of scope for this phase.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-serialized filter state | Custom URLSearchParams wrapper | `nuqs` | Handles React Suspense, type safety, Zod validation, SSR compatibility |
| Accessible dropdown/select | `<div>` with `onClick` | shadcn `Select` (via `@base-ui/react/select`) | Focus trapping, keyboard navigation, ARIA roles handled |
| Accessible tooltip | `title` attribute | shadcn `Tooltip` (via `@base-ui/react/tooltip`) | `title` doesn't work on keyboard focus; Radix/base-ui handles positioning and accessibility |
| Independent scrolling panes | `overflow-auto` div | shadcn `ScrollArea` | Cross-browser scroll behavior, keyboard accessibility, consistent styling |
| Text offset calculation | Manual `indexOf` | `Range.getBoundingClientRect()` + `Range.startOffset` | `indexOf` breaks with duplicate text; Range API tracks exact DOM position |
| Floating element positioning | Manual absolute positioning | CSS `position: fixed` + selection DOMRect | Manual positioning breaks on scroll; fixed + DOMRect is reliable |

---

## Common Pitfalls

### Pitfall 1: Forgetting `await searchParams` in Next.js 16

**What goes wrong:** In Next.js 16, `searchParams` passed to Server Component page functions is a `Promise<>`, not a plain object. Accessing it without `await` returns the Promise object, not the params.

**Why it happens:** Next.js 16 made `searchParams` async to support Partial Pre-rendering. This is a breaking change from Next.js 14/15 patterns common in training data.

**How to avoid:** Always `const params = await searchParams` before accessing any key.

**Verification:** Check `node_modules/next/dist/docs/` before writing any page function signature — the guides use the async form.

[VERIFIED: confirmed by reading Next.js docs in node_modules/next/dist/docs/01-app/]

### Pitfall 2: JSONB Mutation Pattern for `suggestedSources`

**What goes wrong:** Drizzle does not have a native PostgreSQL JSONB partial-update operator. Updating one source's `rating` field requires fetching the full array, mutating it in JavaScript, and writing it back. If two requests race (unlikely with 2–5 reviewers, but possible), one overwrites the other's rating.

**How to avoid:** In the `verify-source` API route, use a transaction: `SELECT FOR UPDATE` the commentary row, mutate the JSONB array in application code, then `UPDATE`. This serializes concurrent writes.

```typescript
await db.transaction(async (tx) => {
  const [row] = await tx
    .select({ suggestedSources: commentaries.suggestedSources })
    .from(commentaries)
    .where(eq(commentaries.id, commentaryId))
    .for('update')  // SELECT FOR UPDATE

  const sources = (row.suggestedSources as Source[]).map(s =>
    s.url === sourceUrl ? { ...s, rating, isVerified: true } : s
  )

  await tx.update(commentaries)
    .set({ suggestedSources: sources, updatedAt: new Date() })
    .where(eq(commentaries.id, commentaryId))

  await tx.insert(auditLog).values({ /* ... */ })
})
```

[VERIFIED: Drizzle ORM docs confirm `.for('update')` works on PostgreSQL selects — transactions doc]

### Pitfall 3: Text Selection Lost on Button Click

**What goes wrong:** When the floating Flag button renders and the user clicks it, the `mousedown` event on the button dismisses the browser's text selection before the `click` handler fires. The selection is empty by the time the handler reads it.

**How to avoid:** Capture the selection in state (`useState`) on `mouseup`, before the button click. Use the stored state value, not a fresh `window.getSelection()` read, in the click handler.

**Implementation note:** The `ParagraphPane` Client Component saves `{ text, startOffset, endOffset }` in state on `mouseup`. The Flag button click handler reads from state, not from the live selection.

### Pitfall 4: `session.user.id` Missing from JWT Token

**What goes wrong:** The `auth()` helper returns `session.user` but the `id` field may be undefined if the JWT callback doesn't populate it. The existing `auth.ts` adds `token.id = user.id` in the `jwt` callback — but this only runs on sign-in. If a reviewer has a pre-existing session from Phase 1, the token may not have `id` until they re-authenticate.

**How to avoid:** In all API route handlers, validate that `session.user.id` is present (truthy) before using it as `reviewerId`. If absent, return 401.

[VERIFIED: reviewed `src/auth.ts` — `session.user.id = token.id as string` in session callback; `token.id` set only when `user` is passed to `jwt` callback (i.e., on sign-in)]

### Pitfall 5: `revalidatePath` Behavior Difference: Server Functions vs Route Handlers

**What goes wrong:** When `revalidatePath` is called from a Route Handler (API route), it marks the path for revalidation on next visit — it does NOT cause an immediate re-render. The queue list will show stale data until the reviewer navigates away and back.

**How to avoid:** This is acceptable behavior for this phase (2–5 reviewers; race conditions are rare). Document it as known behavior. If immediate refresh is needed, the Client Component can call `router.refresh()` after a successful API response.

[VERIFIED: Next.js docs in node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md — explicit statement about Route Handler behavior]

### Pitfall 6: Severity Sort Order in SQL

**What goes wrong:** Sorting by `claims.severity` alphabetically gives `HIGH, LOW, MED` (alphabetical). The correct order is `HIGH, MED, LOW`.

**How to avoid:** Use a `CASE` expression in the Drizzle query, or define severity as a pgEnum with the correct order and rely on enum sort order.

```typescript
import { sql } from 'drizzle-orm'

// Custom sort expression for severity
const severityOrder = sql`CASE ${claims.severity}
  WHEN 'HIGH' THEN 1
  WHEN 'MED' THEN 2
  WHEN 'LOW' THEN 3
  ELSE 4
END`

.orderBy(severityOrder, desc(commentaries.createdAt))
```

[VERIFIED: claims.severity is `text()` type in schema.ts (not enum), so enum sort order is not available — CASE expression required]

---

## Code Examples

### Queue Page Drizzle Query

```typescript
// Source: Drizzle ORM docs — joins pattern [CITED: context7/drizzle-team/drizzle-orm-docs]
// src/features/reviews/queue-queries.ts
import 'server-only'
import { db } from '@/db'
import { commentaries, claims, paragraphs, sections, articles, users } from '@/db/schema'
import { eq, inArray, sql, desc } from 'drizzle-orm'

const severityOrder = sql`CASE ${claims.severity}
  WHEN 'HIGH' THEN 1 WHEN 'MED' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END`

export async function getQueue(filters: {
  status?: string
  severity?: string
  assignee?: string
  page?: number
}) {
  const PAGE_SIZE = 25
  const page = filters.page ?? 0

  return db
    .select({
      commentaryId: commentaries.id,
      status: commentaries.status,
      assignedTo: commentaries.assignedTo,
      claimId: claims.id,
      claimText: claims.text,
      severity: claims.severity,
      claimCount: sql<number>`count(${claims.id}) over (partition by ${paragraphs.id})`,
      articleTitle: articles.title,
      sectionTitle: sections.title,
      createdAt: commentaries.createdAt,
    })
    .from(commentaries)
    .innerJoin(claims, eq(commentaries.claimId, claims.id))
    .innerJoin(paragraphs, eq(claims.paragraphId, paragraphs.id))
    .innerJoin(sections, eq(paragraphs.sectionId, sections.id))
    .innerJoin(articles, eq(sections.articleId, articles.id))
    .where(/* apply filters */)
    .orderBy(severityOrder, desc(commentaries.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE)
}
```

### State Transition API Route Pattern

```typescript
// Source: articles/route.ts pattern (existing) + Next.js Route Handler docs
// src/app/api/reviews/[id]/approve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { commentaries, auditLog } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { validateTransition } from '@/features/reviews/state-machine'
import { computeAndPersistScore } from '@/features/analysis/score-engine'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: commentaryId } = await params

  const [commentary] = await db.select().from(commentaries).where(eq(commentaries.id, commentaryId))
  if (!commentary) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Source verification gate (MOD-04)
  const sources = (commentary.suggestedSources ?? []) as Source[]
  if (sources.some(s => s.rating == null)) {
    return NextResponse.json({ error: 'All sources must be verified before approving' }, { status: 422 })
  }

  // State machine gate (MOD-09)
  if (!validateTransition(commentary.status, 'HUMAN_APPROVED')) {
    return NextResponse.json({ error: 'Invalid state transition' }, { status: 422 })
  }

  await db.transaction(async (tx) => {
    await tx.update(commentaries)
      .set({ status: 'HUMAN_APPROVED', updatedAt: new Date() })
      .where(eq(commentaries.id, commentaryId))

    await tx.insert(auditLog).values({
      reviewerId: session.user.id,
      claimId: commentary.claimId,
      action: 'approve',
      beforeState: { status: commentary.status },
      afterState: { status: 'HUMAN_APPROVED' },
    })
  })

  await computeAndPersistScore(articleId)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/review/${commentary.claimId}`)

  return NextResponse.json({ ok: true })
}
```

---

## Runtime State Inventory

Step 2.6 SKIPPED — this is a greenfield feature phase, not a rename/refactor/migration phase.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime | ✓ | >=22.12.0 (engines field) | — |
| PostgreSQL | Drizzle ORM | ✓ (connection string expected) | 16.x [ASSUMED] | — |
| nuqs | Queue filter URL state | ✗ (not installed) | 2.8.9 available | Skip URL persistence; use React state (degrades deep-links) |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- `nuqs` — not installed; install required. Fallback (React state only) degrades filter shareability but is functional.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (exists) |
| Setup file | `tests/setup.ts` (mocks `server-only`) |
| Quick run command | `vitest run tests/features/reviews/` |
| Full suite command | `vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOD-03 | `validateTransition()` rejects invalid transitions (e.g., PENDING → PUBLISHED) | unit | `vitest run tests/features/reviews/state-machine.test.ts` | ❌ Wave 0 |
| MOD-04 | Approve API returns 422 when any source has `rating: null` | unit | `vitest run tests/features/reviews/approve.test.ts` | ❌ Wave 0 |
| MOD-08 | Each review action inserts one audit log row with correct before/after state | integration | `vitest run tests/features/reviews/audit-log.test.ts` | ❌ Wave 0 |
| MOD-09 | `PUBLISHED` is unreachable without `HUMAN_APPROVED` — all direct paths blocked | unit | `vitest run tests/features/reviews/state-machine.test.ts` | ❌ Wave 0 |
| MOD-06 | Assign action sets `assignedTo` field; audit log records the change | integration | `vitest run tests/features/reviews/assign.test.ts` | ❌ Wave 0 |
| MOD-07 | Queue depth count returns correct count; threshold comparison works | unit | `vitest run tests/features/reviews/queue-queries.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `vitest run tests/features/reviews/state-machine.test.ts` (state machine is the invariant that must stay green)
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/features/reviews/state-machine.test.ts` — covers MOD-03, MOD-09
- [ ] `tests/features/reviews/approve.test.ts` — covers MOD-04
- [ ] `tests/features/reviews/audit-log.test.ts` — covers MOD-08
- [ ] `tests/features/reviews/assign.test.ts` — covers MOD-06
- [ ] `tests/features/reviews/queue-queries.test.ts` — covers MOD-07

*(Existing `tests/setup.ts` already mocks `server-only` — no new setup needed)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | next-auth v5 `auth()` — all dashboard routes and API routes check session |
| V3 Session Management | yes | JWT session; `session.user.id` validated as truthy in every API route |
| V4 Access Control | yes | Role check: `users.role === 'reviewer'` — only reviewers can call review API routes |
| V5 Input Validation | yes | Zod schemas on all API request bodies; `claimId` and `commentaryId` validated as strings |
| V6 Cryptography | no | No new cryptographic operations in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reviewer approves content they didn't read | Tampering | Source verification gate (MOD-04) + audit log (MOD-08) |
| Direct API call bypassing UI gates | Tampering | Server-side state machine validation on every route (MOD-09) |
| Audit log tampering (DELETE/UPDATE) | Tampering | No DELETE/UPDATE endpoints for `audit_log` table; append-only in code |
| IDOR: reviewer edits another user's assignment | Elevation of Privilege | `commentaryId` lookup confirms existence before action; role check prevents non-reviewers |
| Concurrent JSONB source rating race | Tampering | `SELECT FOR UPDATE` in transaction for `verify-source` route |

### Role Enforcement

The existing `users.role` column defaults to `'reviewer'`. All dashboard API routes must validate:

```typescript
// In every dashboard API route
const session = await auth()
if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// Optional for v1 (all authed users are reviewers): 
// if (session.user.role !== 'reviewer') return 403
```

[VERIFIED: `users.role` column exists in `src/db/schema.ts`; JWT callback does not include `role` in session — if role-based access is needed, the JWT callback must be extended to include it]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@radix-ui/react-*` directly | `@base-ui/react` via shadcn base-nova style | 2025 (shadcn v4) | Research previously recommended `@radix-ui` — this project uses `@base-ui/react` instead; don't install Radix packages directly |
| `searchParams` as plain object | `searchParams` as `Promise<>` | Next.js 16 | Must `await searchParams` before accessing keys |
| React Query for client data | Server Components + `revalidatePath` | Next.js 13+ / React 18+ | No TanStack Query needed; Server Components handle reads; API routes handle writes |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PostgreSQL is running and DATABASE_URL is configured in the dev environment | Environment Availability | All DB integration tests and local dev fail |
| A2 | Append-only audit_log is enforced by application convention (no framework mechanism) | Schema Gaps | A future developer adds an UPDATE/DELETE endpoint — audit log integrity lost |
| A3 | `session.user.role` is not currently in the JWT token (JWT callback only includes `id`) | Security Domain | Role-based access control would require JWT callback extension if needed |
| A4 | `claims.severity` is 'HIGH', 'MED', 'LOW' as text values (not 'MEDIUM') | Code Examples | CASE sort expression uses wrong string; ordering is wrong |

---

## Open Questions (RESOLVED)

1. **Score accuracy rating integration (D-05)** — RESOLVED
   - What we know: `computeAndPersistScore()` takes `accuracyRatings: number[]` but currently passes an empty array (Phase 3 stub). The traffic light values (1.0, 0.5, 0.0) from source ratings feed this array.
   - What's unclear: The score engine computes accuracy as `mean(accuracyRatings) * 100`. This means a commentary with one "Does not support" source (0.0) tanks the accuracy to 0. Is this the intended behavior, or should the rating be per-commentary (average across its sources)?
   - Resolution: When the approve action calls `computeAndPersistScore()`, pass the commentary's source ratings as the `accuracyRatings` array for that article's claims. The score engine already handles the math. Per-commentary average is the correct granularity. Implemented in Plan 04-02 (approve action).

2. **Queue item granularity (claim vs commentary)** — RESOLVED
   - What we know: Each queue item is a commentary (1:1 with a claim). Multiple claims exist per paragraph.
   - What's unclear: The queue is filtered by severity (claim.severity), but the reviewer navigates to `/dashboard/review/[claimId]`. Should the queue show one row per claim, or one row per paragraph (with multiple claims)?
   - Resolution: One row per claim, per UI-SPEC and D-02. The claim count in the row (`N claims`) refers to other claims in the same paragraph for context. Implemented in Plan 04-03 (queue page).

3. **`PUBLISHED` transition scope** — RESOLVED
   - What we know: Phase 4 stops at `HUMAN_APPROVED`. `PUBLISHED` is the terminal state.
   - What's unclear: Does Phase 4 expose any path to `PUBLISHED`, or is that Phase 5?
   - Resolution: Phase 4 does NOT set `PUBLISHED`. The approve action sets `HUMAN_APPROVED`. A separate publish mechanism (Phase 5) moves to `PUBLISHED`. The state machine allows the transition but Phase 4 does not expose it. Implemented in Plan 04-02 (state machine enforcement).

---

## Sources

### Primary (HIGH confidence)
- `src/db/schema.ts` — verified schema structure, confirmed missing audit_log/assignedTo/explanation
- `src/features/analysis/score-engine.ts` — verified `computeAndPersistScore(articleId)` signature and `accuracyRatings` parameter
- `src/auth.ts` — verified JWT strategy and session.user.id population
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` — Data Access Layer pattern, Server Component auth
- `node_modules/next/dist/docs/01-app/02-guides/forms.md` — Server Action auth pattern
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` — revalidatePath behavior in Route Handlers
- `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` — Client Component state patterns
- `package.json` — all installed package versions verified
- `components.json` — base-nova style, @base-ui/react confirmed
- `node_modules/@base-ui/react/` — scroll-area, select, tooltip, popover, avatar confirmed present
- Context7 `/drizzle-team/drizzle-orm-docs` — transactions, `.for('update')`, JSONB patterns

### Secondary (MEDIUM confidence)
- Context7 `/shadcn-ui/ui` — component installation commands, base-nova registry patterns
- `npm view nuqs` — version 2.8.9, peer deps confirmed Next.js >=14.2.0 compatible

### Tertiary (LOW confidence)
- None — all critical claims verified against codebase or official docs

---

## Metadata

**Confidence breakdown:**
- Schema gaps: HIGH — verified by reading schema.ts directly
- State machine pattern: HIGH — matches existing enum and Phase 3 CONTEXT.md D-14
- Standard stack: HIGH — verified against package.json, node_modules
- UI component strategy: HIGH — base-nova/@base-ui/react confirmed in components.json
- Score accuracy integration: MEDIUM — A1 in Assumptions Log (open question)
- Audit log append-only enforcement: MEDIUM — relies on convention, not DB constraint

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable stack, no fast-moving dependencies)
