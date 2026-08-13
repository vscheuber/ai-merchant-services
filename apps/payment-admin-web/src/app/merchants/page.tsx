// Merchants page for payment-admin-web.
//
// Requires an authenticated Auth.js session (alpha realm). Fetches all
// merchants from payment-api /api/merchants using the session's alpha
// access_token as a Bearer token. Unauthenticated visitors are redirected
// to the AIC alpha realm login page.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { Merchant } from '@acme/shared'
import {
  AppShell,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme/ui'
import { auth } from '../../auth'

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Users', href: '/users' },
  { label: 'Merchants', href: '/merchants' },
] as const

export default async function MerchantsPage() {
  const session = await auth()

  // Redirect to the AIC alpha realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/merchants'))
  }

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let merchants: Merchant[] = []
  let fetchError: string | null = null

  try {
    const res = await fetch(`${baseUrl}/api/merchants`, {
      headers: {
        Authorization: `Bearer ${session.accessToken ?? ''}`,
      },
      cache: 'no-store',
    })
    if (res.ok) {
      merchants = (await res.json()) as Merchant[]
    } else {
      fetchError = `Unable to load merchants (HTTP ${res.status.toString()}).`
    }
  } catch {
    fetchError = 'Unable to connect to the payment API. Please try again later.'
  }

  return (
    <AppShell brand="Acme Payments Admin" tagline="Internal dashboard" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Merchants</p>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarded merchants</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All merchants onboarded to Acme Payments, fetched live from the payment API.
        </p>
      </section>

      <section className="mt-8">
        {fetchError != null ? (
          <p className="text-sm text-destructive">{fetchError}</p>
        ) : merchants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No merchants found.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {merchants.map((merchant) => (
              <li key={merchant.id}>
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-block h-6 w-6 rounded-md border border-border"
                        style={{ backgroundColor: merchant.primaryColor }}
                      />
                      <div>
                        <CardTitle>{merchant.brand}</CardTitle>
                        <CardDescription>
                          <code className="rounded bg-muted px-1">{merchant.id}</code>
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">Name:</span> {merchant.name}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Primary color:</span>{' '}
                      <code className="rounded bg-muted px-1">{merchant.primaryColor}</code>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Domains:</span>{' '}
                      {merchant.domains.length > 0 ? merchant.domains.join(', ') : '—'}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
