import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Briefing 7',
  description: 'Veille stratégique automatisée — usage personnel',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
