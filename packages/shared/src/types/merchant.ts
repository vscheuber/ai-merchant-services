/**
 * A merchant tenant on the payment platform.
 *
 * The scaffold ships seed data for one or two fictional merchants under
 * `data/merchants.json`. Every product, transaction, and loyalty record is
 * scoped to a merchant via `id` — the payment-admin app is expected to be
 * able to render funnel-per-merchant views without a join.
 */
export interface Merchant {
  /** Canonical merchant id shared across merchant and payment-provider configuration, e.g. `northwind`. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Display brand — may differ from name in future; kept explicit for UI. */
  brand: string;
  /**
   * Registered domains for this merchant. Placeholder `.local` values in the
   * scaffold; real deployments would carry public hostnames.
   */
  domains: readonly string[];
  /** CSS-compatible hex color used as the merchant's accent color. */
  primaryColor: string;
  /** Public URL/path to the merchant's logo. */
  logoUrl: string;
}
