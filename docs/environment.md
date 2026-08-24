# Environment Variables

Each app under `apps/` has a `.env.example` file listing the variables it reads at runtime. Copy each to `.env.local` and fill in real values before starting the relevant app.

```bash
cp apps/merchant-web/.env.example        apps/merchant-web/.env.local
cp apps/payment-user-web/.env.example    apps/payment-user-web/.env.local
cp apps/payment-admin-web/.env.example   apps/payment-admin-web/.env.local
cp apps/payment-api/.env.example         apps/payment-api/.env.local
cp apps/chatbot-agent/.env.example       apps/chatbot-agent/.env.local
cp config/payment/aic/.env.example               config/payment/aic/.env
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
| `PAYMENT_API_CLIENT_ID`         | OAuth2 client ID for the `payment-api` client in the payment provider IDP (alpha realm). Used by `src/lib/alpha-token.ts` (`getPaymentToken`) — merchant-web's own account/products/checkout pages calling payment-api directly, independent of the chatbot widget. |
| `PAYMENT_API_CLIENT_SECRET`     | Client secret for the above.                                                                                                                                                                                                        |
| `AIC_ALPHA_TOKEN_ENDPOINT`      | Payment provider IDP (alpha realm) token endpoint. Used by `alpha-token.ts` for both `client_credentials` (service-account token) and the RFC 8693 token-exchange grant.                                                            |
| `AIC_IDM_BASE_URL`              | AIC IDM REST API base URL. Used by `alpha-token.ts` to look up and JIT-provision `managed/alpha_user` records for merchant-web's own pages.                                                                                        |
| `NEXT_PUBLIC_CHATBOT_EMBED_URL` | URL of the chatbot-agent overlay bundle. Exposed to the browser bundle. Defaults to `http://localhost:3004/embed.js` when not set.                                                                                                  |
| `AIC_ALLOW_RAW_TOKEN_TRACE`     | Optional server-side operator/demo gate for raw caller-token diagnostics. It must be `true` in addition to explicit request opt-in; payment service bearer tokens are never included in traces. Keep unset in normal environments.  |
| `NEXT_PUBLIC_MERCHANT_ID`               | Canonical merchant identifier passed to the chatbot widget (matches the `alpha_organization.merchantId` record onboarded for this merchant). Part of the additive silent-SSO config, unrelated to this app's own session (`src/auth.ts`). |
| `NEXT_PUBLIC_MERCHANT_IDP_AUTHORIZE_URL` | Merchant IDP (bravo realm) `/oauth2/authorize` endpoint, used by the widget's popup for `prompt=none` silent re-authentication.                                                                                             |
| `NEXT_PUBLIC_MERCHANT_BRIDGE_CLIENT_ID`  | Public client provisioned in the merchant IDP for silent SSO (`merchant-bridge`). Distinct from `MERCHANT_OIDC_CLIENT_ID` above, which is this app's own client.                                                            |
| `NEXT_PUBLIC_SILENT_CALLBACK_URL`        | Popup callback page served by `chatbot-agent` (`public/silent-callback.html`), registered as `merchant-bridge`'s `redirect_uri`. Must match exactly.                                                                       |

> There is no `NEXT_PUBLIC_MERCHANT_IDP_TOKEN_URL`: the widget never calls the merchant IDP's token endpoint directly (that would require CORS configured tenant-wide on the merchant IDP) — `chatbot-agent`'s own backend does that code exchange server-to-server instead (see its `MERCHANT_IDP_TOKEN_URL` below).
>
> The `POST /api/chatbot/token` route this project originally used for the chatbot's Step 1 has been deleted — that flow now runs entirely inside `chatbot-agent` (see [identity.md](./identity.md)). `PAYMENT_API_CLIENT_ID`/`SECRET`, `AIC_ALPHA_TOKEN_ENDPOINT`, and `AIC_IDM_BASE_URL` above stay because `alpha-token.ts` is still used directly by this app's own account/products/checkout pages, unrelated to the chatbot.

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

| Variable                     | Description                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYMENT_OIDC_ISSUER`        | Expected `iss` claim in the introspection response. Must match the payment provider IDP (alpha realm) issuer URL.                                                                                                                |
| `PAYMENT_OIDC_CLIENT_ID`     | `payment-api`'s own client ID, used to authenticate the introspection request. Must have the `am-introspect-all-tokens` scope to introspect tokens issued to other clients (e.g. `northwind-chatbot-agent`'s Step 2 agent tokens) — otherwise introspection silently returns `{"active": false}` for valid tokens. |
| `PAYMENT_OIDC_CLIENT_SECRET` | Client secret for the above.                                                                                                                                                                                                       |
| `PAYMENT_OIDC_INTROSPECTION_URL` | Payment provider IDP (alpha realm) RFC 7662 introspection endpoint. Used by the auth middleware to validate incoming Bearer tokens — required because the alpha realm issues symmetric (HS256) stateless tokens, which JWKS can never validate locally (JWKS only ever carries asymmetric public keys). |
| `PAYMENT_OIDC_JWKS_URI`      | Payment provider IDP (alpha realm) JWKS endpoint. Not currently used by the middleware (see introspection above) — reserved in case the realm is later switched to asymmetric token signing.                                    |
| `AIC_TENANT_URL`             | AIC tenant base URL. Reserved for future use — not currently read at runtime by `payment-api`. The provisioner reads the tenant URL from `config/payment/aic/inputs/tenant.json` and authenticates via frodo connection profile. |

---

## chatbot-agent

| Variable                      | Description                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`              | OpenAI API key. Required — `POST /api/chat` returns HTTP 500 if absent.                                                                                                                                                            |
| `OPENAI_MODEL`                | OpenAI model ID (default: `gpt-4.1-mini`).                                                                                                                                                                                         |
| `PAYMENT_API_BASE_URL`        | Base URL for `payment-api` (default: `http://localhost:3003`). Used by `POST /api/chat` to call loyalty, wallet, and checkout endpoints.                                                                                           |
| `CHATBOT_AGENT_CLIENT_ID`     | OAuth2 client ID for the Northwind Shopping Assistant in the payment provider IDP (alpha realm). Set this to `northwind-chatbot-agent` for the current migration. Used for Step 2 token exchange, with `audience=payment-api` — required by AIC's AI Agent "Acting On Behalf Of" privilege model (configured on the client in the AIC console: Subject Groups + Permissions scoped to the `payment-api` Application). |
| `CHATBOT_AGENT_CLIENT_SECRET` | Client secret for the above.                                                                                                                                                                                                       |
| `MERCHANT_IDP_TOKEN_URL`      | Merchant IDP (bravo realm) token endpoint, used server-to-server to exchange the widget's one-time PKCE authorization code for a merchant ID token. The browser never calls this directly — that would require CORS configured tenant-wide on the merchant IDP. |
| `MERCHANT_BRIDGE_CLIENT_ID`   | The `merchant-bridge` public client's ID (bravo realm), used for that same code exchange.                                                                                                                                          |
| `MERCHANT_BRIDGE_REDIRECT_URI`| Must exactly match the widget's `silent-callback.html` URL — the value the browser used when starting the authorize request.                                                                                                     |
| `AIC_ALPHA_TOKEN_ENDPOINT`    | Payment provider IDP (alpha realm) token endpoint. Shared by the Step 1 session→token bridge (`authorization_code` grant, `payment-bridge` client) and Step 2 (token-exchange grant, `northwind-chatbot-agent` client) — same endpoint, different grants/clients. |
| `AIC_ALPHA_AM_BASE_URL`       | AM deployment base URL (up to and including `/am`), distinct from `AIC_ALPHA_TOKEN_ENDPOINT` above. Used to build the Step 1 `/json/realms/.../authenticate`, `/json/serverinfo/*`, and `/oauth2/realms/.../authorize` paths.       |
| `MERCHANT_TOKEN_LOGIN_JOURNEY_ID` | Journey ID in the alpha realm that Step 1 authenticates against. Defaults to `merchant-token-login` if unset.                                                                                                                  |
| `PAYMENT_BRIDGE_CLIENT_ID`    | Confidential client (alpha realm) used only server-side to convert an AM session into an access token via the Step 1 session→token bridge.                                                                                        |
| `PAYMENT_BRIDGE_CLIENT_SECRET`| Client secret for the above.                                                                                                                                                                                                       |
| `PAYMENT_BRIDGE_REDIRECT_URI` | Registered redirect URI for `payment-bridge`. Never an actual browser redirect target — the code is captured server-side from the `Location` header of a non-interactive `/oauth2/authorize` call.                                |
| `AIC_TENANT_URL`              | AIC tenant base URL. Reserved for future use — not currently read at runtime by `chatbot-agent`. The provisioner reads the tenant URL from `config/payment/aic/inputs/tenant.json` and authenticates via frodo connection profile. |

---

## AIC provisioner (`config/payment/aic`)

| Variable                       | Description                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BRAVO_USER_DEFAULT_PASSWORD`  | Initial password assigned to all three demo merchant IDP users when created. If unset, a built-in fallback is used and a warning is printed.             |
| `AIC_MERCHANT_SCHEMA_APPROVED` | Explicit safety gate for live payment-provider merchant-group writes. Keep unset/false while `custom_merchantId` is absent from the `alpha_user` schema. |

The provisioner authenticates using the frodo connection profile stored at `~/.frodo/Connections.json`. Run `frodo conn save https://openam-volker-dev.forgeblocks.com/am` once to create or refresh the profile. No `AIC_ADMIN_SVC_ACCOUNT_ID` or `AIC_ADMIN_SVC_ACCOUNT_KEY` env vars are required.

---

## URL patterns

When AIC is accessed through a custom domain alias, it drops the explicit realm path from issuer and endpoint URLs. The two custom domains used in this project are:

| Domain              | Realm                        | Issuer                                | Token endpoint                                     | JWKS URI                                              |
| ------------------- | ---------------------------- | ------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `idc.mytestrun.com` | Payment provider IDP (alpha) | `https://idc.mytestrun.com/am/oauth2` | `https://idc.mytestrun.com/am/oauth2/access_token` | `https://idc.mytestrun.com/am/oauth2/connect/jwk_uri` |
| `idc.mytest.run`    | Merchant IDP (bravo)         | `https://idc.mytest.run/am/oauth2`    | `https://idc.mytest.run/am/oauth2/access_token`    | `https://idc.mytest.run/am/oauth2/connect/jwk_uri`    |

Note: AIC discovery documents include `:443` in the issuer (`https://idc.mytestrun.com:443/am/oauth2`). Auth.js / `openid-client` normalizes standard ports, so omitting `:443` in env vars is safe.
