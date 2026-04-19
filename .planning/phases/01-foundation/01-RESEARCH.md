# Phase 1: Foundation - Research

**Researched:** 2026-04-18
**Domain:** Next.js 16 App Router / Drizzle ORM / pg-boss / Vercel AI SDK / NextAuth v5
**Confidence:** HIGH (all core library versions verified via npm registry; API patterns verified via Context7 and official docs)

## Summary

Phase 1 builds the infrastructure skeleton that every subsequent phase depends on. It has four distinct technical domains, each with its own standard library and integration surface: (1) database schema with Drizzle ORM on PostgreSQL, (2) background job queue with pg-boss, (3) provider-agnostic LLM abstraction with the Vercel AI SDK `createProviderRegistry`, and (4) reviewer authentication with NextAuth v5 beta using the Drizzle adapter.

No application code exists yet — this is a greenfield Next.js 16 project. The first plan must bootstrap the Next.js app, install all dependencies, and initialize the database schema before any feature work can begin. The stable paragraph ID scheme (section path + content hash + revision ID) is a locked decision that must be encoded into the schema in this phase, even though ingestion does not happen until Phase 2.

Key constraint: pg-boss 12.x requires Node.js ≥ 22.12.0. The current environment runs Node.js 25.8.2, which satisfies this. PostgreSQL is not locally installed; the plan must account for a managed database (Neon recommended) or a local Docker container.

**Primary recommendation:** Bootstrap with `create-next-app`, install all dependencies in one pass, define Drizzle schema first, run initial migration, then wire NextAuth → pg-boss → AI SDK adapter in that order, with integration tests validating each layer before moving to the next phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reviewer authentication (login, OAuth callback, session) | Frontend Server (NextAuth middleware + App Router) | Database (user/account/session tables) | NextAuth v5 owns the session lifecycle; the DB stores durable session tokens via the Drizzle adapter |
| Database schema definition and migrations | Database / Storage (Drizzle + PostgreSQL) | — | Schema is data-layer only; no UI or API logic in this phase |
| Background job queue (pg-boss) | API / Backend (server-side worker process) | Database (pgboss schema stored in same PostgreSQL) | pg-boss creates its own schema in PostgreSQL; workers run server-side outside the HTTP request lifecycle |
| LLM provider abstraction | API / Backend (server-side only) | — | Provider API keys must never reach the browser; abstraction layer is a pure server-side module |
| MediaWiki User-Agent header | API / Backend (mediawiki client module) | — | All API calls are server-side; header is set once in the client module, never in browser code |
| Protected dashboard route | Frontend Server (Next.js middleware) | API / Backend (session validation) | Middleware redirects unauthenticated requests; API routes enforce session in parallel |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | Database schema supports articles, sections, paragraphs, claims, commentaries, reviews, reviewers, and scores with proper relational integrity | Drizzle ORM `pgTable` with `references()` foreign keys and `onDelete: "cascade"` enforces relational integrity; schema patterns verified via Context7 |
| INFRA-02 | Background job queue (pg-boss on PostgreSQL) handles ingestion and AI analysis jobs with exactly-once delivery | pg-boss 12.15.0 uses `SKIP LOCKED` for exactly-once delivery; `createQueue` + `send` + `work` patterns verified via Context7; requires Node ≥ 22.12.0 |
| INFRA-03 | System sends a descriptive User-Agent header with all MediaWiki API requests per Wikimedia policy | `fetch` wrapper in `src/lib/mediawiki.ts` sets `User-Agent: Rosetta/1.0 (contact@rosetta.com)` on every request; no library needed |
| MOD-01 | Reviewers can log in with email/password or OAuth (Google/GitHub) | NextAuth v5 beta with Credentials provider + GitHub/Google OAuth providers; Drizzle adapter for user/account/session persistence; verified against authjs.dev |
| AI-01 | System provides a provider-agnostic LLM abstraction layer that supports at minimum two providers | Vercel AI SDK `createProviderRegistry` with `@ai-sdk/anthropic` and `@ai-sdk/openai` registered; model selection via `AI_PROVIDER` env var; verified via Context7 |
| AI-06 | Switching LLM providers requires only configuration changes, not code changes | `createProviderRegistry` + single env var `AI_MODEL=anthropic:claude-sonnet-4-5` or `AI_MODEL=openai:gpt-4.1`; pipeline code calls `registry.languageModel(process.env.AI_MODEL)` — no code change needed |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.4 | App Router framework — all pages, API routes, middleware | Single framework for public site + reviewer dashboard + API; Vercel-native; React 19 |
| drizzle-orm | 0.45.2 | Type-safe PostgreSQL schema and queries | Code-first TypeScript schema; no codegen; excellent serverless cold start; SQL-close API |
| drizzle-kit | 0.31.10 | Schema migration generation and Drizzle Studio | Companion to drizzle-orm; `drizzle-kit generate` + `drizzle-kit migrate` |
| pg-boss | 12.15.0 | Background job queue on PostgreSQL | Exactly-once delivery via SKIP LOCKED; no Redis; runs on existing PostgreSQL instance |
| pg | 8.20.0 | PostgreSQL client (pg-boss dependency) | pg-boss uses pg internally; also needed for Drizzle with standard `pg` driver |
| ai | 6.0.168 | Vercel AI SDK — provider registry, generateObject, streaming | Provider-agnostic; `createProviderRegistry` enables config-only provider switching |
| @ai-sdk/anthropic | 3.0.71 | Anthropic Claude provider adapter | Registered in provider registry; uses `ANTHROPIC_API_KEY` env var |
| @ai-sdk/openai | 3.0.53 | OpenAI GPT provider adapter | Registered in provider registry; uses `OPENAI_API_KEY` env var |
| zod | 4.3.6 | Schema validation + AI structured output contracts | Peer dep of ai SDK; dual use — API input validation + generateObject schemas |
| next-auth | 5.0.0-beta.31 | Reviewer authentication — email/password + OAuth | Native Next.js 16 App Router integration; Credentials + GitHub + Google providers |
| @auth/drizzle-adapter | 1.11.2 | NextAuth Drizzle database adapter | Connects NextAuth session persistence to existing Drizzle/PostgreSQL setup |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @neondatabase/serverless | latest | Serverless PostgreSQL driver | Use when deploying to Vercel Functions (replaces standard `pg` for connection pooling) |
| bcryptjs | 3.0.3 | Password hashing for Credentials provider | Credentials provider requires application-level password hashing; bcryptjs is pure JS, no native binding |
| @types/bcryptjs | 3.0.0 | TypeScript types for bcryptjs | Dev dependency |
| tailwindcss | 4.2.x | Styling for login page and dashboard skeleton | Phase 1 "UI hint" requires at minimum a functional login page |
| shadcn/ui | latest | Accessible UI components (login form, layout) | Owned components; Radix-based; shadcn v4 supports Tailwind v4 |

### Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| vitest | 4.1.4 | Unit and integration tests | Test Drizzle schema constraints, pg-boss job lifecycle, AI provider registry |
| @vitejs/plugin-react | 6.0.1 | Vitest React component testing | Needed for login page component tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-auth@beta (5.0.0-beta.31) | better-auth | STACK.md notes Auth.js v5 is stable for Next.js 16; better-auth is gaining traction but switching cost is higher |
| @neondatabase/serverless | standard `pg` | Standard `pg` works fine for local dev or VPS; serverless driver required for Vercel Functions (persistent connections break) |
| bcryptjs | argon2 | argon2 is more secure but requires native bindings; bcryptjs works in any Node environment |
| pg-boss | BullMQ (Redis) | BullMQ requires separate Redis; pg-boss reuses existing PostgreSQL; locked decision |

**Installation:**
```bash
npx create-next-app@latest rosetta --typescript --tailwind --app --eslint

npm install drizzle-orm pg @neondatabase/serverless
npm install -D drizzle-kit

npm install ai @ai-sdk/anthropic @ai-sdk/openai
npm install zod

npm install next-auth@beta @auth/drizzle-adapter
npm install bcryptjs
npm install -D @types/bcryptjs

npm install pg-boss

npm install -D vitest @vitejs/plugin-react
```

**Version verification:** All versions confirmed against npm registry on 2026-04-18.

## Architecture Patterns

### System Architecture Diagram

```
Reviewer Browser
    │
    ├─ GET /dashboard (protected)
    │       ↓
    │  Next.js Middleware
    │  (auth() check → redirect /login if no session)
    │       ↓
    │  Dashboard Page (Server Component)
    │       ↓
    │  auth() → NextAuth session
    │
    ├─ POST /api/auth/* (NextAuth handlers)
    │       ↓
    │  NextAuth v5 (Credentials / GitHub / Google)
    │       ↓
    │  Drizzle Adapter → PostgreSQL
    │  (users, accounts, sessions, verificationTokens tables)
    │
    └─ POST /api/jobs/test (dev/test endpoint)
            ↓
       pg-boss.send('test-queue', { ... })
            ↓
       PostgreSQL (pgboss schema)
            ↓
       pg-boss Worker (polled every 2s)
            ↓
       pg-boss.complete / pg-boss.fail

Separate: AI Provider Registry (server-side module, imported by future AI pipeline)
    src/lib/ai-registry.ts
    └─ createProviderRegistry({ anthropic, openai })
       reads AI_MODEL from env → returns LanguageModel
       No HTTP surface in Phase 1 — module only

Separate: MediaWiki Client (server-side module, imported by future ingestion)
    src/lib/mediawiki.ts
    └─ fetch wrapper with User-Agent header
       No real calls in Phase 1 — module + unit test only
```

### Recommended Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts          # NextAuth handlers (GET + POST)
│   ├── dashboard/
│   │   └── page.tsx                  # Protected reviewer dashboard (skeleton)
│   ├── login/
│   │   └── page.tsx                  # Login page (email/password + OAuth buttons)
│   └── layout.tsx
│
├── auth.ts                           # NextAuth config (providers + adapter)
├── middleware.ts                     # Route protection via auth()
│
├── db/
│   ├── schema.ts                     # Full Drizzle schema (all 8 domain tables + auth tables)
│   ├── index.ts                      # db instance export
│   └── migrations/                   # Generated by drizzle-kit
│
├── lib/
│   ├── ai-registry.ts                # createProviderRegistry (Anthropic + OpenAI)
│   └── mediawiki.ts                  # fetch wrapper with User-Agent header
│
└── types/
    └── index.ts                      # Shared domain types (ReviewStatus enum, etc.)
```

### Pattern 1: Drizzle Schema with Full Domain Tables

**What:** Define all domain tables (articles, sections, paragraphs, claims, commentaries, reviews, reviewers, scores) in a single `schema.ts` alongside the NextAuth tables. Foreign keys enforced at the database level.

**When to use:** All database access. Never write raw SQL strings; use Drizzle query builder or `sql` tagged template for complex cases.

**Example:**
```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs + authjs.dev/getting-started/adapters/drizzle
import {
  pgTable, text, integer, timestamp, uuid, pgEnum,
  primaryKey, uniqueIndex
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// --- NextAuth tables (required by @auth/drizzle-adapter) ---
export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // Extended fields for Rosetta reviewers:
  role: text('role').notNull().default('reviewer'),
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

// --- Domain tables ---
export const reviewStatusEnum = pgEnum('review_status', [
  'PENDING', 'AI_ANALYZED', 'HUMAN_APPROVED', 'HUMAN_REJECTED', 'PUBLISHED'
])

export const articles = pgTable('article', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  wikiUrl: text('wiki_url').notNull().unique(),
  revisionId: integer('revision_id').notNull(),
  language: text('language').notNull().default('en'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sections = pgTable('section', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  path: text('path').notNull(), // e.g. "History.Early_life"
  position: integer('position').notNull(),
})

export const paragraphs = pgTable('paragraph', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  // Stable anchor: section_path + content_hash + revision_id (locked decision)
  stableId: text('stable_id').notNull(), // e.g. "History.Early_life:sha256:rev123456"
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  position: integer('position').notNull(),
})

export const claims = pgTable('claim', {
  id: uuid('id').primaryKey().defaultRandom(),
  paragraphId: uuid('paragraph_id').notNull().references(() => paragraphs.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const commentaries = pgTable('commentary', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id').notNull().references(() => claims.id, { onDelete: 'cascade' }),
  draftText: text('draft_text').notNull(),
  status: reviewStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reviews = pgTable('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  commentaryId: uuid('commentary_id').notNull().references(() => commentaries.id, { onDelete: 'cascade' }),
  reviewerId: text('reviewer_id').notNull().references(() => users.id),
  previousStatus: reviewStatusEnum('previous_status').notNull(),
  newStatus: reviewStatusEnum('new_status').notNull(),
  editedText: text('edited_text'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const scores = pgTable('score', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }).unique(),
  factualScore: integer('factual_score').notNull().default(0),
  coveragePercent: integer('coverage_percent').notNull().default(0),
  totalParagraphs: integer('total_paragraphs').notNull().default(0),
  reviewedParagraphs: integer('reviewed_paragraphs').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### Pattern 2: NextAuth v5 Configuration with Drizzle Adapter

**What:** Single `auth.ts` file at project root exports `{ handlers, signIn, signOut, auth }`. Route handler at `/app/api/auth/[...nextauth]/route.ts`. Middleware at `middleware.ts`.

**When to use:** All authentication logic routes through NextAuth. Never manage sessions manually.

**Example:**
```typescript
// Source: authjs.dev/getting-started/installation + authjs.dev/getting-started/adapters/drizzle
// auth.ts (project root)
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
  session: { strategy: 'database' },
  pages: { signIn: '/login' },
})

// middleware.ts (project root)
export { auth as default } from '@/auth'
export const config = {
  matcher: ['/dashboard/:path*', '/api/reviews/:path*'],
}
```

### Pattern 3: Vercel AI SDK Provider Registry

**What:** `createProviderRegistry` registers all supported providers. A single env var (`AI_MODEL`) controls which model runs. All pipeline code calls `registry.languageModel(process.env.AI_MODEL!)` — no provider-specific imports in business logic.

**When to use:** Every LLM call in the codebase must go through the registry. Never import `@ai-sdk/anthropic` or `@ai-sdk/openai` directly outside `src/lib/ai-registry.ts`.

**Example:**
```typescript
// Source: Context7 /vercel/ai — createProviderRegistry
// src/lib/ai-registry.ts
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'

export const registry = createProviderRegistry({
  anthropic,
  openai,
})

// Usage (provider agnostic):
// const model = registry.languageModel(process.env.AI_MODEL!)
// process.env.AI_MODEL = "anthropic:claude-sonnet-4-5-20250929"  or  "openai:gpt-4.1"
// Switching provider: change AI_MODEL in .env — no code change

// Environment variables required:
// AI_MODEL=anthropic:claude-sonnet-4-5-20250929   (or openai:gpt-4.1)
// ANTHROPIC_API_KEY=sk-ant-...
// OPENAI_API_KEY=sk-...
```

### Pattern 4: pg-boss Worker Setup

**What:** pg-boss creates its own `pgboss` schema in the existing PostgreSQL database. The `start()` call runs migrations automatically. Workers are registered with `work()` and receive jobs from queues.

**When to use:** All background job processing. Workers run in a separate process (or Next.js custom server) — not inside API route handlers.

**Example:**
```typescript
// Source: Context7 /timgit/pg-boss
// src/lib/boss.ts — singleton boss instance for job sending (from API routes)
import { PgBoss } from 'pg-boss'

let boss: PgBoss | null = null

export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss(process.env.DATABASE_URL!)
    boss.on('error', console.error)
  }
  return boss
}

// src/workers/index.ts — worker entrypoint (separate process)
import { PgBoss } from 'pg-boss'

async function startWorkers() {
  const boss = new PgBoss(process.env.DATABASE_URL!)
  boss.on('error', console.error)
  await boss.start()

  // Queue setup with retry and dead-letter
  await boss.createQueue('analysis-jobs', {
    retryLimit: 3,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 900,
    deadLetter: 'analysis-failures',
  })

  await boss.work('analysis-jobs', async ([job]) => {
    // process job.data
    console.log('Processing job', job.id, job.data)
  })
}

startWorkers().catch(console.error)
```

### Pattern 5: MediaWiki User-Agent Header Module

**What:** A thin `fetch` wrapper in `src/lib/mediawiki.ts` that always sets the required User-Agent header. This is all that INFRA-03 requires in Phase 1 — the actual API calls happen in Phase 2.

**Example:**
```typescript
// src/lib/mediawiki.ts
const USER_AGENT = 'Rosetta/1.0 (https://rosetta.example.com; contact@rosetta.example.com)'

export async function mediawikiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...init?.headers,
    },
  })
}

// INFRA-03 unit test verifies:
// - mediawikiFetch sets User-Agent header on every call
// - USER_AGENT string matches Wikimedia policy format
```

### Anti-Patterns to Avoid

- **Importing provider SDKs directly in business logic:** Every LLM call must go through `registry.languageModel(...)`. Importing `@ai-sdk/anthropic` outside `ai-registry.ts` creates provider coupling.
- **Managing NextAuth sessions manually:** Never write session cookies or JWT tokens directly. All session management via NextAuth.
- **Running pg-boss `start()` inside API route handlers:** `start()` runs internal maintenance and schema migrations — it's a server lifecycle concern, not a per-request concern. Call it once at server startup.
- **Storing raw Wikipedia HTML in the `paragraph` table:** Store only content and content hash. Full HTML belongs in a cache layer (Phase 2 concern).
- **Skipping the `pgEnum` for review status:** Using raw text strings for `review_status` loses database-level enforcement. Always use `pgEnum`.
- **Using serial IDs for domain tables:** Use `uuid().defaultRandom()` for all domain entities. Serial integers leak row counts and are order-dependent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth callback + PKCE + session management | Custom OAuth handler | NextAuth v5 providers | OAuth is a minefield of edge cases: PKCE, CSRF tokens, token refresh, provider-specific quirks |
| Password hashing | Custom crypto | bcryptjs | Timing-safe comparison, work factor tuning, salt management are non-trivial |
| Database migrations | Custom migration runner | drizzle-kit | Tracks migration history, handles rollbacks, generates from schema diff |
| Job queue with exactly-once | Custom SKIP LOCKED queries | pg-boss | pg-boss handles job state machine, stale job recovery, dead-letter routing, cron scheduling |
| Multi-provider LLM routing | Custom fetch wrapper | Vercel AI SDK `createProviderRegistry` | Handles auth headers, streaming, structured output, retry — per-provider differences are opaque |

**Key insight:** All four foundation problems (auth, passwords, migrations, job queues) have known failure modes that require significant engineering to handle correctly. The standard libraries handle them; custom implementations re-discover them in production.

## Common Pitfalls

### Pitfall 1: pg-boss Node.js Version Requirement
**What goes wrong:** pg-boss 12.x requires Node.js ≥ 22.12.0. CI or deployment environments running Node 20 will fail to install or start pg-boss.
**Why it happens:** pg-boss 12 uses modern Node.js APIs. The requirement changed from v10 (Node 18+) to v12 (Node 22+).
**How to avoid:** Pin Node.js to `>=22.12.0` in `.nvmrc`, `package.json` engines field, and CI/CD configuration. Verify with `node --version` before assuming pg-boss will work.
**Warning signs:** `SyntaxError` or runtime errors importing pg-boss; CI passes locally but fails in deployment.

### Pitfall 2: NextAuth v5 Beta Session Strategy and Adapter Conflict
**What goes wrong:** NextAuth v5 with the Drizzle adapter defaults to `jwt` session strategy when using Credentials provider, but the adapter expects `database` strategy to persist sessions. Mixing these causes sessions that appear valid but don't persist across restarts.
**Why it happens:** Credentials provider in NextAuth v5 does not support the `database` session strategy by default — there's a known restriction. Using `database` strategy requires the adapter but may need custom session handling for credentials.
**How to avoid:** For Phase 1, use `session: { strategy: 'jwt' }` for simplicity, or carefully configure `database` strategy with explicit session callbacks. Validate that sessions survive server restart in integration tests.
**Warning signs:** Login succeeds but session disappears on page refresh; `auth()` returns null on the second request.

### Pitfall 3: Drizzle Adapter Schema Drift
**What goes wrong:** The NextAuth Drizzle adapter expects specific column names and types. If you add columns to the `users` table (e.g., `role`, `passwordHash`), the adapter may fail silently or error on unrecognized columns.
**Why it happens:** `@auth/drizzle-adapter` was built against a specific schema shape; extra columns are fine, but renamed or retyped required columns break it.
**How to avoid:** Keep all required NextAuth columns exactly as specified in the adapter docs. Add custom columns alongside, never rename required ones. Pass `{ usersTable, accountsTable, sessionsTable, verificationTokensTable }` explicitly to `DrizzleAdapter(db, tables)` so there's no ambiguity about which tables the adapter uses.
**Warning signs:** `column "emailVerified" of relation "user" does not exist`; OAuth sign-in succeeds but user row is not created.

### Pitfall 4: pg-boss Schema Conflict with Drizzle Migrations
**What goes wrong:** Drizzle Kit generates migrations for the full PostgreSQL schema. If pg-boss's `pgboss` schema tables are somehow picked up by Drizzle Kit, the generated migration may attempt to manage them, causing conflicts when pg-boss runs its own migrations.
**Why it happens:** pg-boss creates its own `pgboss` schema namespace. If the Drizzle config `schema` path or `out` path is too broad, it may snapshot pg-boss tables.
**How to avoid:** Configure `drizzle.config.ts` with explicit `schema: './src/db/schema.ts'` and verify that pg-boss tables (in the `pgboss` schema) are never included. Run pg-boss `start()` after Drizzle migrations are applied.
**Warning signs:** drizzle-kit generate produces migrations referencing `pgboss.*` tables.

### Pitfall 5: Vercel AI SDK Version Mismatch with Zod
**What goes wrong:** `ai@6.x` has updated peer dependency requirements for Zod. Installing `zod@3.x` when the SDK requires `zod@4.x` causes runtime errors with `generateObject`.
**Why it happens:** The `ai` package peer dep specifies `zod: '^3.25.76 || ^4.1.8'` — both are supported but behavior differs slightly between Zod v3 and v4.
**How to avoid:** Install `zod@4.x` explicitly (`npm install zod@4`). Verify with `npm ls zod` that only one version is installed.
**Warning signs:** `TypeError: schema.parse is not a function` or Zod-related type errors in `generateObject` calls.

### Pitfall 6: passwordHash Column Not in NextAuth Schema
**What goes wrong:** NextAuth's Drizzle adapter schema does not include a `passwordHash` column on the `users` table, because NextAuth was designed for OAuth-first flows. When adding Credentials support, the password hash has no place to live.
**Why it happens:** The adapter schema is minimal by design. Application-specific fields must be added manually.
**How to avoid:** Add `passwordHash: text('password_hash')` to the `users` table in `schema.ts`. This column is not managed by the adapter — it's purely application code. The `authorize` callback reads from `users` directly via Drizzle, bypassing the adapter for credential validation.
**Warning signs:** You have no column to store the password hash; you're storing it in a separate table with a foreign key (unnecessary complexity).

## Code Examples

Verified patterns from official sources:

### Provider Registry — Config-Only Provider Switching
```typescript
// Source: Context7 /vercel/ai createProviderRegistry
// src/lib/ai-registry.ts
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'

export const registry = createProviderRegistry({ anthropic, openai })

// In any server-side pipeline module:
// const result = await generateObject({
//   model: registry.languageModel(process.env.AI_MODEL!),
//   schema: myZodSchema,
//   prompt: '...',
// })
//
// Switching from Claude to GPT-4: change AI_MODEL in .env
// AI_MODEL=anthropic:claude-sonnet-4-5-20250929  →  openai:gpt-4.1
// Zero code changes required.
```

### pg-boss — Exactly-Once Job Lifecycle
```typescript
// Source: Context7 /timgit/pg-boss README
import { PgBoss } from 'pg-boss'

const boss = new PgBoss(process.env.DATABASE_URL!)
boss.on('error', console.error)
await boss.start()

await boss.createQueue('ingestion-jobs', {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  deadLetter: 'ingestion-failures',
})

// Send (from API route or any server code):
const jobId = await boss.send('ingestion-jobs', { articleUrl: 'https://...' })

// Receive and complete (from worker process):
await boss.work('ingestion-jobs', async ([job]) => {
  await processIngestion(job.data.articleUrl)
  // Returning without throwing = job completed successfully
  // Throwing = job fails and may retry per queue policy
})
```

### Drizzle — Type-Inferred Insert and Select
```typescript
// Source: Context7 /drizzle-team/drizzle-orm-docs
import { db } from '@/db'
import { articles } from '@/db/schema'

// Type-safe insert
type NewArticle = typeof articles.$inferInsert
const newArticle: NewArticle = {
  title: 'Quantum mechanics',
  wikiUrl: 'https://en.wikipedia.org/wiki/Quantum_mechanics',
  revisionId: 1234567,
  language: 'en',
}
const [inserted] = await db.insert(articles).values(newArticle).returning()

// Type-safe select
type Article = typeof articles.$inferSelect
const result: Article[] = await db.select().from(articles)
```

### NextAuth v5 — Route Handler
```typescript
// Source: authjs.dev/getting-started/installation
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ + Redis for job queues | pg-boss on existing PostgreSQL | Decision locked in STATE.md | Eliminates Redis as a required service; reduces operational surface |
| OpenAI SDK / Anthropic SDK direct | Vercel AI SDK `createProviderRegistry` | STATE.md locked decision | Provider switching via env var; no code changes required |
| NextAuth v4 (Pages Router) | NextAuth v5 beta (App Router) | Auth.js v5 released 2024-2025 | Native App Router middleware; `auth()` server function; simpler session access in Server Components |
| Prisma as primary ORM | Drizzle ORM | Stack research decision | Leaner bundle; SQL-close API; better serverless cold start |
| `serial` (integer) PKs | `uuid().defaultRandom()` | Current Drizzle best practice | No information leakage; safe for distributed inserts |
| Tailwind CSS v3 | Tailwind CSS v4.2 | March 2025 (stable GA) | 5x faster full builds; CSS-first config |

**Deprecated/outdated:**
- LangChain.js: Adds abstraction on top of abstraction; Vercel AI SDK covers all Phase 1 needs with a stable typed API.
- Direct OpenAI/Anthropic SDK imports in business logic: Hard-codes provider. Ruled out by project decisions.
- `next-auth@4.x`: Pages Router API; incompatible with App Router middleware pattern used in Next.js 16.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PostgreSQL will be provisioned via Neon (serverless) for Vercel deployment | Standard Stack, Environment | If self-hosting, use standard `pg` driver; `@neondatabase/serverless` is wrong choice. Planner should confirm deployment target. |
| A2 | `session: { strategy: 'database' }` is compatible with Credentials provider in next-auth@5.0.0-beta.31 | Pitfalls #2 | If incompatible, must use `jwt` strategy — affects how sessions persist and what data is available in `auth()` |
| A3 | No existing codebase or `package.json` — greenfield `create-next-app` required | Summary | If a partial project exists, `create-next-app` would overwrite it |

## Open Questions

1. **PostgreSQL deployment target (Neon vs. local Docker vs. other managed)**
   - What we know: pg-boss and Drizzle both work with any PostgreSQL 13+; Neon's serverless driver is needed for Vercel Functions
   - What's unclear: Whether the reviewer is deploying to Vercel (use Neon) or self-hosting (use standard `pg`)
   - Recommendation: Default plan assumes Neon + Vercel. Include a note in Wave 0 that `DATABASE_URL` must be set before any DB work can proceed.

2. **OAuth provider credentials (Google/GitHub client IDs)**
   - What we know: NextAuth requires `GITHUB_ID`, `GITHUB_SECRET`, `GOOGLE_ID`, `GOOGLE_SECRET` env vars to enable OAuth
   - What's unclear: Whether the reviewer has OAuth apps registered for these providers
   - Recommendation: Plan includes `.env.local.example` with all required env vars; OAuth can be tested with GitHub alone if Google is not yet set up.

3. **`passwordHash` on the users table — Credentials provider scope**
   - What we know: MOD-01 requires email/password login; the NextAuth adapter schema has no password field
   - What's unclear: Whether the reviewer wants a separate `reviewer_credentials` table or an extended `users` table
   - Recommendation: Extend the `users` table with a nullable `passwordHash` column (simplest; avoids an extra join on every credentials login).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 22.12.0 | pg-boss 12.x | ✓ | 25.8.2 | — |
| npm | Package installation | ✓ | 11.11.1 | — |
| PostgreSQL (any host) | Drizzle schema, pg-boss | ✗ (not local) | — | Neon managed DB (free tier); or `docker run postgres:16` |
| npx (create-next-app) | Project bootstrap | ✓ | bundled with npm | — |

**Missing dependencies with no fallback:**
- PostgreSQL: A `DATABASE_URL` connection string must be available before Wave 1 DB work can proceed. First task in plan should document how to get one (Neon free tier takes ~2 minutes to provision).

**Missing dependencies with fallback:**
- None beyond PostgreSQL.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` — Wave 0 gap (does not exist yet) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | All 12 schema tables exist with correct columns and FK constraints | integration | `npx vitest run tests/db/schema.test.ts` | ❌ Wave 0 |
| INFRA-02 | pg-boss job: enqueue → worker picks up → completes; exactly-once confirmed | integration | `npx vitest run tests/jobs/boss.test.ts` | ❌ Wave 0 |
| INFRA-03 | `mediawikiFetch` sets User-Agent header matching Wikimedia policy format | unit | `npx vitest run tests/lib/mediawiki.test.ts` | ❌ Wave 0 |
| MOD-01 | Reviewer can authenticate via Credentials; session is established and persists | integration | `npx vitest run tests/auth/credentials.test.ts` | ❌ Wave 0 |
| MOD-01 | Protected `/dashboard` route redirects unauthenticated requests to `/login` | integration | `npx vitest run tests/auth/middleware.test.ts` | ❌ Wave 0 |
| AI-01/AI-06 | `registry.languageModel('anthropic:...')` returns a LanguageModel; switching to `openai:...` works without code changes | unit | `npx vitest run tests/lib/ai-registry.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (full suite — fast, all unit)
- **Per wave merge:** `npx vitest run` (same suite + any integration tests added)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — framework config file
- [ ] `tests/db/schema.test.ts` — covers INFRA-01
- [ ] `tests/jobs/boss.test.ts` — covers INFRA-02 (requires `DATABASE_URL` in test env)
- [ ] `tests/lib/mediawiki.test.ts` — covers INFRA-03
- [ ] `tests/auth/credentials.test.ts` — covers MOD-01 (requires `DATABASE_URL` + `AUTH_SECRET`)
- [ ] `tests/auth/middleware.test.ts` — covers MOD-01 route protection
- [ ] `tests/lib/ai-registry.test.ts` — covers AI-01, AI-06

Framework install: `npm install -D vitest @vitejs/plugin-react` — included in main install pass.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NextAuth v5 — Credentials + OAuth; bcryptjs for password hashing |
| V3 Session Management | yes | NextAuth database session strategy; short session TTL; `AUTH_SECRET` env var |
| V4 Access Control | yes | Next.js middleware `auth()` check; protected route matcher config |
| V5 Input Validation | yes | Zod for all API inputs; NextAuth validates credential shape before `authorize` |
| V6 Cryptography | yes | bcryptjs for passwords; `AUTH_SECRET` generated via `npx auth secret`; never hand-roll |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Weak password hashing | Tampering | bcryptjs with work factor ≥ 12; never MD5/SHA1 |
| Session fixation | Elevation of Privilege | NextAuth rotates session token on login |
| OAuth CSRF | Spoofing | NextAuth handles PKCE and state parameter internally |
| Server-side API key exposure | Information Disclosure | LLM keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) stored server-side only; never `NEXT_PUBLIC_*` prefix |
| pg-boss endpoint without auth | Elevation of Privilege | Job enqueue endpoints must require authenticated session; never expose raw pg-boss API |
| Missing AUTH_SECRET | Spoofing | `AUTH_SECRET` is mandatory; generated with `npx auth secret`; app refuses to start without it in production |

## Sources

### Primary (HIGH confidence)
- Context7 `/timgit/pg-boss` — `start`, `createQueue`, `send`, `work`, `schedule` API patterns verified
- Context7 `/vercel/ai` — `createProviderRegistry`, `generateObject`, provider configuration verified
- Context7 `/drizzle-team/drizzle-orm-docs` — `pgTable`, `relations`, column types, FK syntax verified
- authjs.dev/getting-started/adapters/drizzle — NextAuth Drizzle adapter schema (PostgreSQL) verified
- authjs.dev/getting-started/providers/credentials — Credentials provider configuration verified
- npm registry — all package versions verified on 2026-04-18

### Secondary (MEDIUM confidence)
- authjs.dev/getting-started/installation — Next.js 16 App Router setup, middleware pattern
- Wikimedia API usage guidelines — User-Agent policy requirements

### Tertiary (LOW confidence)
- NextAuth v5 beta session strategy + Credentials compatibility — beta behavior may change; flagged as Assumption A2

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions npm-verified; APIs Context7-verified
- Architecture: HIGH — patterns drawn from official docs and locked project decisions
- Pitfalls: HIGH — NextAuth v5 beta pitfalls partially MEDIUM (beta API can change)

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (30 days — stable libraries; next-auth beta may move faster, re-verify if blocked)
