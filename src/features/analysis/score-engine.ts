import 'server-only'
import { db } from '@/db'
import { scores, claims, paragraphs, sections, commentaries } from '@/db/schema'
import { eq, inArray } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Score Weights (D-09 — stored as config, not hardcoded)
// ---------------------------------------------------------------------------

export interface ScoreWeights {
  coverage: number // default 0.4
  accuracy: number // default 0.4
  confidence: number // default 0.2
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  coverage: 0.4,
  accuracy: 0.4,
  confidence: 0.2,
}

// ---------------------------------------------------------------------------
// Input shape for paragraphs fed into computeFactualScore
// ---------------------------------------------------------------------------

interface ParagraphScoreInput {
  isReviewed: boolean
  confidenceScores: number[]
}

// ---------------------------------------------------------------------------
// computeFactualScore — pure function, no I/O, no LLM calls (D-09 through D-12)
//
// Coverage   = (reviewed paragraphs / total paragraphs) * 100
// Accuracy   = mean of accuracyRatings * 100, or 0 if empty (no human reviews yet)
// Confidence = mean of all confidenceScores across all claims * 100
// Score      = round(coverage * w.coverage + accuracy * w.accuracy + confidence * w.confidence)
// Clamped to [0, 100] — T-03-01 mitigation
// ---------------------------------------------------------------------------

export function computeFactualScore(
  paragraphInputs: ParagraphScoreInput[],
  accuracyRatings: number[],
  weights: ScoreWeights = DEFAULT_WEIGHTS
): {
  factualScore: number
  coveragePercent: number
  coverageComponent: number
  accuracyComponent: number
  confidenceComponent: number
} {
  // Edge case: empty paragraphs array — avoid division by zero (D-10)
  if (paragraphInputs.length === 0) {
    return {
      factualScore: 0,
      coveragePercent: 0,
      coverageComponent: 0,
      accuracyComponent: 0,
      confidenceComponent: 0,
    }
  }

  // Coverage component (D-10): unreviewed paragraphs contribute 0
  const reviewedCount = paragraphInputs.filter((p) => p.isReviewed).length
  const coverage = (reviewedCount / paragraphInputs.length) * 100

  // Accuracy component (D-11): 0 if no human reviews exist yet (Phase 3 state)
  const accuracy =
    accuracyRatings.length > 0
      ? (accuracyRatings.reduce((a, b) => a + b, 0) / accuracyRatings.length) * 100
      : 0

  // Confidence component (D-12): average LLM confidence across all claims
  const allConfidences = paragraphInputs.flatMap((p) => p.confidenceScores)
  const confidence =
    allConfidences.length > 0
      ? (allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) * 100
      : 0

  // Weighted sum — clamp to [0, 100] (T-03-01: output tamper mitigation)
  const rawScore =
    coverage * weights.coverage +
    accuracy * weights.accuracy +
    confidence * weights.confidence

  const factualScore = Math.min(100, Math.max(0, Math.round(rawScore)))

  return {
    factualScore,
    coveragePercent: Math.round(coverage),
    coverageComponent: Math.round(coverage * weights.coverage),
    accuracyComponent: Math.round(accuracy * weights.accuracy),
    confidenceComponent: Math.round(confidence * weights.confidence),
  }
}

// ---------------------------------------------------------------------------
// computeAndPersistScore — async DB wrapper for computeFactualScore
//
// Queries the article's paragraphs, claims, and commentaries, then upserts
// into the scores table. Called by analysis worker after each article analysis
// job, and by Phase 4 review handlers on each status change (D-13).
// ---------------------------------------------------------------------------

export async function computeAndPersistScore(articleId: string): Promise<void> {
  // 1. Fetch all sections for the article
  const articleSections = await db
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.articleId, articleId))

  const sectionIds = articleSections.map((s) => s.id)

  // 2. Fetch all paragraphs via sections
  const articleParagraphs =
    sectionIds.length > 0
      ? await db
          .select({ id: paragraphs.id })
          .from(paragraphs)
          .where(inArray(paragraphs.sectionId, sectionIds))
      : []

  const paragraphIds = articleParagraphs.map((p) => p.id)

  // 3. Fetch all claims with paragraph relationship and confidence scores
  const articleClaims =
    paragraphIds.length > 0
      ? await db
          .select({
            id: claims.id,
            paragraphId: claims.paragraphId,
            confidenceScore: claims.confidenceScore,
          })
          .from(claims)
          .where(inArray(claims.paragraphId, paragraphIds))
      : []

  // 4. Determine which claims have HUMAN_APPROVED or PUBLISHED commentaries
  // A paragraph is reviewed if ALL of its claims' commentaries are approved/published.
  // In Phase 3, all commentaries start as PENDING — no paragraph will be reviewed.
  const claimIds = articleClaims.map((c) => c.id)
  const approvedCommentaryClaimIds = new Set<string>()

  if (claimIds.length > 0) {
    const reviewedCommentaries = await db
      .select({ claimId: commentaries.claimId, status: commentaries.status })
      .from(commentaries)
      .where(inArray(commentaries.claimId, claimIds))

    for (const c of reviewedCommentaries) {
      if (c.status === 'HUMAN_APPROVED' || c.status === 'PUBLISHED') {
        approvedCommentaryClaimIds.add(c.claimId)
      }
    }
  }

  // 5. Build paragraph score inputs
  const paragraphInputs: ParagraphScoreInput[] = articleParagraphs.map((para) => {
    const paraClaims = articleClaims.filter((c) => c.paragraphId === para.id)

    // Reviewed = has claims and ALL claims have approved/published commentaries
    const isReviewed =
      paraClaims.length > 0 && paraClaims.every((c) => approvedCommentaryClaimIds.has(c.id))

    const confidenceScores = paraClaims
      .map((c) => c.confidenceScore)
      .filter((s): s is number => s !== null)

    return { isReviewed, confidenceScores }
  })

  // 6. Accuracy ratings come from human reviews (Phase 4) — empty in Phase 3
  const accuracyRatings: number[] = []

  const scoreResult = computeFactualScore(paragraphInputs, accuracyRatings, DEFAULT_WEIGHTS)

  // 7. Upsert into scores table (unique constraint on articleId)
  await db
    .insert(scores)
    .values({
      articleId,
      factualScore: scoreResult.factualScore,
      coveragePercent: scoreResult.coveragePercent,
      totalParagraphs: articleParagraphs.length,
      reviewedParagraphs: paragraphInputs.filter((p) => p.isReviewed).length,
      coverageComponent: scoreResult.coverageComponent,
      accuracyComponent: scoreResult.accuracyComponent,
      confidenceComponent: scoreResult.confidenceComponent,
      scoreWeightsConfig: DEFAULT_WEIGHTS,
    })
    .onConflictDoUpdate({
      target: scores.articleId,
      set: {
        factualScore: scoreResult.factualScore,
        coveragePercent: scoreResult.coveragePercent,
        totalParagraphs: articleParagraphs.length,
        reviewedParagraphs: paragraphInputs.filter((p) => p.isReviewed).length,
        coverageComponent: scoreResult.coverageComponent,
        accuracyComponent: scoreResult.accuracyComponent,
        confidenceComponent: scoreResult.confidenceComponent,
        scoreWeightsConfig: DEFAULT_WEIGHTS,
        updatedAt: new Date(),
      },
    })
}
