import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getParisDate, formatBriefingDate, getTopicForToday, getParisNow } from '@/lib/date'
import { searchWeb } from '@/lib/search'
import { scoreSources, deduplicateSources } from '@/lib/scoring'
import { generateBriefing, AIError } from '@/lib/briefing-generator'
import { validateBriefingQuality } from '@/lib/quality'
import { splitBriefingForWhatsApp, whatsAppMessagesToString } from '@/lib/whatsapp-format'
import { sendWhatsAppMessages, handleDeliveryFailure } from '@/lib/twilio'
import {
  getBriefingByDate,
  insertBriefing,
  upsertBriefing,
  insertSources,
  insertOpportunity,
  updateBriefingStatus,
} from '@/lib/supabase'
import { logEvent } from '@/lib/logger'
import type { WhatsAppMessage } from '@/types/briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SentReason =
  | 'sent'
  | 'send_not_requested'
  | 'missing_twilio_config'
  | 'twilio_error'

const RequestBodySchema = z.object({
  send: z.boolean().optional().default(false),
  force: z.boolean().optional().default(false),
})

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// Serialize any error type — avoids "[object Object]"
function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (e.message) return String(e.message)
    try { return JSON.stringify(err) } catch { /* fallthrough */ }
  }
  return String(err)
}

// Returns names of missing Twilio env vars — never the values
function checkTwilioConfig(): { ok: boolean; missing: string[] } {
  const required: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
    WHATSAPP_TO: process.env.WHATSAPP_TO,
  }
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  return { ok: missing.length === 0, missing }
}

// Safe diagnostic snapshot — no secret values exposed
function twilioConfigDiagnostic() {
  const sid = process.env.TWILIO_ACCOUNT_SID ?? ''
  const token = process.env.TWILIO_AUTH_TOKEN ?? ''
  return {
    twilioAccountSidPrefix: sid ? sid.slice(0, 6) : null,
    twilioFrom: process.env.TWILIO_WHATSAPP_FROM ?? null,
    whatsappTo: process.env.WHATSAPP_TO ?? null,
    hasTwilioAuthToken: token.length > 0,
    twilioAuthTokenLength: token.length > 0 ? token.length : null,
  }
}

// Attempt WhatsApp send — returns structured result, never throws
async function attemptSend(
  messages: WhatsAppMessage[],
  briefingId: string
): Promise<{ sent: boolean; sentReason: SentReason; sentError?: string; messagesSent?: number }> {
  const config = checkTwilioConfig()
  if (!config.ok) {
    const detail = `Missing: ${config.missing.join(', ')}`
    console.warn(`[twilio] Config incomplete — ${detail}`)
    await logEvent({ status: 'warning', step: 'twilio_config_check', metadata: { missing: config.missing } })
    return { sent: false, sentReason: 'missing_twilio_config', sentError: detail }
  }

  try {
    const result = await sendWhatsAppMessages(messages)
    await updateBriefingStatus(briefingId, 'sent', new Date().toISOString())
    await logEvent({
      status: 'sent',
      step: 'whatsapp',
      metadata: { briefingId, messagesSent: result.messagesSent },
    })
    console.log(`[twilio] Sent ${result.messagesSent} messages for briefing ${briefingId}`)
    return { sent: true, sentReason: 'sent', messagesSent: result.messagesSent }
  } catch (err) {
    const errorMsg = serializeError(err)
    console.error(`[twilio] Send failed for briefing ${briefingId}: ${errorMsg}`)
    await updateBriefingStatus(briefingId, 'failed_to_send')
    await handleDeliveryFailure(briefingId, errorMsg)
    return { sent: false, sentReason: 'twilio_error', sentError: errorMsg }
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof RequestBodySchema>
  try {
    const raw = await request.json().catch(() => ({}))
    body = RequestBodySchema.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const startedAt = new Date()
  const briefingDate = getParisDate()
  const topic = getTopicForToday()
  const dateLabel = formatBriefingDate(getParisNow())

  const twilioConfig = checkTwilioConfig()
  const searchMode = (process.env.SEARCH_PROVIDER && process.env.SEARCH_API_KEY) ? 'real' : 'mock'
  console.log(`[test-briefing] send=${body.send} force=${body.force} searchMode=${searchMode} twilioConfigOk=${twilioConfig.ok}`)

  await logEvent({
    status: 'started',
    step: 'test_briefing',
    startedAt,
    metadata: { briefingDate, send: body.send, force: body.force, searchMode, twilioConfigOk: twilioConfig.ok },
  })

  try {
    // ── Reuse existing briefing (only when force:false) ───────────────────────
    if (!body.force) {
      const existing = await getBriefingByDate(briefingDate)

      if (existing) {
        const whatsappMessages = (existing.whatsapp_messages ?? []) as WhatsAppMessage[]

        if (!body.send) {
          return NextResponse.json({
            success: true,
            reused: true,
            briefingId: existing.id,
            briefingDate,
            status: existing.status,
            whatsappMessageCount: whatsappMessages.length,
            sent: false,
            sentReason: 'send_not_requested' as SentReason,
            note: 'Briefing already exists for today. Pass force:true to regenerate.',
            twilioConfig: twilioConfigDiagnostic(),
          })
        }

        if (whatsappMessages.length === 0) {
          return NextResponse.json(
            { error: 'Existing briefing has no whatsapp_messages stored — cannot send.' },
            { status: 422 }
          )
        }

        const sendOutcome = await attemptSend(whatsappMessages, existing.id!)
        return NextResponse.json({
          success: true,
          reused: true,
          briefingId: existing.id,
          briefingDate,
          whatsappMessageCount: whatsappMessages.length,
          ...sendOutcome,
          note: 'Reused existing briefing for today.',
          twilioConfig: twilioConfigDiagnostic(),
        })
      }
    }

    // ── Full pipeline (force:true bypasses reuse) ─────────────────────────────

    // 1. Search sources
    const rawResults = await searchWeb(`${topic.searchFocus} ${dateLabel}`, { maxResults: 12 })
    const scored = scoreSources(rawResults, topic.label)
    const deduped = deduplicateSources(scored)

    // 2. Generate
    const { briefing: generated, aiMode } = await generateBriefing({ dateLabel, topic, sources: deduped })

    // 3. Quality check (one retry allowed)
    const qualityResult = validateBriefingQuality(generated, topic)
    let finalBriefing = generated

    if (!qualityResult.passed) {
      await logEvent({ status: 'warning', step: 'quality_check', metadata: { issues: qualityResult.issues } })
      const { briefing: retried } = await generateBriefing({ dateLabel, topic, sources: deduped })
      const retryQuality = validateBriefingQuality(retried, topic)
      if (retryQuality.passed) {
        finalBriefing = retried
      } else {
        await logEvent({ status: 'failed_quality_check', step: 'quality_check_retry', metadata: { issues: retryQuality.issues } })
        return NextResponse.json(
          { error: 'Quality check failed after retry', issues: retryQuality.issues },
          { status: 422 }
        )
      }
    }

    // 4. Prepare WhatsApp messages
    const whatsappMessages = splitBriefingForWhatsApp(finalBriefing.content)
    const whatsappContent = whatsAppMessagesToString(whatsappMessages)

    // 5. Save to Supabase — upsert when force:true to replace any existing row for today
    const saveFn = body.force ? upsertBriefing : insertBriefing
    const briefingRow = await saveFn({
      briefing_date: briefingDate,
      title: finalBriefing.title,
      content: finalBriefing.content,
      whatsapp_content: whatsappContent,
      whatsapp_messages: whatsappMessages,
      word_count: finalBriefing.wordCount,
      char_count: finalBriefing.charCount,
      status: 'generated',
    })

    await insertSources(
      deduped.slice(0, 10).map((s) => ({
        briefing_id: briefingRow.id!,
        title: s.title,
        url: s.url,
        source_name: s.sourceName,
        published_at: s.publishedAt,
        reliability_score: s.reliabilityScore,
        freshness_score: s.freshnessScore,
        relevance_score: s.relevanceScore,
        business_score: s.businessScore,
        actionability_score: s.actionabilityScore,
        total_score: s.totalScore,
        confidence_level: s.confidenceLevel,
        summary: s.snippet,
      }))
    )

    await insertOpportunity({
      briefing_id: briefingRow.id!,
      title: finalBriefing.opportunity.title,
      description: finalBriefing.opportunity.description,
      category: finalBriefing.opportunity.category,
      potential_score: finalBriefing.opportunity.potentialScore,
      action_suggested: finalBriefing.opportunity.actionSuggested,
    })

    // 6. Send or skip WhatsApp
    let sendOutcome: Awaited<ReturnType<typeof attemptSend>> = {
      sent: false,
      sentReason: 'send_not_requested',
    }

    if (body.send) {
      sendOutcome = await attemptSend(whatsappMessages, briefingRow.id!)
    } else {
      await updateBriefingStatus(briefingRow.id!, 'quality_check_passed')
    }

    await logEvent({ status: 'success', step: 'test_briefing', startedAt, finishedAt: new Date() })

    return NextResponse.json({
      success: true,
      reused: false,
      regenerated: body.force,
      briefingId: briefingRow.id,
      briefingDate,
      topic: topic.label,
      wordCount: finalBriefing.wordCount,
      qualityScore: qualityResult.score,
      whatsappMessageCount: whatsappMessages.length,
      aiMode,
      searchMode,
      sourceCount: deduped.length,
      mainSources: finalBriefing.mainSources.map((s) => ({
        title: s.title,
        url: s.url ?? null,
        sourceName: s.sourceName ?? null,
      })),
      ...sendOutcome,
      briefing: finalBriefing.content,
      twilioConfig: twilioConfigDiagnostic(),
    })
  } catch (err) {
    const errorMsg = serializeError(err)
    await logEvent({ status: 'error', step: 'test_briefing', error: errorMsg, startedAt, finishedAt: new Date() })
    if (err instanceof AIError) {
      return NextResponse.json(
        {
          error: err.code,
          detail: err.message,
          anthropicDiagnostic: {
            errorType: err.detail?.anthropicErrorType ?? null,
            errorMessage: err.detail?.anthropicErrorMessage ?? null,
            modelUsed: err.detail?.model ?? process.env.AI_MODEL ?? 'claude-sonnet-4-6',
            hasAnthropicApiKey: !!process.env.ANTHROPIC_API_KEY,
            anthropicApiKeyLength: process.env.ANTHROPIC_API_KEY?.length ?? 0,
            aiProvider: process.env.AI_PROVIDER ?? 'anthropic',
          },
        },
        { status: err.httpStatus }
      )
    }
    return NextResponse.json({ error: 'Internal server error', detail: errorMsg }, { status: 500 })
  }
}
