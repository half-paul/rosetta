import 'server-only'
import { generateText, Output } from 'ai'
import { registry } from '@/lib/ai-registry'
import { CommentaryDraftSchema, type CommentaryDraftOutput } from './schemas'

/**
 * System prompt for commentary drafting.
 *
 * Instructions are separated from content (T-03-01): the paragraph and claim
 * text go in the `prompt` parameter — NOT concatenated here — to prevent
 * prompt injection via Wikipedia content.
 */
const COMMENTARY_SYSTEM_PROMPT = `You are a fact-checking analyst. Your task is to draft a thorough fact-check analysis for a specific claim extracted from a Wikipedia paragraph.

Your analysis should:
- Evaluate the accuracy of the claim based on established knowledge
- Identify what would need to be verified and where discrepancies might exist
- Provide clear, neutral, encyclopedic commentary suitable for a fact-checking platform

You must suggest 1 to 3 primary sources that would be authoritative for verifying this claim. Sources should be:
- Academic papers, peer-reviewed journals
- Official government or institutional records
- Authoritative reference works (encyclopedias, official statistics)
- Reputable news archives for verifiable events

For each source, provide:
- url: a plausible URL to the source (may need human verification)
- title: the title of the source document or page
- relevanceNote: a brief explanation of why this source is relevant to the claim

IMPORTANT: All suggested sources are preliminary and unverified. They require human review before being used in any published fact-check.`

/**
 * Draft a fact-check commentary for a specific claim within a paragraph.
 *
 * Uses AI SDK v6 generateText + Output.object for structured output.
 * Falls back to a manual review placeholder on any LLM failure.
 *
 * @param paragraphText - The source paragraph containing the claim
 * @param claim - The specific claim to analyze
 */
export async function draftCommentary(
  paragraphText: string,
  claim: { text: string; severity: string }
): Promise<CommentaryDraftOutput> {
  try {
    const { output } = await generateText({
      model: registry.languageModel(process.env.AI_MODEL! as `anthropic:${string}` | `openai:${string}`),
      output: Output.object({ schema: CommentaryDraftSchema }),
      system: COMMENTARY_SYSTEM_PROMPT,
      prompt:
        'Paragraph: ' +
        paragraphText +
        '\n\nClaim to analyze: ' +
        claim.text +
        '\nClaim severity: ' +
        claim.severity,
    })
    return output
  } catch (err) {
    console.error('draftCommentary failed, returning fallback:', err)
    return {
      analysisText: 'Commentary generation failed. Manual review required.',
      suggestedSources: [
        {
          url: 'https://example.com',
          title: 'Manual review needed',
          relevanceNote: 'AI commentary generation failed for this claim',
          isVerified: false,
        },
      ],
    }
  }
}
