import { createHash } from 'node:crypto'

/**
 * Compute a 12-character hex content hash from a SHA-256 digest of the given plain text.
 * D-13: first 12 hex chars of SHA-256
 */
export function computeContentHash(plainText: string): string {
  return createHash('sha256').update(plainText, 'utf8').digest('hex').slice(0, 12)
}

/**
 * Build a stable ID from section path, content hash, and revision ID.
 * D-11: format is sectionPath:contentHash:revisionId
 */
export function buildStableId(
  sectionPath: string,
  contentHash: string,
  revisionId: number,
): string {
  return `${sectionPath}:${contentHash}:${revisionId}`
}

/**
 * Normalize an array of heading strings into a section path.
 * D-12: lowercases headings and joins with / replacing spaces with underscores
 */
export function normalizeSectionPath(headings: string[]): string {
  return headings
    .map(h => h.toLowerCase().replace(/\s+/g, '_'))
    .join('/')
}
