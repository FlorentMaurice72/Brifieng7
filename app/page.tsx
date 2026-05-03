export default function HomePage() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Briefing 7</h1>
      <p>Service de veille stratégique automatisée — usage personnel.</p>
      <ul>
        <li><a href="/api/health">GET /api/health</a> — Statut du service</li>
      </ul>
      <p style={{ color: '#888', fontSize: '0.85rem' }}>
        Ce projet est déployé sur Vercel et s&apos;exécute automatiquement chaque matin à 7h (heure Paris).
      </p>
    </main>
  )
}
