// Placeholder Users route for payment-admin-web. Renders a stub inside the
// shared `AppShell`. No fetches to `payment-api` — the follow-on wiring PR
// pulls the users list from the payment IDP's `alpha_user` records.
//
// Next.js App Router requires a default export.

import { AppShell, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@acme/ui';

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Users', href: '/users' },
  { label: 'Merchants', href: '/merchants' },
] as const;

export default function UsersPage() {
  return (
    <AppShell brand="Acme Payments Admin" tagline="Internal dashboard" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Users</p>
        <h1 className="text-3xl font-semibold tracking-tight">Payment-side identity registry</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Placeholder for the users list. The follow-on wiring PR reads records from the payment
          IDP (Acme Payments &apos;/alpha&apos; realm, managed/alpha_user) and shows JIT-provisioning
          status.
        </p>
      </section>

      <section className="mt-8">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Coming soon</CardTitle>
            <CardDescription>Users list is not wired in this scaffold.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            When the token-exchange + JIT-provisioning flow lands, this view lists every payment-side
            identity along with which merchant realm it was provisioned from.
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
