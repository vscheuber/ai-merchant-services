# ai-merchant-services

A Phase 1 proof-of-concept for **agentic commerce**: Acme Payments sells merchants
a turnkey chatbot delivered as a JavaScript overlay — the merchant drops a single
`<script>` tag into their site and the **Acme Assist** chat UI renders in-page,
binding the shopper's authenticated merchant account (saved cards, loyalty points,
offers, and rewards) without the shopper ever leaving the **Northwind Retail**
storefront. Every chatbot-initiated payment requires explicit in-chat user consent.

Phase 1 scope is **Use Case 1 — Logged-In User & Loyalty Account Binding**.
Identity is cloud IDP end-to-end: merchant IDP = `bravo` realm, payment IDP =
`alpha` realm, with cross-realm federation via OAuth 2.0 token exchange.

> **New here?** See [GETTING_STARTED.md](./GETTING_STARTED.md) for the first-run
> walkthrough, what works now vs. what still needs wiring, and the follow-on PR
> roadmap.

---

## Quickstart

**Prerequisites:** Node 20 LTS (see `.nvmrc`) and pnpm 9
(`corepack enable && corepack prepare pnpm@9.15.4 --activate`).

```bash
# Install all workspace dependencies
pnpm install

# Start all five dev servers in the background
pnpm dev:start
```

No `.env.local` files are required — all apps render placeholder UI with zero
environment configuration. Open http://localhost:3000 to see Northwind Retail
with the Acme Assist chat overlay in the bottom-right corner.

To start individual services:

```bash
pnpm --filter merchant-web dev        # http://localhost:3000
pnpm --filter payment-user-web dev    # http://localhost:3001
pnpm --filter payment-admin-web dev   # http://localhost:3002
pnpm --filter payment-api dev         # http://localhost:3003
pnpm --filter chatbot-agent dev       # http://localhost:3004
```

---

## Service management

```bash
pnpm dev:start   # Start all five apps (skips any port already occupied)
pnpm dev:stop    # Stop all five apps
pnpm dev:status  # Show live/down status, PID, and URL for each service
```

Scripts live in `scripts/`. Each started service tails to `logs/<app>.log`.
See [GETTING_STARTED.md](./GETTING_STARTED.md) for troubleshooting.

---

## Architecture

Three parties participate in the flow:

1. **Consumer** — an authenticated shopper on the merchant's site interacting with
   the Acme Assist overlay.
2. **Merchant** — Northwind Retail. Owns the shopper's account, loyalty balance, and
   product catalog.
3. **Payment provider** — Acme Payments. Owns the wallet, checkout, transaction ledger,
   and hosts the chatbot.

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
                                            ▼ (follow-on PR)
   ┌───────────────────────────────────────────────────────────────────┐
   │                    Payment provider (Acme Payments)               │
   │                                                                   │
   │   payment-api (:3003)    payment-user-web (:3001)                 │
   │   payment-admin-web (:3002)    chatbot-agent (:3004)              │
   └───────────────────────────────────────────────────────────────────┘
```

The **primary surface** for the chatbot is the overlay embedded inside
`merchant-web` (renders on every route). The `chatbot-agent` app also exposes a
**standalone dev-preview** at `http://localhost:3004/preview` for isolated
development.

---

## Apps and ports

| App | Brand | Port | Role |
| --- | --- | ---: | --- |
| `merchant-web` | Northwind Retail | 3000 | Demo storefront. Embeds the Acme Assist overlay on every route. |
| `payment-user-web` | Acme Payments | 3001 | Consumer-facing payment dashboard (transactions, profile). |
| `payment-admin-web` | Acme Payments Admin | 3002 | Admin dashboard (funnel-per-merchant view, users, merchants). |
| `payment-api` | Acme Payments | 3003 | Internal payment API (Next.js route handlers). Stub responses in Phase 1. |
| `chatbot-agent` | Acme Assist | 3004 | Hosts `/embed.js`, standalone `/preview`, and `POST /api/chat`. |

Shared packages:

| Package | Description |
| --- | --- |
| `@acme/ui` | Tailwind preset, shadcn/ui primitives, `ThemeProvider`, `AppShell`, `ChatShell`. |
| `@acme/shared` | TypeScript domain types (`Merchant`, `Product`, `Cart`, `WalletCard`, `Transaction`, `LoyaltyBalance`, `MerchantIdentity`, `PaymentIdentity`) and JSON read/write helpers for seed data. |

---

## Quality gates

```bash
pnpm -w typecheck   # tsc --noEmit across all 8 workspace projects
pnpm -w lint        # ESLint flat config across the repo
pnpm format         # Prettier --check
```

AIC provisioning stub (no-op in Phase 1):

```bash
pnpm --filter @acme/aic-config provision
# prints "config/aic/provision.ts — not yet implemented" and exits 0
```

---

## Environment variables

No secrets ship in this repo. Each app under `apps/` has a `.env.example`
listing the vars it needs; copy each to `.env.local` and fill in real values as
follow-on PRs land. The scaffold does not read any of these at runtime.

| Env var group | Apps | Feature |
| --- | --- | --- |
| `MERCHANT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET` | `merchant-web` | Shopper login (Auth.js v5, `bravo` realm) |
| `PAYMENT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET` | `payment-user-web`, `payment-admin-web`, `payment-api` | Consumer/admin login and token validation (`alpha` realm) |
| `PAYMENT_API_BASE_URL` | `merchant-web`, `payment-user-web`, `payment-admin-web`, `chatbot-agent` | Runtime calls from UIs and chatbot to the payment API |
| `NEXT_PUBLIC_CHATBOT_EMBED_URL` | `merchant-web` | Configurable overlay URL (scaffold hard-codes `http://localhost:3004/embed.js`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | `chatbot-agent` | Live LLM responses in the chat endpoint |
| `AIC_TENANT_URL` / `AIC_ADMIN_SVC_ACCOUNT_ID` / `AIC_ADMIN_SVC_ACCOUNT_KEY` | `payment-api`, `chatbot-agent` | AIC provisioning and JIT `alpha_user` look-up |

---

## Where things live

- **`apps/`** — the five Next.js 15 apps (App Router). Each has its own
  `package.json`, `tsconfig.json`, `.env.example`, and `src/app/` tree.
- **`packages/`** — `shared` (types + data helpers) and `ui` (component library).
- **`data/`** — JSON seed data:
  - `merchants.json` — Northwind Retail and Contoso Goods.
  - `products.json` — items across laptop, phone, headphone, gaming, and home
    categories; each carries a `merchantId`.
  - `users.json` — 3 seed shoppers (Ada Lovelace, Grace Hopper, Alan Turing).
  - `wallet-cards.json` — fake cards keyed by user (last-4, brand, expiry,
    cardholder — no full PAN).
  - `transactions.json` — sample transactions with `merchantId`,
    `merchantName`, and a `consent: { source, confirmedAt }` sub-object.
  - `loyalty.json` — points balance keyed by `(userId, merchantId)`.
- **`config/aic/`** — declarative desired-state for the AIC provisioning script.
  `inputs/tenant.json` holds the tenant URL and service-account env var names.
  `inputs/{alpha,bravo}/*.json` hold per-realm resources (OAuth2 clients, trusted
  JWT issuers, AI agents, social IDPs, journeys) — each starts as an empty array
  ready for follow-on wiring. `provision.ts` is the entry point.
- **`scripts/`** — `dev-start.sh`, `dev-stop.sh`, `dev-status.sh`.
- **`logs/`** — per-service log files (gitignored; populated when services start).

---

## Repo conventions

- **TypeScript strict mode** everywhere (`strict: true`, `noUncheckedIndexedAccess`).
- **Named exports only** across `apps/*/src/**` and `packages/**` — enforced by
  ESLint. Next.js App Router files (`page.tsx`, `layout.tsx`, etc.) are exempt
  where a default export is required by the framework.
- **Prettier** for formatting. **ESLint 9 flat config** at the root.
- **No real company, product, wallet, or protocol brand names anywhere.** Fictional
  brands only: Acme Payments, Acme Assist, Northwind Retail, Contoso Goods.

---

## License

Internal proof-of-concept. Not for redistribution.
