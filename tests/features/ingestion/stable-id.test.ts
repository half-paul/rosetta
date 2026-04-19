import { describe, it, expect } from 'vitest'
import { computeContentHash, buildStableId, normalizeSectionPath } from '@/features/ingestion/stable-id'

describe('computeContentHash', () => {
  it('returns a 12-character lowercase hex string', () => {
    const hash = computeContentHash('hello world')
    expect(hash).toHaveLength(12)
    expect(hash).toMatch(/^[0-9a-f]{12}$/)
  })

  it('is deterministic — same input always produces same hash', () => {
    const hash1 = computeContentHash('hello world')
    const hash2 = computeContentHash('hello world')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different inputs', () => {
    const hash1 = computeContentHash('hello world')
    const hash2 = computeContentHash('different text')
    expect(hash1).not.toBe(hash2)
  })

  it('handles empty string input', () => {
    const hash = computeContentHash('')
    expect(hash).toHaveLength(12)
    expect(hash).toMatch(/^[0-9a-f]{12}$/)
  })
})

describe('buildStableId', () => {
  it('builds stable ID in sectionPath:contentHash:revisionId format', () => {
    const result = buildStableId('history/early_period', 'abc123def456', 98765)
    expect(result).toBe('history/early_period:abc123def456:98765')
  })

  it('uses the exact values passed without transformation', () => {
    const result = buildStableId('lead', 'deadbeef0001', 1)
    expect(result).toBe('lead:deadbeef0001:1')
  })
})

describe('normalizeSectionPath', () => {
  it('lowercases single heading and replaces spaces with underscores', () => {
    const result = normalizeSectionPath(['lead'])
    expect(result).toBe('lead')
  })

  it('lowercases and joins two headings with /', () => {
    const result = normalizeSectionPath(['History', 'Early Period'])
    expect(result).toBe('history/early_period')
  })

  it('handles three levels of headings', () => {
    const result = normalizeSectionPath(['History', 'Early Period', 'Sub Topic'])
    expect(result).toBe('history/early_period/sub_topic')
  })

  it('handles already lowercase headings without underscores', () => {
    const result = normalizeSectionPath(['references'])
    expect(result).toBe('references')
  })
})
