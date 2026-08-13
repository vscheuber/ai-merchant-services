// Checkout proxy route — reads the Auth.js session and forwards the
// checkout request to the payment-api with the bravo access_token as Bearer.
//
// POST /api/checkout (merchant-web internal proxy)
//   Body (from client): { cart: Cart, userId: string, selectedCardId: string }
//   Adds consent server-side: { source: "web-checkout", confirmedAt: <ISO> }
//   Forwards to ${PAYMENT_API_BASE_URL}/api/checkout and returns the response as-is.
//
// The consent source is set server-side to prevent client tampering.
// Returns the payment-api response: 201 CheckoutSession on success, 400/503 on error.
//
// Environment variables:
//   PAYMENT_API_BASE_URL — base URL of the payment-api (default: http://localhost:3003)

import { NextRequest, NextResponse } from 'next/server'
import type { Cart } from '@acme/shared'

import { auth } from '../../../auth'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Auth guard ---
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'No active session.' },
      { status: 401 },
    )
  }

  // --- Parse request body ---
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const { cart, userId, selectedCardId } = body

  if (!cart || !userId || !selectedCardId) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Missing required fields: cart, userId, selectedCardId.',
      },
      { status: 400 },
    )
  }

  // --- Forward to payment-api with consent set server-side ---
  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'

  const checkoutBody = {
    cart: cart as Cart,
    userId,
    selectedCardId,
    // Consent source is always "web-checkout" for this proxy route.
    // confirmedAt is the server-side timestamp of the form submission.
    consent: {
      source: 'web-checkout' as const,
      confirmedAt: new Date().toISOString(),
    },
  }

  let paymentRes: Response
  try {
    paymentRes = await fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify(checkoutBody),
    })
  } catch (err) {
    console.error('[checkout proxy] Failed to reach payment-api:', err)
    return NextResponse.json(
      { error: 'service_unavailable', message: 'Payment service unavailable.' },
      { status: 503 },
    )
  }

  const data: unknown = await paymentRes.json()
  return NextResponse.json(data, { status: paymentRes.status })
}
