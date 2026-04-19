// server-only: LLM API keys must never reach the browser
import 'server-only'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { createProviderRegistry } from 'ai'

export const registry = createProviderRegistry({
  anthropic,
  openai,
})

// Usage in any server-side pipeline module (Phase 3+):
// const model = registry.languageModel(process.env.AI_MODEL!)
//
// AI_MODEL=anthropic:claude-sonnet-4-5-20250929  or  openai:gpt-4.1
// Switching provider: change AI_MODEL in .env -- zero code changes (AI-06)
