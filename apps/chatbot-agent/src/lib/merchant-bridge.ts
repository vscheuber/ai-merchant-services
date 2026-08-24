// Step 1 (Merchant IDP → Payment Provider), owned entirely by chatbot-agent.
//
// The shopper's browser silently SSOs into a payment-provider-owned public
// client registered in the merchant IDP (`merchant-bridge`) and hands this
// server the resulting PKCE authorization code (never the exchanged token) —
// see `public/embed.js` and `public/silent-callback.html`. The browser never
// calls the merchant IDP's token endpoint directly: AM's OAuth2 token
// endpoint has no CORS headers for browser-originated requests by default,
// and enabling that tenant-wide is unnecessary when this server can do the
// exchange itself. From there this module:
//
//   1. exchangeMerchantAuthCodeForIdToken — server-to-server PKCE code
//      exchange against the merchant IDP's own token endpoint, using
//      `merchant-bridge`'s public-client credentials (no secret, per PKCE).
//   2. authenticateMerchantTokenLoginJourney — runs the `merchant-token-login`
//      AM journey in the payment-provider realm, which validates the merchant
//      ID token against that merchant's registered trusted-issuer config and
//      JIT-looks-up/creates the corresponding alpha_user. Returns an AM session
//      tokenId, not yet an OAuth token.
//   3. bridgeSessionToAccessToken — converts that AM session into a real access
//      token via the `payment-bridge` confidential client, using the documented
//      session→token bridge pattern (`csrf`/`decision=allow` against
//      /oauth2/authorize, then a normal authorization_code exchange).
//
// The resulting access token's `sub` is the JIT-resolved `alpha_user._id` and
// feeds unchanged into the existing Step 2 exchange (`token-exchange.ts`).

import type { TokenTraceStage } from '@acme/shared';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// ── Step 1a1: exchange the widget's PKCE code for a merchant ID token ───────

/**
 * Exchange the PKCE authorization code the widget's silent-SSO popup
 * received from the merchant IDP for a merchant ID token — server-to-server,
 * so the merchant IDP's token endpoint never needs to answer a
 * browser-originated (CORS) request.
 *
 * Reads env vars: `MERCHANT_IDP_TOKEN_URL`, `MERCHANT_BRIDGE_CLIENT_ID`,
 * `MERCHANT_BRIDGE_REDIRECT_URI` (must exactly match the `redirect_uri` the
 * browser used when starting the authorize request, i.e.
 * `public/silent-callback.html`'s registered URL).
 */
export async function exchangeMerchantAuthCodeForIdToken(
  code: string,
  codeVerifier: string,
  trace?: TokenTraceStage[],
  traceRaw = false,
): Promise<string> {
  const tokenUrl = requireEnv('MERCHANT_IDP_TOKEN_URL');
  const clientId = requireEnv('MERCHANT_BRIDGE_CLIENT_ID');
  const redirectUri = requireEnv('MERCHANT_BRIDGE_REDIRECT_URI');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    trace?.push({
      name: 'step-1-merchant-code-exchange',
      status: 'failed',
      endpoint: tokenUrl,
      message: `HTTP ${response.status}: ${text.slice(0, 300)}`,
    });
    throw new Error(`Merchant code exchange failed: HTTP ${response.status}`);
  }

  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) {
    trace?.push({
      name: 'step-1-merchant-code-exchange',
      status: 'failed',
      endpoint: tokenUrl,
      message: 'Token response missing id_token',
    });
    throw new Error('Merchant code exchange failed: token response missing id_token');
  }

  trace?.push({
    name: 'step-1-merchant-code-exchange',
    status: 'succeeded',
    endpoint: tokenUrl,
    rawToken: traceRaw ? body.id_token : undefined,
  });
  return body.id_token;
}

// ── Step 1a2: run the merchant-token-login journey ───────────────────────────

interface AmAuthenticateResponse {
  tokenId?: string;
  authId?: string;
  callbacks?: unknown[];
}

/**
 * Authenticate a merchant ID token against the `merchant-token-login` AM
 * journey in the payment-provider (alpha) realm.
 *
 * Reads env vars: `AIC_ALPHA_AM_BASE_URL`, `MERCHANT_TOKEN_LOGIN_JOURNEY_ID`
 * (defaults to `merchant-token-login`).
 *
 * @returns the AM session `tokenId` on success.
 */
export async function authenticateMerchantTokenLoginJourney(
  merchantToken: string,
  merchantId: string,
  trace?: TokenTraceStage[],
  traceRaw = false,
): Promise<string> {
  const amBaseUrl = requireEnv('AIC_ALPHA_AM_BASE_URL').replace(/\/$/, '');
  const journeyId = process.env['MERCHANT_TOKEN_LOGIN_JOURNEY_ID'] ?? 'merchant-token-login';
  const authenticateUrl = `${amBaseUrl}/json/realms/root/realms/alpha/authenticate?authIndexType=service&authIndexValue=${encodeURIComponent(journeyId)}`;

  const response = await fetch(authenticateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-API-Version': 'resource=2.0, protocol=1.0',
      merchant_token: merchantToken,
      merchant_id: merchantId,
    },
    body: '{}',
  });

  const body = (await response.json().catch(() => ({}))) as AmAuthenticateResponse & {
    message?: string;
    code?: number;
  };

  if (!response.ok || !body.tokenId) {
    // The journey's SetFailureDetailsNode branches set a distinct `error`
    // response header per failure reason (e.g. "Unknown Merchant",
    // "Invalid Merchant Token", "Configuration Error", "JIT Provisioning
    // Error") — surface it when present for operator diagnostics.
    const journeyError = response.headers.get('error');
    const reason = journeyError ?? body.message ?? `HTTP ${response.status}`;
    trace?.push({
      name: 'step-1-merchant-token-login',
      status: 'failed',
      endpoint: authenticateUrl,
      message: reason.slice(0, 300),
    });
    throw new Error(`merchant-token-login journey failed: ${reason}`);
  }

  trace?.push({
    name: 'step-1-merchant-token-login',
    status: 'succeeded',
    endpoint: authenticateUrl,
    rawToken: traceRaw ? body.tokenId : undefined,
  });
  return body.tokenId;
}

// ── Step 1b: bridge the AM session into an OAuth access token ───────────────

interface AmServerInfo {
  cookieName?: string;
}

let cachedCookieName: string | null = null;

/**
 * Discover the tenant's actual SSO cookie name via the unauthenticated
 * serverinfo endpoint. AIC assigns a unique pseudo-random cookie name per
 * tenant — never hardcode `iPlanetDirectoryPro`. Cached per process since it
 * does not change at runtime.
 */
async function discoverCookieName(amBaseUrl: string): Promise<string> {
  if (cachedCookieName) return cachedCookieName;
  const response = await fetch(`${amBaseUrl}/json/serverinfo/*`);
  if (!response.ok) {
    throw new Error(`Failed to discover AM SSO cookie name (HTTP ${response.status})`);
  }
  const info = (await response.json()) as AmServerInfo;
  if (!info.cookieName) {
    throw new Error('AM serverinfo response did not include cookieName');
  }
  cachedCookieName = info.cookieName;
  return cachedCookieName;
}

/**
 * Bridge an AM session (`tokenId`) into a real OAuth2 access token using the
 * `payment-bridge` confidential client.
 *
 * Reads env vars: `AIC_ALPHA_AM_BASE_URL`, `AIC_ALPHA_TOKEN_ENDPOINT` (shared
 * with the Step 2 exchange — same tenant/realm token endpoint, different
 * grant), `PAYMENT_BRIDGE_CLIENT_ID`, `PAYMENT_BRIDGE_CLIENT_SECRET`,
 * `PAYMENT_BRIDGE_REDIRECT_URI`.
 *
 * @returns the resulting `access_token`, whose `sub` is the JIT-resolved
 * `alpha_user._id`.
 */
export async function bridgeSessionToAccessToken(
  tokenId: string,
  trace?: TokenTraceStage[],
  traceRaw = false,
): Promise<string> {
  const amBaseUrl = requireEnv('AIC_ALPHA_AM_BASE_URL').replace(/\/$/, '');
  const tokenEndpoint = requireEnv('AIC_ALPHA_TOKEN_ENDPOINT');
  const clientId = requireEnv('PAYMENT_BRIDGE_CLIENT_ID');
  const clientSecret = requireEnv('PAYMENT_BRIDGE_CLIENT_SECRET');
  const redirectUri = requireEnv('PAYMENT_BRIDGE_REDIRECT_URI');

  const cookieName = await discoverCookieName(amBaseUrl);

  const authorizeUrl =
    `${amBaseUrl}/oauth2/realms/root/realms/alpha/authorize?` +
    new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      decision: 'allow',
      csrf: tokenId,
    }).toString();

  const authorizeResponse = await fetch(authorizeUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { Cookie: `${cookieName}=${tokenId}` },
  });

  const location = authorizeResponse.headers.get('location');
  if (!location) {
    trace?.push({
      name: 'step-1-session-to-token-bridge',
      status: 'failed',
      endpoint: authorizeUrl,
      message: `No redirect from /oauth2/authorize (HTTP ${authorizeResponse.status})`,
    });
    throw new Error(
      `Session→token bridge failed: /oauth2/authorize did not redirect (HTTP ${authorizeResponse.status})`,
    );
  }

  const code = new URL(location).searchParams.get('code');
  if (!code) {
    const oauthError = new URL(location).searchParams.get('error');
    trace?.push({
      name: 'step-1-session-to-token-bridge',
      status: 'failed',
      endpoint: authorizeUrl,
      message: oauthError ?? 'No code in /oauth2/authorize redirect',
    });
    throw new Error(`Session→token bridge failed: ${oauthError ?? 'no authorization code returned'}`);
  }

  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    trace?.push({
      name: 'step-1-session-to-token-bridge',
      status: 'failed',
      endpoint: tokenEndpoint,
      message: `HTTP ${tokenResponse.status}: ${text.slice(0, 300)}`,
    });
    throw new Error(`Session→token bridge failed: token endpoint returned HTTP ${tokenResponse.status}`);
  }

  const tokenBody = (await tokenResponse.json()) as { access_token?: string; token_type?: string };
  if (!tokenBody.access_token) {
    throw new Error('Session→token bridge failed: token response missing access_token');
  }

  trace?.push({
    name: 'step-1-session-to-token-bridge',
    status: 'succeeded',
    endpoint: tokenEndpoint,
    tokenType: tokenBody.token_type,
    rawToken: traceRaw ? tokenBody.access_token : undefined,
  });
  return tokenBody.access_token;
}

// ── Combined Step 1b+1c ──────────────────────────────────────────────────────

/**
 * Run the merchant-ID-token half of Step 1 end to end: merchant ID token →
 * AM session → payment realm access token. Takes an already-obtained
 * merchant ID token — callers that only have the widget's PKCE code should
 * call `exchangeMerchantAuthCodeForIdToken` first (see `POST /api/chat`,
 * which does this once per silent-SSO attempt and has the widget cache the
 * resulting ID token for subsequent chat turns, since the authorization code
 * itself is single-use).
 */
export async function exchangeMerchantTokenForPaymentToken(
  merchantToken: string,
  merchantId: string,
  trace?: TokenTraceStage[],
  traceRaw = false,
): Promise<string> {
  const tokenId = await authenticateMerchantTokenLoginJourney(
    merchantToken,
    merchantId,
    trace,
    traceRaw,
  );
  return bridgeSessionToAccessToken(tokenId, trace, traceRaw);
}
