/**
 * Shopping cart shape.
 *
 * The scaffold does not persist carts to disk — this type exists so the
 * follow-on wiring task can share a single shape across merchant-web,
 * chatbot-agent, and payment-api. Named exports only per repo convention.
 */
export interface CartItem {
  /** Product SKU. */
  sku: string;
  /** Quantity in cart (>= 1). */
  quantity: number;
  /** Unit price captured at add-to-cart time, in the cart's currency. */
  unitPrice: number;
}

export interface Cart {
  /** Stable id — synthesized client-side in the scaffold. */
  id: string;
  /** Owning user id. */
  userId: string;
  /** Merchant this cart belongs to — carts are merchant-scoped. */
  merchantId: string;
  /** ISO 4217 currency code, e.g. `USD`. */
  currency: string;
  /** Items in the cart. */
  items: readonly CartItem[];
  /** Merchant loyalty points the shopper elected to redeem. */
  redeemedPoints?: number;
}
