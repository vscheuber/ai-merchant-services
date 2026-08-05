// Placeholder Profile route for payment-user-web. Signed-out preview inside
// the shared `AppShell`. No fetches to `payment-api`; the follow-on wiring
// PR binds this to the authenticated payment-side (alpha) identity.
//
// Next.js App Router requires a default export.

import { AppShell, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@acme/ui';

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Profile', href: '/profile' },
] as const;

export default function ProfilePage() {
  return (
    <AppShell brand="Acme Payments" tagline="Consumer account" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Profile</p>
        <h1 className="text-3xl font-semibold tracking-tight">Signed-out preview</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The profile view is a scaffold placeholder — the follow-on wiring PR binds it to the
          payment IDP (Acme Payments &apos;/alpha&apos; realm) so saved wallet cards and consumer
          contact info load in from the payment API.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>Payment-side account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Signed in as:</span> (placeholder)
            </p>
            <p>
              <span className="font-medium text-foreground">Provider:</span> Acme Payments
            </p>
            <p>
              <span className="font-medium text-foreground">Realm:</span> alpha
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Saved cards</CardTitle>
            <CardDescription>Wallet on file with Acme Payments.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The follow-on wiring PR lists the shopper&apos;s saved wallet cards (brand + last four)
            from the payment API. The scaffold ships no wallet rendering.
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
