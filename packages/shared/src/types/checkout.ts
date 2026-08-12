/**
 * Checkout session shape.
 *
 * Represents a payment checkout session initiated by a shopper — either via
 * the chatbot overlay (consent.source === "chatbot") or the web checkout form
 * (consent.source === "web-checkout"). Named exports only per repo convention.
 */

import type { Cart } from './cart';

/** Lifecycle status of a checkout session. */
export type CheckoutSessionStatus = 'pending' | 'authorized' | 'captured' | 'declined';

export interface CheckoutSession {
  /** Stable synthetic id, e.g. `chk_00001`. */
  id: string;
  /** Merchant-side (bravo) user id who initiated the session. */
  userId: string;
  /** Owning merchant. */
  merchantId: string;
  /** Cart snapshot at checkout time. */
  cart: Cart;
  /** Lifecycle status of this checkout session. */
  status: CheckoutSessionStatus;
  /** The wallet card selected for payment. */
  selectedCardId: string;
  /** Computed total amount in major currency units. */
  totalAmount: number;
  /** ISO 4217 currency code, e.g. `USD`. */
  currency: string;
  /** Loyalty points redeemed as part of this checkout, if any. */
  loyaltyPointsRedeemed?: number;
  /** ISO-8601 timestamp for creation. */
  createdAt: string;
}
