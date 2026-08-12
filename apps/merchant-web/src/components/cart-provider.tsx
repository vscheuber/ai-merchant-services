'use client'

// CartProvider — client-side cart state persisted to localStorage.
//
// Provides addItem, removeItem, clearCart, and items to any consumer
// inside the provider tree (wired in the root layout so every page
// has access). Consumers use the useCart() hook exported here.
//
// Persistence strategy: on client mount the cart is hydrated from
// localStorage; every subsequent state change is written back. During
// SSR the cart starts empty and is populated after hydration, which
// is the standard Next.js pattern for localStorage-backed state.
//
// CartProvider is intentionally placed in the root layout (Task 6) so
// CartPage and ProductGrid can both access it without prop-drilling.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Product } from '@acme/shared'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  product: Product
  quantity: number
}

export interface CartContextValue {
  items: CartItem[]
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  clearCart: () => void
}

// ── Context ──────────────────────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | null>(null)

const STORAGE_KEY = 'acme-cart'

// ── Provider ─────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  // Hydrate from localStorage on client mount. useEffect only runs in
  // the browser, so this is safe during SSR (localStorage is unavailable).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setItems(JSON.parse(stored) as CartItem[])
      }
    } catch {
      // Ignore parse / quota / access errors (e.g. incognito with strict
      // storage restrictions).
    }
  }, [])

  // Persist to localStorage on every state change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Ignore storage write errors.
    }
  }, [items])

  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId))
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart }}>
      {children}
    </CartContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) {
    throw new Error('useCart must be called inside a <CartProvider>.')
  }
  return ctx
}
