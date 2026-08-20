// Server-side utility: exchange a merchant realm access_token for an payment realm access_token.
//
// Encapsulates the full Step 1 flow used by both the `/api/chatbot/token` route
// and the merchant-web server pages that need to call the payment-api:
//   1. Verify and decode the merchant JWT using the merchant realm JWKS.
//   2. Obtain a service-account payment token for AIC IDM operations.
//   3. JIT-provision an payment_user if one does not yet exist.
//   4. Exchange the merchant token for an payment realm user access_token.
//
// Environment variables (all required at runtime):
//   MERCHANT_OIDC_ISSUER         — Merchant realm issuer URL; JWKS URI derived as
//                                   {MERCHANT_OIDC_ISSUER}/connect/jwk_uri
//   PAYMENT_API_CLIENT_ID        — OAuth2 client ID for the payment-api in the payment realm
//   PAYMENT_API_CLIENT_SECRET    — OAuth2 client secret for the payment-api client
//   AIC_ALPHA_TOKEN_ENDPOINT     — Payment realm token endpoint URL
//   AIC_IDM_BASE_URL             — AIC IDM REST API base URL

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
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
import type { TokenExchangeRequest, TokenExchangeResponse, TokenTrace, TokenTraceStage } from '@acme/shared';

type TokenTraceOptions = {
  enabled?: boolean
  rawTokens?: boolean
  onTrace?: (trace: TokenTrace) => void
}

let lastTokenTrace: TokenTrace | null = null

function publishTrace(stages: TokenTraceStage[], options: TokenTraceOptions): void {
  if (!options.enabled || !options.onTrace) return
  const trace: TokenTrace = {
    requestId: crypto.randomUUID(),
    capturedAt: new Date().toISOString(),
    stages: [...stages],
  }
  lastTokenTrace = trace
  options.onTrace(trace)
}

function decodeJwtClaims(token: string): Record<string, unknown> | undefined {
  const payload = token.split('.')[1]
  if (!payload) return undefined
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4)
    const parsed: unknown = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return undefined
    const claims = { ...(parsed as Record<string, unknown>) }
    for (const key of Object.keys(claims)) {
      if (/token|secret/i.test(key)) delete claims[key]
    }
    return claims
  } catch {
    return undefined
  }
}

// ─── Merchant JWKS (lazily initialised, reused across requests) ────────────────

/** Lazily-initialised JWKS set for the merchant realm. Cached for the worker lifetime. */
let merchantJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Returns a RemoteJWKSet for the merchant realm.
 * The JWKS URI is derived from MERCHANT_OIDC_ISSUER:
 *   {issuer}/connect/jwk_uri  (standard AIC/AM JWKS path)
 */
function getMerchantJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (merchantJwks) return merchantJwks;
  const merchantIssuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!merchantIssuer) {
    throw new Error('MERCHANT_OIDC_ISSUER environment variable is not set');
  }
  merchantJwks = createRemoteJWKSet(new URL(`${merchantIssuer.replace(/\/$/, '')}/connect/jwk_uri`));
  return merchantJwks;
}

/** Return the configured OAuth client credentials used for token introspection. */
function getMerchantClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env['MERCHANT_OIDC_CLIENT_ID'];
  const clientSecret = process.env['MERCHANT_OIDC_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing required env vars: MERCHANT_OIDC_CLIENT_ID, MERCHANT_OIDC_CLIENT_SECRET',
    );
  }
  return { clientId, clientSecret };
}

/**
 * AIC may issue HS256 access tokens without publishing the signing secret in
 * the JWKS. Introspection is the authoritative way to validate those tokens.
 */
async function introspectMerchantToken(token: string, issuer: string): Promise<JWTPayload> {
  const { clientId, clientSecret } = getMerchantClientCredentials();
  const endpoint = `${normalizeIssuer(issuer).replace(/\/$/, '')}/introspect`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Merchant token introspection failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  if (data['active'] !== true) {
    throw new Error('Merchant access token is inactive or expired');
  }

  const tokenIssuer = data['iss'];
  if (typeof tokenIssuer === 'string' && tokenIssuer !== normalizeIssuer(issuer)) {
    throw new Error('Merchant access token issuer is invalid');
  }

  return data as JWTPayload;
}

/** Verify a public-key token locally, or introspect an HMAC token. */
async function verifyMerchantToken(token: string, issuer: string): Promise<JWTPayload> {
  const { alg } = decodeProtectedHeader(token);
  if (alg?.startsWith('HS')) return introspectMerchantToken(token, issuer);

  const result = await jwtVerify(token, getMerchantJwks(), { issuer: normalizeIssuer(issuer) });
  return result.payload;
}

// ─── Service-account token ───────────────────────────────────────────────────

/**
 * Obtains a service-account payment access_token for the payment-api client using
 * client_credentials. This token carries the `fr:idm:*` scope required to
 * read and create managed objects in AIC IDM.
 */
async function getServiceAccountToken(
  trace?: TokenTraceStage[],
  traceRaw = false,
): Promise<string> {
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
    trace?.push({
      name: 'payment-service-token',
      status: 'failed',
      endpoint: tokenEndpoint,
      httpStatus: response.status,
      message: text.slice(0, 300),
    });
    throw new Error(`Service-account token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token: string; token_type?: string; scope?: string | string[] };
  trace?.push({
    name: 'payment-service-token',
    status: 'succeeded',
    endpoint: tokenEndpoint,
    httpStatus: response.status,
    tokenType: data.token_type,
    scope: data.scope,
    rawToken: traceRaw ? data.access_token : undefined,
    claims: decodeJwtClaims(data.access_token),
  });
  return data.access_token;
}

// ─── AIC IDM helpers ─────────────────────────────────────────────────────────

/**
 * Checks whether a payment-provider managed user with the given _id already exists in AIC IDM.
 * Returns true if the user record was found, false if the IDM API returned 404.
 * Throws on any other non-OK response.
 */
async function paymentUserExists(sub: string, serviceToken: string, trace?: TokenTraceStage[]): Promise<boolean> {
  const idmBaseUrl = process.env['AIC_IDM_BASE_URL'];
  if (!idmBaseUrl) throw new Error('AIC_IDM_BASE_URL environment variable is not set');
  const endpoint = `${idmBaseUrl}/managed/alpha_user/${encodeURIComponent(sub)}`;

  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${serviceToken}` },
  });

  trace?.push({
    name: 'idm-lookup',
    status: response.ok ? 'succeeded' : response.status === 404 ? 'not-found' : 'failed',
    endpoint,
    httpStatus: response.status,
    tokenType: 'Bearer service token',
  });

  if (response.ok) return true;
  if (response.status === 404) return false;

  const text = await response.text();
  throw new Error(`IDM user lookup failed: ${response.status} ${text}`);
}

/**
 * JIT-provisions a new payment-provider managed user in AIC IDM using a PUT request.
 * The `_id` is set to the merchant JWT's `sub` so that AIC's trusted-JWT-issuer
 * mapping can locate the payment user during token exchange.
 *
 * A 409 (conflict) response is treated as a no-op: another request raced and
 * already created the user.
 */
async function createPaymentUser(
  sub: string,
  userName: string,
  givenName: string,
  sn: string,
  email: string,
  serviceToken: string,
  trace?: TokenTraceStage[],
): Promise<void> {
  const idmBaseUrl = process.env['AIC_IDM_BASE_URL'];
  if (!idmBaseUrl) throw new Error('AIC_IDM_BASE_URL environment variable is not set');

  const body = {
    _id: sub,
    userName,
    givenName,
    sn,
    // AIC IDM uses `mail` as the attribute name for email in payment-provider managed user.
    mail: email,
    accountStatus: 'active',
  };

  const endpoint = `${idmBaseUrl}/managed/alpha_user/${encodeURIComponent(sub)}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = response.ok || response.status === 409 ? undefined : (await response.clone().text()).slice(0, 500)
  trace?.push({
    name: 'idm-jit-provision',
    status: response.ok || response.status === 409 ? 'succeeded' : 'failed',
    endpoint,
    httpStatus: response.status,
    tokenType: 'Bearer service token',
    message: responseText,
  });

  // 201 = created, 200 = replaced, 409 = conflict (race — already exists, safe to ignore).
  if (!response.ok && response.status !== 409) {
    const text = await response.text();
    throw new Error(`Failed to JIT-provision payment user '${sub}': ${response.status} ${text}`);
  }
}

// ─── Step 1 token exchange ───────────────────────────────────────────────────

/**
 * Performs Step 1 of the two-step AIC token exchange:
 *   merchant access_token  →  payment realm user access_token
 *
 * Uses the payment-api client credentials + the RFC 8693 token-exchange grant.
 * AIC validates the merchant token via the trusted-JWT-issuer configuration in the
 * payment realm and issues an payment access_token for the same subject.
 */
async function exchangeMerchantForPaymentToken(
  merchantToken: string,
  trace?: TokenTraceStage[],
  traceRaw = false,
): Promise<string> {
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
    subject_token: merchantToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope: 'openid profile email',
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
  if (exchangeReq.scope) {
    params.set('scope', exchangeReq.scope);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    trace?.push({
      name: 'step-1-merchant-to-payment',
      status: 'failed',
      endpoint: tokenEndpoint,
      httpStatus: response.status,
      message: text.slice(0, 300),
    });
    throw new Error(`Step 1 token exchange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as TokenExchangeResponse;
  trace?.push({
    name: 'step-1-merchant-to-payment',
    status: 'succeeded',
    endpoint: tokenEndpoint,
    httpStatus: response.status,
    tokenType: data.token_type,
    scope: data.scope,
    rawToken: traceRaw ? data.access_token : undefined,
    claims: decodeJwtClaims(data.access_token),
  });
  return data.access_token;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Exchange a merchant realm access_token for an payment realm access_token.
 *
 * Performs the full Step 1 flow: merchant JWT verification, service-account token
 * acquisition, JIT payment_user provisioning (if absent), and the RFC 8693
 * token-exchange call.
 *
 * @param merchantToken  The merchant realm access_token from the Auth.js session.
 * @param sessionUser Optional session user object used as claim fallbacks
 *                    (`name` → givenName/sn, `email`) when the merchant JWT itself
 *                    does not include those claims.
 * @returns The payment realm access_token string.
 * @throws  If the exchange fails (misconfigured env, AIC unavailable, etc.).
 */
export async function getPaymentTokenDiagnostics(
  merchantToken: string,
  sessionUser?: { name?: string | null; email?: string | null } | null,
  traceOptions?: TokenTraceOptions,
): Promise<string> {
  const trace: TokenTraceStage[] = []
  const traceEnabled = traceOptions?.enabled === true
  const traceRaw = traceOptions?.rawTokens === true
  const publish = () => publishTrace(trace, traceOptions ?? {})

  if (traceEnabled) {
    trace.push({
      name: 'merchant-token',
      status: 'started',
      tokenType: 'Bearer access token',
      rawToken: traceRaw ? merchantToken : undefined,
    })
  }

  // 1. Verify and decode the merchant JWT.
  const merchantIssuer = process.env['MERCHANT_OIDC_ISSUER'];
  if (!merchantIssuer) {
    throw new Error('MERCHANT_OIDC_ISSUER environment variable is not set');
  }

  let payload: JWTPayload;
  try {
    payload = await verifyMerchantToken(merchantToken, merchantIssuer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Merchant JWT verification failed.';
    if (traceEnabled) {
      trace[0] = {
        name: 'merchant-token',
        status: 'failed',
        tokenType: 'Bearer access token',
        rawToken: traceRaw ? merchantToken : undefined,
        message,
        claims: decodeJwtClaims(merchantToken),
      }
      publish()
    }
    throw new Error(`Merchant JWT verification failed: ${message}`);
  }

  const sub = payload.sub ?? '';
  if (!sub) {
    throw new Error('Merchant JWT is missing the sub claim.');
  }

  // Extract user claims for JIT provisioning, falling back to session user data.
  // Access tokens issued by the merchant provider may contain only protocol
  // claims. Keep JIT payloads schema-valid even when profile claims are absent;
  // Auth.js profile data is used first, with deterministic demo-safe fallbacks.
  const givenName: string =
    (payload['givenName'] as string | undefined) ??
    (payload['given_name'] as string | undefined) ??
    sessionUser?.name?.split(' ')[0] ??
    'Shopper';

  const sn: string =
    (payload['sn'] as string | undefined) ??
    (payload['family_name'] as string | undefined) ??
    sessionUser?.name?.split(' ').slice(1).join(' ') ??
    'Guest';

  const email: string =
    (payload['email'] as string | undefined) ??
    (payload['mail'] as string | undefined) ??
    sessionUser?.email ??
    `${sub}@northwind.local`;

  const userName: string =
    (payload['uid'] as string | undefined) ??
    (payload['preferred_username'] as string | undefined) ??
    sub;

  if (traceEnabled) {
    trace[0] = {
      name: 'merchant-token',
      status: 'succeeded',
      tokenType: 'Bearer access token',
      rawToken: traceRaw ? merchantToken : undefined,
      claims: decodeJwtClaims(merchantToken),
    }
  }

  // 2. Obtain a service-account payment token for IDM operations.
  let serviceToken: string
  try {
    serviceToken = await getServiceAccountToken(traceEnabled ? trace : undefined, traceRaw)
  } catch (error) {
    if (traceEnabled) {
      trace.push({
        name: 'payment-service-token',
        status: 'failed',
        message: error instanceof Error ? error.message.slice(0, 300) : 'Service token request failed',
      })
      publish()
    }
    throw error
  }

  // 3. JIT-provision payment_user if not already present.
  try {
    const exists = await paymentUserExists(sub, serviceToken, traceEnabled ? trace : undefined)
    if (!exists) {
      await createPaymentUser(sub, userName, givenName, sn, email, serviceToken, traceEnabled ? trace : undefined)
    }
  } catch (error) {
    if (traceEnabled) publish()
    throw error
  }

  // 4. Exchange the merchant token for an payment realm user access_token.
  let paymentToken: string
  try {
    paymentToken = await exchangeMerchantForPaymentToken(
      merchantToken,
      traceEnabled ? trace : undefined,
      traceRaw,
    )
  } catch (error) {
    if (traceEnabled) publish()
    throw error
  }
  if (traceEnabled) publish()
  return paymentToken
}

export const getPaymentToken = getPaymentTokenDiagnostics

export function getLastTokenTrace(): TokenTrace | null {
  return lastTokenTrace
}
