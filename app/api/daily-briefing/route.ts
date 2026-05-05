import { NextRequest, NextResponse } from 'next/server'
import { getParisDate, formatBriefingDate, getTopicForToday, shouldSendBriefingNow, getParisNow } from '@/lib/date'
import { searchWeb } from '@/lib/search'
import { scoreSources, deduplicateSources } from '@/lib/scoring'
import { generateBriefing, AIError } from '@/lib/briefing-generator'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Allow up to 5 minutes for the full pipeline
export const maxDuration = 300

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date()
  const briefingDate = getParisDate()

  await logEvent({ status: 'started', step: 'cron_daily_briefing', startedAt, metadata: { briefingDate } })

  // 1. Time guard — only send at 7h Paris
  if (!shouldSendBriefingNow()) {
    const parisHour = getParisNow().getHours()
    await logEvent({
      status: 'skipped',
      step: 'time_check',
      metadata: { reason: 'Not 7h Paris', currentParisHour: parisHour },
    })
    return NextResponse.json({
      skipped: true,
      reason: `Not send time. Current Paris hour: ${parisHour}`,
    })
  }

  // 2. Anti-duplicate guard — one briefing per day
  const existing = await getBriefingByDate(briefingDate).catch(() => null)
  if (existing && ['sent', 'quality_check_passed'].includes(existing.status)) {
    await logEvent({
      status: 'skipped',
      step: 'duplicate_check',
      metadata: { reason: 'Briefing already sent today', existingId: existing.id },
    })
    return NextResponse.json({ skipped: true, reason: 'Briefing already sent today' })
  }

  const topic = getTopicForToday()
  const dateLabel = formatBriefingDate(getParisNow())

  try {
    // 3. Collect and score sources
    await logEvent({ status: 'started', step: 'search' })
    let rawResults: Awaited<ReturnType<typeof searchWeb>> = []
    try {
      rawResults = await searchWeb(`${topic.searchFocus} ${briefingDate}`, { maxResults: 15 })
    } catch (searchError) {
      await logEvent({ status: 'warning', step: 'search', error: searchError instanceof Error ? searchError.message : String(searchError) })
      // Continue with empty sources — generator will fall back to its knowledge
    }

    const scored = scoreSources(rawResults, topic.label)
    const deduped = deduplicateSources(scored)
    await logEvent({ status: 'success', step: 'search', metadata: { rawCount: rawResults.length, dedupedCount: deduped.length } })

    // 4. Generate briefing
    await logEvent({ status: 'started', step: 'generation' })
    let { briefing: generated } = await generateBriefing({ dateLabel, topic, sources: deduped })
    await logEvent({ status: 'success', step: 'generation', metadata: { wordCount: generated.wordCount } })

    // 5. Quality check (with one retry)
    await logEvent({ status: 'started', step: 'quality_check' })
    let qualityResult = validateBriefingQuality(generated, topic)

    if (!qualityResult.passed) {
      await logEvent({ status: 'warning', step: 'quality_check', metadata: { issues: qualityResult.issues } })
      ;({ briefing: generated } = await generateBriefing({ dateLabel, topic, sources: deduped }))
      qualityResult = validateBriefingQuality(generated, topic)

      if (!qualityResult.passed) {
        await logEvent({ status: 'failed_quality_check', step: 'quality_check_retry', metadata: { issues: qualityResult.issues } })
        // Save failure record
        await insertBriefing({
          briefing_date: briefingDate,
          title: `[FAILED] Briefing 7 — ${dateLabel}`,
          content: '',
          status: 'failed_quality_check',
        }).catch(() => null)
        return NextResponse.json({ error: 'Quality check failed', issues: qualityResult.issues }, { status: 422 })
      }
    }
    await logEvent({ status: 'success', step: 'quality_check', metadata: { score: qualityResult.score } })

    // 6. Prepare WhatsApp messages
    const whatsappMessages = splitBriefingForWhatsApp(generated.content)
    const whatsappContent = whatsAppMessagesToString(whatsappMessages)

    // 7. Archive to Supabase
    await logEvent({ status: 'started', step: 'archive' })
    const briefingRow = await insertBriefing({
      briefing_date: briefingDate,
      title: generated.title,
      content: generated.content,
      whatsapp_content: whatsappContent,
      whatsapp_messages: whatsappMessages,
      word_count: generated.wordCount,
      char_count: generated.charCount,
      status: 'quality_check_passed',
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
      title: generated.opportunity.title,
      description: generated.opportunity.description,
      category: generated.opportunity.category,
      potential_score: generated.opportunity.potentialScore,
      action_suggested: generated.opportunity.actionSuggested,
    })

    await logEvent({ status: 'success', step: 'archive', metadata: { briefingId: briefingRow.id } })

    // 8. Send on WhatsApp
    await logEvent({ status: 'started', step: 'whatsapp_send' })
    try {
      const sendResult = await sendWhatsAppMessages(whatsappMessages)
      await updateBriefingStatus(briefingRow.id!, 'sent', new Date().toISOString())
      await logEvent({
        status: 'sent',
        step: 'whatsapp_send',
        finishedAt: new Date(),
        metadata: { messagesSent: sendResult.messagesSent, sids: sendResult.sids },
      })
    } catch (sendError) {
      const errorMsg = sendError instanceof Error ? sendError.message : String(sendError)
      await updateBriefingStatus(briefingRow.id!, 'failed_to_send')
      await handleDeliveryFailure(briefingRow.id!, errorMsg)
      await logEvent({ status: 'error', step: 'whatsapp_send', error: errorMsg })
    }

    await logEvent({ status: 'success', step: 'cron_daily_briefing', startedAt, finishedAt: new Date() })

    return NextResponse.json({
      success: true,
      briefingId: briefingRow.id,
      briefingDate,
      topic: topic.label,
      wordCount: generated.wordCount,
      qualityScore: qualityResult.score,
      whatsappMessageCount: whatsappMessages.length,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await logEvent({ status: 'error', step: 'cron_daily_briefing', error: errorMsg, startedAt, finishedAt: new Date() })
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.code, detail: err.message }, { status: err.httpStatus })
    }
    return NextResponse.json({ error: 'Pipeline error', detail: errorMsg }, { status: 500 })
  }
}
