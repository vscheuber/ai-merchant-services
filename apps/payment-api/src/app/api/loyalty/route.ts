// Loyalty route — real JSON-file reads and writes.
//
// GET /api/loyalty?userId=<id>&merchantId=<id> — returns matching loyalty
//   records. Either or both params may be omitted; absent params are not
//   filtered. The typical call passes both to get a single record.
// POST /api/loyalty — accrues earned points from a completed transaction.
//   Earning rate: 1 point per dollar (truncated). Tier is re-derived from the
//   updated `lifetimePoints` via `deriveLoyaltyTier`. Creates the record if
//   none exists for the (userId, merchantId) pair.
//
// This route is protected by the JWT middleware in `src/middleware.ts`.

import { NextRequest, NextResponse } from 'next/server';
import { readJson, writeJson, deriveLoyaltyTier } from '@acme/shared';
import type { LoyaltyBalance } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get('userId');
  const merchantId = searchParams.get('merchantId');
  if (!userId || !merchantId) {
    return NextResponse.json(
      { error: 'bad_request', message: 'userId and merchantId are required.' },
      { status: 400 },
    );
  }

  let records: LoyaltyBalance[];
  try {
    records = await readJson<LoyaltyBalance[]>(dataFilePath('loyalty'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Loyalty data unavailable.' },
      { status: 503 },
    );
  }

  let result = records;
  if (userId) result = result.filter((r) => r.userId === userId);
  if (merchantId) result = result.filter((r) => r.merchantId === merchantId);

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

  const userId = body['userId'] ? String(body['userId']) : '';
  const merchantId = body['merchantId'] ? String(body['merchantId']) : '';
  const amount = Number(body['amount'] ?? 0);

  if (!userId || !merchantId) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Missing required fields: userId, merchantId.' },
      { status: 400 },
    );
  }

  // 1 point per dollar (truncated).
  const earnedPoints = Math.floor(amount);

  let records: LoyaltyBalance[];
  try {
    records = await readJson<LoyaltyBalance[]>(dataFilePath('loyalty'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Loyalty data unavailable.' },
      { status: 503 },
    );
  }

  const idx = records.findIndex((r) => r.userId === userId && r.merchantId === merchantId);

  let updatedRecord: LoyaltyBalance;
  let updatedRecords: LoyaltyBalance[];

  if (idx >= 0) {
    const existing = records[idx]!;
    const newLifetimePoints = existing.lifetimePoints + earnedPoints;
    updatedRecord = {
      ...existing,
      points: existing.points + earnedPoints,
      lifetimePoints: newLifetimePoints,
      tier: deriveLoyaltyTier(newLifetimePoints),
    };
    updatedRecords = [
      ...records.slice(0, idx),
      updatedRecord,
      ...records.slice(idx + 1),
    ];
  } else {
    updatedRecord = {
      userId,
      merchantId,
      points: earnedPoints,
      lifetimePoints: earnedPoints,
      tier: deriveLoyaltyTier(earnedPoints),
    };
    updatedRecords = [...records, updatedRecord];
  }

  try {
    await writeJson(dataFilePath('loyalty'), updatedRecords);
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to update loyalty balance.' },
      { status: 503 },
    );
  }

  return NextResponse.json(updatedRecord);
}
