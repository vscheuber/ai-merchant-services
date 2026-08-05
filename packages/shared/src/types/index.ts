// Barrel for `@acme/shared/types`. Named exports only.
export type { Merchant } from './merchant';
export type { Product, ProductCategory } from './product';
export type { Cart, CartItem } from './cart';
export type { WalletCard, WalletCardBrand } from './wallet-card';
export type {
  Transaction,
  TransactionItem,
  TransactionStatus,
  Consent,
  ConsentSource,
} from './transaction';
export type { LoyaltyBalance, LoyaltyTier } from './loyalty';
export { deriveLoyaltyTier } from './loyalty';
export type { MerchantIdentity, PaymentIdentity } from './identity';
