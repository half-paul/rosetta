# Phase 1: Foundation - Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 19 (new files — greenfield project, no existing source code)
**Analogs found:** 0 / 19 — all patterns sourced from RESEARCH.md verified examples

> **Greenfield note:** No `src/` directory exists. No analog search was performed against the
> codebase because there is no codebase yet. This phase ESTABLISHES the patterns all future
> phases follow. Every pattern below is drawn directly from verified official-source examples
> in RESEARCH.md and UI-SPEC.md. Line-number citations reference those planning documents, not
> source files (which do not yet exist).

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/db/schema.ts` | model | CRUD | none | no-analog |
| `src/db/index.ts` | config | request-response | none | no-analog |
| `drizzle.config.ts` | config | — | none | no-analog |
| `src/auth.ts` | config | request-response | none | no-analog |
| `middleware.ts` | middleware | request-response | none | no-analog |
| `src/app/api/auth/[...nextauth]/route.ts` | route | request-response | none | no-analog |
| `src/app/login/page.tsx` | component | request-response | none | no-analog |
| `src/app/dashboard/page.tsx` | component | request-response | none | no-analog |
| `src/app/layout.tsx` | component | — | none | no-analog |
| `src/lib/ai-registry.ts` | utility | request-response | none | no-analog |
| `src/lib/mediawiki.ts` | utility | request-response | none | no-analog |
| `src/lib/boss.ts` | service | event-driven | none | no-analog |
| `src/workers/index.ts` | service | event-driven | none | no-analog |
| `src/types/index.ts` | utility | — | none | no-analog |
| `vitest.config.ts` | config | — | none | no-analog |
| `tests/db/schema.test.ts` | test | CRUD | none | no-analog |
| `tests/jobs/boss.test.ts` | test | event-driven | none | no-analog |
| `tests/lib/mediawiki.test.ts` | test | request-response | none | no-analog |
| `tests/lib/ai-registry.test.ts` | test | request-response | none | no-analog |
| `docker-compose.yml` | config | — | none | no-analog |
| `.env.local.example` | config | — | none | no-analog |

---

## Pattern Assignments

### `src/db/schema.ts` (model, CRUD)

**Source:** RESEARCH.md Pattern 1 (lines 182–309)

**Imports pattern:**
```typescript
import {
  pgTable, text, integer, timestamp, uuid, pgEnum,
  primaryKey, uniqueIndex
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
```

**Enum pattern** — use `pgEnum` for review status, never raw text:
```typescript
export const reviewStatusEnum = pgEnum('review_status', [
  'PENDING', 'AI_ANALYZED', 'HUMAN_APPROVED', 'HUMAN_REJECTED', 'PUBLISHED'
])
```

**NextAuth table pattern** — required columns for `@auth/drizzle-adapter`; add custom columns
alongside but never rename required ones (Pitfall 3):
```typescript
export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // Application-only extensions (not managed by adapter):
  role: text('role').notNull().default('reviewer'),
  passwordHash: text('password_hash'),   // Pitfall 6: must live here, not in a join table
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: timestamp('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })]
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    email: text('email').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.email, vt.token] })]
)
```

**Domain table pattern** — uuid PKs (never serial), soft-delete via `deletedAt`, timestamps on
every table (decisions D-08, D-09, D-10):
```typescript
export const articles = pgTable('article', {
  id: uuid('id').primaryKey().defaultRandom(),        // D-08: uuid, not serial
  title: text('title').notNull(),
  wikiUrl: text('wiki_url').notNull().unique(),
  revisionId: integer('revision_id').notNull(),
  language: text('language').notNull().default('en'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),  // D-10
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),  // D-10
  deletedAt: timestamp('deleted_at', { withTimezone: true }),                          // D-09
})

export const paragraphs = pgTable('paragraph', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  // Stable anchor — locked decision: section_path + content_hash + revision_id
  stableId: text('stable_id').notNull(),   // e.g. "History.Early_life:sha256abc:rev123456"
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})
```

**Type inference pattern** — always use `$inferInsert` / `$inferSelect`, never hand-write types:
```typescript
type NewArticle = typeof articles.$inferInsert
type Article    = typeof articles.$inferSelect
```

**Critical anti-patterns to avoid:**
- Never use `serial` / auto-increment PKs — use `uuid().defaultRandom()` (D-08)
- Never use raw text for `review_status` — use `pgEnum` (RESEARCH.md anti-patterns)
- Never store raw HTML in `paragraph.content` — content text only; HTML goes to cache (Phase 2)

---

### `src/db/index.ts` (config, request-response)

**Source:** RESEARCH.md Standard Stack — Drizzle + pg driver

**Pattern** — export a single `db` instance; use `@neondatabase/serverless` for Vercel deployment,
standard `pg` for local Docker:
```typescript
// For Neon/Vercel (production path):
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })

// For local Docker (alternative):
// import { Pool } from 'pg'
// import { drizzle } from 'drizzle-orm/node-postgres'
// const pool = new Pool({ connectionString: process.env.DATABASE_URL! })
// export const db = drizzle(pool, { schema })
```

---

### `drizzle.config.ts` (config)

**Source:** RESEARCH.md Pitfall 4 (pg-boss schema conflict) — scope must be explicit:
```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',    // Explicit path — never glob; keeps pg-boss pgboss schema out
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

**Critical:** `schema` must point to `./src/db/schema.ts` specifically — a glob pattern risks
capturing pg-boss internal tables (Pitfall 4).

---

### `src/auth.ts` (config, request-response)

**Source:** RESEARCH.md Pattern 2 (lines 319–363)

**Full pattern:**
```typescript
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import bcryptjs from 'bcryptjs'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    GitHub,
    Google,
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const [user] = await db.select().from(users)
          .where(eq(users.email, credentials.email as string))
        if (!user || !user.passwordHash) return null
        const valid = await bcryptjs.compare(
          credentials.password as string,
          user.passwordHash
        )
        return valid ? user : null
      },
    }),
  ],
  // Pitfall 2: Credentials + database strategy conflict. Use jwt for Phase 1.
  // If database strategy is needed, add explicit session callbacks and test
  // that sessions survive server restart before committing.
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
})
```

**Security requirements:**
- `AUTH_SECRET` must be set (`npx auth secret` to generate); never hand-roll
- bcryptjs work factor must be ≥ 12 (`bcryptjs.hash(password, 12)`)
- LLM API keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) must never use `NEXT_PUBLIC_` prefix

---

### `middleware.ts` (middleware, request-response)

**Source:** RESEARCH.md Pattern 2 (lines 359–363)

**Pattern** — re-export `auth` as default middleware with explicit route matcher:
```typescript
export { auth as default } from '@/auth'

export const config = {
  // Protect all dashboard routes and review API routes.
  // Never use a catch-all '/(.*)'  — that intercepts NextAuth callback routes.
  matcher: ['/dashboard/:path*', '/api/reviews/:path*'],
}
```

**Critical:** The matcher must NOT include `/api/auth/:path*` — that would intercept NextAuth's
own callback handlers. Only list routes that require session.

---

### `src/app/api/auth/[...nextauth]/route.ts` (route, request-response)

**Source:** RESEARCH.md Code Examples — NextAuth v5 Route Handler (lines 601–607)

**Pattern** — three-line file; never add logic here:
```typescript
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

---

### `src/app/login/page.tsx` (component, request-response)

**Source:** UI-SPEC.md — Login Page layout, interaction contract, copywriting contract

**Layout pattern:**
```tsx
// Page wrapper: full-screen centered flex
// <div className="min-h-screen flex items-center justify-center bg-background">

// Card: max-w-sm with p-8
// Floating title above card border, not inside card

// Component stack (top to bottom inside card):
//   <Alert variant="destructive"> (conditional, only on auth error)
//   <Label htmlFor="email">Email address</Label>
//   <Input id="email" type="email" autoFocus required />
//   <Label htmlFor="password">Password</Label>
//   <Input id="password" type="password" required />
//   <Button type="submit" className="w-full" disabled={isLoading}>
//     {isLoading ? <><Spinner /> Signing in...</> : 'Sign in'}
//   </Button>
//   <div className="flex items-center gap-2">
//     <Separator /> <span className="text-muted-foreground text-sm">or continue with</span> <Separator />
//   </div>
//   <Button variant="outline" className="w-full min-h-[44px]">Continue with Google</Button>
//   <Button variant="outline" className="w-full min-h-[44px]">Continue with GitHub</Button>
```

**Accessibility requirements (UI-SPEC.md):**
- `<Label htmlFor="...">` explicit `for` association on all inputs
- `<Alert role="alert">` so screen readers announce errors on insertion
- Submit button: `aria-disabled="true"` + `aria-busy="true"` when loading
- OAuth icon SVGs: `aria-hidden="true"` (button text provides the accessible label)
- Tab order: Email → Password → Sign in → Google → GitHub

**Interaction pattern:**
- Validate on submit only, not on every keystroke
- On error: show `<Alert>` above form, keep inputs filled, return focus to email field
- On success: NextAuth handles redirect to `/dashboard` via `callbackUrl`

**Shadcn components required:** `button`, `input`, `label`, `card`, `separator`, `alert`

---

### `src/app/dashboard/page.tsx` (component, request-response)

**Source:** UI-SPEC.md — Dashboard Shell layout, interaction contract

**Pattern** — server component with auth check; empty state only in Phase 1:
```tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session) redirect('/login')   // Belt-and-suspenders; middleware handles most cases

  return (
    // Layout: flex flex-col min-h-screen
    // Topnav: h-14 border-b bg-background px-6 flex items-center justify-between
    //   Left: "Rosetta" wordmark
    //   Right: reviewer display name + dropdown placeholder
    // Main: flex-1 flex items-center justify-center
    //   Empty state: "No articles yet" heading + body copy
    <></>
  )
}
```

**Empty state copy (from UI-SPEC.md copywriting contract):**
- Heading: "No articles yet"
- Body: "Articles you submit for fact-checking will appear here. Come back after Phase 2 is complete."

---

### `src/app/layout.tsx` (component)

**Source:** RESEARCH.md Standard Stack (Next.js 16 defaults) + UI-SPEC.md Typography

**Font pattern** — Geist Sans + Geist Mono loaded via `next/font/google`, applied as CSS variables:
```tsx
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

---

### `src/lib/ai-registry.ts` (utility, request-response)

**Source:** RESEARCH.md Pattern 3 (lines 372–393) + Code Examples (lines 531–550)

**Full pattern:**
```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'

export const registry = createProviderRegistry({
  anthropic,
  openai,
})

// Usage in any server-side pipeline module (Phase 3+):
// const model = registry.languageModel(process.env.AI_MODEL!)
// AI_MODEL=anthropic:claude-sonnet-4-5-20250929  or  openai:gpt-4.1
```

**Anti-pattern to enforce:** Never import `@ai-sdk/anthropic` or `@ai-sdk/openai` outside this
file. All LLM calls go through `registry.languageModel(process.env.AI_MODEL!)` (RESEARCH.md
anti-patterns section). This is the boundary the architecture enforces.

**Required env vars:**
```
AI_MODEL=anthropic:claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

---

### `src/lib/mediawiki.ts` (utility, request-response)

**Source:** RESEARCH.md Pattern 5 (lines 448–465)

**Full pattern:**
```typescript
const USER_AGENT = 'Rosetta/1.0 (https://rosetta.example.com; contact@rosetta.example.com)'

export async function mediawikiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...init?.headers,    // Caller headers come after so they can override non-User-Agent headers
    },
  })
}
```

**Phase 1 scope:** Module + unit test only. No real MediaWiki API calls in Phase 1. The unit test
verifies INFRA-03: `User-Agent` header is set on every call and matches Wikimedia policy format.

---

### `src/lib/boss.ts` (service, event-driven)

**Source:** RESEARCH.md Pattern 4 (lines 403–441)

**Singleton pattern** — used by API routes to enqueue jobs without calling `start()`:
```typescript
import { PgBoss } from 'pg-boss'

let boss: PgBoss | null = null

export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!)
    boss.on('error', console.error)
  }
  return boss
}
```

**Critical anti-pattern:** Never call `boss.start()` inside API route handlers. `start()` runs
internal maintenance and schema migrations — it is a server lifecycle call, not a per-request
call (RESEARCH.md anti-patterns section).

---

### `src/workers/index.ts` (service, event-driven)

**Source:** RESEARCH.md Pattern 4 (lines 418–441) + Code Examples (lines 553–577)

**Worker entrypoint pattern** — separate process, calls `start()` once at startup:
```typescript
import { PgBoss } from 'pg-boss'

async function startWorkers() {
  const boss = new PgBoss(process.env.DATABASE_URL!)
  boss.on('error', console.error)
  await boss.start()    // Runs pg-boss schema migrations + maintenance — call once, at startup

  // Queue with retry, backoff, and dead-letter routing:
  await boss.createQueue('analysis-jobs', {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 900,
    deadLetter: 'analysis-failures',
  })

  // Worker registration — array destructure pattern for batch consumption:
  await boss.work('analysis-jobs', async ([job]) => {
    // process job.data
    // Return without throwing = job.complete()
    // Throw = job.fail() → retry per queue policy
    console.log('Processing job', job.id, job.data)
  })
}

startWorkers().catch(console.error)
```

**Runtime requirement:** Node.js ≥ 22.12.0 (Pitfall 1). Pin in `.nvmrc` and `package.json` engines
field. Current environment is Node 25.8.2 — requirement is satisfied.

---

### `src/types/index.ts` (utility)

**Purpose:** Shared domain types inferred from Drizzle schema + explicitly declared enums for
application-layer use.

**Pattern:**
```typescript
import type { articles, sections, paragraphs, claims, commentaries, reviews, scores } from '@/db/schema'

// Type-safe domain types inferred from schema (single source of truth):
export type Article    = typeof articles.$inferSelect
export type NewArticle = typeof articles.$inferInsert
export type Section    = typeof sections.$inferSelect
export type Paragraph  = typeof paragraphs.$inferSelect
export type Claim      = typeof claims.$inferSelect
export type Commentary = typeof commentaries.$inferSelect
export type Review     = typeof reviews.$inferSelect
export type Score      = typeof scores.$inferSelect

// Review workflow states (matches pgEnum in schema.ts):
export type ReviewStatus =
  | 'PENDING'
  | 'AI_ANALYZED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'PUBLISHED'
```

---

### `vitest.config.ts` (config)

**Source:** RESEARCH.md Validation Architecture (lines 669–701)

**Pattern:**
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',       // Default; override to 'jsdom' in component test files
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

### `tests/db/schema.test.ts` (test, CRUD)

**Coverage:** INFRA-01 — all 12 schema tables exist with correct columns and FK constraints

**Pattern** — integration test requiring live `DATABASE_URL`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/db'
import { articles, sections, paragraphs } from '@/db/schema'

describe('Schema integration', () => {
  it('articles table accepts valid insert', async () => {
    const [row] = await db.insert(articles).values({
      title: 'Test',
      wikiUrl: 'https://en.wikipedia.org/wiki/Test',
      revisionId: 1,
    }).returning()
    expect(row.id).toBeDefined()
    expect(row.createdAt).toBeDefined()
  })

  it('FK cascade: deleting article removes sections', async () => {
    // insert article → insert section → delete article → confirm section gone
  })
})
```

---

### `tests/jobs/boss.test.ts` (test, event-driven)

**Coverage:** INFRA-02 — pg-boss enqueue → worker picks up → completes; exactly-once confirmed

**Pattern:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PgBoss } from 'pg-boss'

describe('pg-boss job lifecycle', () => {
  let boss: PgBoss

  beforeAll(async () => {
    boss = new PgBoss(process.env.DATABASE_URL!)
    boss.on('error', console.error)
    await boss.start()
  })

  afterAll(async () => { await boss.stop() })

  it('job enqueued, picked up, and completed exactly once', async () => {
    const queueName = `test-queue-${Date.now()}`
    await boss.createQueue(queueName, { retryLimit: 0 })

    let callCount = 0
    await boss.work(queueName, async ([job]) => { callCount++ })

    await boss.send(queueName, { payload: 'test' })
    await new Promise(r => setTimeout(r, 3000))   // Allow poll cycle

    expect(callCount).toBe(1)
  })
})
```

---

### `tests/lib/mediawiki.test.ts` (test, request-response)

**Coverage:** INFRA-03 — `mediawikiFetch` sets User-Agent header matching Wikimedia policy format

**Pattern** — unit test, no network calls, mock `fetch`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { mediawikiFetch } from '@/lib/mediawiki'

describe('mediawikiFetch', () => {
  it('sets User-Agent header on every request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', mockFetch)

    await mediawikiFetch('https://en.wikipedia.org/api/rest_v1/page/summary/Test')

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['User-Agent']).toMatch(/^Rosetta\//)
    expect(init.headers['User-Agent']).toContain('@')   // Contact email present
  })

  it('does not override caller-supplied non-User-Agent headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', mockFetch)

    await mediawikiFetch('https://example.com', { headers: { 'X-Custom': 'value' } })

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['User-Agent']).toMatch(/^Rosetta\//)
    expect(init.headers['X-Custom']).toBe('value')
  })
})
```

---

### `tests/lib/ai-registry.test.ts` (test, request-response)

**Coverage:** AI-01, AI-06 — registry returns a LanguageModel; switching provider requires only
env var change

**Pattern** — unit test; does NOT make live LLM API calls:
```typescript
import { describe, it, expect } from 'vitest'
import { registry } from '@/lib/ai-registry'

describe('AI provider registry', () => {
  it('registry.languageModel returns a model for anthropic provider', () => {
    const model = registry.languageModel('anthropic:claude-sonnet-4-5-20250929')
    expect(model).toBeDefined()
    expect(typeof model).toBe('object')
  })

  it('registry.languageModel returns a model for openai provider', () => {
    const model = registry.languageModel('openai:gpt-4.1')
    expect(model).toBeDefined()
  })

  it('AI_MODEL env var controls active model without code changes', () => {
    process.env.AI_MODEL = 'anthropic:claude-sonnet-4-5-20250929'
    const model = registry.languageModel(process.env.AI_MODEL!)
    expect(model).toBeDefined()

    process.env.AI_MODEL = 'openai:gpt-4.1'
    const switched = registry.languageModel(process.env.AI_MODEL!)
    expect(switched).toBeDefined()
  })
})
```

---

### `docker-compose.yml` (config)

**Source:** CONTEXT.md decisions D-01, D-02 — PostgreSQL + pgAdmin for local development

**Pattern:**
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: rosetta
      POSTGRES_PASSWORD: rosetta
      POSTGRES_DB: rosetta
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@rosetta.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

---

### `.env.local.example` (config)

**Source:** RESEARCH.md Open Questions (OAuth credentials), Security Domain

**Pattern** — commit this file (no secrets), never commit `.env.local`:
```bash
# Database (Docker Compose local):
DATABASE_URL=postgresql://rosetta:rosetta@localhost:5432/rosetta
# Database (Neon production):
# DATABASE_URL=postgresql://...neon.tech/rosetta?sslmode=require

# NextAuth — generate with: npx auth secret
AUTH_SECRET=

# OAuth providers (register apps at github.com/settings/developers and console.cloud.google.com)
GITHUB_ID=
GITHUB_SECRET=
GOOGLE_ID=
GOOGLE_SECRET=

# LLM providers (server-side only — NEVER prefix with NEXT_PUBLIC_)
AI_MODEL=anthropic:claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

---

## Shared Patterns

### Path Alias `@/`

**Apply to:** All `import` statements in `src/` and `tests/`

All internal imports use the `@/` alias mapped to `./src`. This is configured in `vitest.config.ts`
(alias) and `tsconfig.json` (`paths`). Never use relative `../../` imports across feature
boundaries.

```typescript
// Correct:
import { db } from '@/db'
import { users } from '@/db/schema'
import { registry } from '@/lib/ai-registry'

// Wrong:
import { db } from '../../db'
```

---

### Environment Variable Guard

**Apply to:** All server-side modules that require env vars (`src/db/index.ts`, `src/auth.ts`,
`src/lib/ai-registry.ts`, `src/lib/boss.ts`, `src/workers/index.ts`)

Use the `!` non-null assertion only for env vars that have been validated at startup. For
production, prefer an explicit check in module initialization:

```typescript
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}
```

---

### Server-Side Only Boundary

**Apply to:** `src/lib/ai-registry.ts`, `src/lib/boss.ts`, `src/workers/index.ts`, `src/db/index.ts`

These modules must never be imported by client components or pages without `'use client'`
annotation. Mark files with a comment:

```typescript
// server-only: this module must not be imported by client components
import 'server-only'   // Optional explicit guard (npm package: server-only)
```

LLM API keys must never use the `NEXT_PUBLIC_` prefix — they would be exposed in the browser bundle.

---

### Drizzle Query Pattern

**Apply to:** All database access in API routes, server components, and workers

```typescript
// Type-safe select:
const [user] = await db.select().from(users).where(eq(users.email, email))

// Type-safe insert with returning:
const [inserted] = await db.insert(articles).values(newArticle).returning()

// Never write raw SQL strings — use drizzle query builder or sql`` tagged template
// for complex cases only
```

---

### Soft Delete Convention

**Apply to:** All domain table query helpers (Phase 2+), established by schema in Phase 1

Domain tables have a `deletedAt` timestamp column (D-09). All future queries that list records
must include `where(isNull(table.deletedAt))` — records with `deletedAt` set are considered
deleted and must not appear in application results.

```typescript
// Future query convention (established by schema now):
const activeArticles = await db.select().from(articles)
  .where(isNull(articles.deletedAt))
```

---

## No Analog Found

All 21 files have no codebase analog because this is a greenfield project. Planner must use
RESEARCH.md patterns exclusively.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| All 21 files listed above | various | various | Greenfield — no `src/` directory exists |

The patterns above ARE the analog patterns. Future phases (02+) will have real codebase analogs
drawn from files created in this phase.

---

## Pitfall Registry

Concrete pitfalls from RESEARCH.md that the planner must encode as explicit constraints or
verification steps in each plan:

| Pitfall | Affected Files | Constraint |
|---------|---------------|------------|
| Pitfall 1: pg-boss requires Node ≥ 22.12.0 | `src/workers/index.ts`, `package.json` | Add `"engines": { "node": ">=22.12.0" }` to `package.json`; add `.nvmrc` with `22.12.0` |
| Pitfall 2: NextAuth v5 Credentials + database session conflict | `src/auth.ts` | Use `strategy: 'jwt'` in Phase 1; validate session survives restart |
| Pitfall 3: Drizzle adapter schema drift | `src/db/schema.ts` | Never rename required NextAuth columns; add custom columns (`passwordHash`, `role`) alongside |
| Pitfall 4: pg-boss schema conflict with Drizzle migrations | `drizzle.config.ts` | Set `schema: './src/db/schema.ts'` (explicit file, not glob) |
| Pitfall 5: Vercel AI SDK + Zod version mismatch | `package.json` | Install `zod@4.x` explicitly; verify with `npm ls zod` |
| Pitfall 6: passwordHash column not in NextAuth schema | `src/db/schema.ts` | Add `passwordHash: text('password_hash')` to `users` table; never use a separate join table |

---

## Metadata

**Analog search scope:** No search performed — greenfield project with no existing source files
**Files scanned:** 0 source files (codebase is empty)
**Patterns sourced from:**
- `.planning/phases/01-foundation/01-RESEARCH.md` — all verified code examples
- `.planning/phases/01-foundation/01-UI-SPEC.md` — login + dashboard UI contracts
- `.planning/phases/01-foundation/01-CONTEXT.md` — locked implementation decisions D-01 through D-15
- `.planning/research/ARCHITECTURE.md` — system architecture context
**Pattern extraction date:** 2026-04-18
