# Identity Model

## The two identity domains

This project bridges two separate identity domains:

**Merchant IDP** — the identity provider operated by (or on behalf of) the merchant. It holds shopper accounts: the credentials, profile data, loyalty balances, and shopping history that belong to the merchant's business. In this implementation the merchant IDP is the `bravo` realm on Ping AIC (`idc.scheuber.io`), but the architecture assumes any standards-compliant OIDC provider can fill this role.

**Payment provider IDP** — the identity provider operated by Acme Payments. It holds payment-side identities: consumer wallet accounts, admin users, and service principals. It is always Ping AIC (`alpha` realm on `idc.scheuber.io`). Only the payment provider IDP supports AI Agents (a Ping-specific concept described below).

---

## Which app authenticates against which IDP

| App                 | IDP                          | Mechanism                                                     |
| ------------------- | ---------------------------- | ------------------------------------------------------------- |
| `merchant-web`      | Merchant IDP (bravo)         | Auth.js v5 OIDC authorization code flow                       |
| `payment-user-web`  | Payment provider IDP (alpha) | Auth.js v5 OIDC authorization code flow                       |
| `payment-admin-web` | Payment provider IDP (alpha) | Auth.js v5 OIDC authorization code flow                       |
| `payment-api`       | Payment provider IDP (alpha) | JWT middleware — validates Bearer tokens in incoming requests |
| `chatbot-agent`     | Neither (no end-user login)  | Server-side token exchange only; see below                    |

---

## Shopper OIDC login (merchant-web)

When an unauthenticated shopper visits a protected page in `merchant-web`, Auth.js v5 redirects them to the merchant IDP using the standard OIDC authorization code flow. The callback URL registered in the merchant IDP is:

```
http://localhost:3000/api/auth/callback/aic
```

After successful authentication, Auth.js stores the session (including the bravo `access_token`) in a signed, encrypted cookie. The `MERCHANT_OIDC_ISSUER`, `MERCHANT_OIDC_CLIENT_ID`, and `MERCHANT_OIDC_CLIENT_SECRET` env vars configure this client. `AUTH_SECRET` signs and encrypts the session cookie.

---

## Consumer and admin OIDC login (payment-user-web, payment-admin-web)

`payment-user-web` and `payment-admin-web` authenticate against the payment provider IDP using the same Auth.js v5 pattern. Their callback URLs:

```
http://localhost:3001/api/auth/callback/aic   # payment-user-web
http://localhost:3002/api/auth/callback/aic   # payment-admin-web
```

These are configured via `PAYMENT_OIDC_ISSUER`, `PAYMENT_OIDC_CLIENT_ID`, `PAYMENT_OIDC_CLIENT_SECRET`, and `AUTH_SECRET`.

---

## JWT validation (payment-api)

`payment-api` does not perform interactive OIDC login. Instead, it validates the Bearer token on every incoming request using a JWKS-based JWT middleware:

- `PAYMENT_OIDC_JWKS_URI` — the payment provider IDP's public key endpoint
- `PAYMENT_OIDC_ISSUER` — expected `iss` claim in the JWT

Requests without a valid token receive `401 Unauthorized`.

---

## Two-step token exchange (merchant-web → chatbot-agent → payment-api)

Because the shopper's bravo token cannot be used directly against the payment provider's API, `merchant-web` performs a two-step cross-realm token exchange before the chatbot can act on the shopper's behalf.

### Step 1 — Bravo → alpha user token

Performed by `merchant-web`'s `POST /api/chatbot/token` route.

1. Verify the shopper's bravo `access_token` against the merchant IDP JWKS.
2. Look up the shopper's corresponding `managed/alpha_user` record in AIC IDM.
   - If the record does not exist, create it (JIT provisioning — see below).
3. Call the payment provider IDP token endpoint with an RFC 8693 token-exchange grant:

   ```
   grant_type=urn:ietf:params:oauth:grant-type:token-exchange
   subject_token=<bravo_access_token>
   subject_token_type=urn:ietf:params:oauth:token-type:access_token
   client_id=<PAYMENT_API_CLIENT_ID>
   client_secret=<PAYMENT_API_CLIENT_SECRET>
   ```

   The payment provider IDP trusts the merchant IDP as a JWT issuer (configured via `OAuth2TrustedJwtIssuer` — created by the provisioner) and issues an alpha `access_token` for the same subject.

4. Return the alpha `access_token` to the browser (embed.js).

Env vars required: `MERCHANT_OIDC_ISSUER`, `PAYMENT_API_CLIENT_ID`, `PAYMENT_API_CLIENT_SECRET`, `AIC_ALPHA_TOKEN_ENDPOINT`, `AIC_IDM_BASE_URL`.

### Step 2 — Alpha user token → Northwind Shopping Assistant token

Performed by `chatbot-agent`'s `POST /api/chat` handler on every chat request.

The alpha user token from Step 1 is a _user-scoped_ token. To call `payment-api`, the chatbot needs a _chatbot-agent-scoped_ token that carries its own identity. A second RFC 8693 exchange produces this:

```
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<alpha_user_access_token>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
client_id=northwind-chatbot-agent
client_secret=<CHATBOT_AGENT_CLIENT_SECRET>
```

The result is an `access_token` that identifies the Northwind Shopping Assistant acting on behalf of the shopper. The `chatbot-agent` runtime uses this token as the Bearer for all calls to `payment-api`.

Env vars required: `CHATBOT_AGENT_CLIENT_ID`, `CHATBOT_AGENT_CLIENT_SECRET`, `AIC_ALPHA_TOKEN_ENDPOINT`.

---

## JIT alpha_user provisioning

On the first Step 1 exchange for a given shopper, the shopper will not yet have a `managed/alpha_user` record in the payment provider IDM. `merchant-web` detects this and creates the record automatically before calling the token endpoint:

1. Obtain a service-account token via `client_credentials` (`PAYMENT_API_CLIENT_ID` + `PAYMENT_API_CLIENT_SECRET`), using the `fr:idm:*` scope.
2. Query `managed/alpha_user` by the metadata pair `custom_merchantId == <merchant-id>` and `custom_merchantCustomerId == <merchant-IDP-subject>`; do not use the external subject as the payment-provider managed-object path or `_id`.
3. If absent, create the payment-provider user with an IDM-generated UUID `_id`, a separate generated UUID `userName`, required profile fields, `custom_merchantId`, and `custom_merchantCustomerId`.
4. Resolve the resulting payment-provider identity through the trusted issuer/resource-owner contract before the token exchange.

A concurrent-create response is handled by repeating the metadata lookup and using the existing record; it must not assume that the external subject is the managed-object ID.

The merchant-IDP `<sub>` is stored as `custom_merchantCustomerId` so arbitrary merchant IDPs can use non-UUID or otherwise unsuitable subject values while retaining an idempotent identity link.

---

## AI Agents (payment provider IDP only)

Ping AIC provides a first-class identity type called an **AI Agent** (`agent.AIAgent`). An AI Agent is a server-side autonomous actor that carries its own identity attributes (`aiAgentIdentityAttributes`) distinct from a regular OAuth2 client.

**This concept exists only in the payment provider IDP.** The merchant IDP has no equivalent.

The controlled migration provisions `northwind-chatbot-agent` as a first-class AI Agent. It deletes only the matching OAuth2 client after an exact-ID preflight and verified 404, then creates the agent and verifies its managed identity linkage. The existing legacy `chatbot-agent` OAuth2 client remains provisioned and is not deleted or disabled. The Northwind client is intentionally absent from `config/payment/aic/inputs/alpha/oauth2-clients.json` and remains represented in `ai-agents.json`.

When calling the payment provider IDP for Step 2, the runtime uses a regular OAuth2 `token-exchange` grant — not an Authorization Code flow. The `northwind-chatbot-agent` client in the payment provider IDP is configured with the `urn:ietf:params:oauth:grant-type:token-exchange` grant type.

> **Migration note:** `CHATBOT_AGENT_CLIENT_ID` must be set to `northwind-chatbot-agent` for the Northwind runtime. The prior `chatbot-agent` client is intentionally retained until its consumers, callbacks, and secret are reviewed; this task does not delete, disable, or rotate it.
