# Phase 02: Wikipedia Ingestion - Research

**Researched:** 2026-04-19
**Domain:** MediaWiki API ingestion, JSDOM HTML parsing, pg-boss async jobs, SHA-256 stable IDs
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Parsing Approach**
- D-01: Use MediaWiki `action=parse` API with `prop=text|sections` as the primary content source
- D-02: Do NOT use the Wikimedia Structured Contents JSON API (beta)
- D-03: Do NOT use `wtf_wikipedia` library — prefer direct API + DOM parsing

**Ingestion Flow**
- D-04: API endpoint (`POST /api/articles`) accepts a Wikipedia URL, validates it (must be en.wikipedia.org/wiki/...), enqueues a pg-boss ingestion job — returns 202 Accepted
- D-05: pg-boss worker processes the job: fetches article metadata, fetches and parses section content, generates stable IDs, persists article/section/paragraph rows in a single transaction
- D-06: Sequential MediaWiki API requests within a single ingestion job — one section at a time, exponential backoff on HTTP 429

**Content Extraction**
- D-07: Use JSDOM (server-side DOM parsing) to process `action=parse` HTML output
- D-08: Strip non-content elements before paragraph extraction: `.infobox`, `.navbox`, `.reflist`, `#toc`, `.mw-editsection`, `.ambox`, `.tmbox`
- D-09: Extract `<p>` elements from content body after stripping — each non-empty paragraph = one row in paragraphs table
- D-10: Content hash computed on stripped plain text (`.textContent` after stripping)

**Stable ID Generation**
- D-11: Stable ID formula: `{section_path}:{content_hash}:{revision_id}`
- D-12: Section path = normalized heading hierarchy — spaces replaced with underscores, lowercased
- D-13: SHA-256 truncated to first 12 hex chars

**Rate Limiting**
- D-14: Sequential request queue — no concurrent MediaWiki API calls
- D-15: Exponential backoff on HTTP 429: initial delay 1s, doubling up to 32s, max 5 retries before job failure
- D-16: `mediawikiFetch()` wrapper extended with backoff logic

### Claude's Discretion
- URL normalization strategy (redirects, URL-encoded titles, mobile URLs)
- Exact pg-boss job configuration (retry count, retry delay, job expiration)
- How to handle disambiguation pages (skip, flag, or parse as regular article)
- Error states and user feedback when ingestion fails
- Whether to store raw HTML alongside parsed content for debugging

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGEST-01 | User can paste a Wikipedia URL and the system fetches the live article content | POST /api/articles route + pg-boss job + mediawikiFetch with backoff |
| INGEST-02 | System parses Wikipedia HTML into a section/paragraph tree with stable anchor IDs (section path + content hash + revision ID) | JSDOM parsing pipeline + SHA-256 ID generation; schema already has stableId column |
| INGEST-03 | System stores article metadata (title, revision ID, fetch timestamp, language) alongside parsed content | action=parse returns revid, title, pageid; articles table has all required columns |
| INGEST-04 | System respects MediaWiki API rate limits with sequential request queue and exponential backoff | Sequential processing in pg-boss worker + retry loop in mediawikiFetch |
</phase_requirements>

---

## Summary

Phase 2 delivers the full Wikipedia ingestion pipeline: a POST API endpoint that validates a Wikipedia URL and enqueues a pg-boss job, a worker that fetches article content from the MediaWiki `action=parse` API, a JSDOM-based parsing pipeline that extracts sections and paragraphs, stable ID generation using SHA-256 + revision ID, and a Drizzle transaction that persists everything atomically.

**Critical API finding:** `prop=sections` is deprecated since MediaWiki 1.46. The correct replacement is `prop=tocdata` — verified against the live API on 2026-04-19. The CONTEXT.md decision D-01 specifies `prop=text|sections` but `prop=text|tocdata|revid` is the non-deprecated equivalent and produces the same section hierarchy data. The planner must use `tocdata` to avoid deprecation warnings and future breakage.

**Primary recommendation:** Extend `mediawikiFetch()` with exponential backoff, add `src/features/ingestion/` containing the parser and worker handler, register the pg-boss queue in `src/workers/index.ts`, and add `POST /api/articles` as a Next.js route handler. JSDOM (v29.0.2) is already available as a transitive dependency (Vitest uses it) but must be explicitly installed as a production dependency.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| URL validation | API / Backend | — | Input validation belongs server-side; client never talks to MediaWiki directly |
| Job enqueueing | API / Backend | — | pg-boss send() called from the POST route handler after URL validation |
| MediaWiki API fetch | Worker (Node process) | — | Long-lived I/O with rate limiting; must run outside HTTP request lifecycle |
| HTML parsing (JSDOM) | Worker (Node process) | — | Server-only; JSDOM is a heavy runtime not suitable for serverless edge |
| Stable ID generation | Worker (Node process) | — | Pure computation triggered during ingestion, not per-request |
| DB persistence (transaction) | Worker (Node process) | Database | Worker writes article/section/paragraph rows atomically |
| Job queue management | Database | — | pg-boss stores job state in PostgreSQL (no Redis needed) |

## Standard Stack

### Core (verified against project's package.json and npm registry)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jsdom | 29.0.2 | Server-side DOM parsing of MediaWiki HTML | Decision D-07; enables standard DOM APIs (querySelectorAll, textContent) without browser. Already a transitive dep — must be added as explicit prod dep |
| @types/jsdom | 28.0.1 | TypeScript types for jsdom | Required for typed DOM manipulation in the ingestion pipeline |
| pg-boss | 12.15.0 | Background job queue | Already installed; handles ingestion job lifecycle with exactly-once delivery |
| drizzle-orm | 0.45.2 | DB persistence | Already installed; use `db.transaction()` for atomic article/section/paragraph insert |
| node:crypto | Node built-in | SHA-256 computation | No additional install; `crypto.createHash('sha256')` for stable ID generation |

[VERIFIED: npm registry — jsdom@29.0.2, @types/jsdom@28.0.1 are current latest]
[VERIFIED: package.json — pg-boss@12.15.0, drizzle-orm@0.45.2 already installed]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 | URL validation schema | Validate the POST body `{ url }` input — already installed |
| server-only | 0.0.1 | Import guard | Add to ingestion feature module to prevent client-side import |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| jsdom | cheerio | Cheerio is lighter but uses CSS selector API only; JSDOM gives full DOM + textContent which is cleaner for stripping elements |
| node:crypto (built-in) | sha.js npm package | No benefit — Node has SHA-256 built in |
| `prop=tocdata` (current) | `prop=sections` (deprecated) | `prop=sections` still works but emits deprecation warnings; use `tocdata` |

**Installation (new deps only):**
```bash
npm install jsdom @types/jsdom
```

**Version verification:** [VERIFIED: npm view jsdom version → 29.0.2, npm view @types/jsdom version → 28.0.1]

## Architecture Patterns

### System Architecture Diagram

```
Reviewer pastes URL
        │
        ▼
POST /api/articles
  ├─ Validate URL (zod: must be en.wikipedia.org/wiki/*)
  ├─ Check duplicate (articles.wikiUrl unique constraint)
  ├─ boss.send('ingestion-jobs', { url, title })
  └─ Return 202 Accepted { jobId }
        │
        ▼ (async, pg-boss polls DB)
Worker: ingestion-jobs handler
  ├─ mediawikiFetch → action=parse&prop=text|tocdata|revid
  │     └─ Exponential backoff on HTTP 429 (max 5 retries)
  ├─ Extract: title, revisionId from parse response
  ├─ Parse tocdata → section hierarchy (normalized paths)
  ├─ Parse HTML with JSDOM
  │     ├─ Strip: .infobox, .navbox, .reflist, #toc, .mw-editsection, .ambox, .tmbox
  │     └─ For each section heading → collect <p> elements
  ├─ For each paragraph:
  │     ├─ plainText = element.textContent.trim()
  │     ├─ contentHash = SHA-256(plainText).slice(0,12)
  │     └─ stableId = `${sectionPath}:${contentHash}:${revisionId}`
  └─ db.transaction()
        ├─ INSERT article (title, wikiUrl, revisionId, fetchedAt, language)
        ├─ INSERT sections[] (articleId, title, path, position)
        └─ INSERT paragraphs[] (sectionId, stableId, content, contentHash, position)
```

### Recommended Project Structure

```
src/
├── app/
│   └── api/
│       └── articles/
│           └── route.ts          # POST handler (INGEST-01)
├── features/
│   └── ingestion/
│       ├── index.ts              # public re-exports
│       ├── parse-article.ts      # JSDOM HTML → section/paragraph tree (INGEST-02)
│       ├── stable-id.ts          # SHA-256 ID generation (INGEST-02)
│       ├── mediawiki-client.ts   # action=parse API calls (INGEST-01)
│       └── ingest-worker.ts      # pg-boss job handler (D-05)
├── lib/
│   └── mediawiki.ts              # EXTEND: add exponential backoff (D-16)
└── workers/
    └── index.ts                  # EXTEND: register ingestion-jobs queue
```

Note: The project uses `src/lib/mediawiki.ts` (already exists) and `src/workers/index.ts` (already exists). Feature code goes in `src/features/ingestion/` following the feature-based pattern from 01-CONTEXT.md.

### Pattern 1: MediaWiki `action=parse` API Call

**What:** Fetch full article HTML + section TOC data + revision ID in one request.
**When to use:** Initial article ingestion — one call gets everything needed.

```typescript
// Source: verified against live MediaWiki API 2026-04-19
// IMPORTANT: prop=sections is deprecated since MediaWiki 1.46 — use tocdata instead
const url = new URL('https://en.wikipedia.org/w/api.php')
url.searchParams.set('action', 'parse')
url.searchParams.set('page', articleTitle)
url.searchParams.set('prop', 'text|tocdata|revid')  // NOT prop=sections (deprecated)
url.searchParams.set('format', 'json')
url.searchParams.set('formatversion', '2')

const res = await mediawikiFetch(url.toString())
const data = await res.json()

// Response shape (verified):
// data.parse.title        — string
// data.parse.revid        — number (Wikipedia revision ID)
// data.parse.text         — string (full HTML)
// data.parse.tocdata.sections[] — array of section objects:
//   { tocLevel, hLevel, line, number, index, anchor, codepointOffset }
```

[VERIFIED: live API call to en.wikipedia.org/w/api.php on 2026-04-19]

### Pattern 2: Exponential Backoff on HTTP 429

**What:** Retry wrapper around `mediawikiFetch()` with exponential delay.
**When to use:** Every MediaWiki API call from the ingestion worker.

```typescript
// Source: [ASSUMED] — standard retry pattern; decision D-15 specifies parameters
async function mediawikiFetchWithBackoff(
  url: string,
  init?: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  let delay = 1000  // 1s initial
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await mediawikiFetch(url, init)
    if (res.status !== 429) return res
    if (attempt === maxRetries) throw new Error(`Rate limited after ${maxRetries} retries`)
    await new Promise(r => setTimeout(r, delay))
    delay = Math.min(delay * 2, 32_000)  // cap at 32s (D-15)
  }
  throw new Error('unreachable')
}
```

### Pattern 3: JSDOM Parsing — Strip + Extract

**What:** Parse MediaWiki HTML, strip non-content elements, extract `<p>` elements by section.
**When to use:** Inside `parse-article.ts` after receiving HTML from action=parse.

```typescript
// Source: JSDOM 29 API — [VERIFIED: jsdom@29.0.2 installed as transitive dep]
import { JSDOM } from 'jsdom'

function parseArticleHtml(html: string): ParsedSection[] {
  const dom = new JSDOM(html)
  const doc = dom.window.document

  // Strip non-content elements (D-08)
  const stripSelectors = [
    '.infobox', '.navbox', '.reflist', '#toc',
    '.mw-editsection', '.ambox', '.tmbox',
    '.reference', 'style', 'script',
  ]
  for (const sel of stripSelectors) {
    doc.querySelectorAll(sel).forEach(el => el.remove())
  }

  // Walk section headings to group paragraphs
  // MediaWiki renders: <div class="mw-heading mw-headingN"><hN id="...">
  // followed by sibling <p> elements until the next heading div
  const sections: ParsedSection[] = []
  // ... heading walk logic
  return sections
}
```

### Pattern 4: Stable ID Generation

**What:** Deterministic paragraph ID using SHA-256 of plain text content.
**When to use:** `stable-id.ts` module, called for every extracted paragraph.

```typescript
// Source: Node built-in crypto — [VERIFIED: Node 25.8.2 in environment]
import { createHash } from 'node:crypto'

export function computeContentHash(plainText: string): string {
  return createHash('sha256')
    .update(plainText, 'utf8')
    .digest('hex')
    .slice(0, 12)  // D-13: first 12 hex chars
}

export function buildStableId(
  sectionPath: string,   // e.g. "history/early_period"
  contentHash: string,   // 12-char hex
  revisionId: number,
): string {
  return `${sectionPath}:${contentHash}:${revisionId}`  // D-11
}

export function normalizeSectionPath(headings: string[]): string {
  // D-12: spaces → underscores, lowercase, joined with /
  return headings
    .map(h => h.toLowerCase().replace(/\s+/g, '_'))
    .join('/')
}
```

### Pattern 5: pg-boss Job Registration

**What:** Register the `ingestion-jobs` queue in the worker process.
**When to use:** Extend `src/workers/index.ts`.

```typescript
// Source: pg-boss v12 README — [VERIFIED: package installed, API confirmed]
// pg-boss send from API route:
const jobId = await boss.send('ingestion-jobs', {
  url: validatedUrl,
  title: articleTitle,
})

// pg-boss work in worker process (src/workers/index.ts):
await boss.createQueue('ingestion-jobs', {
  retryLimit: 3,          // [ASSUMED] — within Claude's Discretion
  retryDelay: 30,         // [ASSUMED] — 30s initial retry delay
  retryBackoff: true,     // exponential retry backoff at queue level
  expireInSeconds: 600,   // [ASSUMED] — 10 min job expiration
  deadLetter: 'ingestion-failures',
})

await boss.work('ingestion-jobs', async ([job]) => {
  await runIngestionJob(job.data)
})
```

### Pattern 6: Drizzle Atomic Transaction

**What:** Insert article, sections, and paragraphs in a single transaction.
**When to use:** End of the ingestion worker after all parsing is complete.

```typescript
// Source: Drizzle ORM docs — [VERIFIED: drizzle-orm@0.45.2 installed]
await db.transaction(async (tx) => {
  const [article] = await tx.insert(articles).values({
    title, wikiUrl, revisionId, language: 'en',
  }).returning()

  for (const section of parsedSections) {
    const [sec] = await tx.insert(sections).values({
      articleId: article.id,
      title: section.title,
      path: section.path,
      position: section.position,
    }).returning()

    await tx.insert(paragraphs).values(
      section.paragraphs.map((p, i) => ({
        sectionId: sec.id,
        stableId: p.stableId,
        content: p.plainText,
        contentHash: p.contentHash,
        position: i,
      }))
    )
  }
})
```

### Pattern 7: JSDOM Section Walk — MediaWiki HTML Structure

**What:** MediaWiki renders headings as `<div class="mw-heading mw-headingN">` wrappers (not bare `<hN>` tags). Paragraphs are siblings in the flat HTML, not nested inside section elements.
**When to use:** The section walk must account for this structure.

```
MediaWiki HTML structure (verified against Eiffel Tower, 2026-04-19):
<div class="mw-content-ltr mw-parser-output">
  <p>Lead paragraph...</p>           ← lead section (no heading)
  <div class="mw-heading mw-heading2">
    <h2 id="History">History</h2>
    <span class="mw-editsection">...</span>   ← stripped by D-08
  </div>
  <div class="mw-heading mw-heading3">
    <h3 id="Origin">Origin</h3>
    ...
  </div>
  <p>First paragraph of Origin...</p>
  <p>Second paragraph...</p>
  <div class="mw-heading mw-heading2">
    <h2 id="Design">Design</h2>
  </div>
  <p>...</p>
</div>
```

The walk algorithm: iterate children of `.mw-parser-output`; when a `.mw-heading` div is encountered, update the current section context; when a `<p>` is encountered, assign it to the current section.

[VERIFIED: live API response from en.wikipedia.org — Eiffel Tower article HTML, 2026-04-19]

### Anti-Patterns to Avoid

- **Using `prop=sections` (deprecated):** Emits warnings since MediaWiki 1.46; use `prop=tocdata` instead. The tocdata response shape differs slightly: `tocLevel`/`hLevel` instead of `toclevel`/`level`, `codepointOffset` instead of `byteoffset`.
- **Fetching each section separately:** The full-page `action=parse` returns complete HTML in one request. Fetching section=N for each of 36 sections = 36 API calls vs 1. Use full-page fetch then parse client-side.
- **Parallel MediaWiki requests:** Explicitly prohibited by API etiquette. Worker processes jobs sequentially (D-14).
- **Computing content hash on raw HTML:** Hash on `textContent` (plain text), not HTML — ensures hash stability across minor HTML rendering changes (D-10).
- **Not stripping `.mw-editsection` before textContent extraction:** These spans contain "[edit]" text that would corrupt paragraph content and hashes.
- **Trusting `<p>` tags globally:** Infoboxes, navboxes, and reference lists can contain `<p>` tags. Must strip containers first (D-08), then extract `<p>`.
- **Skipping empty paragraph filter:** Wikipedia generates empty `<p>` tags as spacers. Filter `plainText.trim() === ''` before inserting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOM parsing of HTML string | Custom regex / string splitting | JSDOM (D-07) | Wikipedia HTML has nested templates, partial tags, mixed content; regex is a maintenance nightmare |
| SHA-256 hashing | Custom hash function | `node:crypto` built-in | SHA-256 is available without any npm package; hand-rolling introduces bugs |
| Job queue with retry | Custom polling loop | pg-boss (already installed) | Exactly-once delivery, dead-letter routing, retry backoff — all built-in |
| Wikipedia URL parsing | Manual string manipulation | `URL` Web API + zod | URL normalization (mobile URLs, URL-encoded titles) is tricky; use stdlib |
| DB transaction | Separate inserts with manual rollback | `db.transaction()` | Drizzle transactions are atomic — partial ingestion creates orphaned rows |

**Key insight:** The DOM parsing and job queue domains both have well-solved libraries already in the project. The only genuinely new code is the HTML traversal logic and stable ID algorithm.

## Common Pitfalls

### Pitfall 1: `prop=sections` Deprecation Warning

**What goes wrong:** CONTEXT.md D-01 specifies `prop=text|sections` but `prop=sections` is deprecated since MediaWiki 1.46 and will eventually be removed. The API still returns data but logs a warning in every response.

**Why it happens:** The CONTEXT.md was written based on documentation that referenced `prop=sections`; the deprecation was confirmed by live API test on 2026-04-19.

**How to avoid:** Use `prop=text|tocdata|revid` instead. The `tocdata` object contains `tocdata.sections[]` with the same hierarchy data. The field names differ slightly: `tocLevel` (not `toclevel`), `hLevel` (not `level`), `codepointOffset` (not `byteoffset`).

**Warning signs:** `data.warnings.parse['*']` contains "prop=sections is deprecated" in API response.

[VERIFIED: live MediaWiki API 2026-04-19]

### Pitfall 2: JSDOM Not in Production Dependencies

**What goes wrong:** JSDOM is a transitive dependency (pulled in by Vitest) but is not a direct `dependencies` entry in package.json. If Vitest is moved to devDependencies-only in a production build, JSDOM disappears from the runtime.

**How to avoid:** Add `jsdom` and `@types/jsdom` as explicit production dependencies via `npm install jsdom @types/jsdom`.

[VERIFIED: package.json — jsdom not present in dependencies or devDependencies]

### Pitfall 3: Section Walk Misses Lead Section

**What goes wrong:** The article "lead" (introduction) appears before the first `<div class="mw-heading">`. If the walk only starts collecting paragraphs after encountering a heading, the lead paragraphs are lost.

**How to avoid:** Initialize the section context as `{ title: 'lead', path: 'lead', level: 0 }` before starting the walk. Paragraphs before the first heading belong to the lead section.

[VERIFIED: Eiffel Tower HTML shows lead paragraphs before first .mw-heading div]

### Pitfall 4: wikiUrl Unique Constraint Conflict on Re-Submit

**What goes wrong:** If a reviewer pastes the same Wikipedia URL twice, the articles table `unique` constraint on `wiki_url` throws during the transaction. The pg-boss job fails and reports an error.

**How to avoid:** In the POST route handler, check if the article already exists (`SELECT FROM articles WHERE wikiUrl = ?`) before enqueuing the job. If it exists, return 200 with the existing article data instead of 202. Alternatively, use `INSERT ... ON CONFLICT DO NOTHING` and skip re-ingestion.

[VERIFIED: schema.ts — wikiUrl has `.unique()` constraint]

### Pitfall 5: pg-boss `boss.send()` Before `boss.start()`

**What goes wrong:** The API route handler calls `boss.send()` but the boss instance hasn't been started (`boss.start()` must be called before any operations). In the current `getBoss()` singleton, `start()` is NOT called — only the constructor and error handler are set up.

**How to avoid:** The worker process calls `boss.start()` before registering queues. For the API route, `getBoss()` must also ensure the boss is started. Either: (a) call `boss.start()` inside `getBoss()` and track started state, or (b) use a separate `getStartedBoss()` function that awaits `boss.start()` idempotently. pg-boss `start()` is idempotent (calling it twice is safe).

[VERIFIED: src/lib/boss.ts — `boss.start()` is not called in getBoss()]

### Pitfall 6: Empty `<p>` Tags and Single-Character Paragraphs

**What goes wrong:** MediaWiki generates `<p>` spacer tags (empty content) and reference-style single-character paragraphs. These inflate the paragraph count and generate useless DB rows with empty or trivial content hashes.

**How to avoid:** Filter paragraphs where `plainText.trim().length < 10` (or similar minimum). This eliminates spacers while keeping real short paragraphs. Adjust threshold based on testing against stub articles.

[VERIFIED: PITFALLS.md Pitfall 2 — "Empty paragraphs or single-character paragraphs appear in the extracted list"]

### Pitfall 7: URL Normalization Edge Cases

**What goes wrong:** Wikipedia URLs come in multiple forms that all resolve to the same article:
- `https://en.wikipedia.org/wiki/Eiffel_Tower`
- `https://en.m.wikipedia.org/wiki/Eiffel_Tower` (mobile)
- `https://en.wikipedia.org/wiki/Eiffel%20Tower` (URL-encoded)
- `http://en.wikipedia.org/wiki/Eiffel_Tower` (HTTP)

Storing different URL forms for the same article bypasses the `wikiUrl` unique constraint and creates duplicate articles.

**How to avoid:** Normalize incoming URLs: (a) force HTTPS, (b) replace `en.m.wikipedia.org` with `en.wikipedia.org`, (c) URL-decode the path, (d) replace spaces with underscores, (e) remove trailing slashes and query params. Extract the article title from the normalized URL for the `action=parse` API call.

[ASSUMED — standard normalization concern; not verified against specific Wikipedia redirect behavior]

## Code Examples

Verified patterns from official sources:

### MediaWiki API — Correct Request (Non-Deprecated)

```typescript
// Source: verified against live Wikipedia API 2026-04-19
// DO NOT use prop=sections (deprecated since MediaWiki 1.46)
// USE prop=tocdata instead

const apiUrl = new URL('https://en.wikipedia.org/w/api.php')
apiUrl.searchParams.set('action', 'parse')
apiUrl.searchParams.set('page', title)          // article title, spaces as underscores
apiUrl.searchParams.set('prop', 'text|tocdata|revid')  // correct props
apiUrl.searchParams.set('format', 'json')
apiUrl.searchParams.set('formatversion', '2')   // cleaner response format

const res = await mediawikiFetchWithBackoff(apiUrl.toString())
if (!res.ok) throw new Error(`MediaWiki API error: ${res.status}`)

const data = await res.json() as MediaWikiParseResponse

// Type shape (verified):
interface MediaWikiParseResponse {
  parse: {
    title: string
    pageid: number
    revid: number
    text: string           // full HTML (with formatversion=2, not text['*'])
    tocdata: {
      sections: Array<{
        tocLevel: number   // 1 = top-level, 2 = sub, etc.
        hLevel: number     // 2 = h2, 3 = h3
        line: string       // heading text (may contain HTML)
        number: string     // e.g. "1.2"
        index: string      // section index for action=parse&section=N
        anchor: string     // DOM id of heading
        codepointOffset: number
      }>
    }
    showtoc: string
  }
}
```

### JSDOM Section Walk

```typescript
// Source: JSDOM 29 API + live Wikipedia HTML inspection 2026-04-19
import { JSDOM } from 'jsdom'

interface ParsedParagraph {
  plainText: string
  contentHash: string
  stableId: string
  position: number
}

interface ParsedSection {
  title: string
  path: string
  position: number
  paragraphs: ParsedParagraph[]
}

function parseWikipediaHtml(html: string, revisionId: number): ParsedSection[] {
  const { document } = new JSDOM(html).window

  // Strip non-content elements (D-08)
  for (const sel of ['.infobox', '.navbox', '.reflist', '#toc',
                     '.mw-editsection', '.ambox', '.tmbox',
                     '.reference', 'style', 'script', '.mw-references-wrap']) {
    document.querySelectorAll(sel).forEach(el => el.remove())
  }

  const root = document.querySelector('.mw-parser-output')
  if (!root) return []

  const sections: ParsedSection[] = []
  let currentHeadings: string[] = ['lead']  // lead section before first heading
  let currentSection: ParsedSection = {
    title: 'lead', path: 'lead', position: 0, paragraphs: [],
  }
  sections.push(currentSection)

  let sectionPos = 0
  let paraPos = 0

  for (const child of Array.from(root.children)) {
    // Detect heading wrappers: <div class="mw-heading mw-headingN">
    if (child.classList.contains('mw-heading')) {
      const heading = child.querySelector('h2, h3, h4, h5, h6')
      if (!heading) continue

      const level = parseInt(heading.tagName[1], 10)  // 2-6
      const title = heading.textContent?.trim() ?? ''

      // Build heading stack (D-12)
      if (level === 2) currentHeadings = [title]
      else if (level === 3) currentHeadings = [currentHeadings[0] ?? title, title]
      else currentHeadings = [...currentHeadings.slice(0, level - 2), title]

      const path = normalizeSectionPath(currentHeadings)
      sectionPos++
      paraPos = 0
      currentSection = { title, path, position: sectionPos, paragraphs: [] }
      sections.push(currentSection)
    } else if (child.tagName === 'P') {
      const plainText = child.textContent?.trim() ?? ''
      if (plainText.length < 10) continue  // skip spacers/empties
      const contentHash = computeContentHash(plainText)
      const stableId = buildStableId(currentSection.path, contentHash, revisionId)
      currentSection.paragraphs.push({ plainText, contentHash, stableId, position: paraPos++ })
    }
  }

  return sections.filter(s => s.paragraphs.length > 0)
}
```

### URL Normalization

```typescript
// Source: [ASSUMED] — standard URL normalization; use URL Web API
export function normalizeWikipediaUrl(raw: string): { normalized: string; title: string } {
  const url = new URL(raw)

  // Force desktop hostname
  if (url.hostname === 'en.m.wikipedia.org') {
    url.hostname = 'en.wikipedia.org'
  }

  // Force HTTPS
  url.protocol = 'https:'

  // Extract title from path: /wiki/Eiffel_Tower → Eiffel_Tower
  const match = url.pathname.match(/^\/wiki\/(.+)$/)
  if (!match) throw new Error('Not a Wikipedia article URL')

  // Decode URL encoding, normalize spaces to underscores
  const title = decodeURIComponent(match[1]).replace(/\s+/g, '_')

  const normalized = `https://en.wikipedia.org/wiki/${title}`
  return { normalized, title }
}

// Zod schema for POST body validation:
import { z } from 'zod'
export const ingestBodySchema = z.object({
  url: z.string().url().refine(
    url => url.includes('wikipedia.org/wiki/'),
    'Must be an English Wikipedia article URL'
  ),
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prop=sections` in action=parse | `prop=tocdata` | MediaWiki 1.46 (confirmed live 2026-04-19) | Must update D-01 — use tocdata not sections |
| `text['*']` response field (formatversion=1) | `text` as string (formatversion=2) | MediaWiki API formatversion=2 | Simpler response handling — no need for `text['*']` |
| Cheerio for Wikipedia HTML parsing | JSDOM (D-07 decision) | Decision made in discuss phase | JSDOM gives full DOM + standard APIs |

**Deprecated/outdated:**
- `prop=sections`: deprecated since MediaWiki 1.46; use `prop=tocdata`. Still returns data but with deprecation warnings.
- `formatversion=1` default: response wraps `text` as `{ '*': '...' }`. Use `formatversion=2` to get `text` as a plain string.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pg-boss job config: retryLimit=3, retryDelay=30s, expireInSeconds=600 | Standard Stack / Pattern 5 | Job may retry too aggressively or expire before completion on slow articles |
| A2 | Minimum paragraph text length filter of 10 chars | Common Pitfalls #6 | Too aggressive = drops real short paragraphs; too loose = keeps spacers |
| A3 | URL normalization handles all Wikipedia URL variants (mobile, HTTP, encoded) | Code Examples | Edge cases may exist for special pages, section anchors in URL, international variants |
| A4 | Section heading stack algorithm (level 2 resets stack) handles deeply nested headings | Code Examples | Articles with h4/h5 headings may produce unexpected paths |

## Open Questions (RESOLVED)

1. **How to handle disambiguation pages**
   - What we know: Disambiguation pages have no prose paragraphs — they're lists of links. The parser will find no `<p>` elements with real content.
   - What's unclear: Should the ingestion job fail, succeed with 0 paragraphs, or detect the disambiguation class (`.disambig`) and reject at job time?
   - Recommendation: Claude's Discretion (from CONTEXT.md) — detect `#disambig` or `.disambiguation` class in JSDOM; if found, mark job as failed with reason "disambiguation page" and surface error to API caller.
   - **RESOLVED:** Disambiguation pages will produce empty articles (0 paragraphs after filtering). The parser returns `sections.filter(s => s.paragraphs.length > 0)` which yields an empty array for disambiguation pages. This is acceptable — the article row is created with no sections/paragraphs, which is a valid state. No special detection needed in Phase 2; disambiguation detection can be added as a future enhancement if needed.

2. **Should raw HTML be stored for debugging?**
   - What we know: The articles table has no `rawHtml` column in the existing schema.
   - What's unclear: Whether to add it or leave it out.
   - Recommendation: Claude's Discretion — do not store raw HTML by default (bloats DB); log to file or skip entirely in Phase 2.
   - **RESOLVED:** Not storing raw HTML. No schema column exists and adding one is out of scope for Phase 2.

3. **getBoss() start() lifecycle in API routes**
   - What we know: `src/lib/boss.ts` creates a PgBoss instance but does NOT call `boss.start()`. The worker process calls `start()` separately.
   - What's unclear: Whether `boss.send()` requires `boss.start()` to be called first in the API route context.
   - Recommendation: Check pg-boss docs for whether `send()` can be called without `start()`. If not, the API route needs a lazy-started boss. The planner should address this explicitly.
   - **RESOLVED:** Plan 02-03 adds `getStartedBoss()` to `src/lib/boss.ts` which lazily calls `boss.start()` before returning the instance. The API route uses `getStartedBoss()` instead of `getBoss()`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | JSDOM, crypto, workers | ✓ | 25.8.2 | — |
| Docker | PostgreSQL for tests | ✓ | 29.3.1 | — |
| PostgreSQL (via Docker) | pg-boss, Drizzle | configured in docker-compose.yml | 16 (image) | — |
| jsdom (npm) | Ingestion parser | not in package.json dependencies | must install 29.0.2 | — |
| @types/jsdom | TypeScript types | not in package.json | must install 28.0.1 | — |

**Missing dependencies with no fallback:**
- `jsdom` and `@types/jsdom` must be added to `dependencies` in package.json before parser code can be written.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run tests/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGEST-01 | POST /api/articles validates URL and returns 202 | unit | `npx vitest run tests/features/ingestion/route.test.ts` | ❌ Wave 0 |
| INGEST-01 | Duplicate URL returns 200 (not re-enqueue) | unit | `npx vitest run tests/features/ingestion/route.test.ts` | ❌ Wave 0 |
| INGEST-02 | parseWikipediaHtml produces correct section/paragraph tree | unit | `npx vitest run tests/features/ingestion/parse-article.test.ts` | ❌ Wave 0 |
| INGEST-02 | stableId = sectionPath:contentHash:revisionId format | unit | `npx vitest run tests/features/ingestion/stable-id.test.ts` | ❌ Wave 0 |
| INGEST-02 | Infobox/navbox content does NOT appear in paragraph list | unit | `npx vitest run tests/features/ingestion/parse-article.test.ts` | ❌ Wave 0 |
| INGEST-02 | contentHash is SHA-256 of plainText, 12 hex chars | unit | `npx vitest run tests/features/ingestion/stable-id.test.ts` | ❌ Wave 0 |
| INGEST-03 | article row has title, revisionId, fetchedAt, language | integration | `npx vitest run tests/features/ingestion/ingest-worker.test.ts` | ❌ Wave 0 |
| INGEST-04 | mediawikiFetch retries on 429, delays double each time | unit | `npx vitest run tests/lib/mediawiki.test.ts` (extend existing) | partial |
| INGEST-04 | After 5 retries with 429, throws error | unit | `npx vitest run tests/lib/mediawiki.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/features/ingestion/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/features/ingestion/parse-article.test.ts` — covers INGEST-02 (parsing + stripping)
- [ ] `tests/features/ingestion/stable-id.test.ts` — covers INGEST-02 (ID generation)
- [ ] `tests/features/ingestion/route.test.ts` — covers INGEST-01 (API route)
- [ ] `tests/features/ingestion/ingest-worker.test.ts` — covers INGEST-03 (DB persistence)
- [ ] Extend `tests/lib/mediawiki.test.ts` — covers INGEST-04 (backoff retry logic)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Ingestion is reviewer-initiated; auth handled by Phase 1 Auth.js |
| V3 Session Management | no | No session changes in this phase |
| V4 Access Control | yes | POST /api/articles must require authenticated reviewer session |
| V5 Input Validation | yes | Zod schema validates URL; title extracted server-side — never passed raw to API |
| V6 Cryptography | partial | SHA-256 via node:crypto — not a secret, just a content hash; no secret material |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via URL field | Spoofing | Validate URL strictly — must match `en.wikipedia.org/wiki/` pattern; do not allow arbitrary host |
| Job flooding (submitting thousands of URLs) | DoS | Rate-limit POST /api/articles per authenticated user; pg-boss queue depth monitoring |
| MediaWiki response injection | Tampering | Parse API response as JSON, never eval; JSDOM sandboxes HTML execution |
| Disk/DB exhaustion from giant articles | DoS | Cap paragraph count per article (e.g., max 500); reject if tocdata sections exceed threshold |

## Sources

### Primary (HIGH confidence)
- Live MediaWiki API — tested against `en.wikipedia.org/w/api.php` on 2026-04-19; verified `prop=tocdata` works, `prop=sections` deprecated, response shapes confirmed
- `src/db/schema.ts` — verified table structure, column names, constraints
- `src/lib/mediawiki.ts` — verified existing wrapper
- `src/lib/boss.ts` — verified getBoss() lacks start()
- `src/workers/index.ts` — verified existing queue patterns
- `package.json` — verified installed packages and versions
- `vitest.config.ts` + `tests/` — verified test infrastructure

### Secondary (MEDIUM confidence)
- PITFALLS.md — project-specific pitfalls for Wikipedia parsing and rate limiting
- ARCHITECTURE.md — ingestion service design patterns
- STACK.md — technology decisions with version verification

### Tertiary (LOW confidence / ASSUMED)
- pg-boss job configuration parameters (retry count, delay, expiration) — [ASSUMED]; Claude's Discretion per CONTEXT.md
- Paragraph minimum length filter threshold (10 chars) — [ASSUMED]; needs empirical validation

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — verified packages, live API calls
- Architecture: HIGH — verified against existing code, live HTML structure
- Pitfalls: HIGH — verified against live API (deprecation), code inspection (boss.start), schema
- MediaWiki API deprecation (prop=sections → tocdata): HIGH — live API confirmed

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (MediaWiki API is stable; tocdata was introduced in MediaWiki 1.46 which is the current release line)
