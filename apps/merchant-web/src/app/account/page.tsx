// Account page — requires an authenticated Auth.js session.
//
// On the first render, `auth()` is called server-side. If no session exists the
// user is redirected to the Auth.js sign-in page, which in turn redirects to the
// AIC bravo realm login. After a successful OIDC login the user lands back here
// with a valid session.
//
// Task 5 scope: session protection + user name display from session.
// Task 6 will replace the stub loyalty card below with live payment-api data.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { LoyaltyBalance, Merchant } from '@acme/shared'
import { deriveLoyaltyTier } from '@acme/shared'
import { AppShell, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@acme/ui'
import { auth } from '../../auth'

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

// Stub loyalty data — will be replaced with live payment-api fetch in Task 6.
const loyalty: LoyaltyBalance = {
  userId: 'usr_demo_ada',
  merchantId: merchant.id,
  points: 1240,
  lifetimePoints: 3820,
  tier: deriveLoyaltyTier(3820),
}

export default async function AccountPage() {
  const session = await auth()

  // Redirect to the AIC bravo realm login if there is no active session.
  // `redirect()` from next/navigation throws internally, so TypeScript narrows
  // the type of `session` to non-null after this block.
  if (!session) {
    redirect('/api/auth/signin')
  }

  const userName = session.user?.name ?? '—'

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

        <Card>
          <CardHeader>
            <CardTitle>Loyalty</CardTitle>
            <CardDescription>Points balance for this merchant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Tier:</span>{' '}
              <span className="capitalize">{loyalty.tier}</span>
            </p>
            <p>
              <span className="font-medium text-foreground">Points:</span> {loyalty.points}
            </p>
            <p>
              <span className="font-medium text-foreground">Lifetime points:</span>{' '}
              {loyalty.lifetimePoints}
            </p>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  )
}
