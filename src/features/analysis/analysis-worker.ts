import 'server-only'
import { extractClaims } from './claim-extractor'
import { draftCommentary } from './commentary-drafter'
import { computeAndPersistScore } from './score-engine'
import { db } from '@/db'
import { paragraphs, sections, claims, commentaries } from '@/db/schema'
import { eq } from 'drizzle-orm'

/**
 * pg-boss job handler for AI analysis pipeline.
 *
 * Orchestrates per-paragraph claim extraction + commentary drafting, then
 * computes and persists the article factual score.
 *
 * Design decisions:
 * - D-18: Single per-article job — one job processes all paragraphs
 * - D-19: Called by ingest-worker on ingestion completion
 * - D-20: Registered on 'analysis-jobs' queue
 * - D-21: Rate limiting delay between paragraphs (ANALYSIS_RATE_LIMIT_MS)
 * - Per-paragraph commit: failure on paragraph N does not roll back 1..N-1
 * - D-03: Paragraphs with no claims are still processed (score engine counts them)
 * - D-08: Commentary status is AI_ANALYZED from initial insert
 */
export async function runAnalysisJob(data: { articleId: string }): Promise<void> {
  // Step 1: Query all paragraphs for the article via section join
  const articleParagraphs = await db
    .select({
      id: paragraphs.id,
      content: paragraphs.content,
      sectionId: paragraphs.sectionId,
    })
    .from(paragraphs)
    .innerJoin(sections, eq(paragraphs.sectionId, sections.id))
    .where(eq(sections.articleId, data.articleId))

  // Step 2: Iterate each paragraph — per-paragraph commit (no wrapping transaction)
  for (const paragraph of articleParagraphs) {
    try {
      // a) Extract claims from paragraph content
      const extractedClaims = await extractClaims(paragraph.content)

      // b) Insert each extracted claim and draft commentary
      for (const claim of extractedClaims.claims) {
        const [savedClaim] = await db
          .insert(claims)
          .values({
            paragraphId: paragraph.id,
            text: claim.text,
            severity: claim.severity,
            confidenceScore: claim.confidenceScore,
            charOffsetStart: claim.charOffsetStart,
            charOffsetEnd: claim.charOffsetEnd,
          })
          .returning()

        // c) Draft commentary for each saved claim
        const commentary = await draftCommentary(paragraph.content, {
          text: claim.text,
          severity: claim.severity,
        })

        // Insert commentary — D-08: status is AI_ANALYZED from initial insert
        // (draft and persist are atomic from the worker's perspective — no observable PENDING state)
        await db.insert(commentaries).values({
          claimId: savedClaim.id,
          draftText: commentary.analysisText,
          status: 'AI_ANALYZED',
          suggestedSources: commentary.suggestedSources,
        })
      }

      // d) D-03: paragraphs with no claims still count as analyzed
      // (score engine counts all paragraphs regardless of claim count for coverage)
    } catch (err) {
      // e) Per-paragraph error handling — failure does not stop other paragraphs
      console.error('Analysis failed for paragraph:', paragraph.id, err)
    }

    // f) D-21: Rate limiting delay between paragraphs
    await new Promise((resolve) =>
      setTimeout(resolve, Number(process.env.ANALYSIS_RATE_LIMIT_MS ?? '500'))
    )
  }

  // Step 3: Compute and persist factual score after all paragraphs processed
  await computeAndPersistScore(data.articleId)

  // Step 4: Log completion
  console.log('Analysis complete for article:', data.articleId)
}
