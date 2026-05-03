// Weekly editorial rotation: each day of the week has a priority theme
// used for the "Thème prioritaire du jour" section (bloc 2).

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface TopicConfig {
  day: DayOfWeek
  /** Short key used in logs and prompts */
  key: string
  /** Human-readable label (French) */
  label: string
  /** Guidance injected into the AI prompt for the priority bloc */
  guidance: string
  /** Search query enrichment for this topic */
  searchFocus: string
}

export const weeklyTopics: Record<DayOfWeek, TopicConfig> = {
  monday: {
    day: 'monday',
    key: 'ai_automation',
    label: 'IA & automatisation',
    guidance:
      "Approfondis un sujet d'intelligence artificielle ou d'automatisation. Mets en avant un outil, une avancée récente ou un cas d'usage concret applicable rapidement.",
    searchFocus: 'intelligence artificielle automatisation outil IA 2024 2025',
  },
  tuesday: {
    day: 'tuesday',
    key: 'business_entrepreneurship',
    label: 'Business / entrepreneuriat',
    guidance:
      'Approfondis un sujet business ou entrepreneurial. Modèle économique, stratégie de croissance, étude de cas ou tendance de marché émergente.',
    searchFocus: 'business startup entrepreneuriat stratégie modèle économique',
  },
  wednesday: {
    day: 'wednesday',
    key: 'investment_markets',
    label: 'Investissement / marchés',
    guidance:
      'Approfondis un sujet sur les marchés financiers, les actifs, les taux ou la macroéconomie. Donne une analyse actionnable sans conseil personnalisé.',
    searchFocus: 'investissement marchés financiers taux bourse macroéconomie',
  },
  thursday: {
    day: 'thursday',
    key: 'real_estate_patrimoine',
    label: 'Immobilier / patrimoine',
    guidance:
      "Approfondis un sujet immobilier ou patrimonial. Tendance des prix, fiscalité, financement, gestion de patrimoine ou opportunité spécifique.",
    searchFocus: 'immobilier patrimoine fiscalité financement taux crédit France',
  },
  friday: {
    day: 'friday',
    key: 'business_opportunities',
    label: 'Opportunités business concrètes',
    guidance:
      "Identifie et analyse une opportunité business concrète et exploitable. Décris le marché, l'angle d'attaque et les premières étapes.",
    searchFocus: 'opportunité business niche marché tendance émergente idée entreprise',
  },
  saturday: {
    day: 'saturday',
    key: 'strategic_learning',
    label: 'Apprentissage stratégique',
    guidance:
      'Approfondir un concept stratégique, un framework ou une compétence clé. Explique-le simplement et donne un exemple concret.',
    searchFocus: 'concept stratégie framework compétence apprentissage développement',
  },
  sunday: {
    day: 'sunday',
    key: 'weekly_synthesis',
    label: 'Synthèse hebdomadaire & plan d\'action',
    guidance:
      'Fais une synthèse des grandes tendances de la semaine. Propose un plan d\'action clair pour la semaine suivante sur 3 axes : IA, business, patrimoine.',
    searchFocus: 'bilan semaine tendances synthèse stratégie plan action',
  },
}

// Map JS Date.getDay() (0=Sunday … 6=Saturday) to DayOfWeek keys
const JS_DAY_TO_KEY: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export function getTopicConfig(date: Date): TopicConfig {
  const dayKey = JS_DAY_TO_KEY[date.getDay()]
  return weeklyTopics[dayKey]
}
