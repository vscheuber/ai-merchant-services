// Transactions page for payment-user-web.
//
// Requires an authenticated Auth.js session (alpha realm). Fetches the
// signed-in shopper's transactions from payment-api using the session's
// alpha access_token as a Bearer token. Unauthenticated visitors are
// redirected to the AIC alpha realm login page.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { Transaction } from '@acme/shared'
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
  { label: 'Profile', href: '/profile' },
] as const

function formatAmount(txn: Transaction): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: txn.currency,
  }).format(txn.amount)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

export default async function TransactionsPage() {
  const session = await auth()

  // Redirect to the AIC alpha realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/transactions'))
  }

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let transactions: Transaction[] = []
  let fetchError: string | null = null

  if (!session.userId) {
    fetchError = 'User identity unavailable.'
  } else {
    try {
      const url = `${baseUrl}/api/transactions?userId=${encodeURIComponent(session.userId)}`
      const res = await fetch(url, {
        headers: {
          ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
        },
        cache: 'no-store',
      })
      if (res.ok) {
        transactions = (await res.json()) as Transaction[]
      } else {
        fetchError = `Unable to load transactions (HTTP ${res.status.toString()}).`
      }
    } catch {
      fetchError = 'Unable to connect to the payment API. Please try again later.'
    }
  }

  return (
    <AppShell brand="Acme Payments" tagline="Consumer account" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</p>
        <h1 className="text-3xl font-semibold tracking-tight">Your recent activity</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All transactions for{' '}
          <span className="font-medium text-foreground">
            {session.user?.name ?? session.userId ?? 'your account'}
          </span>{' '}
          across every merchant you&apos;ve paid at.
        </p>
      </section>

      <section className="mt-8">
        {fetchError != null ? (
          <p className="text-sm text-destructive">{fetchError}</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>
                {transactions.length === 0
                  ? 'No transactions found.'
                  : `${transactions.length.toString()} transaction${transactions.length === 1 ? '' : 's'} across every merchant you've used.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions to display.</p>
              ) : (
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
                          <td className="py-3 pr-4 text-muted-foreground">
                            {formatDate(txn.createdAt)}
                          </td>
                          <td className="py-3 pr-4 font-medium text-foreground">
                            {txn.merchantName}
                          </td>
                          <td className="py-3 pr-4 capitalize text-muted-foreground">
                            {txn.consent.source}
                          </td>
                          <td className="py-3 pr-4 capitalize text-muted-foreground">
                            {txn.status}
                          </td>
                          <td className="py-3 pl-4 text-right font-medium text-foreground">
                            {formatAmount(txn)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </AppShell>
  )
}
