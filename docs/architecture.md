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

| App | Brand | Port | Role |
| --- | --- | ---: | --- |
| `merchant-web` | Northwind Retail | 3000 | Demo storefront. Hosts shopper OIDC login. Embeds the Acme Assist overlay on every route. |
| `payment-user-web` | Acme Payments | 3001 | Consumer-facing payment dashboard (transactions, profile). |
| `payment-admin-web` | Acme Payments Admin | 3002 | Admin dashboard (funnel-per-merchant view, users, merchants). |
| `payment-api` | Acme Payments | 3003 | Payment REST API (JWT-protected). Reads and writes JSON seed data. |
| `chatbot-agent` | Acme Assist | 3004 | Hosts `/embed.js`, standalone `/preview`, and `POST /api/chat`. |

---

## Token flow

The chatbot requires the shopper's identity to be bridged from the merchant's identity domain into the payment provider's identity domain. This bridge is a two-step RFC 8693 token exchange.

```
 Consumer browser
 ────────────────────────────────────────────────────────────────

 1. Shopper logs in at merchant-web
    Auth.js v5 OIDC → merchant IDP (bravo realm)
    → bravo access_token stored in session cookie

 2. embed.js (in browser) calls merchant-web /api/chatbot/token
    → merchant-web verifies bravo JWT via JWKS
    → JIT: creates managed/alpha_user in payment provider IDM if absent
    → Step 1 RFC 8693 exchange: bravo token → alpha user token
    → returns alpha access_token to embed.js

 3. embed.js sends POST /api/chat to chatbot-agent
    Authorization: Bearer <alpha user token>

 4. chatbot-agent performs Step 2 RFC 8693 exchange
    alpha user token → chatbot-agent token
    (client_credentials + token-exchange using CHATBOT_AGENT_CLIENT_ID/SECRET)

 5. chatbot-agent calls payment-api
    Authorization: Bearer <chatbot-agent token>

 6. payment-api validates JWT
    JWKS URI: PAYMENT_OIDC_JWKS_URI (payment provider IDP public keys)
```

See [identity.md](./identity.md) for a detailed explanation of each IDP, the token exchange mechanism, and JIT provisioning.

---

## Shared packages

| Package | Description |
| --- | --- |
| `@acme/ui` | Tailwind preset, shadcn/ui primitives, `ThemeProvider`, `AppShell`, `ChatShell`. |
| `@acme/shared` | TypeScript domain types (`Merchant`, `Product`, `Cart`, `WalletCard`, `Transaction`, `LoyaltyBalance`, `MerchantIdentity`, `PaymentIdentity`, `CheckoutSession`, `ChatMessage`, `TokenExchangeRequest`, `TokenExchangeResponse`) and JSON read/write helpers for seed data. |

---

## Seed data

The `data/` directory holds JSON files used by `payment-api` and `merchant-web` as the backing store. All reads and writes go through helper functions in `@acme/shared`.

| File | Contents |
| --- | --- |
| `merchants.json` | Northwind Retail and Contoso Goods merchant records. |
| `products.json` | Items across laptop, phone, headphone, gaming, and home categories; each carries a `merchantId`. |
| `users.json` | Three demo shoppers (Ada Lovelace, Grace Hopper, Alan Turing) — also used as bravo realm user seed data by the AIC provisioner. |
| `wallet-cards.json` | Fake payment cards keyed by user (last-4, brand, expiry, cardholder — no full PAN). |
| `transactions.json` | Sample transactions with `merchantId`, `merchantName`, and a `consent: { source, confirmedAt }` sub-object. |
| `loyalty.json` | Points balances keyed by `(userId, merchantId)` pair. |

---

## AIC configuration

The `config/aic/` directory holds the declarative desired-state for the AIC provisioning script:

- `inputs/tenant.json` — tenant URL and service-account env var names
- `inputs/alpha/` — payment provider IDP resources: OAuth2 clients, AI agents, trusted JWT issuers, social IDPs
- `inputs/bravo/` — merchant IDP resources: OAuth2 clients, social IDPs, journeys

See [scripts.md](./scripts.md) for how to run the provisioner.
