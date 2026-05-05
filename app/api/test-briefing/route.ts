import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getParisDate, formatBriefingDate, getTopicForToday, getParisNow } from '@/lib/date'
import { searchWeb } from '@/lib/search'
import { scoreSources, deduplicateSources } from '@/lib/scoring'
import { generateBriefing } from '@/lib/briefing-generator'
import { validateBriefingQuality } from '@/lib/quality'
import { splitBriefingForWhatsApp, whatsAppMessagesToString } from '@/lib/whatsapp-format'
import { sendWhatsAppMessages, handleDeliveryFailure } from '@/lib/twilio'
import { insertBriefing, insertSources, insertOpportunity, updateBriefingStatus } from '@/lib/supabase'
import { logEvent } from '@/lib/logger'

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
    // 1. Search sources
    const rawResults = await searchWeb(`${topic.searchFocus} ${dateLabel}`, { maxResults: 12 })
    const scored = scoreSources(rawResults, topic.label)
    const deduped = deduplicateSources(scored)

    // 2. Generate
    const { briefing: generated, aiMode } = await generateBriefing({ dateLabel, topic, sources: deduped })

    // 3. Quality check
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

    // Save sources
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

    // Save opportunity
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
        const errorMsg = err instanceof Error ? err.message : String(err)
        await updateBriefingStatus(briefingRow.id!, 'failed_to_send')
        await handleDeliveryFailure(briefingRow.id!, errorMsg)
      }
    } else {
      await updateBriefingStatus(briefingRow.id!, 'quality_check_passed')
    }

    await logEvent({ status: 'success', step: 'test_briefing', startedAt, finishedAt: new Date() })

    return NextResponse.json({
      success: true,
      briefingId: briefingRow.id,
      briefingDate,
      topic: topic.label,
      aiMode,
      wordCount: finalBriefing.wordCount,
      qualityScore: qualityResult.score,
      whatsappMessageCount: whatsappMessages.length,
      sent: body.send ? sendResult?.success : false,
      briefing: finalBriefing.content,
      whatsappMessages,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await logEvent({ status: 'error', step: 'test_briefing', error: errorMsg, startedAt, finishedAt: new Date() })
    return NextResponse.json({ error: 'Internal server error', detail: errorMsg }, { status: 500 })
  }
}
