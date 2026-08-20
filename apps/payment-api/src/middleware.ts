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

/**
 * AIC OIDC discovery returns issuers with an explicit :443 port even though
 * it's the HTTPS default (e.g. "https://idc.mytestrun.com:443/am/oauth2").
 * jose's jwtVerify does an exact-string issuer comparison, so we normalise
 * our configured issuer URLs to include :443 before passing them to jwtVerify.
 */
function normalizeIssuer(issuer: string): string {
  if (/^https?:\/\/[^/]+:\d+/.test(issuer)) return issuer;
  if (issuer.startsWith('https://')) {
    return issuer.replace(/^(https:\/\/[^/]+)/, '$1:443');
  }
  return issuer;
}

/** Paths that pass through without a Bearer token. */
const PUBLIC_PREFIXES = ['/api/health', '/api/products'];

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

  // Pass through public paths without requiring a token.
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
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
    const configuredIssuer = process.env['PAYMENT_OIDC_ISSUER'];
    await jwtVerify(token, getJwks(), {
      issuer: configuredIssuer ? normalizeIssuer(configuredIssuer) : undefined,
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
