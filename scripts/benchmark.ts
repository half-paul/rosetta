/**
 * Benchmark harness for comparing LLM provider claim extraction quality.
 *
 * Runs identical fixture paragraphs through at least two providers and outputs
 * a JSON report with claim count, severity distribution, latency, and token usage
 * per provider per fixture (D-15, D-16, D-17).
 *
 * Usage:
 *   BENCHMARK_MODE=1 pnpm tsx scripts/benchmark.ts
 *   BENCHMARK_MODE=1 BENCHMARK_OUTPUT=report.json pnpm tsx scripts/benchmark.ts
 *   BENCHMARK_MODE=1 BENCHMARK_PROVIDERS=anthropic:claude-sonnet-4-5-20250929,openai:gpt-4.1 pnpm tsx scripts/benchmark.ts
 *
 * Security: API keys come from env vars (.env) — never hardcoded (T-03-09).
 * Guard: BENCHMARK_MODE=1 required — prevents accidental CI execution (T-03-08).
 */

// T-03-08: Guard prevents accidental CI execution
if (!process.env.BENCHMARK_MODE) {
  console.error('Set BENCHMARK_MODE=1 to run the benchmark harness')
  console.error('Usage: BENCHMARK_MODE=1 pnpm tsx scripts/benchmark.ts')
  process.exit(1)
}

import { createProviderRegistry } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { openai } from '@ai-sdk/openai'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Inline registry — avoids importing src/lib/ai-registry.ts which has
// `import 'server-only'` that fails outside Next.js (T-03-09).
// API keys sourced from environment variables only.
// ---------------------------------------------------------------------------
const registry = createProviderRegistry({ anthropic, openai })

// ---------------------------------------------------------------------------
// ClaimExtractionSchema — duplicated inline to avoid the server-only import
// chain from src/features/analysis/schemas.ts. Must stay in sync.
// ---------------------------------------------------------------------------
const ClaimExtractionSchema = z.object({
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
          .transform((v) => Math.max(0, Math.min(1, v))),
      })
    )
    .describe('Empty array if no check-worthy claims found'),
})

// ---------------------------------------------------------------------------
// System prompt — duplicated inline from src/features/analysis/claim-extractor.ts.
// Must stay in sync. Paragraph text goes in `prompt` to prevent prompt injection.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a fact-checking assistant. Your task is to extract check-worthy factual claims from the provided paragraph.

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

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------
interface Fixture {
  id: string
  category: string
  source: string
  paragraphText: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const fixtures = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/benchmark-paragraphs.json'), 'utf-8')
) as Fixture[]

// ---------------------------------------------------------------------------
// Provider configuration — allow override via env
// ---------------------------------------------------------------------------
const DEFAULT_PROVIDERS = ['anthropic:claude-sonnet-4-5-20250929', 'openai:gpt-4.1']
const providers = process.env.BENCHMARK_PROVIDERS?.split(',') ?? DEFAULT_PROVIDERS

// ---------------------------------------------------------------------------
// Benchmark result types (D-16)
// ---------------------------------------------------------------------------
interface BenchmarkResult {
  provider: string
  fixtureId: string
  fixtureCategory: string
  claimCount: number
  severityDistribution: { high: number; medium: number; low: number }
  latencyMs: number
  tokensUsed: number
  manualReviewFlag: boolean
}

interface BenchmarkReport {
  generatedAt: string
  providers: string[]
  fixtureCount: number
  results: BenchmarkResult[]
}

// ---------------------------------------------------------------------------
// Run benchmark
// ---------------------------------------------------------------------------
console.log('Rosetta benchmark harness')
console.log(`Providers: ${providers.join(', ')}`)
console.log(`Fixtures: ${fixtures.length}`)
console.log('---')

const results: BenchmarkResult[] = []

for (const provider of providers) {
  console.log(`\nRunning provider: ${provider}`)
  for (const fixture of fixtures) {
    console.log(`  Fixture: ${fixture.id} (${fixture.category})`)
    const start = Date.now()
    try {
      const { output, usage } = await generateText({
        model: registry.languageModel(provider as `anthropic:${string}` | `openai:${string}`),
        output: Output.object({ schema: ClaimExtractionSchema }),
        system: SYSTEM_PROMPT,
        prompt: fixture.paragraphText,
      })

      const severityDist = { high: 0, medium: 0, low: 0 }
      for (const claim of output.claims) {
        severityDist[claim.severity]++
      }

      const result: BenchmarkResult = {
        provider,
        fixtureId: fixture.id,
        fixtureCategory: fixture.category,
        claimCount: output.claims.length,
        severityDistribution: severityDist,
        latencyMs: Date.now() - start,
        tokensUsed: usage?.totalTokens ?? 0,
        manualReviewFlag: false,
      }

      results.push(result)
      console.log(
        `    claims=${result.claimCount} latency=${result.latencyMs}ms tokens=${result.tokensUsed}`
      )
    } catch (err) {
      console.error(`    FAILED: ${(err as Error).message}`)
      results.push({
        provider,
        fixtureId: fixture.id,
        fixtureCategory: fixture.category,
        claimCount: -1,
        severityDistribution: { high: 0, medium: 0, low: 0 },
        latencyMs: Date.now() - start,
        tokensUsed: 0,
        manualReviewFlag: true,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Output report (D-16)
// ---------------------------------------------------------------------------
const report: BenchmarkReport = {
  generatedAt: new Date().toISOString(),
  providers,
  fixtureCount: fixtures.length,
  results,
}

console.log('\n' + JSON.stringify(report, null, 2))

if (process.env.BENCHMARK_OUTPUT) {
  writeFileSync(process.env.BENCHMARK_OUTPUT, JSON.stringify(report, null, 2))
  console.log(`\nReport written to: ${process.env.BENCHMARK_OUTPUT}`)
}
