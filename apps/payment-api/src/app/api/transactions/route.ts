// Transactions route — scaffold stub.
//
// GET returns an empty array typed as `Transaction[]` (shape-correct empty
// list). POST returns 501 Not Implemented. Real logic — reading
// `data/transactions.json` via `@acme/shared`'s `readJson`, persisting new
// records via `writeJson`, and enforcing the human-in-the-loop `consent`
// sub-object — lands in the follow-on wiring PR.

import { NextResponse } from 'next/server';

import type { Transaction } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

export function GET(): NextResponse {
  // Path resolution is exercised so the follow-on PR's swap to
  // `readJson<Transaction[]>(dataFilePath('transactions'))` is a one-line
  // change. The path itself is unused in the stub response.
  void dataFilePath('transactions');
  const empty: readonly Transaction[] = [];
  return NextResponse.json(empty);
}

export function POST(): NextResponse {
  return NextResponse.json(
    { error: 'not_implemented', message: 'POST /api/transactions is a scaffold stub.' },
    { status: 501 },
  );
}
