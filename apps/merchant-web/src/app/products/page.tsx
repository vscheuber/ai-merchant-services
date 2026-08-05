// Placeholder Products route. Renders a small hard-coded catalog inside the
// shared `AppShell` — no fetches to `payment-api` per the plan; the follow-on
// wiring PR replaces the hard-coded rows with real listings. The `Product`
// type from `@acme/shared` is used to keep the placeholder rows structurally
// aligned with the seed data schema. Next.js App Router requires a default
// export.

import type { Product } from '@acme/shared';
import {
  AppShell,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@acme/ui';

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const;

// Placeholder catalog. Structural example only — the follow-on PR will fetch
// from the payment/merchant catalog and drop these constants.
const products: readonly Product[] = [
  {
    id: 'prod_nw_lp_001',
    sku: 'NW-LP-14-SILVER',
    merchantId: 'mrch_northwind',
    name: 'Northwind Aero 14',
    category: 'laptops',
    price: 1299,
    currency: 'USD',
    imageUrl: '/img/products/nw-aero-14.png',
    description:
      'Ultralight 14-inch laptop with a 12-hour battery and matte anti-glare display.',
    stock: 42,
  },
  {
    id: 'prod_nw_ph_001',
    sku: 'NW-PH-X7',
    merchantId: 'mrch_northwind',
    name: 'Northwind Pulse X7',
    category: 'phones',
    price: 799,
    currency: 'USD',
    imageUrl: '/img/products/nw-pulse-x7.png',
    description: '6.4-inch OLED smartphone with a triple-lens rear camera.',
    stock: 63,
  },
  {
    id: 'prod_nw_hp_001',
    sku: 'NW-HP-STUDIO',
    merchantId: 'mrch_northwind',
    name: 'Northwind Studio Over-Ear',
    category: 'headphones',
    price: 349,
    currency: 'USD',
    imageUrl: '/img/products/nw-studio-hp.png',
    description:
      'Closed-back over-ear headphones with adaptive active noise cancellation.',
    stock: 88,
  },
] as const;

function formatPrice(product: Product): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency,
  }).format(product.price);
}

export default function ProductsPage() {
  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Products</p>
        <h1 className="text-3xl font-semibold tracking-tight">Featured catalog</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Placeholder catalog rendered from a hard-coded slice of the seed data. The follow-on
          wiring PR replaces this with real listings from the merchant catalog.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <li key={product.id}>
              <Card className="flex h-full flex-col">
                <CardHeader>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className="capitalize">{product.category}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 text-sm text-muted-foreground">
                  {product.description}
                </CardContent>
                <CardFooter className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">{formatPrice(product)}</span>
                  <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
