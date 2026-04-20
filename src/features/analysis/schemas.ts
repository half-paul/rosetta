import { z } from 'zod'

// ---------------------------------------------------------------------------
// Claim Extraction Schema (D-05)
// Used with generateText + Output.object({ schema: ClaimExtractionSchema })
// ---------------------------------------------------------------------------

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
        // Safety clamp per RESEARCH Pitfall 3 — LLMs sometimes return values outside [0,1]
        confidenceScore: z
          .number()
          .min(0)
          .max(1)
          .transform((v) => Math.max(0, Math.min(1, v))),
      })
    )
    .describe('Empty array if no check-worthy claims found'),
})

export type ClaimExtractionOutput = z.infer<typeof ClaimExtractionSchema>

// ---------------------------------------------------------------------------
// Suggested Source Schema (D-07)
// isVerified is ALWAYS false — this is a core trust contract
// ---------------------------------------------------------------------------

export const SuggestedSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  relevanceNote: z.string(),
  isVerified: z.literal(false).default(false), // NEVER true — enforced by z.literal(false)
})

// ---------------------------------------------------------------------------
// Commentary Draft Schema (D-07)
// Used with generateText + Output.object({ schema: CommentaryDraftSchema })
// ---------------------------------------------------------------------------

export const CommentaryDraftSchema = z.object({
  analysisText: z.string().describe('AI-drafted fact-check analysis'),
  suggestedSources: z.array(SuggestedSourceSchema).min(1).max(3),
})

export type CommentaryDraftOutput = z.infer<typeof CommentaryDraftSchema>
