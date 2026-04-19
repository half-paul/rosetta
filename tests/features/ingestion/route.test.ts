import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock auth — controls authentication state per test
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: (...args: unknown[]) => mockAuth(...args) }))

// Mock getBoss — returns a fake boss with send()
const mockSend = vi.fn()
vi.mock('@/lib/boss', () => ({
  getStartedBoss: vi.fn().mockResolvedValue({ send: (...args: unknown[]) => mockSend(...args) }),
}))

// Mock db for duplicate check
const mockSelect = vi.fn()
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: (...args: unknown[]) => mockSelect(...args) }) }),
  },
}))

// Mock normalizeWikipediaUrl
vi.mock('@/features/ingestion/mediawiki-client', () => ({
  normalizeWikipediaUrl: vi.fn().mockReturnValue({
    normalized: 'https://en.wikipedia.org/wiki/Eiffel_Tower',
    title: 'Eiffel_Tower',
  }),
}))

import { POST } from '@/app/api/articles/route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/articles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'test-user' } }) // default: authenticated
    mockSelect.mockResolvedValue([]) // default: no duplicate
    mockSend.mockResolvedValue('job-id-123') // default: job enqueued
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ url: 'https://en.wikipedia.org/wiki/Eiffel_Tower' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 422 for invalid URL', async () => {
    const res = await POST(makeRequest({ url: 'https://example.com/page' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(422)
  })

  it('returns 422 for missing URL field', async () => {
    const res = await POST(makeRequest({}) as Parameters<typeof POST>[0])
    expect(res.status).toBe(422)
  })

  it('returns 200 with existing article for duplicate URL', async () => {
    mockSelect.mockResolvedValue([{ id: 'existing-123', title: 'Eiffel_Tower' }])
    const res = await POST(makeRequest({ url: 'https://en.wikipedia.org/wiki/Eiffel_Tower' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.article).toBeDefined()
    expect(body.article.id).toBe('existing-123')
  })

  it('returns 202 with jobId for new valid URL', async () => {
    const res = await POST(makeRequest({ url: 'https://en.wikipedia.org/wiki/Eiffel_Tower' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBe('job-id-123')
  })

  it('rejects non-English Wikipedia URL with 422', async () => {
    const res = await POST(makeRequest({ url: 'https://fr.wikipedia.org/wiki/Tour_Eiffel' }) as Parameters<typeof POST>[0])
    expect(res.status).toBe(422)
  })
})
