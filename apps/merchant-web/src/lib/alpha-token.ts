// Server-side utility: exchange a bravo realm access_token for an alpha realm access_token.
//
// Encapsulates the full Step 1 flow used by both the `/api/chatbot/token` route
// and the merchant-web server pages that need to call the payment-api:
//   1. Verify and decode the bravo JWT using the bravo realm JWKS.
//   2. Obtain a service-account alpha token for AIC IDM operations.
//   3. JIT-provision an alpha_user if one does not yet exist.
//   4. Exchange the bravo token for an alpha realm user access_token.
//
// Environment variables (all required at runtime):
//   MERCHANT_OIDC_ISSUER         — Bravo realm issuer URL; JWKS URI derived as
//                                   {MERCHANT_OIDC_ISSUER}/connect/jwk_uri
//   PAYMENT_API_CLIENT_ID        — OAuth2 client ID for the payment-api in the alpha realm
//   PAYMENT_API_CLIENT_SECRET    — OAuth2 client secret for the payment-api client
//   AIC_ALPHA_TOKEN_ENDPOINT     — Alpha realm token endpoint URL
//   AIC_IDM_BASE_URL             — AIC IDM REST API base URL

import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

/**
 * AIC OIDC discovery returns issuers with an explicit :443 port even though
 * it's the HTTPS default (e.g. "https://idc.mytest.run:443/am/oauth2").
 * jose's jwtVerify does an exact-string issuer comparison, so we normalise
 * our configured issuer URLs to include :443 before passing them to jwtVerify.
 */
function normalizeIssuer(issuer: string): string {
  // Already has a port — leave it unchanged.
  if (/^https?:\/\/[^/]+:\d+/.test(issuer)) return issuer;
  // Insert :443 after the hostname for HTTPS issuers.
  if (issuer.startsWith('https://')) {
    return issuer.replace(/^(https:\/\/[^/]+)/, '$1:443');
  }
  return issuer;
}
import type { TokenExchangeRequest, TokenExchangeResponse } from '@acme/shared';

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

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Exchange a bravo realm access_token for an alpha realm access_token.
 *
 * Performs the full Step 1 flow: bravo JWT verification, service-account token
 * acquisition, JIT alpha_user provisioning (if absent), and the RFC 8693
 * token-exchange call.
 *
 * @param bravoToken  The bravo realm access_token from the Auth.js session.
 * @param sessionUser Optional session user object used as claim fallbacks
 *                    (`name` → givenName/sn, `email`) when the bravo JWT itself
 *                    does not include those claims.
 * @returns The alpha realm access_token string.
 * @throws  If the exchange fails (misconfigured env, AIC unavailable, etc.).
 */
export async function getAlphaToken(
  bravoToken: string,
  sessionUser?: { name?: string | null; email?: string | null } | null,
): Promise<string> {
  // 1. Verify and decode the bravo JWT.
  const bravoIssuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!bravoIssuer) {
    throw new Error('MERCHANT_OIDC_ISSUER environment variable is not set');
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(bravoToken, getBravoJwks(), { issuer: normalizeIssuer(bravoIssuer) });
    payload = result.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bravo JWT verification failed.';
    throw new Error(`Bravo JWT verification failed: ${message}`);
  }

  const sub = payload.sub ?? '';
  if (!sub) {
    throw new Error('Bravo JWT is missing the sub claim.');
  }

  // Extract user claims for JIT provisioning, falling back to session user data.
  const givenName: string =
    (payload['givenName'] as string | undefined) ??
    (payload['given_name'] as string | undefined) ??
    sessionUser?.name?.split(' ')[0] ??
    '';

  const sn: string =
    (payload['sn'] as string | undefined) ??
    (payload['family_name'] as string | undefined) ??
    sessionUser?.name?.split(' ').slice(1).join(' ') ??
    '';

  const email: string =
    (payload['email'] as string | undefined) ??
    (payload['mail'] as string | undefined) ??
    sessionUser?.email ??
    '';

  const userName: string =
    (payload['uid'] as string | undefined) ??
    (payload['preferred_username'] as string | undefined) ??
    sub;

  // 2. Obtain a service-account alpha token for IDM operations.
  const serviceToken = await getServiceAccountToken();

  // 3. JIT-provision alpha_user if not already present.
  const exists = await alphaUserExists(sub, serviceToken);
  if (!exists) {
    await createAlphaUser(sub, userName, givenName, sn, email, serviceToken);
  }

  // 4. Exchange the bravo token for an alpha realm user access_token.
  return exchangeBravoForAlphaToken(bravoToken);
}
