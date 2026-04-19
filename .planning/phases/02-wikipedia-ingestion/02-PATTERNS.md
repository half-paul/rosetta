# Phase 02: Wikipedia Ingestion - Pattern Map

**Mapped:** 2026-04-19
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/api/articles/route.ts` | route handler | request-response | `src/app/api/auth/[...nextauth]/route.ts` (structure); `src/lib/boss.ts` (job enqueue pattern) | role-match |
| `src/lib/mediawiki.ts` | utility | request-response | itself — extend in place | exact (extend) |
| `src/features/ingestion/mediawiki-client.ts` | service | request-response | `src/lib/mediawiki.ts` (fetch wrapper pattern) | role-match |
| `src/features/ingestion/parse-article.ts` | service | transform | `src/lib/ai-registry.ts` (server-only module structure) | partial-match |
| `src/features/ingestion/stable-id.ts` | utility | transform | `src/lib/utils.ts` (pure function export pattern) | role-match |
| `src/features/ingestion/ingest-worker.ts` | service | event-driven | `src/workers/index.ts` (pg-boss job handler pattern) | exact |
| `src/features/ingestion/index.ts` | utility | — | `src/lib/ai-registry.ts` (re-export barrel pattern) | role-match |
| `src/workers/index.ts` | config | event-driven | itself — extend in place | exact (extend) |
| `tests/features/ingestion/` (4 test files) | test | — | `tests/lib/mediawiki.test.ts`, `tests/jobs/boss.test.ts`, `tests/db/schema.test.ts` | exact |

---

## Pattern Assignments

### `src/app/api/articles/route.ts` (route handler, request-response)

**Analog:** `src/workers/index.ts` (pg-boss send pattern) + `src/lib/boss.ts` (getBoss singleton)

**Imports pattern** — copy from `src/lib/boss.ts` (lines 1-3) and extend:
```typescript
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getBoss } from '@/lib/boss'
import { db } from '@/db'
import { articles } from '@/db/schema'
import { eq } from 'drizzle-orm'
```

**Auth guard pattern** — the POST handler must check session. Reference `src/auth.ts` (line 11):
```typescript
// From src/auth.ts line 11 — same auth export used in route handlers
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ...
}
```

**Validation + enqueue pattern** — modeled on the pg-boss send call in `src/workers/index.ts` (line 31) adapted to route handler context:
```typescript
// Zod schema (from RESEARCH.md Pattern 7 — URL normalization)
const ingestBodySchema = z.object({
  url: z.string().url().refine(
    url => url.includes('wikipedia.org/wiki/'),
    'Must be an English Wikipedia article URL'
  ),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = ingestBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // Duplicate check — wikiUrl has .unique() constraint (schema.ts line 91)
  const existing = await db.select().from(articles).where(eq(articles.wikiUrl, normalized))
  if (existing.length > 0) {
    return NextResponse.json({ article: existing[0] }, { status: 200 })
  }

  const boss = getBoss()
  // boss.start() must be called — see Pitfall 5 in RESEARCH.md
  await boss.start()
  const jobId = await boss.send('ingestion-jobs', { url: normalized, title })
  return NextResponse.json({ jobId }, { status: 202 })
}
```

---

### `src/lib/mediawiki.ts` — EXTEND in place (utility, request-response)

**Analog:** `src/lib/mediawiki.ts` itself (lines 1-14) — extend with backoff

**Existing pattern** (`src/lib/mediawiki.ts` lines 1-14):
```typescript
const USER_AGENT = 'Rosetta/1.0 (https://rosetta.example.com; contact@rosetta.example.com)'

export async function mediawikiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...init?.headers,
    },
  })
}
```

**Backoff extension to add** (D-15: 1s initial, doubles to 32s cap, 5 retries):
```typescript
// Add below existing mediawikiFetch — does not replace it
export async function mediawikiFetchWithBackoff(
  url: string,
  init?: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  let delay = 1_000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await mediawikiFetch(url, init)
    if (res.status !== 429) return res
    if (attempt === maxRetries) {
      throw new Error(`MediaWiki rate limited after ${maxRetries} retries`)
    }
    await new Promise(r => setTimeout(r, delay))
    delay = Math.min(delay * 2, 32_000)
  }
  throw new Error('unreachable')
}
```

---

### `src/features/ingestion/mediawiki-client.ts` (service, request-response)

**Analog:** `src/lib/mediawiki.ts` (fetch wrapper) + `src/lib/ai-registry.ts` (server-only guard pattern)

**Imports + server-only guard** (copy from `src/lib/ai-registry.ts` line 1-2 and `src/lib/boss.ts` line 1-2):
```typescript
import 'server-only'
import { mediawikiFetchWithBackoff } from '@/lib/mediawiki'
```

**Core API call pattern** (from RESEARCH.md Code Examples — MediaWiki API):
```typescript
// IMPORTANT: prop=tocdata NOT prop=sections (deprecated since MediaWiki 1.46)
// IMPORTANT: formatversion=2 returns text as plain string, not text['*']
export interface MediaWikiParseResponse {
  parse: {
    title: string
    pageid: number
    revid: number
    text: string
    tocdata: {
      sections: Array<{
        tocLevel: number
        hLevel: number
        line: string
        number: string
        index: string
        anchor: string
        codepointOffset: number
      }>
    }
  }
}

export async function fetchArticle(title: string): Promise<MediaWikiParseResponse> {
  const apiUrl = new URL('https://en.wikipedia.org/w/api.php')
  apiUrl.searchParams.set('action', 'parse')
  apiUrl.searchParams.set('page', title)
  apiUrl.searchParams.set('prop', 'text|tocdata|revid')
  apiUrl.searchParams.set('format', 'json')
  apiUrl.searchParams.set('formatversion', '2')

  const res = await mediawikiFetchWithBackoff(apiUrl.toString())
  if (!res.ok) throw new Error(`MediaWiki API error: ${res.status}`)
  return res.json() as Promise<MediaWikiParseResponse>
}
```

**URL normalization pattern** (Claude's Discretion — handles mobile, encoded, http variants):
```typescript
export function normalizeWikipediaUrl(raw: string): { normalized: string; title: string } {
  const url = new URL(raw)
  if (url.hostname === 'en.m.wikipedia.org') url.hostname = 'en.wikipedia.org'
  url.protocol = 'https:'
  const match = url.pathname.match(/^\/wiki\/(.+)$/)
  if (!match) throw new Error('Not a Wikipedia article URL')
  const title = decodeURIComponent(match[1]).replace(/\s+/g, '_')
  const normalized = `https://en.wikipedia.org/wiki/${title}`
  return { normalized, title }
}
```

---

### `src/features/ingestion/stable-id.ts` (utility, transform)

**Analog:** `src/lib/utils.ts` (pure exported functions pattern, lines 1-6)

**Imports pattern** (copy from `src/lib/utils.ts` structure — named pure exports):
```typescript
// src/lib/utils.ts pattern: named exports, no class, no side effects
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) { ... }
```

**Core pattern** for `stable-id.ts` (node:crypto built-in, D-11/D-12/D-13):
```typescript
import { createHash } from 'node:crypto'

// D-13: SHA-256 of plain text, first 12 hex chars
export function computeContentHash(plainText: string): string {
  return createHash('sha256')
    .update(plainText, 'utf8')
    .digest('hex')
    .slice(0, 12)
}

// D-11: stableId = sectionPath:contentHash:revisionId
export function buildStableId(
  sectionPath: string,
  contentHash: string,
  revisionId: number,
): string {
  return `${sectionPath}:${contentHash}:${revisionId}`
}

// D-12: spaces → underscores, lowercase, joined with /
export function normalizeSectionPath(headings: string[]): string {
  return headings
    .map(h => h.toLowerCase().replace(/\s+/g, '_'))
    .join('/')
}
```

---

### `src/features/ingestion/parse-article.ts` (service, transform)

**Analog:** `src/lib/ai-registry.ts` (server-only module structure, lines 1-2); JSDOM pattern from RESEARCH.md

**Imports + server-only guard**:
```typescript
import 'server-only'
import { JSDOM } from 'jsdom'
import { computeContentHash, buildStableId, normalizeSectionPath } from './stable-id'
```

**JSDOM strip + section walk pattern** (D-07/D-08/D-09 — verified against live Eiffel Tower HTML):
```typescript
// D-08 strip selectors — order matters: strip containers before extracting <p>
const STRIP_SELECTORS = [
  '.infobox', '.navbox', '.reflist', '#toc',
  '.mw-editsection', '.ambox', '.tmbox',
  '.reference', '.mw-references-wrap', 'style', 'script',
]

// MediaWiki HTML: headings wrapped in <div class="mw-heading mw-headingN">
// Paragraphs are siblings in flat structure, not nested inside section elements
// Lead section: paragraphs before first .mw-heading (Pitfall 3 — must initialize lead)
export function parseWikipediaHtml(html: string, revisionId: number): ParsedSection[] {
  const { document } = new JSDOM(html).window

  for (const sel of STRIP_SELECTORS) {
    document.querySelectorAll(sel).forEach(el => el.remove())
  }

  const root = document.querySelector('.mw-parser-output')
  if (!root) return []

  let currentHeadings: string[] = ['lead']
  let currentSection: ParsedSection = { title: 'lead', path: 'lead', position: 0, paragraphs: [] }
  const sections: ParsedSection[] = [currentSection]
  let sectionPos = 0
  let paraPos = 0

  for (const child of Array.from(root.children)) {
    if (child.classList.contains('mw-heading')) {
      const heading = child.querySelector('h2, h3, h4, h5, h6')
      if (!heading) continue
      const level = parseInt(heading.tagName[1], 10)
      const title = heading.textContent?.trim() ?? ''
      if (level === 2) currentHeadings = [title]
      else currentHeadings = [...currentHeadings.slice(0, level - 2), title]
      currentSection = { title, path: normalizeSectionPath(currentHeadings), position: ++sectionPos, paragraphs: [] }
      sections.push(currentSection)
      paraPos = 0
    } else if (child.tagName === 'P') {
      const plainText = child.textContent?.trim() ?? ''
      if (plainText.length < 10) continue  // Pitfall 6: skip spacers/empties
      const contentHash = computeContentHash(plainText)
      currentSection.paragraphs.push({
        plainText,
        contentHash,
        stableId: buildStableId(currentSection.path, contentHash, revisionId),
        position: paraPos++,
      })
    }
  }

  return sections.filter(s => s.paragraphs.length > 0)
}
```

---

### `src/features/ingestion/ingest-worker.ts` (service, event-driven)

**Analog:** `src/workers/index.ts` (pg-boss job handler, lines 25-28) + `tests/db/schema.test.ts` (Drizzle transaction pattern, lines 46-80)

**Job handler structure** (copy from `src/workers/index.ts` lines 25-28):
```typescript
// From src/workers/index.ts lines 25-28 — exact pattern to copy
await boss.work('analysis-jobs', async ([job]) => {
  console.log(`Processing job ${job.id}`, job.data)
  // ...
})
```

**Drizzle transaction pattern** (from `tests/db/schema.test.ts` lines 46-68 — article+section+paragraph chain):
```typescript
// Copy the insert-returning chain from tests/db/schema.test.ts lines 47-68
// Use db.transaction() for atomic persistence (D-05)
import { db } from '@/db'
import { articles, sections, paragraphs } from '@/db/schema'

export async function runIngestionJob(data: { url: string; title: string }): Promise<void> {
  const parsed = await fetchArticle(data.title)
  const parsedSections = parseWikipediaHtml(parsed.parse.text, parsed.parse.revid)

  await db.transaction(async (tx) => {
    const [article] = await tx.insert(articles).values({
      title: parsed.parse.title,
      wikiUrl: data.url,
      revisionId: parsed.parse.revid,
      language: 'en',
    }).returning()

    for (const section of parsedSections) {
      const [sec] = await tx.insert(sections).values({
        articleId: article.id,
        title: section.title,
        path: section.path,
        position: section.position,
      }).returning()

      if (section.paragraphs.length > 0) {
        await tx.insert(paragraphs).values(
          section.paragraphs.map(p => ({
            sectionId: sec.id,
            stableId: p.stableId,
            content: p.plainText,
            contentHash: p.contentHash,
            position: p.position,
          }))
        )
      }
    }
  })
}
```

---

### `src/features/ingestion/index.ts` (barrel, re-export)

**Analog:** `src/lib/ai-registry.ts` structure — named exports, server-only guard at top

**Pattern**:
```typescript
// From src/lib/ai-registry.ts lines 1-2 — server-only guard + named re-exports
import 'server-only'
export { runIngestionJob } from './ingest-worker'
export { parseWikipediaHtml } from './parse-article'
export { computeContentHash, buildStableId, normalizeSectionPath } from './stable-id'
export { fetchArticle, normalizeWikipediaUrl } from './mediawiki-client'
```

---

### `src/workers/index.ts` — EXTEND in place (config, event-driven)

**Analog:** itself — lines 13-30 show the exact pattern to replicate

**Existing queue registration pattern** (`src/workers/index.ts` lines 13-30):
```typescript
// From src/workers/index.ts lines 13-22 — copy this block and add ingestion-jobs alongside
await boss.createQueue('analysis-jobs', {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 900,
  deadLetter: 'analysis-failures',
})
await boss.createQueue('analysis-failures')
await boss.work('analysis-jobs', async ([job]) => {
  console.log(`Processing job ${job.id}`, job.data)
})
```

**New ingestion queue block** (add after existing analysis-jobs block, Claude's Discretion for config values):
```typescript
await boss.createQueue('ingestion-jobs', {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 600,
  deadLetter: 'ingestion-failures',
})
await boss.createQueue('ingestion-failures')
await boss.work('ingestion-jobs', async ([job]) => {
  await runIngestionJob(job.data as { url: string; title: string })
})
```

---

### Test Files — `tests/features/ingestion/` (4 files)

**Analogs:**
- `tests/lib/mediawiki.test.ts` — unit test with `vi.fn()` mocks (extend for backoff)
- `tests/jobs/boss.test.ts` — integration test with real pg-boss lifecycle
- `tests/db/schema.test.ts` — integration test with real DB, Pool + drizzle setup

**Unit test structure** (copy from `tests/lib/mediawiki.test.ts` lines 1-6):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
// ... import subject under test

describe('subject', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  // ...
})
```

**Integration test lifecycle pattern** (copy from `tests/jobs/boss.test.ts` lines 5-12):
```typescript
// beforeAll/afterAll for pg-boss lifecycle — same pattern for worker tests
beforeAll(async () => {
  boss = new PgBoss(process.env.DATABASE_URL!)
  boss.on('error', console.error)
  await boss.start()
}, 15000)

afterAll(async () => {
  await boss.stop({ graceful: true, timeout: 5000 })
})
```

**DB integration test pattern** (copy from `tests/db/schema.test.ts` lines 1-10):
```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })
```

**Cleanup helper pattern** (copy from `tests/db/schema.test.ts` lines 11-18):
```typescript
async function cleanTestData() {
  await db.delete(schema.paragraphs)
  await db.delete(schema.sections)
  await db.delete(schema.articles)
}
```

**Mock fetch for backoff test** (extend `tests/lib/mediawiki.test.ts` pattern, lines 9-18):
```typescript
it('retries on 429 and returns success on subsequent attempt', async () => {
  const mockFetch = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 429 }))
    .mockResolvedValueOnce(new Response('{}'))
  vi.stubGlobal('fetch', mockFetch)

  const res = await mediawikiFetchWithBackoff('https://en.wikipedia.org/w/api.php')
  expect(res.status).not.toBe(429)
  expect(mockFetch).toHaveBeenCalledTimes(2)
})
```

---

## Shared Patterns

### server-only Guard
**Source:** `src/lib/boss.ts` line 1 and `src/lib/ai-registry.ts` line 1
**Apply to:** All files under `src/features/ingestion/` and the updated `src/lib/mediawiki.ts`
```typescript
import 'server-only'
```

### Drizzle DB Import
**Source:** `src/db/index.ts` lines 1-4
**Apply to:** `src/features/ingestion/ingest-worker.ts`, `src/app/api/articles/route.ts`
```typescript
import 'server-only'
import { db } from '@/db'
```

### CUID2 Primary Keys
**Source:** `src/db/schema.ts` lines 89, 101, 113 — `$defaultFn(() => createId())`
**Apply to:** No new schema tables in this phase — existing tables already use CUID2.

### Soft Delete Convention
**Source:** `src/db/schema.ts` lines 97, 110, 124 — `deletedAt: timestamp(...)`
**Apply to:** No new schema tables in this phase — existing tables already have `deletedAt`.

### Error Handling in Route Handlers
**Source:** No centralized error handler exists yet; use inline try/catch with NextResponse.
**Pattern** (inferred from existing route structure):
```typescript
try {
  // ...operation
} catch (err) {
  console.error(err)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

### pg-boss getBoss() Singleton
**Source:** `src/lib/boss.ts` lines 5-16
**Apply to:** `src/app/api/articles/route.ts`
```typescript
export function getBoss(): PgBoss {
  if (!boss) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for pg-boss')
    }
    boss = new PgBoss(process.env.DATABASE_URL)
    boss.on('error', console.error)
  }
  return boss
}
```
**Note:** Pitfall 5 from RESEARCH.md — `getBoss()` does NOT call `boss.start()`. The API route must call `await boss.start()` after `getBoss()` before calling `boss.send()`. pg-boss `start()` is idempotent.

---

## No Analog Found

All files have analogs from the existing codebase. No files require falling back to RESEARCH.md patterns exclusively.

| File | Role | Note |
|------|------|-------|
| `src/features/ingestion/parse-article.ts` | service/transform | JSDOM usage is new to the project — use RESEARCH.md Pattern 3 / Code Examples for the walk algorithm. The module structure (server-only, named exports) has an exact analog in `src/lib/ai-registry.ts`. |

---

## Metadata

**Analog search scope:** `src/lib/`, `src/app/api/`, `src/workers/`, `src/db/`, `src/auth.ts`, `tests/`
**Files scanned:** 13 source files + 6 test files
**Pattern extraction date:** 2026-04-19
