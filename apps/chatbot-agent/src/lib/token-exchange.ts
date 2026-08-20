// RFC 8693 token exchange helper for chatbot-agent.
//
// Used by `POST /api/chat` (Task 10) to perform Step 2 of the two-step AIC
// token exchange: exchange an payment realm user token for a chatbot-agent
// agent token using the chatbot-agent client credentials.
//
// Uses native `fetch` — no external OAuth2 library required.

import type { TokenExchangeRequest, TokenExchangeResponse } from '@acme/shared';

/** Options required to authenticate the exchange request against the token endpoint. */
export interface TokenExchangeOptions {
  /** Token endpoint URL, e.g. `https://idc.scheuber.io/am/oauth2/realms/root/realms/payment/access_token`. */
  tokenEndpoint: string;
  /** OAuth2 client_id used to authenticate the exchange request. */
  clientId: string;
  /** OAuth2 client_secret used to authenticate the exchange request. */
  clientSecret: string;
}

/**
 * Perform an RFC 8693 token exchange using `application/x-www-form-urlencoded`
 * POST against the specified token endpoint.
 *
 * The `client_id` and `client_secret` in `options` are sent as body parameters
 * (matching `tokenEndpointAuthMethod: "client_secret_post"` in all AIC client
 * inputs). No `Authorization` header is added.
 *
 * Throws on HTTP errors or network failures.
 */
export async function exchangeToken(
  params: TokenExchangeRequest,
  options: TokenExchangeOptions,
): Promise<TokenExchangeResponse> {
  const body = new URLSearchParams({
    grant_type: params.grant_type,
    subject_token: params.subject_token,
    subject_token_type: params.subject_token_type,
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });

  if (params.requested_token_type !== undefined) {
    body.set('requested_token_type', params.requested_token_type);
  }
  if (params.audience !== undefined) {
    body.set('audience', params.audience);
  }
  if (params.scope !== undefined) {
    body.set('scope', params.scope);
  }

  const response = await fetch(options.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (HTTP ${response.status}): ${text}`);
  }

  return response.json() as Promise<TokenExchangeResponse>;
}
