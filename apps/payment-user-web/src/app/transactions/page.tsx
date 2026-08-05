// Placeholder Transactions route for payment-user-web. Renders a hard-coded
// example table of the signed-in shopper's transactions across every merchant
// they've paid at, typed against `Transaction` from `@acme/shared` so the
// rows stay structurally aligned with the seed data schema. No fetches to
// `payment-api` — the follow-on wiring PR replaces the hard-coded rows.
//
// Next.js App Router requires a default export.

import type { Transaction } from '@acme/shared';
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
  { label: 'Profile', href: '/profile' },
] as const;

// Placeholder rows for the signed-in demo shopper. Structural example only —
// the follow-on wiring PR fetches these from `payment-api`.
const transactions: readonly Transaction[] = [
  {
    id: 'txn_00001',
    userId: 'user_ada',
    merchantId: 'mrch_northwind',
    merchantName: 'Northwind Retail',
    amount: 1299,
    currency: 'USD',
    status: 'captured',
    createdAt: '2026-06-14T15:22:31Z',
    items: [{ sku: 'NW-LP-14-SILVER', quantity: 1, unitPrice: 1299 }],
    consent: { source: 'web-checkout', confirmedAt: '2026-06-14T15:22:15Z' },
  },
  {
    id: 'txn_00002',
    userId: 'user_ada',
    merchantId: 'mrch_northwind',
    merchantName: 'Northwind Retail',
    amount: 428,
    currency: 'USD',
    status: 'captured',
    createdAt: '2026-07-02T19:04:11Z',
    items: [
      { sku: 'NW-HP-STUDIO', quantity: 1, unitPrice: 349 },
      { sku: 'NW-GM-CTRL', quantity: 1, unitPrice: 79 },
    ],
    consent: { source: 'chatbot', confirmedAt: '2026-07-02T19:03:52Z' },
  },
  {
    id: 'txn_00007',
    userId: 'user_ada',
    merchantId: 'mrch_northwind',
    merchantName: 'Northwind Retail',
    amount: 1899,
    currency: 'USD',
    status: 'captured',
    createdAt: '2026-08-01T10:34:22Z',
    items: [{ sku: 'NW-LP-16-PRO', quantity: 1, unitPrice: 1899 }],
    consent: { source: 'chatbot', confirmedAt: '2026-08-01T10:34:05Z' },
  },
] as const;

function formatAmount(txn: Transaction): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: txn.currency,
  }).format(txn.amount);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export default function TransactionsPage() {
  return (
    <AppShell brand="Acme Payments" tagline="Consumer account" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</p>
        <h1 className="text-3xl font-semibold tracking-tight">Your recent activity</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Placeholder table showing example rows for the signed-in shopper. The follow-on wiring
          PR fetches real transactions from the payment API scoped to the authenticated user.
        </p>
      </section>

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Across every merchant you&apos;ve used.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pr-4">
                      Date
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Merchant
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Consent
                    </th>
                    <th scope="col" className="py-2 pr-4">
                      Status
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4 text-muted-foreground">{formatDate(txn.createdAt)}</td>
                      <td className="py-3 pr-4 font-medium text-foreground">{txn.merchantName}</td>
                      <td className="py-3 pr-4 capitalize text-muted-foreground">{txn.consent.source}</td>
                      <td className="py-3 pr-4 capitalize text-muted-foreground">{txn.status}</td>
                      <td className="py-3 pl-4 text-right font-medium text-foreground">
                        {formatAmount(txn)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
