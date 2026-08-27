# ai-merchant-services

A demonstration of **agentic commerce**: Acme Payments sells merchants a turnkey chatbot delivered as a JavaScript overlay — the merchant drops a single `<script>` tag into their site and the **Acme Assist** chat UI renders in-page, binding the shopper's authenticated merchant account (saved cards, loyalty points, offers, and rewards) without the shopper ever leaving the **Northwind Retail** storefront. Every chatbot-initiated payment requires explicit in-chat user consent.

Identity is cloud IDP end-to-end: the merchant IDP (bravo realm) holds shopper accounts; the payment provider IDP (alpha realm) holds payment identities; cross-realm federation uses OAuth 2.0 token exchange (RFC 8693).

> **New here?** See [docs/getting-started.md](./docs/getting-started.md) for the first-run walkthrough and IDP setup requirements. To add a merchant, follow [docs/merchant-onboarding.md](./docs/merchant-onboarding.md) and run `pnpm merchant:create`.

---

## Quickstart

**Prerequisites:** Node 22 (see `.nvmrc`) and pnpm 9
(`corepack enable && corepack prepare pnpm@9.15.4 --activate`).

```bash
# Install all workspace dependencies
pnpm install

# Start Caddy for the HTTPS/path-routed demo
pnpm caddy:start

# Start all five dev servers in the background
pnpm dev:start
pnpm dev:status
pnpm caddy:status
```

Open https://northwind.mytest.run to see Northwind Retail with the Acme Assist chat overlay in the bottom-right corner. Caddy is required for the standard demo because it provides HTTPS and path-based routing. Direct localhost ports are available only for limited app-only development.

To start or inspect one managed application, use the lifecycle controller rather than `pnpm --filter <app> dev`:

```bash
pnpm dev:start -- --service merchant-web
pnpm dev:status -- --service merchant-web
```

---

## Service management

```bash
pnpm dev:start                    # Start all five apps and wait for readiness
pnpm dev:status                   # Strict ownership and HTTP readiness check
pnpm dev:restart                  # Stop, clean .next caches, and restart
pnpm dev:restart -- --preserve-next # Fast restart without removing .next
pnpm dev:stop                     # Stop all five apps
pnpm caddy:start                  # Start repository-owned Caddy
pnpm caddy:status                 # Check repository-owned Caddy
pnpm caddy:reload                 # Validate and reload Caddyfile
pnpm caddy:stop                   # Stop repository-owned Caddy
```

Scripts live in `scripts/`. Each started service appends stdout and stderr to `logs/<app>.log`; tail those files separately when diagnosing a service. See [docs/getting-started.md](./docs/getting-started.md) for troubleshooting.

---

## Architecture

Three parties participate in the flow:

1. **Consumer** — an authenticated shopper on the merchant's site interacting with the Acme Assist overlay.
2. **Merchant** — Northwind Retail. Owns the shopper's account, loyalty balance, and product catalog.
3. **Payment provider** — Acme Payments. Owns the wallet, checkout, transaction ledger, and hosts the chatbot.

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

The **primary surface** for the chatbot is the overlay embedded inside `merchant-web` (renders on every route). The `chatbot-agent` app also exposes a **standalone dev-preview** at `http://localhost:3004/preview` for isolated development.

See [docs/architecture.md](./docs/architecture.md) for the full token flow and component details.

---

## Apps and ports

| App                 | Brand               | Port | Role                                                                                      |
| ------------------- | ------------------- | ---: | ----------------------------------------------------------------------------------------- |
| `merchant-web`      | Northwind Retail    | 3000 | Demo storefront. Hosts shopper OIDC login. Embeds the Acme Assist overlay on every route. |
| `payment-user-web`  | Acme Payments       | 3001 | Consumer-facing payment dashboard (transactions, profile).                                |
| `payment-admin-web` | Acme Payments Admin | 3002 | Admin dashboard (funnel-per-merchant view, users, merchants).                             |
| `payment-api`       | Acme Payments       | 3003 | JWT-protected payment REST API. Reads and writes JSON seed data.                          |
| `chatbot-agent`     | Acme Assist         | 3004 | Hosts `/embed.js`, standalone `/preview`, and `POST /api/chat`.                           |

Shared packages:

| Package        | Description                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| `@acme/ui`     | Tailwind preset, shadcn/ui primitives, `ThemeProvider`, `AppShell`, `ChatShell`. |
| `@acme/shared` | TypeScript domain types and JSON read/write helpers for seed data.               |

---

## Quality gates

```bash
pnpm -w typecheck   # tsc --noEmit across all 8 workspace projects
pnpm -w lint        # ESLint flat config across the repo
pnpm format         # Prettier --check
```

AIC provisioning (creates/updates IDP resources against a live Ping AIC tenant):

```bash
# Preview plan without making any API calls
pnpm --filter @acme/aic-config provision -- --dry-run

# Apply (requires a saved Frodo connection profile and BRAVO_USER_DEFAULT_PASSWORD)
pnpm --filter @acme/aic-config provision
```

See [docs/scripts.md](./docs/scripts.md) for what the provisioner creates per realm.

---

## Environment variables

Each app under `apps/` has a `.env.example` listing the vars it reads at runtime. Copy each to `.env.local` and fill in real values to enable the corresponding features.

| Env var group                                                                         | Apps                                                                     | Feature                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                                                         | `merchant-web`, `payment-user-web`, `payment-admin-web`                  | Session cookie signing/encryption (Auth.js v5)                                                  |
| `MERCHANT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET`                              | `merchant-web`                                                           | Shopper login via the merchant IDP (bravo realm)                                                |
| `PAYMENT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET`                               | `payment-user-web`, `payment-admin-web`, `payment-api`                   | Consumer/admin login and API JWT validation (payment provider IDP, alpha realm)                 |
| `PAYMENT_OIDC_JWKS_URI`                                                               | `payment-api`                                                            | JWT middleware — validates incoming Bearer tokens                                               |
| `PAYMENT_API_BASE_URL`                                                                | `merchant-web`, `payment-user-web`, `payment-admin-web`, `chatbot-agent` | Runtime calls to `payment-api`                                                                  |
| `PAYMENT_API_CLIENT_ID` / `_SECRET` + `AIC_ALPHA_TOKEN_ENDPOINT` + `AIC_IDM_BASE_URL` | `merchant-web`                                                           | Chatbot token proxy — Step 1 bravo→alpha exchange and JIT alpha_user provisioning               |
| `CHATBOT_AGENT_CLIENT_ID` / `_SECRET` + `AIC_ALPHA_TOKEN_ENDPOINT`                    | `chatbot-agent`                                                          | Step 2 alpha user token→Northwind Shopping Assistant token exchange (`northwind-chatbot-agent`) |
| `NEXT_PUBLIC_CHATBOT_EMBED_URL`                                                       | `merchant-web`                                                           | Configurable overlay URL (defaults to `http://localhost:3004/embed.js`)                         |
| `OPENAI_API_KEY` / `OPENAI_MODEL`                                                     | `chatbot-agent`                                                          | Live LLM responses in `POST /api/chat`                                                          |
| Frodo connection profile (`~/.frodo/Connections.json`)                                 | provisioner                                                               | AIC service-account authentication                                          |
| `BRAVO_USER_DEFAULT_PASSWORD`                                                         | provisioner                                                              | Initial password for demo merchant IDP users                                                    |

See [docs/environment.md](./docs/environment.md) for complete per-variable descriptions.

---

## Where things live

- **`apps/`** — the five Next.js 15 apps (App Router). Each has its own `package.json`, `tsconfig.json`, `.env.example`, and `src/app/` tree.
- **`packages/`** — `shared` (types + data helpers) and `ui` (component library).
- **`data/`** — JSON seed data: merchants, products, users, wallet cards, transactions, loyalty balances.
- **`config/merchants/`** — external merchant definitions, themes, assets, and non-secret onboarding metadata consumed by the shared storefront runtime.
- **`config/payment/aic/`** — declarative desired-state for the AIC provisioner. `inputs/tenant.json` holds the tenant URL and service-account env var names. `config/payment/aic/inputs/alpha/` holds payment-provider resources; `config/merchant/aic/inputs/bravo/` holds merchant resources (OAuth2 clients, applications, social IDPs, journeys). `provision.ts` is the entry point.
- **`docs/`** — reference documentation: [architecture.md](./docs/architecture.md), [identity.md](./docs/identity.md), [scripts.md](./docs/scripts.md), [environment.md](./docs/environment.md), [getting-started.md](./docs/getting-started.md), [merchant-onboarding.md](./docs/merchant-onboarding.md).
- **`scripts/`** — managed app lifecycle wrappers, Caddy lifecycle controller, and merchant tooling.
- **`logs/`** — per-service log files (gitignored; populated when services start).

---

## Repo conventions

- **TypeScript strict mode** everywhere (`strict: true`, `noUncheckedIndexedAccess`).
- **Named exports only** across `apps/*/src/**` and `packages/**` — enforced by ESLint. Next.js App Router files (`page.tsx`, `layout.tsx`, etc.) are exempt where a default export is required by the framework.
- **Prettier** for formatting. **ESLint 9 flat config** at the root.
- **No real company, product, wallet, or protocol brand names anywhere.** Fictional brands only: Acme Payments, Acme Assist, Northwind Retail, Contoso Goods.

---

## License

Internal use only. Not for redistribution.
