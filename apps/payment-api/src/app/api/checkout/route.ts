// Checkout route — scaffold stub.
//
// GET returns a shape-correct empty checkout status object (no active
// session) so consumers can round-trip against a stable JSON shape. POST
// returns 501 Not Implemented. The real handler will initiate a checkout
// after enforcing the mandatory in-chat consent (requirements FR 12 /
// Constraint 13); the scaffold only reserves the surface.

import { NextResponse } from 'next/server';

/**
 * Shape-correct empty checkout status. Kept local to the stub because the
 * production checkout response has not been designed yet; the follow-on PR
 * will replace this with a proper `CheckoutSession` type in `@acme/shared`.
 */
interface EmptyCheckoutStatus {
  session: null;
  pendingConsent: false;
}

export function GET(): NextResponse {
  const empty: EmptyCheckoutStatus = { session: null, pendingConsent: false };
  return NextResponse.json(empty);
}

export function POST(): NextResponse {
  return NextResponse.json(
    { error: 'not_implemented', message: 'POST /api/checkout is a scaffold stub.' },
    { status: 501 },
  );
}
