import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mediawikiFetch } from '@/lib/mediawiki'

describe('mediawikiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('sets User-Agent header on every request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', mockFetch)

    await mediawikiFetch('https://en.wikipedia.org/api/rest_v1/page/summary/Test')

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['User-Agent']).toMatch(/^Rosetta\//)
    expect(init.headers['User-Agent']).toContain('rosetta.example.com')
  })

  it('preserves caller-supplied headers alongside User-Agent', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', mockFetch)

    await mediawikiFetch('https://example.com', {
      headers: { 'Accept': 'application/json' },
    })

    const [, init] = mockFetch.mock.calls[0]
    expect(init.headers['User-Agent']).toMatch(/^Rosetta\//)
    expect(init.headers['Accept']).toBe('application/json')
  })

  it('User-Agent matches Wikimedia policy format (project/version + contact)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', mockFetch)

    await mediawikiFetch('https://example.com')

    const [, init] = mockFetch.mock.calls[0]
    const ua = init.headers['User-Agent']
    // Wikimedia policy: "ClientName/Version (ContactInfo)"
    expect(ua).toMatch(/^Rosetta\/\d+\.\d+\s*\(/)
  })
})
