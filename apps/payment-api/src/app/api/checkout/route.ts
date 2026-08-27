// Checkout route — validates consent, computes the authoritative total from
// the product catalog, records the transaction, accrues loyalty points, and
// returns a CheckoutSession.
//
// POST /api/checkout
//   Body: { userId, selectedCardId, cart: Cart, consent: Consent }
//   Returns: CheckoutSession with status "captured".
//
// Consent enforcement: the request body must include a `consent` object with
// both `source` and `confirmedAt` fields; missing or empty consent returns
// HTTP 400 (requirements FR 14 / architecture "Checkout consent enforcement
// is server-side").
//
// This route is protected by the JWT middleware in `src/middleware.ts`.

import { NextRequest, NextResponse } from 'next/server';
import { readJson, writeJson, deriveLoyaltyTier } from '@acme/shared';
import type {
  Cart,
  Consent,
  CheckoutSession,
  Transaction,
  Product,
  LoyaltyBalance,
  Merchant,
} from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

/** Derive the next sequential transaction id from the current list. */
function nextTxnId(existing: readonly Transaction[]): string {
  const max = existing.reduce((m, t) => {
    const n = parseInt(t.id.replace(/^txn_/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `txn_${String(max + 1).padStart(5, '0')}`;
}

/** Generate a checkout session id using the current timestamp. */
function nextChkId(): string {
  return `chk_${String(Date.now()).slice(-10)}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  // --- Consent validation (requirements FR 14 / architecture decision) ---
  const consent = body['consent'] as Consent | undefined;
  if (!consent?.source || !consent?.confirmedAt) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Missing required consent object (source, confirmedAt).',
      },
      { status: 400 },
    );
  }

  const userId = body['userId'] ? String(body['userId']) : '';
  const selectedCardId = body['selectedCardId'] ? String(body['selectedCardId']) : '';
  const cart = body['cart'] as Cart | undefined;

  if (!userId || !selectedCardId || !cart) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Missing required fields: userId, selectedCardId, cart.',
      },
      { status: 400 },
    );
  }

  // Guard against missing or empty cart.items — an empty array would produce
  // a zero-amount captured transaction; undefined items would throw a TypeError
  // inside the for-of loop below.
  if (!Array.isArray(cart.items) || cart.items.length === 0) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Cart must contain at least one item.',
      },
      { status: 400 },
    );
  }

  const merchantId = cart.merchantId;
  if (!merchantId || typeof merchantId !== 'string') {
    return NextResponse.json(
      { error: 'bad_request', message: 'Cart must include a merchantId.' },
      { status: 400 },
    );
  }

  // --- Look up products to compute authoritative totalAmount ---
  let products: Product[];
  try {
    products = await readJson<Product[]>(dataFilePath('products'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Product catalog unavailable.' },
      { status: 503 },
    );
  }

  const merchantProducts = products.filter((product) => product.merchantId === merchantId);
  if (merchantProducts.length === 0) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Unknown merchant catalog.' },
      { status: 400 },
    );
  }

  const productMap = new Map(merchantProducts.map((p) => [p.sku, p]));
  let totalAmount = 0;
  let currency: string | undefined;
  for (const item of cart.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return NextResponse.json(
        { error: 'bad_request', message: `Invalid quantity for SKU: ${item.sku}.` },
        { status: 400 },
      );
    }
    const product = productMap.get(item.sku);
    if (!product) {
      return NextResponse.json(
        { error: 'bad_request', message: `Unknown product SKU for merchant: ${item.sku}.` },
        { status: 400 },
      );
    }
    if (currency && currency !== product.currency) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Cart items must use one currency.' },
        { status: 400 },
      );
    }
    currency = product.currency;
    totalAmount += product.price * item.quantity;
  }

  // Use the product's currency; fall back to the cart's declared currency.
  currency = currency ?? cart.currency ?? 'USD';

  // --- Look up merchant name for the denormalized transaction field ---
  let merchants: Merchant[];
  try {
    merchants = await readJson<Merchant[]>(dataFilePath('merchants'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Merchant data unavailable.' },
      { status: 503 },
    );
  }

  const merchant = merchants.find((m) => m.id === merchantId);
  const merchantName = merchant?.name ?? merchantId;

  // --- Append the transaction to data/transactions.json ---
  let transactions: Transaction[];
  try {
    transactions = await readJson<Transaction[]>(dataFilePath('transactions'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Transactions unavailable.' },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();

  const newTransaction: Transaction = {
    id: nextTxnId(transactions),
    userId,
    merchantId,
    merchantName,
    amount: totalAmount,
    currency,
    status: 'captured',
    createdAt: now,
    items: cart.items.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: productMap.get(item.sku)!.price,
    })),
    consent,
  };

  try {
    await writeJson(dataFilePath('transactions'), [...transactions, newTransaction]);
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to record transaction.' },
      { status: 503 },
    );
  }

  // --- Accrue loyalty points (1 point per dollar, truncated) ---
  // Best-effort: a loyalty write failure does not roll back the captured
  // transaction. The transaction is the authoritative record; loyalty
  // can be reconciled from it if needed.
  const earnedPoints = Math.floor(totalAmount);

  try {
    const loyaltyRecords = await readJson<LoyaltyBalance[]>(dataFilePath('loyalty'));
    const loyaltyIdx = loyaltyRecords.findIndex(
      (r) => r.userId === userId && r.merchantId === merchantId,
    );

    let updatedLoyalty: LoyaltyBalance[];
    if (loyaltyIdx >= 0) {
      const existing = loyaltyRecords[loyaltyIdx]!;
      const newLifetimePoints = existing.lifetimePoints + earnedPoints;
      updatedLoyalty = [
        ...loyaltyRecords.slice(0, loyaltyIdx),
        {
          ...existing,
          points: existing.points + earnedPoints,
          lifetimePoints: newLifetimePoints,
          tier: deriveLoyaltyTier(newLifetimePoints),
        },
        ...loyaltyRecords.slice(loyaltyIdx + 1),
      ];
    } else {
      updatedLoyalty = [
        ...loyaltyRecords,
        {
          userId,
          merchantId,
          points: earnedPoints,
          lifetimePoints: earnedPoints,
          tier: deriveLoyaltyTier(earnedPoints),
        },
      ];
    }
    await writeJson(dataFilePath('loyalty'), updatedLoyalty);
  } catch {
    // Best-effort: log the failure but do not affect the checkout response.
    console.error('[checkout] Loyalty accrual failed for user', userId, '— skipping.');
  }

  // --- Build and return the CheckoutSession ---
  const checkoutSession: CheckoutSession = {
    id: nextChkId(),
    userId,
    merchantId,
    cart,
    status: 'captured',
    selectedCardId,
    totalAmount,
    currency,
    ...(cart.redeemedPoints !== undefined
      ? { loyaltyPointsRedeemed: cart.redeemedPoints }
      : {}),
    createdAt: now,
  };

  return NextResponse.json(checkoutSession, { status: 201 });
}
