'use client'

// ProductGrid — client component that renders product cards with "Add to
// cart" buttons. The products array is fetched server-side by ProductsPage
// and passed in as a prop so data-fetching stays on the server while
// cart interactions run on the client.
//
// Uses useCart() from CartProvider (wired in the root layout). Clicking
// "Add to cart" increments the cart state and persists it to localStorage.

import type { Product } from '@acme/shared'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@acme/ui'
import { useCart } from './cart-provider'

function formatPrice(product: Product): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.currency,
  }).format(product.price)
}

interface ProductGridProps {
  products: readonly Product[]
}

export function ProductGrid({ products }: ProductGridProps) {
  const { addItem } = useCart()

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
              <span className="font-semibold text-foreground">{formatPrice(product)}</span>
              <div className="flex w-full items-center justify-between">
                <span className="text-xs text-muted-foreground">SKU {product.sku}</span>
                <Button size="sm" onClick={() => addItem(product)}>
                  Add to cart
                </Button>
              </div>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  )
}
