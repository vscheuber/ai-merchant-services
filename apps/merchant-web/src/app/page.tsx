// Landing page for merchant-web (Northwind Retail). Renders inside the shared
// `AppShell` from `@acme/ui` so brand + dark-mode toggle + nav placeholder
// stay in lockstep with the other Next.js surfaces in the scaffold. Ships a
// hero, category tiles, and a short "role in the flow" section describing how
// this app fits the agentic-commerce POC.
//
// No fetches to `payment-api` — category tiles use hard-coded example data
// per the plan. The `ProductCategory` union from `@acme/shared` is used so
// the tiles stay in sync with the seed schema.
//
// Next.js App Router requires a default export.

import Link from 'next/link';
import type { ProductCategory } from '@acme/shared';
import {
  AppShell,
  buttonVariants,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@acme/ui';
import { MerchantHeaderActions } from '../components/merchant-header-actions';

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const;

interface CategoryTile {
  category: ProductCategory;
  label: string;
  blurb: string;
}

const categories: readonly CategoryTile[] = [
  {
    category: 'laptops',
    label: 'Laptops',
    blurb: 'Ultralight travel machines, developer workstations, and everything in between.',
  },
  {
    category: 'phones',
    label: 'Phones',
    blurb: 'Flagship OLED smartphones with camera-first designs and all-day battery.',
  },
  {
    category: 'headphones',
    label: 'Headphones',
    blurb: 'Over-ear, on-ear, and true-wireless — tuned for music, calls, or both.',
  },
  {
    category: 'gaming',
    label: 'Gaming',
    blurb: 'Controllers, mechanical keyboards, and accessories built for long sessions.',
  },
  {
    category: 'home',
    label: 'Home',
    blurb: 'Small appliances and smart lighting that make daily routines quieter.',
  },
] as const;

export default function Page() {
  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav} actions={<MerchantHeaderActions />}>
      <section className="space-y-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Fictional demo storefront
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          Everyday tech, ready to ship.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Browse the catalog, add items to a cart, or ask the shopping assistant for help finding
          what you need.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/products" className={buttonVariants()}>
            Shop all products
          </Link>
          <Link href="/account" className={buttonVariants({ variant: 'outline' })}>
            View account
          </Link>
        </div>
      </section>

      <section className="mt-14 space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Shop by category
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Placeholder category tiles — the follow-on wiring PR replaces these with real listings
            fetched from the payment/merchant catalog.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((tile) => (
            <li key={tile.category}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>{tile.label}</CardTitle>
                  <CardDescription className="capitalize">{tile.category}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{tile.blurb}</CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Role in the flow
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A shopping assistant is embedded on every page via a single{' '}
          <code className="rounded bg-muted px-1">&lt;script&gt;</code> tag, so you get
          recommendations and checkout help without leaving the store. Every assistant-initiated
          payment still requires an explicit in-chat confirmation.
        </p>
      </section>
    </AppShell>
  );
}
