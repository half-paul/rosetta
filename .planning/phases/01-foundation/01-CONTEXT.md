# Phase 1: Foundation - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Infrastructure skeleton that every other phase builds on: stable paragraph-anchored database schema, pg-boss background job queue, provider-agnostic LLM interface via Vercel AI SDK, and reviewer authentication via NextAuth v5. No public-facing features — this phase delivers the plumbing.

</domain>

<decisions>
## Implementation Decisions

### Database Provisioning
- **D-01:** PostgreSQL runs via Docker Compose for local development — no cloud DB in Phase 1
- **D-02:** docker-compose.yml includes PostgreSQL + pgAdmin services
- **D-03:** Cloud database (Neon or similar) deferred to deployment phase

### Authentication
- **D-04:** JWT session strategy with NextAuth v5 (avoids Credentials + database session compatibility issues in v5 beta)
- **D-05:** Invite-only registration — admin creates reviewer accounts, no self-service sign-up (aligns with out-of-scope "open/crowdsourced reviewer sign-up")
- **D-06:** OAuth providers: Google + GitHub (per MOD-01)
- **D-07:** Email/password via Credentials provider with bcrypt-hashed passwordHash column added to NextAuth users table

### Schema Conventions
- **D-08:** CUID2 for all primary keys — generated in application code, K-sortable, URL-safe, no DB extension required
- **D-09:** Soft deletes via deletedAt timestamp on all domain tables — records never physically removed (supports immutable audit log in MOD-08)
- **D-10:** createdAt + updatedAt columns on every table — createdAt defaults to now(), updatedAt auto-updates
- **D-11:** pg-boss runs in its own `pgboss` schema — Drizzle Kit scanner explicitly scoped to application schema files only

### Project Structure
- **D-12:** Feature-based folder layout: src/features/auth/, src/features/articles/, src/features/reviews/, etc.
- **D-13:** Tailwind CSS for styling — utility-first, consistent with Next.js ecosystem
- **D-14:** shadcn/ui component library — copy-paste accessible components built on Radix primitives
- **D-15:** pnpm as package manager

### Claude's Discretion
- Login page design (centered card recommended — keep it simple and functional)
- Post-login landing page (dashboard overview shell recommended — populated in Phase 4)
- Enum handling in Drizzle (PostgreSQL native enums vs text columns with app validation)
- Exact docker-compose port mappings and volume configuration
- Loading states and error boundary design

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` — Core value proposition and validated requirements
- `.planning/REQUIREMENTS.md` — Full v1 requirement list with traceability matrix
- `.planning/ROADMAP.md` — Phase goals, success criteria, and dependency chain

### Phase Research
- `.planning/phases/01-foundation/01-RESEARCH.md` — Stack versions, pitfalls, pg-boss API patterns, NextAuth v5 beta notes
- `.planning/research/STACK.md` — Technology stack decisions
- `.planning/research/ARCHITECTURE.md` — System architecture patterns
- `.planning/research/PITFALLS.md` — Known pitfalls and mitigations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield project. No existing code.

### Established Patterns
- None yet — this phase ESTABLISHES the patterns all future phases follow.

### Integration Points
- Docker Compose provides DATABASE_URL for Drizzle and pg-boss
- NextAuth config provides session/auth for all protected routes
- Vercel AI SDK createProviderRegistry provides LLM access for Phase 3

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Key constraint: this phase sets conventions that cascade into all 5 subsequent phases, so consistency and clean patterns matter more than speed.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-18*
