// Products page — requires an authenticated Auth.js session.
//
// Fetches the Northwind product catalog from payment-provider-api. The merchant
// access_token from the Auth.js session is first exchanged for an payment-provider
// realm token (via getPaymentToken) because payment-provider-api only accepts payment-provider
// realm Bearer tokens. The product array is passed to the client-side
// ProductGrid component so "Add to cart" buttons can interact with the
// CartProvider context from the root layout.
//
// If the payment-provider-api is unreachable, an error message is rendered rather than
// crashing — the session guard still fires so the user stays authenticated.
//
// Next.js App Router requires a default export.

import type { Product } from '@acme/shared'
import { auth } from '../../auth'
import { getPaymentToken } from '../../lib/alpha-token'
import { getCatalog } from '../../lib/catalog'
import { ProductGrid } from '../../components/product-grid'
import { MerchantHeaderActions } from '../../components/merchant-header-actions'
import { StorefrontShell } from '../../components/storefront-shell'
import { loadMerchantConfig } from '../../lib/merchant-config'

export default async function ProductsPage() {
  const session = await auth()
  const isMember = Boolean(session?.accessToken)
  const merchantConfig = await loadMerchantConfig()

  let products: Product[] = []
  let fetchError: string | null = null

  // Only attempt the merchant→payment-provider token exchange for authenticated users.
  // Anonymous visitors fetch products without a Bearer token; the payment-provider-api
  // /api/products endpoint is configured to allow unauthenticated reads.
  if (session?.accessToken) {
    try {
      await getPaymentToken(session.accessToken, session.user, {
        enabled: true,
        rawTokens: false,
        traceSessionId: session.traceSessionId,
        onTrace: () => undefined,
      }, merchantConfig.merchantId)
    } catch {
      // Non-blocking — anonymous product fetch is the fallback.
    }
  }

  try {
    products = await getCatalog(merchantConfig)
  } catch (error) {
    fetchError = error instanceof Error ? error.message : 'Unable to load the product catalog.'
  }

  return (
    <StorefrontShell actions={<MerchantHeaderActions />}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Products</p>
        <h1 className="text-3xl font-semibold tracking-tight">{merchantConfig.brand} catalog</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Browse the full {merchantConfig.brand} product range and add items to your cart.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        {fetchError != null ? (
          <p className="text-sm text-destructive">{fetchError}</p>
        ) : (
          <ProductGrid products={products} isMember={isMember} />
        )}
      </section>
    </StorefrontShell>
  )
}
