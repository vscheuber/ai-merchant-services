// JWT validation middleware for the payment API.
//
// Runs in the Next.js Edge Runtime before every `/api/*` route handler.
// `/api/health` is explicitly passed through without auth so liveness probes
// and smoke checks work without credentials.
//
// All other `/api/*` routes require a valid Bearer token issued by the AIC
// alpha realm. The token is validated via `jwtVerify` against the JWKS URI
// configured in `PAYMENT_OIDC_JWKS_URI`. On failure, a 401 JSON response is
// returned before the route handler runs.
//
// Scope enforcement is deferred (per architecture decision, requirements
// section "Resolved Decisions" point 4). The issuer claim (`iss`) is validated
// against `PAYMENT_OIDC_ISSUER`. Subject-claim enforcement is deferred. Token
// signature is verified via JWKS-backed RS256.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Health-check path — always passes through without auth. */
const HEALTH_PATH = '/api/health';

/**
 * Lazily-initialised JWKS set. Caching the `RemoteJWKSet` instance avoids
 * refetching the JWKS on every request in the same Edge worker lifetime.
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (jwks) return jwks;

  const jwksUri = process.env['PAYMENT_OIDC_JWKS_URI'];
  if (!jwksUri) {
    throw new Error('PAYMENT_OIDC_JWKS_URI environment variable is not set');
  }

  jwks = createRemoteJWKSet(new URL(jwksUri));
  return jwks;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Pass through the liveness probe without requiring a token.
  if (pathname === HEALTH_PATH) {
    return NextResponse.next();
  }

  // Extract Bearer token from the Authorization header.
  // The Web API `Headers` interface is case-insensitive (RFC 7230 / WHATWG Fetch),
  // so a single lowercase lookup is sufficient.
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Missing Bearer token.' },
      { status: 401 },
    );
  }

  try {
    await jwtVerify(token, getJwks(), {
      issuer: process.env['PAYMENT_OIDC_ISSUER'],
    });
  } catch {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid or expired Bearer token.' },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
