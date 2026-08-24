# Architecture

## Overview

Three parties participate in every interaction:

1. **Consumer** — an authenticated shopper on the merchant's site interacting with the Acme Assist chat overlay.
2. **Merchant** — Northwind Retail. Owns the shopper's account, loyalty balance, and product catalog.
3. **Payment provider** — Acme Payments. Owns the wallet, checkout, transaction ledger, and hosts the chatbot.

---

## Application topology

```
                         ┌──────────────────────────────────────┐
                         │              Consumer                │
                         │  (authenticated shopper, browser)    │
                         └──────────────────┬───────────────────┘
                                            │
                                            ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │                       Merchant (Northwind Retail)                 │
   │                                                                   │
   │   merchant-web (:3000)  ──[<script>]──►  chatbot-agent (:3004)    │
   │                                              embed.js overlay     │
   │                                              renders in-page      │
   └───────────────────────────────────────────────────────────────────┘
                                            │
                                            ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │                    Payment provider (Acme Payments)               │
   │                                                                   │
   │   payment-api (:3003)    payment-user-web (:3001)                 │
   │   payment-admin-web (:3002)    chatbot-agent (:3004)              │
   └───────────────────────────────────────────────────────────────────┘
```

The primary chat surface is the overlay embedded inside `merchant-web` (renders on every route). `chatbot-agent` also exposes a standalone dev-preview at `http://localhost:3004/preview`.

---

## Apps and ports

| App                 | Brand               | Port | Role                                                                                      |
| ------------------- | ------------------- | ---: | ----------------------------------------------------------------------------------------- |
| `merchant-web`      | Northwind Retail    | 3000 | Demo storefront. Hosts shopper OIDC login. Embeds the Acme Assist overlay on every route. |
| `payment-user-web`  | Acme Payments       | 3001 | Consumer-facing payment dashboard (transactions, profile).                                |
| `payment-admin-web` | Acme Payments Admin | 3002 | Admin dashboard (funnel-per-merchant view, users, merchants).                             |
| `payment-api`       | Acme Payments       | 3003 | Payment REST API (JWT-protected). Reads and writes JSON seed data.                        |
| `chatbot-agent`     | Acme Assist         | 3004 | Hosts `/embed.js`, standalone `/preview`, and `POST /api/chat`.                           |

---

## Token flow

The chatbot requires the shopper's identity to be bridged from the merchant's identity domain into the payment provider's identity domain. This bridge (Step 1) is owned entirely by `chatbot-agent` — `apps/merchant-web` is not involved. Step 2 is an RFC 8693 token exchange.

```
 Consumer browser
 ────────────────────────────────────────────────────────────────

 1. Shopper logs in at merchant-web (unrelated to the chatbot)
    Auth.js v5 OIDC → merchant IDP (bravo realm)
    → merchant-web's own session cookie + a bravo AM SSO cookie,
      both set as a side effect of this login

 2. embed.js silently signs the shopper into a payment-provider-owned,
    additive public client (`merchant-bridge`, bravo realm) via a small
    popup — prompt=none + PKCE, reusing the bravo AM SSO cookie from
    step 1. Yields a one-time authorization code (never exchanged in
    the browser — see below).

 3. embed.js sends { messages, merchantAuthCode, merchantCodeVerifier,
    merchantId } to chatbot-agent's POST /api/chat.

 4. chatbot-agent (Step 1, server-to-server):
    a. Exchanges the code for a bravo ID token directly against the
       merchant IDP's token endpoint (no CORS setup needed there).
    b. Runs the `merchant-token-login` AM journey (alpha realm) with
       that ID token: validates it against the target merchant's
       `alpha_organization.merchantTrustedIssuerConfig`, then
       JIT-looks-up/creates the corresponding `alpha_user`. Returns an
       AM session, not yet an OAuth token.
    c. Bridges that AM session into a real alpha access_token via the
       `payment-bridge` confidential client (csrf/decision=allow
       session→token bridge pattern).
    chatbot-agent echoes the merchant ID token back to embed.js
    (`ChatResponse.merchantToken`) so later turns skip a-c and send
    the cached token directly — the authorization code is single-use.

 5. chatbot-agent performs Step 2 RFC 8693 exchange
    alpha user token → northwind-chatbot-agent token
    (token-exchange grant, audience=payment-api — required by AIC's
    AI Agent "Acting On Behalf Of" privilege model — using
    CHATBOT_AGENT_CLIENT_ID/SECRET)

 6. chatbot-agent calls payment-api
    Authorization: Bearer <chatbot-agent token>

 7. payment-api validates the token via RFC 7662 introspection
    (PAYMENT_OIDC_INTROSPECTION_URL) — not local JWKS verification: the
    alpha realm issues symmetric (HS256) stateless access tokens, whose
    key is never published via JWKS. payment-api's own client needs the
    am-introspect-all-tokens scope to introspect a token issued to a
    different client (northwind-chatbot-agent).
```

`apps/merchant-web`'s own account/products/checkout pages have a separate, unrelated token bridge (`src/lib/alpha-token.ts`, RFC 8693 exchange using the `payment-api` client and the bravo realm's trusted-JWT-issuer registration) for calling payment-api directly on the shopper's behalf — this has nothing to do with the chatbot.

See [identity.md](./identity.md) for a detailed explanation of each IDP, the token exchange mechanism, and JIT provisioning.

---

## Shared packages

| Package        | Description                                                                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@acme/ui`     | Tailwind preset, shadcn/ui primitives, `ThemeProvider`, `AppShell`, `ChatShell`.                                                                                                                                                                                            |
| `@acme/shared` | TypeScript domain types (`Merchant`, `Product`, `Cart`, `WalletCard`, `Transaction`, `LoyaltyBalance`, `MerchantIdentity`, `PaymentIdentity`, `CheckoutSession`, `ChatMessage`, `TokenExchangeRequest`, `TokenExchangeResponse`) and JSON read/write helpers for seed data. |

---

## Seed data

The `data/` directory holds JSON files used by `payment-api` and `merchant-web` as the backing store. All reads and writes go through helper functions in `@acme/shared`.

| File                | Contents                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `merchants.json`    | Northwind Retail and Contoso Goods merchant records.                                                                            |
| `products.json`     | Items across laptop, phone, headphone, gaming, and home categories; each carries a `merchantId`.                                |
| `users.json`        | Three demo shoppers (Ada Lovelace, Grace Hopper, Alan Turing) — also used as bravo realm user seed data by the AIC provisioner. |
| `wallet-cards.json` | Fake payment cards keyed by user (last-4, brand, expiry, cardholder — no full PAN).                                             |
| `transactions.json` | Sample transactions with `merchantId`, `merchantName`, and a `consent: { source, confirmedAt }` sub-object.                     |
| `loyalty.json`      | Points balances keyed by `(userId, merchantId)` pair.                                                                           |

---

## AIC configuration

The `config/payment/aic/` directory holds the declarative desired-state for the AIC provisioning script:

- `inputs/tenant.json` — tenant URL and service-account env var names
- `inputs/alpha/` — payment provider IDP resources: OAuth2 clients, AI agents, trusted JWT issuers, social IDPs
- `inputs/bravo/` (under `config/merchant/aic/`) — merchant IDP resources: OAuth2 clients, applications, social IDPs, journeys

See [scripts.md](./scripts.md) for how to run the provisioner.
