// Wallet-cards route — scaffold stub.
//
// GET returns an empty `WalletCard[]`. POST returns 501 Not Implemented.
// Real logic — reading `data/wallet-cards.json` via `@acme/shared` and
// enforcing the "last-4 only" persistence rule — lands in the follow-on PR.

import { NextResponse } from 'next/server';

import type { WalletCard } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

export function GET(): NextResponse {
  void dataFilePath('wallet-cards');
  const empty: readonly WalletCard[] = [];
  return NextResponse.json(empty);
}

export function POST(): NextResponse {
  return NextResponse.json(
    { error: 'not_implemented', message: 'POST /api/wallet is a scaffold stub.' },
    { status: 501 },
  );
}
