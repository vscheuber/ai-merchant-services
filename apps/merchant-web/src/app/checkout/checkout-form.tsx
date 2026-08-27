'use client'

// CheckoutForm — client component that renders the interactive checkout UI.
//
// Receives wallet cards and userId from the parent Server Component (page.tsx).
// Reads cart state from CartProvider (wired in the root layout by Task 6).
//
// Renders:
//   • Cart summary: line items, quantities, and running total
//   • Card selector: <select> populated with brand + last4 of saved wallet cards
//   • Pay now button: POSTs to /api/checkout (the merchant-web proxy route)
//   • Success confirmation: shows transaction ID, amount, and status on capture
//   • Error message: shown on payment failure or network error
//
// The "Pay now" button is disabled while submission is in progress, when there
// are no saved cards, or when the cart is empty (edge-case guard).
//
// The /api/checkout proxy route sets consent.source = "web-checkout" server-side;
// this component never touches the consent object.
//
// Next.js App Router requires a default export, but this file exports a named
// component that is imported by the checkout page (default export lives there).

import { useState } from 'react'
import Link from 'next/link'
import type { WalletCard, CheckoutSession } from '@acme/shared'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  buttonVariants,
} from '@acme/ui'
import { useCart } from '../../components/cart-provider'
import { ClientHeaderActions } from '../../components/client-header-actions'
import { StorefrontShell } from '../../components/storefront-shell'
import { useMerchantConfig } from '../../components/merchant-config-provider'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function brandLabel(brand: WalletCard['brand']): string {
  switch (brand) {
    case 'visa':
      return 'Visa'
    case 'mastercard':
      return 'Mastercard'
    case 'amex':
      return 'Amex'
    default:
      return brand
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface CheckoutFormProps {
  /** Saved wallet cards fetched server-side from payment-api. */
  walletCards: WalletCard[]
  /** Merchant identity id (session.userId), forwarded to payment-api. */
  userId: string
}

export function CheckoutForm({ walletCards, userId }: CheckoutFormProps) {
  const { items, clearCart } = useCart()
  const merchantConfig = useMerchantConfig()

  const [selectedCardId, setSelectedCardId] = useState<string>(walletCards[0]?.id ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<CheckoutSession | null>(null)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const currency = items[0]?.product.currency ?? 'USD'

  // ── Empty cart ────────────────────────────────────────────────────────────
  // Only shown before a successful checkout — after checkout the result card
  // replaces this view; cart is empty but result is shown.
  if (items.length === 0 && result === null) {
    return (
      <StorefrontShell actions={<ClientHeaderActions />}>
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Checkout</p>
          <h1 className="text-3xl font-semibold tracking-tight">Your cart is empty</h1>
        </section>

        <section className="mt-8">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Nothing to check out</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>Add items to your cart before proceeding to checkout.</p>
              <Link href="/products" className={buttonVariants()}>
                Shop products
              </Link>
            </CardContent>
          </Card>
        </section>
      </StorefrontShell>
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (result !== null) {
    // Derive the heading from the actual status returned by payment-api so the
    // copy remains correct even if the API returns "declined" or another status
    // on a 2xx response.
    const statusHeading =
      result.status === 'captured'
        ? 'Payment captured'
        : `Payment ${result.status}`

    return (
      <StorefrontShell actions={<ClientHeaderActions />}>
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Checkout</p>
          <h1 className="text-3xl font-semibold tracking-tight">{statusHeading}</h1>
        </section>

        <section className="mt-8 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>Order confirmed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Transaction ID:</span> {result.id}
              </p>
              <p>
                <span className="font-medium text-foreground">Amount:</span>{' '}
                {formatCurrency(result.totalAmount, result.currency)}
              </p>
              <p>
                <span className="font-medium text-foreground">Status:</span>{' '}
                <span className="capitalize text-foreground">{result.status}</span>
              </p>
              <div className="pt-4">
                <Link href="/products" className={buttonVariants()}>
                  Continue shopping
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </StorefrontShell>
    )
  }

  // ── Form submission handler ───────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedCardId || items.length === 0 || isSubmitting) return

    setIsSubmitting(true)
    setCheckoutError(null)

    // Build the Cart object in the shape expected by payment-api.
    const cart = {
      id: `cart_${Date.now()}`,
      userId,
      merchantId: merchantConfig.merchantId,
      currency,
      items: items.map(({ product, quantity }) => ({
        sku: product.sku,
        quantity,
        unitPrice: product.price,
      })),
    }

    try {
      // userId is intentionally omitted — the proxy route reads it from the
      // server-side session to prevent IDOR (client cannot override it).
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart, selectedCardId }),
      })

      const data = (await res.json()) as Record<string, unknown>

      if (res.ok) {
        // Clear cart on success before updating state so the empty-cart branch
        // is never shown during the transition to the success state.
        clearCart()
        setResult(data as unknown as CheckoutSession)
      } else {
        const message =
          typeof data['message'] === 'string'
            ? data['message']
            : `Payment failed (HTTP ${res.status})`
        setCheckoutError(message)
      }
    } catch {
      setCheckoutError('Unable to reach the payment service. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Checkout form ─────────────────────────────────────────────────────────
  return (
    <StorefrontShell actions={<ClientHeaderActions />}>
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Checkout</p>
        <h1 className="text-3xl font-semibold tracking-tight">Review &amp; pay</h1>
      </section>

      <form onSubmit={(e) => { void handleSubmit(e) }}>
        <section className="mt-8 max-w-2xl space-y-4">
          {/* ── Order summary ────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {items.map(({ product, quantity }) => (
                  <li
                    key={product.id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">SKU {product.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {quantity} × {formatCurrency(product.price, product.currency)}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(product.price * quantity, product.currency)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border px-6 py-3">
                <span className="text-base font-semibold text-foreground">Total</span>
                <span className="text-base font-semibold text-foreground">
                  {formatCurrency(total, currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ── Payment method ───────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Payment method</CardTitle>
            </CardHeader>
            <CardContent>
              {walletCards.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                  No saved cards on file.{' '}
                  <Link href="/account" className="underline hover:text-foreground">
                    Add a card in your account.
                  </Link>
                </p>
              ) : (
                <div className="space-y-1.5">
                  {/* Explicit <label> associates the heading text with the
                      <select> so screen readers announce it on focus. */}
                  <label
                    htmlFor="card-select"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Select card
                  </label>
                  <select
                    id="card-select"
                    value={selectedCardId}
                    onChange={(e) => setSelectedCardId(e.target.value)}
                    disabled={isSubmitting}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {walletCards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {brandLabel(card.brand)} &bull;&bull;&bull;&bull; {card.last4} —{' '}
                        {card.cardholderName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Error ────────────────────────────────────────────────── */}
          {checkoutError !== null && (
            <p
              role="alert"
              className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            >
              {checkoutError}
            </p>
          )}

          {/* ── Actions ──────────────────────────────────────────────── */}
          <div className="flex items-center justify-between">
            <Link href="/cart" className={buttonVariants({ variant: 'outline' })}>
              Back to cart
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting || walletCards.length === 0 || items.length === 0}
            >
              {isSubmitting ? 'Processing…' : `Pay ${formatCurrency(total, currency)}`}
            </Button>
          </div>
        </section>
      </form>
    </StorefrontShell>
  )
}
