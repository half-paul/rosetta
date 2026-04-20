import 'server-only'
import { generateText, Output } from 'ai'
import { registry } from '@/lib/ai-registry'
import { ClaimExtractionSchema, type ClaimExtractionOutput } from './schemas'

/**
 * System prompt for claim extraction.
 *
 * Instructions are separated from content (T-03-01): paragraph text goes in
 * the `prompt` parameter — NOT concatenated here — to prevent prompt injection.
 */
const CLAIM_EXTRACTION_SYSTEM_PROMPT = `You are a fact-checking assistant. Your task is to extract check-worthy factual claims from the provided paragraph.

A check-worthy factual claim is a factual assertion that can be independently verified. Exclude:
- Opinions and subjective judgments
- Definitions and tautologies
- Trivially true statements that cannot be falsified
- Hypotheticals and speculation

For each check-worthy claim, assign a severity level:
- "high": health, safety, or legal claims (e.g., "Drug X cures cancer", "Company Y violated securities law")
- "medium": historical or scientific facts (e.g., "Einstein published the theory of relativity in 1905")
- "low": trivial assertions with minor impact if wrong (e.g., "The building has 42 floors")

For each claim, provide:
- text: the exact claim text as it appears in the paragraph
- severity: one of "high", "medium", "low"
- charOffsetStart: zero-based character offset where the claim text begins in the paragraph
- charOffsetEnd: zero-based character offset where the claim text ends in the paragraph
- confidenceScore: a number between 0 and 1 representing how confident you are this is a check-worthy claim

If there are no check-worthy claims in the paragraph, return an empty claims array.`

/**
 * Extract check-worthy factual claims from a paragraph of text.
 *
 * Uses AI SDK v6 generateText + Output.object for structured output.
 * Falls back to empty claims array on any LLM or parse failure.
 *
 * @param paragraphText - The paragraph to analyze (passed as prompt, not concatenated into system prompt per T-03-01)
 */
export async function extractClaims(paragraphText: string): Promise<ClaimExtractionOutput> {
  try {
    const { output } = await generateText({
      model: registry.languageModel(process.env.AI_MODEL!),
      output: Output.object({ schema: ClaimExtractionSchema }),
      system: CLAIM_EXTRACTION_SYSTEM_PROMPT,
      prompt: paragraphText,
    })
    return output
  } catch (err) {
    console.error('extractClaims failed, returning empty:', err)
    return { claims: [] }
  }
}
