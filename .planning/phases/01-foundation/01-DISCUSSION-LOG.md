# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 01-foundation
**Areas discussed:** Database provisioning, Auth flow & session strategy, Schema conventions, Project structure

---

## Database Provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Neon (Recommended) | Free tier, serverless PostgreSQL, no local setup | |
| Docker Compose | Local PostgreSQL container, full control, works offline | ✓ |
| Supabase | Managed PostgreSQL with extras | |

**User's choice:** Docker Compose
**Notes:** User prefers local development setup with full control

| Option | Description | Selected |
|--------|-------------|----------|
| Local only for now | Docker for dev, defer cloud DB | ✓ |
| Neon for preview deploys | Add Neon free tier for Vercel previews | |

**User's choice:** Local only for now

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL only | Single postgres service | |
| PostgreSQL + pgAdmin | Add pgAdmin web UI for visual browsing | ✓ |

**User's choice:** PostgreSQL + pgAdmin

---

## Auth Flow & Session Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| JWT sessions (Recommended) | Stateless tokens, simpler, compatible with Credentials provider | ✓ |
| Database sessions | Server-side, revocable, but risky with Credentials in v5 beta | |

**User's choice:** JWT sessions

| Option | Description | Selected |
|--------|-------------|----------|
| Centered card | Simple centered login form + OAuth buttons | |
| Split layout | Branding left, form right | |
| You decide | Claude picks | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Invite-only (Recommended) | Admin creates accounts, aligns with small team vision | ✓ |
| Self-service with approval | Anyone registers, admin approves | |
| Self-service open | Open registration | |

**User's choice:** Invite-only

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard overview | Landing with queue stats, shell for Phase 4 | |
| Directly to review queue | Skip overview | |
| You decide | Claude picks | ✓ |

**User's choice:** Claude's discretion

---

## Schema Conventions

| Option | Description | Selected |
|--------|-------------|----------|
| UUIDs (Recommended) | uuid_generate_v4(), no sequential leaking | |
| Serial integers | Auto-incrementing bigint, faster joins | |
| CUID2 | K-sortable, URL-safe, app-generated | ✓ |

**User's choice:** CUID2

| Option | Description | Selected |
|--------|-------------|----------|
| Soft deletes (Recommended) | deletedAt timestamp, records never removed | ✓ |
| Hard deletes | Physical deletion | |
| Mixed approach | Soft for auditable, hard for transient | |

**User's choice:** Soft deletes

| Option | Description | Selected |
|--------|-------------|----------|
| PostgreSQL native enums | DB-enforced via CREATE TYPE | |
| Text columns with app validation | Varchar + Zod | |
| You decide | Claude picks | ✓ |

**User's choice:** Claude's discretion

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, all tables (Recommended) | createdAt + updatedAt everywhere | ✓ |
| Only where needed | Domain tables only | |

**User's choice:** All tables

---

## Project Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Feature-based (Recommended) | Group by domain: src/features/auth/, etc. | ✓ |
| Layer-based | Group by type: src/components/, etc. | |
| Hybrid | App Router + src/lib/{domain}/ | |

**User's choice:** Feature-based

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind CSS (Recommended) | Utility-first, fast iteration | ✓ |
| CSS Modules | Scoped CSS files per component | |
| Tailwind + shadcn/ui | Tailwind with pre-built components | |

**User's choice:** Tailwind CSS

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn/ui (Recommended) | Copy-paste accessible Radix components | ✓ |
| Build from scratch | Custom components | |

**User's choice:** shadcn/ui

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm (Recommended) | Fast, disk-efficient, strict resolution | ✓ |
| npm | Default, widest compatibility | |

**User's choice:** pnpm

---

## Claude's Discretion

- Login page design (centered card vs split layout)
- Post-login landing page (dashboard overview vs review queue)
- Enum handling strategy (native PostgreSQL enums vs text + Zod)
- Docker Compose port mappings and volume config

## Deferred Ideas

None — discussion stayed within phase scope
