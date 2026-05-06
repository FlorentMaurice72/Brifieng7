import type { WhatsAppMessage } from '@/types/briefing'

// Twilio hard limit is 1600. Default to 1400 for a safe margin.
const TWILIO_HARD_LIMIT = 1599
const MAX_CHARS = Math.min(
  Number(process.env.MAX_WHATSAPP_CHARS_PER_MESSAGE ?? 1400),
  TWILIO_HARD_LIMIT
)
const MAX_MESSAGES = Number(process.env.MAX_WHATSAPP_MESSAGES ?? 9)

const SECTION_EMOJI_PREFIXES = [
  { emoji: '🧠', label: 'À apprendre aujourd\'hui' },
  { emoji: '🔥', label: 'Thème prioritaire du jour' },
  { emoji: '🤖', label: 'Signal IA' },
  { emoji: '💼', label: 'Signal business' },
  { emoji: '📈', label: 'Signal investissement / patrimoine' },
  { emoji: '🏠', label: 'Signal immobilier / économie' },
  { emoji: '💡', label: 'Opportunité du jour' },
  { emoji: '🎯', label: 'Action + question du jour' },
  { emoji: '☀️', label: 'Introduction' },
]

function splitAtWordBoundary(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const chunks: string[] = []
  let remaining = text.trim()

  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf('\n', maxChars)
    if (splitAt <= 0) splitAt = remaining.lastIndexOf(' ', maxChars)
    if (splitAt <= 0) splitAt = maxChars
    chunks.push(remaining.slice(0, splitAt).trimEnd())
    remaining = remaining.slice(splitAt).trimStart()
  }
  if (remaining.length > 0) chunks.push(remaining)
  return chunks
}

export interface SplitBriefingResult {
  messages: WhatsAppMessage[]
  oversizedOriginalIndices: number[]
}

export function splitBriefingForWhatsApp(fullContent: string): SplitBriefingResult {
  const lines = fullContent.split('\n')
  const sections: { label: string; lines: string[] }[] = []
  let current: { label: string; lines: string[] } | null = null

  for (const line of lines) {
    const sectionMatch = SECTION_EMOJI_PREFIXES.find(
      (s) => line.startsWith(s.emoji) || line.includes(s.emoji)
    )

    if (sectionMatch) {
      if (current) sections.push(current)
      current = { label: sectionMatch.label, lines: [line] }
    } else if (current) {
      current.lines.push(line)
    } else {
      current = { label: 'Introduction', lines: [line] }
    }
  }
  if (current) sections.push(current)

  const trimmed = sections.length > MAX_MESSAGES
    ? mergeExcessSections(sections, MAX_MESSAGES)
    : sections

  const messages: WhatsAppMessage[] = []
  const oversizedOriginalIndices: number[] = []
  let messageIndex = 0

  for (let i = 0; i < trimmed.length; i++) {
    const section = trimmed[i]
    const content = section.lines.join('\n').trim()

    if (content.length <= MAX_CHARS) {
      messageIndex++
      messages.push({ index: messageIndex, label: section.label, content, charCount: content.length })
    } else {
      oversizedOriginalIndices.push(i + 1)
      const chunks = splitAtWordBoundary(content, MAX_CHARS)
      const total = chunks.length

      chunks.forEach((chunk, ci) => {
        messageIndex++
        const finalContent = ci === 0
          ? chunk
          : `_(suite ${ci + 1}/${total})_\n\n${chunk}`
        const label = ci === 0
          ? section.label
          : `${section.label} (suite ${ci + 1}/${total})`
        messages.push({
          index: messageIndex,
          label,
          content: finalContent,
          charCount: finalContent.length,
        })
      })
    }
  }

  return { messages, oversizedOriginalIndices }
}

function mergeExcessSections(
  sections: { label: string; lines: string[] }[],
  max: number
): { label: string; lines: string[] }[] {
  const head = sections.slice(0, max - 1)
  const tail = sections.slice(max - 1)
  const merged = {
    label: tail[0].label,
    lines: tail.flatMap((s) => [...s.lines, '']),
  }
  return [...head, merged]
}

export function totalWhatsAppChars(messages: WhatsAppMessage[]): number {
  return messages.reduce((sum, m) => sum + m.charCount, 0)
}

export function whatsAppMessagesToString(messages: WhatsAppMessage[]): string {
  return messages.map((m) => m.content).join('\n\n─────────────────\n\n')
}
