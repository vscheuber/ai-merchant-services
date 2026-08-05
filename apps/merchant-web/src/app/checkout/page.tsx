// Placeholder Checkout route. Renders a scaffold-only "not wired yet" panel
// inside the shared `AppShell`, calling out the FR 12 human-in-the-loop
// requirement that the chat overlay's Confirm & pay button is the mandatory
// consent slot for chatbot-initiated payments. Next.js App Router requires a
// default export.

import { AppShell, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@acme/ui';

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const;

export default function CheckoutPage() {
  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Checkout</p>
        <h1 className="text-3xl font-semibold tracking-tight">Checkout is not wired yet</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The checkout flow is a scaffold placeholder in this PR. The follow-on wiring PR connects
          it to the Acme Payments payment API and to the authenticated shopper's saved cards.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Web checkout</CardTitle>
            <CardDescription>Standard merchant funnel.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Shoppers arriving here via the products / cart routes go through the merchant's own
            checkout form. Not wired in this scaffold.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chatbot-initiated checkout</CardTitle>
            <CardDescription>Human-in-the-loop, per FR 12.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Shoppers who ask the Acme Assist overlay to purchase see the disabled{' '}
            <code className="rounded bg-muted px-1">Confirm &amp; pay</code> consent slot in the
            chat panel. The follow-on wiring PR enables the button and drives payment through the
            same payment API.
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
