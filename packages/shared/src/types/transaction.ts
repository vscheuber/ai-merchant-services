/**
 * A recorded transaction on the payment platform.
 *
 * Every transaction carries both `merchantId` **and** a denormalized
 * `merchantName` so the admin funnel view can render per-merchant rollups
 * without a join. Every transaction also carries a `consent` sub-object that
 * captures the human-in-the-loop confirmation required for Phase 1 (see
 * requirements FR 12 / Constraint 13).
 */
export type TransactionStatus = 'authorized' | 'captured' | 'refunded' | 'declined';

export type ConsentSource = 'chatbot' | 'web-checkout';

/**
 * Explicit user consent captured for every payment. `source` names the
 * surface where the confirmation happened; `confirmedAt` is an ISO-8601
 * timestamp.
 */
export interface Consent {
  source: ConsentSource;
  confirmedAt: string;
}

export interface TransactionItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Transaction {
  /** Stable synthetic id, e.g. `txn_00001`. */
  id: string;
  /** Merchant-side (merchant-provider) user id who initiated the transaction. */
  userId: string;
  /** Owning merchant. */
  merchantId: string;
  /** Denormalized merchant name — enables joinless admin display. */
  merchantName: string;
  /** Total amount in major currency units. */
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Lifecycle state. */
  status: TransactionStatus;
  /** ISO-8601 timestamp for creation. */
  createdAt: string;
  /** Line items. */
  items: readonly TransactionItem[];
  /** Payment-side (payment-provider) identity id, if the JIT provisioning ran. */
  paymentIdentityId?: string;
  /** Consent record — required for every transaction in Phase 1. */
  consent: Consent;
}
