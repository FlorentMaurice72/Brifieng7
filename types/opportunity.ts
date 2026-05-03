import { z } from 'zod'

export const OpportunityCategorySchema = z.enum([
  'ai',
  'business',
  'finance',
  'real_estate',
  'other',
])
export type OpportunityCategory = z.infer<typeof OpportunityCategorySchema>

export const OpportunitySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  category: OpportunityCategorySchema,
  potentialScore: z.number().int().min(1).max(10),
  actionSuggested: z.string().optional(),
})
export type Opportunity = z.infer<typeof OpportunitySchema>

// Row stored in Supabase `opportunities` table
export interface OpportunityRow {
  id?: string
  briefing_id: string
  title: string
  description?: string
  category?: string
  potential_score?: number
  action_suggested?: string
  created_at?: string
}
