# ai-merchant-services

Phase 1 scaffold for an agentic-commerce proof-of-concept. This repository is
**structure + rendering placeholders only** — no auth, no chatbot logic, no
runtime cross-app calls. Everything is wired to be filled in by follow-on PRs.

Every brand name in this repo is fictional: **Acme Payments** (payment
provider), **Northwind Retail** (demo merchant), **Acme Assist** (chatbot),
and **Contoso Goods** (second seeded merchant).

## Phase 1 framing

Phase 1 delivers **Use Case 1 — Logged-In User & Loyalty Account Binding**.
The premise:

- Acme Payments sells merchants a **turnkey chatbot delivered as a JavaScript
  overlay** — the merchant drops a `<script>` tag into their own site and the
  chat UI renders in-page, so the shopper never leaves the merchant's funnel.
- When an authenticated shopper interacts with the assistant, the chat surface
  is seamlessly bound to their merchant account: saved cards, loyalty points,
  offers, and rewards auto-populate inside the chatbot.
- The overlay packages payment processing, tokenization, security, and fraud
  prevention so merchants avoid piecing together vendors — conceptually a
  "checkout with <your bank>" pattern adapted for chat, but supporting **any
  saved payment method on file with the merchant**, not just Acme's own cards.

**Human-in-the-loop is mandatory.** Every chatbot-initiated payment requires
explicit in-chat user consent. The scaffold reserves a structural
consent-slot placeholder ("Confirm & pay" button in the message stream);
wiring lands with the follow-on checkout task.

Use Cases 2–4 (in-chat product discovery + end-to-end checkout, guest checkout
via phone-OTP, autonomous machine-to-machine transactions) and
next-generation identity protocols (Verifiable Credentials, decentralized
identity, emerging agentic-commerce protocols) are explicitly **out of scope**
for Phase 1.

## Three-party architecture

Three parties participate in the flow:

1. **Merchant** — Northwind Retail. Runs its own storefront (`merchant-web`)
   and its own IDP realm. Owns the shopper's account and loyalty balance.
2. **Payment provider** — Acme Payments. Runs the payment API
   (`payment-api`), consumer UI (`payment-user-web`), admin UI
   (`payment-admin-web`), and hosts the chatbot (`chatbot-agent`). Owns the
   wallet, checkout, and transaction ledger; owns its own IDP realm.
3. **Consumer** — an authenticated shopper on the merchant's site who
   interacts with the Acme Assist chat overlay embedded in-page.

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
`merchant-web`. The `chatbot-agent` app also exposes a **secondary
dev-preview** route at `http://localhost:3004/preview` that renders the same
chat shell against a plain background for isolated development.

## Apps and ports

Fictional brand names, fixed ports (each app pins its port via its `dev`
script):

| App                 | Brand               | Port | Role                                                                     |
| ------------------- | ------------------- | ---: | ------------------------------------------------------------------------ |
| `merchant-web`      | Northwind Retail    | 3000 | Demo merchant storefront. Embeds the Acme Assist overlay on every route. |
| `payment-user-web`  | Acme Payments       | 3001 | Consumer-facing UI (transactions, profile).                              |
| `payment-admin-web` | Acme Payments Admin | 3002 | Admin dashboard (funnel-per-merchant view, users, merchants).            |
| `payment-api`       | Acme Payments       | 3003 | Internal payment API (Next.js route handlers). Stub responses only.      |
| `chatbot-agent`     | Acme Assist         | 3004 | Hosts `/embed.js`, standalone `/preview`, and stub `POST /api/chat`.     |

Shared packages under `packages/`:

- `@acme/shared` — TypeScript domain types (`Merchant`, `Product`, `Cart`,
  `WalletCard`, `Transaction`, `LoyaltyBalance`, `MerchantIdentity`,
  `PaymentIdentity`) and JSON read/write helpers for the seed files under
  `data/`. Named exports only.
- `@acme/ui` — Tailwind preset, shadcn/ui primitives, `ThemeProvider` (via
  `next-themes`), `AppShell`, `ChatShell`. Every Next.js app consumes it.

## Prerequisites

- **Node 20 LTS** (see `.nvmrc`).
- **pnpm 9** (pinned via the root `packageManager` field; use Corepack:
  `corepack enable && corepack prepare pnpm@9.15.4 --activate`).

## Install and run

```bash
# From the repo root:
pnpm install

# Run any single app (each pins its own port):
pnpm --filter merchant-web dev        # http://localhost:3000
pnpm --filter payment-user-web dev    # http://localhost:3001
pnpm --filter payment-admin-web dev   # http://localhost:3002
pnpm --filter payment-api dev         # http://localhost:3003
pnpm --filter chatbot-agent dev       # http://localhost:3004
```

To see the overlay embedded inside `merchant-web`, start `chatbot-agent` and
`merchant-web` in two terminals, then open `http://localhost:3000/`. The
Acme Assist chat panel renders as a fixed-position card in the bottom-right
corner of every route.

To smoke-check the standalone chat-shell preview: open
`http://localhost:3004/preview`.

Workspace-wide quality gates:

```bash
pnpm -w typecheck   # runs `tsc --noEmit` in every workspace project
pnpm -w lint        # runs the root ESLint flat config across the repo
pnpm format         # Prettier --check
```

The AIC provisioning script is a no-op stub in the scaffold PR:

```bash
pnpm --filter @acme/aic-config provision
# prints "config/aic/provision.ts — not yet implemented" and exits 0
```

## Where things live

- **`apps/`** — the five Next.js apps listed above. Each has its own
  `package.json`, `tsconfig.json`, `.env.example`, and `src/app/` tree
  (App Router).
- **`packages/`** — the two shared packages (`shared`, `ui`).
- **`data/`** — JSON seed data. All the placeholder content the follow-on
  PRs will read from lives here:
  - `merchants.json` — Northwind Retail and Contoso Goods.
  - `products.json` — 12–16 items across laptops, phones, headphones,
    gaming, and home categories. Each product carries a `merchantId`.
  - `users.json` — 3 seed shoppers.
  - `wallet-cards.json` — fake-Luhn cards keyed by user (only last-4,
    brand, expiry, cardholder persisted — no full PAN).
  - `transactions.json` — sample transactions carrying both `merchantId`
    and denormalized `merchantName` for admin display, plus a `consent`
    object reflecting the human-in-the-loop requirement.
  - `loyalty.json` — points balance keyed by `(userId, merchantId)` so
    loyalty stays merchant-scoped.
- **`config/aic/`** — declarative desired-state for the AIC provisioning
  script. `inputs/tenant.json` holds the tenant URL + service-account env
  var names. `inputs/{alpha,bravo}/*.json` hold the per-realm resources
  (OAuth2 clients, trusted JWT issuers, AI agents, social IDPs, journeys)
  — each starts as an empty array so the follow-on wiring PR can populate
  them without merge conflicts. `outputs/` is gitignored (except a
  `.gitkeep`). `provision.ts` is the entry point invoked by the workspace
  script above.

## Environment configuration

No secrets ship in this repo. Every app under `apps/` has an `.env.example`
listing the env vars it will need in follow-on PRs, all with placeholder
values. The scaffold **does not read any of these at runtime** — they are
documented here so the follow-on wiring PRs have a single source of truth.

For local development, copy each `.env.example` to `.env.local` in the same
directory (`.env.local` is gitignored) and fill in real values as follow-on
PRs land:

- `apps/merchant-web/.env.example` — merchant IDP OIDC config
  (`MERCHANT_OIDC_ISSUER`, `MERCHANT_OIDC_CLIENT_ID`,
  `MERCHANT_OIDC_CLIENT_SECRET`), the payment API base URL
  (`PAYMENT_API_BASE_URL`), and the chatbot embed URL
  (`NEXT_PUBLIC_CHATBOT_EMBED_URL`).
- `apps/payment-user-web/.env.example` — payment IDP OIDC config
  (`PAYMENT_OIDC_*`) and `PAYMENT_API_BASE_URL`.
- `apps/payment-admin-web/.env.example` — payment IDP OIDC config
  (`PAYMENT_OIDC_*`) and `PAYMENT_API_BASE_URL`.
- `apps/payment-api/.env.example` — payment IDP OIDC config
  (`PAYMENT_OIDC_*`) plus the AIC tenant + admin service-account envs
  (`AIC_TENANT_URL`, `AIC_ADMIN_SVC_ACCOUNT_ID`,
  `AIC_ADMIN_SVC_ACCOUNT_KEY`).
- `apps/chatbot-agent/.env.example` — LLM provider envs
  (`OPENAI_API_KEY`, `OPENAI_MODEL`), `PAYMENT_API_BASE_URL`, and the AIC
  tenant + admin service-account envs.

`OPENAI_API_KEY` / `OPENAI_MODEL` are the canonical SDK env var names; the
scaffold does not instantiate an LLM client in this PR.

## Repo conventions

- **TypeScript strict mode** everywhere (`tsc --noEmit` under `strict: true`).
- **Named exports only** across `apps/*/src/**` and `packages/**` — enforced
  by an ESLint rule in `eslint.config.mjs`. Next.js App Router files
  (`page.tsx`, `layout.tsx`, and friends) and framework config files are
  exempt where the framework requires a default export.
- **Prettier** for formatting.
- **ESLint 9 flat config** at the root; each workspace runs `eslint .`
  through the root config.
- **No real company, product, wallet, or protocol brand names anywhere.**
  Verified by a repo-wide grep in the Task 9 verification pass.

## License

Internal proof-of-concept. Not for redistribution.
