/**
 * RFC 8693 token exchange request and response types.
 *
 * Used by `merchant-web`'s server-side proxy which delegates to
 * `chatbot-agent`'s `/api/auth/exchange` endpoint (Step 1: bravo → alpha)
 * and `chatbot-agent`'s `/api/chat` route (Step 2: alpha user → agent token).
 *
 * Named exports only per repo convention.
 */

/**
 * Parameters for a token exchange request (RFC 8693 §2.1).
 *
 * All fields are typed as strings to match the `application/x-www-form-urlencoded`
 * encoding used by OAuth2 token endpoints.
 */
export interface TokenExchangeRequest {
  /** MUST be `urn:ietf:params:oauth:grant-type:token-exchange`. */
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange';
  /**
   * Security token representing the identity of the party on behalf of whom
   * the request is being made.
   */
  subject_token: string;
  /**
   * Identifier for the type of the requested security token.
   * Typically `urn:ietf:params:oauth:token-type:access_token`.
   */
  subject_token_type: string;
  /**
   * Identifier for the type of the token to be issued.
   * Typically `urn:ietf:params:oauth:token-type:access_token`.
   */
  requested_token_type?: string;
  /** The logical name of the target service where the token will be used. */
  audience?: string;
  /** Space-delimited list of requested scopes. */
  scope?: string;
}

/**
 * Successful token exchange response (RFC 8693 §2.2.1).
 */
export interface TokenExchangeResponse {
  /** The security token that was issued. */
  access_token: string;
  /**
   * Identifier for the type of the issued token.
   * Typically `urn:ietf:params:oauth:token-type:access_token`.
   */
  issued_token_type: string;
  /** Token type, e.g. `Bearer`. */
  token_type: string;
  /** Lifetime in seconds of the issued token. */
  expires_in: number;
  /** Granted scopes, if different from what was requested. */
  scope?: string;
}
