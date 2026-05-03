# Briefing 7

> V1 — Mai 2026

Outil personnel de veille stratégique automatisée. Génère chaque matin à **7h00 (heure Paris)** un briefing synthétique sur l'IA, le business, l'investissement et l'immobilier, puis l'envoie sur **WhatsApp via Twilio** et l'archive dans **Supabase**.

---

## Stack

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 15 (App Router) |
| Langage | TypeScript |
| Déploiement | Vercel |
| Automatisation | Vercel Cron Jobs |
| Base de données | Supabase (PostgreSQL) |
| WhatsApp | Twilio WhatsApp API |
| IA | Anthropic (Claude) ou OpenAI |
| Recherche web | Tavily / Brave / Serper (abstrait) |
| Validation | Zod |

---

## Prérequis

- Node.js ≥ 20
- Compte [Supabase](https://supabase.com)
- Compte [Twilio](https://www.twilio.com) avec sandbox ou numéro WhatsApp approuvé
- Clé API IA : [Anthropic](https://console.anthropic.com) ou [OpenAI](https://platform.openai.com)
- Clé API recherche : [Tavily](https://tavily.com), [Brave Search](https://brave.com/search/api/) ou [Serper](https://serper.dev)

---

## Installation locale

```bash
# 1. Cloner le repo
git clone https://github.com/florentmaurice72/brifieng7.git
cd brifieng7

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos clés

# 4. Appliquer le schéma Supabase
# Ouvrir le SQL Editor dans votre projet Supabase
# Coller et exécuter le contenu de supabase/schema.sql

# 5. Démarrer en développement
npm run dev
```

---

## Variables d'environnement

Copier `.env.example` → `.env` et remplir chaque valeur.

| Variable | Description | Obligatoire |
|----------|-------------|-------------|
| `CRON_SECRET` | Secret partagé entre Vercel Cron et l'API | Oui |
| `SUPABASE_URL` | URL de votre projet Supabase | Oui |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role Supabase (serveur uniquement) | Oui |
| `TWILIO_ACCOUNT_SID` | SID de votre compte Twilio | Oui |
| `TWILIO_AUTH_TOKEN` | Token d'authentification Twilio | Oui |
| `TWILIO_WHATSAPP_FROM` | Numéro expéditeur WhatsApp (format `whatsapp:+1...`) | Oui |
| `WHATSAPP_TO` | Votre numéro WhatsApp (format `whatsapp:+33...`) | Oui |
| `AI_PROVIDER` | `anthropic` ou `openai` | Oui |
| `ANTHROPIC_API_KEY` | Clé API Anthropic | Si `AI_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | Clé API OpenAI | Si `AI_PROVIDER=openai` |
| `AI_MODEL` | Modèle IA (ex: `claude-sonnet-4-6`) | Oui |
| `SEARCH_PROVIDER` | `tavily`, `brave`, ou `serper` | Oui |
| `SEARCH_API_KEY` | Clé API du moteur de recherche | Oui |
| `MAX_BRIEFING_WORDS` | Limite de mots du briefing (défaut: 1200) | Non |
| `MAX_WHATSAPP_CHARS_PER_MESSAGE` | Limite de caractères par message WhatsApp (défaut: 1800) | Non |
| `MAX_WHATSAPP_MESSAGES` | Nombre max de messages WhatsApp (défaut: 9) | Non |

> **Sécurité** : `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais être exposée côté client. Ne committez jamais votre fichier `.env`.

---

## Routes API

### `GET /api/health`

Vérifie que le service est en ligne.

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"briefing-7"}
```

### `POST /api/test-briefing`

Génère un briefing manuellement pour tester le pipeline.

```bash
curl -X POST http://localhost:3000/api/test-briefing \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"send": false}'
```

Paramètre `send`:
- `false` (défaut) : génère et archive sans envoyer sur WhatsApp
- `true` : génère, archive et envoie sur WhatsApp

### `GET /api/daily-briefing`

Route appelée automatiquement par Vercel Cron. Protégée par `CRON_SECRET`.

```bash
curl http://localhost:3000/api/daily-briefing \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Base de données Supabase

Appliquer le schéma en copiant-collant `supabase/schema.sql` dans le SQL Editor de Supabase, ou via la CLI :

```bash
# Avec Supabase CLI (si configuré)
supabase db push

# Ou directement avec psql
psql "$DATABASE_URL" -f supabase/schema.sql
```

Tables créées :

| Table | Description |
|-------|-------------|
| `briefings` | Un briefing par jour (index unique sur `briefing_date`) |
| `sources` | Sources collectées et scorées |
| `opportunities` | Opportunités détectées |
| `logs` | Logs techniques d'exécution |
| `usage_logs` | Suivi des tokens et coûts estimés |
| `settings` | Configuration clé/valeur (usage futur) |

---

## Cron Vercel

Le fichier `vercel.json` configure deux déclenchements UTC pour couvrir les deux fuseaux heure Paris :

```json
{ "schedule": "0 5,6 * * *" }
```

- **5h UTC** = 7h Paris en heure d'été (UTC+2)
- **6h UTC** = 7h Paris en heure d'hiver (UTC+1)

La fonction `shouldSendBriefingNow()` vérifie que l'heure locale Paris est bien 7h avant de procéder. La déduplication Supabase empêche un double envoi.

---

## Mode mock (développement sans clé API)

Si `SEARCH_API_KEY` ou la clé IA n'est pas configurée, le système bascule automatiquement sur des données de test (`[MOCK]`). Ces données fictives **ne sont jamais envoyées sur WhatsApp en production** — le pipeline le détecte via la garde `shouldSendBriefingNow()`.

---

## Déploiement sur Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel

# Configurer les variables d'environnement dans le dashboard Vercel
# Settings → Environment Variables → ajouter toutes les variables du .env.example

# Vérifier que le cron est bien activé
# Settings → Cron Jobs
```

---

## Structure du projet

```
briefing-7/
├── app/
│   ├── api/
│   │   ├── daily-briefing/route.ts   # Route cron principale
│   │   ├── test-briefing/route.ts    # Route de test manuelle
│   │   └── health/route.ts           # Health check
│   └── page.tsx
├── config/
│   ├── trusted-sources.ts            # Sources fiables présélectionnées
│   └── topics.ts                     # Rotation thématique hebdomadaire
├── lib/
│   ├── briefing-generator.ts         # Génération IA (Anthropic/OpenAI)
│   ├── date.ts                       # Utilitaires timezone Paris
│   ├── logger.ts                     # Logs techniques → Supabase
│   ├── prompts.ts                    # Prompts système et utilisateur
│   ├── quality.ts                    # Contrôle qualité avant envoi
│   ├── scoring.ts                    # Scoring et déduplication des sources
│   ├── search.ts                     # Abstraction recherche web
│   ├── supabase.ts                   # Client Supabase (serveur uniquement)
│   ├── twilio.ts                     # Envoi WhatsApp + fallback
│   ├── usage.ts                      # Suivi des coûts IA
│   └── whatsapp-format.ts            # Découpage multi-messages WhatsApp
├── types/
│   ├── briefing.ts
│   ├── source.ts
│   └── opportunity.ts
├── supabase/
│   └── schema.sql
├── vercel.json
├── .env.example
└── README.md
```

---

## Points à configurer avant la mise en production

1. **Supabase** : créer un projet et appliquer `supabase/schema.sql`
2. **Twilio** : activer le sandbox WhatsApp ou un numéro approuvé, rejoindre le sandbox depuis votre téléphone
3. **Clé IA** : `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` + `AI_MODEL`
4. **Recherche web** : `SEARCH_PROVIDER` + `SEARCH_API_KEY`
5. **`CRON_SECRET`** : générer une chaîne aléatoire longue (ex: `openssl rand -hex 32`)
6. **`WHATSAPP_TO`** : votre numéro au format `whatsapp:+33XXXXXXXXX`

---

## Étape suivante (V1 — étape 2)

Brancher les vraies APIs et valider le pipeline end-to-end :
- Connecter Supabase et tester les insertions
- Valider l'envoi Twilio avec le sandbox
- Tester `/api/test-briefing` avec `send: true`
- Vérifier le cron en production Vercel
