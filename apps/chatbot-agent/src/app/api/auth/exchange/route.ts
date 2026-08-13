// POST /api/auth/exchange
//
// Accepts a merchant IDP (bravo realm) JWT from merchant-web's server-side,
// verifies it, and returns an alpha realm access_token.
//
// POST body:  { bravoToken: string }
// 200:        { accessToken: string }
// 400:        { error: "bad_request" }      — bravoToken absent / non-string
// 401:        { error: "unauthorized" }     — JWT verification failed
// 500:        { error: "configuration_error" } — required env var missing
//
// No CORS headers — this is server-to-server only.

import { NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAlphaToken } from '../../../../lib/alpha-token';

// ── RemoteJWKSet cached at module scope ───────────────────────────────────────
//
// Initialised lazily on first request. Caching at module scope avoids a JWKS
// network fetch on every request while still tolerating cold-start ordering.

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getRemoteJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (remoteJwks) return remoteJwks;
  const issuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!issuer) {
    throw new Error('MERCHANT_OIDC_ISSUER environment variable is not set');
  }
  remoteJwks = createRemoteJWKSet(
    new URL(`${issuer.replace(/\/$/, '')}/connect/jwk_uri`),
  );
  return remoteJwks;
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // 4. Env guard: MERCHANT_OIDC_ISSUER must be set for JWT verification.
  const bravoIssuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!bravoIssuer) {
    return NextResponse.json({ error: 'configuration_error' }, { status: 500 });
  }

  // 1. Parse body; return 400 if bravoToken absent or not a string.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const bravoToken = (body as Record<string, unknown>)['bravoToken'];
  if (typeof bravoToken !== 'string' || bravoToken.length === 0) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  // 2. Verify the bravo JWT; return 401 on any verification failure.
  try {
    await jwtVerify(bravoToken, getRemoteJwks(), { issuer: bravoIssuer });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 3. Call getAlphaToken; return 200 on success, 500 on any failure
  //    (covers remaining missing env vars: PAYMENT_API_CLIENT_ID, etc.).
  try {
    const accessToken = await getAlphaToken(bravoToken);
    return NextResponse.json({ accessToken }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'configuration_error' }, { status: 500 });
  }
}
