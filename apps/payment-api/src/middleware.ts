// Bearer token validation middleware for the payment API.
//
// Runs in the Next.js Edge Runtime before every `/api/*` route handler.
// `/api/health` is explicitly passed through without auth so liveness probes
// and smoke checks work without credentials.
//
// All other `/api/*` routes require a valid Bearer token issued by the AIC
// alpha realm. Validated via RFC 7662 token introspection (`/oauth2/introspect`)
// rather than local JWKS-based signature verification: the alpha realm's
// OAuth2 Provider issues stateless access tokens signed with a symmetric
// algorithm (HS256), whose signing key is never published via JWKS by design
// (JWKS only ever carries asymmetric public keys) — so local verification
// can never succeed for these tokens regardless of which JWKS URI is
// configured. Introspection asks AM itself whether the token is valid,
// which works for any signing algorithm the realm is configured with.
//
// Scope enforcement is deferred (per architecture decision, requirements
// section "Resolved Decisions" point 4). The introspection response's `iss`
// claim is validated against `PAYMENT_OIDC_ISSUER`. Subject-claim enforcement
// is deferred.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * AIC OIDC discovery/introspection returns issuers with an explicit :443 port
 * even though it's the HTTPS default (e.g. "https://idc.mytestrun.com:443/am/oauth2").
 * Normalise our configured issuer URL to include :443 before comparing against
 * the introspection response's `iss` claim, since that comparison is exact-string.
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

interface IntrospectionResponse {
  active: boolean;
  iss?: string;
  [key: string]: unknown;
}

async function introspectToken(token: string): Promise<IntrospectionResponse | null> {
  const introspectionUrl = process.env['PAYMENT_OIDC_INTROSPECTION_URL'];
  const clientId = process.env['PAYMENT_OIDC_CLIENT_ID'];
  const clientSecret = process.env['PAYMENT_OIDC_CLIENT_SECRET'];
  if (!introspectionUrl || !clientId || !clientSecret) {
    throw new Error(
      'Missing required env vars for token introspection: ' +
        'PAYMENT_OIDC_INTROSPECTION_URL, PAYMENT_OIDC_CLIENT_ID, PAYMENT_OIDC_CLIENT_SECRET.',
    );
  }

  const response = await fetch(introspectionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) return null;
  return (await response.json()) as IntrospectionResponse;
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
    const introspection = await introspectToken(token);
    const configuredIssuer = process.env['PAYMENT_OIDC_ISSUER'];
    if (
      !introspection?.active ||
      (configuredIssuer && introspection.iss !== normalizeIssuer(configuredIssuer))
    ) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Invalid or expired Bearer token.' },
        { status: 401 },
      );
    }
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
