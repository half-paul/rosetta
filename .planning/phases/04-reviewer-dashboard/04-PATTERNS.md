# Phase 4: Reviewer Dashboard - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 26 new/modified files
**Analogs found:** 22 / 26

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/db/schema.ts` | model | CRUD | `src/db/schema.ts` (extend) | exact |
| `src/features/reviews/state-machine.ts` | utility | transform | `src/features/analysis/schemas.ts` | role-match |
| `src/features/reviews/audit-log.ts` | service | CRUD | `src/features/analysis/score-engine.ts` | role-match |
| `src/features/reviews/queue-queries.ts` | service | CRUD | `src/features/analysis/score-engine.ts` | role-match |
| `src/features/reviews/review-queries.ts` | service | CRUD | `src/features/analysis/score-engine.ts` | role-match |
| `src/features/reviews/actions/approve.ts` | service | request-response | `src/app/api/articles/route.ts` | role-match |
| `src/features/reviews/actions/reject.ts` | service | request-response | `src/app/api/articles/route.ts` | role-match |
| `src/features/reviews/actions/edit.ts` | service | request-response | `src/app/api/articles/route.ts` | role-match |
| `src/features/reviews/actions/assign.ts` | service | request-response | `src/app/api/articles/route.ts` | role-match |
| `src/features/reviews/actions/flag.ts` | service | request-response | `src/app/api/articles/route.ts` | role-match |
| `src/features/reviews/actions/verify-source.ts` | service | request-response | `src/app/api/articles/route.ts` | role-match |
| `src/features/reviews/index.ts` | config | — | `src/features/analysis/index.ts` | exact |
| `src/app/api/reviews/[id]/approve/route.ts` | route | request-response | `src/app/api/articles/route.ts` | exact |
| `src/app/api/reviews/[id]/reject/route.ts` | route | request-response | `src/app/api/articles/route.ts` | exact |
| `src/app/api/reviews/[id]/edit/route.ts` | route | request-response | `src/app/api/articles/route.ts` | exact |
| `src/app/api/reviews/[id]/assign/route.ts` | route | request-response | `src/app/api/articles/route.ts` | exact |
| `src/app/api/reviews/[id]/flag/route.ts` | route | request-response | `src/app/api/articles/route.ts` | exact |
| `src/app/api/reviews/[id]/verify-source/route.ts` | route | request-response | `src/app/api/articles/route.ts` | exact |
| `src/app/dashboard/page.tsx` | component | CRUD | `src/app/dashboard/page.tsx` (replace) | exact |
| `src/app/dashboard/layout.tsx` | component | request-response | `src/app/layout.tsx` | role-match |
| `src/app/dashboard/review/[claimId]/page.tsx` | component | CRUD | `src/app/dashboard/page.tsx` | role-match |
| `src/app/dashboard/activity/page.tsx` | component | CRUD | `src/app/dashboard/page.tsx` | role-match |
| `src/components/dashboard/queue-item-row.tsx` | component | event-driven | `src/app/login/page.tsx` | partial |
| `src/components/dashboard/queue-filters.tsx` | component | event-driven | `src/app/login/page.tsx` | partial |
| `src/components/dashboard/split-pane.tsx` | component | event-driven | `src/app/login/page.tsx` | partial |
| `src/components/dashboard/source-checklist.tsx` | component | event-driven | `src/app/login/page.tsx` | partial |
| `src/components/dashboard/commentary-editor.tsx` | component | event-driven | `src/app/login/page.tsx` | partial |
| `src/components/dashboard/flag-form.tsx` | component | event-driven | no analog | no-analog |
| `src/components/dashboard/action-buttons.tsx` | component | event-driven | `src/components/ui/button.tsx` | partial |
| `src/components/dashboard/activity-feed.tsx` | component | CRUD | `src/app/dashboard/page.tsx` | partial |
| `src/components/dashboard/queue-depth-alert.tsx` | component | event-driven | `src/components/ui/alert.tsx` | partial |
| `tests/features/reviews/state-machine.test.ts` | test | — | `tests/features/analysis/score-engine.test.ts` | exact |
| `tests/features/reviews/approve.test.ts` | test | — | `tests/features/analysis/analysis-worker.test.ts` | exact |
| `tests/features/reviews/audit-log.test.ts` | test | — | `tests/features/analysis/analysis-worker.test.ts` | exact |
| `tests/features/reviews/assign.test.ts` | test | — | `tests/features/analysis/analysis-worker.test.ts` | exact |
| `tests/features/reviews/queue-queries.test.ts` | test | — | `tests/features/analysis/score-engine.test.ts` | role-match |

---

## Pattern Assignments

### `src/db/schema.ts` (model, CRUD — extend existing)

**Analog:** `src/db/schema.ts` (the file itself, read existing conventions)

**Existing table definition pattern** (lines 1-12, 130-156):
```typescript
import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
  real,
  jsonb,
} from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

// PK convention: CUID2 via createId()
id: text('id').primaryKey().$defaultFn(() => createId()),

// FK convention: .references(() => parentTable.id, { onDelete: 'cascade' })
claimId: text('claim_id')
  .notNull()
  .references(() => claims.id, { onDelete: 'cascade' }),

// Timestamp convention: withTimezone: true, .notNull().defaultNow()
createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

// Nullable column convention: no .notNull(), no .default()
explanation: text('explanation'), // nullable
```

**Four additions required:**

1. `auditLog` table — new append-only table (NO updatedAt, NO deletedAt):
```typescript
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  reviewerId: text('reviewer_id')
    .notNull()
    .references(() => users.id),
  claimId: text('claim_id')
    .references(() => claims.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // NO updatedAt — append-only
})
```

2. `assignedTo` on `commentaries` — nullable FK column (matches existing FK pattern):
```typescript
assignedTo: text('assigned_to').references(() => users.id),
```

3. `explanation` on `claims` — nullable text (matches existing nullable pattern):
```typescript
explanation: text('explanation'),
```

4. `suggestedSources` JSONB shape — TypeScript type change only (no migration needed):
   Old shape: `{ url, title, relevanceNote, isVerified: boolean }`
   New shape: `{ url, title, relevanceNote, isVerified: boolean, rating: 1.0 | 0.5 | 0.0 | null }`

---

### `src/features/reviews/state-machine.ts` (utility, transform)

**Analog:** `src/features/analysis/schemas.ts` — pure TypeScript module with exported types and constants, no I/O.

**Module structure pattern** (schemas.ts lines 1-31):
```typescript
import { z } from 'zod'

// Exported const + type pattern
export const SomeSchema = z.object({ ... })
export type SomeOutput = z.infer<typeof SomeSchema>
```

**State machine module** — pure function, no imports from DB or Next.js:
```typescript
// src/features/reviews/state-machine.ts
// NO 'server-only' — pure function, safe to import in tests without mocking

export type ReviewStatus =
  | 'PENDING'
  | 'AI_ANALYZED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'PUBLISHED'

export const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  PENDING: ['AI_ANALYZED'],
  AI_ANALYZED: ['HUMAN_APPROVED', 'HUMAN_REJECTED'],
  HUMAN_APPROVED: ['PUBLISHED'],
  HUMAN_REJECTED: ['PENDING'],
  PUBLISHED: [],
}

export function validateTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
```

---

### `src/features/reviews/audit-log.ts` (service, CRUD)

**Analog:** `src/features/analysis/score-engine.ts` — server-only DB write helper.

**Server-only + DB import pattern** (score-engine.ts lines 1-4):
```typescript
import 'server-only'
import { db } from '@/db'
import { scores, claims, paragraphs, sections, commentaries } from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'
```

**Transactional insert helper** — accepts a `tx` (transaction) parameter, never opens its own transaction:
```typescript
import 'server-only'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import { auditLog } from '@/db/schema'

export interface AuditEntry {
  reviewerId: string
  claimId: string | null
  action: 'approve' | 'reject' | 'edit' | 'assign' | 'flag' | 'explain' | 'verify-source'
  beforeState?: Record<string, unknown>
  afterState?: Record<string, unknown>
}

// Always called inside an existing transaction (tx), never standalone
export async function insertAuditEntry(
  tx: PgTransaction<any, any, any>,
  entry: AuditEntry
): Promise<void> {
  await tx.insert(auditLog).values(entry)
}
```

---

### `src/features/reviews/queue-queries.ts` (service, CRUD)

**Analog:** `src/features/analysis/score-engine.ts` — server-only DB query module.

**Multi-table JOIN query pattern** (analysis-worker.ts lines 26-37):
```typescript
import 'server-only'
import { db } from '@/db'
import { paragraphs, sections, claims, commentaries } from '@/db/schema'
import { eq } from 'drizzle-orm'

const articleParagraphs = await db
  .select({ id: paragraphs.id, content: paragraphs.content })
  .from(paragraphs)
  .innerJoin(sections, eq(paragraphs.sectionId, sections.id))
  .where(eq(sections.articleId, data.articleId))
```

**Custom sort expression pattern** — use `sql` tagged template for non-alphabetic enum sort:
```typescript
import { sql, desc } from 'drizzle-orm'

const severityOrder = sql`CASE ${claims.severity}
  WHEN 'HIGH' THEN 1
  WHEN 'MED' THEN 2
  WHEN 'LOW' THEN 3
  ELSE 4
END`

.orderBy(severityOrder, desc(commentaries.createdAt))
```

**Pagination pattern:**
```typescript
const PAGE_SIZE = 25
.limit(PAGE_SIZE)
.offset((filters.page ?? 0) * PAGE_SIZE)
```

---

### `src/features/reviews/review-queries.ts` (service, CRUD)

**Analog:** `src/features/analysis/score-engine.ts` — server-only query module with multiple exports.

**Pattern:** Same `import 'server-only'` + Drizzle select structure. Exports named async functions (`getClaim`, `getCommentary`, `getAuditFeed`). Mirror the single-fetch pattern from score-engine:

```typescript
import 'server-only'
import { db } from '@/db'
import { claims, commentaries, paragraphs, auditLog, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function getCommentaryWithClaim(claimId: string) {
  const [row] = await db
    .select({ /* fields */ })
    .from(commentaries)
    .innerJoin(claims, eq(commentaries.claimId, claims.id))
    .innerJoin(paragraphs, eq(claims.paragraphId, paragraphs.id))
    .where(eq(claims.id, claimId))
  return row ?? null
}

export async function getAuditFeed(claimId: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.claimId, claimId))
    .orderBy(desc(auditLog.createdAt))
}
```

---

### `src/features/reviews/actions/approve.ts` (service, request-response)

**Analog:** `src/app/api/articles/route.ts` — auth check, Zod validation, DB transaction, error handling.

**This is a server action / helper called by the route handler** — same pattern as analysis-worker.ts being called by the pg-boss job handler. The route handler does auth; the action does business logic + DB write.

**Atomic transaction pattern** (from RESEARCH.md — Drizzle transaction docs):
```typescript
import 'server-only'
import { db } from '@/db'
import { commentaries, auditLog } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { validateTransition } from '@/features/reviews/state-machine'
import { insertAuditEntry } from '@/features/reviews/audit-log'
import { computeAndPersistScore } from '@/features/analysis/score-engine'
import { revalidatePath } from 'next/cache'

export async function approveCommentary(
  commentaryId: string,
  reviewerId: string,
  articleId: string
): Promise<{ ok: true } | { error: string; status: number }> {
  const [commentary] = await db
    .select()
    .from(commentaries)
    .where(eq(commentaries.id, commentaryId))
  if (!commentary) return { error: 'Not found', status: 404 }

  // Source verification gate (MOD-04)
  const sources = (commentary.suggestedSources ?? []) as Source[]
  if (sources.some(s => s.rating == null)) {
    return { error: 'All sources must be verified before approving', status: 422 }
  }

  // State machine gate (MOD-09)
  if (!validateTransition(commentary.status, 'HUMAN_APPROVED')) {
    return { error: 'Invalid state transition', status: 422 }
  }

  await db.transaction(async (tx) => {
    await tx.update(commentaries)
      .set({ status: 'HUMAN_APPROVED', updatedAt: new Date() })
      .where(eq(commentaries.id, commentaryId))

    await insertAuditEntry(tx, {
      reviewerId,
      claimId: commentary.claimId,
      action: 'approve',
      beforeState: { status: commentary.status },
      afterState: { status: 'HUMAN_APPROVED' },
    })
  })

  await computeAndPersistScore(articleId)
  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/review/${commentary.claimId}`)

  return { ok: true }
}
```

---

### `src/app/api/reviews/[id]/approve/route.ts` (route, request-response)

**Analog:** `src/app/api/articles/route.ts` — the canonical Route Handler in this codebase.

**Route handler skeleton** (articles/route.ts lines 30-64):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
// ...

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Auth check — always first
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Params — always await (Next.js 16 breaking change)
    const { id: commentaryId } = await params

    // Zod body validation if body needed
    const body = await req.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    // Delegate business logic to feature action
    const result = await approveCommentary(commentaryId, session.user.id, parsed.data.articleId)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // Generic error — never expose stack trace
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Auth check pattern** (articles/route.ts lines 33-35):
```typescript
const session = await auth()
if (!session?.user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Zod validation pattern** (articles/route.ts lines 13-28, 38-43):
```typescript
const bodySchema = z.object({
  articleId: z.string().min(1),
})

const parsed = bodySchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
}
```

**Error catch pattern** (articles/route.ts lines 59-63):
```typescript
} catch (err) {
  console.error(err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

All six review API routes (`approve`, `reject`, `edit`, `assign`, `flag`, `verify-source`) use this identical skeleton. Only the body schema and delegated action function differ.

---

### `src/features/reviews/actions/verify-source.ts` (service, CRUD)

**Analog:** `src/app/api/articles/route.ts` + Drizzle transaction pattern.

**SELECT FOR UPDATE pattern for JSONB race prevention** (RESEARCH.md Pitfall 2):
```typescript
await db.transaction(async (tx) => {
  const [row] = await tx
    .select({ suggestedSources: commentaries.suggestedSources })
    .from(commentaries)
    .where(eq(commentaries.id, commentaryId))
    .for('update') // SELECT FOR UPDATE — serializes concurrent writes

  const sources = (row.suggestedSources as Source[]).map(s =>
    s.url === sourceUrl ? { ...s, rating, isVerified: true } : s
  )

  await tx.update(commentaries)
    .set({ suggestedSources: sources, updatedAt: new Date() })
    .where(eq(commentaries.id, commentaryId))

  await insertAuditEntry(tx, {
    reviewerId,
    claimId: row.claimId,
    action: 'verify-source',
    beforeState: { sourceUrl, rating: null },
    afterState: { sourceUrl, rating },
  })
})
```

---

### `src/features/reviews/index.ts` (config)

**Analog:** `src/features/analysis/index.ts` (lines 1-9) — barrel export with `import 'server-only'` guard.

```typescript
import 'server-only'
export { validateTransition, VALID_TRANSITIONS } from './state-machine'
export type { ReviewStatus } from './state-machine'
export { insertAuditEntry } from './audit-log'
export { getQueue, getQueueDepth } from './queue-queries'
export { getCommentaryWithClaim, getAuditFeed } from './review-queries'
```

---

### `src/app/dashboard/page.tsx` (component, CRUD — replace existing)

**Analog:** `src/app/dashboard/page.tsx` (existing — replace body, keep auth shell).

**Auth shell pattern** (existing dashboard/page.tsx lines 1-5):
```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // ...
}
```

**searchParams pattern** — Next.js 16 requires `await` (RESEARCH.md Pitfall 1):
```typescript
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string; assignee?: string; page?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const params = await searchParams  // MUST await — Next.js 16 breaking change
  const items = await getQueue({ ...params })
  const depth = await getQueueDepth()
  // render queue list + alert banner
}
```

**Queue depth alert** — render `Alert` from `@/components/ui/alert` when `depth > QUEUE_DEPTH_THRESHOLD`:
```typescript
const QUEUE_DEPTH_THRESHOLD = 50

{depth > QUEUE_DEPTH_THRESHOLD && (
  <Alert variant="destructive">
    <AlertTitle>Review backlog alert</AlertTitle>
    <AlertDescription>
      {depth} items are awaiting review.
    </AlertDescription>
  </Alert>
)}
```

---

### `src/app/dashboard/layout.tsx` (component, request-response)

**Analog:** `src/app/layout.tsx` (root layout) + existing topnav in `dashboard/page.tsx`.

**Layout pattern** (root layout, src/app/layout.tsx lines 21-28):
```typescript
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <nav className="h-14 border-b bg-background px-6 flex items-center justify-between">
        {/* topnav content */}
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  )
}
```

This layout extracts the topnav currently inlined in `dashboard/page.tsx` (lines 11-21) into a shared layout so all dashboard sub-pages inherit it. The alert banner moves to `page.tsx` (data-dependent, not layout-level).

---

### `src/app/dashboard/review/[claimId]/page.tsx` (component, CRUD)

**Analog:** `src/app/dashboard/page.tsx` — Server Component with auth + data fetch + Client Component delegation.

**Dynamic route + auth + data fetch pattern:**
```typescript
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { getCommentaryWithClaim, getAuditFeed } from '@/features/reviews'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { claimId } = await params  // MUST await — Next.js 16
  const data = await getCommentaryWithClaim(claimId)
  if (!data) redirect('/dashboard')

  const auditFeed = await getAuditFeed(claimId)

  // Delegate interactivity to Client Component
  return <SplitPane data={data} auditFeed={auditFeed} reviewerId={session.user.id} />
}
```

---

### `src/app/dashboard/activity/page.tsx` (component, CRUD)

**Analog:** `src/app/dashboard/page.tsx` — Server Component data list page.

Same auth + searchParams + data fetch pattern as queue page, but queries `audit_log` globally with filters (article, reviewer, action type, date range).

---

### Client Components: `src/components/dashboard/*.tsx`

**Analog:** `src/app/login/page.tsx` — the only existing Client Component in the codebase.

**Client Component declaration + import pattern** (login/page.tsx lines 1-13):
```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
```

**Key rule:** `'use client'` must be the first line. Import from `@/components/ui/*` (path alias). Never import `server-only` modules or `auth()` in Client Components.

**Button usage pattern** (button.tsx lines 43-56):
```typescript
// Variants: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
// Sizes: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"
<Button variant="destructive" size="sm" disabled={!allSourcesRated}>
  Approve
</Button>
```

**Card usage pattern** (card.tsx lines 5-20):
```typescript
// size prop: "default" | "sm"
<Card size="sm">
  <CardHeader>
    <CardTitle>Source title</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

---

### `src/components/dashboard/queue-item-row.tsx` (component, event-driven)

**Analog:** `src/app/login/page.tsx` (Client Component structure).

**Click handler + stop propagation pattern** — assignee Select inside a clickable row:
```typescript
'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'

export function QueueItemRow({ item }: { item: QueueItem }) {
  const router = useRouter()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/dashboard/review/${item.claimId}`)}
      className="cursor-pointer hover:bg-muted/50 px-4 py-2 border-b"
    >
      {/* Assignee dropdown must stop propagation to prevent row navigation */}
      <div onClick={(e) => e.stopPropagation()}>
        <AssigneeSelect commentaryId={item.commentaryId} currentAssignee={item.assignedTo} />
      </div>
    </div>
  )
}
```

---

### `src/components/dashboard/queue-filters.tsx` (component, event-driven)

**Analog:** `src/app/login/page.tsx` (Client Component). Uses `nuqs` (new dependency — not yet installed).

**nuqs URL state pattern** (RESEARCH.md Pattern 2):
```typescript
'use client'

import { useQueryState } from 'nuqs'

export function QueueFilters() {
  const [status, setStatus] = useQueryState('status')
  const [severity, setSeverity] = useQueryState('severity')
  const [assignee, setAssignee] = useQueryState('assignee')

  // shadcn Select components for each filter
}
```

---

### `src/components/dashboard/split-pane.tsx` (component, event-driven)

**Analog:** `src/app/login/page.tsx` (Client Component with useState/useEffect).

**useState pattern** (login/page.tsx lines 17-18):
```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'

// Multiple state slices for complex interactive component
const [editMode, setEditMode] = useState(false)
const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null)
const [draftText, setDraftText] = useState(commentary.draftText)
```

**Text selection pattern** (RESEARCH.md Pattern 3):
```typescript
useEffect(() => {
  function handleMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) { setSelection(null); return }
    const range = sel.getRangeAt(0)
    setSelection({ text: sel.toString(), rect: range.getBoundingClientRect() })
  }
  document.addEventListener('mouseup', handleMouseUp)
  return () => document.removeEventListener('mouseup', handleMouseUp)
}, [])
```

**Floating button positioning** — use `position: fixed` + DOMRect (RESEARCH.md — Don't Hand-Roll):
```typescript
{selection && (
  <button
    style={{
      position: 'fixed',
      top: selection.rect.bottom + window.scrollY,
      left: selection.rect.left + window.scrollX,
    }}
    onClick={handleFlagClick}
  >
    Flag
  </button>
)}
```

---

### `src/components/dashboard/source-checklist.tsx` (component, event-driven)

**Analog:** `src/app/login/page.tsx` (Client Component with state + API call).

**Optimistic update with rollback pattern** (RESEARCH.md Anti-Patterns):
```typescript
'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function SourceChecklist({ sources: initialSources, commentaryId }: Props) {
  const [sources, setSources] = useState(initialSources)

  async function handleRate(sourceUrl: string, rating: 1 | 0.5 | 0) {
    const prev = sources
    // Optimistic update
    setSources(s => s.map(src => src.url === sourceUrl ? { ...src, rating } : src))
    try {
      await fetch(`/api/reviews/${commentaryId}/verify-source`, {
        method: 'POST',
        body: JSON.stringify({ sourceUrl, rating }),
      })
    } catch {
      setSources(prev) // Rollback on error
    }
  }

  const allRated = sources.every(s => s.rating != null)
  // Pass allRated up to action-buttons via prop or context
}
```

---

### `src/components/dashboard/commentary-editor.tsx` (component, event-driven)

**Analog:** `src/app/login/page.tsx` (Client Component with controlled textarea).

**Inline edit mode pattern** (RESEARCH.md D-08):
```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
// Textarea from shadcn (to be installed): import { Textarea } from '@/components/ui/textarea'

export function CommentaryEditor({ commentary, commentaryId }: Props) {
  const [editMode, setEditMode] = useState(false)
  const [value, setValue] = useState(commentary.draftText)
  const [saved, setSaved] = useState(commentary.draftText)

  async function handleSave() {
    const prev = saved
    setSaved(value)
    setEditMode(false)
    try {
      await fetch(`/api/reviews/${commentaryId}/edit`, {
        method: 'POST',
        body: JSON.stringify({ draftText: value }),
      })
    } catch {
      setValue(prev)
      setSaved(prev)
      setEditMode(true) // Rollback
    }
  }

  if (editMode) {
    return (
      <div>
        <textarea value={value} onChange={e => setValue(e.target.value)} />
        <Button onClick={handleSave}>Save</Button>
        <Button variant="ghost" onClick={() => { setValue(saved); setEditMode(false) }}>Cancel</Button>
      </div>
    )
  }
  return (
    <div>
      <p>{value}</p>
      <Button variant="outline" onClick={() => setEditMode(true)}>Edit</Button>
    </div>
  )
}
```

---

### `src/components/dashboard/action-buttons.tsx` (component, event-driven)

**Analog:** `src/components/ui/button.tsx` (Button variants) + login/page.tsx (Client Component).

**Button variants to use:**
- Approve: `variant="default"` (primary action)
- Reject: `variant="destructive"`
- Edit: `variant="outline"`

**Disabled state + source gate** (RESEARCH.md Pattern 4):
```typescript
<Button
  variant="default"
  disabled={!allSourcesRated}
  aria-disabled={!allSourcesRated}
  onClick={handleApprove}
>
  Approve
</Button>
```

---

### `src/components/dashboard/queue-depth-alert.tsx` (component, event-driven)

**Analog:** `src/components/ui/alert.tsx` — base Alert component to wrap.

**Alert component usage pattern** (alert.tsx lines 22-65):
```typescript
'use client'

import { useState } from 'react'
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function QueueDepthAlert({ depth, threshold = 50 }: Props) {
  const [dismissed, setDismissed] = useState(() => {
    // localStorage for dismissal persistence across navigation
    if (typeof window === 'undefined') return false
    return localStorage.getItem('queueAlertDismissed') === String(depth)
  })

  if (dismissed || depth <= threshold) return null

  return (
    <Alert variant="destructive">
      <AlertTitle>Review backlog</AlertTitle>
      <AlertDescription>{depth} items pending review</AlertDescription>
      <AlertAction>
        <Button variant="ghost" size="icon-sm" onClick={() => {
          localStorage.setItem('queueAlertDismissed', String(depth))
          setDismissed(true)
        }}>
          ✕
        </Button>
      </AlertAction>
    </Alert>
  )
}
```

---

### `src/components/dashboard/activity-feed.tsx` (component, CRUD)

**Analog:** `src/app/dashboard/page.tsx` (data list render) — receives `auditFeed` array as prop from Server Component parent, renders timeline. Client Component only for interactivity (expand/collapse), not for data fetching.

```typescript
'use client'

import { Card, CardContent } from '@/components/ui/card'

export function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>
  }
  return (
    <ol className="space-y-2">
      {entries.map(entry => (
        <li key={entry.id}>
          <Card size="sm">
            <CardContent>
              <span className="font-medium">{entry.reviewerId}</span>
              {' '}{entry.action}{' '}
              <time className="text-muted-foreground text-xs">
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  )
}
```

---

### Test Files

#### `tests/features/reviews/state-machine.test.ts` (test — pure unit)

**Analog:** `tests/features/analysis/score-engine.test.ts` — pure unit test, no DB, mocks `server-only` and `@/db`.

**Pure function test pattern** (score-engine.test.ts lines 1-13):
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/db', () => ({ db: {} }))

import { validateTransition, VALID_TRANSITIONS } from '@/features/reviews/state-machine'

describe('validateTransition (MOD-03, MOD-09)', () => {
  it('allows AI_ANALYZED → HUMAN_APPROVED', () => {
    expect(validateTransition('AI_ANALYZED', 'HUMAN_APPROVED')).toBe(true)
  })
  it('blocks AI_ANALYZED → PUBLISHED (MOD-09)', () => {
    expect(validateTransition('AI_ANALYZED', 'PUBLISHED')).toBe(false)
  })
  it('blocks PENDING → PUBLISHED (MOD-09)', () => {
    expect(validateTransition('PENDING', 'PUBLISHED')).toBe(false)
  })
})
```

#### `tests/features/reviews/approve.test.ts` + `audit-log.test.ts` + `assign.test.ts` (integration tests)

**Analog:** `tests/features/analysis/analysis-worker.test.ts` (lines 1-34) — integration test with real DB pool, mocked LLM/external services.

**Integration test setup pattern** (analysis-worker.test.ts lines 1-34):
```typescript
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '@/db/schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const testDb = drizzle(pool, { schema })

vi.mock('server-only', () => ({}))

// Mock @/db to use same test pool
vi.mock('@/db', async () => {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('@/db/schema')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return { db: drizzle(pool, { schema }) }
})

// Mock score engine to avoid computing real scores in action tests
vi.mock('@/features/analysis/score-engine', () => ({
  computeAndPersistScore: vi.fn(),
}))
```

#### `tests/features/reviews/queue-queries.test.ts` (unit test)

**Analog:** `tests/features/analysis/score-engine.test.ts` — mock DB, test return shapes and filter logic.

---

## Shared Patterns

### Authentication Guard
**Source:** `src/app/api/articles/route.ts` lines 33-35 and `src/app/dashboard/page.tsx` lines 1-7
**Apply to:** All API route handlers AND all dashboard Server Component pages

**In API routes:**
```typescript
const session = await auth()
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**In Server Component pages:**
```typescript
const session = await auth()
if (!session?.user) redirect('/login')
```

**Critical:** `session.user.id` may be undefined if reviewer has a pre-existing JWT from before Phase 1. Always check `session?.user?.id` (not just `session?.user`) in API routes before using it as `reviewerId`.

---

### Error Handling (API Routes)
**Source:** `src/app/api/articles/route.ts` lines 59-63
**Apply to:** All six review API route handlers

```typescript
} catch (err) {
  console.error(err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

Never expose `err.message` or stack trace in the HTTP response body.

---

### Zod Request Validation
**Source:** `src/app/api/articles/route.ts` lines 13-28, 38-43
**Apply to:** All API routes that accept a request body

```typescript
const bodySchema = z.object({ /* fields */ })

const body = await req.json()
const parsed = bodySchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
}
```

---

### Params Await (Next.js 16)
**Source:** RESEARCH.md Pitfall 1 — verified against Next.js 16.2.4 docs
**Apply to:** All dynamic route handlers (`/api/reviews/[id]/*`) AND all dynamic page components (`/dashboard/review/[claimId]`)

```typescript
// In Route Handlers:
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // MUST await

// In Server Component pages:
export default async function Page({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params  // MUST await
```

---

### Atomic Write + Audit Log
**Source:** RESEARCH.md Atomic Transaction Pattern + `src/features/analysis/score-engine.ts` DB write pattern
**Apply to:** Every action that changes `commentaries.status` (approve, reject, edit, assign, flag, verify-source)

Every status-mutating DB write must be inside `db.transaction()` and call `insertAuditEntry(tx, ...)` in the same transaction. `computeAndPersistScore()` is called AFTER the transaction commits (not inside it).

---

### Server-Only Guard
**Source:** `src/features/analysis/score-engine.ts` line 1, `src/features/ingestion/index.ts` line 1
**Apply to:** All files in `src/features/reviews/` EXCEPT `state-machine.ts`

```typescript
import 'server-only'  // First line, before other imports
```

`state-machine.ts` must NOT have `import 'server-only'` — it must be importable in tests without mocking.

---

### Feature Barrel Export
**Source:** `src/features/analysis/index.ts` lines 1-9
**Apply to:** `src/features/reviews/index.ts`

```typescript
import 'server-only'
// Named exports only — no default exports in feature barrel files
export { ... } from './state-machine'
export { ... } from './audit-log'
// etc.
```

---

### Path Alias
**Source:** Throughout codebase — `@/db`, `@/auth`, `@/components/ui/*`, `@/features/*`, `@/lib/utils`
**Apply to:** All new files

Use `@/` alias for all project imports. Never use relative paths (`../../../`) for cross-feature imports.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/dashboard/flag-form.tsx` | component | event-driven | Text selection flagging with floating popover form is a novel UI pattern not present elsewhere in the codebase. Use RESEARCH.md Pattern 3 (`window.getSelection()` + `getBoundingClientRect()`) as the implementation guide. |

---

## Metadata

**Analog search scope:** `src/app/`, `src/features/`, `src/components/ui/`, `tests/`
**Files scanned:** 22 source files read
**Pattern extraction date:** 2026-04-19
