import { z } from 'zod'
import { OpportunitySchema } from './opportunity'
import { ConfidenceLevelSchema } from './source'

// Status lifecycle of a briefing run
export type BriefingStatus =
  | 'generated'
  | 'quality_check_passed'
  | 'failed_quality_check'
  | 'failed_generation'
  | 'sent'
  | 'failed_to_send'

// Structured output expected from the AI generator, validated with Zod
export const GeneratedBriefingSchema = z.object({
  title: z.string(),
  content: z.string(),
  whatsappContent: z.string().optional(),
  wordCount: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative(),
  mainSources: z.array(
    z.object({
      title: z.string(),
      url: z.string().optional(),
      sourceName: z.string().optional(),
      confidenceLevel: ConfidenceLevelSchema,
    })
  ),
  opportunity: OpportunitySchema,
})
export type GeneratedBriefing = z.infer<typeof GeneratedBriefingSchema>

// Prepared WhatsApp messages (split briefing)
export interface WhatsAppMessage {
  index: number
  label: string
  content: string
  charCount: number
}

// Full briefing object used across the pipeline
export interface BriefingPipeline {
  briefingDate: string // YYYY-MM-DD
  topicOfDay: string
  generatedBriefing: GeneratedBriefing
  whatsappMessages: WhatsAppMessage[]
  status: BriefingStatus
  qualityCheckPassed: boolean
  sentAt?: string
}

// Row stored in Supabase `briefings` table
export interface BriefingRow {
  id?: string
  briefing_date: string
  title: string
  content: string
  whatsapp_content?: string
  whatsapp_messages?: WhatsAppMessage[]
  word_count?: number
  char_count?: number
  status: BriefingStatus
  sent_at?: string
  created_at?: string
  updated_at?: string
}

// Quality check result
export interface QualityCheckResult {
  passed: boolean
  issues: string[]
  score: number
}
