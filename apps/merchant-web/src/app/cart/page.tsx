// Placeholder Cart route. Shows an "empty cart" state inside the shared
// `AppShell`. The follow-on wiring PR replaces this with a real cart bound to
// the authenticated shopper's session. Next.js App Router requires a default
// export.

import Link from 'next/link';
import { AppShell, buttonVariants, Card, CardContent, CardHeader, CardTitle } from '@acme/ui';

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const;

export default function CartPage() {
  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Cart</p>
        <h1 className="text-3xl font-semibold tracking-tight">Your cart is empty</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The cart is a placeholder in this scaffold PR. The follow-on wiring PR binds it to the
          authenticated shopper's session so items added via the Acme Assist chat overlay show up
          here in real time.
        </p>
      </section>

      <section className="mt-8">
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Nothing added yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Browse the catalog or ask the Acme Assist chat overlay in the corner for a
              recommendation.
            </p>
            <Link href="/products" className={buttonVariants()}>
              Shop products
            </Link>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
