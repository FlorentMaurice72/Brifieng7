import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Server-side only env vars — never exposed to the client bundle
  serverRuntimeConfig: {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    searchApiKey: process.env.SEARCH_API_KEY,
    cronSecret: process.env.CRON_SECRET,
  },
  publicRuntimeConfig: {
    appName: process.env.APP_NAME ?? 'Briefing 7',
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  },
}

export default nextConfig
