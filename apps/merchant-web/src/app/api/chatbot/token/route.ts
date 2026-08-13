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
// Environment variables (all required at runtime):
//   MERCHANT_OIDC_ISSUER         — Bravo realm issuer URL; JWKS URI is derived as
//                                   {MERCHANT_OIDC_ISSUER}/connect/jwk_uri
//   PAYMENT_API_CLIENT_ID        — OAuth2 client ID for the payment-api in the alpha realm
//   PAYMENT_API_CLIENT_SECRET    — OAuth2 client secret for the payment-api client
//   AIC_ALPHA_TOKEN_ENDPOINT     — Alpha realm token endpoint URL
//   AIC_IDM_BASE_URL             — AIC IDM REST API base URL (e.g. https://idc.scheuber.io/openidm)

import { NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import type { TokenExchangeRequest, TokenExchangeResponse } from '@acme/shared';

import { auth } from '../../../../auth';

// ─── Bravo JWKS (lazily initialised, reused across requests) ────────────────

/** Lazily-initialised JWKS set for the bravo realm. Cached for the worker lifetime. */
let bravoJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Returns a RemoteJWKSet for the bravo realm.
 * The JWKS URI is derived from MERCHANT_OIDC_ISSUER:
 *   {issuer}/connect/jwk_uri  (standard AIC/AM JWKS path)
 */
function getBravoJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (bravoJwks) return bravoJwks;
  const bravoIssuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!bravoIssuer) {
    throw new Error('MERCHANT_OIDC_ISSUER environment variable is not set');
  }
  bravoJwks = createRemoteJWKSet(new URL(`${bravoIssuer.replace(/\/$/, '')}/connect/jwk_uri`));
  return bravoJwks;
}

// ─── Service-account token ───────────────────────────────────────────────────

/**
 * Obtains a service-account alpha access_token for the payment-api client using
 * client_credentials. This token carries the `fr:idm:*` scope required to
 * read and create managed objects in AIC IDM.
 */
async function getServiceAccountToken(): Promise<string> {
  const clientId = process.env['PAYMENT_API_CLIENT_ID'];
  const clientSecret = process.env['PAYMENT_API_CLIENT_SECRET'];
  const tokenEndpoint = process.env['AIC_ALPHA_TOKEN_ENDPOINT'];

  if (!clientId || !clientSecret || !tokenEndpoint) {
    throw new Error(
      'Missing required env vars: PAYMENT_API_CLIENT_ID, PAYMENT_API_CLIENT_SECRET, AIC_ALPHA_TOKEN_ENDPOINT',
    );
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'fr:idm:*',
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Service-account token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// ─── AIC IDM helpers ─────────────────────────────────────────────────────────

/**
 * Checks whether a managed/alpha_user with the given _id already exists in AIC IDM.
 * Returns true if the user record was found, false if the IDM API returned 404.
 * Throws on any other non-OK response.
 */
async function alphaUserExists(sub: string, serviceToken: string): Promise<boolean> {
  const idmBaseUrl = process.env['AIC_IDM_BASE_URL'];
  if (!idmBaseUrl) throw new Error('AIC_IDM_BASE_URL environment variable is not set');

  const response = await fetch(
    `${idmBaseUrl}/managed/alpha_user/${encodeURIComponent(sub)}`,
    {
      headers: { Authorization: `Bearer ${serviceToken}` },
    },
  );

  if (response.ok) return true;
  if (response.status === 404) return false;

  const text = await response.text();
  throw new Error(`IDM user lookup failed: ${response.status} ${text}`);
}

/**
 * JIT-provisions a new managed/alpha_user in AIC IDM using a PUT request.
 * The `_id` is set to the bravo JWT's `sub` so that AIC's trusted-JWT-issuer
 * mapping can locate the alpha user during token exchange.
 *
 * A 409 (conflict) response is treated as a no-op: another request raced and
 * already created the user.
 */
async function createAlphaUser(
  sub: string,
  userName: string,
  givenName: string,
  sn: string,
  email: string,
  serviceToken: string,
): Promise<void> {
  const idmBaseUrl = process.env['AIC_IDM_BASE_URL'];
  if (!idmBaseUrl) throw new Error('AIC_IDM_BASE_URL environment variable is not set');

  const body = {
    _id: sub,
    userName,
    givenName,
    sn,
    // AIC IDM uses `mail` as the attribute name for email in managed/alpha_user.
    mail: email,
    provisioningSource: 'bravo-jit',
  };

  const response = await fetch(
    `${idmBaseUrl}/managed/alpha_user/${encodeURIComponent(sub)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  // 201 = created, 200 = replaced, 409 = conflict (race — already exists, safe to ignore).
  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    throw new Error(`Failed to JIT-provision alpha user '${sub}': ${response.status} ${text}`);
  }
}

// ─── Step 1 token exchange ───────────────────────────────────────────────────

/**
 * Performs Step 1 of the two-step AIC token exchange:
 *   bravo access_token  →  alpha realm user access_token
 *
 * Uses the payment-api client credentials + the RFC 8693 token-exchange grant.
 * AIC validates the bravo token via the trusted-JWT-issuer configuration in the
 * alpha realm and issues an alpha access_token for the same subject.
 */
async function exchangeBravoForAlphaToken(bravoToken: string): Promise<string> {
  const clientId = process.env['PAYMENT_API_CLIENT_ID'];
  const clientSecret = process.env['PAYMENT_API_CLIENT_SECRET'];
  const tokenEndpoint = process.env['AIC_ALPHA_TOKEN_ENDPOINT'];

  if (!clientId || !clientSecret || !tokenEndpoint) {
    throw new Error(
      'Missing required env vars: PAYMENT_API_CLIENT_ID, PAYMENT_API_CLIENT_SECRET, AIC_ALPHA_TOKEN_ENDPOINT',
    );
  }

  // Build the RFC 8693 token-exchange request.
  // The TokenExchangeRequest type from @acme/shared documents the field set;
  // URLSearchParams is used directly to avoid spreading optional fields.
  // requested_token_type is appended conditionally so that an undefined value
  // does not result in an empty-string key-value pair being sent to the server.
  const exchangeReq: TokenExchangeRequest = {
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: bravoToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  };

  const params = new URLSearchParams({
    grant_type: exchangeReq.grant_type,
    subject_token: exchangeReq.subject_token,
    subject_token_type: exchangeReq.subject_token_type,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (exchangeReq.requested_token_type) {
    params.set('requested_token_type', exchangeReq.requested_token_type);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Step 1 token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TokenExchangeResponse;
  return data.access_token;
}

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

  // ── 2. Verify and decode the bravo JWT ────────────────────────────────────
  // Validate the required env var before entering the JWT try/catch so that
  // a missing configuration returns HTTP 500 (server error) rather than
  // HTTP 401 (auth failure), which would mislead operators and monitors.
  const bravoIssuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!bravoIssuer) {
    return NextResponse.json(
      {
        error: 'configuration_error',
        message: 'MERCHANT_OIDC_ISSUER environment variable is not set',
      },
      { status: 500 },
    );
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(bravoToken, getBravoJwks(), {
      issuer: bravoIssuer,
    });
    payload = result.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bravo JWT verification failed.';
    return NextResponse.json({ error: 'unauthorized', message }, { status: 401 });
  }

  // Extract user claims from the bravo JWT.
  // AIC access tokens can include profile claims via claim-mapping scripts.
  // The field names follow AIC/LDAP conventions: givenName, sn, uid.
  // Fall back to OIDC standard claim names (given_name, family_name,
  // preferred_username) if the AIC claim mapping uses those instead.
  // Ultimately fall back to session.user data which comes from the ID token.
  const sub = payload.sub ?? '';
  if (!sub) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Bravo JWT is missing the sub claim.' },
      { status: 400 },
    );
  }

  const givenName: string =
    (payload['givenName'] as string | undefined) ??
    (payload['given_name'] as string | undefined) ??
    (session.user?.name?.split(' ')[0]) ??
    '';

  const sn: string =
    (payload['sn'] as string | undefined) ??
    (payload['family_name'] as string | undefined) ??
    (session.user?.name?.split(' ').slice(1).join(' ')) ??
    '';

  const email: string =
    (payload['email'] as string | undefined) ??
    (payload['mail'] as string | undefined) ??
    session.user?.email ??
    '';

  // userName: AIC access tokens commonly include `uid` or `preferred_username`.
  // Fall back to sub (the bravo _id) if no username claim is available.
  const userName: string =
    (payload['uid'] as string | undefined) ??
    (payload['preferred_username'] as string | undefined) ??
    sub;

  // ── 3. Obtain a service-account alpha token for IDM operations ─────────────
  let serviceToken: string;
  try {
    serviceToken = await getServiceAccountToken();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service-account token request failed.';
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 });
  }

  // ── 4 + 5. JIT-provision alpha_user if not already present ─────────────────
  try {
    const exists = await alphaUserExists(sub, serviceToken);
    if (!exists) {
      await createAlphaUser(sub, userName, givenName, sn, email, serviceToken);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alpha user provisioning failed.';
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 });
  }

  // ── 6. Step 1 token exchange: bravo → alpha ────────────────────────────────
  let alphaToken: string;
  try {
    alphaToken = await exchangeBravoForAlphaToken(bravoToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed.';
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 });
  }

  // ── 7. Return the alpha access_token ──────────────────────────────────────
  return NextResponse.json({ accessToken: alphaToken });
}
