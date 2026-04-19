import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { normalizeWikipediaUrl } from '@/features/ingestion/mediawiki-client'

describe('normalizeWikipediaUrl', () => {
  it('returns normalized URL and title for a standard Wikipedia URL', () => {
    const result = normalizeWikipediaUrl('https://en.wikipedia.org/wiki/Eiffel_Tower')
    expect(result).toEqual({
      normalized: 'https://en.wikipedia.org/wiki/Eiffel_Tower',
      title: 'Eiffel_Tower',
    })
  })

  it('normalizes mobile subdomain to desktop', () => {
    const result = normalizeWikipediaUrl('https://en.m.wikipedia.org/wiki/Eiffel_Tower')
    expect(result.normalized).toBe('https://en.wikipedia.org/wiki/Eiffel_Tower')
    expect(result.title).toBe('Eiffel_Tower')
  })

  it('upgrades HTTP to HTTPS', () => {
    const result = normalizeWikipediaUrl('http://en.wikipedia.org/wiki/Eiffel_Tower')
    expect(result.normalized).toMatch(/^https:\/\//)
    expect(result.normalized).toBe('https://en.wikipedia.org/wiki/Eiffel_Tower')
    expect(result.title).toBe('Eiffel_Tower')
  })

  it('decodes URL-encoded titles and replaces spaces with underscores', () => {
    const result = normalizeWikipediaUrl('https://en.wikipedia.org/wiki/Eiffel%20Tower')
    expect(result.title).toBe('Eiffel_Tower')
    expect(result.normalized).toBe('https://en.wikipedia.org/wiki/Eiffel_Tower')
  })

  it('throws for non-Wikipedia URLs', () => {
    expect(() => normalizeWikipediaUrl('https://example.com/page')).toThrow(
      'Not a Wikipedia article URL',
    )
  })

  it('throws for Wikipedia URL without /wiki/ prefix', () => {
    expect(() =>
      normalizeWikipediaUrl('https://en.wikipedia.org/w/index.php?title=Eiffel_Tower'),
    ).toThrow('Not a Wikipedia article URL')
  })

  it('extracts title from URL with query params, stripping them from normalized URL', () => {
    const result = normalizeWikipediaUrl(
      'https://en.wikipedia.org/wiki/Eiffel_Tower?section=1',
    )
    expect(result.title).toBe('Eiffel_Tower')
    expect(result.normalized).toBe('https://en.wikipedia.org/wiki/Eiffel_Tower')
  })
})
