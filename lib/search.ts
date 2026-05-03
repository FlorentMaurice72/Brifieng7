import type { SearchResult } from '@/types/source'

export interface SearchOptions {
  maxResults?: number
  language?: string
  freshness?: 'day' | 'week' | 'month'
}

export interface SearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}

// ── Mock provider (used when SEARCH_PROVIDER is unset or in dev without key) ──

class MockSearchProvider implements SearchProvider {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    console.warn('[search] Using MOCK provider — results are fictional test data')
    const maxResults = options?.maxResults ?? 5
    return Array.from({ length: maxResults }, (_, i) => ({
      title: `[MOCK] Résultat test ${i + 1} pour "${query}"`,
      url: `https://example.com/mock-result-${i + 1}`,
      snippet: '[MOCK] Ceci est un résultat fictif de test. Ne pas envoyer en production.',
      sourceName: 'Mock Source',
      publishedAt: new Date().toISOString(),
      category: 'general' as const,
    }))
  }
}

// ── Tavily provider ────────────────────────────────────────────────────────────

class TavilySearchProvider implements SearchProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: options?.maxResults ?? 8,
        search_depth: 'advanced',
        include_answer: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Tavily search failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.results ?? []).map((r: Record<string, string>) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      sourceName: r.source,
      publishedAt: r.published_date,
    }))
  }
}

// ── Brave provider ─────────────────────────────────────────────────────────────

class BraveSearchProvider implements SearchProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      count: String(options?.maxResults ?? 8),
      text_decorations: 'false',
    })
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { 'X-Subscription-Token': this.apiKey, Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.web?.results ?? []).map((r: Record<string, string>) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      publishedAt: r.page_age,
    }))
  }
}

// ── Serper provider ───────────────────────────────────────────────────────────

class SerperSearchProvider implements SearchProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: options?.maxResults ?? 8 }),
    })

    if (!response.ok) {
      throw new Error(`Serper search failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return (data.organic ?? []).map((r: Record<string, string>) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      publishedAt: r.date,
    }))
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function getSearchProvider(): SearchProvider {
  const provider = process.env.SEARCH_PROVIDER
  const apiKey = process.env.SEARCH_API_KEY

  if (!apiKey) {
    console.warn('[search] SEARCH_API_KEY not set — falling back to mock provider')
    return new MockSearchProvider()
  }

  switch (provider) {
    case 'tavily':
      return new TavilySearchProvider(apiKey)
    case 'brave':
      return new BraveSearchProvider(apiKey)
    case 'serper':
      return new SerperSearchProvider(apiKey)
    default:
      console.warn(`[search] Unknown SEARCH_PROVIDER "${provider}" — falling back to mock provider`)
      return new MockSearchProvider()
  }
}

export async function searchWeb(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  const provider = getSearchProvider()
  return provider.search(query, options)
}
