# Stack Research

**Domain:** Full-stack Wikipedia fact-checking platform (AI-assisted, human-moderated)
**Researched:** 2026-04-18
**Confidence:** HIGH (verified against current npm versions and official docs)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.x (latest stable: 16.2.3) | Full-stack framework — app router, server actions, API routes, public site + reviewer dashboard | Single framework covers public reading UX, internal reviewer dashboard, and API surface. App Router server components eliminate client/server data impedance for Wikipedia content rendering. Vercel-native so AI SDK integration is zero-friction. |
| TypeScript | 5.x | Type safety across entire codebase | Non-negotiable for a codebase with complex domain types: AI claim extraction schemas, moderation state machines, paragraph anchoring. Catches bugs at compile time rather than production. |
| PostgreSQL | 16.x | Primary data store — articles, claims, reviews, scores, moderation states | Relational model is correct for this domain: articles have paragraphs, paragraphs have claims, claims have reviews, reviews form a workflow. SKIP LOCKED enables job queues without Redis. JSONB for AI output storage. |
| Drizzle ORM | 0.45.x | Type-safe database access | Code-first TypeScript schema keeps DB types and app types in sync with no codegen step. Minimal bundle (~7.4kb), excellent serverless cold start performance on Vercel Functions. SQL-close API handles complex join queries the review queue requires without fighting the ORM. Prisma 7 closed the performance gap but Drizzle remains leaner for this use case. |
| Vercel AI SDK | 4.x (ai package) | Provider-agnostic LLM abstraction — claim extraction, commentary drafting | The PROJECT.md requirement is explicitly provider-agnostic; AI SDK's unified API lets you swap between Anthropic Claude, OpenAI GPT-4o, Google Gemini with a one-line config change. `generateObject` with Zod schemas produces typed claim extraction output. 20M+ monthly downloads; industry standard for TypeScript AI integration. |
| Zod | 4.x | Schema validation + AI structured output contracts | Dual purpose: validates API inputs AND defines the schema that AI SDK uses to constrain LLM output to typed claim structures. v4 is 14x faster string parsing than v3, with 1.9kb tree-shakable mini build. Required peer dep of AI SDK for structured generation. |
| Auth.js (next-auth) | v5 beta (5.0.0-beta.x) | Reviewer authentication — email/password + OAuth | Native Next.js 16 integration via middleware. Supports credentials (email/password) and OAuth (GitHub, Google) out of the box. Small team (~2-5 reviewers) means no custom auth complexity needed — just configure providers and a database adapter. |
| Tailwind CSS | 4.2.x | Styling | v4 is stable and GA since early 2025. 5x faster full builds, 100x faster incremental builds than v3. Zero-config CSS-first approach. Pairs directly with shadcn/ui component library. |
| shadcn/ui | latest | UI component library — reviewer dashboard, public reading UX | Not a packaged library — components live in your codebase, fully owned and customizable. Built on Radix UI primitives for accessibility. The reviewer queue, approval forms, and paragraph annotation UI all require accessible, composable primitives. Strong shadcn ecosystem for admin/dashboard patterns. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg-boss | 12.x | Background job queue — AI analysis pipeline, Wikipedia staleness checks | Use for the async AI processing pipeline: when a reviewer submits a URL, the Wikipedia fetch + LLM claim extraction runs as a background job, not in the HTTP request. pg-boss runs on the existing PostgreSQL instance — no Redis, no separate infrastructure. Exactly-once delivery via SKIP LOCKED. v12.15 is current (published 17 days ago). |
| @neondatabase/serverless | latest | Serverless PostgreSQL driver | Use when deploying to Vercel Functions — Neon's driver handles connection pooling without pg's persistent connection model, which breaks in serverless. Drop-in replacement. If self-hosting on VPS, use standard `pg` driver instead. |
| mediawiki (or raw fetch) | N/A | MediaWiki API client — Wikipedia content ingestion | The MediaWiki API is REST+JSON; a thin wrapper or raw fetch with proper User-Agent headers is sufficient. No heavy client needed. Use the `action=parse` endpoint for structured section/paragraph extraction, `action=query` with `prop=revisions` for staleness detection. |
| cheerio | 1.x | HTML parsing — DOM-level paragraph mapping | The MediaWiki parse API returns HTML; Cheerio provides jQuery-like traversal to map section headings and paragraphs to stable anchors. Use only in the ingestion pipeline (server-side), never client-side. |
| WXT | latest | Browser extension framework — Wikipedia overlay (v1 lower-priority) | WXT is the actively maintained successor to Plasmo (which appears to be in maintenance mode as of 2025). Vite-based, React + TypeScript first, supports Chrome/Firefox/Edge from one codebase. Content script UI for Wikipedia page overlays is a first-class use case. |
| @radix-ui/react-* | latest | Accessible UI primitives underlying shadcn/ui | Use directly when shadcn/ui doesn't have a specific component. The reviewer annotation UI (paragraph highlights, popover commentary) will need Radix Popover, Tooltip, and Dialog. |
| nuqs | latest | Type-safe URL state — reviewer queue filters | The moderation dashboard needs URL-serialized filter state (status, reviewer, date) so deep links work. nuqs syncs React state to URL search params with Zod-validated parsing. |
| date-fns | 3.x | Date formatting and comparison — staleness detection | Lightweight, tree-shakable. Used for comparing Wikipedia article `revid` timestamps against fact-check `last_reviewed_at`. |
| pino | latest | Structured logging | JSON-structured logs for the AI pipeline. Critical for debugging LLM extraction failures in production. Use pino-pretty in development. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Drizzle Kit | Schema migrations and studio | `drizzle-kit generate` for migrations, `drizzle-kit studio` for visual DB inspection during development. |
| Turbopack | Next.js bundler (built-in) | Enabled by default in Next.js 16. Rust-based, significantly faster than webpack for development builds. No configuration needed. |
| Vitest | Unit and integration testing | Vite-compatible test runner; fastest option for testing Drizzle queries, AI extraction schemas, and score computation. |
| Playwright | End-to-end testing | Test the full reviewer workflow (login → claim queue → approve → check public site reflects change). |
| ESLint + @typescript-eslint | Linting | Standard Next.js ESLint config. Add `@typescript-eslint/no-unsafe-*` rules for the AI output paths where types must be enforced. |

## Installation

```bash
# Core framework
npx create-next-app@latest rosetta --typescript --tailwind --app --eslint

# Database ORM
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# AI SDK + providers
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
npm install zod

# Authentication
npm install next-auth@beta @auth/drizzle-adapter

# Background jobs
npm install pg-boss

# Parsing + content ingestion
npm install cheerio

# UI components
npx shadcn@latest init
npm install @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-dialog

# Utilities
npm install nuqs date-fns pino

# Dev dependencies
npm install -D vitest @vitejs/plugin-react playwright @playwright/test
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Drizzle ORM 0.45 | Prisma 7 | Prisma is better if your team is less comfortable with SQL and prefers Prisma Studio's GUI for DB management. Prisma 7 removed the Rust engine, closing the bundle size gap, but Drizzle is still leaner for serverless edge cases. |
| pg-boss (PostgreSQL queue) | BullMQ (Redis queue) | BullMQ if you anticipate high-volume parallel LLM jobs (1000+/day) and need Redis-native features like pub/sub or sorted sets for priority scheduling. For Rosetta's small reviewer team and moderate Wikipedia URL volume, BullMQ requires an additional Redis service for no material benefit. |
| Neon (serverless PostgreSQL) | Supabase | Supabase if you want bundled auth, realtime subscriptions, and storage. Rosetta builds auth itself (Auth.js) and doesn't need realtime or storage, so Neon's focused serverless Postgres is a better fit — you pay only for what you use. |
| Next.js (monolithic) | Separate Next.js frontend + FastAPI backend | A Python backend is reasonable if the AI pipeline demands Python-native ML libraries (e.g., spaCy for NER). The Vercel AI SDK covers the LLM abstraction adequately in TypeScript, so splitting introduces deployment complexity without benefit. Revisit if a custom embedding model or fine-tuning step requires Python. |
| Auth.js v5 | Better Auth | Better Auth is gaining traction in 2026 as a full-featured alternative. However, Auth.js v5 merged with Better Auth project and is now stable for Next.js. Stick with next-auth v5 for Next.js-native middleware integration. |
| WXT | Plasmo | Plasmo only if an existing Plasmo codebase exists. For new extension work, Plasmo is in maintenance mode; WXT is the actively developed replacement. |
| shadcn/ui | Mantine or Chakra UI | Mantine if you want a batteries-included component library with opinionated defaults. shadcn/ui gives more control over component internals, which matters for the custom paragraph annotation and scoring visualization UI. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain.js | Abstracts LLM in ways that make debugging harder, adds significant bundle weight, and has unstable API surfaces across versions. The Vercel AI SDK covers claim extraction and structured generation with a stable, typed API. | Vercel AI SDK `generateObject` with Zod schemas |
| tRPC | Adds complexity for an app where Server Actions cover 90% of data mutations and Server Components handle reads. tRPC shines for public APIs consumed by third parties; Rosetta doesn't have that use case in v1. | Next.js Server Actions + Route Handlers |
| React Query / TanStack Query | Server Components with streaming eliminate most client-side data-fetching patterns that React Query solves. The reviewer dashboard doesn't need optimistic updates with complex cache invalidation. | Next.js Server Components + `revalidatePath` |
| Prisma (Accelerate / Pulse) | Prisma's accelerate add-on costs money for the edge connection pooling that Neon's serverless driver provides for free. Pulse (realtime) is unnecessary for this use case. | Neon serverless driver |
| Redis (standalone) | Adds infrastructure that pg-boss on Postgres makes unnecessary for this job volume. More services = more failure modes. | pg-boss on existing PostgreSQL |
| OpenAI SDK / Anthropic SDK (direct) | Hard-codes a single provider. PROJECT.md explicitly requires provider-agnosticism. Direct SDK usage bypasses the abstraction layer entirely. | Vercel AI SDK with provider-specific adapters |
| Plasmo | Maintenance mode as of 2025. The WXT team's official comparison page notes Plasmo has "little to no maintainers or feature development happening." | WXT |
| MySQL / SQLite | This domain requires JSONB for AI output storage, full-text search for claim text, and SKIP LOCKED for the job queue — all PostgreSQL-native features. MySQL supports JSONB partially; SQLite is single-writer and serverless-incompatible. | PostgreSQL 16 |

## Stack Patterns by Variant

**If deploying to Vercel (recommended):**
- Use `@neondatabase/serverless` driver instead of `pg` for connection pooling without persistent connections
- Neon database with branching for preview deployments per PR
- Vercel AI SDK provider defaults to Vercel AI Gateway for observability

**If self-hosting on VPS or Railway:**
- Use standard `pg` driver with PgBouncer for connection pooling
- Can use Docker Compose: Next.js + PostgreSQL + pg-boss in same environment
- Neon still works as managed DB, or run PostgreSQL container directly

**If LLM budget is critical:**
- Configure AI SDK to route simple claim extraction to GPT-4o-mini or Claude Haiku
- Reserve Claude Sonnet / GPT-4o for full article analysis and final scoring
- AI SDK provider config is one-line swap — no pipeline changes needed

**If the browser extension becomes higher priority:**
- WXT project lives as a separate package in a monorepo (Turborepo)
- Shared Zod types between the WXT extension and Next.js app ensure API contract consistency
- Extension calls the public Next.js API routes to fetch overlay data

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| next@16.x | react@19, react-dom@19 | Next.js 16 requires React 19. shadcn/ui components are React 19 compatible. |
| next-auth@5.0.0-beta.x | next@16.x | Auth.js v5 requires Next.js 14+. Works with Next.js 16. |
| drizzle-orm@0.45.x | @neondatabase/serverless | Neon serverless driver passes its connection directly to Drizzle's `drizzle()` constructor. |
| ai@4.x | zod@4.x | Vercel AI SDK peer-depends on Zod for `generateObject` schema definitions. Verify peer dep range on install. |
| pg-boss@12.x | pg@8.x, Node 20+ | pg-boss v10+ requires Node 20 minimum and PostgreSQL 13+. |
| tailwindcss@4.2.x | shadcn/ui (latest) | shadcn/ui updated to Tailwind v4 in March 2025. Use shadcn's v4-compatible init. |

## MediaWiki API Notes

The MediaWiki API is the data source, not a library choice. Key implementation details:

- **Rate limiting**: Wikimedia is rolling out stricter API rate limits in 2026. Unauthenticated requests face lower limits. Register a User-Agent string identifying the application (`Rosetta/1.0 (https://rosetta.com; contact@rosetta.com)`).
- **Content endpoint**: `action=parse&page=TITLE&prop=sections|text|wikitext` returns structured section data and parsed HTML
- **Staleness detection**: `action=query&prop=revisions&rvprop=ids|timestamp` returns the current `revid` — store this on each fact-check and compare on a cron job
- **Request pattern**: Serial requests (not parallel) per API etiquette. Use exponential backoff on `ratelimited` errors. pg-boss job concurrency should be set to 1-2 workers for Wikipedia fetches.
- **No TypeScript client needed**: Raw `fetch` with proper headers is sufficient. Wrap in a thin `src/lib/mediawiki.ts` module.

## Sources

- [Vercel AI SDK — GitHub](https://github.com/vercel/ai) — verified provider-agnostic architecture, generateObject, AI SDK 5/6 versions
- [AI SDK docs — ai-sdk.dev](https://ai-sdk.dev/docs/introduction) — structured output, generateObject reference
- [Drizzle ORM docs](https://orm.drizzle.team/docs/latest-releases) — version 0.45.2 confirmed current, PostgreSQL schema patterns verified via Context7
- [Drizzle vs Prisma 2026 — makerkit.dev](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — MEDIUM confidence comparison
- [pg-boss GitHub releases](https://github.com/timgit/pg-boss/releases) — v12.15.0 confirmed current
- [MediaWiki API rate limits](https://api.wikimedia.org/wiki/Rate_limits) — 2026 rate limit rollout confirmed
- [WXT framework](https://wxt.dev/) — actively maintained, Plasmo comparison verified
- [Plasmo maintenance status — redreamality.com](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs/) — MEDIUM confidence
- [Auth.js v5 — authjs.dev](https://authjs.dev/getting-started/migrating-to-v5) — Next.js 16 compatibility confirmed
- [Tailwind CSS v4.2](https://tailwindcss.com/blog/tailwindcss-v4) — v4.2.0 stable, February 2026
- [Neon vs Supabase — sqlflash.ai](https://sqlflash.ai/article/20251011_neon_vs_supabase/) — MEDIUM confidence production comparison
- [Zod v4 release notes — zod.dev](https://zod.dev/v4) — performance numbers and features verified

---
*Stack research for: Wikipedia fact-checking platform (Project Rosetta)*
*Researched: 2026-04-18*
