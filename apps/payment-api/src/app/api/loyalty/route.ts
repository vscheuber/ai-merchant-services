// Loyalty route — scaffold stub.
//
// GET returns an empty `LoyaltyBalance[]`. POST returns 501 Not Implemented.
// Real logic — reading `data/loyalty.json` via `@acme/shared`, filtering by
// `(userId, merchantId)`, and applying the tier ladder via
// `deriveLoyaltyTier` — lands in the follow-on PR.

import { NextResponse } from 'next/server';

import type { LoyaltyBalance } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

export function GET(): NextResponse {
  void dataFilePath('loyalty');
  const empty: readonly LoyaltyBalance[] = [];
  return NextResponse.json(empty);
}

export function POST(): NextResponse {
  return NextResponse.json(
    { error: 'not_implemented', message: 'POST /api/loyalty is a scaffold stub.' },
    { status: 501 },
  );
}
