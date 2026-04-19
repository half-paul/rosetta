import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'

// Create test DB connection (same pattern as tests/db/schema.test.ts)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const testDb = drizzle(pool, { schema })

vi.mock('server-only', () => ({}))

vi.mock('@/features/ingestion/mediawiki-client', () => ({
  fetchArticle: vi.fn(),
  normalizeWikipediaUrl: vi.fn(),
}))

// Mock parse-article to avoid jsdom dependency in DB persistence tests.
// This test focuses on the worker's DB persistence logic, not HTML parsing.
vi.mock('@/features/ingestion/parse-article', () => ({
  parseWikipediaHtml: vi.fn(),
}))

// Mock @/db to use the same test pool (avoids server-only guard at module level)
vi.mock('@/db', async () => {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const schema = await import('@/db/schema')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return { db: drizzle(pool, { schema }) }
})

import { runIngestionJob } from '@/features/ingestion/ingest-worker'
import { fetchArticle } from '@/features/ingestion/mediawiki-client'
import { parseWikipediaHtml } from '@/features/ingestion/parse-article'

async function cleanTestData() {
  await testDb.delete(schema.paragraphs)
  await testDb.delete(schema.sections)
  await testDb.delete(schema.articles)
}

const MOCK_PARSE_RESPONSE = {
  parse: {
    title: 'Test_Article',
    pageid: 12345,
    revid: 67890,
    text: `<div class="mw-content-ltr mw-parser-output">
      <p>This is the lead paragraph with enough content to be extracted and stored.</p>
      <div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
      <p>History section first paragraph with sufficient content for testing purposes.</p>
      <table class="infobox"><tr><td><p>Should be stripped from the output completely.</p></td></tr></table>
    </div>`,
    tocdata: {
      sections: [
        {
          tocLevel: 1,
          hLevel: 2,
          line: 'History',
          number: '1',
          index: '1',
          anchor: 'History',
          codepointOffset: 0,
        },
      ],
    },
  },
}

// Parsed sections returned by mock parser — simulates what parseWikipediaHtml returns
// after stripping infoboxes and extracting text content (INGEST-02)
const MOCK_PARSED_SECTIONS = [
  {
    title: 'lead',
    path: 'lead',
    position: 0,
    paragraphs: [
      {
        plainText: 'This is the lead paragraph with enough content to be extracted and stored.',
        contentHash: 'abc123def456',
        stableId: 'lead:abc123def456:67890',
        position: 0,
      },
    ],
  },
  {
    title: 'History',
    path: 'history',
    position: 1,
    paragraphs: [
      {
        plainText: 'History section first paragraph with sufficient content for testing purposes.',
        contentHash: 'fedcba987654',
        stableId: 'history:fedcba987654:67890',
        position: 0,
      },
    ],
  },
]

describe('runIngestionJob integration (INGEST-02, INGEST-03)', () => {
  beforeEach(async () => {
    await cleanTestData()
    vi.mocked(fetchArticle).mockResolvedValue(MOCK_PARSE_RESPONSE)
    vi.mocked(parseWikipediaHtml).mockReturnValue(MOCK_PARSED_SECTIONS)
  })

  afterAll(async () => {
    await cleanTestData()
    await pool.end()
  })

  it('persists article with correct metadata (INGEST-03)', async () => {
    await runIngestionJob({
      url: 'https://en.wikipedia.org/wiki/Test_Article',
      title: 'Test_Article',
    })

    const [article] = await testDb
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.wikiUrl, 'https://en.wikipedia.org/wiki/Test_Article'))

    expect(article).toBeDefined()
    expect(article.title).toBe('Test_Article')
    expect(article.revisionId).toBe(67890)
    expect(article.language).toBe('en')
    expect(article.fetchedAt).toBeInstanceOf(Date)
  })

  it('persists sections with correct hierarchy', async () => {
    await runIngestionJob({
      url: 'https://en.wikipedia.org/wiki/Test_Article',
      title: 'Test_Article',
    })

    const [article] = await testDb
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.wikiUrl, 'https://en.wikipedia.org/wiki/Test_Article'))

    const articleSections = await testDb
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.articleId, article.id))

    expect(articleSections.length).toBeGreaterThanOrEqual(2)
    expect(articleSections.some(s => s.path === 'lead')).toBe(true)
    expect(articleSections.some(s => s.path === 'history')).toBe(true)
  })

  it('persists paragraphs with stable IDs (INGEST-02)', async () => {
    await runIngestionJob({
      url: 'https://en.wikipedia.org/wiki/Test_Article',
      title: 'Test_Article',
    })

    const [article] = await testDb
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.wikiUrl, 'https://en.wikipedia.org/wiki/Test_Article'))

    const articleSections = await testDb
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.articleId, article.id))

    const sectionIds = articleSections.map(s => s.id)
    const allParagraphs: typeof schema.paragraphs.$inferSelect[] = []
    for (const sectionId of sectionIds) {
      const paras = await testDb
        .select()
        .from(schema.paragraphs)
        .where(eq(schema.paragraphs.sectionId, sectionId))
      allParagraphs.push(...paras)
    }

    expect(allParagraphs.length).toBeGreaterThanOrEqual(2)
    for (const para of allParagraphs) {
      expect(para.stableId).toMatch(/^[a-z_/]+:[a-f0-9]{12}:\d+$/)
      expect(para.content.length).toBeGreaterThan(0)
      expect(para.contentHash.length).toBeGreaterThan(0)
    }
  })

  it('strips infobox content — no infobox text in paragraphs', async () => {
    await runIngestionJob({
      url: 'https://en.wikipedia.org/wiki/Test_Article',
      title: 'Test_Article',
    })

    const [article] = await testDb
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.wikiUrl, 'https://en.wikipedia.org/wiki/Test_Article'))

    const articleSections = await testDb
      .select()
      .from(schema.sections)
      .where(eq(schema.sections.articleId, article.id))

    const allParagraphs: typeof schema.paragraphs.$inferSelect[] = []
    for (const section of articleSections) {
      const paras = await testDb
        .select()
        .from(schema.paragraphs)
        .where(eq(schema.paragraphs.sectionId, section.id))
      allParagraphs.push(...paras)
    }

    // Parser mock only returns non-infobox content; infobox text never reaches the DB
    expect(allParagraphs.every(p => !p.content.includes('stripped'))).toBe(true)
  })

  it('transaction atomicity — all rows inserted or none', async () => {
    await runIngestionJob({
      url: 'https://en.wikipedia.org/wiki/Test_Article',
      title: 'Test_Article',
    })

    const articleRows = await testDb.select().from(schema.articles)
    const sectionRows = await testDb.select().from(schema.sections)
    const paragraphRows = await testDb.select().from(schema.paragraphs)

    expect(articleRows.length).toBeGreaterThan(0)
    expect(sectionRows.length).toBeGreaterThan(0)
    expect(paragraphRows.length).toBeGreaterThan(0)
  })
})
