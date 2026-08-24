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
| `chatbot-agent`     | Both (no end-user login of its own) | Runs Step 1 (merchant IDP → payment provider IDP bridge) and Step 2 (token exchange) server-side; see below |

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

## Bearer token validation (payment-api)

`payment-api` does not perform interactive OIDC login. Instead, it validates the Bearer token on every incoming request via RFC 7662 token introspection (`POST /oauth2/introspect`), not local JWKS-based signature verification: the alpha realm's OAuth2 Provider issues stateless access tokens signed with a symmetric algorithm (HS256), whose key is never published via JWKS by design (JWKS only ever carries asymmetric public keys) — so local verification can never succeed for these tokens regardless of which JWKS URI is configured.

- `PAYMENT_OIDC_INTROSPECTION_URL` — the alpha realm's introspection endpoint
- `PAYMENT_OIDC_CLIENT_ID` / `PAYMENT_OIDC_CLIENT_SECRET` — authenticates the introspection request as the `payment-api` client
- `PAYMENT_OIDC_ISSUER` — expected `iss` claim in the introspection response

`payment-api`'s own client needs the `am-introspect-all-tokens` scope to introspect tokens issued to a *different* client (e.g. `northwind-chatbot-agent`'s agent tokens from Step 2) — without it, AM's introspection endpoint returns `{"active": false}` for a perfectly valid, unexpired token rather than an error, which looks identical to an invalid token from the caller's side.

Requests without a valid, active token receive `401 Unauthorized`.

---

## Two-step bridge (chatbot-agent's own silent SSO → chatbot-agent → payment-api)

The shopper's bravo token cannot be used directly against the payment provider's API, so `chatbot-agent` bridges it across realms before acting on the shopper's behalf. **This entire bridge — both steps — is owned by `chatbot-agent`.** `apps/merchant-web` is not involved: it is merchant infrastructure the payment provider does not control, and the goal of this project is a solution a payment provider can resell to any merchant with minimal integration burden on that merchant's existing app. The only thing merchant-web contributes is a handful of config values (see [Bridging mechanisms](#bridging-mechanisms--silent-sso-vs-token-exchange) below) passed to the widget through its existing `window.CHATBOT_CONFIG` injection point — no change to its own login/session code (`src/auth.ts`).

> **Migration note:** an earlier iteration of this project ran the chatbot's Step 1 inside `merchant-web` (`POST /api/chatbot/token`, using `merchant-web`'s own bravo `access_token` and an RFC 8693 token-exchange grant against a trusted-issuer registration). That design required `merchant-web` to hand its own session token to the chatbot and required the payment provider to trust the merchant IDP as a JWT issuer tenant-wide — workable, but it intermingled with the merchant's existing infrastructure more than necessary. `apps/merchant-web/src/app/api/chatbot/token/route.ts` was the chatbot-specific piece of that design and has been deleted now that the flow below is verified in production use.
>
> `apps/merchant-web/src/lib/alpha-token.ts` (`getPaymentToken`) is **not** part of that deleted chatbot flow and stays: `merchant-web`'s own account/products/checkout pages use it directly to call `payment-api` on the shopper's behalf for their own (non-chatbot) purposes, independent of anything the chatbot widget does.

### Step 1 — Merchant token → payment provider access token

The shopper is already authenticated on the merchant's page via an ordinary browser session at the merchant IDP — established entirely by the merchant's own login, unrelated to this bridge. The chatbot widget (`embed.js`) reuses that existing SSO cookie to silently sign the shopper into a **new, payment-provider-owned, additive** OIDC client registered in the merchant IDP (`merchant-bridge`, public, bravo realm) — see [Bridging mechanisms](#bridging-mechanisms--silent-sso-vs-token-exchange) for how, and why silent SSO rather than token exchange was chosen for this demo.

1. **Browser (embed.js):** on widget open, attempt `prompt=none` + PKCE silent re-authentication against `merchant-bridge` via a small popup (`public/silent-callback.html`). Success yields a bravo ID token with zero UI; failure (no session, popup blocked, `login_required`) falls back to guest mode — normal, not an error.
2. **Browser → chatbot-agent backend:** the widget sends `{ merchantToken: <bravo_id_token>, merchantId }` as part of the chat request.
3. **chatbot-agent backend (`src/lib/merchant-bridge.ts`):**
   - `authenticateMerchantTokenLoginJourney` — runs the `merchant-token-login` AM journey in the payment provider (alpha) realm:
     ```
     POST {AIC_ALPHA_AM_BASE_URL}/json/realms/root/realms/alpha/authenticate?authIndexType=service&authIndexValue=merchant-token-login
     Headers: merchant_token: <bravo_id_token>, merchant_id: <merchantId>
     ```
     The journey looks up the target merchant's `alpha_organization.merchantTrustedIssuerConfig`, validates the ID token against that merchant's own trusted-issuer config (issuer, audience, authorized parties, max lifetime — dynamically, per merchant, via a `ConfigProviderNode` wrapping the OIDC ID Token Validator node), then JIT-looks-up/creates the corresponding `alpha_user` (keyed on `custom_merchantId` + `custom_merchantCustomerId` — see JIT provisioning below). Returns an AM session `tokenId`, not yet an OAuth token. Distinct failure branches (`Unknown Merchant`, `Invalid Merchant Token`, `Configuration Error`, `JIT Provisioning Error`) surface via a response `error` header.
   - `bridgeSessionToAccessToken` — converts that AM session into a real access token via the `payment-bridge` confidential client (alpha realm), using the documented session→token bridge pattern:
     1. Discover the tenant's actual SSO cookie name via unauthenticated `GET {AIC_ALPHA_AM_BASE_URL}/json/serverinfo/*` (`cookieName` field — AIC assigns a unique pseudo-random name per tenant; never hardcode `iPlanetDirectoryPro`).
     2. `GET {AIC_ALPHA_AM_BASE_URL}/oauth2/realms/root/realms/alpha/authorize?client_id=payment-bridge&response_type=code&redirect_uri=<registered>&scope=openid+profile+email&decision=allow&csrf={tokenId}` with `Cookie: {cookieName}={tokenId}`, `redirect: manual`. `csrf` carries the session `tokenId` directly; `decision=allow` skips interactive consent for this non-interactive server-to-server call. Read `code` off the `Location` response header.
     3. `POST {AIC_ALPHA_TOKEN_ENDPOINT}` with `grant_type=authorization_code`, the `code`, and `payment-bridge` client credentials → the final alpha `access_token`, whose `sub` is the JIT-resolved `alpha_user._id`.

Best-effort like Step 2: a failure at any point degrades to an unauthenticated guest prompt, not an error response.

Env vars required (chatbot-agent): `AIC_ALPHA_AM_BASE_URL`, `MERCHANT_TOKEN_LOGIN_JOURNEY_ID`, `PAYMENT_BRIDGE_CLIENT_ID`, `PAYMENT_BRIDGE_CLIENT_SECRET`, `PAYMENT_BRIDGE_REDIRECT_URI`, `AIC_ALPHA_TOKEN_ENDPOINT` (shared with Step 2).

### Step 2 — Alpha user token → Northwind Shopping Assistant token

Performed by `chatbot-agent`'s `POST /api/chat` handler on every chat request.

The alpha user token from Step 1 is a _user-scoped_ token. To call `payment-api`, the chatbot needs a _chatbot-agent-scoped_ token that carries its own identity. A second RFC 8693 exchange produces this:

```
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<alpha_user_access_token>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
client_id=northwind-chatbot-agent
client_secret=<CHATBOT_AGENT_CLIENT_SECRET>
audience=payment-api
scope=profile email
```

`audience` identifies which Application's AI Agent "Acting On Behalf Of" privilege grant (Subject Groups + Permissions, configured on `northwind-chatbot-agent` in the AIC console) this exchange invokes — required by AIC's privilege model; must be the target Application's own OAuth2 client ID (`payment-api`), not a display name. Without it AM rejects the exchange with a generic `invalid_request` ("This delegation is not permitted") regardless of how the privilege is configured. No `openid` in `scope` — the resulting token is machine-to-machine, not a resource-owner-facing OIDC token — and it must stay a subset of whatever the privilege grants.

The result is an `access_token` that identifies the Northwind Shopping Assistant acting on behalf of the shopper (`act.sub` claim = `northwind-chatbot-agent`). The `chatbot-agent` runtime uses this token as the Bearer for all calls to `payment-api`.

Env vars required: `CHATBOT_AGENT_CLIENT_ID`, `CHATBOT_AGENT_CLIENT_SECRET`, `AIC_ALPHA_TOKEN_ENDPOINT`.

---

## JIT alpha_user provisioning

JIT provisioning now happens natively inside the `merchant-token-login` AM journey — no `chatbot-agent` or `merchant-web` code performs IDM lookups/creates for this path.

1. **Lookup Customer** (`IdentifyExistingUserNode`, `Identity Attribute = custom_merchantCustomerId`) searches `managed/alpha_user` for a record whose `custom_merchantCustomerId` matches the validated ID token's `sub` claim (scoped implicitly to the merchant selected earlier in the journey, since `custom_merchantCustomerId` values are only unique within a merchant).
2. If found, **Update Customer** (`PatchObjectNode`) refreshes profile claims from the ID token and the journey proceeds directly to session issuance.
3. If not found: **Random Username** (`ScriptedDecisionNode`) mints a random UUID for the new `alpha_user`'s `userName` (this is unrelated to the search key — `custom_merchantCustomerId` is what makes the lookup idempotent, not `userName`), then **Create Customer** (`CreateObjectNode`) creates the `managed/alpha_user` record with `_id` omitted (IDM generates the UUID), persisting `custom_merchantId` and `custom_merchantCustomerId` alongside profile claims from the ID token.
4. Any read/create failure routes to the **JIT Provisioning Error** branch (`SetFailureDetailsNode`), which the journey surfaces as a distinct `error` response header rather than a generic 401.

The merchant-IDP `sub` is stored as `custom_merchantCustomerId` so arbitrary merchant IDPs can use non-UUID or otherwise unsuitable subject values while retaining an idempotent identity link. This is the same design goal `apps/merchant-web/src/lib/alpha-token.ts` implements in application code for merchant-web's own (non-chatbot) calls — the journey enforces the equivalent natively in AM/IDM for the chatbot path instead, with no per-merchant code to write or maintain there.

---

## Bridging mechanisms — silent SSO vs. token exchange

Two mechanisms can bridge a shopper's merchant-IDP session into a payment-provider access token. Both require some trust setup registered in the merchant's IDP; neither requires touching the merchant's own login code.

| | **Silent SSO** (implemented) | **RFC 8693 token exchange** (documented alternative) |
| --- | --- | --- |
| Where it runs | Browser (widget popup) + backend | Backend only, server-to-server |
| Merchant IDP trust setup | A public OIDC client (PKCE, `authorization_code`), reachable from the shopper's browser | A confidential client the payment-provider backend authenticates as, OR the payment provider registered as a trusted JWT issuer that accepts the merchant's tokens directly |
| Depends on | An active first-party browser session (SSO cookie) at the merchant IDP; browser cookie/third-party-cookie policy | The merchant-web backend already holding a merchant token it can hand off — the shopper does not need an active browser session at request time |
| Failure mode | `login_required`/`interaction_required` (no session) → guest fallback, or popup blocked by browser | Merchant IDP does not implement the grant, or does not accept the payment provider's client as an authorized subject-token issuer |
| Why chosen for this demo | Zero merchant-web integration: the widget runs its own OIDC dance entirely client-side + against its own additive backend, using only a session cookie merchant-web already sets as a side effect of its own login | — |

### Vendor support (informational — verify against the specific tenant/plan before relying on this for a resale claim)

| Merchant IDP | `prompt=none` silent re-auth | RFC 8693 token exchange | Notes |
| --- | --- | --- | --- |
| **Auth0** | Yes — documented `/authorize?prompt=none`, returns `login_required`/`consent_required`/`interaction_required` on failure. Requires an active Auth0 SSO session; third-party-cookie blocking affects iframe-based silent renewal (not the popup pattern used here). | Not a standard customer-facing feature (Auth0 has an internal token-exchange profile for native-to-web flows, not exposed as RFC 8693 for third-party bridging). | Silent SSO is the natural fit. |
| **Okta** | Yes — `/authorize?prompt=none` documented and supported. | No general-purpose RFC 8693 endpoint for external relying parties. | Silent SSO is the natural fit. |
| **Microsoft Entra ID** | Yes — `prompt=none` is a first-class, explicitly documented parameter (`login_required`/`interaction_required` errors on failure). | No — Entra's cross-service delegation is the On-Behalf-Of flow (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` + `requested_token_use=on_behalf_of`), which is a distinct, non-RFC-8693 grant not intended for third-party subject-token exchange. | Silent SSO is the natural fit; OBO is not a drop-in RFC 8693 substitute. |
| **AWS Cognito** | Not supported the way this pattern needs it — Cognito's hosted-UI `/oauth2/authorize` has no documented `prompt=none` silent-reauth behavior; it is built around an interactive hosted-UI redirect. | No — Cognito's `/oauth2/token` endpoint explicitly only accepts `authorization_code`, `refresh_token`, or `client_credentials`; any other `grant_type` returns `unsupported_grant_type`. | Neither mechanism is a clean fit; a Cognito-backed merchant would likely need a custom Lambda-backed bridge. |
| **Keycloak** | Yes — the standard OIDC `check-sso`/`silent-check-sso` pattern is `prompt=none` against `/auth`, well-established. | Yes — Standard Token Exchange (V2), RFC 8693-compliant, `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, enabled by default (the client using it must still enable "Standard token exchange" and be confidential). | The one merchant IDP in this list where either mechanism is a genuinely first-class, supported option — worth token-exchange for a self-hosted merchant that wants a purely server-to-server integration. |
| **PingOne / Ping AIC** (this project's stack) | Yes — standard OIDC `prompt=none`, same as the merchant IDP realm used in this project. | Yes — Ping's platform documents RFC 8693 token exchange; availability of specific grant/scope combinations is tenant/plan-configurable. | Both mechanisms are viable; this project chose silent SSO for the demo per the "additive, cleanly separated" trust-setup preference (see Step 1 above). |
| **Salesforce Identity / Firebase Auth** | Not verified for this project — flagged for follow-up research before quoting to a prospective merchant on either platform. | Not verified for this project — flagged for follow-up research before quoting to a prospective merchant on either platform. | Do not rely on this row for a sales claim without direct verification against the specific product/tenant. |

**Recommendation:** silent SSO is the broader-reach default — every mainstream OIDC-compliant merchant IDP in this table except Cognito supports `prompt=none`, and it requires no special grant-type enablement on the merchant's side beyond registering a normal public client. RFC 8693 token exchange is a better fit only when the merchant explicitly wants a server-to-server integration with no browser popup at all (Keycloak, PingOne) or already operates infrastructure that holds a merchant token server-side without a live browser session (the earlier `merchant-web`-based design this project replaced). Cognito-backed merchants are the one case in this table that would need a custom bridge either way.

---

## AI Agents (payment provider IDP only)

Ping AIC provides a first-class identity type called an **AI Agent** (`agent.AIAgent`). An AI Agent is a server-side autonomous actor that carries its own identity attributes (`aiAgentIdentityAttributes`) distinct from a regular OAuth2 client.

**This concept exists only in the payment provider IDP.** The merchant IDP has no equivalent.

The controlled migration provisions `northwind-chatbot-agent` as a first-class AI Agent. It deletes only the matching OAuth2 client after an exact-ID preflight and verified 404, then creates the agent and verifies its managed identity linkage. The existing legacy `chatbot-agent` OAuth2 client remains provisioned and is not deleted or disabled. The Northwind client is intentionally absent from `config/payment/aic/inputs/alpha/oauth2-clients.json` and remains represented in `ai-agents.json`.

When calling the payment provider IDP for Step 2, the runtime uses a regular OAuth2 `token-exchange` grant — not an Authorization Code flow. The `northwind-chatbot-agent` client in the payment provider IDP is configured with the `urn:ietf:params:oauth:grant-type:token-exchange` grant type.

> **Migration note:** `CHATBOT_AGENT_CLIENT_ID` must be set to `northwind-chatbot-agent` for the Northwind runtime. The prior `chatbot-agent` client is intentionally retained until its consumers, callbacks, and secret are reviewed; this task does not delete, disable, or rotate it.
