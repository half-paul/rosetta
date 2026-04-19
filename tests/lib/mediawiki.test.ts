import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mediawikiFetch, mediawikiFetchWithBackoff } from '@/lib/mediawiki'

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

describe('mediawikiFetchWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns immediately on non-429 response without retrying', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const res = await mediawikiFetchWithBackoff('https://en.wikipedia.org/w/api.php')
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and returns success on second attempt', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = mediawikiFetchWithBackoff('https://en.wikipedia.org/w/api.php')
    // Advance past the 1s delay for the first retry
    await vi.advanceTimersByTimeAsync(1_000)
    const res = await promise
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws after maxRetries (5) consecutive 429 responses with rate-limited message', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = mediawikiFetchWithBackoff('https://en.wikipedia.org/w/api.php')
    // Set up rejection handler before advancing timers to avoid unhandled rejection warning
    const rejection = expect(promise).rejects.toThrow('rate limited after 5 retries')
    // Advance through all retry delays: 1s + 2s + 4s + 8s + 16s = 31s
    await vi.advanceTimersByTimeAsync(31_000)
    await rejection
  })

  it('doubles delay on each retry up to 32s cap', async () => {
    // Use maxRetries=6 to get to the 32s cap (delays: 1,2,4,8,16,32)
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = mediawikiFetchWithBackoff('https://en.wikipedia.org/w/api.php', undefined, 6)
    // Set up rejection handler before advancing timers
    const rejection = expect(promise).rejects.toThrow('rate limited after 6 retries')
    // Advance through delays: 1+2+4+8+16+32 = 63s total
    await vi.advanceTimersByTimeAsync(63_000)
    await rejection
    // 7 calls total: attempt 0-6
    expect(mockFetch).toHaveBeenCalledTimes(7)
  })

  it('caps delay at 32000ms regardless of retry count', async () => {
    // Use maxRetries=8 — after attempt 5 the delay would exceed 32s without cap
    // delays would be: 1,2,4,8,16,32,32,32 (capped)
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    vi.stubGlobal('fetch', mockFetch)

    const promise = mediawikiFetchWithBackoff('https://en.wikipedia.org/w/api.php', undefined, 8)
    // Set up rejection handler before advancing timers
    const rejection = expect(promise).rejects.toThrow('rate limited after 8 retries')
    // Advance through: 1+2+4+8+16+32+32+32 = 127s
    await vi.advanceTimersByTimeAsync(127_000)
    await rejection
    expect(mockFetch).toHaveBeenCalledTimes(9)
  })
})
