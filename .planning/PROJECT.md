# Project Rosetta

## What This Is

A full-stack platform that fact-checks Wikipedia articles. Users paste a Wikipedia URL and see the original article alongside granular, paragraph-level commentary and a 0–100 "Factual Score." AI drafts complete analyses with sources and scores, but nothing publishes without explicit human reviewer approval.

## Core Value

Every published fact-check has been verified by a human — AI accelerates the work, humans guarantee the quality.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] URL routing engine that mirrors Wikipedia's URL structure
- [ ] Wikipedia content ingestion via API with DOM-level paragraph mapping
- [ ] Granular data model anchoring commentary to specific sections/paragraphs/sentences
- [ ] AI claim extraction pipeline with provider-agnostic LLM integration
- [ ] AI-drafted commentary with suggested primary sources
- [ ] Weighted Factual Score algorithm (0–100) based on false claims, severity, and review coverage
- [ ] Reviewer dashboard with queue of AI-flagged paragraphs
- [ ] Human moderation workflow: Unreviewed → AI Analyzed → Human Approved → Published
- [ ] Reviewer authentication (email/password + OAuth)
- [ ] Public-facing site at rosetta.com/wiki/Topic with side-by-side reading experience
- [ ] Stale content detection — flag fact-checks when Wikipedia article changes
- [ ] Browser extension that overlays fact-checks directly on Wikipedia pages

### Out of Scope

- Multi-language Wikipedia support — English only for v1
- Open/crowdsourced reviewer applications — small known team for v1
- Real-time collaborative editing of fact-checks
- Mobile native apps — web-first
- Browser extension is v1 scope but lower priority than the core site

## Context

- Wikipedia's MediaWiki API provides structured content access including section parsing and revision tracking
- The AI pipeline must be provider-agnostic — abstract the LLM layer so Claude, GPT-4, or others can be swapped
- Reviewers are a small trusted team (likely 2–5 people) onboarded directly by the project owner
- The Factual Score must clearly communicate what proportion of the article has been human-reviewed vs AI-only, so users understand confidence levels
- Wikipedia content changes frequently — the system needs to detect edits to articles with existing fact-checks and flag them for re-review rather than silently serving stale commentary
- The public audience is general internet users who want a trust signal when reading Wikipedia

## Constraints

- **Human-in-the-loop**: No fact-check or score publishes without explicit human approval — this is non-negotiable
- **LLM Provider**: Must be provider-agnostic — no hard dependency on a single AI vendor
- **Wikipedia API**: Must respect MediaWiki API rate limits and terms of use
- **Content scope**: English Wikipedia only (en.wikipedia.org) for v1
- **Reviewer team**: Small team (~2–5), no public sign-up flow needed in v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Website-first, extension second | Need full control over UX for v1; extension adds complexity | — Pending |
| Provider-agnostic AI layer | Avoid vendor lock-in, allow cost/quality optimization | — Pending |
| Flag stale rather than version content | Versioning adds significant DB complexity; flagging is simpler and sufficient for v1 | — Pending |
| Email/password + OAuth for reviewers | Small team needs simple onboarding but OAuth adds convenience | — Pending |
| Full pipeline as v1 definition of done | Not a curated demo — any Wikipedia URL should work end-to-end | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-18 after initialization*
