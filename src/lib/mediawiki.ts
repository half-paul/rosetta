const USER_AGENT = 'Rosetta/1.0 (https://rosetta.example.com; contact@rosetta.example.com)'

export async function mediawikiFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      'User-Agent': USER_AGENT,
      ...init?.headers,
    },
  })
}

export async function mediawikiFetchWithBackoff(
  url: string,
  init?: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  let delay = 1_000  // 1s initial per D-15
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await mediawikiFetch(url, init)
    if (res.status !== 429) return res
    if (attempt === maxRetries) {
      throw new Error(`MediaWiki rate limited after ${maxRetries} retries`)
    }
    await new Promise(r => setTimeout(r, delay))
    delay = Math.min(delay * 2, 32_000)  // cap at 32s per D-15
  }
  throw new Error('unreachable')
}
