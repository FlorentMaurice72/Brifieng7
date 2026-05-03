import type { SearchResult, ScoredSource, ConfidenceLevel } from '@/types/source'
import { getTrustedSourceConfig } from '@/config/trusted-sources'

function clamp(value: number, min = 1, max = 10): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function parsePublishedAt(publishedAt?: string): Date | null {
  if (!publishedAt) return null
  const d = new Date(publishedAt)
  return isNaN(d.getTime()) ? null : d
}

function scoreFreshness(publishedAt?: string): number {
  const date = parsePublishedAt(publishedAt)
  if (!date) return 5 // unknown date: neutral score

  const ageHours = (Date.now() - date.getTime()) / (1000 * 60 * 60)
  if (ageHours < 24) return 10
  if (ageHours < 48) return 9
  if (ageHours < 72) return 8
  if (ageHours < 168) return 7  // < 1 week
  if (ageHours < 720) return 5  // < 1 month
  return 3
}

function scoreReliability(result: SearchResult): number {
  if (!result.url) return 3

  const trusted = getTrustedSourceConfig(result.url)
  if (trusted) return trusted.baseReliabilityScore

  // Heuristics for unknown sources
  const url = result.url.toLowerCase()
  if (url.endsWith('.gov') || url.endsWith('.gouv.fr') || url.endsWith('.europa.eu')) return 9
  if (url.endsWith('.edu') || url.endsWith('.ac.uk')) return 8
  if (url.includes('reuters') || url.includes('bbc') || url.includes('lemonde')) return 8
  if (url.includes('medium.com') || url.includes('substack')) return 5
  if (url.includes('twitter.com') || url.includes('x.com') || url.includes('reddit')) return 2

  return 5 // unknown: neutral
}

function scoreRelevance(result: SearchResult, topic: string): number {
  const text = `${result.title ?? ''} ${result.snippet ?? ''}`.toLowerCase()
  const topicWords = topic.toLowerCase().split(/\s+/)
  const matches = topicWords.filter((w) => w.length > 3 && text.includes(w)).length
  return clamp(3 + matches * 2)
}

function scoreBusiness(result: SearchResult): number {
  const text = `${result.title ?? ''} ${result.snippet ?? ''}`.toLowerCase()
  const businessKeywords = [
    'revenue', 'croissance', 'growth', 'profit', 'market', 'marché',
    'stratégie', 'strategy', 'entrepreneur', 'startup', 'investissement',
    'opportunity', 'opportunité', 'business', 'model', 'modèle',
  ]
  const matches = businessKeywords.filter((k) => text.includes(k)).length
  return clamp(3 + matches)
}

function scoreActionability(result: SearchResult): number {
  const text = `${result.title ?? ''} ${result.snippet ?? ''}`.toLowerCase()
  const actionKeywords = [
    'comment', 'how to', 'guide', 'tutorial', 'steps', 'étapes',
    'conseils', 'tips', 'framework', 'outil', 'tool', 'méthode', 'action',
    'pratique', 'example', 'exemple', 'cas concret',
  ]
  const matches = actionKeywords.filter((k) => text.includes(k)).length
  return clamp(3 + matches * 2)
}

function computeConfidence(total: number): ConfidenceLevel {
  if (total >= 40) return 'high'
  if (total >= 25) return 'medium'
  return 'low'
}

export function scoreSource(result: SearchResult, topicHint = ''): ScoredSource {
  const reliabilityScore = clamp(scoreReliability(result))
  const freshnessScore = clamp(scoreFreshness(result.publishedAt))
  const relevanceScore = clamp(scoreRelevance(result, topicHint))
  const businessScore = clamp(scoreBusiness(result))
  const actionabilityScore = clamp(scoreActionability(result))

  const totalScore =
    reliabilityScore * 2 +
    freshnessScore * 2 +
    relevanceScore * 2 +
    businessScore +
    actionabilityScore

  return {
    ...result,
    reliabilityScore,
    freshnessScore,
    relevanceScore,
    businessScore,
    actionabilityScore,
    totalScore,
    confidenceLevel: computeConfidence(totalScore),
  }
}

export function scoreSources(results: SearchResult[], topicHint = ''): ScoredSource[] {
  return results
    .map((r) => scoreSource(r, topicHint))
    .sort((a, b) => b.totalScore - a.totalScore)
}

/**
 * Removes near-duplicate sources based on URL hostname + title similarity.
 * Keeps the highest-scored version of each duplicate pair.
 */
export function deduplicateSources(sources: ScoredSource[]): ScoredSource[] {
  const seen = new Map<string, ScoredSource>()

  for (const source of sources) {
    // Build a dedup key from the normalised hostname + first 60 chars of title
    let key = source.title.toLowerCase().trim().slice(0, 60)
    if (source.url) {
      try {
        key = new URL(source.url).hostname + '|' + key
      } catch {
        // keep title-only key
      }
    }

    const existing = seen.get(key)
    if (!existing || source.totalScore > existing.totalScore) {
      seen.set(key, source)
    }
  }

  return Array.from(seen.values()).sort((a, b) => b.totalScore - a.totalScore)
}
