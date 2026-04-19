import 'server-only'
import { mediawikiFetchWithBackoff } from '@/lib/mediawiki'

export interface MediaWikiParseResponse {
  parse: {
    title: string
    pageid: number
    revid: number
    text: string
    tocdata: {
      sections: Array<{
        tocLevel: number
        hLevel: number
        line: string
        number: string
        index: string
        anchor: string
        codepointOffset: number
      }>
    }
  }
}

/**
 * Normalize a Wikipedia URL to a canonical https://en.wikipedia.org/wiki/Title form.
 * Handles mobile URLs, HTTP, and URL-encoded titles.
 * T-02-01: validates hostname is exactly en.wikipedia.org or en.m.wikipedia.org.
 */
export function normalizeWikipediaUrl(raw: string): { normalized: string; title: string } {
  const url = new URL(raw)

  // T-02-01: Only allow en.wikipedia.org and en.m.wikipedia.org
  if (url.hostname !== 'en.wikipedia.org' && url.hostname !== 'en.m.wikipedia.org') {
    throw new Error('Not a Wikipedia article URL')
  }

  // Normalize mobile subdomain
  url.hostname = 'en.wikipedia.org'

  // Force HTTPS
  url.protocol = 'https:'

  // Extract title from /wiki/ path prefix
  const match = url.pathname.match(/^\/wiki\/(.+)$/)
  if (!match) {
    throw new Error('Not a Wikipedia article URL')
  }

  // Decode and normalize title (spaces -> underscores)
  const title = decodeURIComponent(match[1]).replace(/\s+/g, '_')

  return {
    normalized: `https://en.wikipedia.org/wiki/${title}`,
    title,
  }
}

/**
 * Fetch a Wikipedia article via the MediaWiki action=parse API.
 * T-02-02: URL is built server-side with searchParams — user title is never interpolated raw.
 * Uses prop=text|tocdata|revid (tocdata replaces deprecated sections prop since MediaWiki 1.46).
 */
export async function fetchArticle(title: string): Promise<MediaWikiParseResponse> {
  const apiUrl = new URL('https://en.wikipedia.org/w/api.php')
  apiUrl.searchParams.set('action', 'parse')
  apiUrl.searchParams.set('page', title)
  apiUrl.searchParams.set('prop', 'text|tocdata|revid')
  apiUrl.searchParams.set('format', 'json')
  apiUrl.searchParams.set('formatversion', '2')

  const res = await mediawikiFetchWithBackoff(apiUrl.toString())

  if (!res.ok) {
    throw new Error(`MediaWiki API error: ${res.status}`)
  }

  return res.json() as Promise<MediaWikiParseResponse>
}
