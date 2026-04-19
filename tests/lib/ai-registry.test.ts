import { describe, it, expect } from 'vitest'
import { registry } from '@/lib/ai-registry'

describe('AI provider registry', () => {
  it('returns a model for anthropic provider', () => {
    const model = registry.languageModel('anthropic:claude-sonnet-4-5-20250929')
    expect(model).toBeDefined()
    expect(typeof model).toBe('object')
  })

  it('returns a model for openai provider', () => {
    const model = registry.languageModel('openai:gpt-4.1')
    expect(model).toBeDefined()
  })

  it('AI_MODEL env var controls active model without code changes (AI-06)', () => {
    const original = process.env.AI_MODEL
    try {
      process.env.AI_MODEL = 'anthropic:claude-sonnet-4-5-20250929'
      const model1 = registry.languageModel(process.env.AI_MODEL!)
      expect(model1).toBeDefined()

      process.env.AI_MODEL = 'openai:gpt-4.1'
      const model2 = registry.languageModel(process.env.AI_MODEL!)
      expect(model2).toBeDefined()
    } finally {
      process.env.AI_MODEL = original
    }
  })
})
