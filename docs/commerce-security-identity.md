# Commerce Security and Identity Controls

**Status:** Task 5 security and identity architecture definition — normative target requirements,
with current-state behavior marked inline. This document does not claim that any control described
as a target is implemented today.

**Scope:** Identity binding, delegated agent authorization, loyalty-data minimization, payment
authorization, and the server-side API authorization required to close the issuer-only/active-token
gap recorded as G-06 and G-07 in [`commerce-interoperability.md`](./commerce-interoperability.md).
The document translates the implemented silent-SSO/merchant-token-login and agent-token flows
(described in [`identity.md`](./identity.md)) into a reusable deployment model, and defines trust
relationships for the merchant IDP, payment provider IDP, chatbot-agent, adapter, payment
orchestrator, browser, and merchant system.

This is a documentation-only task. It makes no AIC/Frodo configuration change, no token-flow code
change, and no claim that a browser token, model tool call, or LLM output authorizes a payment. Raw
card data is out of scope everywhere in this document; cardholder-data boundaries remain governed by
[PCI DSS](https://www.pcisecuritystandards.org/standards/pci-dss/).

## 1. Normative language and precedence

The terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. Where this document and
another repository document overlap:

- The authority boundary between merchant and provider commerce data is normative in
  [`commerce-adapter-contract.md`](./commerce-adapter-contract.md) §2 and §9.4; this document adds
  the identity and token-flow controls behind that boundary.
- The current-state evidence and gap register (G-01..G-12) remain those of Task 1 in
  [`commerce-interoperability.md`](./commerce-interoperability.md); this document does not re-derive
  them.
- [`identity.md`](./identity.md) remains the descriptive record of the implemented flows; where the
  two disagree about current behavior, `identity.md` and the referenced source files win.

## 2. Trust topology and actors

The Task 2 topology ([`commerce-interoperability.md`](./commerce-interoperability.md), "Trust and
data-flow topology") fixes the request path: the widget has exactly one application trust path, to
the provider chatbot backend; commerce calls flow through the adapter; payment flows through the
payment orchestrator. This section overlays the identity plane on that topology.

| Actor                                    | Trusted to                                                                                                                              | Basis of trust                                                                                                                  | MUST NOT                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shopper browser**                      | Render display-safe state, hold an opaque short-lived session handle, present consent UI                                                | The versioned provider script loaded from the provider origin over HTTPS                                                        | Hold raw merchant/provider tokens or secrets, call commerce/payment APIs or IDP token endpoints directly, or supply authority-bearing identifiers |
| **Merchant IDP**                         | Authenticate the shopper, issue OIDC tokens to registered clients, terminate merchant sessions                                          | Per-merchant trusted-issuer configuration registered with the payment provider (issuer, audience, authorized parties, lifetime) | Act as a commerce or payment authority; its tokens never call provider APIs directly                                                              |
| **Payment provider IDP**                 | Own provider-side subjects, wallet/payment references, agent identity, and delegation policy                                            | Platform identity and consent configuration; the `merchant-token-login` journey and RFC 8693 exchange grants                    | Accept an unvalidated merchant assertion; issue an agent token without an audience binding or approved privilege                                  |
| **Chatbot-agent (BFF)**                  | Perform both bridge steps server-side, derive effective merchant/subject/agent/audience/scope, enforce policy, consent, and correlation | Server-side client credentials and the journey/bridge contracts                                                                 | Accept a browser-supplied subject, merchant, or agent identity as authority; expose raw tokens to the widget, model, or logs                      |
| **Payment API / enforcement point**      | Validate tokens and enforce route-level authorization (audience, scope, agent, merchant, subject, object ownership)                     | Token introspection plus the claim checks in Section 5                                                                          | Treat introspection `active: true` as authorization; use caller-supplied `userId`/`merchantId` as the effective identity                          |
| **Adapter gateway + merchant connector** | Translate canonical operations to the merchant platform using merchant-approved server-side credentials                                 | Connector registration, manifest scopes, and credential binding per merchant (Contract §4.2)                                    | Receive PAN, provider secrets, or client-authoritative commercial values; forward provider bearer tokens to a browser                             |
| **Payment orchestrator**                 | Execute payment authorization/capture from provider payment references and server-side consent                                          | Provider payment credentials and consent records, correlated with the merchant checkout                                         | Infer authorization from browser state, model output, or a tool call; report success without an authoritative result                              |
| **Merchant commerce system**             | Remain system of record for catalog, cart, checkout, order, fulfillment, and the loyalty fields it exposes                              | Native platform authorization for the connector credential                                                                      | Delegate checkout or payment authority to the widget, the model, a provider cache, or client-supplied values                                      |

Every actor boundary above is server-to-server except the browser row. Only the browser row may
hold a user-visible artifact, and that artifact is an opaque, short-lived, audience-bound session
handle — never a raw token.

## 3. Three distinct domains

Identity binding, loyalty lookup, and payment authorization are separate domains. Conflating them
is the root failure this document exists to prevent.

| Domain                     | Establishes                                                                                   | Granted by                                                                                | Does NOT grant                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Identity binding**       | The merchant-IDP shopper subject is correlated to a payment-provider subject, merchant-scoped | OIDC authentication at the merchant IDP plus the Step 1 bridge (Section 4, Flow B)        | Commerce mutation rights, loyalty redemption rights, or payment authority                                                  |
| **Loyalty/profile lookup** | Read access to the minimum merchant-permitted profile/loyalty fields for the conversation     | The merchant-scoped loyalty capability plus a bound, authorized subject (Section 7)       | Redemption, debit, or discount effect; a cached balance never authorizes a merchant discount                               |
| **Payment authorization**  | Authority to charge the confirmed amount for one confirmed operation                          | Server-side consent record + provider payment reference + orchestrator policy (Section 6) | Nothing else; it is never derived from identity binding alone, a browser token, a click, model output, or an LLM tool call |

Normative consequences:

1. A valid identity-binding token MUST NOT be sufficient to authorize payment. Every payment
   authorization MUST additionally require a server-side consent record bound to the exact
   authoritative cart/quote version, amount, currency, subject, merchant, and payment reference.
2. Loyalty/profile data MUST be fetched only through the merchant-authorized, least-privilege
   capability; the agent MUST receive only the fields the conversation requires. Loyalty redemption
   is a merchant quote/cart input and MUST be revalidated by the merchant before payment.
3. Agent tokens (Section 4, Flow C) carry delegation context, not payment authority. Payment
   authority is a property of the orchestrator's consent-bound operation, not of any token.

## 4. Token flows and exchange expectations

Three flows move identity across the trust boundaries. Each is listed with its deployment status
(`implemented`, `documented alternative`, or `target`) and its exchange expectations. Every token
exchange in every flow MUST bind audience/resource, scope, merchant context, subject, expiry, and
revocation semantics — the consolidated table in §4.4 is the checklist.

### Flow A — shopper OIDC login via the merchant IDP (`implemented`)

The shopper authenticates at the merchant IDP with the OIDC authorization code flow. Two client
shapes exist: the merchant's own first-party login (used by `merchant-web` for its own session) and
the payment-provider-owned, additive bridge client used by the widget for silent SSO
(`prompt=none` + PKCE through a small popup, with guest fallback when no session exists).

1. The relying party MUST use authorization code flow with PKCE and MUST validate issuer,
   audience, signature, expiry, nonce, and redirect URI per
   [OpenID Connect Core §3.1](https://openid.net/specs/openid-connect-core-1_0.html#CodeFlowAuth)
   and §3.1.3.6 (requirements §5.1).
2. The code exchange MUST be performed server-side. The browser hands the one-time code and PKCE
   verifier to the chatbot-agent backend and MUST NOT call the merchant IDP token endpoint directly
   or receive any token from it.
3. Failure (no session, popup blocked, `login_required`, `interaction_required`) MUST degrade to
   guest mode — a normal outcome, not an error.
4. **Target:** the browser MUST NOT retain the resulting merchant ID token beyond the immediate
   handoff. The current widget caches the merchant ID token in runtime state (G-08); the target
   replaces that artifact with an opaque, short-lived, audience-bound provider session handle.
5. Requested scopes MUST be limited to `openid` plus the minimum profile claims the bridge
   actually consumes; requesting broader profile scopes than the correlation record uses is a
   minimization violation.

### Flow B — merchant token to payment-provider user token (Step 1)

Two deployment models produce a payment-provider user token from a merchant identity assertion.
Both are server-side only; the browser never performs either.

**B-1: silent-SSO bridge via the `merchant-token-login` journey (`implemented`).** The BFF
exchanges the widget's PKCE code for a merchant ID token, invokes the `merchant-token-login`
journey with `merchant_token` and `merchant_id` headers, and bridges the resulting session to an
access token via the `payment-bridge` confidential client. The journey validates the merchant ID
token against that merchant's own trusted-issuer configuration — issuer, audience, authorized
parties, and maximum lifetime, resolved per merchant at request time — and JIT-looks-up/creates the
provider subject keyed on (`custom_merchantId`, `custom_merchantCustomerId`). Distinct failure
branches (`Unknown Merchant`, `Invalid Merchant Token`, `Configuration Error`, `JIT Provisioning
Error`) MUST fail closed to the guest path, never to a partially trusted context.

**B-2: RFC 8693 token exchange via a server-side merchant-token proxy (`documented
alternative`).** For merchants that already hold a merchant token server-side, the provider SHOULD
perform a constrained token exchange at the payment provider IDP with explicit `resource`/`audience`
and narrow scopes (requirements §5.3, [RFC 8693 §§2.1–2.2, 5](https://www.rfc-editor.org/rfc/rfc8693#section-2.1)).
This was the earlier merchant-web-hosted token-proxy design and remains the preferred model where a
merchant IDP natively supports RFC 8693 (for example Keycloak or Ping) and no browser popup is
desired. High-value or sensitive authorization requests SHOULD use PAR/JAR to keep
transaction-specific parameters out of the front channel
([RFC 9126](https://www.rfc-editor.org/rfc/rfc9126), [RFC 9101](https://www.rfc-editor.org/rfc/rfc9101);
requirements §5.8).

### Flow C — provider user token to agent token (Step 2, `implemented`)

On every chat request the BFF performs an RFC 8693 exchange: subject token is the payment-provider
user access token from Flow B; the acting client is the approved chatbot agent (an AI Agent
identity in the payment provider IDP — this identity type exists only on the provider side); the
exchange MUST set `audience` to the target API's own OAuth2 client ID and MUST request only scopes
the delegation privilege grants, as a subset.

1. The resulting agent token identifies the agent acting on behalf of the shopper: `sub` is the
   shopper's provider subject and `act.sub` is the agent identity. Both MUST be present and
   enforced downstream (Section 5).
2. The agent token MUST be short-lived, MUST NOT include `openid` (it is machine-to-machine, not a
   resource-owner-facing OIDC token), and MUST NOT be issued without the audience binding.
3. High-risk, order-specific authorization MAY use typed `authorization_details`
   ([RFC 9396](https://www.rfc-editor.org/rfc/rfc9396)) and resource indicators
   ([RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)) instead of a broad commerce-write scope.
4. A model tool invocation inside the BFF is an internal function call; it MUST NOT be treated as a
   new grant, a consent event, or an expansion of the agent token's authority.

### 4.4 Consolidated exchange-expectations table

Every row is normative for its flow. "Merchant binding" is the mechanism that prevents one
merchant's exchange from minting context for another.

| Exchange                                              | Audience / resource                                                                          | Scope                                                                                      | Merchant binding                                                                                                                                                        | Subject binding                                                                                | Expiry                                                                                     | Revocation                                                                                       |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Shopper OIDC code exchange (merchant IDP, Flow A)     | `aud`/`az` = the registered bridge client for that merchant                                  | `openid` + minimum consumed profile claims only                                            | Per-merchant client registration; issuer allowlisted via trusted-issuer config                                                                                          | Merchant IDP `sub`, opaque and stable per merchant                                             | Single-use short-TTL code; ID token max lifetime per trusted-issuer config                 | Merchant IDP session and client-credential revocation                                            |
| Step 1 bridge → provider user token (Flow B, B-1/B-2) | Token minted for the payment-provider bridge client; audience fixed by the IDP client config | Narrow: identity/profile claims only; no commerce scopes at this step                      | Journey resolves the merchant from the request and validates the ID token against that merchant's trusted-issuer config; a token from any other issuer MUST be rejected | Provider subject JIT-resolved or matched on (`custom_merchantId`, `custom_merchantCustomerId`) | AM session and token TTLs; the artifact lives only in BFF memory, never in browser storage | Session termination; trusted-issuer disablement fails the whole path closed                      |
| Step 2 agent exchange (Flow C)                        | `audience=payment-api` — the target API's own client ID; required, not optional              | Subset of the agent's delegation privilege grant (currently `profile email`)               | Inherited from the provider subject's merchant correlation; the agent token MUST NOT carry a merchant the subject does not have                                         | `sub` = shopper's provider subject; `act.sub` = the approved agent identity                    | Short-lived; minted per chat request, never cached beyond the operation                    | Token revocation/introspection; removal of the agent's acting-on-behalf-of privilege             |
| Adapter connector credential (target, per merchant)   | `resource` = the merchant adapter endpoint registered in the manifest (Contract §4.2)        | Manifest-declared capability scopes only (catalog, cart, checkout, order, loyalty, events) | Credential bound to one merchant registration; `X-Merchant-Id` MUST match; cross-merchant use fails closed                                                              | Service identity — no shopper subject; the shopper context travels as `SubjectContext` data    | Token or mTLS certificate lifetime, bounded by the manifest rotation policy                | Secret/certificate rotation and revocation with a bounded overlap window; capability disablement |

Every issued artifact above MUST also satisfy: no raw artifact ever reaches the browser, the model,
a URL, a log line, or an adapter payload (Section 8).

### 4.5 Sender-constrained artifacts (optional profile)

Bearer replay is the dominant residual risk for the browser-to-BFF hop. Where the deployment IDP
supports it, the provider SHOULD assess DPoP for browser-to-BFF and service-to-service artifacts
([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449), §§4–7) or mTLS-bound tokens
([RFC 8705](https://www.rfc-editor.org/rfc/rfc8705)). Sender constraining is an additional control;
it is never a substitute for the server-side checks in Section 5. The current POC token profile is
introspection-verified bearer (symmetric signing key, no JWKS verification path —
[`identity.md`](./identity.md)); no DPoP support is claimed.

## 5. API-side authorization matrix

### 5.1 The gap being closed

The payment API middleware authenticates by requiring a Bearer token, introspecting it, checking
`active`, and comparing `iss` to the configured issuer. Its comments explicitly defer scope and
subject enforcement, and it performs no audience/resource, agent-identity, merchant-binding,
effective-subject, or object-ownership check (G-06). Handlers then accept `userId`/`merchantId`
selectors from query parameters and request bodies (G-07). A valid, active, correctly issued token
therefore authorizes any route action against any subject the caller names. This section defines
the checks that close that gap; implementing them is a follow-up code task, not a claim of current
behavior.

### 5.2 Required checks, in order

Every non-public route MUST enforce, in order, before any handler logic runs:

| #   | Check                   | Requirement                                                                                                                                                                                                                                  | Failure response                       |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | Token validity          | Introspection (or equivalent) returns `active: true` within `exp`/`nbf`.                                                                                                                                                                     | `401 unauthorized`                     |
| 2   | Issuer                  | `iss` equals the configured payment-provider issuer (exact-match with the documented port normalization).                                                                                                                                    | `401 unauthorized`                     |
| 3   | Audience/resource       | `aud` (or the introspected audience claim) equals the API's own client/resource identifier. A token minted for any other audience MUST be rejected even if active and correctly issued.                                                      | `401 unauthorized`                     |
| 4   | Required scope          | The route's required scope (table §5.3) is present in the token's scope set. Absent or empty scope lists fail.                                                                                                                               | `403 authorization_failed`             |
| 5   | Agent identity          | For agent-mediated calls, `act.sub` equals an approved agent identity. A subject-scoped route MUST reject a bare client-credentials token (no `sub`/`act`).                                                                                  | `403 authorization_failed`             |
| 6   | Effective subject       | `sub` is the server-derived subject. A `userId` in query or body MUST match `sub` (or the server-side merchant-customer correlation of `sub`); it is never accepted as an independent selector.                                              | `403 authorization_failed`             |
| 7   | Merchant binding        | The token's merchant context (e.g. `custom_merchantId`) matches the request's merchant scope; a body/query `merchantId` cannot widen it. Objects referenced by the request (SKU, cart, card, loyalty record) MUST resolve within that scope. | `403 resource_forbidden` (fail closed) |
| 8   | Operation authorization | Mutating operations additionally require the server-side consent state and idempotency rules of Section 6 and Contract §6.                                                                                                                   | `403 authorization_failed`             |

Checks 1–3 are authentication properties; checks 4–8 are authorization. Enforcing 1–3 while
deferring 4–8 is exactly the current gap and MUST be treated as unauthenticated-equivalent for any
private or mutating resource.

### 5.3 Route-class matrix

`aud` for all rows means the payment API's own OAuth2 client/resource identifier. "Agent" means the
approved chatbot agent identity in `act.sub`.

| Route class                     | Audience/resource   | Required scope                             | Agent/client identity                                   | Merchant binding                                                                         | Subject/ownership binding                                                                                                                                                                    | Status                                            |
| ------------------------------- | ------------------- | ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `GET /api/health`               | none                | none                                       | none                                                    | none                                                                                     | none — liveness probe                                                                                                                                                                        | current                                           |
| `GET /api/products`             | none (public)       | none                                       | none                                                    | `merchantId` query validated against the merchant registry                               | none — display-safe, non-personal, merchant-scoped catalog only; any personalized variant requires subject + catalog scope                                                                   | current (constrained), target for personalization |
| `GET /api/wallet`               | `aud` = payment-api | `wallet.read` (from `profile email` today) | approved agent or first-party provider app              | not merchant-scoped (provider wallet domain)                                             | `userId` query MUST equal token `sub`; no cross-subject card listing                                                                                                                         | target                                            |
| `POST /api/wallet`              | `aud` = payment-api | `wallet.write`                             | approved agent or first-party provider app              | not merchant-scoped                                                                      | `userId` body MUST equal token `sub`; `pan` rejected; raw instrument data never persisted                                                                                                    | target                                            |
| `GET /api/loyalty`              | `aud` = payment-api | `loyalty.read`                             | approved agent                                          | `merchantId` query MUST equal the token's merchant claim                                 | `userId` query MUST equal token `sub`; field-minimized projection only                                                                                                                       | target                                            |
| `POST /api/loyalty`             | `aud` = payment-api | `loyalty.write`                            | approved agent                                          | same as GET                                                                              | same as GET; accrual bound to a correlated transaction, never body-supplied                                                                                                                  | target                                            |
| `POST /api/checkout`            | `aud` = payment-api | `checkout.write`                           | approved agent (`act.sub`)                              | `cart.merchantId` MUST equal the token's merchant claim; cross-merchant SKU fails closed | body `userId` MUST equal token `sub`; card reference MUST belong to `sub`; amount/currency MUST come from the merchant-authoritative quote; consent record (§6) and idempotency key required | target                                            |
| Adapter gateway routes (future) | per Contract §3.2   | manifest capability scopes                 | approved agent + merchant-scoped connector registration | `X-Merchant-Id` matches authenticated registration                                       | `SubjectContext` server-derived only (Contract §3.3)                                                                                                                                         | target                                            |

The "current" column intentionally records what exists so the matrix cannot be read as a claim of
implemented enforcement. Only `/api/health` is genuinely authorized as specified; `/api/products`
is public by design and constrained by data content, not by token checks.

### 5.4 Required behavior by shopper state

| Scenario                                                            | Required behavior                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guest** (no merchant session; silent SSO unavailable or declined) | Public, non-sensitive, merchant-scoped discovery MAY continue. The provider MUST NOT mint a provider subject or agent token for a guest, and any authenticated or mutating operation MUST fail with an actionable login/redirect path (widget `login-required`), never with a synthetic identity. |
| **Authenticated shopper**                                           | Full least-privilege context: server-derived subject + merchant claim + agent identity + route scope. Authentication alone still does not authorize payment; the consent record of Section 6 is additionally required.                                                                            |
| **Expired or revoked token**                                        | Introspection returns inactive → `401`. The BFF session degrades to the guest path with a re-authentication action; no cached token or cached context may continue a mutating operation.                                                                                                          |
| **Revoked consent / disabled capability**                           | The token may still be active, but the operation MUST fail closed (`403`): consent revocation and merchant capability disablement are independent of token validity. A revoked consent nonce MUST never be re-accepted.                                                                           |
| **Cross-merchant access**                                           | Any mismatch between token merchant claim, request merchant scope, and object ownership (SKU, cart handle, loyalty record, order reference) MUST fail with `403 resource_forbidden` without probing the other merchant's resources.                                                               |
| **Out-of-scope token**                                              | Missing required scope, wrong audience, or an unapproved agent identity MUST fail with `403 authorization_failed` (audience failures `401`). Unknown scopes MUST NOT be granted implicitly; absence of enforcement is not permission.                                                             |

## 6. Consent, expiry, and revocation

Consent is a server-side record, not a UI event. A confirmation click, a client timestamp, a
localStorage value, a model response, or an LLM tool call is never payment authorization (Task 2
decision; requirements §2.2).

A valid consent record MUST contain: subject and session references; merchant ID; the exact
authoritative cart/quote version and line items; amount and currency as resolved by the merchant;
the provider payment reference; the consent text and version shown to the shopper; a server-observed
timestamp (the client timestamp is advisory only); an expiry; a single-use nonce; and the
correlation ID. A payment operation MUST verify the consent record matches the operation exactly —
same subject, merchant, version, amount, currency, and payment reference — and MUST reject stale,
expired, replayed, or mismatched consent.

Expiry and revocation rules:

1. All expiry decisions use server time; browser timestamps are advisory display data only
   (Contract §6.4).
2. Tokens are short-lived. Introspection (`active`) is the revocation check for the current token
   profile; a deployment migrating to locally verifiable tokens MUST retain an equivalent
   revocation check.
3. Revocation cascades: revoking the merchant trust configuration fails the Step 1 path closed;
   removing the agent's delegation privilege stops Step 2 mints and (via introspection) existing
   agent tokens; disabling a merchant capability disables the dependent operations regardless of
   token validity.
4. Consent revocation is independent of token state: a valid token without fresh consent cannot
   authorize payment, and consent without a valid, authorized context cannot either.

## 7. Merchant/customer mapping and loyalty minimization

The link between a merchant-IDP customer and a payment-provider subject is a server-side,
merchant-scoped correlation record — the JIT-provisioned provider subject keyed on
(`custom_merchantId`, `custom_merchantCustomerId`), with the merchant-IDP `sub` stored as
`custom_merchantCustomerId` so arbitrary merchant IDPs can use non-UUID subject values while
keeping lookup idempotent. The provider MUST NOT use an email address as a stable cross-merchant
identity key (requirements §5.6; Contract §5.2). This correlation is what `SubjectContext` carries;
it is derived server-side and can never be chosen by the browser.

Loyalty and profile minimization:

1. The merchant integration manifest declares which customer/loyalty fields are enabled; the
   lookup returns only those fields (display name, tier, available points, eligible benefits are
   the expected maximum set).
2. The provider MUST NOT merge merchant loyalty into provider wallet ownership, MUST NOT export
   general customer records, and MUST treat a cached loyalty balance as display state only.
3. Loyalty redemption effects are merchant quote/cart results, revalidated by the merchant before
   payment; the provider never computes a redemption itself.
4. The adapter MUST return a redaction/field-policy error rather than silently expanding the
   projection (Contract §10).

## 8. Non-secret handling rules

Every surface below has an explicit rule. These rules apply at construction time — redaction MUST
happen before model context assembly, persistence, publication, or serialization, not as a display
filter afterwards (Contract §10).

| Surface                                                  | MUST NOT contain                                                                                                                   | Required handling                                                                                                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browser** (widget state, localStorage, sessionStorage) | Raw merchant/provider ID, access, or refresh tokens; authorization codes; PKCE verifiers; secrets; PAN; authority-bearing user IDs | Only display-safe data and one opaque, short-lived, audience-bound session handle. The widget-cached merchant ID token (G-08) is a current-state violation; the target replaces it server-side. Session cleanup on `session-ended`.    |
| **Model prompts and tool results**                       | Tokens, codes, verifiers, secrets, PAN, full customer records, authority-bearing IDs                                               | Only display-safe product/quote summaries and the minimum approved loyalty fields. Model-supplied prices/totals/status are never authoritative (Contract §2.1). Redaction before prompt assembly, not a UI filter.                     |
| **Logs, traces, analytics**                              | Raw tokens, authorization codes, verifiers, session cookies, secrets, PAN, unmasked account numbers                                | Hash or truncate idempotency keys and opaque references; log merchant scope (not secret). Operator/trace views MUST authenticate the operator and enforce retention (G-11 is the current gap). Redact before persistence.              |
| **URLs** (path, query, fragment) and redirects           | Tokens, authorization codes (post-exchange), verifiers, secrets, authority-bearing user IDs                                        | The authorization code appears exactly once, front-channel, with PKCE and exact `redirect_uri`. Redirect continuations carry only opaque, single-use, merchant-bound references (Contract §11). Never place a token in a query string. |
| **Referrers**                                            | Token-bearing URLs from the widget, callback pages, or API responses                                                               | Set `Referrer-Policy: no-referrer` (or `same-origin` where functionally required) on widget, callback, and API surfaces. The primary defense is rule above: no secrets in URLs, so referrer leakage has nothing to leak.               |
| **Adapter calls, CloudEvents, Problem Details**          | Provider secrets, PAN/CVV, raw tokens, raw customer records, credential-bearing URLs                                               | Only opaque references, canonical error codes, correlation/operation IDs, versions, and display-safe values (Contract §7.1, §10). Native payloads stay inside the connector.                                                           |
| **Frontend configuration** (`window.CHATBOT_CONFIG`)     | Merchant secrets, connector credentials, payment credentials, raw tokens, authority-bearing user IDs                               | Public merchant ID, origins, locale/currency, feature flags, and bridge endpoint identifiers only (current behavior is conforming; keep it normative).                                                                                 |

Two adjacent controls complete this section:

1. **Cross-window messaging:** `postMessage` MUST target the exact allowlisted origin with a
   per-session nonce, and receivers MUST validate `event.origin`, the source marker, and state
   before use. The current wildcard target in the silent callback (G-08) and wildcard CORS policy
   (G-09) are non-conforming for production; allowed origins MUST derive from merchant onboarding.
2. **Widget-to-backend transport:** the widget sends conversation input and the opaque session
   handle only. It never sends a subject, an amount, or a selected payment instrument as authority.

## 9. Secret storage and credential lifecycle

Current state: client and bridge secrets are deployment environment variables
(`payment-bridge`, chatbot-agent, introspection credentials, `AUTH_SECRET` for cookie signing);
merchant configuration files are secret-free by design
([`merchant-onboarding.md`](./merchant-onboarding.md)).

Target requirements:

1. All secrets — IDP client secrets, connector credentials, webhook signing secrets, payment
   credentials — live in a secret manager and are referenced by non-secret `secretReference` values
   in manifests (Contract §4.2). Manifests, `config/merchants/`, and frontend configuration MUST
   NOT contain any secret value, private key, token, or credential-bearing URL.
2. Values move only through the approved secret-management path — never in chat, tickets, browser
   storage, configuration files, or logs.
3. Rotation verifies the new credential before cutover, allows old and new to overlap only for a
   bounded window, and revokes the old credential after cutover (Contract §9.3).
4. Failure is closed: an expired, revoked, or mis-bound credential disables the dependent
   capability; there is no fallback to an untrusted endpoint.
5. `AUTH_SECRET` (session-cookie signing) is rotation-sensitive: rotating it invalidates existing
   sessions, which is the acceptable failure direction.

## 10. Audit evidence

Every security-relevant event MUST produce audit evidence that is merchant-scoped, correlation-ID
threaded (widget → BFF → adapter → merchant → payment → events), and redacted before persistence:

- **Identity binding:** merchant ID, correlation of merchant subject to provider subject (opaque
  references, never raw tokens), bridge outcome, and the distinct failure branch on failure.
- **Token exchange events:** subject, actor, audience, scopes granted, expiry, and outcome for each
  Step 1/Step 2 exchange — without raw token values.
- **Authorization decisions:** route class, decision, and the failed check (§5.2 numbering) so that
  denials are distinguishable (guest vs. revoked vs. cross-merchant vs. out-of-scope).
- **Consent:** the full record of §6 with the nonce hashed.
- **Operations:** idempotency key hash, correlation ID, expected version, outcome, retries, and
  reconciliation results (Contract §6.2).
- **Events and credentials:** webhook signature/replay/dedupe results; credential rotation,
  verification, and revocation events.

Current-state gaps for traceability: token traces are stored on local disk and the trace route is
unauthenticated (G-11). The target requires authenticated operator access, redaction by default,
and bounded retention/TTL (requirements NFR 7 and NFR 11).

## 11. Threat model

| ID   | Threat                                                            | Boundary affected     | Required control                                                                                                     |
| ---- | ----------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| T-01 | Stolen bearer/agent token replayed from another client            | Browser→BFF; BFF→API  | Short token lifetimes; §4.5 sender-constrained artifact assessment; §5 checks 1–3; revocation via introspection      |
| T-02 | Widget-held merchant ID token stolen via XSS or host compromise   | Browser               | §8 browser rules; target opaque session handle replacing the cached token (G-08)                                     |
| T-03 | Caller-supplied `userId`/`merchantId` used as authority           | API enforcement       | §5 checks 6–7 — subject and merchant derived from the token, request values only validated against it (G-07)         |
| T-04 | Cross-merchant data access via guessed or forwarded references    | Tenant isolation      | §5 check 7 fail-closed `resource_forbidden`; adapter `resource_forbidden` semantics (Contract §7.1)                  |
| T-05 | Authorization-code interception                                   | Front channel         | PKCE, exact redirect URI, single-use short-TTL codes, server-side exchange (Flow A)                                  |
| T-06 | Callback/`postMessage` forgery                                    | Browser               | §8 messaging rules — exact target origin, nonce, origin/source/state validation (G-08, G-09)                         |
| T-07 | Consent replay or duplicate submission                            | Payment authorization | §6 single-use nonce, expiry, exact-match binding; idempotency keys (Contract §6.1; Task 6 reliability model)         |
| T-08 | Prompt injection causing secret exfiltration or fabricated totals | Model boundary        | §8 model rules; model values never authoritative (Contract §2.1); redaction before prompt assembly                   |
| T-09 | Token leakage via URLs, referrers, or logs                        | All surfaces          | §8 URL/referrer/log rules; `Referrer-Policy: no-referrer`; redaction before persistence                              |
| T-10 | Agent privilege escalation (missing audience, scope inflation)    | Delegation            | Flow C audience binding; scope subset of the privilege grant; `act.sub` enforcement (§5 check 5)                     |
| T-11 | Connector credential or webhook secret leakage                    | Adapter boundary      | §9 secret manager, rotation, fail closed; secret-free manifests (G-12, Contract §4.2)                                |
| T-12 | Forged or replayed merchant events                                | Event boundary        | Signature verification, replay window, `(source, id)` deduplication (Contract §8.2 — referenced, not redefined here) |
| T-13 | Revoked shopper continues transacting on a live session           | Session/consent       | §5.4 revoked-token behavior; §6 revocation cascade; consent revocation independent of token state                    |

Residual risks: the current token profile cannot do local signature verification (symmetric signing
keys, introspection-only verification), so revocation latency is bounded by introspection call
frequency, not by local checks. Multi-instance deployments must treat the in-memory BFF session
artifacts as ephemeral and back consent/operation state with durable storage (Task 6 scope).

## 12. Future implementation targets

Listed as follow-up seams only — none exist today:

1. `apps/payment-api/src/middleware.ts`: implement the §5.2 checks (audience, scope, agent,
   subject, merchant, object ownership) on top of the existing introspection gate.
2. `apps/chatbot-agent`: replace the widget-held merchant ID token with an opaque, short-lived,
   audience-bound BFF session artifact (G-08), and derive all authority server-side (G-07).
3. Shared auth/request types carrying the server-derived subject/agent/merchant context described
   by Contract §3.2 `SubjectContext`.
4. Consent/operation/idempotency storage per Task 6 (reliability model).
5. [`identity.md`](./identity.md) alignment when the deployment model above changes current
   behavior.
6. DPoP/sender-constraint assessment (§4.5) once the session boundary is implemented.

## 13. Related decisions and sources

- [Commerce interoperability assessment and target architecture](./commerce-interoperability.md)
  (Task 1 evidence baseline, G-01..G-12; Task 2 trust topology)
- [Merchant Commerce Adapter contract](./commerce-adapter-contract.md) (§2 authority boundary,
  §3.2 `SubjectContext`, §9.4 authorization path, §10 redaction)
- [Connector strategy](./connector-strategy.md)
- [Identity model](./identity.md) (current two-step bridge description)
- [Merchant onboarding](./merchant-onboarding.md) (identity and trust setup inputs)
- Project requirements §5 (identity, delegation, and authorization requirements)
- [OAuth 2.0 Token Exchange (RFC 8693)](https://www.rfc-editor.org/rfc/rfc8693)
- [OAuth 2.0 Resource Indicators (RFC 8707)](https://www.rfc-editor.org/rfc/rfc8707.html)
- [Rich Authorization Requests (RFC 9396)](https://www.rfc-editor.org/rfc/rfc9396.html)
- [OAuth 2.0 DPoP (RFC 9449)](https://www.rfc-editor.org/rfc/rfc9449)
- [OAuth 2.0 Mutual-TLS Client Authentication (RFC 8705)](https://www.rfc-editor.org/rfc/rfc8705)
- [PAR (RFC 9126)](https://www.rfc-editor.org/rfc/rfc9126) and
  [JAR (RFC 9101)](https://www.rfc-editor.org/rfc/rfc9101)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [PCI DSS](https://www.pcisecuritystandards.org/standards/pci-dss/)
