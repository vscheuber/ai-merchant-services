// Account page — requires an authenticated Auth.js session.
//
// Fetches live loyalty and wallet data from payment-api. Before making those
// calls the server exchanges the bravo access_token from the Auth.js session
// for an alpha realm token (via getAlphaToken), because payment-api only
// accepts alpha realm Bearer tokens. Both fetches are best-effort: if the
// exchange or the payment-api call fails the page renders with graceful
// "unavailable" fallbacks rather than crashing.
//
// The OIDC subject identifier (session.userId — the AIC bravo_user _id, e.g.
// "user_ada") is used as the payment-api userId parameter.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { LoyaltyBalance, Merchant, WalletCard } from '@acme/shared'
import { AppShell, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@acme/ui'
import { auth } from '../../auth'
import { getAlphaToken } from '../../lib/alpha-token'

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const

const merchant: Merchant = {
  id: 'mrch_northwind',
  name: 'Northwind Retail',
  brand: 'Northwind Retail',
  domains: ['northwind.local'],
  primaryColor: '#1f6feb',
  logoUrl: '/brand/northwind.svg',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function brandLabel(brand: WalletCard['brand']): string {
  switch (brand) {
    case 'visa':
      return 'Visa'
    case 'mastercard':
      return 'Mastercard'
    case 'amex':
      return 'Amex'
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AccountPage() {
  const session = await auth()

  // Redirect to the AIC bravo realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/account'))
  }

  const userName = session.user?.name ?? '—'
  const userId = session.userId ?? ''
  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'

  // Exchange the bravo access_token for an alpha token so payment-api calls
  // are accepted. Both the loyalty and wallet fetches below are best-effort;
  // if the exchange fails (e.g. AIC not configured in this environment) the
  // page degrades gracefully with "unavailable" fallbacks.
  let token = ''
  try {
    token = await getAlphaToken(session.accessToken ?? '', session.user)
  } catch {
    // Non-blocking — graceful fallbacks are rendered below.
  }

  // ── Loyalty fetch (best-effort) ──────────────────────────────────────────
  let loyalty: LoyaltyBalance | null = null
  try {
    const res = await fetch(
      `${baseUrl}/api/loyalty?userId=${encodeURIComponent(userId)}&merchantId=${encodeURIComponent(merchant.id)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    )
    if (res.ok) {
      const records = (await res.json()) as LoyaltyBalance[]
      loyalty = records[0] ?? null
    }
  } catch {
    // Non-blocking — page renders with "unavailable" fallback below.
  }

  // ── Wallet fetch (best-effort) ───────────────────────────────────────────
  let walletCards: WalletCard[] = []
  try {
    const res = await fetch(
      `${baseUrl}/api/wallet?userId=${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    )
    if (res.ok) {
      walletCards = (await res.json()) as WalletCard[]
    }
  } catch {
    // Non-blocking.
  }

  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Account</p>
        <h1 className="text-3xl font-semibold tracking-tight">My Account</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage your profile, loyalty points, and saved payment methods for Northwind Retail.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {/* ── Profile ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Merchant-scoped identity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Signed in as:</span> {userName}
            </p>
            <p>
              <span className="font-medium text-foreground">Merchant:</span> {merchant.name}
            </p>
            <p>
              <span className="font-medium text-foreground">Domain:</span>{' '}
              {merchant.domains[0] ?? '—'}
            </p>
          </CardContent>
        </Card>

        {/* ── Loyalty ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Loyalty</CardTitle>
            <CardDescription>Points balance for {merchant.name}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {loyalty == null ? (
              <p className="italic">Loyalty data unavailable.</p>
            ) : (
              <>
                <p>
                  <span className="font-medium text-foreground">Tier:</span>{' '}
                  <span className="capitalize">{loyalty.tier}</span>
                </p>
                <p>
                  <span className="font-medium text-foreground">Points:</span>{' '}
                  {loyalty.points.toLocaleString()}
                </p>
                <p>
                  <span className="font-medium text-foreground">Lifetime points:</span>{' '}
                  {loyalty.lifetimePoints.toLocaleString()}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Wallet ───────────────────────────────────────────────────── */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Saved cards</CardTitle>
            <CardDescription>
              Cards on file for Northwind Retail. Full card numbers are never stored.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {walletCards.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No cards on file.</p>
            ) : (
              <ul className="divide-y divide-border">
                {walletCards.map((card) => (
                  <li key={card.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-medium text-foreground">
                      {brandLabel(card.brand)} •••• {card.last4}
                    </span>
                    <span className="text-muted-foreground">
                      {card.cardholderName} · Exp {card.expiryMonth.toString().padStart(2, '0')}/
                      {card.expiryYear}
                    </span>
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
