/**
 * A wallet card on file for a user.
 *
 * The seed data at `data/wallet-cards.json` persists **only the last-4** of a
 * fake-Luhn PAN. Full PANs are never stored in the repo. Card brand values
 * are lowercase generic network tags (`visa`, `mastercard`, `amex`) to keep
 * the scaffold free of vendor product names.
 */
export type WalletCardBrand = 'visa' | 'mastercard' | 'amex';

export interface WalletCard {
  /** Stable synthetic id, e.g. `card_ada_001`. */
  id: string;
  /** Owning user id. */
  userId: string;
  /** Generic network tag. */
  brand: WalletCardBrand;
  /** Last four digits of the fake-Luhn PAN. */
  last4: string;
  /** Expiry month, 1–12. */
  expiryMonth: number;
  /** Four-digit expiry year, e.g. `2029`. */
  expiryYear: number;
  /** Name printed on the card. */
  cardholderName: string;
}
