import type { GeneratedBriefing, QualityCheckResult } from '@/types/briefing'
import type { TopicConfig } from '@/config/topics'

const MAX_WORDS = Number(process.env.MAX_BRIEFING_WORDS ?? 1200)
const MIN_SOURCES = 3
const MAX_BLOCKS = 8

const REQUIRED_EMOJIS = ['🧠', '🔥', '🤖', '💼', '📈', '🏠', '💡', '🎯']

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Validates the generated briefing against quality criteria.
 * Returns a result with pass/fail status and a list of issues found.
 */
export function validateBriefingQuality(
  briefing: GeneratedBriefing,
  topic: TopicConfig
): QualityCheckResult {
  const issues: string[] = []

  // 1. Word count
  const wordCount = countWords(briefing.content)
  if (wordCount > MAX_WORDS) {
    issues.push(`Briefing trop long : ${wordCount} mots (max ${MAX_WORDS})`)
  }

  // 2. Block count — count emoji section markers
  const presentBlocks = REQUIRED_EMOJIS.filter((e) => briefing.content.includes(e))
  if (presentBlocks.length < MAX_BLOCKS) {
    issues.push(`Blocs manquants : ${MAX_BLOCKS - presentBlocks.length} bloc(s) absent(s) sur ${MAX_BLOCKS}`)
  }

  // 3. Action concrète
  if (!briefing.content.includes('🎯') && !/action\s*:/i.test(briefing.content)) {
    issues.push('Aucune action concrète détectée (bloc 🎯 manquant ou incomplet)')
  }

  // 4. Question de réflexion
  if (!/question\s*:/i.test(briefing.content) && !briefing.content.includes('?')) {
    issues.push('Aucune question de réflexion détectée')
  }

  // 5. Sources
  if (briefing.mainSources.length < MIN_SOURCES) {
    issues.push(`Seulement ${briefing.mainSources.length} source(s) citée(s) — minimum recommandé : ${MIN_SOURCES}`)
  }

  // 6. Conseil financier affirmatif — patterns à éviter
  const financialAdvicePatterns = [
    /vous devez acheter/i,
    /achetez maintenant/i,
    /garantit un rendement/i,
    /investissement sans risque/i,
  ]
  for (const pattern of financialAdvicePatterns) {
    if (pattern.test(briefing.content)) {
      issues.push(`Conseil financier trop affirmatif détecté : "${pattern.source}"`)
    }
  }

  // 7. Hypothesis présentée comme fait — heuristique simple
  const hypPatterns = [/il est certain que/i, /c'est garanti/i, /sans aucun doute/i]
  for (const pattern of hypPatterns) {
    if (pattern.test(briefing.content)) {
      issues.push(`Hypothèse présentée comme un fait : "${pattern.source}"`)
    }
  }

  // 8. Thème prioritaire du jour présent
  const topicKeywords = topic.label.toLowerCase().split(/[/\s]+/).filter((w) => w.length > 3)
  const contentLower = briefing.content.toLowerCase()
  const topicFound = topicKeywords.some((kw) => contentLower.includes(kw))
  if (!topicFound) {
    issues.push(`Thème prioritaire du jour "${topic.label}" non détecté dans le briefing`)
  }

  // 9. Formulations trop générales
  const vaguePatterns = [
    /tout le monde sait que/i,
    /de nombreuses personnes pensent/i,
    /selon certaines sources/i,
  ]
  for (const pattern of vaguePatterns) {
    if (pattern.test(briefing.content)) {
      issues.push(`Formulation trop vague : "${pattern.source}"`)
    }
  }

  const passed = issues.length === 0
  // Score: 100 minus 10 per issue, minimum 0
  const score = Math.max(0, 100 - issues.length * 10)

  return { passed, issues, score }
}
