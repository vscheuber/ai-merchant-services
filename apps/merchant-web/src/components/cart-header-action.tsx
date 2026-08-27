'use client'

import Link from 'next/link'
import { ShoppingCart } from '@acme/ui'
import { useCart } from './cart-provider'

export function CartHeaderAction() {
  const { items } = useCart()
  const count = items.reduce((total, item) => total + item.quantity, 0)
  const label = count > 0 ? `Shopping cart, ${count} item${count === 1 ? '' : 's'}` : 'Shopping cart, empty'

  return (
    <Link
      href="/cart"
      aria-label={label}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ShoppingCart aria-hidden="true" className="h-5 w-5" />
      <span className="sr-only">Cart</span>
      {count > 0 ? (
        <span
          aria-live="polite"
          className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}
