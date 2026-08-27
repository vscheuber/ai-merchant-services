// Root barrel for `@acme/shared`. Named exports only.
//
// Downstream apps typically import from here:
//   import { readJson, dataPath } from '@acme/shared';
//   import type { Merchant, Transaction } from '@acme/shared';
//
// Sub-path imports (`@acme/shared/types`, `@acme/shared/data`) remain
// available for consumers that prefer them.

export type { Merchant } from './types/merchant';
export type { Product, ProductCategory } from './types/product';
export type { Cart, CartItem } from './types/cart';
export type { WalletCard, WalletCardBrand } from './types/wallet-card';
export type {
  Transaction,
  TransactionItem,
  TransactionStatus,
  Consent,
  ConsentSource,
} from './types/transaction';
export type { LoyaltyBalance, LoyaltyTier } from './types/loyalty';
export { deriveLoyaltyTier } from './types/loyalty';
export type { MerchantIdentity, PaymentIdentity } from './types/identity';
export type { CheckoutSession, CheckoutSessionStatus } from './types/checkout';
export type { ChatIdentity, ChatMessage, ChatRequest, ChatResponse, ProposedPurchase } from './types/chat';
export type {
  TokenExchangeRequest,
  TokenExchangeResponse,
} from './types/token-exchange';
export type { TokenTrace, TokenTraceStage } from './types/token-trace';

export { DATA_DIR, dataPath } from './data/paths';
export type { DataFileName } from './data/paths';
export { readJson, writeJson } from './data/json-store';
