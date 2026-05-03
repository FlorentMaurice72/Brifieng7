import type { SourceCategory } from '@/types/source'

export interface TrustedSourceConfig {
  domain: string
  name: string
  baseReliabilityScore: number // 1-10
}

export const trustedSources: Record<SourceCategory, TrustedSourceConfig[]> = {
  ai: [
    { domain: 'openai.com', name: 'OpenAI', baseReliabilityScore: 9 },
    { domain: 'anthropic.com', name: 'Anthropic', baseReliabilityScore: 9 },
    { domain: 'deepmind.google', name: 'Google DeepMind', baseReliabilityScore: 9 },
    { domain: 'ai.meta.com', name: 'Meta AI', baseReliabilityScore: 8 },
    { domain: 'hai.stanford.edu', name: 'Stanford HAI', baseReliabilityScore: 9 },
    { domain: 'arxiv.org', name: 'arXiv', baseReliabilityScore: 8 },
    { domain: 'paperswithcode.com', name: 'Papers With Code', baseReliabilityScore: 8 },
    { domain: 'huggingface.co', name: 'Hugging Face', baseReliabilityScore: 8 },
    { domain: 'nvidia.com', name: 'NVIDIA', baseReliabilityScore: 8 },
  ],
  business: [
    { domain: 'hbr.org', name: 'Harvard Business Review', baseReliabilityScore: 9 },
    { domain: 'mckinsey.com', name: 'McKinsey & Company', baseReliabilityScore: 9 },
    { domain: 'bcg.com', name: 'Boston Consulting Group', baseReliabilityScore: 9 },
    { domain: 'bain.com', name: 'Bain & Company', baseReliabilityScore: 9 },
    { domain: 'ycombinator.com', name: 'Y Combinator', baseReliabilityScore: 8 },
    { domain: 'a16z.com', name: 'Andreessen Horowitz', baseReliabilityScore: 8 },
    { domain: 'firstround.com', name: 'First Round Capital', baseReliabilityScore: 8 },
    { domain: 'stripe.com', name: 'Stripe', baseReliabilityScore: 8 },
  ],
  finance: [
    { domain: 'reuters.com', name: 'Reuters', baseReliabilityScore: 9 },
    { domain: 'ft.com', name: 'Financial Times', baseReliabilityScore: 9 },
    { domain: 'morningstar.com', name: 'Morningstar', baseReliabilityScore: 8 },
    { domain: 'blackrock.com', name: 'BlackRock', baseReliabilityScore: 8 },
    { domain: 'vanguard.com', name: 'Vanguard', baseReliabilityScore: 8 },
    { domain: 'finance.yahoo.com', name: 'Yahoo Finance', baseReliabilityScore: 7 },
    { domain: 'investing.com', name: 'Investing.com', baseReliabilityScore: 7 },
    { domain: 'ecb.europa.eu', name: 'European Central Bank', baseReliabilityScore: 10 },
    { domain: 'banque-france.fr', name: 'Banque de France', baseReliabilityScore: 10 },
    { domain: 'insee.fr', name: 'INSEE', baseReliabilityScore: 10 },
  ],
  real_estate: [
    { domain: 'notaires.fr', name: 'Notaires de France', baseReliabilityScore: 9 },
    { domain: 'insee.fr', name: 'INSEE', baseReliabilityScore: 10 },
    { domain: 'banque-france.fr', name: 'Banque de France', baseReliabilityScore: 10 },
    { domain: 'creditlogement.fr', name: 'Crédit Logement', baseReliabilityScore: 9 },
    { domain: 'fnaim.fr', name: 'FNAIM', baseReliabilityScore: 8 },
    { domain: 'service-public.fr', name: 'Service Public', baseReliabilityScore: 10 },
  ],
  general: [],
}

// Build a flat list of all trusted domains for quick lookup
export const allTrustedDomains: Set<string> = new Set(
  Object.values(trustedSources)
    .flat()
    .map((s) => s.domain)
)

// Return config for a given domain, or undefined if not trusted
export function getTrustedSourceConfig(url: string): TrustedSourceConfig | undefined {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '')
    return Object.values(trustedSources)
      .flat()
      .find((s) => domain === s.domain || domain.endsWith(`.${s.domain}`))
  } catch {
    return undefined
  }
}
