import { getParisDate } from '@/lib/date'

interface UsageParams {
  provider: string
  operation: string
  inputTokens?: number
  outputTokens?: number
  searchRequests?: number
  metadata?: Record<string, unknown>
}

// Rough per-token cost estimates (USD) — update as pricing changes
const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 0.000003, output: 0.000015 },
  'claude-opus-4-7': { input: 0.000015, output: 0.000075 },
  'gpt-4o': { input: 0.000005, output: 0.000015 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
}

function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const model = process.env.AI_MODEL ?? ''
  const rates = COST_PER_TOKEN[model]
  if (!rates) return 0
  return inputTokens * rates.input + outputTokens * rates.output
}

/**
 * Records token and API usage to Supabase `usage_logs`.
 * Never throws — a logging failure must not block the pipeline.
 */
export async function logUsage(params: UsageParams): Promise<void> {
  const estimatedCost = estimateCost(
    params.provider,
    params.inputTokens ?? 0,
    params.outputTokens ?? 0
  )

  console.log(
    `[usage] ${params.provider}/${params.operation} — in:${params.inputTokens ?? 0} out:${params.outputTokens ?? 0} ~$${estimatedCost.toFixed(5)}`
  )

  try {
    const { insertUsageLog } = await import('@/lib/supabase')
    await insertUsageLog({
      run_date: getParisDate(),
      provider: params.provider,
      operation: params.operation,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      search_requests: params.searchRequests,
      estimated_cost: estimatedCost,
      metadata: params.metadata,
    })
  } catch (err) {
    console.error('[usage] Failed to persist usage log:', err)
  }
}
