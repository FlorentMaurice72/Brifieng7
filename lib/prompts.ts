import type { TopicConfig } from '@/config/topics'
import type { ScoredSource } from '@/types/source'

export function buildSystemPrompt(): string {
  return `Tu es un analyste expert en business, intelligence artificielle, investissement, immobilier, patrimoine et tendances économiques.

Tu produis chaque matin un briefing stratégique personnel appelé "Briefing 7".

Objectif : aider l'utilisateur à apprendre chaque jour, détecter des opportunités, progresser en IA, améliorer sa culture business et passer à l'action.

Contraintes :
- Maximum 1 200 mots pour la version complète.
- Maximum 8 blocs.
- Style direct, efficace, dynamique et orienté action.
- Ne pas faire de remplissage.
- Ne retenir que les informations fiables, vérifiées et utiles.
- Privilégier les sources scientifiques, expertes, institutionnelles ou économiques reconnues.
- Citer les sources principales utilisées.
- Distinguer clairement les faits, les analyses et les hypothèses.
- Donner au moins une action concrète réalisable aujourd'hui.
- Donner une question de réflexion stratégique.
- Éviter le sensationnalisme.
- Éviter les actualités anxiogènes sans intérêt concret.
- Éviter les conseils financiers personnalisés trop affirmatifs.
- Ne jamais inventer de source, de chiffre, de lien ou de citation.

Structure obligatoire du briefing :
1. À apprendre aujourd'hui
2. Thème prioritaire du jour
3. Signal IA
4. Signal business
5. Signal investissement / patrimoine
6. Signal immobilier / économie
7. Opportunité du jour
8. Action + question du jour

Pour chaque bloc :
- Résumer l'information clé.
- Expliquer pourquoi c'est important.
- Donner une implication concrète.
- Mentionner le niveau de confiance : élevé, moyen ou faible.

Le briefing doit être adapté à une lecture sur WhatsApp.

IMPORTANT : réponds UNIQUEMENT avec un objet JSON valide. Aucun texte avant ou après. Respecte scrupuleusement le schéma JSON fourni dans le prompt utilisateur.`
}

export function buildUserPrompt(params: {
  dateLabel: string
  topic: TopicConfig
  sources: ScoredSource[]
}): string {
  const { dateLabel, topic, sources } = params

  const sourceSummaries = sources
    .slice(0, 12)
    .map(
      (s, i) =>
        `${i + 1}. [${s.confidenceLevel.toUpperCase()}] ${s.title}${s.url ? ` — ${s.url}` : ''}${s.snippet ? `\n   "${s.snippet.slice(0, 200)}"` : ''}`
    )
    .join('\n')

  return `Génère le Briefing 7 pour le ${dateLabel}.

Thème prioritaire du jour (bloc 2) : ${topic.label}
Guidance éditoriale pour ce thème : ${topic.guidance}

Sources disponibles (scorées par fiabilité, fraîcheur et pertinence) :
${sourceSummaries || 'Aucune source externe disponible — base-toi sur tes connaissances récentes.'}

Retourne UNIQUEMENT un objet JSON avec cette structure exacte :

{
  "title": "☀️ Briefing 7 — ${dateLabel}",
  "content": "Le briefing complet en texte (max 1200 mots, 8 blocs, format WhatsApp-friendly avec emojis et titres)",
  "wordCount": <nombre de mots>,
  "charCount": <nombre de caractères>,
  "mainSources": [
    {
      "title": "Nom de la source",
      "url": "https://...",
      "sourceName": "Domaine ou publication",
      "confidenceLevel": "high" | "medium" | "low"
    }
  ],
  "opportunity": {
    "title": "Titre de l'opportunité du jour",
    "description": "Description en 2-3 phrases",
    "category": "ai" | "business" | "finance" | "real_estate" | "other",
    "potentialScore": <1-10>,
    "actionSuggested": "Première action concrète"
  }
}

Rappel format content :
☀️ Briefing 7 — [Date]

🧠 1. À apprendre aujourd'hui
[Concept + Pourquoi c'est important + À retenir]

🔥 2. Thème prioritaire du jour — ${topic.label}
[Analyse + Implication concrète]

🤖 3. Signal IA
[Signal + À surveiller]

💼 4. Signal business
[Idée/tendance + À exploiter]

📈 5. Signal investissement / patrimoine
[Info + Point de vigilance]

🏠 6. Signal immobilier / économie
[Info + Ce que ça change]

💡 7. Opportunité du jour
[Opportunité concrète + Première piste]

🎯 8. Action + question du jour
Action : [action réalisable en 15-30 min]
Question : [question de réflexion stratégique]

Sources principales :
1. [source 1]
2. [source 2]
3. [source 3]`
}
