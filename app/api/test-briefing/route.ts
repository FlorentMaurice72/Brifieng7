import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getParisDate, formatBriefingDate, getTopicForToday, getParisNow } from '@/lib/date'
import { searchWeb } from '@/lib/search'
import { scoreSources, deduplicateSources } from '@/lib/scoring'
import { generateBriefing } from '@/lib/briefing-generator'
import { validateBriefingQuality } from '@/lib/quality'
import { splitBriefingForWhatsApp, whatsAppMessagesToString } from '@/lib/whatsapp-format'
import { sendWhatsAppMessages, handleDeliveryFailure } from '@/lib/twilio'
import {
  getBriefingByDate,
  insertBriefing,
  insertSources,
  insertOpportunity,
  updateBriefingStatus,
} from '@/lib/supabase'
import { logEvent } from '@/lib/logger'
import type { WhatsAppMessage } from '@/types/briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RequestBodySchema = z.object({
  send: z.boolean().optional().default(false),
})

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// Serialize any error type to a readable string — avoids "[object Object]"
function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    // Supabase PostgrestError shape: { message, details, hint, code }
    const e = err as Record<string, unknown>
    if (e.message) return String(e.message)
    try { return JSON.stringify(err) } catch { /* fallthrough */ }
  }
  return String(err)
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

  await logEvent({ status: 'started', step: 'test_briefing', startedAt, metadata: { briefingDate, send: body.send } })

  try {
    // ── Check if a briefing already exists for today ──────────────────────────
    const existing = await getBriefingByDate(briefingDate)

    if (existing) {
      // Reuse the existing briefing — skip generation and Supabase writes
      const whatsappMessages = (existing.whatsapp_messages ?? []) as WhatsAppMessage[]

      if (body.send) {
        if (whatsappMessages.length === 0) {
          return NextResponse.json(
            { error: 'Existing briefing has no whatsapp_messages stored — cannot send.' },
            { status: 422 }
          )
        }
        try {
          const sendResult = await sendWhatsAppMessages(whatsappMessages)
          await updateBriefingStatus(existing.id!, 'sent', new Date().toISOString())
          await logEvent({ status: 'sent', step: 'whatsapp_reuse', metadata: { briefingId: existing.id, messagesSent: sendResult.messagesSent } })
          return NextResponse.json({
            success: true,
            reused: true,
            briefingId: existing.id,
            briefingDate,
            whatsappMessageCount: whatsappMessages.length,
            sent: true,
            note: 'Reused existing briefing for today.',
          })
        } catch (err) {
          const errorMsg = serializeError(err)
          await updateBriefingStatus(existing.id!, 'failed_to_send')
          await handleDeliveryFailure(existing.id!, errorMsg)
          return NextResponse.json({ error: 'WhatsApp send failed', detail: errorMsg }, { status: 502 })
        }
      }

      // send:false — just return the existing briefing info
      return NextResponse.json({
        success: true,
        reused: true,
        briefingId: existing.id,
        briefingDate,
        status: existing.status,
        whatsappMessageCount: whatsappMessages.length,
        sent: false,
        note: 'Briefing already exists for today. Pass send:true to send it.',
      })
    }

    // ── No existing briefing — run full pipeline ──────────────────────────────

    // 1. Search sources
    const rawResults = await searchWeb(`${topic.searchFocus} ${dateLabel}`, { maxResults: 12 })
    const scored = scoreSources(rawResults, topic.label)
    const deduped = deduplicateSources(scored)

    // 2. Generate
    const generated = await generateBriefing({ dateLabel, topic, sources: deduped })

    // 3. Quality check
    const qualityResult = validateBriefingQuality(generated, topic)
    let finalBriefing = generated

    if (!qualityResult.passed) {
      await logEvent({ status: 'warning', step: 'quality_check', metadata: { issues: qualityResult.issues } })
      const retried = await generateBriefing({ dateLabel, topic, sources: deduped })
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

    // 5. Save to Supabase
    const briefingRow = await insertBriefing({
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

    // 6. Optionally send on WhatsApp
    let sendResult = null
    if (body.send) {
      try {
        sendResult = await sendWhatsAppMessages(whatsappMessages)
        await updateBriefingStatus(briefingRow.id!, 'sent', new Date().toISOString())
        await logEvent({ status: 'sent', step: 'whatsapp', metadata: { messagesSent: sendResult.messagesSent } })
      } catch (err) {
        const errorMsg = serializeError(err)
        await updateBriefingStatus(briefingRow.id!, 'failed_to_send')
        await handleDeliveryFailure(briefingRow.id!, errorMsg)
      }
    } else {
      await updateBriefingStatus(briefingRow.id!, 'quality_check_passed')
    }

    await logEvent({ status: 'success', step: 'test_briefing', startedAt, finishedAt: new Date() })

    return NextResponse.json({
      success: true,
      reused: false,
      briefingId: briefingRow.id,
      briefingDate,
      topic: topic.label,
      wordCount: finalBriefing.wordCount,
      qualityScore: qualityResult.score,
      whatsappMessageCount: whatsappMessages.length,
      sent: body.send ? sendResult?.success ?? false : false,
      briefing: finalBriefing.content,
      whatsappMessages,
    })
  } catch (err) {
    const errorMsg = serializeError(err)
    await logEvent({ status: 'error', step: 'test_briefing', error: errorMsg, startedAt, finishedAt: new Date() })
    return NextResponse.json({ error: 'Internal server error', detail: errorMsg }, { status: 500 })
  }
}
