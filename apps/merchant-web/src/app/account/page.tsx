// Placeholder Account route. Renders a stub profile / loyalty card inside the
// shared `AppShell` using hard-coded example data typed against the
// `@acme/shared` types (Merchant + LoyaltyBalance) so it stays in lockstep
// with the seed schema. No fetches to `payment-api`. Next.js App Router
// requires a default export.

import type { LoyaltyBalance, Merchant } from '@acme/shared';
import { deriveLoyaltyTier } from '@acme/shared';
import { AppShell, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@acme/ui';

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const;

const merchant: Merchant = {
  id: 'mrch_northwind',
  name: 'Northwind Retail',
  brand: 'Northwind Retail',
  domains: ['northwind.local'],
  primaryColor: '#1f6feb',
  logoUrl: '/brand/northwind.svg',
};

const loyalty: LoyaltyBalance = {
  userId: 'usr_demo_ada',
  merchantId: merchant.id,
  points: 1240,
  lifetimePoints: 3820,
  tier: deriveLoyaltyTier(3820),
};

export default function AccountPage() {
  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Account</p>
        <h1 className="text-3xl font-semibold tracking-tight">Signed-out preview</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The account view is a scaffold placeholder — the follow-on wiring PR binds this to the
          authenticated merchant session so saved cards, loyalty points, and past orders load in
          from the payment API. The card below shows structural fields only.
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
              <span className="font-medium text-foreground">Signed in as:</span> (placeholder)
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
  );
}
