import type {
  articles,
  sections,
  paragraphs,
  claims,
  commentaries,
  reviews,
  scores,
  users,
} from '@/db/schema'

// Domain types inferred from Drizzle schema — single source of truth
export type Article = typeof articles.$inferSelect
export type NewArticle = typeof articles.$inferInsert
export type Section = typeof sections.$inferSelect
export type NewSection = typeof sections.$inferInsert
export type Paragraph = typeof paragraphs.$inferSelect
export type Claim = typeof claims.$inferSelect
export type Commentary = typeof commentaries.$inferSelect
export type Review = typeof reviews.$inferSelect
export type Score = typeof scores.$inferSelect
export type User = typeof users.$inferSelect

// Review workflow states — matches pgEnum in schema.ts
export type ReviewStatus =
  | 'PENDING'
  | 'AI_ANALYZED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'PUBLISHED'
