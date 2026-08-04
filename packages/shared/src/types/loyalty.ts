/**
 * Merchant-scoped loyalty balance for a single user.
 *
 * Seed data at `data/loyalty.json` is an array keyed logically by the pair
 * `(userId, merchantId)`. Loyalty stays with the merchant (per the "merchant
 * retains loyalty" business framing in requirements Technical Context), so a
 * shopper can hold distinct balances at each merchant they interact with.
 *
 * Tier derivation from `lifetimePoints`:
 *   - bronze: lifetimePoints < 500
 *   - silver: 500 <= lifetimePoints < 2000
 *   - gold:   lifetimePoints >= 2000
 */
export type LoyaltyTier = 'bronze' | 'silver' | 'gold';

export interface LoyaltyBalance {
  /** Owning merchant-side user id. */
  userId: string;
  /** Merchant the balance is scoped to. */
  merchantId: string;
  /** Currently redeemable points. */
  points: number;
  /** All points ever earned (drives tier). */
  lifetimePoints: number;
  /** Tier derived from `lifetimePoints`. */
  tier: LoyaltyTier;
}

/**
 * Pure helper that derives the loyalty tier from lifetime points. Kept here
 * with the type so consumers can share a single derivation rule.
 */
export function deriveLoyaltyTier(lifetimePoints: number): LoyaltyTier {
  if (lifetimePoints >= 2000) return 'gold';
  if (lifetimePoints >= 500) return 'silver';
  return 'bronze';
}
