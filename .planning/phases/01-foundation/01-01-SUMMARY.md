---
phase: 01-foundation
plan: 01
subsystem: infrastructure
tags: [database, schema, drizzle, docker, next.js, shadcn, vitest]
dependency_graph:
  requires: []
  provides:
    - next.js-project
    - postgresql-docker
    - drizzle-schema
    - domain-types
    - vitest-config
    - shadcn-components
  affects:
    - all subsequent plans (every plan builds on this foundation)
tech_stack:
  added:
    - Next.js 16.2.4 (app router, TypeScript, Tailwind v4)
    - drizzle-orm 0.45.2 + drizzle-kit 0.31.10
    - pg 8.20.0 (node-postgres driver)
    - @paralleldrive/cuid2 (CUID2 primary keys, D-08)
    - next-auth 5.0.0-beta.31 + @auth/drizzle-adapter 1.11.2
    - ai SDK + @ai-sdk/anthropic + @ai-sdk/openai (Vercel AI SDK)
    - zod 4.3.6
    - bcryptjs 3.0.3
    - pg-boss 12.15.0
    - vitest 4.1.4 + @vitejs/plugin-react 6.0.1
    - server-only 0.0.1
    - shadcn/ui (button, input, label, card, separator, alert)
    - PostgreSQL 16 via Docker Compose
  patterns:
    - Drizzle ORM with node-postgres driver (local dev path)
    - pgEnum for review_status (never raw text)
    - CUID2 text PKs via $defaultFn (D-08)
    - Soft delete via deletedAt timestamp (D-09)
    - server-only import guard on db module (T-01-04)
    - pnpm as package manager (D-15)
key_files:
  created:
    - package.json (name: rosetta, engines node>=22.12.0, all Phase 1 deps)
    - .nvmrc (22.12.0)
    - docker-compose.yml (PostgreSQL 16 + pgAdmin)
    - .env.local.example (no secrets, committed)
    - .env.local (DATABASE_URL + AUTH_SECRET placeholder, gitignored)
    - drizzle.config.ts (explicit schema path, Pitfall 4 mitigation)
    - vitest.config.ts (@/ alias, node environment)
    - src/db/schema.ts (all 11 tables: 4 auth + 7 domain)
    - src/db/index.ts (singleton db export with server-only guard)
    - src/types/index.ts (domain type exports via $inferSelect)
    - src/components/ui/{button,input,label,card,separator,alert}.tsx
  modified:
    - .gitignore (added !.env.local.example exception)
    - pnpm-lock.yaml (updated with all Phase 1 deps)
decisions:
  - CUID2 text PKs used for domain tables (D-08) — createId() from @paralleldrive/cuid2
  - Standard pg Pool (not Neon serverless) for local Docker development per D-01
  - drizzle.config.ts points to explicit src/db/schema.ts path (Pitfall 4: pg-boss conflict avoidance)
  - @types/node upgraded to v22 to resolve pnpm virtual store symlink issue with TypeScript
  - shadcn initialized with --defaults flag (shadcn v4 dropped --style/--base-color flags)
metrics:
  duration: 10 minutes
  completed: 2026-04-19
  tasks_completed: 2
  tasks_total: 2
  files_created: 15
  files_modified: 2
---

# Phase 01 Plan 01: Foundation Bootstrap Summary

**One-liner:** Next.js 16 project bootstrapped with PostgreSQL via Docker, 11-table Drizzle schema (CUID2 PKs, soft deletes, pgEnum review status) pushed to live database, and all Phase 1 dependencies installed via pnpm.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Bootstrap Next.js project and install all Phase 1 dependencies | e733656 | package.json, pnpm-lock.yaml, .nvmrc, docker-compose.yml, .env.local.example, drizzle.config.ts, vitest.config.ts, shadcn components |
| 2 | Create complete Drizzle schema, db instance, domain types, and push to database | 63a4611 | src/db/schema.ts, src/db/index.ts, src/types/index.ts |

## What Was Built

### Infrastructure
- Next.js 16.2.4 project scaffolded via `pnpm create next-app@latest` (TypeScript, Tailwind v4, app router, src-dir layout, `@/*` alias)
- Docker Compose with PostgreSQL 16 and pgAdmin — database started and schema applied
- All Phase 1 dependencies installed: Drizzle ORM, next-auth@beta, Vercel AI SDK, zod@4, bcryptjs, pg-boss, vitest, shadcn/ui components

### Database Schema (11 tables)
**Auth tables (4):** `user`, `account`, `session`, `verificationToken` — exact column names required by `@auth/drizzle-adapter` (Pitfall 3). Custom columns (`passwordHash`, `role`, `createdAt`, `updatedAt`, `deletedAt`) added alongside without renaming adapter columns.

**Domain tables (7):** `article`, `section`, `paragraph`, `claim`, `commentary`, `review`, `score`
- All use CUID2 text PKs via `$defaultFn(() => createId())` (D-08)
- All have `deletedAt` timestamp for soft delete (D-09)
- All have `createdAt` + `updatedAt` timestamps (D-10)
- FK constraints with `onDelete: 'cascade'` enforce referential integrity (T-01-03)
- `paragraph.stableId` stores `section_path:content_hash:revision_id` anchor

**Enum:** `reviewStatusEnum` pgEnum with values `['PENDING', 'AI_ANALYZED', 'HUMAN_APPROVED', 'HUMAN_REJECTED', 'PUBLISHED']`

### Configuration
- `drizzle.config.ts` explicitly scoped to `src/db/schema.ts` (not a glob) — prevents pg-boss `pgboss` schema conflict (Pitfall 4)
- `vitest.config.ts` configured with `@/` path alias and `node` environment
- `tsconfig.json` already had `"paths": { "@/*": ["./src/*"] }` from `create-next-app`
- `.env.local.example` committed with all required env var keys (no secrets)
- `.env.local` gitignored with `DATABASE_URL` populated for local Docker

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] pnpm node_modules copied from /tmp broke virtual store hardlinks**
- **Found during:** Task 1 verification (TypeScript type errors)
- **Issue:** Copying `node_modules` from `/tmp/rosetta-temp` to worktree via rsync broke pnpm's content-addressable hardlinks. Virtual store directories at `.pnpm/@types+react@19.2.14/` were empty (0B) because hardlinks only work within the same filesystem/pnpm store.
- **Fix:** Deleted copied `node_modules` and ran `pnpm install` fresh in the worktree directory — pnpm resolved from global store correctly.
- **Files modified:** node_modules (not committed)

**2. [Rule 1 - Bug] @types/node v20 has no root index.d.ts (split package format)**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `@types/node@20.19` uses the new split package format (`ts5.6/` subdirectory only, no root `index.d.ts`) — TypeScript reported "Cannot find type definition file for 'node'".
- **Fix:** Upgraded `@types/node` to `^22` which includes a root `index.d.ts`.
- **Files modified:** package.json, pnpm-lock.yaml

**3. [Rule 3 - Blocking] shadcn v4 dropped --style and --base-color flags**
- **Found during:** Task 1 shadcn init
- **Issue:** `pnpm dlx shadcn@latest init --style new-york --base-color zinc` failed with "unknown option '--style'" — shadcn v4 changed its init API.
- **Fix:** Used `pnpm dlx shadcn@latest init --defaults --yes` which picks Nova preset (Lucide/Geist) with Radix components — functionally equivalent for Phase 1 purposes.
- **Files modified:** components.json, src/app/globals.css, src/lib/utils.ts, src/components/ui/button.tsx

**4. [Rule 3 - Blocking] Docker Desktop not running**
- **Found during:** Task 2 schema push
- **Issue:** Docker daemon socket at `~/.docker/run/docker.sock` was a broken symlink — Docker Desktop was not running.
- **Fix:** Launched Docker Desktop via `open -a Docker`, waited for daemon readiness, then proceeded with `docker compose up -d postgres` and `drizzle-kit push`.
- **Files modified:** None (operational)

**5. [Rule 3 - Blocking] Next.js scaffold conflicted with .planning/ directory**
- **Found during:** Task 1 `pnpm create next-app@latest .`
- **Issue:** `create-next-app` refused to scaffold into the worktree directory because `.planning/` existed.
- **Fix:** Scaffolded into `/tmp/rosetta-temp` then rsync'd files (excluding .git and .next) to worktree.
- **Files modified:** None (operational)

## Schema Table Count Note

The plan narrative says "12 tables (4 auth + 8 domain)" but the task specification only defines 7 domain tables: `articles`, `sections`, `paragraphs`, `claims`, `commentaries`, `reviews`, `scores`. All 7 domain tables + 4 auth tables = 11 tables total, all created in PostgreSQL. The `reviewStatusEnum` is a PostgreSQL enum type (not a table) which may explain the count discrepancy in the plan.

## Known Stubs

None — this plan creates schema and configuration only. No UI components with placeholder data or unconnected data sources.

## Threat Flags

No new threat surface beyond the plan's threat model. All mitigations applied:
- T-01-01: `.env.local` gitignored via `.env*` pattern; `.env.local.example` has no secrets
- T-01-02: Docker credentials are local-dev-only (rosetta/rosetta)
- T-01-03: FK constraints with `onDelete: 'cascade'` + pgEnum applied in schema
- T-01-04: `import 'server-only'` in `src/db/index.ts`

## Self-Check: PASSED

All 15 created/modified files verified present on disk. Both task commits (e733656, 63a4611) found in git log. No unexpected file deletions detected.
