// Placeholder Merchants route for payment-admin-web. Lists the seeded
// merchants with their brand + primary color, typed against `Merchant` from
// `@acme/shared` so the placeholder rows stay in lockstep with the seed
// schema. No fetches to `payment-api` in this scaffold.
//
// Next.js App Router requires a default export.

import type { Merchant } from '@acme/shared';
import {
  AppShell,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme/ui';

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Users', href: '/users' },
  { label: 'Merchants', href: '/merchants' },
] as const;

// Placeholder rows mirroring the seeded merchants under `data/merchants.json`.
// Structural example only — the follow-on wiring PR reads live records from
// the payment API.
const merchants: readonly Merchant[] = [
  {
    id: 'mrch_northwind',
    name: 'Northwind Retail',
    brand: 'Northwind Retail',
    domains: ['northwind.local'],
    primaryColor: '#1f6feb',
    logoUrl: '/brand/northwind.svg',
  },
  {
    id: 'mrch_contoso',
    name: 'Contoso Goods',
    brand: 'Contoso Goods',
    domains: ['contoso.local'],
    primaryColor: '#a3532b',
    logoUrl: '/brand/contoso.svg',
  },
] as const;

export default function MerchantsPage() {
  return (
    <AppShell brand="Acme Payments Admin" tagline="Internal dashboard" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Merchants</p>
        <h1 className="text-3xl font-semibold tracking-tight">Onboarded merchants</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Placeholder listing of the seeded merchants with their brand + primary color. The
          follow-on wiring PR reads live merchant records from the payment API.
        </p>
      </section>

      <section className="mt-8">
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
      </section>
    </AppShell>
  );
}
