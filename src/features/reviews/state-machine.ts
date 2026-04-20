// Pure module — no 'server-only', no DB imports
// Single source of truth for review status transitions (D-14, MOD-09)

export type ReviewStatus =
  | 'PENDING'
  | 'AI_ANALYZED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'PUBLISHED'

/**
 * Valid state transitions for the review workflow.
 *
 * PENDING -> AI_ANALYZED: AI pipeline has analyzed the claim
 * AI_ANALYZED -> HUMAN_APPROVED: Reviewer approves the AI analysis
 * AI_ANALYZED -> HUMAN_REJECTED: Reviewer rejects the AI analysis
 * HUMAN_APPROVED -> PUBLISHED: Approved commentary is published
 * HUMAN_REJECTED -> PENDING: Rejected commentary re-enters the queue
 * PUBLISHED -> (none): Terminal state — no further transitions
 *
 * MOD-09: PUBLISHED is structurally unreachable without passing through
 * HUMAN_APPROVED because there is no AI_ANALYZED -> PUBLISHED entry.
 */
export const VALID_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  PENDING: ['AI_ANALYZED'],
  AI_ANALYZED: ['HUMAN_APPROVED', 'HUMAN_REJECTED'],
  HUMAN_APPROVED: ['PUBLISHED'],
  HUMAN_REJECTED: ['PENDING'],
  PUBLISHED: [],
}

/**
 * Validates whether a state transition is allowed.
 * Returns true only for transitions explicitly listed in VALID_TRANSITIONS.
 */
export function validateTransition(
  from: ReviewStatus,
  to: ReviewStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
