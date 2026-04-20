import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn((opts: any) => opts) },
}))

vi.mock('@/lib/ai-registry', () => ({
  registry: { languageModel: vi.fn(() => 'mock-model') },
}))

import { draftCommentary } from '@/features/analysis/commentary-drafter'
import { generateText } from 'ai'

describe('draftCommentary (AI-03)', () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset()
  })

  it('drafts commentary with analysis text and suggested sources', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        analysisText: 'Analysis of claim...',
        suggestedSources: [
          {
            url: 'https://source.org',
            title: 'Source',
            relevanceNote: 'Relevant',
            isVerified: false,
          },
        ],
      },
    } as any)

    const result = await draftCommentary('The Eiffel Tower was built in 1889.', {
      text: 'The Eiffel Tower was built in 1889',
      severity: 'medium',
    })

    expect(result.analysisText).toBe('Analysis of claim...')
    expect(Array.isArray(result.suggestedSources)).toBe(true)
    expect(result.suggestedSources.length).toBeGreaterThan(0)
  })

  it('all suggested sources have isVerified: false (D-07 trust contract)', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: {
        analysisText: 'Multi-source analysis.',
        suggestedSources: [
          {
            url: 'https://source1.org',
            title: 'Source 1',
            relevanceNote: 'Primary reference',
            isVerified: false,
          },
          {
            url: 'https://source2.org',
            title: 'Source 2',
            relevanceNote: 'Secondary reference',
            isVerified: false,
          },
          {
            url: 'https://source3.org',
            title: 'Source 3',
            relevanceNote: 'Tertiary reference',
            isVerified: false,
          },
        ],
      },
    } as any)

    const result = await draftCommentary(
      'Albert Einstein was born in 1879 in Ulm, Germany.',
      { text: 'Albert Einstein was born in 1879', severity: 'medium' }
    )

    expect(result.suggestedSources).toHaveLength(3)
    for (const source of result.suggestedSources) {
      expect(source.isVerified).toBe(false)
    }
  })

  it('falls back gracefully on LLM error', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('API rate limit exceeded'))

    const result = await draftCommentary('Some paragraph.', {
      text: 'Some claim',
      severity: 'low',
    })

    // Should not throw — returns fallback
    expect(result).toBeDefined()
    expect(result.analysisText).toContain('Manual review required')
    expect(Array.isArray(result.suggestedSources)).toBe(true)
    expect(result.suggestedSources.length).toBeGreaterThan(0)

    // Fallback source must also have isVerified: false (D-07)
    for (const source of result.suggestedSources) {
      expect(source.isVerified).toBe(false)
    }
  })

  it('passes paragraph and claim in prompt, not system prompt (T-03-01)', async () => {
    const testParagraph = 'The Great Wall of China stretches over 21,000 kilometers.'
    const testClaim = 'The Great Wall of China stretches over 21,000 kilometers'

    vi.mocked(generateText).mockResolvedValue({
      output: {
        analysisText: 'Analysis...',
        suggestedSources: [
          {
            url: 'https://example.org',
            title: 'Reference',
            relevanceNote: 'Relevant',
            isVerified: false,
          },
        ],
      },
    } as any)

    await draftCommentary(testParagraph, { text: testClaim, severity: 'medium' })

    expect(generateText).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(generateText).mock.calls[0][0]

    // System prompt must NOT contain the paragraph or claim text
    expect(callArgs.system).toBeDefined()
    expect(callArgs.system).not.toContain(testParagraph)
    expect(callArgs.system).not.toContain(testClaim)

    // prompt must contain both paragraph text and claim text
    expect(callArgs.prompt).toContain(testParagraph)
    expect(callArgs.prompt).toContain(testClaim)
  })
})
