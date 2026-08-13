// POST /api/auth/exchange
//
// Accepts a merchant IDP (bravo realm) JWT from merchant-web's server-side,
// verifies it, and returns an alpha realm access_token.
//
// POST body:  { bravoToken: string }
// 200:        { accessToken: string }
// 400:        { error: "bad_request" }         — bravoToken absent / non-string
// 500:        { error: "configuration_error" } — required env var missing or
//                                                JWT verification / exchange failed
//
// No CORS headers — this is server-to-server only.
//
// JWT verification is performed inside getAlphaToken (alpha-token.ts), which
// uses its own cached RemoteJWKSet. A second independent verification here
// would create a duplicate JWKS cache that could diverge on key-rotation and
// return 500 instead of 401 on a cache miss.

import { NextResponse } from 'next/server';
import { getAlphaToken } from '../../../../lib/alpha-token';

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
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

  // 2. Call getAlphaToken (verifies bravo JWT internally); return 200 on
  //    success, 500 on any failure (JWT invalid, env vars missing, etc.).
  try {
    const accessToken = await getAlphaToken(bravoToken);
    return NextResponse.json({ accessToken }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'configuration_error' }, { status: 500 });
  }
}
