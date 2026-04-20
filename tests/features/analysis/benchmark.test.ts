import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Benchmark report schema — mirrors the output shape from scripts/benchmark.ts
// Validates D-16 required metrics fields without making live LLM calls.
// ---------------------------------------------------------------------------

const BenchmarkResultSchema = z.object({
  provider: z.string(),
  fixtureId: z.string(),
  fixtureCategory: z.string(),
  claimCount: z.number(),
  severityDistribution: z.object({
    high: z.number(),
    medium: z.number(),
    low: z.number(),
  }),
  latencyMs: z.number(),
  tokensUsed: z.number(),
  manualReviewFlag: z.boolean(),
})

const BenchmarkReportSchema = z.object({
  generatedAt: z.string(),
  providers: z.array(z.string()),
  fixtureCount: z.number(),
  results: z.array(BenchmarkResultSchema),
})

describe('Benchmark report output shape (D-16)', () => {
  it('validates a well-formed benchmark report', () => {
    const sampleReport = {
      generatedAt: new Date().toISOString(),
      providers: ['anthropic:claude-sonnet-4-5-20250929', 'openai:gpt-4.1'],
      fixtureCount: 5,
      results: [
        {
          provider: 'anthropic:claude-sonnet-4-5-20250929',
          fixtureId: 'featured-history',
          fixtureCategory: 'featured',
          claimCount: 3,
          severityDistribution: { high: 0, medium: 2, low: 1 },
          latencyMs: 1200,
          tokensUsed: 512,
          manualReviewFlag: false,
        },
        {
          provider: 'openai:gpt-4.1',
          fixtureId: 'scientific-health',
          fixtureCategory: 'scientific',
          claimCount: 2,
          severityDistribution: { high: 1, medium: 1, low: 0 },
          latencyMs: 980,
          tokensUsed: 430,
          manualReviewFlag: false,
        },
      ],
    }

    const parsed = BenchmarkReportSchema.parse(sampleReport)
    expect(parsed.providers).toHaveLength(2)
    expect(parsed.fixtureCount).toBe(5)
    expect(parsed.results).toHaveLength(2)
    expect(parsed.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('benchmark result requires all D-16 metrics (missing severityDistribution throws)', () => {
    const incompleteResult = {
      provider: 'anthropic:claude-sonnet-4-5-20250929',
      fixtureId: 'featured-history',
      fixtureCategory: 'featured',
      claimCount: 3,
      // severityDistribution intentionally omitted
      latencyMs: 1200,
      tokensUsed: 512,
      manualReviewFlag: false,
    }

    expect(() => BenchmarkResultSchema.parse(incompleteResult)).toThrow()
  })

  it('benchmark result requires all D-16 metrics (missing latencyMs throws)', () => {
    const incompleteResult = {
      provider: 'anthropic:claude-sonnet-4-5-20250929',
      fixtureId: 'featured-history',
      fixtureCategory: 'featured',
      claimCount: 3,
      severityDistribution: { high: 0, medium: 2, low: 1 },
      // latencyMs intentionally omitted
      tokensUsed: 512,
      manualReviewFlag: false,
    }

    expect(() => BenchmarkResultSchema.parse(incompleteResult)).toThrow()
  })

  it('benchmark result allows manualReviewFlag=true for failed extractions', () => {
    const failedResult = {
      provider: 'openai:gpt-4.1',
      fixtureId: 'stub-minimal',
      fixtureCategory: 'stub',
      claimCount: -1,
      severityDistribution: { high: 0, medium: 0, low: 0 },
      latencyMs: 500,
      tokensUsed: 0,
      manualReviewFlag: true,
    }

    const parsed = BenchmarkResultSchema.parse(failedResult)
    expect(parsed.manualReviewFlag).toBe(true)
    expect(parsed.claimCount).toBe(-1)
  })
})

describe('Benchmark fixtures file (D-17)', () => {
  it('fixtures file is valid JSON with required fields and at least 4 entries', () => {
    const fixturesPath = resolve(process.cwd(), 'scripts/fixtures/benchmark-paragraphs.json')
    const raw = readFileSync(fixturesPath, 'utf-8')
    const fixtures = JSON.parse(raw) as unknown[]

    expect(Array.isArray(fixtures)).toBe(true)
    expect(fixtures.length).toBeGreaterThanOrEqual(4)

    for (const fixture of fixtures) {
      const f = fixture as Record<string, unknown>
      expect(typeof f.id).toBe('string')
      expect(typeof f.category).toBe('string')
      expect(typeof f.paragraphText).toBe('string')
      expect((f.paragraphText as string).length).toBeGreaterThan(0)
    }
  })

  it('fixtures cover diverse article types (D-17) — at least 3 distinct categories', () => {
    const fixturesPath = resolve(process.cwd(), 'scripts/fixtures/benchmark-paragraphs.json')
    const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8')) as Array<{
      id: string
      category: string
      source: string
      paragraphText: string
    }>

    const categories = new Set(fixtures.map((f) => f.category))
    expect(categories.size).toBeGreaterThanOrEqual(3)

    // Verify the expected diverse types per D-17 are present
    expect(categories.has('featured')).toBe(true)
    expect(categories.has('scientific')).toBe(true)
    expect(categories.has('biographical')).toBe(true)
  })

  it('benchmark script contains BENCHMARK_MODE guard (T-03-08 — static analysis)', () => {
    const scriptPath = resolve(process.cwd(), 'scripts/benchmark.ts')
    const scriptContent = readFileSync(scriptPath, 'utf-8')

    expect(scriptContent).toContain('BENCHMARK_MODE')
    expect(scriptContent).toContain('process.exit(1)')
  })
})
