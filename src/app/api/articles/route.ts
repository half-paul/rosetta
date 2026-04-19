import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { getStartedBoss } from '@/lib/boss'
import { db } from '@/db'
import { articles } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { normalizeWikipediaUrl } from '@/features/ingestion/mediawiki-client'

// T-02-07: Zod validates URL is a valid URL string.
// Refine checks hostname is exactly en.wikipedia.org or en.m.wikipedia.org
// and path starts with /wiki/. Prevents SSRF to arbitrary hosts.
const ingestBodySchema = z.object({
  url: z.string().url().refine(
    url => {
      try {
        const parsed = new URL(url)
        return (
          (parsed.hostname === 'en.wikipedia.org' || parsed.hostname === 'en.m.wikipedia.org') &&
          parsed.pathname.startsWith('/wiki/')
        )
      } catch {
        return false
      }
    },
    'Must be an English Wikipedia article URL (en.wikipedia.org/wiki/...)'
  ),
})

export async function POST(req: NextRequest) {
  try {
    // T-02-06: Auth check — unauthenticated requests return 401
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await req.json()
    const parsed = ingestBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
    }

    // Normalize URL to canonical form
    const { normalized, title } = normalizeWikipediaUrl(parsed.data.url)

    // Pitfall 4: duplicate URL check — prevents re-enqueue of existing articles
    const existing = await db.select().from(articles).where(eq(articles.wikiUrl, normalized))
    if (existing.length > 0) {
      return NextResponse.json({ article: existing[0] }, { status: 200 })
    }

    // Enqueue ingestion job via pg-boss (Pitfall 5 fix: getStartedBoss ensures start() called)
    const boss = await getStartedBoss()
    const jobId = await boss.send('ingestion-jobs', { url: normalized, title })

    return NextResponse.json({ jobId }, { status: 202 })
  } catch (err) {
    // T-02-11: generic error response — no stack traces in HTTP response
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
