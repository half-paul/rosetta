import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

// Cleanup helper: delete test data in reverse dependency order
async function cleanTestData() {
  await db.delete(schema.reviews)
  await db.delete(schema.commentaries)
  await db.delete(schema.claims)
  await db.delete(schema.scores)
  await db.delete(schema.paragraphs)
  await db.delete(schema.sections)
  await db.delete(schema.articles)
}

describe('Schema integration (INFRA-01)', () => {
  beforeEach(async () => {
    await cleanTestData()
  })

  afterAll(async () => {
    await cleanTestData()
    await pool.end()
  })

  it('articles table accepts valid insert and returns all columns', async () => {
    const [row] = await db.insert(schema.articles).values({
      title: 'Quantum mechanics',
      wikiUrl: 'https://en.wikipedia.org/wiki/Quantum_mechanics',
      revisionId: 1234567,
    }).returning()

    expect(row.id).toBeDefined()
    expect(row.title).toBe('Quantum mechanics')
    expect(row.language).toBe('en')   // default
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.updatedAt).toBeInstanceOf(Date)
    expect(row.deletedAt).toBeNull()  // D-09: soft delete default
  })

  it('full chain: article -> section -> paragraph -> claim -> commentary inserts succeed', async () => {
    const [article] = await db.insert(schema.articles).values({
      title: 'Test Article',
      wikiUrl: 'https://en.wikipedia.org/wiki/Test_Chain',
      revisionId: 1,
    }).returning()

    const [section] = await db.insert(schema.sections).values({
      articleId: article.id,
      title: 'History',
      path: 'History',
      position: 0,
    }).returning()

    const [paragraph] = await db.insert(schema.paragraphs).values({
      sectionId: section.id,
      stableId: 'History:abc123:rev1',
      content: 'Test paragraph content',
      contentHash: 'abc123',
      position: 0,
    }).returning()

    expect(paragraph.stableId).toBe('History:abc123:rev1')

    const [claim] = await db.insert(schema.claims).values({
      paragraphId: paragraph.id,
      text: 'A testable claim',
    }).returning()

    const [commentary] = await db.insert(schema.commentaries).values({
      claimId: claim.id,
      draftText: 'AI-drafted commentary',
    }).returning()

    expect(commentary.status).toBe('PENDING')  // default
  })

  it('FK cascade: deleting article removes sections and paragraphs', async () => {
    const [article] = await db.insert(schema.articles).values({
      title: 'Cascade Test',
      wikiUrl: 'https://en.wikipedia.org/wiki/Cascade_Test',
      revisionId: 2,
    }).returning()

    await db.insert(schema.sections).values({
      articleId: article.id,
      title: 'Intro',
      path: 'Intro',
      position: 0,
    })

    // Delete article -- should cascade to sections
    await db.delete(schema.articles).where(eq(schema.articles.id, article.id))

    const remainingSections = await db
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.articleId, article.id))

    expect(remainingSections).toHaveLength(0)
  })

  it('scores table has unique constraint on articleId', async () => {
    const [article] = await db.insert(schema.articles).values({
      title: 'Score Unique Test',
      wikiUrl: 'https://en.wikipedia.org/wiki/Score_Unique',
      revisionId: 3,
    }).returning()

    await db.insert(schema.scores).values({
      articleId: article.id,
      factualScore: 75,
      coveragePercent: 50,
      totalParagraphs: 10,
      reviewedParagraphs: 5,
    })

    // Second insert with same articleId should fail (unique constraint)
    await expect(
      db.insert(schema.scores).values({
        articleId: article.id,
        factualScore: 80,
        coveragePercent: 60,
        totalParagraphs: 10,
        reviewedParagraphs: 6,
      })
    ).rejects.toThrow()
  })

  it('reviewStatusEnum restricts to valid values', async () => {
    // This test verifies the pgEnum constraint exists
    // Insert a commentary with valid status
    const [article] = await db.insert(schema.articles).values({
      title: 'Enum Test',
      wikiUrl: 'https://en.wikipedia.org/wiki/Enum_Test',
      revisionId: 4,
    }).returning()

    const [section] = await db.insert(schema.sections).values({
      articleId: article.id, title: 'S', path: 'S', position: 0,
    }).returning()

    const [paragraph] = await db.insert(schema.paragraphs).values({
      sectionId: section.id, stableId: 'S:hash:rev4', content: 'text', contentHash: 'hash', position: 0,
    }).returning()

    const [claim] = await db.insert(schema.claims).values({
      paragraphId: paragraph.id, text: 'claim text',
    }).returning()

    // Valid status should work
    const [c] = await db.insert(schema.commentaries).values({
      claimId: claim.id, draftText: 'draft', status: 'AI_ANALYZED',
    }).returning()
    expect(c.status).toBe('AI_ANALYZED')

    // Invalid status should fail at DB level (raw SQL to bypass Drizzle type safety)
    await expect(
      db.execute(sql`INSERT INTO commentary (id, claim_id, draft_text, status, created_at, updated_at) VALUES ('bad', ${claim.id}, 'x', 'INVALID_STATUS', NOW(), NOW())`)
    ).rejects.toThrow()
  })

  it('articles.wikiUrl has unique constraint', async () => {
    const url = 'https://en.wikipedia.org/wiki/Unique_Test'
    await db.insert(schema.articles).values({
      title: 'First', wikiUrl: url, revisionId: 1,
    })

    await expect(
      db.insert(schema.articles).values({
        title: 'Second', wikiUrl: url, revisionId: 2,
      })
    ).rejects.toThrow()
  })
})
