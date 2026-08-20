// Checkout proxy route — reads the Auth.js session, exchanges the merchant
// access_token for an payment realm token, and forwards the checkout request
// to the payment-api using the payment token as Bearer.
//
// POST /api/checkout (merchant-web internal proxy)
//   Body (from client): { cart: Cart, selectedCardId: string }
//   userId is taken from the server-side session, NOT the client body, to
//   prevent IDOR: a malicious client cannot target another user's account.
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
import { getPaymentToken } from '../../../lib/alpha-token'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Auth guard ---
  const session = await auth()
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'No active session.' },
      { status: 401 },
    )
  }

  // userId is taken from the server-side session to prevent IDOR.
  // Clients cannot override this value by including userId in the body.
  const userId = session.userId
  if (!userId) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Session does not include a user identity.' },
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

  const { cart, selectedCardId } = body

  if (!cart || !selectedCardId) {
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Missing required fields: cart, selectedCardId.',
      },
      { status: 400 },
    )
  }

  // --- Exchange merchant token for payment token before calling payment-api ---
  // payment-api only accepts payment realm tokens; using the merchant token would
  // result in HTTP 401 from the payment-api JWT middleware.
  let paymentToken: string
  try {
    paymentToken = await getPaymentToken(session.accessToken, session.user)
  } catch (err) {
    console.error('[checkout proxy] Failed to obtain payment token:', err)
    return NextResponse.json(
      { error: 'service_unavailable', message: 'Unable to obtain a payment authorization token.' },
      { status: 503 },
    )
  }

  // --- Forward to payment-api with consent set server-side ---
  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'

  const checkoutBody = {
    cart: cart as Cart,
    userId,          // always from session — never client-supplied
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
        Authorization: `Bearer ${paymentToken}`,
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

  // Guard against non-JSON responses (e.g. 502 HTML from a reverse proxy).
  // If parsing fails, return a structured 503 rather than letting the
  // SyntaxError propagate and produce an opaque 500 HTML page.
  let data: unknown
  try {
    data = await paymentRes.json()
  } catch {
    console.error('[checkout proxy] payment-api returned a non-JSON body (status', paymentRes.status, ')')
    return NextResponse.json(
      { error: 'service_unavailable', message: 'Payment service returned an unexpected response.' },
      { status: 503 },
    )
  }

  return NextResponse.json(data, { status: paymentRes.status })
}
