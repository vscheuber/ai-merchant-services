// Profile page for payment-user-web.
//
// Requires an authenticated Auth.js session (alpha realm). Displays the
// signed-in shopper's identity (from the OIDC session) and their saved
// wallet cards fetched from payment-api. Unauthenticated visitors are
// redirected to the AIC alpha realm login page.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { WalletCard } from '@acme/shared'
import { AppShell, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@acme/ui'
import { auth } from '../../auth'

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Profile', href: '/profile' },
] as const

export default async function ProfilePage() {
  const session = await auth()

  // Redirect to the AIC alpha realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/profile'))
  }

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let walletCards: WalletCard[] = []
  let walletError: string | null = null

  if (!session.userId) {
    walletError = 'User identity unavailable.'
  } else {
    try {
      const url = `${baseUrl}/api/wallet?userId=${encodeURIComponent(session.userId)}`
      const res = await fetch(url, {
        headers: {
          ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        },
        cache: 'no-store',
      })
      if (res.ok) {
        walletCards = (await res.json()) as WalletCard[]
      } else {
        walletError = `Unable to load wallet (HTTP ${res.status.toString()}).`
      }
    } catch {
      walletError = 'Unable to connect to the payment API. Please try again later.'
    }
  }

  return (
    <AppShell brand="Acme Payments" tagline="Consumer account" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Profile</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {session.user?.name ?? 'Your profile'}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Your Acme Payments identity and saved wallet cards.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Payment-side account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Signed in as:</span>{' '}
              {session.user?.name ?? '—'}
            </p>
            <p>
              <span className="font-medium text-foreground">Email:</span>{' '}
              {session.user?.email ?? '—'}
            </p>
            <p>
              <span className="font-medium text-foreground">Provider:</span> Acme Payments
            </p>
            <p>
              <span className="font-medium text-foreground">Realm:</span> alpha
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved cards</CardTitle>
            <CardDescription>Wallet on file with Acme Payments.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {walletError != null ? (
              <p className="text-destructive">{walletError}</p>
            ) : walletCards.length === 0 ? (
              <p>No saved cards.</p>
            ) : (
              <ul className="space-y-2">
                {walletCards.map((card) => (
                  <li
                    key={card.id}
                    className="flex items-center justify-between rounded border border-border px-3 py-2"
                  >
                    <span className="font-medium capitalize text-foreground">{card.brand}</span>
                    <span className="font-mono text-xs">•••• {card.last4}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </AppShell>
  )
}
