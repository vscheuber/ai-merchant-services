// GET /api/auth/start
//
// Generates PKCE parameters and returns the authorization URL that embed.js
// should open in a popup or redirect to begin the merchant IDP login flow.
//
// GET → 200 { authorizationUrl: string }
//
// Uses the Web Crypto API (crypto.getRandomValues + crypto.subtle.digest),
// which is available as a global in Next.js App Router / Node.js 18+.

import { NextResponse } from 'next/server';
import { pkceState } from '../../../../lib/pkce-state';

// ── Base64url helper ──────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<NextResponse> {
  // 1. Generate state: 32 random bytes → base64url.
  const stateBytes = crypto.getRandomValues(new Uint8Array(32));
  const state = toBase64Url(stateBytes);

  // 2. Generate code verifier: 43 random bytes → base64url.
  const verifierBytes = crypto.getRandomValues(new Uint8Array(43));
  const codeVerifier = toBase64Url(verifierBytes);

  // 3. Compute code challenge: SHA-256(codeVerifier) → base64url.
  const verifierData = new TextEncoder().encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', verifierData);
  const codeChallenge = toBase64Url(new Uint8Array(hashBuffer));

  // 4. Store state + codeVerifier in the module-level PKCE map.
  const returnOrigin = request.headers.get('Origin') ?? '';
  pkceState.set(state, { codeVerifier, returnOrigin });

  // 5. Build authorization URL.
  const issuer = (process.env['MERCHANT_OIDC_ISSUER'] ?? '').replace(/\/$/, '');
  const clientId = process.env['MERCHANT_OIDC_CLIENT_ID'] ?? '';
  const redirectUri = process.env['MERCHANT_OIDC_REDIRECT_URI'] ?? '';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'openid profile email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    redirect_uri: redirectUri,
  });

  const authorizationUrl = `${issuer}/authorize?${params.toString()}`;

  // 6. Return the authorization URL.
  return NextResponse.json({ authorizationUrl });
}
