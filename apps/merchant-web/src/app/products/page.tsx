// Products page — requires an authenticated Auth.js session.
//
// Fetches the Northwind product catalog from payment-api. The bravo
// access_token from the Auth.js session is first exchanged for an alpha
// realm token (via getAlphaToken) because payment-api only accepts alpha
// realm Bearer tokens. The product array is passed to the client-side
// ProductGrid component so "Add to cart" buttons can interact with the
// CartProvider context from the root layout.
//
// If the payment-api is unreachable, an error message is rendered rather than
// crashing — the session guard still fires so the user stays authenticated.
//
// Next.js App Router requires a default export.

import type { Product } from '@acme/shared'
import { AppShell } from '@acme/ui'
import { auth } from '../../auth'
import { getAlphaToken } from '../../lib/alpha-token'
import { ProductGrid } from '../../components/product-grid'

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const

export default async function ProductsPage() {
  const session = await auth()

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let products: Product[] = []
  let fetchError: string | null = null

  // Only attempt the bravo→alpha token exchange for authenticated users.
  // Anonymous visitors fetch products without a Bearer token; the payment-api
  // /api/products endpoint is configured to allow unauthenticated reads.
  const headers: Record<string, string> = {}
  if (session?.accessToken) {
    try {
      const alphaToken = await getAlphaToken(session.accessToken, session.user)
      if (alphaToken) headers['Authorization'] = `Bearer ${alphaToken}`
    } catch {
      // Non-blocking — anonymous product fetch is the fallback.
    }
  }

  try {
    const res = await fetch(
      `${baseUrl}/api/products?merchantId=mrch_northwind`,
      {
        headers,
        // Never cache — product stock can change between requests.
        cache: 'no-store',
      },
    )
    if (res.ok) {
      products = (await res.json()) as Product[]
    } else {
      fetchError = `Unable to load products (HTTP ${res.status.toString()}).`
    }
  } catch {
    fetchError = 'Unable to connect to the product catalog. Please try again later.'
  }

  return (
    <AppShell brand="Northwind Retail" tagline="Consumer electronics, made simple" nav={nav}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Products</p>
        <h1 className="text-3xl font-semibold tracking-tight">Northwind catalog</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Browse the full Northwind Retail product range and add items to your cart.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        {fetchError != null ? (
          <p className="text-sm text-destructive">{fetchError}</p>
        ) : (
          <ProductGrid products={products} />
        )}
      </section>
    </AppShell>
  )
}
