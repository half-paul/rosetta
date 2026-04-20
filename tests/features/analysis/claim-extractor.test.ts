import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn((opts: any) => opts) },
}))

vi.mock('@/lib/ai-registry', () => ({
  registry: { languageModel: vi.fn(() => 'mock-model') },
}))

import { extractClaims } from '@/features/analysis/claim-extractor'
import { generateText } from 'ai'

describe('extractClaims (AI-02)', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset()
  })

  it('extracts claims with all D-05 fields from factual paragraph', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        claims: [
          {
            text: 'Earth orbits the Sun',
            severity: 'low',
            charOffsetStart: 0,
            charOffsetEnd: 20,
            confidenceScore: 0.95,
          },
        ],
      },
    } as any)

    const result = await extractClaims('Earth orbits the Sun in roughly 365 days.')

    expect(result.claims).toHaveLength(1)
    const claim = result.claims[0]
    expect(claim.text).toBe('Earth orbits the Sun')
    expect(claim.severity).toBe('low')
    expect(claim.charOffsetStart).toBe(0)
    expect(claim.charOffsetEnd).toBe(20)
    expect(claim.confidenceScore).toBe(0.95)
  })

  it('returns empty claims array for non-factual paragraph (D-03)', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        claims: [],
      },
    } as any)

    const result = await extractClaims('This is just an opinion paragraph.')

    expect(result.claims).toHaveLength(0)
    expect(Array.isArray(result.claims)).toBe(true)
  })

  it('falls back to empty claims on LLM error', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('API timeout'))

    const result = await extractClaims('Some paragraph text.')

    expect(result.claims).toHaveLength(0)
    expect(Array.isArray(result.claims)).toBe(true)
  })

  it('uses generateText with Output.object, not generateObject', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { claims: [] },
    } as any)

    await extractClaims('Test paragraph.')

    expect(generateText).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(generateText).mock.calls[0][0]
    expect(callArgs).toHaveProperty('output')
    // Verify generateObject was not used (it does not exist in the mock)
    expect(typeof (callArgs as any).generateObject).toBe('undefined')
  })

  it('passes paragraph text as prompt, not in system prompt (T-03-01)', async () => {
    const testParagraph = 'The Eiffel Tower was built in 1889 for the World Fair in Paris.'

    vi.mocked(generateText).mockResolvedValue({
      output: { claims: [] },
    } as any)

    await extractClaims(testParagraph)

    expect(generateText).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(generateText).mock.calls[0][0]

    // Paragraph text must appear in `prompt`
    expect(callArgs.prompt).toBe(testParagraph)

    // System prompt must NOT contain the paragraph text (prompt injection prevention)
    expect(callArgs.system).toBeDefined()
    expect(callArgs.system).not.toContain(testParagraph)
  })
})
