import type { WhatsAppMessage } from '@/types/briefing'

const MAX_CHARS = Number(process.env.MAX_WHATSAPP_CHARS_PER_MESSAGE ?? 1800)
const MAX_MESSAGES = Number(process.env.MAX_WHATSAPP_MESSAGES ?? 9)

// Section markers used to split the briefing content
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

/**
 * Splits a full briefing text into individual WhatsApp messages.
 * Each section becomes its own message; if it exceeds MAX_CHARS it is truncated with a warning.
 * If the number of sections exceeds MAX_MESSAGES, the last sections are merged.
 */
export function splitBriefingForWhatsApp(fullContent: string): WhatsAppMessage[] {
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
      // Content before first section marker → intro
      if (!current) {
        current = { label: 'Introduction', lines: [line] }
      }
    }
  }
  if (current) sections.push(current)

  // If we have more sections than MAX_MESSAGES, merge excess into last message
  const trimmed = sections.length > MAX_MESSAGES
    ? mergeExcessSections(sections, MAX_MESSAGES)
    : sections

  return trimmed.map((section, index) => {
    let content = section.lines.join('\n').trim()

    // Hard truncation as a last resort — should not happen if briefing is ≤1200 words
    if (content.length > MAX_CHARS) {
      content = content.slice(0, MAX_CHARS - 20) + '\n[...suite tronquée]'
    }

    return {
      index: index + 1,
      label: section.label,
      content,
      charCount: content.length,
    }
  })
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

/** Returns the total character count across all WhatsApp messages */
export function totalWhatsAppChars(messages: WhatsAppMessage[]): number {
  return messages.reduce((sum, m) => sum + m.charCount, 0)
}

/** Joins all WhatsApp messages into a single preview string (for Supabase storage) */
export function whatsAppMessagesToString(messages: WhatsAppMessage[]): string {
  return messages.map((m) => m.content).join('\n\n─────────────────\n\n')
}
