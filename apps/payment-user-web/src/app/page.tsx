// Landing page for payment-user-web (Acme Payments — consumer UI). Renders
// inside the shared `AppShell` from `@acme/ui` so brand + dark-mode toggle +
// nav placeholder stay in lockstep with the other Next.js surfaces in the
// scaffold. Describes the app's consumer-facing role in the flow.
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
  { label: 'Profile', href: '/profile' },
] as const;

export default function Page() {
  return (
    <AppShell brand="Acme Payments" tagline="Consumer account" nav={nav}>
      <section className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Fictional payment provider
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Your payments, across every merchant.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Acme Payments is the payment provider behind the merchants in this POC. This
          consumer-facing surface gives shoppers a single place to review transactions and manage
          their profile — regardless of which merchant they last checked out with.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/transactions" className={buttonVariants()}>
            View transactions
          </Link>
          <Link href="/profile" className={buttonVariants({ variant: 'outline' })}>
            Profile
          </Link>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            What this surface does
          </h2>
        </div>
        <ul className="grid gap-4 md:grid-cols-2">
          <li>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>Every merchant, one ledger.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Placeholder table listing the signed-in shopper&apos;s transactions across all
                merchants that use Acme Payments. Wired to the payment API in a follow-on PR.
              </CardContent>
            </Card>
          </li>
          <li>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Consumer identity + saved cards.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Placeholder profile view. The follow-on PR binds it to the payment IDP
                (Acme Payments &apos;/alpha&apos; realm) and surfaces saved wallet cards.
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
          Acme Payments processes payments on behalf of every merchant in the POC. This
          consumer-facing app is where a shopper reviews charges and updates their payment profile;
          the merchant funnel stays with the merchant (see Northwind Retail), and admin views live
          in the sibling Acme Payments Admin app.
        </p>
      </section>
    </AppShell>
  );
}
