// GET /api/chatbot/token — Chatbot token proxy (Step 1 of the two-step AIC token exchange).
//
// Flow:
//  1. Read the Auth.js session. Return 401 if no session or no merchant access_token.
//  2. Verify and decode the merchant JWT using the merchant realm JWKS to extract user claims.
//  3. Obtain a service-account payment token via payment-api client_credentials (for IDM calls).
//  4. Check AIC IDM for an existing payment-provider managed user matching the merchant user's sub.
//  5. If absent, JIT-provision a new payment_user with provisioningSource: "merchant-jit".
//  6. Perform the Step 1 token exchange: merchant access_token → payment realm user access_token.
//  7. Return { accessToken: "<payment_access_token>" } to the caller (embed.js).
//
// The raw merchant access_token never reaches client-side JS — all exchange steps are server-side.
//
// The full exchange logic is delegated to `@/lib/alpha-token` (getPaymentToken) so that
// merchant-web server pages that call the payment-api can reuse the same flow without
// making an additional HTTP round-trip back to this route.
//
// Environment variables (all required at runtime):
//   MERCHANT_OIDC_ISSUER         — Merchant realm issuer URL; JWKS URI is derived as
//                                   {MERCHANT_OIDC_ISSUER}/connect/jwk_uri
//   PAYMENT_API_CLIENT_ID        — OAuth2 client ID for the payment-api in the payment realm
//   PAYMENT_API_CLIENT_SECRET    — OAuth2 client secret for the payment-api client
//   AIC_ALPHA_TOKEN_ENDPOINT     — Payment realm token endpoint URL
//   AIC_IDM_BASE_URL             — AIC IDM REST API base URL (e.g. https://idc.scheuber.io/openidm)

import { NextResponse } from 'next/server';
import type { TokenTrace } from '@acme/shared';

import { auth } from '../../../../auth';
import { getPaymentToken } from '../../../../lib/alpha-token';

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  const traceEnabled = request.headers.get('x-demo-token-trace') === 'on'
  const traceRaw = request.headers.get('x-demo-token-trace-raw') === 'on'
  let trace: TokenTrace | null = null

  // ── 1. Require an active Auth.js session ──────────────────────────────────
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        code: 'login_required',
        message: 'No active session. Please sign in again.',
      },
      { status: 401 },
    );
  }

  const merchantToken = session.accessToken;

  // ── 2–6. Delegate the full exchange flow to the shared utility ────────────
  //
  // getPaymentToken performs:
  //   - Merchant JWT verification (JWKS)
  //   - Service-account token acquisition (client_credentials)
  //   - JIT payment_user provisioning (IDM check + PUT if absent)
  //   - Step 1 RFC 8693 token exchange (merchant → payment)
  //
  // Configuration errors (missing env vars) are returned as HTTP 500 so that
  // operators can distinguish them from auth failures (HTTP 401).
  let paymentToken: string;
  try {
    paymentToken = await getPaymentToken(merchantToken, session.user, {
      enabled: traceEnabled,
      rawTokens: traceRaw,
      onTrace: (nextTrace) => {
        trace = nextTrace
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed.';
    // Surface configuration errors as 500 (misconfigured server), all other
    // errors as 500 as well since they are unexpected at this point. Include
    // the diagnostic trace when tracing was explicitly enabled so failures are
    // visible too (not only successful exchanges).
    return NextResponse.json(
      {
        error: 'internal_error',
        message,
        ...(traceEnabled && trace ? { trace } : {}),
      },
      { status: 500 },
    );
  }

  // ── 7. Return the payment access_token ──────────────────────────────────────
  return NextResponse.json({
    accessToken: paymentToken,
    ...(traceEnabled && trace ? { trace } : {}),
  });
}
