import { getTopicConfig } from '@/config/topics'
import type { TopicConfig } from '@/config/topics'

const PARIS_TZ = 'Europe/Paris'
const SEND_HOUR_PARIS = 7

/** Returns the current Date object in Paris timezone context */
export function getParisNow(): Date {
  // Intl gives us Paris wall-clock time; we rebuild a Date with those values
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Note: month is 1-based from Intl
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
}

/** Returns today's date string in Paris timezone (YYYY-MM-DD) */
export function getParisDate(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: PARIS_TZ }).format(new Date())
}

/** Returns the current hour (0-23) in Paris timezone */
export function getParisHour(): number {
  return getParisNow().getHours()
}

/** Returns the TopicConfig for the current day in Paris timezone */
export function getTopicForToday(): TopicConfig {
  return getTopicConfig(getParisNow())
}

/**
 * Returns true only if Paris local time is exactly the send hour (7h).
 * The cron fires at 05:00 UTC and 06:00 UTC to cover DST transitions;
 * this guard ensures we only proceed at the correct local time.
 */
export function shouldSendBriefingNow(): boolean {
  return getParisHour() === SEND_HOUR_PARIS
}

/** Formats a Date for display in the briefing header (e.g. "Lundi 3 mai 2026") */
export function formatBriefingDate(date?: Date): string {
  const d = date ?? getParisNow()
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}
