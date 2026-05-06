import { createClient } from '@supabase/supabase-js'
import type { BriefingRow, BriefingStatus } from '@/types/briefing'
import type { SourceRow } from '@/types/source'
import type { OpportunityRow } from '@/types/opportunity'

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

let _client: ReturnType<typeof getSupabaseClient> | null = null
export function getClient() {
  if (!_client) _client = getSupabaseClient()
  return _client
}

// ── Briefings ─────────────────────────────────────────────────────────────────

export async function getBriefingByDate(date: string): Promise<BriefingRow | null> {
  const { data, error } = await getClient()
    .from('briefings')
    .select('*')
    .eq('briefing_date', date)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data ?? null
}

export async function insertBriefing(row: Omit<BriefingRow, 'id' | 'created_at' | 'updated_at'>): Promise<BriefingRow> {
  const { data, error } = await getClient()
    .from('briefings')
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return data
}

// Upsert on briefing_date — used by test route with force:true to replace existing
export async function upsertBriefing(row: Omit<BriefingRow, 'id' | 'created_at' | 'updated_at'>): Promise<BriefingRow> {
  const { data, error } = await getClient()
    .from('briefings')
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'briefing_date' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateBriefingStatus(id: string, status: BriefingStatus, sentAt?: string): Promise<void> {
  const { error } = await getClient()
    .from('briefings')
    .update({ status, sent_at: sentAt, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// ── Sources ───────────────────────────────────────────────────────────────────

export async function insertSources(rows: Omit<SourceRow, 'id' | 'created_at'>[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await getClient().from('sources').insert(rows)
  if (error) throw error
}

// ── Opportunities ─────────────────────────────────────────────────────────────

export async function insertOpportunity(row: Omit<OpportunityRow, 'id' | 'created_at'>): Promise<void> {
  const { error } = await getClient().from('opportunities').insert(row)
  if (error) throw error
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function insertLog(row: {
  run_date?: string
  status: string
  step?: string
  error_message?: string
  metadata?: Record<string, unknown>
  started_at?: string
  finished_at?: string
}): Promise<void> {
  const { error } = await getClient().from('logs').insert(row)
  if (error) console.error('[supabase] Failed to insert log:', error.message)
}

export async function insertUsageLog(row: {
  run_date?: string
  provider?: string
  operation?: string
  input_tokens?: number
  output_tokens?: number
  search_requests?: number
  estimated_cost?: number
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { error } = await getClient().from('usage_logs').insert(row)
  if (error) console.error('[supabase] Failed to insert usage log:', error.message)
}
