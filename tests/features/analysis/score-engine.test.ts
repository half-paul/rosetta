import { describe, it, expect, vi } from 'vitest'

// Mock server-only (no Next.js runtime in tests)
vi.mock('server-only', () => ({}))

// Mock @/db to avoid requiring DATABASE_URL — pure function tests do not use DB
vi.mock('@/db', () => ({
  db: {},
}))

import { computeFactualScore, DEFAULT_WEIGHTS } from '@/features/analysis/score-engine'
import type { ScoreWeights } from '@/features/analysis/score-engine'

describe('computeFactualScore (SCORE-01, SCORE-02, SCORE-03, SCORE-04)', () => {
  // Test 1 (SCORE-03): All paragraphs unreviewed + no accuracy ratings
  // coverage=0, accuracy=0, confidence=80 → score = 0*0.4 + 0*0.4 + 80*0.2 = 16
  it('returns factualScore=16 for fully unreviewed article with confidence 0.8 (only confidence component contributes)', () => {
    const result = computeFactualScore(
      [
        { isReviewed: false, confidenceScores: [0.8] },
        { isReviewed: false, confidenceScores: [0.8] },
      ],
      [],
      DEFAULT_WEIGHTS
    )
    expect(result.factualScore).toBe(16)
    expect(result.coverageComponent).toBe(0)
    expect(result.accuracyComponent).toBe(0)
  })

  // Test 2 (SCORE-01): All paragraphs reviewed + perfect accuracy ratings
  // coverage=100, accuracy=100, confidence=100 → score = 40+40+20 = 100
  it('returns factualScore=100 for fully reviewed + perfect accuracy + perfect confidence', () => {
    const result = computeFactualScore(
      [
        { isReviewed: true, confidenceScores: [1.0] },
        { isReviewed: true, confidenceScores: [1.0] },
      ],
      [1.0, 1.0],
      DEFAULT_WEIGHTS
    )
    expect(result.factualScore).toBe(100)
    expect(result.coveragePercent).toBe(100)
  })

  // Test 3 (SCORE-03): 50% paragraphs reviewed → coveragePercent=50
  it('returns coveragePercent=50 when half the paragraphs are reviewed', () => {
    const result = computeFactualScore(
      [
        { isReviewed: true, confidenceScores: [0.9] },
        { isReviewed: false, confidenceScores: [0.9] },
      ],
      [],
      DEFAULT_WEIGHTS
    )
    expect(result.coveragePercent).toBe(50)
  })

  // Test 4 (SCORE-04): Custom weights produce different score than default
  it('produces different factualScore with custom weights vs default weights for same input', () => {
    const input = {
      paragraphs: [
        { isReviewed: true, confidenceScores: [0.6] },
        { isReviewed: false, confidenceScores: [0.6] },
      ],
      accuracyRatings: [0.7],
    }
    const customWeights: ScoreWeights = { coverage: 0.8, accuracy: 0.1, confidence: 0.1 }
    const defaultResult = computeFactualScore(input.paragraphs, input.accuracyRatings, DEFAULT_WEIGHTS)
    const customResult = computeFactualScore(input.paragraphs, input.accuracyRatings, customWeights)
    expect(defaultResult.factualScore).not.toBe(customResult.factualScore)
  })

  // Test 5 (SCORE-02): Always returns both factualScore and coveragePercent (inseparable)
  it('always returns both factualScore and coveragePercent in the same result object', () => {
    const result = computeFactualScore(
      [{ isReviewed: false, confidenceScores: [0.5] }],
      [],
      DEFAULT_WEIGHTS
    )
    expect(result).toHaveProperty('factualScore')
    expect(result).toHaveProperty('coveragePercent')
    expect(typeof result.factualScore).toBe('number')
    expect(typeof result.coveragePercent).toBe('number')
  })

  // Test 6: Empty paragraphs array — no division by zero
  it('handles empty paragraphs array gracefully without division by zero', () => {
    const result = computeFactualScore([], [], DEFAULT_WEIGHTS)
    expect(result.factualScore).toBe(0)
    expect(result.coveragePercent).toBe(0)
    expect(result.coverageComponent).toBe(0)
    expect(result.accuracyComponent).toBe(0)
    expect(result.confidenceComponent).toBe(0)
  })

  // Test 7: Result is always clamped to [0, 100]
  it('clamps factualScore to [0, 100] even with unusual weights summing > 1', () => {
    const overWeights: ScoreWeights = { coverage: 1.0, accuracy: 1.0, confidence: 1.0 }
    const result = computeFactualScore(
      [{ isReviewed: true, confidenceScores: [1.0] }],
      [1.0],
      overWeights
    )
    expect(result.factualScore).toBeLessThanOrEqual(100)
    expect(result.factualScore).toBeGreaterThanOrEqual(0)
  })
})
