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
