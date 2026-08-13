// Wallet-cards route — real JSON-file reads and writes.
//
// GET /api/wallet?userId=<id> — returns all saved cards for a user. Cards
//   expose only `last4`; no full PAN field is ever present (non-functional
//   requirement 7: "No full PANs stored or transmitted").
// POST /api/wallet — adds a new wallet card to the file. Rejects any body
//   that contains a `pan` field to enforce the no-full-PAN invariant.
//
// This route is protected by the JWT middleware in `src/middleware.ts`.

import { NextRequest, NextResponse } from 'next/server';
import { readJson, writeJson } from '@acme/shared';
import type { WalletCard } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get('userId');

  let cards: WalletCard[];
  try {
    cards = await readJson<WalletCard[]>(dataFilePath('wallet-cards'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Wallet data unavailable.' },
      { status: 503 },
    );
  }

  const result = userId ? cards.filter((c) => c.userId === userId) : cards;
  return NextResponse.json(result);
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

  // Enforce the no-full-PAN invariant (NFR 7).
  if ('pan' in body) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Full card numbers (pan) are not accepted.' },
      { status: 400 },
    );
  }

  let cards: WalletCard[];
  try {
    cards = await readJson<WalletCard[]>(dataFilePath('wallet-cards'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Wallet data unavailable.' },
      { status: 503 },
    );
  }

  const newCard = body as unknown as WalletCard;
  try {
    await writeJson(dataFilePath('wallet-cards'), [...cards, newCard]);
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to save wallet card.' },
      { status: 503 },
    );
  }

  return NextResponse.json(newCard, { status: 201 });
}
