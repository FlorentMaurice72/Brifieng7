import { z } from 'zod'

export const ConfidenceLevelSchema = z.enum(['low', 'medium', 'high'])
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>

export const SourceCategorySchema = z.enum([
  'ai',
  'business',
  'finance',
  'real_estate',
  'general',
])
export type SourceCategory = z.infer<typeof SourceCategorySchema>

// Raw result returned by any search provider
export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url().optional(),
  snippet: z.string().optional(),
  sourceName: z.string().optional(),
  publishedAt: z.string().optional(),
  category: SourceCategorySchema.optional(),
})
export type SearchResult = z.infer<typeof SearchResultSchema>

// Source after scoring
export const ScoredSourceSchema = SearchResultSchema.extend({
  reliabilityScore: z.number().int().min(1).max(10),
  freshnessScore: z.number().int().min(1).max(10),
  relevanceScore: z.number().int().min(1).max(10),
  businessScore: z.number().int().min(1).max(10),
  actionabilityScore: z.number().int().min(1).max(10),
  totalScore: z.number().int(),
  confidenceLevel: ConfidenceLevelSchema,
  summary: z.string().optional(),
})
export type ScoredSource = z.infer<typeof ScoredSourceSchema>

// Row stored in Supabase `sources` table
export interface SourceRow {
  id?: string
  briefing_id: string
  title: string
  url?: string
  source_name?: string
  source_type?: string
  published_at?: string
  reliability_score?: number
  freshness_score?: number
  relevance_score?: number
  business_score?: number
  actionability_score?: number
  total_score?: number
  confidence_level?: ConfidenceLevel
  summary?: string
  created_at?: string
}
