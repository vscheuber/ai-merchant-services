// Users page for payment-admin-web.
//
// Requires an authenticated Auth.js session (alpha realm). Fetches all users
// from payment-api /api/users using the session's alpha access_token as a
// Bearer token. Unauthenticated visitors are redirected to the AIC alpha
// realm login page.
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { MerchantIdentity } from '@acme/shared'
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

export default async function UsersPage() {
  const session = await auth()

  // Redirect to the AIC alpha realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/admin/users'))
  }

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let users: MerchantIdentity[] = []
  let fetchError: string | null = null

  try {
    const res = await fetch(`${baseUrl}/api/users`, {
      headers: {
        Authorization: `Bearer ${session.accessToken ?? ''}`,
      },
      cache: 'no-store',
    })
    if (res.ok) {
      users = (await res.json()) as MerchantIdentity[]
    } else {
      fetchError = `Unable to load users (HTTP ${res.status.toString()}).`
    }
  } catch {
    fetchError = 'Unable to connect to the payment API. Please try again later.'
  }

  return (
    <AppShell brand="Acme Payments Admin" tagline="Internal dashboard" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Users</p>
        <h1 className="text-3xl font-semibold tracking-tight">Payment-side identity registry</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          All users from the payment API seed data.
        </p>
      </section>

      <section className="mt-8">
        {fetchError != null ? (
          <p className="text-sm text-destructive">{fetchError}</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users found.</p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <li key={user.id}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>
                      {user.givenName} {user.sn}
                    </CardTitle>
                    <CardDescription>
                      <code className="rounded bg-muted px-1">{user.userName}</code>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      <span className="font-medium text-foreground">ID:</span>{' '}
                      <code className="rounded bg-muted px-1">{user.id}</code>
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Email:</span> {user.email}
                    </p>
                    <p>
                      <span className="font-medium text-foreground">Merchant:</span>{' '}
                      <code className="rounded bg-muted px-1">{user.merchantId}</code>
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
