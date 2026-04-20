# Phase 4: Reviewer Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 04-reviewer-dashboard
**Areas discussed:** Queue layout & prioritization, Source verification UX, Review workflow interactions, Audit log & monitoring

---

## Queue Layout & Prioritization

| Option | Description | Selected |
|--------|-------------|----------|
| Flat priority list | Single list sorted by severity with filters, Linear-style | ✓ |
| Kanban columns by status | Columns for each status, drag between | |
| Article-grouped | Group by article, paragraphs within | |

**User's choice:** Flat priority list
**Notes:** Linear-style reference confirmed upfront. Clean, filterable queue.

| Option | Description | Selected |
|--------|-------------|----------|
| Severity first | HIGH → MED → LOW, newest within same severity | ✓ |
| Newest first | Chronological | |
| Article traffic | Higher-traffic articles first | |

**User's choice:** Severity first

| Option | Description | Selected |
|--------|-------------|----------|
| Compact row | One line per item — severity badge, title, section, claims, assignee, status | ✓ |
| Preview card | Shows first ~100 chars of paragraph text | |
| You decide | Claude picks | |

**User's choice:** Compact row

| Option | Description | Selected |
|--------|-------------|----------|
| Manual assign from queue | Any reviewer assigns to self or others via dropdown | ✓ |
| Auto round-robin | System distributes automatically | |
| Self-serve only | Reviewers claim items, no assigning others | |

**User's choice:** Manual assign from queue

---

## Source Verification UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline checklist | Source cards with rating, all must be rated before Approve enables | ✓ |
| Separate verification step | Dedicated verification screen | |
| Side panel | Sources panel slides out from right | |

**User's choice:** Inline checklist

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox only | Binary verified/not verified | |
| Checkbox + note | Check + optional text note | |
| Traffic light rating | Confirms / Partially supports / Does not support | ✓ |

**User's choice:** Traffic light rating
**Notes:** More structured than simple checkbox — provides granular accuracy signal.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, feed into score | Confirms=1.0, Partially=0.5, Does not support=0.0 → accuracy ratings | ✓ |
| No, display only | Rating is informational | |
| You decide | Claude picks | |

**User's choice:** Yes, feed into score
**Notes:** Natural integration with Phase 3's score engine accuracy component.

---

## Review Workflow Interactions

| Option | Description | Selected |
|--------|-------------|----------|
| Split pane | Left: Wikipedia content with highlighted claims. Right: commentary + sources + actions | ✓ |
| Stacked view | Paragraph on top, commentary below | |
| Full-page detail | Navigate away from queue into dedicated page | |

**User's choice:** Split pane

| Option | Description | Selected |
|--------|-------------|----------|
| Inline edit | Click Edit, textarea in-place, save/cancel buttons | ✓ |
| Modal editor | Modal with rich editor | |
| You decide | Claude picks | |

**User's choice:** Inline edit

| Option | Description | Selected |
|--------|-------------|----------|
| Text selection | Highlight text, click Flag, mini form for severity + notes | ✓ |
| Add flag button per paragraph | +Flag icon per paragraph | |
| You decide | Claude picks | |

**User's choice:** Text selection

| Option | Description | Selected |
|--------|-------------|----------|
| Attached to flag/claim | Textarea alongside claim at flagged granularity | ✓ |
| Separate explanation tab | Dedicated explanations section | |
| You decide | Claude picks | |

**User's choice:** Attached to flag/claim

---

## Audit Log & Monitoring

| Option | Description | Selected |
|--------|-------------|----------|
| Activity feed per claim | Timeline at bottom of review pane + dedicated /dashboard/activity page | ✓ |
| Dedicated admin page only | Separate filterable table, not inline | |
| You decide | Claude picks | |

**User's choice:** Activity feed per claim

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard banner | Warning banner at top of queue when backlog exceeds threshold | ✓ |
| Email notifications | Email all reviewers when threshold crossed | |
| Both banner + email | Banner + email | |

**User's choice:** Dashboard banner

| Option | Description | Selected |
|--------|-------------|----------|
| Existing reviews table | Extend reviews table with action column | |
| Separate audit_log table | Dedicated append-only table for all actions | ✓ |
| You decide | Claude picks | |

**User's choice:** Separate audit_log table
**Notes:** More flexibility for non-review actions (assign, flag, explain, source verify).

---

## Claude's Discretion

- Filter/sort UI component choices
- Keyboard shortcuts
- Loading states and skeleton screens
- Empty state design
- Queue depth alert threshold default
- Pagination strategy
- State machine transition validation details

## Deferred Ideas

None — discussion stayed within phase scope
