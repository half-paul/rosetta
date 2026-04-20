import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, inArray } from 'drizzle-orm'
import * as schema from '@/db/schema'

// Create test DB connection (same pattern as ingest-worker.test.ts)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const testDb = drizzle(pool, { schema })

vi.mock('server-only', () => ({}))

// Mock LLM modules — no live LLM calls in integration tests
vi.mock('@/features/analysis/claim-extractor', () => ({
  extractClaims: vi.fn(),
}))
vi.mock('@/features/analysis/commentary-drafter', () => ({
  draftCommentary: vi.fn(),
}))
// Mock score engine persistence — test focuses on claims/commentary persistence
vi.mock('@/features/analysis/score-engine', () => ({
  computeAndPersistScore: vi.fn(),
  computeFactualScore: vi.fn(),
  DEFAULT_WEIGHTS: { coverage: 0.4, accuracy: 0.4, confidence: 0.2 },
}))

// Mock @/db to use the same test pool (avoids server-only guard at module level)
vi.mock('@/db', async () => {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('@/db/schema')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return { db: drizzle(pool, { schema }) }
})

import { runAnalysisJob } from '@/features/analysis/analysis-worker'
import { extractClaims } from '@/features/analysis/claim-extractor'
import { draftCommentary } from '@/features/analysis/commentary-drafter'
import { computeAndPersistScore } from '@/features/analysis/score-engine'

// -------------------------------------------------------------------------
// Mock return values
// -------------------------------------------------------------------------

const MOCK_CLAIMS = {
  claims: [
    {
      text: 'The Earth is approximately 4.5 billion years old',
      severity: 'medium' as const,
      charOffsetStart: 0,
      charOffsetEnd: 47,
      confidenceScore: 0.92,
    },
  ],
}

const MOCK_COMMENTARY = {
  analysisText: 'This claim about Earth age is well-established in geological literature...',
  suggestedSources: [
    {
      url: 'https://example.com/geology',
      title: 'Geological Society Reference',
      relevanceNote: 'Primary geological dating source',
      isVerified: false as const,
    },
  ],
}

// -------------------------------------------------------------------------
// Test helpers
// -------------------------------------------------------------------------

async function cleanTestData() {
  // Delete in FK order: commentaries -> claims -> scores -> paragraphs -> sections -> articles
  await testDb.delete(schema.commentaries)
  await testDb.delete(schema.claims)
  await testDb.delete(schema.scores)
  await testDb.delete(schema.paragraphs)
  await testDb.delete(schema.sections)
  await testDb.delete(schema.articles)
}

async function seedTestArticle(): Promise<string> {
  const [article] = await testDb
    .insert(schema.articles)
    .values({
      title: 'Test Analysis Article',
      wikiUrl: `https://en.wikipedia.org/wiki/Analysis_Test_${Date.now()}`,
      revisionId: 99999,
      language: 'en',
    })
    .returning()

  const [section] = await testDb
    .insert(schema.sections)
    .values({
      articleId: article.id,
      title: 'lead',
      path: 'lead',
      position: 0,
    })
    .returning()

  await testDb.insert(schema.paragraphs).values([
    {
      sectionId: section.id,
      stableId: `lead:abc123:99999`,
      content: 'The Earth is approximately 4.5 billion years old according to geological evidence.',
      contentHash: 'abc123',
      position: 0,
    },
    {
      sectionId: section.id,
      stableId: `lead:def456:99999`,
      content: 'The sky appears blue due to Rayleigh scattering of sunlight.',
      contentHash: 'def456',
      position: 1,
    },
  ])

  return article.id
}

// -------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------

describe('runAnalysisJob integration (AI-04)', () => {
  beforeEach(async () => {
    await cleanTestData()
    vi.clearAllMocks()
    // D-21: disable rate limiting delay in tests
    process.env.ANALYSIS_RATE_LIMIT_MS = '0'
    vi.mocked(extractClaims).mockResolvedValue(MOCK_CLAIMS)
    vi.mocked(draftCommentary).mockResolvedValue(MOCK_COMMENTARY)
    vi.mocked(computeAndPersistScore).mockResolvedValue(undefined)
  })

  afterAll(async () => {
    await cleanTestData()
    await pool.end()
  })

  it('persists extracted claims to database with all D-05 fields', async () => {
    const articleId = await seedTestArticle()

    await runAnalysisJob({ articleId })

    // Query claims for this article's paragraphs
    const articleSections = await testDb
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(eq(schema.sections.articleId, articleId))
    const sectionIds = articleSections.map((s) => s.id)
    const articleParagraphs = await testDb
      .select({ id: schema.paragraphs.id })
      .from(schema.paragraphs)
      .where(inArray(schema.paragraphs.sectionId, sectionIds))
    const paragraphIds = articleParagraphs.map((p) => p.id)
    const insertedClaims = await testDb
      .select()
      .from(schema.claims)
      .where(inArray(schema.claims.paragraphId, paragraphIds))

    // MOCK_CLAIMS returns 1 claim per paragraph, 2 paragraphs = 2 claims
    expect(insertedClaims.length).toBeGreaterThanOrEqual(1)
    const firstClaim = insertedClaims[0]
    expect(firstClaim.text).toBe('The Earth is approximately 4.5 billion years old')
    expect(firstClaim.severity).toBe('medium')
    expect(firstClaim.confidenceScore).toBeCloseTo(0.92, 2)
    expect(firstClaim.charOffsetStart).toBe(0)
    expect(firstClaim.charOffsetEnd).toBe(47)
  })

  it('persists commentary with AI_ANALYZED status and suggested sources (D-07, D-08)', async () => {
    const articleId = await seedTestArticle()

    await runAnalysisJob({ articleId })

    const articleSections = await testDb
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(eq(schema.sections.articleId, articleId))
    const sectionIds = articleSections.map((s) => s.id)
    const articleParagraphs = await testDb
      .select({ id: schema.paragraphs.id })
      .from(schema.paragraphs)
      .where(inArray(schema.paragraphs.sectionId, sectionIds))
    const paragraphIds = articleParagraphs.map((p) => p.id)
    const insertedClaims = await testDb
      .select({ id: schema.claims.id })
      .from(schema.claims)
      .where(inArray(schema.claims.paragraphId, paragraphIds))
    const claimIds = insertedClaims.map((c) => c.id)
    const insertedCommentaries = await testDb
      .select()
      .from(schema.commentaries)
      .where(inArray(schema.commentaries.claimId, claimIds))

    expect(insertedCommentaries.length).toBeGreaterThanOrEqual(1)
    const commentary = insertedCommentaries[0]
    // D-08: commentary status must be AI_ANALYZED from initial insert
    expect(commentary.status).toBe('AI_ANALYZED')
    // D-07: suggestedSources is JSONB array with isVerified: false
    expect(Array.isArray(commentary.suggestedSources)).toBe(true)
    const sources = commentary.suggestedSources as Array<{ isVerified: boolean; url: string }>
    expect(sources[0].isVerified).toBe(false)
    expect(sources[0].url).toBe('https://example.com/geology')
  })

  it('handles paragraph with no claims (D-03)', async () => {
    const articleId = await seedTestArticle()

    // First paragraph returns no claims, second returns MOCK_CLAIMS
    vi.mocked(extractClaims)
      .mockResolvedValueOnce({ claims: [] })
      .mockResolvedValueOnce(MOCK_CLAIMS)

    // Should complete without error
    await expect(runAnalysisJob({ articleId })).resolves.not.toThrow()

    const articleSections = await testDb
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(eq(schema.sections.articleId, articleId))
    const sectionIds = articleSections.map((s) => s.id)
    const articleParagraphs = await testDb
      .select({ id: schema.paragraphs.id })
      .from(schema.paragraphs)
      .where(inArray(schema.paragraphs.sectionId, sectionIds))
    const paragraphIds = articleParagraphs.map((p) => p.id)
    const insertedClaims = await testDb
      .select()
      .from(schema.claims)
      .where(inArray(schema.claims.paragraphId, paragraphIds))

    // Only the second paragraph's claim is inserted
    expect(insertedClaims.length).toBe(1)
  })

  it('continues processing on per-paragraph LLM failure', async () => {
    const articleId = await seedTestArticle()

    // First call throws; second returns MOCK_CLAIMS
    vi.mocked(extractClaims)
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce(MOCK_CLAIMS)

    // Should complete without throwing — per-paragraph error handling
    await expect(runAnalysisJob({ articleId })).resolves.not.toThrow()

    // Second paragraph's claims should still be persisted
    const articleSections = await testDb
      .select({ id: schema.sections.id })
      .from(schema.sections)
      .where(eq(schema.sections.articleId, articleId))
    const sectionIds = articleSections.map((s) => s.id)
    const articleParagraphs = await testDb
      .select({ id: schema.paragraphs.id })
      .from(schema.paragraphs)
      .where(inArray(schema.paragraphs.sectionId, sectionIds))
    const paragraphIds = articleParagraphs.map((p) => p.id)
    const insertedClaims = await testDb
      .select()
      .from(schema.claims)
      .where(inArray(schema.claims.paragraphId, paragraphIds))

    // First paragraph failed, second succeeded — at least 1 claim
    expect(insertedClaims.length).toBe(1)
  })

  it('calls computeAndPersistScore after processing all paragraphs', async () => {
    const articleId = await seedTestArticle()

    await runAnalysisJob({ articleId })

    expect(computeAndPersistScore).toHaveBeenCalledWith(articleId)
    expect(computeAndPersistScore).toHaveBeenCalledTimes(1)
  })
})
