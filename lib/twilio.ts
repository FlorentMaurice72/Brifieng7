import type { WhatsAppMessage } from '@/types/briefing'

export interface TwilioSendResult {
  success: boolean
  messagesSent: number
  sids: string[]
  error?: string
}

/**
 * Sends a sequence of WhatsApp messages via Twilio.
 * Each message in the array is sent sequentially to preserve ordering.
 */
export async function sendWhatsAppMessages(messages: WhatsAppMessage[]): Promise<TwilioSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_WHATSAPP_FROM
  const to = process.env.WHATSAPP_TO

  if (!accountSid || !authToken || !from || !to) {
    throw new Error('Missing Twilio environment variables (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, WHATSAPP_TO)')
  }

  // Lazily import twilio so it doesn't break builds without the package installed
  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)

  const sids: string[] = []

  for (const msg of messages) {
    const message = await client.messages.create({
      from,
      to,
      body: msg.content,
    })
    sids.push(message.sid)
  }

  return {
    success: true,
    messagesSent: sids.length,
    sids,
  }
}

/**
 * Minimal fallback called when WhatsApp delivery fails.
 * In V1, this only logs and archives. Email or other channels can be added later.
 */
export async function handleDeliveryFailure(briefingId: string, error: string): Promise<void> {
  // Import here to avoid circular dependencies
  const { insertLog } = await import('@/lib/supabase')
  await insertLog({
    run_date: new Date().toISOString().slice(0, 10),
    status: 'failed_to_send',
    step: 'whatsapp_delivery',
    error_message: error,
    metadata: { briefing_id: briefingId },
  })
  console.error(`[twilio] Delivery failure for briefing ${briefingId}: ${error}`)
}
