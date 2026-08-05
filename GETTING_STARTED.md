# Getting Started

This guide covers everything you need to run the project locally and understand
what Phase 1 delivers versus what still needs wiring.

## Prerequisites

- **Node 20 LTS** — check with `node --version`. Use [nvm](https://github.com/nvm-sh/nvm):
  `nvm install` (reads `.nvmrc`).
- **pnpm 9** — enable via Corepack then activate the pinned version:

  ```bash
  corepack enable
  corepack prepare pnpm@9.15.4 --activate
  ```

  Verify: `pnpm --version` should print `9.15.4` (or a compatible 9.x).

## First run

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start all five dev servers in the background
pnpm dev:start
```

That's it for the scaffold. No `.env.local` files are required — all five apps
render placeholder UI with zero environment configuration (see
[What works now](#what-works-now) below).

### What to open

| URL | App | What you'll see |
| --- | --- | --- |
| http://localhost:3000 | Northwind Retail (merchant-web) | Demo storefront with Acme Assist chat overlay in the bottom-right corner |
| http://localhost:3000/products | Northwind Retail | Product listing stub |
| http://localhost:3000/cart | Northwind Retail | Cart stub |
| http://localhost:3001 | Acme Payments (payment-user-web) | Consumer payment dashboard stub |
| http://localhost:3002 | Acme Payments Admin (payment-admin-web) | Admin dashboard stub |
| http://localhost:3003 | Acme Payments API (payment-api) | API landing page listing route stubs |
| http://localhost:3003/api/health | Acme Payments API | `{"status":"ok","service":"payment-api"}` |
| http://localhost:3004 | Acme Assist (chatbot-agent) | Chatbot agent landing page |
| http://localhost:3004/preview | Acme Assist | Standalone chat shell dev preview |

## Managing services

```bash
pnpm dev:start   # Start all five apps (skips any already running)
pnpm dev:stop    # Stop all five apps
pnpm dev:status  # Show Up/Down status with PID and URL for each service
```

Logs for each service are written to `logs/<app>.log` as long as they were
started via `pnpm dev:start`. Tail a log with:

```bash
tail -f logs/merchant-web.log
tail -f logs/chatbot-agent.log
```

## What works now

Everything below runs with **zero `.env.local` configuration**:

| Feature | Works now? | Notes |
| --- | --- | --- |
| All five apps start and serve pages | Yes | Placeholder UI |
| Northwind Retail storefront pages | Yes | Scaffold layout, stub data |
| Acme Assist chat overlay on merchant site | Yes | Visual only — textarea is read-only, no API calls |
| Acme Assist standalone `/preview` | Yes | Same shell, useful for isolated dev |
| `POST /api/chat` echo endpoint | Yes | Returns last user message with a preamble; not called by the overlay yet |
| `GET /api/health` | Yes | `{"status":"ok","service":"payment-api"}` |
| Payment API stub routes | Yes | GET returns empty arrays; POST returns 501 |
| `pnpm dev:start / stop / status` scripts | Yes | Full service management |
| `pnpm -w typecheck` | Yes | Zero errors across all 8 workspace projects |
| `pnpm -w lint` | Yes | Clean |
| `pnpm --filter @acme/aic-config provision` | Yes | Prints "not yet implemented" and exits 0 |

## What requires environment variables

No env vars are read at runtime in the current scaffold. The `.env.example`
files are forward-declarations for follow-on PRs. You can copy them to
`.env.local` now to pre-configure your local environment:

```bash
cp apps/merchant-web/.env.example        apps/merchant-web/.env.local
cp apps/payment-user-web/.env.example    apps/payment-user-web/.env.local
cp apps/payment-admin-web/.env.example   apps/payment-admin-web/.env.local
cp apps/payment-api/.env.example         apps/payment-api/.env.local
cp apps/chatbot-agent/.env.example       apps/chatbot-agent/.env.local
```

Then fill in real values for the features you want to enable:

| Env var group | Apps that need it | Enables |
| --- | --- | --- |
| `MERCHANT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET` | `merchant-web` | Shopper login via Northwind Retail (against the `bravo` realm) |
| `PAYMENT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET` | `payment-user-web`, `payment-admin-web`, `payment-api` | Consumer/admin login and API token validation (against the `alpha` realm) |
| `PAYMENT_API_BASE_URL` | `merchant-web`, `payment-user-web`, `payment-admin-web`, `chatbot-agent` | Runtime calls from frontends and chatbot to the payment API |
| `NEXT_PUBLIC_CHATBOT_EMBED_URL` | `merchant-web` | Makes the overlay URL configurable (scaffold hard-codes `http://localhost:3004/embed.js`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | `chatbot-agent` | Live LLM responses in the chat endpoint (scaffold echo stub does not use these) |
| `AIC_TENANT_URL` / `AIC_ADMIN_SVC_ACCOUNT_ID` / `AIC_ADMIN_SVC_ACCOUNT_KEY` | `payment-api`, `chatbot-agent` | AIC provisioning and JIT user look-up (not used in the scaffold) |

The AIC issuer URLs follow the pattern
`https://<tenant-url>/am/oauth2/realms/root/realms/<realm>`. Replace
`<tenant-url>` with the value from `config/aic/inputs/tenant.json` and
`<realm>` with `alpha` (payment IDP) or `bravo` (merchant IDP).

## What requires a follow-on PR

The scaffold delivers structure and rendering placeholders. The following
features do not work yet — each requires a dedicated wiring PR:

### PR 1 — OIDC login (Auth.js v5)
**Affected apps:** `merchant-web` (shopper login, `bravo` realm),
`payment-user-web` and `payment-admin-web` (consumer/admin login, `alpha` realm)

Without this, all pages are unprotected stubs. Auth.js v5 (`next-auth@5`) is
the chosen library; OIDC config goes in `apps/*/src/app/api/auth/[...nextauth]/route.ts`.

### PR 2 — AIC provisioning (`config/aic/provision.ts`)
**Affected component:** `config/aic/`

`provision.ts` is currently a no-op stub. This PR implements it using the
`mcp-volker-dev` tooling to create:
- OAuth2 clients for each app in the appropriate realm (`alpha` or `bravo`)
- An `OAuth2TrustedJwtIssuer` on `alpha` registering `bravo` as a trusted issuer
- The Acme Assist AI Agent (`agent.AIAgent`) on `alpha`

The `config/aic/inputs/{alpha,bravo}/*.json` files contain empty arrays
ready to be populated.

### PR 3 — JIT `alpha_user` provisioning (payment-api)
**Affected app:** `payment-api`

On the first RFC 8693 token exchange, the payment API should look up or
create a `managed/alpha_user` record for the shopper. Currently the checkout
and wallet routes return 501 / empty.

### PR 4 — Live chatbot (chatbot-agent)
**Affected app:** `chatbot-agent`

`POST /api/chat` is an echo stub. This PR wires it to the LLM provider
configured via `OPENAI_API_KEY` / `OPENAI_MODEL` with tool-calling against
the payment API (`/api/wallet`, `/api/loyalty`, `/api/checkout`).

### PR 5 — Checkout consent flow
**Affected apps:** `chatbot-agent`, `payment-api`

The "Confirm & pay" button is a disabled placeholder in the chat overlay.
This PR wires it: the chatbot presents a consent message, the user clicks
Confirm, and the payment API records the transaction with
`consent: { source: "chat", confirmedAt: "<timestamp>" }`.

## Troubleshooting

**Port already in use on start**

`pnpm dev:start` skips any service whose port is already occupied. If you
have a stale process from a previous session that's not tracked by a PID file:

```bash
lsof -ti tcp:3000 | xargs kill   # replace 3000 with the affected port
```

**Wrong pnpm version**

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

**Wrong Node version**

```bash
nvm install   # installs the version in .nvmrc (Node 20)
nvm use
```

**Services started but pages show errors**

Check the relevant log file:

```bash
tail -n 50 logs/merchant-web.log
```

Most startup errors are caused by missing workspace dependencies — re-run
`pnpm install`.
