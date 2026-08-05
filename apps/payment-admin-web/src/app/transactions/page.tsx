// Placeholder Transactions route for payment-admin-web. Renders a hard-coded
// example table structured to eventually surface funnel-per-merchant
// metrics — every row carries `merchantId` and denormalized `merchantName`
// (see requirements FR 5 and the `Transaction` type in `@acme/shared`).
// No fetches to `payment-api` — the follow-on wiring PR replaces the
// hard-coded rows.
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
  { label: 'Users', href: '/users' },
  { label: 'Merchants', href: '/merchants' },
] as const;

// Placeholder rows spanning multiple merchants. Structural example only — the
// follow-on wiring PR fetches these from `payment-api` and rolls them up per
// merchant.
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
    id: 'txn_00003',
    userId: 'user_grace',
    merchantId: 'mrch_northwind',
    merchantName: 'Northwind Retail',
    amount: 799,
    currency: 'USD',
    status: 'captured',
    createdAt: '2026-07-18T12:41:07Z',
    items: [{ sku: 'NW-PH-X7', quantity: 1, unitPrice: 799 }],
    consent: { source: 'chatbot', confirmedAt: '2026-07-18T12:40:55Z' },
  },
  {
    id: 'txn_00005',
    userId: 'user_alan',
    merchantId: 'mrch_contoso',
    merchantName: 'Contoso Goods',
    amount: 999,
    currency: 'USD',
    status: 'authorized',
    createdAt: '2026-07-29T17:52:03Z',
    items: [{ sku: 'CG-LP-13-AIR', quantity: 1, unitPrice: 999 }],
    consent: { source: 'chatbot', confirmedAt: '2026-07-29T17:51:41Z' },
  },
  {
    id: 'txn_00008',
    userId: 'user_alan',
    merchantId: 'mrch_contoso',
    merchantName: 'Contoso Goods',
    amount: 149,
    currency: 'USD',
    status: 'declined',
    createdAt: '2026-08-02T21:19:47Z',
    items: [{ sku: 'CG-GM-KEY', quantity: 1, unitPrice: 149 }],
    consent: { source: 'chatbot', confirmedAt: '2026-08-02T21:19:31Z' },
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

interface MerchantGroup {
  merchantId: string;
  merchantName: string;
  rows: readonly Transaction[];
}

function groupByMerchant(rows: readonly Transaction[]): readonly MerchantGroup[] {
  const byId = new Map<string, { merchantName: string; rows: Transaction[] }>();
  for (const txn of rows) {
    const bucket = byId.get(txn.merchantId);
    if (bucket) {
      bucket.rows.push(txn);
    } else {
      byId.set(txn.merchantId, { merchantName: txn.merchantName, rows: [txn] });
    }
  }
  return Array.from(byId.entries()).map(([merchantId, { merchantName, rows }]) => ({
    merchantId,
    merchantName,
    rows,
  }));
}

export default function TransactionsPage() {
  const groups = groupByMerchant(transactions);
  return (
    <AppShell brand="Acme Payments Admin" tagline="Internal dashboard" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</p>
        <h1 className="text-3xl font-semibold tracking-tight">Funnel per merchant</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Placeholder table structured to eventually surface funnel-per-merchant metrics. Every
          row carries the owning merchant id and denormalized merchant name so admin rollups
          don&apos;t need a join.
        </p>
      </section>

      <section className="mt-8 space-y-6">
        {groups.map((group) => (
          <Card key={group.merchantId}>
            <CardHeader>
              <CardTitle>{group.merchantName}</CardTitle>
              <CardDescription>
                Merchant id: <code className="rounded bg-muted px-1">{group.merchantId}</code>
                {' · '}
                {group.rows.length} transaction{group.rows.length === 1 ? '' : 's'}
              </CardDescription>
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
                        User
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
                    {group.rows.map((txn) => (
                      <tr key={txn.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDate(txn.createdAt)}
                        </td>
                        <td className="py-3 pr-4 font-medium text-foreground">{txn.userId}</td>
                        <td className="py-3 pr-4 capitalize text-muted-foreground">
                          {txn.consent.source}
                        </td>
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
        ))}
      </section>
    </AppShell>
  );
}
