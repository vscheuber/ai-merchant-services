/**
 * Chat API protocol types shared between chatbot-agent and merchant-web.
 *
 * `ChatMessage` / `ChatRequest` / `ChatResponse` are promoted from the local
 * definition in `chatbot-agent/src/app/api/chat/route.ts` so the overlay fetch
 * payload and the API route share a single canonical shape.
 *
 * Named exports only per repo convention.
 */

/** A single turn in a chat conversation. */
export interface ChatMessage {
  /** Conversation role for the LLM. */
  role: 'system' | 'user' | 'assistant';
  /** Text content of the turn. */
  content: string;
}

/**
 * Proposed product purchase extracted from a chatbot response.
 *
 * Populated by the chatbot-agent server when the LLM proposes a specific
 * item for the shopper to confirm. The embed overlay uses this to populate
 * the "Confirm & pay" consent button.
 */
export interface ProposedPurchase {
  /** Product SKU from `data/products.json`. */
  sku: string;
  /** Human-readable product name. */
  productName: string;
  /** Unit price in major currency units. */
  unitPrice: number;
  /** Quantity being proposed. */
  quantity: number;
  /** ISO 4217 currency code, e.g. `USD`. */
  currency: string;
}

/**
 * Body sent by the client (embed.js) to `POST /api/chat`.
 *
 * On the first chat turn after a successful silent-SSO popup, the widget has
 * only a one-time-use PKCE authorization code pair (`merchantAuthCode` +
 * `merchantCodeVerifier`); the chatbot-agent server exchanges it for a
 * merchant ID token itself (server-to-server, so the merchant IDP never
 * needs browser-facing CORS configured for its token endpoint) and returns
 * that token in `ChatResponse.merchantToken` for the widget to cache. Every
 * subsequent turn sends that cached `merchantToken` directly instead —
 * skipping the (already-consumed) auth code. Either form feeds into Step 1
 * (the `merchant-token-login` AM journey, then the session→token bridge)
 * before Step 2. All are absent when the shopper has no merchant IDP session
 * (guest mode) — the assistant still answers catalog questions without them.
 *
 * When `confirmedAt` and `proposedPurchase` are both present, the chatbot-agent
 * server interprets the request as a checkout confirmation event and calls
 * `POST /api/checkout` on the payment-api instead of calling the LLM again.
 */
export interface ChatRequest {
  /** Conversation history to send to the LLM. */
  messages: readonly ChatMessage[];
  /** PKCE authorization code from the widget's silent-SSO popup. Only sent on the first turn; superseded by `merchantToken` once the server returns one. */
  merchantAuthCode?: string;
  /** PKCE code verifier for the same silent-SSO attempt. Required alongside `merchantAuthCode`. */
  merchantCodeVerifier?: string;
  /** Merchant ID token, once already exchanged server-side and cached by the widget (see `ChatResponse.merchantToken`). Takes priority over `merchantAuthCode` when both are somehow present. */
  merchantToken?: string;
  /** Canonical merchant identifier for the merchant this session belongs to. Required alongside `merchantAuthCode` or `merchantToken`. */
  merchantId?: string;
  /**
   * ISO-8601 timestamp of the shopper's "Confirm & pay" button click.
   * When present together with `proposedPurchase`, triggers a checkout call
   * rather than an LLM completion.
   */
  confirmedAt?: string;
  /**
   * The purchase the agent proposed in a prior turn.
   * Required when `confirmedAt` is present.
   */
  proposedPurchase?: ProposedPurchase;
  /** Enable demo-only token-exchange diagnostics for this request. */
  trace?: boolean;
  /** Include raw token strings in diagnostics only after explicit opt-in. */
  traceRaw?: boolean;
  /** Opaque browser/auth diagnostic session identifier. */
  traceSessionId?: string;
}

/**
 * Body returned by `POST /api/chat`.
 *
 * `proposedPurchase` is present when the LLM has identified a specific
 * product the shopper can purchase and is awaiting confirmation.
 */
export interface ChatResponse {
  /** The assistant turn to append to the conversation. */
  message: ChatMessage;
  /**
   * Product purchase proposed by the agent.
   *
   * When present, the overlay must activate the "Confirm & pay" consent
   * slot and disable further input until the shopper confirms or dismisses.
   */
  proposedPurchase?: ProposedPurchase;
  /**
   * The merchant ID token, present only when this request freshly exchanged
   * `merchantAuthCode` for one. The widget must cache this and send it back
   * as `merchantToken` on subsequent turns — the auth code that produced it
   * is already consumed and cannot be reused.
   */
  merchantToken?: string;
  /** Token-exchange diagnostics returned only when requested by the demo UI. */
  trace?: import('./token-trace').TokenTrace;
}
