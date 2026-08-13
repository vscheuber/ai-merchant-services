// GET /api/chatbot/token — Chatbot token proxy (Step 1 of the two-step AIC token exchange).
//
// Flow:
//  1. Read the Auth.js session. Return 401 if no session or no bravo access_token.
//  2. Verify and decode the bravo JWT using the bravo realm JWKS to extract user claims.
//  3. Obtain a service-account alpha token via payment-api client_credentials (for IDM calls).
//  4. Check AIC IDM for an existing managed/alpha_user matching the bravo user's sub.
//  5. If absent, JIT-provision a new alpha_user with provisioningSource: "bravo-jit".
//  6. Perform the Step 1 token exchange: bravo access_token → alpha realm user access_token.
//  7. Return { accessToken: "<alpha_access_token>" } to the caller (embed.js).
//
// The raw bravo access_token never reaches client-side JS — all exchange steps are server-side.
//
// The full exchange logic is delegated to `@/lib/alpha-token` (getAlphaToken) so that
// merchant-web server pages that call the payment-api can reuse the same flow without
// making an additional HTTP round-trip back to this route.
//
// Environment variables (all required at runtime):
//   MERCHANT_OIDC_ISSUER         — Bravo realm issuer URL; JWKS URI is derived as
//                                   {MERCHANT_OIDC_ISSUER}/connect/jwk_uri
//   PAYMENT_API_CLIENT_ID        — OAuth2 client ID for the payment-api in the alpha realm
//   PAYMENT_API_CLIENT_SECRET    — OAuth2 client secret for the payment-api client
//   AIC_ALPHA_TOKEN_ENDPOINT     — Alpha realm token endpoint URL
//   AIC_IDM_BASE_URL             — AIC IDM REST API base URL (e.g. https://idc.scheuber.io/openidm)

import { NextResponse } from 'next/server';

import { auth } from '../../../../auth';
import { getAlphaToken } from '../../../../lib/alpha-token';

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  // ── 1. Require an active Auth.js session ──────────────────────────────────
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'No active session. Please sign in.' },
      { status: 401 },
    );
  }

  const bravoToken = session.accessToken;

  // ── 2–6. Delegate the full exchange flow to the shared utility ────────────
  //
  // getAlphaToken performs:
  //   - Bravo JWT verification (JWKS)
  //   - Service-account token acquisition (client_credentials)
  //   - JIT alpha_user provisioning (IDM check + PUT if absent)
  //   - Step 1 RFC 8693 token exchange (bravo → alpha)
  //
  // Configuration errors (missing env vars) are returned as HTTP 500 so that
  // operators can distinguish them from auth failures (HTTP 401).
  let alphaToken: string;
  try {
    alphaToken = await getAlphaToken(bravoToken, session.user);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed.';
    // Surface configuration errors as 500 (misconfigured server), all other
    // errors as 500 as well since they are unexpected at this point.
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 });
  }

  // ── 7. Return the alpha access_token ──────────────────────────────────────
  return NextResponse.json({ accessToken: alphaToken });
}
