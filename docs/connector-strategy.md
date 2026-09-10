# Connector Strategy for the Merchant Commerce Adapter

## 1. Purpose and scope

This document is the Task 4 connector strategy. It maps four merchant platform styles —
Shopify-style hosted commerce, SAP-style enterprise/ERP orchestration, Oracle-style
commerce/order/loyalty services, and a generic custom merchant adapter — onto the canonical
Merchant Commerce Adapter contract. It also assesses which Phase 1 fake/fixture behaviors in this
repository are representative of real platforms and which are not, and selects the first
connector/test double for Phase 1.

The target architecture and ownership boundaries are decided in
[`commerce-interoperability.md`](./commerce-interoperability.md). The operation surface,
idempotency, error taxonomy, webhook envelope, and hosted-checkout fallback cited below as
"Contract §n" are normative in
[`commerce-adapter-contract.md`](./commerce-adapter-contract.md), with machine-readable artifacts in
[`commerce-adapter-openapi.json`](./commerce-adapter-openapi.json) and
[`commerce-adapter-schemas.json`](./commerce-adapter-schemas.json).

### 1.1 Evidence rules

- **Style-of-platform framing.** Every characteristic below describes a recurring _style of
  platform_, not a verified fact about a specific vendor release. Real product names (Shopify,
  SAP Commerce, Oracle Commerce) are used as comparative references because the plan and
  requirements name them; prior vendor-documentation citations live in the requirements sources
  ([`requirements.md`](../.polaris/merchant-chatbot-ecommerce-interoperability/requirements.md)),
  not here. No vendor capability claim, certification, or support statement is made.
- **No connector code or accounts.** This is a documentation-only task. No vendor account setup,
  SDK adoption, connector implementation, or conformance run is performed or claimed.
- **No directory creation.** A future connector package boundary (for example
  `apps/merchant-adapters/`) is recorded as a decision to validate before implementation
  (Section 9.4); nothing is created now.
- **No lossless-normalization promise.** Mapping is deliberately lossy; vendor data outside the
  canonical vocabulary is either dropped or carried only in namespaced extensions (Section 6).

## 2. Baseline: the canonical surface every connector maps to

Contract §4.1 requires every connector to publish an explicit capability entry — `status`
(`supported` / `limited` / `unsupported`) and `mode` (`sync` / `async`) — for every canonical
capability, so a connector is always judged against the full set, never against what it happens to
implement. The comparison below follows the Contract §5 operation groups:

- **Discovery and catalog:** `discoverCapabilities`, `searchCatalog`, `getProduct`,
  `checkAvailability`.
- **Quote and customer/loyalty:** `quoteCart`, `getCustomer`, `getLoyalty`.
- **Cart lifecycle:** `createCart`, `getCart`, `updateCart`/`reconcileCart`, `validateCart`,
  `expireCart`.
- **Checkout and payment handoff:** `createCheckoutSession`, `getCheckoutSession`,
  `cancelCheckoutSession`, `authorizePayment`/`capturePayment` or a declared
  `payment.nativeEquivalent` (Contract §5).
- **Order and fulfillment:** `createOrder`/`confirmOrder`, `getOrder`, `cancelOrder`,
  `getFulfillmentStatus`.
- **Operations and events:** `getOperationStatus`, `handleWebhook`.

The mapping in Section 4 covers the eight cross-cutting concerns named in the plan: product/variant
identifiers, pricing/quote, cart/checkout, order/fulfillment, webhooks, OAuth/service credentials,
rate limits, and eventual consistency.

## 3. Platform style profiles

Each profile describes the native shape a connector must translate, then its distinctive
constraints. Profile names follow the Contract §1.1 pattern (`*.beta` vendor profiles); profile
publication is future work, not a current artifact.

### 3.1 Shopify-style hosted commerce

**Native shape.** A hosted commerce platform where the storefront, cart, checkout, payment, tax,
shipping, and order pipeline are the platform's own products. Catalog is product/variant-structured
with per-variant inventory. Storefront APIs expose a buyer-identity-aware cart object whose lines,
discounts, delivery groups, and projected cost the platform computes; the canonical exit from a
cart is a platform-generated checkout URL into hosted checkout, after which the platform creates
the order itself. Apps authenticate through an installation/OAuth flow with scoped tokens; events
arrive as platform-emitted webhooks with native HMAC signing and topic granularity.

**Distinctive constraints (style characteristics, not vendor claims):**

- The merchant's hosted checkout is typically the payment path. A connector in this style should
  expect `checkout.create` to resolve to `mode: redirect` and `payment.authorize`/`payment.capture`
  to be `unsupported` in the provider profile, with the Contract §11 redirect fallback as the
  primary path — not a degraded mode.
- Cart identity, buyer identity binding, and checkout composition are platform-owned; the provider
  must not reconstruct checkout from cart lines. A platform checkout URL is a valid
  `checkout.redirect` continuation, never a prompt to rebuild checkout.
- Order objects are typically created by the platform after hosted-checkout payment; the provider
  observes orders rather than creating them (`order.create` `unsupported` or `limited` to
  post-payment confirmation, `order.read` native).
- Catalog/search throttling in such platforms is commonly budget- or cost-based rather than purely
  request-rate based; the connector must convert native throttling signals into
  `rate_limited` + `Retry-After` regardless of the native mechanism.
- Buyer-identity and customer-account patterns on such platforms have been changing independently
  of any provider contract (noted as connector-specific in
  [`requirements.md`](../.polaris/merchant-chatbot-ecommerce-interoperability/requirements.md)
  §11); subject-to-buyer mapping is connector-owned and revalidated per deployment.

### 3.2 SAP-style enterprise/ERP orchestration

**Native shape.** A commerce layer fronting ERP back ends: catalog and content services, a
rule-driven pricing/promotions engine, a server-side session cart with multi-step checkout
(add entries, delivery, payment, place order), and an order process that replicates into ERP
fulfillment asynchronously. Customer context is enterprise-shaped (business partners, sold-to/
ship-to parties, account hierarchies). Authorization frequently mixes a client-credentials token
for back-end APIs with a user-delegated token path for customer-scoped calls, plus ERP role checks
behind the commerce layer.

**Distinctive constraints:**

- Commercial values are computed by separate pricing/availability services at request time; a
  quote is a resolved result with a short validity window, and reservation-capable quotes make
  `quoteCart` a state-changing operation requiring an `Idempotency-Key` (Contract §6.1).
- The server-side session cart with a native GUID maps to `cart.create`/`cart.read`/`cart.update`
  /`cart.validate`/`cart.reconcile`; native deployments vary on optimistic versions. Where no
  version/ETag exists, the capability document MUST declare `optimisticConcurrency: false` and the
  native protection instead (Contract §6.3); the provider then treats stale-write safety as
  unavailable.
- Order placement is commonly asynchronous end to end: `createOrder` returns `202` +
  `operationId` (`getOperationStatus` reconciliation), and fulfillment status trails the order
  through ERP propagation (Contract §5.5, §7.3).
- Order/payment sequencing is profile-defined. Some landscapes place the order first and settle
  payment later; the profile must declare the sequence explicitly (Contract §5.4) and expose a
  `payment.nativeEquivalent` where the payment handoff is not a provider-driven authorize/capture.
- Landscapes differ (development, QA, production); capabilities, budgets, and event infrastructure
  must be discovered per landscape, and the integration manifest is per deployment (Contract §4.2).
- Catalog breadth is enterprise-scale; `searchCatalog` pagination limits (`limits.maxPageSize`)
  and channel/locale scoping are first-class profile constraints, not afterthoughts.

### 3.3 Oracle-style commerce/order/loyalty services

**Native shape.** A distributed set of commerce services — REST catalog, cart, and checkout on one
side; order management, customer profile, and loyalty as separate services with their own
deployment, configuration, and OAuth/service identities. Promotions, tax, and shipping are
policy-driven services consulted during checkout. Order state advances through an order-management
state machine, often asynchronously, with fulfillment as a separate lifecycle again.

**Distinctive constraints:**

- Capability distribution is the defining risk: the connector's capability document must reflect
  which service families are actually deployed and enabled for the merchant, not the platform's
  nominal feature list. `capability.discovery` is the only safe source (Contract §4).
- Multiple service identities mean credential sprawl: each service family needs its own scoped
  credential, secret reference, and rotation window (Contract §9.3), and the manifest MUST fail
  closed when any required credential is expired or revoked.
- Order/payment/fulfillment status transitions are asynchronous and may include native states with
  no canonical equivalent; the connector maps known states to the canonical enums and MUST map
  unmapped states to `unknown` rather than guessing (Contract §5.4).
- Loyalty is a separate service: `loyalty.lookup` is an independently scoped capability, and
  redemption effects must arrive as merchant quote/cart results to be revalidated before payment —
  never as a provider-side deduction (Contract §5.2).
- Payment integration is deployment-specific (gateway choice, tokenization, capture timing); the
  profile declares `payment.authorize`/`payment.capture` support or a native equivalent per
  deployment rather than per platform.

### 3.4 Generic custom merchant adapter

**Native shape.** The merchant's own commerce backend wrapped by a merchant-hosted thin adapter
that implements the canonical contract directly. This is the profile the contract names
`generic.v1` and the shape Phase 1 builds. The adapter author controls the mapping, so agreement
with the contract can be exact — and so every platform-provided safety the other styles inherit
must be built or explicitly declared instead.

**Distinctive constraints:**

- No native version/ETag may exist; the adapter must either implement opaque versions or declare
  `optimisticConcurrency: false` with its server-side protection (Contract §6.3).
- No native webhook infrastructure may exist; the contract requires a signature profile — the
  merchant's native HMAC or an approved HTTP Message Signature profile — plus timestamp/replay
  checks, or the connector declares `events.webhook` limited with a polling/reconciliation source
  (Contract §8, §9.2).
- Guest support, locale, currency, and payment-method coverage are entirely connector-defined and
  must be advertised per merchant, not assumed.
- Rate limits and timeouts are whatever the adapter declares; a custom adapter that omits limits
  gets the contract defaults, and an undeclared concurrency guarantee is treated as unavailable
  (Contract §4.1, §6.3).
- Because the merchant builds it, this profile is where the conformance suite earns its keep: it is
  the reference implementation the other profiles are compared against (Contract §12).

## 4. Canonical mapping

Legend for all mapping tables — **Native**: the platform has a first-class concept that maps
directly; **Asm**: the connector assembles the canonical result from multiple native calls/fields;
**Ltd**: declared `limited` with a named constraint the provider must enforce; **Uns**: declared
`unsupported`, must return `501 capability_not_supported` when called (Contract §4.1). All
platform-specific detail stays in the connector; only canonical fields cross the boundary.

### 4.1 Discovery, catalog, quote, and customer/loyalty

| Canonical capability   | Shopify-style hosted commerce                                                                                                                                           | SAP-style enterprise/ERP                                                                                                                             | Oracle-style services                                                                                                 | Generic custom adapter                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `capability.discovery` | Native: app/scopes discovery is an installation concept; connector maps it to the document.                                                                             | Native per landscape; capabilities vary by deployed services and must be re-read per environment.                                                    | Native per service family; discovery must reflect which services are actually enabled.                                | Native (author implements it); the easiest capability to get right and the most important to test. |
| `catalog.search`       | Asm: platform search/product APIs mapped to paginated display-safe summaries; native cursors hidden in `pageToken`.                                                     | Asm: catalog/content services behind the commerce layer; channel and language variants resolved per request.                                         | Asm: REST catalog search with merchant-configured facets; policy-driven visibility stays merchant-side.               | Native (direct implementation).                                                                    |
| `catalog.product`      | Native: product/variant structure maps to product + variant refs; media/description as display values.                                                                  | Native: product master data; variant/classification detail may be Asm across services.                                                               | Native: catalog items with commerce-managed media/pricing display.                                                    | Native.                                                                                            |
| `catalog.availability` | Asm: per-variant inventory; location-aware availability is Ltd to enabled locations.                                                                                    | Native/Asm: availability from inventory services, often with ATP rules; reservation effects are profile-declared.                                    | Asm: inventory per item/location from the commerce or inventory service.                                              | Native (self-declared).                                                                            |
| `commerce.quote`       | Ltd: projected cart cost is available but tax/shipping are finalized only at checkout in many deployments; quote TTL often short. Asm from cart + checkout composition. | Native: rule-driven pricing/promotions resolve a quote with a validity window; reservation quotes make it state-changing (idempotency key required). | Native/Asm: promotions, tax, and shipping services compose the quote during checkout; pre-checkout quotes may be Ltd. | Native.                                                                                            |
| `customer.lookup`      | Ltd: buyer-identity integration is platform-specific and changing; email is never the key (Contract §5.2).                                                              | Native: enterprise customer/partner model; sold-to/ship-to selection is connector-owned.                                                             | Native: profile service with its own OAuth identity; field projection is policy-driven.                               | Native (self-declared, allowlisted projection).                                                    |
| `loyalty.lookup`       | Ltd/Uns: loyalty may be app-based or external; declared per merchant.                                                                                                   | Ltd/Uns: loyalty lives in separate modules or external systems; scoped read only.                                                                    | Native: separate loyalty service with independent credentials; redemption is a quote/cart input only (Contract §5.2). | Native (self-declared).                                                                            |

### 4.2 Cart, checkout, and payment handoff

| Canonical capability                        | Shopify-style hosted commerce                                                                                                                                                          | SAP-style enterprise/ERP                                                                                                                | Oracle-style services                                                                                              | Generic custom adapter                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `cart.create` / `cart.read` / `cart.update` | Native: platform cart object with lines, buyer identity, discounts, delivery groups; cart ID and version mapping into opaque refs.                                                     | Native: server-side session cart with native GUID; line mutation may be multi-call (Asm).                                               | Native: REST cart with merchant-configured order/checkout state.                                                   | Native.                                                                  |
| `cart.validate` / `cart.reconcile`          | Asm: platform-side re-resolution of lines/cost; deltas surfaced to the provider; no silent overwrite.                                                                                  | Native: cart recalculation service validates prices/promotions/availability and returns deltas.                                         | Asm: checkout-time recomposition of promotions/tax/shipping; deltas returned as validation warnings.               | Native.                                                                  |
| `cart.expire`                               | Ltd: platform cart TTLs may not be merchant-settable; expiry may be observable only.                                                                                                   | Native: session timeout semantics; explicit merchant expiry may be Ltd.                                                                 | Native: cart/session timeout configuration per deployment.                                                         | Native (self-declared).                                                  |
| `checkout.create`                           | Ltd → `mode: redirect` in the typical profile: the exit is the platform checkout URL (hosted checkout). `in_chat` only where a server-side payment integration is separately approved. | Native: multi-step server-side checkout; `in_chat` where the payment service accepts a provider payment reference or native equivalent. | Native/deployment-specific: checkout + payment gateway composition decides `in_chat` vs `redirect` per deployment. | Native (both modes implementable; Phase 1 exercises all three modes).    |
| `checkout.read` / `checkout.cancel`         | Asm from cart/checkout state; hosted checkout progress may be Ltd to status polling.                                                                                                   | Native with native state mapping to canonical checkout enums.                                                                           | Native; intermediate OMS states map to canonical or `unknown`.                                                     | Native.                                                                  |
| `payment.authorize` / `payment.capture`     | Uns in the typical profile: hosted checkout performs payment; only a provider payment reference ever crosses the boundary (Contract §5.4).                                             | Ltd/native-equivalent: authorization may be an ERP/payment-document operation via `payment.nativeEquivalent`.                           | Deployment-specific: gateway/tokenization choice defines support; declared per merchant.                           | Native (test payment reference; no raw instruments ever, Contract §5.4). |
| `checkout.redirect` fallback                | Primary path: platform checkout URL + single-use `continuationId`, return reconciled by API/webhook (Contract §11).                                                                    | Fallback path for deployments without in-chat payment support.                                                                          | Same as enterprise/ERP where in-chat is not enabled.                                                               | Implemented as first-class capability (Contract §11).                    |

### 4.3 Order, fulfillment, operations, and events

| Canonical capability             | Shopify-style hosted commerce                                                                                                               | SAP-style enterprise/ERP                                                                                                                                    | Oracle-style services                                                                                                         | Generic custom adapter                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `order.create` / `order.confirm` | Uns/Ltd in the typical profile: the platform creates the order from hosted checkout; the provider confirms/reads instead.                   | Ltd/async: order placement may return `202` + `operationId`; sequencing (order-before-payment vs payment-before-order) is profile-declared (Contract §5.4). | Native/async: order creation through OMS; state advances asynchronously.                                                      | Native.                                                                                         |
| `order.read`                     | Native: post-checkout order status from platform order APIs.                                                                                | Native; status propagation from ERP may lag, mapping to `pending`/`unknown`.                                                                                | Native: OMS order status with deployment-specific state machine.                                                              | Native.                                                                                         |
| `order.cancel`                   | Ltd: cancellation may be restricted post-payment or windowed.                                                                               | Ltd/async: cancellation is a business process, not a flag flip.                                                                                             | Ltd/async: cancellation routes through OMS with its own states.                                                               | Native (self-declared).                                                                         |
| `fulfillment.status`             | Native: platform fulfillment/tracking data; tracking classified display-safe (Contract §5).                                                 | Asm/async: fulfillment status trails ERP/WM execution; estimates only, never authoritative promises.                                                        | Native/async: separate fulfillment lifecycle; partial shipments map to partial/unknown states.                                | Native.                                                                                         |
| `operation.status`               | Native for accepted mutations; webhook-driven reconciliation otherwise.                                                                     | Essential: the default outcome of async mutations is `accepted` + `operationId` (Contract §5.5, §7.3).                                                      | Essential: OMS transitions reconcile through operation status and events.                                                     | Essential (Phase 1 must prove timeout/unknown recovery).                                        |
| `events.webhook`                 | Native: platform-emitted signed webhooks with topic granularity; connector maps topics to normalized core CloudEvent types (Contract §8.1). | Varies: event infra differs per landscape; a polling/reconciliation source may replace push (declared, not implicit).                                       | Per-service event publication; ordering/version metadata (`dataversion`, `sequence`) preserved where offered (Contract §8.2). | Merchant-implemented signature + replay/dedupe, or declared limited with polling (Contract §8). |

### 4.4 Cross-cutting concern mapping

| Concern                   | Canonical treatment (Contract reference)                                                                                                                                                                       | Style-specific translation (connector-owned)                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/variant IDs       | Native platform IDs never cross the boundary; the adapter issues opaque `ResourceRef`s meaningful only in merchant scope; native IDs live in namespaced connector metadata (§5.1, §6.2, schema `ResourceRef`). | Hosted platforms: product/variant/inventory-item triple collapses to product + variant refs. ERP: composite material/config keys. Suite: per-service item IDs unified per merchant scope. Custom: merchant-issued refs. |
| Pricing/quote             | `quoteCart` returns authoritative lines, tax, shipping, delivery, total, `sourceVersion`, `expiresAt`; client/model values are never authority (§2.1, §5.3).                                                   | Hosted: projected cart cost, often completed at checkout (Ltd). ERP: pricing engine + reservation semantics. Suite: promotions/tax/shipping services at checkout. Custom: own rules.                                    |
| Cart/checkout             | Merchant cart is the sole authoritative cart; provider keeps opaque handle + version + TTL; `createCheckoutSession` returns `in_chat` / `redirect` / `unsupported` (§5.3, §5.4, §11).                          | Hosted: cart exit is the hosted checkout URL (`redirect`). ERP/suite: server-side checkout with declared sequencing. Custom: implementer chooses per capability.                                                        |
| Order/fulfillment         | Order confirmed only from authoritative merchant response or verified event; fulfillment may be async/partial; native states map to canonical enums or `unknown` (§5.4, §5.5).                                 | Hosted: platform-created orders observed by the provider. ERP: async replication/fulfillment. Suite: OMS-driven transitions. Custom: self-declared lifecycle.                                                           |
| Webhooks                  | CloudEvents v1.0.2 envelope with contract-required attributes, native or HTTP Message Signature verification, timestamp/replay checks, `(source, id)` dedupe, out-of-order tolerance (§8).                     | Hosted: native HMAC + topics → core event types. ERP/suite: per-service events, possibly replaced by declared polling. Custom: signature profile must be implemented or events declared limited.                        |
| OAuth/service credentials | Server-side least-privilege credentials, secret references only in the manifest, rotation with overlap window, fail closed on expiry/revocation (§4.2, §9.3).                                                  | Hosted: installation/OAuth with scoped tokens. ERP: client-credentials plus user-delegated path for customer scope. Suite: per-service identities. Custom: per onboarding agreement.                                    |
| Rate limits               | Native throttling is translated to `rate_limited` with `Retry-After`; capability document declares page-size/timeout budgets; bounded retries with jitter (§4.1 `limits`, §7.1–§7.3).                          | Hosted: budget/cost-based throttling. ERP: per-landscape service budgets, batch-friendly. Suite: per-endpoint budgets. Custom: self-declared, defaults apply if omitted.                                                |
| Eventual consistency      | Webhooks and async responses are invalidation/reconciliation signals, never permission to overwrite merchant truth; provider re-reads before deciding (§5.5, §8.2, §6.4).                                      | Hosted: webhook delivery delay/reordering. ERP: ERP replication lag. Suite: OMS transition lag. Custom: whatever the adapter implements — declared, not assumed.                                                        |

## 5. Distinctive constraints and connector risks

| ID    | Risk                                                                                             | Where it bites                                                    | Contract control                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R-C01 | First connector's shape hardens into the de facto product contract ("Shopify is the contract").  | Any connector built before the conformance suite exists.          | §1.1 profiles are non-normative; §12 conformance separates core from profiles; Section 9 sequences the double first. |
| R-C02 | Native payloads, IDs, or cursors leak into prompts, widget state, logs, or events.               | Catalog search, pagination, error mapping, webhook payloads.      | §5.1 opaque refs/`pageToken`, §7.1 redacted Problem Details, §10 redaction, `ExtensionMap` (Section 6).              |
| R-C03 | Heterogeneous throttling (budget-based, per-service) breaks uniform retry behavior.              | Bursty conversational traffic against catalog/quote.              | §7.1 `rate_limited` + `Retry-After`, §7.2 bounded retries, §4.1 `limits`.                                            |
| R-C04 | Async order/fulfillment lag reported as failure (or as success).                                 | ERP replication, OMS transitions, hosted-checkout order creation. | §5.5 unknown outcomes, `operation.status`, §3.3 envelope-vs-domain status separation.                                |
| R-C05 | Out-of-order or delayed events overwrite newer projections.                                      | Reconciliation worker consuming event streams.                    | §8.2 `dataversion`/`sequence` handling, no overwrite of newer projections, re-read before effect.                    |
| R-C06 | Credential sprawl across distributed services (suite style) or across landscapes (ERP style).    | Onboarding, rotation, incident response.                          | §4.2 manifest scope list, §9.3 rotation/revocation, fail closed on invalid credentials.                              |
| R-C07 | Missing native concurrency (custom adapters, some ERP carts) silently breaks stale-write safety. | Concurrent cart/checkout mutations from web + chat.               | §6.3 declare `optimisticConcurrency: false` + native protection; undeclared guarantees treated as absent.            |
| R-C08 | Guest vs subject-bound operation differences misdeclared.                                        | Guest browsing, cart ownership, loyalty calls.                    | §5 subject-context requirements per operation; capability entries declare `requiresSubject`.                         |
| R-C09 | Capability drift after connector/merchant configuration changes.                                 | Cached capability documents enabling unsupported operations.      | §4 capability expiry + refresh after configuration changes or capability errors.                                     |

## 6. Adapter-internal identifiers and the controlled extension strategy

Vendor-specific identifiers and payloads never become provider contract surface. The rules:

1. **Opaque references.** Native product/variant/cart/checkout/order identifiers are mapped to
   opaque `ResourceRef` values that are meaningless outside the authenticated merchant scope
   (Contract §3.3, schema `ResourceRef`). The connector keeps the native ID ↔ opaque ref mapping
   internal; native IDs appear only in connector-internal namespaced metadata, never in canonical
   fields, logs, prompts, or widget payloads (Contract §6.2, §10).
2. **Pagination opacity.** Native cursors are embedded only inside the opaque `pageToken`; the
   provider MUST NOT log it if it embeds native data, and no native query language or arbitrary
   filter passthrough is exposed (Contract §5.1).
3. **Typed responses are closed.** Core objects set `additionalProperties: false`; optional
   connector data exists only through `x-` namespaced extension maps (schema `ExtensionMap`,
   `propertyNames` pattern `^x-[a-z0-9][a-z0-9.-]*$`). Generic consumers MUST ignore unknown
   `x-` members; unknown required core members are a contract-version error (Contract §1.1, §3.3).
4. **Native error codes are quarantined.** A connector MAY include a native code only under
   `details.x-<connector>.code`; generic provider logic branches solely on canonical `code`,
   `category`, `retryable`, and capability state (Contract §7.1).
5. **Profile extension events are namespaced.** A vendor profile MAY add
   `com.merchant.<profile>.…` event types, but a generic provider consumer MUST process the core
   types or safely ignore extensions (Contract §8.1).
6. **Extension governance.** An extension namespace is registered in the merchant integration
   manifest at onboarding (Contract §4.2) and versioned with its profile, not with the core
   contract. Promoting an extension into the canonical vocabulary happens only through a contract
   version change (Contract §3.1) — never by silently widening the schemas.
7. **Lossiness is acceptable.** Normalization is deliberately lossy: vendor fields outside the
   canonical vocabulary are dropped from generic flows or namespaced for the specific profile. No
   operation promises lossless vendor normalization, and none should be attempted ad hoc.

## 7. Capability gaps and defined fallbacks

The Contract §4.1 rule is absolute: a gap produces a declared capability status and a deterministic
fallback — never a best-effort charge, a provider-side emulated record, or a silently changed
amount. The mapping per style:

| Style                | Typical gap (style characteristic)                                           | Declared capability state                                                                  | Defined fallback (Contract §4.1 / §11)                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shopify-style hosted | No provider-side payment authorization; hosted checkout is the payment path. | `payment.authorize`/`payment.capture`: `unsupported`; `checkout.create`: redirect-capable. | `createCheckoutSession` returns `mode: redirect` with a short-lived single-use `continuationId`; return is reconciled via API/verified webhook, never a browser callback; `order.confirm` fires only after authoritative status (§11). |
| Shopify-style hosted | Loyalty via external/app modules, or none.                                   | `loyalty.lookup`: `limited` or `unsupported`.                                              | Withheld loyalty fields; conversation continues without them; never a provider-side points estimate (§5.2).                                                                                                                            |
| SAP-style ERP        | Quote requires reservation, or versions absent on carts.                     | `commerce.quote`: state-changing with TTL; or `optimisticConcurrency: false`.              | Idempotency key on quotes that reserve (§6.1); native protection declared and relied on instead of fake versions (§6.3).                                                                                                               |
| SAP-style ERP        | Order placement is asynchronous.                                             | `order.create`: `mode: async`.                                                             | `202` + `operationId`; provider reports `pending`/`unknown` until `getOperationStatus` or a verified event resolves (§5.5, §7.3).                                                                                                      |
| Oracle-style suite   | Order/loyalty/payment services distributed; some families not deployed.      | Per-family capability entries; some `unsupported`.                                         | Disabled families are absent from the experience (e.g., no loyalty prompt); the remaining checkout path still uses §11 fallback. Nothing is emulated (§4.1).                                                                           |
| Oracle-style suite   | Native order states with no canonical equivalent.                            | — (mapping concern)                                                                        | Map known states to canonical enums; map everything else to `unknown` and reconcile; never guess a status (§5.4).                                                                                                                      |
| Generic custom       | No native versions or webhook infrastructure.                                | `optimisticConcurrency: false`; `events.webhook`: `limited`.                               | Declared native protection for concurrency; polling/reconciliation source for events; host checkout fallback for unsupported in-chat (§6.3, §8, §11).                                                                                  |
| All styles           | No safe checkout path enabled at all.                                        | `checkout.create`: `unsupported`.                                                          | `501 capability_not_supported` with a merchant-host fallback action; the provider MUST NOT create a provider-owned order or charge anything (§4.1, §11).                                                                               |

In every row the invariant is the same: the shopper is never charged from a best-effort or
provider-reconstructed value. Amounts come only from a merchant quote/checkout response with a
matching version inside its validity window (Contract §2.1, §6.4), and changed values force
re-confirmation, never a silent charge.

## 8. Phase 1 fixture representativeness

The current POC fixtures and routes are the only commerce behaviors the repository exercises. This
table classifies each against real-platform style characteristics, with evidence paths; "Partly"
means the pattern survives behind the adapter, not that the current implementation is conformant.

| #    | Fixture behavior (evidence)                                                                                                                                                                                                                                                       | Representative?             | Why, and what the connector/test double must do instead                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | Provider-owned single-price JSON catalog with integer `stock` (`data/products.json`; products route per G-01).                                                                                                                                                                    | Partly                      | Merchant-scoped product/variant refs and availability are the right shape; real platforms add variants/options, locale/channel, customer-group pricing, tax/shipping separation, pagination. The catalog path must move behind the adapter (G-01). |
| F-02 | `membersOnly` / `memberPrice` fields on products (`data/products.json`).                                                                                                                                                                                                          | Partly                      | A crude stand-in for customer-group pricing. Real customer-specific pricing resolves inside the quote (`quoteCart`), never by field sniffing in the caller (Contract §5.3).                                                                        |
| F-03 | Storefront catalog fetched from the provider product route ([`catalog.ts#L5-L21`](../apps/merchant-web/src/lib/catalog.ts#L5-L21)).                                                                                                                                               | Not representative          | Inverts ownership; the payment API must not look like the commerce source. Target is an adapter-backed merchant catalog path.                                                                                                                      |
| F-04 | Chatbot system prompt built from the full local catalog ([`chat route#L648-L666`](../apps/chatbot-agent/src/app/api/chat/route.ts#L648-L666)).                                                                                                                                    | Not representative          | Real catalogs are large and paginated; injecting catalog rows into prompts is a model-context and redaction hazard. Target: adapter `searchCatalog` with display-safe summaries.                                                                   |
| F-05 | Model `propose_purchase` tool supplies `unitPrice`/`quantity` consumed as cart authority ([`route.ts#L289-L300, L675-L705`](../apps/chatbot-agent/src/app/api/chat/route.ts#L289-L300); G-05).                                                                                    | Not representative          | Directly violates the client-authoritative-value prohibition (Contract §2.1). Keep only as intent capture; prices must come from `quoteCart`.                                                                                                      |
| F-06 | Confirmation handler picks the first saved wallet card ([`route.ts#L553-L554`](../apps/chatbot-agent/src/app/api/chat/route.ts#L553-L554)).                                                                                                                                       | Not representative          | Real flows present merchant-permitted payment methods from the checkout session (`CheckoutData.paymentMethods`) and may require challenges (`requires_action`).                                                                                    |
| F-07 | Payment checkout recomputes totals from provider JSON and appends a transaction ([`checkout route#L102-L196`](../apps/payment-api/src/app/api/checkout/route.ts#L102-L196); G-04, G-10).                                                                                          | Partly                      | "Server resolves the authoritative total" is directionally right, but the authority source is provider-local, and no checkout session, authorization state, or merchant order exists.                                                              |
| F-08 | Timestamp/sequence-derived IDs (`nextTxnId`, `nextChkId`, `cart_${Date.now()}`) ([`checkout route#L31-L42, L249-L264`](../apps/payment-api/src/app/api/checkout/route.ts#L31-L42)).                                                                                               | Not representative          | Real platforms allocate server-side unique identifiers; timestamp-derived IDs plus unlocked read-modify-write are a duplicate-effect risk (G-10), exactly what idempotency keys prevent (§6.1).                                                    |
| F-09 | Consent = presence of `source`/`confirmedAt` ([`checkout route#L55-L65`](../apps/payment-api/src/app/api/checkout/route.ts#L55-L65); G-05).                                                                                                                                       | Not representative          | Real consent binds subject, merchant, exact amount/currency, cart/quote version, nonce, and expiry (Contract §2, §6.4).                                                                                                                            |
| F-10 | Instant `status: "captured"` checkout session ([`checkout route#L249-L264`](../apps/payment-api/src/app/api/checkout/route.ts#L249-L264)).                                                                                                                                        | Not representative          | Real payment is `pending`/`authorized`/`declined`/`requires_action` before `captured` (Contract §5.4). The state machine and its failure paths are precisely what Phase 1 must demonstrate.                                                        |
| F-11 | Best-effort loyalty accrual that never rolls back ([`checkout route#L204-L246`](../apps/payment-api/src/app/api/checkout/route.ts#L204-L246)).                                                                                                                                    | Partly                      | Post-payment loyalty effects exist on real platforms, but as reconciled/event-driven effects with an outbox, not silent skips; redemption must be merchant-quoted (Contract §5.2).                                                                 |
| F-12 | Browser-local cart with price snapshots rebuilt into a checkout request ([`cart-provider.tsx#L39-L88`](../apps/merchant-web/src/components/cart-provider.tsx#L39-L88); [`checkout-form.tsx#L156-L183`](../apps/merchant-web/src/app/checkout/checkout-form.tsx#L156-L183); G-03). | Partly                      | A client-side convenience cart mirrors real storefronts, but the demo never synchronizes it with an authoritative merchant cart/version — the missing half is the architecture's core.                                                             |
| F-13 | Silent SSO/PKCE with server-side code exchange and token exchange ([`merchant-bridge.ts#L51-L102`](../apps/chatbot-agent/src/lib/merchant-bridge.ts#L51-L102); [`docs/identity.md#L64-L114`](../docs/identity.md#L64-L114)).                                                      | Representative as a pattern | Server-derived subject binding matches the contract's `SubjectContext` model (§3.2, §9.4); merchant-specific buyer-identity binding remains connector work per Section 3.1.                                                                        |
| F-14 | Multi-merchant seed data with no cross-tenant enforcement (`data/merchants.json`; G-06, G-07).                                                                                                                                                                                    | Partly                      | Merchant-scoped records are the right shape; real platforms enforce tenant isolation per request, which the current routes do not.                                                                                                                 |
| F-15 | No webhooks/events anywhere in the POC (absence; G-02, G-12).                                                                                                                                                                                                                     | Not representative          | All four styles emit signed events or require a declared polling source; reconciliation and fallback completion depend on them (Contract §8).                                                                                                      |

Net assessment: the fixtures prove conversational UX and identity-binding patterns; they contain no
representative quote/version/expiry, checkout-session, authorization-state, idempotency, webhook, or
fallback behavior. The Phase 1 test double must therefore add, not mirror: idempotent replay,
version conflict, quote expiry, payment decline/timeout-unknown, and the redirect fallback path.

## 9. First connector/test double for Phase 1

### 9.1 Recommendation

Build Phase 1 against a **Northwind merchant-hosted test-double adapter implementing the
`generic.v1` profile**, exercised through a contract conformance suite, before any vendor-style
connector is written. This matches the plan's Phase 1 slice (one Northwind demo adapter backed by a
merchant-side test service or isolated fixture) and Contract §12 ("the conformance suite should run
against a fake merchant first").

### 9.2 Why this one first

1. **It is the only style the repository can host end-to-end today.** The merchant-hosted thin
   layer, Northwind/Contoso configuration, and merchant IDP federation already exist; a
   vendor-style connector would require external accounts and credentials, which are non-scope.
2. **It attacks the riskiest unknown first.** The open risk in Phase 1 is the canonical boundary —
   authority, idempotent replay, consent binding, unknown-outcome reconciliation, fallback — not
   vendor translation. A test double can prove those deterministically; a vendor sandbox cannot.
3. **It is scriptable for every failure path.** Stale version, price change, quote expiry,
   payment decline, timeout/unknown, and redirect-only mode are all injectable, which the Phase 1
   acceptance scenarios require.
4. **It exercises both checkout modes.** `in_chat` with a test payment reference, `redirect` with
   the Northwind storefront as the hosted-checkout stand-in, and the `unsupported` host-fallback
   error path can all be demonstrated without a vendor.
5. **It prevents first-connector-as-contract (R-C01).** The double is built against the conformance
   suite rather than against one platform's behavior, so the contract — not Shopify, SAP, or Oracle
   — defines conformance (Contract §12).

### 9.3 Sequencing after the double

1. Conformance suite green against the Northwind double (Contract §12 checklist).
2. A Shopify-style redirect-heavy profile as the second profile — it exercises the hosted-checkout
   fallback path at scale and the webhook topic-mapping pattern — implemented behind the same
   manifest/endpoint shape, still as a test double before any live integration.
3. SAP-style and Oracle-style profiles only after the conformance suite is parameterized by
   profile, with per-deployment capability discovery validated against a real target system.

### 9.4 Package boundary decision (to validate, not create)

The plan suggests a future connector area such as `apps/merchant-adapters/`. This task creates no
directory. Before implementation, validate: (a) whether adapters are a pnpm workspace package (for
example `packages/` or `apps/merchant-adapters/`), (b) whether the Phase 1 double is merchant-hosted
or provider-hosted — Contract §9 permits both hosting models, and the choice affects deployment,
secret management, and network path, and (c) how the double shares schemas with
`packages/shared/src/types/commerce.ts` (Contract §12.1) without coupling merchant code to provider
runtime. The decision must be recorded where implementation tasks can find it; Phase 1 evidence
must not depend on the choice.

## 10. Open validation questions

1. For a Shopify-style deployment, does the merchant's approved integration expose any server-side
   payment path, or is hosted checkout always the exit? (Decides `in_chat` availability and
   whether `payment.authorize` is ever more than `unsupported`.)
2. For SAP-style deployments, which landscapes' pricing/availability services support
   reservation-capable quotes, and what is the real quote TTL? (Determines whether `quoteCart` is
   read-only or idempotency-required per §6.1.)
3. For Oracle-style deployments, which service families (order management, loyalty, promotions) are
   actually enabled per merchant, and what is the full native state space to map to canonical
   enums or `unknown`?
4. What native concurrency evidence exists per merchant (versions, ETags, reservations) — enough
   to declare `optimisticConcurrency: true` honestly rather than by default?
5. What webhook signing profiles do real merchant platforms in scope actually offer, and where is
   HTTP Message Signatures (RFC 9421) needed as the fallback (Contract §1.1, §8)?
6. Which customer-identity binding per platform is stable enough for `SubjectContext` resolution
   without email as a key (Contract §5.2), given that hosted-platform identity models are changing
   (requirements TAPDEV-662 note)?
7. Do real rate-limit budgets leave room for conversational burst traffic, or do catalog reads
   need provider-side caching with explicit freshness bounds (Contract §6.4)?

These are validation questions, not implementation blockers; each is answered by the connector
validation step for the platform in question, not by this document.

## 11. Related decisions and sources

- [Merchant–Chatbot Commerce Interoperability](./commerce-interoperability.md) — target architecture, gap register G-01..G-12, and topology.
- [Merchant Commerce Adapter Contract](./commerce-adapter-contract.md) — normative operations, capability document, errors, webhooks, and hosted-checkout fallback (§4, §5, §7, §8, §11, §12).
- [commerce-adapter-openapi.json](./commerce-adapter-openapi.json) and [commerce-adapter-schemas.json](./commerce-adapter-schemas.json) — machine-readable contract artifacts.
- [Project requirements](../.polaris/merchant-chatbot-ecommerce-interoperability/requirements.md) — Section 8 connector model and cited vendor documentation sources (vendor claims live there, framed as to-be-validated).
- [Implementation plan](../.polaris/merchant-chatbot-ecommerce-interoperability/plan.md) — Task 4 scope and Phase 1 slice.
