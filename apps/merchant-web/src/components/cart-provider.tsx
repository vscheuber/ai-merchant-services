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

const LEGACY_STORAGE_KEY = 'acme-cart'

function isValidCartItem(item: unknown, merchantId: string): item is CartItem {
  if (!item || typeof item !== 'object') return false
  const candidate = item as Partial<CartItem>
  return Boolean(
    candidate.product &&
      typeof candidate.product === 'object' &&
      (candidate.product as Product).merchantId === merchantId &&
      typeof candidate.quantity === 'number' &&
      Number.isInteger(candidate.quantity) &&
      candidate.quantity > 0,
  )
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function CartProvider({ children, merchantId }: { children: ReactNode; merchantId: string }) {
  const storageKey = `acme-cart:${merchantId}`
  const [items, setItems] = useState<CartItem[]>([])

  // Hydrate from localStorage on client mount. useEffect only runs in
  // the browser, so this is safe during SSR (localStorage is unavailable).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        const validItems = Array.isArray(parsed)
          ? parsed.filter((item): item is CartItem => isValidCartItem(item, merchantId))
          : []
        setItems(validItems)
        if (stored === localStorage.getItem(LEGACY_STORAGE_KEY)) {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        }
      }
    } catch {
      // Ignore parse / quota / access errors (e.g. incognito with strict
      // storage restrictions).
    }
  }, [merchantId, storageKey])

  // Persist to localStorage on every state change.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items))
    } catch {
      // Ignore storage write errors.
    }
  }, [items, storageKey])

  const addItem = useCallback((product: Product) => {
    if (product.merchantId !== merchantId) return
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
  }, [merchantId])

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
