# Environment Variables

Each app under `apps/` has a `.env.example` file listing the variables it reads at runtime. Copy each to `.env.local` and fill in real values before starting the relevant app.

```bash
cp apps/merchant-web/.env.example        apps/merchant-web/.env.local
cp apps/payment-user-web/.env.example    apps/payment-user-web/.env.local
cp apps/payment-admin-web/.env.example   apps/payment-admin-web/.env.local
cp apps/payment-api/.env.example         apps/payment-api/.env.local
cp apps/chatbot-agent/.env.example       apps/chatbot-agent/.env.local
cp config/aic/.env.example               config/aic/.env
```

---

## merchant-web

| Variable                        | Description                                                                                                                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                   | Random secret used by Auth.js v5 to sign and encrypt session cookies. Generate with `openssl rand -base64 32`.                                                                                                                      |
| `MERCHANT_OIDC_ISSUER`          | Issuer URL for the merchant IDP (bravo realm). Auth.js uses this to auto-discover the OIDC metadata endpoint (`/.well-known/openid-configuration`).                                                                                 |
| `MERCHANT_OIDC_CLIENT_ID`       | OAuth2 client ID registered in the merchant IDP for `merchant-web`.                                                                                                                                                                 |
| `MERCHANT_OIDC_CLIENT_SECRET`   | Client secret for the above.                                                                                                                                                                                                        |
| `PAYMENT_API_BASE_URL`          | Base URL for `payment-api` (default: `http://localhost:3003`). Used by the checkout route.                                                                                                                                          |
| `PAYMENT_API_CLIENT_ID`         | OAuth2 client ID for the `payment-api` client in the payment provider IDP (alpha realm). Used by the chatbot token proxy to obtain a service-account token for IDM operations and to perform the Step 1 bravo→alpha token exchange. |
| `PAYMENT_API_CLIENT_SECRET`     | Client secret for the above.                                                                                                                                                                                                        |
| `AIC_ALPHA_TOKEN_ENDPOINT`      | Payment provider IDP (alpha realm) token endpoint. Used for both `client_credentials` (service-account token) and the RFC 8693 token-exchange grant (Step 1).                                                                       |
| `AIC_IDM_BASE_URL`              | AIC IDM REST API base URL. Used to look up and JIT-provision `managed/alpha_user` records.                                                                                                                                          |
| `NEXT_PUBLIC_CHATBOT_EMBED_URL` | URL of the chatbot-agent overlay bundle. Exposed to the browser bundle. Defaults to `http://localhost:3004/embed.js` when not set.                                                                                                  |

---

## payment-user-web

| Variable                     | Description                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `AUTH_SECRET`                | Random secret for Auth.js v5 session cookie signing/encryption.                 |
| `PAYMENT_OIDC_ISSUER`        | Issuer URL for the payment provider IDP (alpha realm).                          |
| `PAYMENT_OIDC_CLIENT_ID`     | OAuth2 client ID registered in the payment provider IDP for `payment-user-web`. |
| `PAYMENT_OIDC_CLIENT_SECRET` | Client secret for the above.                                                    |
| `PAYMENT_API_BASE_URL`       | Base URL for `payment-api` (default: `http://localhost:3003`).                  |

---

## payment-admin-web

| Variable                     | Description                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `AUTH_SECRET`                | Random secret for Auth.js v5 session cookie signing/encryption.                  |
| `PAYMENT_OIDC_ISSUER`        | Issuer URL for the payment provider IDP (alpha realm).                           |
| `PAYMENT_OIDC_CLIENT_ID`     | OAuth2 client ID registered in the payment provider IDP for `payment-admin-web`. |
| `PAYMENT_OIDC_CLIENT_SECRET` | Client secret for the above.                                                     |
| `PAYMENT_API_BASE_URL`       | Base URL for `payment-api` (default: `http://localhost:3003`).                   |

---

## payment-api

| Variable                     | Description                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PAYMENT_OIDC_ISSUER`        | Expected `iss` claim in incoming JWTs. Must match the payment provider IDP (alpha realm) issuer URL.                                                                                                                     |
| `PAYMENT_OIDC_CLIENT_ID`     | Client ID used for token introspection metadata (passed to `jwtVerify` for `audience` validation).                                                                                                                       |
| `PAYMENT_OIDC_CLIENT_SECRET` | Client secret (currently unused at runtime but reserved for future token introspection).                                                                                                                                 |
| `PAYMENT_OIDC_JWKS_URI`      | Payment provider IDP (alpha realm) JWKS endpoint. Used by the JWT middleware to validate incoming Bearer tokens.                                                                                                         |
| `AIC_TENANT_URL`             | AIC tenant base URL. Reserved for future use — not currently read at runtime by `payment-api`. The provisioner reads the tenant URL from `config/aic/inputs/tenant.json` and authenticates via frodo connection profile. |

---

## chatbot-agent

| Variable                      | Description                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`              | OpenAI API key. Required — `POST /api/chat` returns HTTP 500 if absent.                                                                                                                                                    |
| `OPENAI_MODEL`                | OpenAI model ID (default: `gpt-4.1-mini`).                                                                                                                                                                                 |
| `PAYMENT_API_BASE_URL`        | Base URL for `payment-api` (default: `http://localhost:3003`). Used by `POST /api/chat` to call loyalty, wallet, and checkout endpoints.                                                                                   |
| `CHATBOT_AGENT_CLIENT_ID`     | OAuth2 client ID for the Northwind Shopping Assistant in the payment provider IDP (alpha realm). Set this to `northwind-chatbot-agent` for the current migration. Used for Step 2 token exchange.                          |
| `CHATBOT_AGENT_CLIENT_SECRET` | Client secret for the above.                                                                                                                                                                                               |
| `AIC_ALPHA_TOKEN_ENDPOINT`    | Payment provider IDP (alpha realm) token endpoint. Used for the Step 2 RFC 8693 token-exchange grant.                                                                                                                      |
| `AIC_TENANT_URL`              | AIC tenant base URL. Reserved for future use — not currently read at runtime by `chatbot-agent`. The provisioner reads the tenant URL from `config/aic/inputs/tenant.json` and authenticates via frodo connection profile. |

---

## AIC provisioner (`config/aic`)

| Variable                      | Description                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRAVO_USER_DEFAULT_PASSWORD` | Initial password assigned to all three demo merchant IDP users when created. If unset, a built-in fallback is used and a warning is printed. |

The provisioner authenticates using the frodo connection profile stored at `~/.frodo/Connections.json`. Run `frodo conn save https://openam-volker-dev.forgeblocks.com/am` once to create or refresh the profile. No `AIC_ADMIN_SVC_ACCOUNT_ID` or `AIC_ADMIN_SVC_ACCOUNT_KEY` env vars are required.

---

## URL patterns

When AIC is accessed through a custom domain alias, it drops the explicit realm path from issuer and endpoint URLs. The two custom domains used in this project are:

| Domain              | Realm                        | Issuer                                | Token endpoint                                     | JWKS URI                                              |
| ------------------- | ---------------------------- | ------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `idc.mytestrun.com` | Payment provider IDP (alpha) | `https://idc.mytestrun.com/am/oauth2` | `https://idc.mytestrun.com/am/oauth2/access_token` | `https://idc.mytestrun.com/am/oauth2/connect/jwk_uri` |
| `idc.mytest.run`    | Merchant IDP (bravo)         | `https://idc.mytest.run/am/oauth2`    | `https://idc.mytest.run/am/oauth2/access_token`    | `https://idc.mytest.run/am/oauth2/connect/jwk_uri`    |

Note: AIC discovery documents include `:443` in the issuer (`https://idc.mytestrun.com:443/am/oauth2`). Auth.js / `openid-client` normalizes standard ports, so omitting `:443` in env vars is safe.
