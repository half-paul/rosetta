import { z } from 'zod'

export const ClaimExtractionSchema = z.object({
  claims: z
    .array(
      z.object({
        text: z.string().describe('The exact factual claim as stated in the paragraph'),
        severity: z
          .enum(['high', 'medium', 'low'])
          .describe(
            'high = health/safety/legal; medium = historical/scientific fact; low = trivial assertion'
          ),
        charOffsetStart: z.number().int().nonnegative(),
        charOffsetEnd: z.number().int().nonnegative(),
        confidenceScore: z
          .number()
          .min(0)
          .max(1)
          .transform(v => Math.max(0, Math.min(1, v))), // clamp to [0, 1]
      })
    )
    .describe('Empty array if no check-worthy claims found'),
})

export type ClaimExtractionOutput = z.infer<typeof ClaimExtractionSchema>

export const SuggestedSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  relevanceNote: z.string(),
  isVerified: z.literal(false).default(false), // NEVER true — trust contract (D-07)
})

export const CommentaryDraftSchema = z.object({
  analysisText: z.string().describe('AI-drafted fact-check analysis'),
  suggestedSources: z.array(SuggestedSourceSchema).min(1).max(3),
})

export type CommentaryDraftOutput = z.infer<typeof CommentaryDraftSchema>
