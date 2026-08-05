// Liveness probe for the payment API. Returns a fixed JSON payload so the
// Task 4 smoke check (and the eventual container/k8s liveness probe) can hit
// a stable endpoint without touching business state.

import { NextResponse } from 'next/server';

export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok', service: 'payment-api' });
}
