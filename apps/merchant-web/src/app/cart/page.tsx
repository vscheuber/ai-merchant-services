'use client'

// Cart page — client component that reads cart state from CartProvider.
//
// Renders current cart items with quantities and a per-item remove button,
// shows the running total, and provides a "Proceed to checkout" link. When
// the cart is empty, an empty-state card with a "Shop products" link is shown.
//
// Cart state is held in CartProvider (wired in the root layout) and persisted
// to localStorage. Items are added from the products page via ProductGrid.
//
// Next.js App Router requires a default export.

import Link from 'next/link'
import { Button, Card, CardContent, CardHeader, CardTitle, buttonVariants } from '@acme/ui'
import { useCart } from '../../components/cart-provider'
import { ClientHeaderActions } from '../../components/client-header-actions'
import { StorefrontShell } from '../../components/storefront-shell'

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export default function CartPage() {
  const { items, removeItem } = useCart()

  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  // Use the first item's currency (all items are from the same merchant, so
  // the currency is consistent). Fallback to 'USD'.
  const currency = items[0]?.product.currency ?? 'USD'

  // ── Empty state ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <StorefrontShell actions={<ClientHeaderActions />}>
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Cart</p>
          <h1 className="text-3xl font-semibold tracking-tight">Your cart is empty</h1>
        </section>

        <section className="mt-8">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Nothing added yet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Browse the catalog or use the shopping assistant for a recommendation.
              </p>
              <Link href="/products" className={buttonVariants()}>
                Shop products
              </Link>
            </CardContent>
          </Card>
        </section>
      </StorefrontShell>
    )
  }

  // ── Cart with items ────────────────────────────────────────────────────────
  return (
    <StorefrontShell actions={<ClientHeaderActions />}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Cart</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your cart ({items.length} {items.length === 1 ? 'item' : 'items'})
        </h1>
      </section>

      <section className="mt-8 max-w-2xl space-y-4">
        {/* ── Line items ────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.map(({ product, quantity }) => (
                <li key={product.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="flex-1 space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">SKU {product.sku}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {quantity} × {formatCurrency(product.price, product.currency)}
                    </span>
                    <span className="min-w-[5rem] text-right text-sm font-semibold text-foreground">
                      {formatCurrency(product.price * quantity, product.currency)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(product.id)}
                      aria-label={`Remove ${product.name} from cart`}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ── Total and checkout CTA ────────────────────────────────── */}
        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <span className="text-base font-semibold text-foreground">
            Total: {formatCurrency(total, currency)}
          </span>
          <Link href="/checkout" className={buttonVariants()}>
            Proceed to checkout
          </Link>
        </div>
      </section>
    </StorefrontShell>
  )
}
