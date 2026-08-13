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

import { redirect } from 'next/navigation'
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

  // Redirect to the AIC bravo realm login if there is no active session.
  if (!session) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/products'))
  }

  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'
  let products: Product[] = []
  let fetchError: string | null = null

  // Exchange the bravo access_token for an alpha token required by payment-api.
  // If the exchange fails (e.g. AIC not configured) we fall through with an
  // empty token — the products fetch will return a 401 and show an error.
  let alphaToken = ''
  try {
    alphaToken = await getAlphaToken(session.accessToken ?? '', session.user)
  } catch {
    // Non-blocking — fetch below handles non-OK responses gracefully.
  }

  try {
    const res = await fetch(
      `${baseUrl}/api/products?merchantId=mrch_northwind`,
      {
        headers: {
          Authorization: `Bearer ${alphaToken}`,
        },
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
