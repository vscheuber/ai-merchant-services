// Transactions page for payment-admin-web.
//
// Requires an authenticated Auth.js session (alpha realm). Fetches all
// transactions from payment-api (no userId filter — admin view) using the
// session's alpha access_token as a Bearer token. Unauthenticated visitors
// are redirected to the AIC alpha realm login page.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { MerchantIdentity, Transaction } from '@acme/shared'
import {
  AppShell,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@acme/ui'
import { auth } from '../../auth'
import { HeaderActions } from '../../components/header-actions'

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Users', href: '/users' },
  { label: 'Merchants', href: '/merchants' },
] as const

/**
 * A resolved user, with an optional trace back to the merchant-side customer
 * — populated only for JIT-provisioned (alpha-only) identities that
 * GET /api/users/:id resolved via a live IDM read rather than the local
 * seed registry.
 */
type ResolvedUser = MerchantIdentity & { merchantCustomerId?: string }

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

interface MerchantGroup {
  merchantId: string
  merchantName: string
  rows: readonly Transaction[]
}

function groupByMerchant(rows: readonly Transaction[]): readonly MerchantGroup[] {
  const byId = new Map<string, { merchantName: string; rows: Transaction[] }>()
  for (const txn of rows) {
    const bucket = byId.get(txn.merchantId)
    if (bucket) {
      bucket.rows.push(txn)
    } else {
      byId.set(txn.merchantId, { merchantName: txn.merchantName, rows: [txn] })
    }
  }
  return Array.from(byId.entries()).map(([merchantId, { merchantName, rows }]) => ({
    merchantId,
    merchantName,
    rows,
  }))
}

export default async function TransactionsPage() {
  const session = await auth()

  // Redirect to the AIC alpha realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/admin/transactions'))
  }

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let transactions: Transaction[] = []
  let fetchError: string | null = null

  try {
    // Admin view — no userId filter, returns all transactions.
    const res = await fetch(`${baseUrl}/api/transactions`, {
      headers: {
        Authorization: `Bearer ${session.accessToken ?? ''}`,
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

  // Best-effort name lookup — same registry the Users page reads (seed
  // MerchantIdentity records, keyed by the demo users' real bravo-realm
  // UUID). A transaction's `userId` can also be a live JIT-provisioned
  // alpha_user UUID (e.g. from a chatbot purchase) that never appears in the
  // local seed list; those are resolved individually below via
  // GET /api/users/:id, which falls back to a live IDM read.
  const usersById = new Map<string, ResolvedUser>()
  try {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: {
        Authorization: `Bearer ${session.accessToken ?? ''}`,
      },
      cache: 'no-store',
    })
    if (res.ok) {
      const users = (await res.json()) as MerchantIdentity[]
      for (const user of users) usersById.set(user.id, user)
    }
  } catch {
    // Non-fatal — falls through to the per-id resolution below, and
    // ultimately to raw ids for every row if that fails too.
  }

  // Resolve any userId the seed list didn't cover (live JIT identities) in
  // parallel, one request per unique unresolved id.
  const unresolvedIds = [...new Set(transactions.map((t) => t.userId))].filter(
    (id) => !usersById.has(id),
  )
  await Promise.all(
    unresolvedIds.map(async (id) => {
      try {
        const res = await fetch(`${baseUrl}/api/users/${encodeURIComponent(id)}`, {
          headers: {
            Authorization: `Bearer ${session.accessToken ?? ''}`,
          },
          cache: 'no-store',
        })
        if (res.ok) {
          usersById.set(id, (await res.json()) as ResolvedUser)
        }
      } catch {
        // Non-fatal — that row falls back to showing the raw id.
      }
    }),
  )

  const groups = groupByMerchant(transactions)

  return (
    <AppShell
      brand="Acme Payments Admin"
      tagline="Internal dashboard"
      nav={nav}
      actions={<HeaderActions />}
    >
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Transactions</p>
        <h1 className="text-3xl font-semibold tracking-tight">Funnel per merchant</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All transactions from the payment API, grouped by merchant. Every row carries the owning
          merchant id, user id, and consent source.
        </p>
      </section>

      <section className="mt-8 space-y-6">
        {fetchError != null ? (
          <p className="text-sm text-destructive">{fetchError}</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions found.</p>
        ) : (
          groups.map((group) => (
            <Card key={group.merchantId}>
              <CardHeader>
                <CardTitle>{group.merchantName}</CardTitle>
                <CardDescription>
                  Merchant id:{' '}
                  <code className="rounded bg-muted px-1">{group.merchantId}</code>
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
                      {group.rows.map((txn) => {
                        const user = usersById.get(txn.userId)
                        return (
                        <tr key={txn.id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-4 text-muted-foreground">
                            {formatDate(txn.createdAt)}
                          </td>
                          <td className="py-3 pr-4">
                            {user ? (
                              <>
                                <div className="font-medium text-foreground">
                                  {user.givenName} {user.sn}
                                </div>
                                {/* Prefer the merchant customer id over the transaction's own
                                    stored userId — for a row keyed by a JIT-provisioned alpha
                                    id (e.g. a pre-fix legacy purchase), that raw id is a
                                    throwaway identifier, not the shopper's actual merchant
                                    identity, so it isn't worth surfacing as a second value.
                                    Rows already keyed by the merchant customer id show the
                                    same value either way. */}
                                <div className="text-xs text-muted-foreground">
                                  {user.merchantCustomerId ?? txn.userId}
                                </div>
                              </>
                            ) : (
                              <span className="font-medium text-foreground">{txn.userId}</span>
                            )}
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </AppShell>
  )
}
