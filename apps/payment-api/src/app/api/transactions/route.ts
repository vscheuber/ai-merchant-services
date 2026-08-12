// Transactions route — real JSON-file reads and writes.
//
// GET /api/transactions?userId=<id> — returns all transactions optionally
//   filtered by `userId`. Returns the full list when `userId` is omitted.
// POST /api/transactions             — records a new transaction. The request
//   body must include a `consent` sub-object with `source` and `confirmedAt`
//   (requirements FR 14 — human-in-the-loop enforcement).
//
// This route is protected by the JWT middleware in `src/middleware.ts`.

import { NextRequest, NextResponse } from 'next/server';
import { readJson, writeJson } from '@acme/shared';
import type { Transaction, Consent } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

/** Derive the next sequential transaction id from the current list. */
function nextTxnId(existing: readonly Transaction[]): string {
  const max = existing.reduce((m, t) => {
    const n = parseInt(t.id.replace(/^txn_/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `txn_${String(max + 1).padStart(5, '0')}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get('userId');

  let transactions: Transaction[];
  try {
    transactions = await readJson<Transaction[]>(dataFilePath('transactions'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Transactions unavailable.' },
      { status: 503 },
    );
  }

  const result = userId ? transactions.filter((t) => t.userId === userId) : transactions;
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

  // Consent is required on every transaction (requirements FR 14).
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

  let transactions: Transaction[];
  try {
    transactions = await readJson<Transaction[]>(dataFilePath('transactions'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Transactions unavailable.' },
      { status: 503 },
    );
  }

  const newTransaction: Transaction = {
    id: nextTxnId(transactions),
    userId: String(body['userId'] ?? ''),
    merchantId: String(body['merchantId'] ?? ''),
    merchantName: String(body['merchantName'] ?? ''),
    amount: Number(body['amount'] ?? 0),
    currency: String(body['currency'] ?? 'USD'),
    status: (body['status'] as Transaction['status']) ?? 'captured',
    createdAt: new Date().toISOString(),
    items: (body['items'] as Transaction['items']) ?? [],
    consent,
    ...(body['paymentIdentityId'] !== undefined
      ? { paymentIdentityId: String(body['paymentIdentityId']) }
      : {}),
  };

  try {
    await writeJson(dataFilePath('transactions'), [...transactions, newTransaction]);
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to record transaction.' },
      { status: 503 },
    );
  }

  return NextResponse.json(newTransaction, { status: 201 });
}
