'use client'

// ProductGrid — client component that renders product cards with "Add to
// cart" buttons. The products array is fetched server-side by ProductsPage
// and passed in as a prop so data-fetching stays on the server while
// cart interactions run on the client.
//
// Uses useCart() from CartProvider (wired in the root layout). Clicking
// "Add to cart" increments the cart state and persists it to localStorage.

import { useEffect, useState } from 'react'
import type { Product } from '@acme/shared'
import { Check } from '@acme/ui'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  toast,
} from '@acme/ui'
import { useCart } from './cart-provider'

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

interface ProductGridProps {
  products: readonly Product[]
  isMember: boolean
}

export function ProductGrid({ products, isMember }: ProductGridProps) {
  const router = useRouter()
  const { addItem, items } = useCart()
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null)

  useEffect(() => {
    if (!recentlyAddedId) return
    const timeout = window.setTimeout(() => setRecentlyAddedId(null), 1800)
    return () => window.clearTimeout(timeout)
  }, [recentlyAddedId])

  function addProduct(product: Product) {
    addItem(product)
    setRecentlyAddedId(product.id)
    const quantity = (items.find((item) => item.product.id === product.id)?.quantity ?? 0) + 1
    toast.success(`${product.name} added to cart`, {
      description: `${quantity} currently in your cart.`,
      duration: 6000,
      action: {
        label: 'Go to cart',
        onClick: () => router.push('/cart'),
      },
      cancel: {
        label: 'Continue shopping',
        onClick: () => undefined,
      },
    })
  }

  if (products.length === 0) {
    return <p className="text-sm text-muted-foreground">No products available.</p>
  }

  return (
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
            <CardFooter className="flex flex-col items-start gap-2 text-sm">
              {product.membersOnly && product.memberPrice !== undefined ? (
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {formatPrice(isMember ? product.memberPrice : product.price, product.currency)}
                  </span>
                  {isMember ? (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(product.price, product.currency)}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                    Members only
                  </span>
                </div>
              ) : (
                <span className="font-semibold text-foreground">
                  {formatPrice(product.price, product.currency)}
                </span>
              )}
              {product.membersOnly && !isMember ? (
                <p className="text-xs text-muted-foreground">
                  Sign in to unlock the member price.
                </p>
              ) : product.membersOnly ? (
                <p className="text-xs text-emerald-700">Member price unlocked.</p>
              ) : null}
              <div className="flex w-full items-center justify-between">
                <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
                <div className="flex items-center gap-2">
                  {recentlyAddedId === product.id ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" role="status">
                      <Check aria-hidden="true" className="h-4 w-4" />
                      Added
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => addProduct(product)}
                    disabled={product.membersOnly && !isMember}
                  >
                    {product.membersOnly && !isMember ? 'Sign in to buy' : 'Add to cart'}
                  </Button>
                </div>
              </div>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  )
}
