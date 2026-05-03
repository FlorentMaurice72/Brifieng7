import { getParisDate } from '@/lib/date'

type LogStatus = 'started' | 'success' | 'error' | 'skipped' | 'warning' | string

interface LogEventParams {
  status: LogStatus
  step?: string
  error?: Error | string
  metadata?: Record<string, unknown>
  startedAt?: Date
  finishedAt?: Date
}

/**
 * Logs a pipeline event to Supabase `logs` table.
 * Failures in this function are swallowed to avoid blocking the main pipeline.
 */
export async function logEvent(params: LogEventParams): Promise<void> {
  const errorMessage =
    params.error instanceof Error
      ? params.error.message
      : typeof params.error === 'string'
        ? params.error
        : undefined

  console.log(`[logger] ${params.status}${params.step ? ` [${params.step}]` : ''}${errorMessage ? `: ${errorMessage}` : ''}`)

  try {
    const { insertLog } = await import('@/lib/supabase')
    await insertLog({
      run_date: getParisDate(),
      status: params.status,
      step: params.step,
      error_message: errorMessage,
      metadata: params.metadata,
      started_at: params.startedAt?.toISOString(),
      finished_at: params.finishedAt?.toISOString(),
    })
  } catch (err) {
    console.error('[logger] Failed to persist log to Supabase:', err)
  }
}
