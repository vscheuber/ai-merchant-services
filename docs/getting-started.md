# Getting Started

This guide covers everything you need to run the project locally, configure the identity providers, and understand what each environment variable enables.

---

## Prerequisites

- **Node 22** — check with `node --version`. Install or switch using [nvm](https://github.com/nvm-sh/nvm):

  ```bash
  nvm install   # reads .nvmrc (Node 22)
  nvm use
  ```

- **pnpm 9** — enable via Corepack then activate the pinned version:

  ```bash
  corepack enable
  corepack prepare pnpm@9.15.4 --activate
  ```

  Verify: `pnpm --version` should print `9.15.4` (or a compatible 9.x).

---

## First run

```bash
# 1. Install all workspace dependencies
pnpm install

# 2. Start all five dev servers in the background
pnpm dev:start
```

Open these URLs once the services are running:

| URL                              | App                                       | What you'll see                               |
| -------------------------------- | ----------------------------------------- | --------------------------------------------- |
| http://localhost:3000            | Northwind Retail (`merchant-web`)         | Demo storefront with Acme Assist chat overlay |
| http://localhost:3000/products   | Northwind Retail                          | Product listing                               |
| http://localhost:3000/cart       | Northwind Retail                          | Cart                                          |
| http://localhost:3001            | Acme Payments (`payment-user-web`)        | Consumer payment dashboard                    |
| http://localhost:3002            | Acme Payments Admin (`payment-admin-web`) | Admin dashboard                               |
| http://localhost:3003            | Acme Payments API (`payment-api`)         | API landing page                              |
| http://localhost:3003/api/health | Acme Payments API                         | `{"status":"ok","service":"payment-api"}`     |
| http://localhost:3004            | Acme Assist (`chatbot-agent`)             | Chatbot agent landing page                    |
| http://localhost:3004/preview    | Acme Assist                               | Standalone chat shell dev preview             |

> Without `.env.local` files the apps start and serve pages, but OIDC login, the chatbot token flow, and live LLM responses will not work. See the sections below to enable each feature.

---

## Managing services

```bash
pnpm dev:start    # Start all five apps (skips any already running)
pnpm dev:stop     # Stop all five apps
pnpm dev:status   # Show UP/DOWN status with PID and URL for each service
```

Logs are written to `logs/<app>.log` for services started via `pnpm dev:start`:

```bash
tail -f logs/merchant-web.log
tail -f logs/chatbot-agent.log
```

See [scripts.md](./scripts.md) for how the scripts work internally.

---

## Setting up environment variables

Copy each `.env.example` to `.env.local` and fill in real values:

```bash
cp apps/merchant-web/.env.example        apps/merchant-web/.env.local
cp apps/payment-user-web/.env.example    apps/payment-user-web/.env.local
cp apps/payment-admin-web/.env.example   apps/payment-admin-web/.env.local
cp apps/payment-api/.env.example         apps/payment-api/.env.local
cp apps/chatbot-agent/.env.example       apps/chatbot-agent/.env.local
```

The table below maps env var groups to what they enable. See [environment.md](./environment.md) for complete descriptions of every variable.

| Env var group                                                                         | Apps                                                                     | Enables                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                                                         | `merchant-web`, `payment-user-web`, `payment-admin-web`                  | Session cookie signing and encryption (Auth.js v5 requirement)                               |
| `MERCHANT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET`                              | `merchant-web`                                                           | Shopper OIDC login via the merchant IDP (bravo realm)                                        |
| `PAYMENT_OIDC_ISSUER` / `_CLIENT_ID` / `_CLIENT_SECRET`                               | `payment-user-web`, `payment-admin-web`, `payment-api`                   | Consumer/admin OIDC login and payment API JWT validation (payment provider IDP, alpha realm) |
| `PAYMENT_OIDC_JWKS_URI`                                                               | `payment-api`                                                            | JWT middleware — validates Bearer tokens in incoming requests                                |
| `PAYMENT_API_BASE_URL`                                                                | `merchant-web`, `payment-user-web`, `payment-admin-web`, `chatbot-agent` | Runtime calls from frontends and chatbot to `payment-api`                                    |
| `PAYMENT_API_CLIENT_ID` / `_SECRET` + `AIC_ALPHA_TOKEN_ENDPOINT` + `AIC_IDM_BASE_URL` | `merchant-web`                                                           | Chatbot token proxy — Step 1 bravo→alpha token exchange and JIT alpha_user provisioning      |
| `CHATBOT_AGENT_CLIENT_ID` / `_SECRET` + `AIC_ALPHA_TOKEN_ENDPOINT`                    | `chatbot-agent`                                                          | Step 2 alpha user token→agent token exchange                                                 |
| `OPENAI_API_KEY` / `OPENAI_MODEL`                                                     | `chatbot-agent`                                                          | Live LLM responses in `POST /api/chat`                                                       |
| `NEXT_PUBLIC_CHATBOT_EMBED_URL`                                                       | `merchant-web`                                                           | Makes the overlay URL configurable (defaults to `http://localhost:3004/embed.js`)            |
| `AIC_TENANT_URL`                                                                      | `payment-api`, `chatbot-agent`                                           | AIC tenant base URL (reserved for future runtime use)                                        |
| `BRAVO_USER_DEFAULT_PASSWORD`                                                         | provisioner only                                                         | Initial password for demo merchant IDP users                                                 |

---

## IDP setup requirements

Before OIDC login and the chatbot token flow can work, the right resources must exist in each identity provider. Run the AIC provisioner to create them (see [scripts.md](./scripts.md)):

```bash
# Ensure a frodo connection profile exists for the AIC tenant (run once):
frodo conn save https://openam-volker-dev.forgeblocks.com/am

# Set the bravo demo user password, then provision:
export BRAVO_USER_DEFAULT_PASSWORD='<initial-password>'
pnpm --filter @acme/aic-config provision
```

The provisioner authenticates using the frodo connection profile stored in `~/.frodo/Connections.json` — no `AIC_ADMIN_SVC_ACCOUNT_ID` or `AIC_ADMIN_SVC_ACCOUNT_KEY` env vars are required.

### Merchant IDP (bravo realm)

The merchant IDP must have:

| Resource                     | Details                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| OAuth2 client `merchant-web` | Confidential client, authorization code flow, redirect URI `http://localhost:3000/api/auth/callback/aic`    |
| Demo users                   | Ada Lovelace, Grace Hopper, Alan Turing — created from `data/users.json` with `BRAVO_USER_DEFAULT_PASSWORD` |

The provisioner creates all of these. After provisioning:

- Set `MERCHANT_OIDC_CLIENT_ID=merchant-web` and `MERCHANT_OIDC_CLIENT_SECRET` to the client secret you configure in the merchant IDP.
- Set `MERCHANT_OIDC_ISSUER` to your merchant IDP issuer URL (e.g. `https://idc.example.local/am/oauth2/realms/root/realms/bravo`).

The merchant IDP can be any OIDC-compliant provider. The provisioner targets Ping AIC (bravo realm). If you use a different provider, register the `merchant-web` client manually with the redirect URI above.

### Payment provider IDP (alpha realm)

The payment provider IDP is always Ping AIC. The provisioner creates:

| Resource                                | Details                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth2 client `payment-api`             | Used by `merchant-web` for service-account tokens and Step 1 token exchange                                                                  |
| OAuth2 client `payment-user-web`        | Consumer login                                                                                                                               |
| OAuth2 client `payment-admin-web`       | Admin login                                                                                                                                  |
| OAuth2 client `northwind-chatbot-agent` | Northwind Shopping Assistant client used for Step 2 token exchange; the existing `chatbot-agent` client remains provisioned during migration |
| OAuth2TrustedJwtIssuer `bravo-realm`    | Registers the merchant IDP as a trusted JWT issuer, enabling Step 1 RFC 8693 exchange                                                        |

After provisioning:

- Set `PAYMENT_OIDC_ISSUER` to the alpha realm issuer URL.
- Set `PAYMENT_OIDC_JWKS_URI` to the alpha realm JWKS URI.
- Set each app's `PAYMENT_OIDC_CLIENT_ID` and `PAYMENT_OIDC_CLIENT_SECRET` to the provisioned values.
- Set `AIC_ALPHA_TOKEN_ENDPOINT` for `merchant-web` and `chatbot-agent`.
- Set `CHATBOT_AGENT_CLIENT_ID=northwind-chatbot-agent` and `CHATBOT_AGENT_CLIENT_SECRET` to the secret provisioned for that client. Do not remove the existing `chatbot-agent` client until its consumers and secret are reviewed.

See [identity.md](./identity.md) for a detailed explanation of the token exchange flows.

---

## Quality gates

```bash
pnpm -w typecheck   # tsc --noEmit across all 8 workspace projects
pnpm -w lint        # ESLint flat config across the repo
pnpm format         # Prettier --check
```

---

## Troubleshooting

**Port already in use on start**

`pnpm dev:start` skips any service whose port is already occupied. If a stale process from a previous session is not tracked by a PID file:

```bash
lsof -ti tcp:3000 | xargs kill   # replace 3000 with the affected port
```

**Wrong Node version**

```bash
nvm install   # installs the version in .nvmrc (Node 22)
nvm use
```

**Wrong pnpm version**

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

**Services started but pages show errors**

Check the relevant log file:

```bash
tail -n 50 logs/merchant-web.log
```

Most startup errors are caused by missing workspace dependencies — re-run `pnpm install`.

**OIDC login not working**

1. Confirm the relevant `.env.local` file exists and all `*_OIDC_*` vars are set.
2. Confirm the OAuth2 client is registered in the IDP with the correct redirect URI.
3. Run `pnpm --filter @acme/aic-config provision -- --dry-run` to check provisioner state (requires a frodo connection profile for the AIC tenant in `~/.frodo/Connections.json`).

**Chatbot returns "configuration error"**

`POST /api/chat` returns 500 if `OPENAI_API_KEY` is not set, or if `CHATBOT_AGENT_CLIENT_ID`/`SECRET`/`AIC_ALPHA_TOKEN_ENDPOINT` are missing. Check `logs/chatbot-agent.log` for the specific error.
