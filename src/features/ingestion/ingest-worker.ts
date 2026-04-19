import 'server-only'
import { fetchArticle } from './mediawiki-client'
import { parseWikipediaHtml } from './parse-article'
import { db } from '@/db'
import { articles, sections, paragraphs } from '@/db/schema'

/**
 * pg-boss job handler for Wikipedia article ingestion.
 * Fetches article content from MediaWiki action=parse API,
 * parses HTML to extract sections and paragraphs,
 * and persists everything atomically in a single Drizzle transaction (D-05).
 */
export async function runIngestionJob(data: { url: string; title: string }): Promise<void> {
  const response = await fetchArticle(data.title)
  const parsedSections = parseWikipediaHtml(response.parse.text, response.parse.revid)

  await db.transaction(async (tx) => {
    const [article] = await tx.insert(articles).values({
      title: response.parse.title,
      wikiUrl: data.url,
      revisionId: response.parse.revid,
      language: 'en',
    }).returning()

    for (const section of parsedSections) {
      const [sec] = await tx.insert(sections).values({
        articleId: article.id,
        title: section.title,
        path: section.path,
        position: section.position,
      }).returning()

      if (section.paragraphs.length > 0) {
        await tx.insert(paragraphs).values(
          section.paragraphs.map(p => ({
            sectionId: sec.id,
            stableId: p.stableId,
            content: p.plainText,
            contentHash: p.contentHash,
            position: p.position,
          }))
        )
      }
    }
  })

  console.log('Ingestion complete:', data.title, '- sections:', parsedSections.length)
}
