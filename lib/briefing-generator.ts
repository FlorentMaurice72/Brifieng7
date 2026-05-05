import { z } from 'zod'
import { GeneratedBriefingSchema, type GeneratedBriefing } from '@/types/briefing'
import type { ScoredSource } from '@/types/source'
import type { TopicConfig } from '@/config/topics'
import { buildSystemPrompt, buildUserPrompt } from '@/lib/prompts'
import { logUsage } from '@/lib/usage'

// ── AI error classification ───────────────────────────────────────────────────

export type AIErrorCode =
  | 'anthropic_auth_error'
  | 'anthropic_model_invalid'
  | 'anthropic_rate_limit'
  | 'anthropic_request_error'
  | 'anthropic_server_error'

export interface AIErrorDetail {
  anthropicErrorType?: string
  anthropicErrorMessage?: string
  model?: string
}

export class AIError extends Error {
  readonly code: AIErrorCode
  readonly httpStatus: number
  readonly detail?: AIErrorDetail
  constructor(code: AIErrorCode, message: string, httpStatus: number, detail?: AIErrorDetail) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.httpStatus = httpStatus
    this.detail = detail
  }
}

export interface GenerateBriefingResult {
  briefing: GeneratedBriefing
  aiMode: 'real' | 'mock'
}

// ── AI provider abstraction ───────────────────────────────────────────────────

interface AIMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AIResponse {
  content: string
  inputTokens?: number
  outputTokens?: number
}

async function callAnthropic(system: string, messages: AIMessage[]): Promise<AIResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = process.env.AI_MODEL ?? 'claude-sonnet-4-6'

  try {
    const response = await client.messages.create({ model, max_tokens: 4096, system, messages })
    const content = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return { content, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    // Extract the parsed Anthropic error body (available on SDK APIError as .error)
    const body = (err as { error?: { error?: { type?: string; message?: string } } }).error
    const anthropicErrorType = body?.error?.type ?? undefined
    const anthropicErrorMessage = body?.error?.message ?? undefined
    const detail: AIErrorDetail = { anthropicErrorType, anthropicErrorMessage, model }

    if (status === 401) throw new AIError('anthropic_auth_error',
      'Anthropic API key invalid or missing (HTTP 401) — check ANTHROPIC_API_KEY in Vercel env vars', 401, detail)
    if (status === 403) throw new AIError('anthropic_request_error',
      `Anthropic permission denied (HTTP 403): ${anthropicErrorMessage ?? 'see detail'}`, 403, detail)
    if (status === 404) throw new AIError('anthropic_model_invalid',
      `Model not found: "${model}" (HTTP 404) — check AI_MODEL env var`, 404, detail)
    if (status === 400) {
      // Some API versions return 400 for invalid model names — detect and reclassify
      const isModelError = anthropicErrorMessage?.toLowerCase().includes('model') ?? false
      const code = isModelError ? 'anthropic_model_invalid' : 'anthropic_request_error'
      throw new AIError(code,
        `Anthropic 400: ${anthropicErrorType ?? 'invalid_request_error'} — ${anthropicErrorMessage ?? 'see detail'}`,
        400, detail)
    }
    if (status === 429) throw new AIError('anthropic_rate_limit',
      'Anthropic rate limit exceeded (HTTP 429) — retry later', 429, detail)
    if (status && status >= 500) throw new AIError('anthropic_server_error',
      `Anthropic server error (HTTP ${status}): ${anthropicErrorMessage ?? 'see detail'}`, 500, detail)
    if (status) throw new AIError('anthropic_request_error',
      `Anthropic API error (HTTP ${status}): ${anthropicErrorMessage ?? 'see detail'}`, status, detail)
    throw err
  }
}

async function callOpenAI(system: string, messages: AIMessage[]): Promise<AIResponse> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const response = await client.chat.completions.create({
    model: process.env.AI_MODEL ?? 'gpt-4o',
    messages: [{ role: 'system', content: system }, ...messages],
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message.content ?? ''
  return {
    content,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
  }
}

async function callAI(system: string, userMessage: string): Promise<AIResponse> {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'
  const messages: AIMessage[] = [{ role: 'user', content: userMessage }]

  if (provider === 'openai') return callOpenAI(system, messages)
  return callAnthropic(system, messages)
}

// ── Mock generator (when no API key is configured) ────────────────────────────

function buildMockBriefing(dateLabel: string, topic: TopicConfig): GeneratedBriefing {
  const content = `☀️ Briefing 7 — ${dateLabel}

🧠 1. À apprendre aujourd'hui
[MOCK] Concept de test : ceci est un briefing de démonstration généré sans API.
Pourquoi c'est important : pour valider la structure du pipeline.
À retenir : les données mock ne doivent jamais être envoyées en production.

🔥 2. Thème prioritaire du jour — ${topic.label}
[MOCK] Analyse fictive du thème ${topic.label}.
Implication concrète : configuration du système validée.

🤖 3. Signal IA
[MOCK] Signal IA de test.
À surveiller : connecter une vraie clé API.

💼 4. Signal business
[MOCK] Signal business de test.
À exploiter : configurer AI_PROVIDER et SEARCH_PROVIDER.

📈 5. Signal investissement / patrimoine
[MOCK] Signal investissement de test.
Point de vigilance : ceci n'est pas un vrai briefing.

🏠 6. Signal immobilier / économie
[MOCK] Signal immobilier de test.
Ce que ça change : rien, c'est un mock.

💡 7. Opportunité du jour
[MOCK] Opportunité fictive de test.
Première piste : configurer les vraies APIs.

🎯 8. Action + question du jour
Action : Configurer les variables d'environnement dans .env
Question : Quelles APIs vais-je brancher en premier ?

Sources principales :
1. [MOCK] Source fictive 1 — example.com
2. [MOCK] Source fictive 2 — example.org
3. [MOCK] Source fictive 3 — example.net`

  return {
    title: `☀️ Briefing 7 — ${dateLabel}`,
    content,
    wordCount: content.split(/\s+/).length,
    charCount: content.length,
    mainSources: [
      { title: '[MOCK] Source 1', url: 'https://example.com', sourceName: 'Example', confidenceLevel: 'low' },
      { title: '[MOCK] Source 2', url: 'https://example.org', sourceName: 'Example', confidenceLevel: 'low' },
      { title: '[MOCK] Source 3', url: 'https://example.net', sourceName: 'Example', confidenceLevel: 'low' },
    ],
    opportunity: {
      title: '[MOCK] Opportunité de test',
      description: 'Ceci est une opportunité fictive générée en mode mock.',
      category: 'other',
      potentialScore: 5,
      actionSuggested: 'Configurer les vraies APIs',
    },
  }
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateBriefing(params: {
  dateLabel: string
  topic: TopicConfig
  sources: ScoredSource[]
}): Promise<GenerateBriefingResult> {
  const provider = process.env.AI_PROVIDER
  const hasApiKey =
    (provider === 'openai' && !!process.env.OPENAI_API_KEY) ||
    (provider !== 'openai' && !!process.env.ANTHROPIC_API_KEY)

  if (!hasApiKey) {
    console.warn('[briefing-generator] No AI API key configured — returning mock briefing')
    return { briefing: buildMockBriefing(params.dateLabel, params.topic), aiMode: 'mock' }
  }

  const system = buildSystemPrompt()
  const userMessage = buildUserPrompt(params)

  async function attempt(): Promise<GeneratedBriefing> {
    const response = await callAI(system, userMessage)

    await logUsage({
      provider: process.env.AI_PROVIDER ?? 'anthropic',
      operation: 'generate_briefing',
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    })

    const json = response.content.replace(/^```json?\n?/, '').replace(/```$/, '').trim()
    const parsed = JSON.parse(json)
    return GeneratedBriefingSchema.parse(parsed)
  }

  // First attempt
  try {
    const briefing = await attempt()
    return { briefing, aiMode: 'real' }
  } catch (firstError) {
    if (firstError instanceof AIError) throw firstError
    console.warn('[briefing-generator] First attempt failed, retrying…', firstError)
  }

  // Single retry
  try {
    const briefing = await attempt()
    return { briefing, aiMode: 'real' }
  } catch (secondError) {
    if (secondError instanceof AIError) throw secondError
    throw new Error(`Briefing generation failed after 2 attempts: ${secondError}`)
  }
}
