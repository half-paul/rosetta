import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

// ---------------------------------------------------------------------------
// Review status enum (T-01-03: pgEnum enforces valid review status values)
// ---------------------------------------------------------------------------

export const reviewStatusEnum = pgEnum('review_status', [
  'PENDING',
  'AI_ANALYZED',
  'HUMAN_APPROVED',
  'HUMAN_REJECTED',
  'PUBLISHED',
])

// ---------------------------------------------------------------------------
// Auth tables — required by @auth/drizzle-adapter
// Column names must stay EXACTLY as shown (Pitfall 3: adapter schema drift)
// Custom application columns added alongside, never renaming required ones
// ---------------------------------------------------------------------------

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // Application extensions (Pitfall 6: passwordHash lives here, not in join table)
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('reviewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
)

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
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

// ---------------------------------------------------------------------------
// Domain tables — CUID2 PKs (D-08), soft delete (D-09), timestamps (D-10)
// FK constraints with onDelete cascade (T-01-03: referential integrity)
// ---------------------------------------------------------------------------

export const articles = pgTable('article', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  title: text('title').notNull(),
  wikiUrl: text('wiki_url').notNull().unique(),
  revisionId: integer('revision_id').notNull(),
  language: text('language').notNull().default('en'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const sections = pgTable('section', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  articleId: text('article_id')
    .notNull()
    .references(() => articles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  path: text('path').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const paragraphs = pgTable('paragraph', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  sectionId: text('section_id')
    .notNull()
    .references(() => sections.id, { onDelete: 'cascade' }),
  // Stable anchor — locked decision: section_path + content_hash + revision_id
  stableId: text('stable_id').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const claims = pgTable('claim', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  paragraphId: text('paragraph_id')
    .notNull()
    .references(() => paragraphs.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  severity: text('severity'), // nullable — populated in Phase 3
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const commentaries = pgTable('commentary', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  claimId: text('claim_id')
    .notNull()
    .references(() => claims.id, { onDelete: 'cascade' }),
  draftText: text('draft_text').notNull(),
  status: reviewStatusEnum('status').notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
})

export const reviews = pgTable('review', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  commentaryId: text('commentary_id')
    .notNull()
    .references(() => commentaries.id, { onDelete: 'cascade' }),
  reviewerId: text('reviewer_id')
    .notNull()
    .references(() => users.id),
  previousStatus: reviewStatusEnum('previous_status').notNull(),
  newStatus: reviewStatusEnum('new_status').notNull(),
  editedText: text('edited_text'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const scores = pgTable('score', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  articleId: text('article_id')
    .notNull()
    .unique()
    .references(() => articles.id, { onDelete: 'cascade' }),
  factualScore: integer('factual_score').notNull().default(0),
  coveragePercent: integer('coverage_percent').notNull().default(0),
  totalParagraphs: integer('total_paragraphs').notNull().default(0),
  reviewedParagraphs: integer('reviewed_paragraphs').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
