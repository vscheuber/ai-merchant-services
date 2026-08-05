// Landing page for payment-admin-web (Acme Payments Admin). Renders inside
// the shared `AppShell` from `@acme/ui` so brand + dark-mode toggle + nav
// placeholder stay in lockstep with the other Next.js surfaces. Describes
// the app's admin-dashboard role in the flow.
//
// Next.js App Router requires a default export.

import Link from 'next/link';
import {
  AppShell,
  buttonVariants,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@acme/ui';

const nav = [
  { label: 'Transactions', href: '/transactions' },
  { label: 'Users', href: '/users' },
  { label: 'Merchants', href: '/merchants' },
] as const;

export default function Page() {
  return (
    <AppShell brand="Acme Payments Admin" tagline="Internal dashboard" nav={nav}>
      <section className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Fictional admin surface
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Merchant funnels, at a glance.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Acme Payments Admin is the internal dashboard for the payment provider in this POC.
          Admins review funnel metrics per merchant, list registered users, and inspect
          transactions across every merchant Acme Payments processes for.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/transactions" className={buttonVariants()}>
            All transactions
          </Link>
          <Link href="/merchants" className={buttonVariants({ variant: 'outline' })}>
            Merchants
          </Link>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            What this surface does
          </h2>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          <li>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>Grouped per merchant.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Placeholder table structured to surface funnel-per-merchant metrics — every row
                carries the owning merchant id and denormalized merchant name.
              </CardContent>
            </Card>
          </li>
          <li>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Payment-side identity registry.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Placeholder for the users list. The follow-on wiring PR pulls records from the
                payment IDP (Acme Payments &apos;/alpha&apos; realm).
              </CardContent>
            </Card>
          </li>
          <li>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Merchants</CardTitle>
                <CardDescription>Onboarded merchant tenants.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Placeholder listing the seeded merchants with their brand + primary color. The
                follow-on wiring PR reads live merchant records from the payment API.
              </CardContent>
            </Card>
          </li>
        </ul>
      </section>

      <section className="mt-14 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Role in the flow
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Acme Payments Admin is the operator&apos;s view of the payment platform. Merchants keep
          their own funnel (see Northwind Retail) and consumers see their charges in the sibling
          Acme Payments consumer app — this dashboard is where Acme staff monitor funnel-per-merchant
          performance and manage tenants.
        </p>
      </section>
    </AppShell>
  );
}
