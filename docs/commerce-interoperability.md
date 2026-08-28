# Merchant–Chatbot Commerce Interoperability

## Current-state assessment

**Assessment status:** evidence baseline and gap register only (Implementation Plan Task 1).

This document records behavior observed in the checked-in repository. It is not a target
architecture, adapter contract, implementation plan, or claim of production readiness. The
architecture recommendation and future-state contract are intentionally left to later tasks.
Every observation below names the repository path that was reviewed; line ranges identify the
relevant implementation or documentation.

### Assessment boundary and evidence rules

The assessment covers the reusable chatbot, merchant storefront, payment API, shared types and
persistence helpers, merchant configuration/onboarding, and the existing architecture and
identity documentation. The reviewed evidence includes the direct chatbot-to-payment API calls,
the merchant-web catalog proxy, the checkout proxy, the identity bridge/token exchange, and the
trace path. “Current” means behavior represented by the checked-in code or the current descriptive
documentation. A gap is a missing boundary or control evidenced by the current request path; it is
not evidence that a future control has been implemented.

The repository also contains seed JSON and local development configuration. Those artifacts are
included when they are read or written by an exercised route. They are not treated as evidence
of merchant-platform interoperability.

## Evidence summary

The proof of concept currently demonstrates a merchant-hosted storefront with an embedded
provider chatbot, a silent-SSO/PKCE handoff, a server-side merchant-token bridge, provider user to
AI-agent token exchange, explicit chatbot confirmation UI, and a payment API. The exercised
commerce path remains provider-local: the chatbot loads a local product catalog, the storefront
uses a payment API product endpoint, the browser cart stores product snapshots in local storage,
and payment API checkout recomputes totals and records a provider-local transaction and loyalty
write. No inspected runtime path calls a merchant cart, checkout, order, fulfillment, or
webhook system through a platform-neutral adapter.

This conclusion is based on the request-path evidence in [`chatbot-agent` request handling](../apps/chatbot-agent/src/app/api/chat/route.ts#L381-L456),
[`chatbot-agent` catalog and checkout handling](../apps/chatbot-agent/src/app/api/chat/route.ts#L533-L666),
[`merchant-web` catalog loading](../apps/merchant-web/src/lib/catalog.ts#L5-L21),
[`merchant-web` cart state](../apps/merchant-web/src/components/cart-provider.tsx#L3-L15),
[`payment-api` checkout](../apps/payment-api/src/app/api/checkout/route.ts#L102-L264), and the
shared [`Cart`](../packages/shared/src/types/cart.ts#L1-L30) and
[`CheckoutSession`](../packages/shared/src/types/checkout.ts#L1-L35) shapes.

## Current request paths

### 1. Merchant host and widget integration

`merchant-web` loads the shared storefront runtime and the chatbot overlay from a script URL. It
passes public display/configuration and silent-SSO settings through `window.CHATBOT_CONFIG`; the
script is loaded asynchronously from the root layout. The host does not pass a merchant secret
or a payment credential in this configuration.

- [`apps/merchant-web/src/app/layout.tsx#L39-L50`](../apps/merchant-web/src/app/layout.tsx#L39-L50) defines the chatbot script/chat URLs and public identity-bridge configuration.
- [`apps/merchant-web/src/app/layout.tsx#L62-L100`](../apps/merchant-web/src/app/layout.tsx#L62-L100) loads merchant configuration, sets `window.CHATBOT_CONFIG`, and includes the overlay on every route.
- [`apps/merchant-web/src/lib/merchant-config.ts#L63-L101`](../apps/merchant-web/src/lib/merchant-config.ts#L63-L101) loads the selected merchant definition, theme, onboarding status, and catalog merchant ID from the local configuration root.
- [`config/merchants/northwind/definition.json#L1-L16`](../config/merchants/northwind/definition.json#L1-L16), [`config/merchants/northwind/onboarding.json#L1-L9`](../config/merchants/northwind/onboarding.json#L1-L9), and [`config/merchants/registry.json#L1-L14`](../config/merchants/registry.json#L1-L14) contain presentation, merchant ID, domain, issuer, client/audience, callback, and onboarding status data.

The widget allows guest browsing and attempts silent SSO when it opens. The code path stores a
one-time authorization code and verifier, sends them to the chatbot backend, and then caches the
merchant ID token returned by that backend in widget memory for later requests.

- [`apps/chatbot-agent/public/embed.js#L14-L31`](../apps/chatbot-agent/public/embed.js#L14-L31) describes the guest fallback, request credentials, and explicit confirmation behavior.
- [`apps/chatbot-agent/public/embed.js#L65-L74`](../apps/chatbot-agent/public/embed.js#L65-L74) reads the public merchant and identity-bridge settings.
- [`apps/chatbot-agent/public/embed.js#L156-L176`](../apps/chatbot-agent/public/embed.js#L156-L176) defines widget-held authorization-code, verifier, merchant-token, and guest-session state.
- [`apps/chatbot-agent/public/embed.js#L522-L675`](../apps/chatbot-agent/public/embed.js#L522-L675) implements the popup PKCE flow, guest fallback, and handoff of the code/verifier to the backend.
- [`apps/chatbot-agent/public/embed.js#L465-L493`](../apps/chatbot-agent/public/embed.js#L465-L493) sends either the code pair or the cached merchant token and caches `ChatResponse.merchantToken`.

The silent callback posts its result with a wildcard target origin. The opener-side handler checks
the callback origin, source marker, and state before accepting the message.

- [`apps/chatbot-agent/public/silent-callback.html#L11-L38`](../apps/chatbot-agent/public/silent-callback.html#L11-L38) relays the authorization result with `postMessage(payload, '*')`.
- [`apps/chatbot-agent/public/embed.js#L636-L667`](../apps/chatbot-agent/public/embed.js#L636-L667) validates `event.origin`, the source marker, and the PKCE state before using the code.

### 2. Chatbot identity, context, catalog, and confirmation

The chatbot route accepts and forwards request-shaped data after a JSON parse cast to `ChatRequest`.
It validates the merchant ID format but does not runtime-validate the complete message or purchase
payload at this boundary.

- [`apps/chatbot-agent/src/app/api/chat/route.ts#L381-L412`](../apps/chatbot-agent/src/app/api/chat/route.ts#L381-L412) parses the body, casts it to `ChatRequest`, reads client-supplied messages/credentials/merchant ID/confirmation data, and creates a request ID.

The server-side identity path exchanges the widget's PKCE code for a merchant ID token, invokes
the merchant-token-login journey, bridges the resulting provider session to a provider access
token, and then exchanges the provider user token for a chatbot-agent token. A failure in the
normal chat path degrades to guest context; confirmation requires an agent token and user ID.

- [`apps/chatbot-agent/src/lib/merchant-bridge.ts#L38-L102`](../apps/chatbot-agent/src/lib/merchant-bridge.ts#L38-L102) exchanges the authorization code server-to-server for a merchant ID token.
- [`apps/chatbot-agent/src/lib/merchant-bridge.ts#L105-L171`](../apps/chatbot-agent/src/lib/merchant-bridge.ts#L105-L171) invokes the merchant-token-login journey with the merchant token and merchant ID.
- [`apps/chatbot-agent/src/lib/merchant-bridge.ts#L202-L305`](../apps/chatbot-agent/src/lib/merchant-bridge.ts#L202-L305) bridges the provider session into an OAuth access token.
- [`apps/chatbot-agent/src/lib/token-exchange.ts#L21-L64`](../apps/chatbot-agent/src/lib/token-exchange.ts#L21-L64) performs the RFC 8693 token exchange helper used for the agent token.
- [`apps/chatbot-agent/src/app/api/chat/route.ts#L414-L525`](../apps/chatbot-agent/src/app/api/chat/route.ts#L414-L525) runs the bridge, decodes the provider token subject, exchanges for the agent token, and fetches loyalty/wallet context from `payment-api`.

The context fetch serializes the subject and merchant values derived in the chatbot route into
query parameters for loyalty and wallet lookup. The payment API handlers then use those request
values rather than deriving ownership from the authenticated context. The system prompt is built
from products loaded from a local JSON file and from the fetched provider-side context.

- [`apps/chatbot-agent/src/app/api/chat/route.ts#L180-L219`](../apps/chatbot-agent/src/app/api/chat/route.ts#L180-L219) calls `/api/loyalty?userId=...&merchantId=...` and `/api/wallet?userId=...` on `payment-api`.
- [`apps/chatbot-agent/src/app/api/chat/route.ts#L648-L666`](../apps/chatbot-agent/src/app/api/chat/route.ts#L648-L666) reads `data/products.json` and `data/merchants.json` for the system prompt.
- [`apps/chatbot-agent/src/app/api/chat/route.ts#L221-L284`](../apps/chatbot-agent/src/app/api/chat/route.ts#L221-L284) puts catalog prices, loyalty values, and saved-card summaries into the model prompt.

The model may return a structured purchase proposal containing SKU, product name, unit price,
quantity, and currency. The route passes those proposal fields through to the widget. The
confirmation request then synthesizes a cart from that proposal and calls `payment-api` directly.

- [`apps/chatbot-agent/src/app/api/chat/route.ts#L287-L334`](../apps/chatbot-agent/src/app/api/chat/route.ts#L287-L334) defines the `propose_purchase` tool, including model-supplied price and currency fields.
- [`apps/chatbot-agent/src/app/api/chat/route.ts#L689-L718`](../apps/chatbot-agent/src/app/api/chat/route.ts#L689-L718) parses the tool arguments and returns the proposal fields.
- [`apps/chatbot-agent/src/app/api/chat/route.ts#L533-L605`](../apps/chatbot-agent/src/app/api/chat/route.ts#L533-L605) accepts `confirmedAt` and the incoming proposal, builds a synthetic cart, selects the first saved card, and posts directly to `/api/checkout` on `payment-api`.
- [`apps/chatbot-agent/src/app/api/chat/route.ts#L607-L645`](../apps/chatbot-agent/src/app/api/chat/route.ts#L607-L645) turns the payment API response into a chatbot message and returns the merchant token when one was exchanged.
- [`apps/chatbot-agent/public/embed.js#L759-L817`](../apps/chatbot-agent/public/embed.js#L759-L817) sends the client timestamp and proposal when the shopper clicks “Confirm & pay” and disables the button during that request.

### 3. Storefront catalog, browser cart, and web checkout

The storefront catalog is obtained through the payment provider API rather than a merchant
commerce endpoint. The payment API products route reads the provider repository's product JSON,
filters it by the requested merchant ID, and is public under the payment API middleware. This is
current POC behavior; it does not establish that provider-local product JSON is an acceptable
merchant system of record.

- [`apps/merchant-web/src/lib/catalog.ts#L5-L21`](../apps/merchant-web/src/lib/catalog.ts#L5-L21) calls `PAYMENT_API_BASE_URL/api/products?merchantId=...` and checks returned merchant IDs.
- [`apps/payment-api/src/app/api/products/route.ts#L1-L8`](../apps/payment-api/src/app/api/products/route.ts#L1-L8) documents the provider-local product route and its middleware status.
- [`apps/payment-api/src/app/api/products/route.ts#L16-L47`](../apps/payment-api/src/app/api/products/route.ts#L16-L47) reads `data/products.json`, validates the merchant record, and returns filtered products.
- [`apps/payment-api/src/middleware.ts#L39-L40`](../apps/payment-api/src/middleware.ts#L39-L40) includes `/api/products` in the public path prefixes.

The browser cart is merchant-keyed local storage containing product snapshots and quantities. The
cart provider validates only basic object shape, merchant ID, and positive integer quantity before
hydrating or writing the snapshot. It does not obtain or persist an authoritative merchant cart
handle, quote, version, or checkout session.

- [`apps/merchant-web/src/components/cart-provider.tsx#L3-L15`](../apps/merchant-web/src/components/cart-provider.tsx#L3-L15) identifies local storage as the cart persistence strategy and describes the cart as client-side state.
- [`apps/merchant-web/src/components/cart-provider.tsx#L39-L88`](../apps/merchant-web/src/components/cart-provider.tsx#L39-L88) reads and writes `acme-cart:<merchantId>` values containing product objects and quantities.
- [`packages/shared/src/types/cart.ts#L8-L30`](../packages/shared/src/types/cart.ts#L8-L30) defines cart items with captured `unitPrice`, a client-synthesized ID, and a merchant ID; it states that carts are not persisted by the scaffold.

The checkout form calculates its displayed total from the browser snapshots and sends a client-built
cart and selected card to the merchant-web proxy. The proxy derives `userId` from the server-side
session and adds a server-side consent source/timestamp, but forwards the submitted cart to the
payment API after only a merchant ID comparison.

- [`apps/merchant-web/src/app/checkout/checkout-form.tsx#L3-L19`](../apps/merchant-web/src/app/checkout/checkout-form.tsx#L3-L19) describes the local cart summary and payment API proxy behavior.
- [`apps/merchant-web/src/app/checkout/checkout-form.tsx#L68-L79`](../apps/merchant-web/src/app/checkout/checkout-form.tsx#L68-L79) computes the displayed total from product snapshots.
- [`apps/merchant-web/src/app/checkout/checkout-form.tsx#L156-L203`](../apps/merchant-web/src/app/checkout/checkout-form.tsx#L156-L203) builds and submits a cart containing client-held SKU, quantity, and unit price values.
- [`apps/merchant-web/src/app/api/checkout/route.ts#L25-L75`](../apps/merchant-web/src/app/api/checkout/route.ts#L25-L75) authenticates the session, derives `userId`, and checks only that the submitted cart's merchant matches the selected merchant configuration.
- [`apps/merchant-web/src/app/api/checkout/route.ts#L77-L117`](../apps/merchant-web/src/app/api/checkout/route.ts#L77-L117) obtains a payment token and forwards the submitted cart to `payment-api` with a proxy-generated consent timestamp.

### 4. Payment API checkout and provider-local persistence

The payment API checkout route requires a consent source and timestamp and checks basic user,
card, cart, merchant, item, quantity, SKU, and currency shape. It then reads the provider-local
product catalog, recomputes the amount from provider product prices, appends a provider-local
transaction, and returns a synthetic provider checkout session. This is a description of the
current POC path, not a target ownership decision. There is no merchant checkout session, merchant
order confirmation, merchant fulfillment response, or merchant webhook in this request path.

- [`apps/payment-api/src/app/api/checkout/route.ts#L1-L14`](../apps/payment-api/src/app/api/checkout/route.ts#L1-L14) describes the route as catalog-based transaction recording and loyalty accrual.
- [`apps/payment-api/src/app/api/checkout/route.ts#L44-L100`](../apps/payment-api/src/app/api/checkout/route.ts#L44-L100) validates body-provided consent, `userId`, `selectedCardId`, cart presence, cart items, and merchant ID.
- [`apps/payment-api/src/app/api/checkout/route.ts#L102-L149`](../apps/payment-api/src/app/api/checkout/route.ts#L102-L149) reads provider product JSON and derives the authoritative amount from that file.
- [`apps/payment-api/src/app/api/checkout/route.ts#L151-L196`](../apps/payment-api/src/app/api/checkout/route.ts#L151-L196) reads provider merchant/transaction JSON and appends a captured transaction.
- [`apps/payment-api/src/app/api/checkout/route.ts#L204-L246`](../apps/payment-api/src/app/api/checkout/route.ts#L204-L246) updates provider-local loyalty JSON as a best-effort side effect after the transaction write.
- [`apps/payment-api/src/app/api/checkout/route.ts#L248-L264`](../apps/payment-api/src/app/api/checkout/route.ts#L248-L264) returns a provider-synthetic `CheckoutSession` with status `captured`.
- [`packages/shared/src/types/checkout.ts#L1-L35`](../packages/shared/src/types/checkout.ts#L1-L35) defines that synthetic checkout session, including a provider-side cart snapshot, selected card ID, amount, and status.

The supporting loyalty and wallet routes also read provider-local JSON and accept user/merchant
identifiers from query parameters or request bodies. The wallet route prevents a full PAN field
from being written, but it is still a provider-local wallet record path.

- [`apps/payment-api/src/app/api/loyalty/route.ts#L19-L45`](../apps/payment-api/src/app/api/loyalty/route.ts#L19-L45) filters loyalty records using the request's `userId` and `merchantId` query values.
- [`apps/payment-api/src/app/api/loyalty/route.ts#L47-L121`](../apps/payment-api/src/app/api/loyalty/route.ts#L47-L121) accepts body identifiers and writes the provider-local loyalty file.
- [`apps/payment-api/src/app/api/wallet/route.ts#L17-L31`](../apps/payment-api/src/app/api/wallet/route.ts#L17-L31) filters wallet cards using the request's `userId` query value.
- [`apps/payment-api/src/app/api/wallet/route.ts#L34-L73`](../apps/payment-api/src/app/api/wallet/route.ts#L34-L73) rejects `pan` but writes the submitted wallet-card object to provider-local JSON.

### 5. Authentication and authorization assumptions

The payment API middleware authenticates requests by requiring a Bearer token and checking the
result of token introspection. It compares the introspected issuer with the configured issuer.
The source comments explicitly state that scope and subject enforcement are deferred. The
middleware does not show checks for audience/resource, required scope, agent identity, merchant
binding, effective subject, or object ownership.

- [`apps/payment-api/src/middleware.ts#L1-L20`](../apps/payment-api/src/middleware.ts#L1-L20) documents introspection and the deferred scope/subject checks.
- [`apps/payment-api/src/middleware.ts#L73-L114`](../apps/payment-api/src/middleware.ts#L73-L114) implements Bearer extraction, active-token and issuer checks, and pass-through after those checks.
- [`docs/identity.md#L50-L60`](../docs/identity.md#L50-L60) describes the current API validation as active-token/issuer validation and states that invalid or missing tokens receive `401`.

Several handlers accept identity or merchant resource selectors from URL parameters or request
bodies instead of deriving all resource ownership from an authorization context. The merchant-web
proxy does derive the shopper ID from its server session, but the downstream payment API checkout
route accepts the forwarded `userId` and cart fields as body data.

- [`apps/payment-api/src/app/api/loyalty/route.ts#L19-L44`](../apps/payment-api/src/app/api/loyalty/route.ts#L19-L44) accepts lookup identity and merchant selectors from query parameters.
- [`apps/payment-api/src/app/api/wallet/route.ts#L17-L31`](../apps/payment-api/src/app/api/wallet/route.ts#L17-L31) accepts the wallet lookup user selector from a query parameter.
- [`apps/payment-api/src/app/api/checkout/route.ts#L44-L100`](../apps/payment-api/src/app/api/checkout/route.ts#L44-L100) reads `userId`, selected card, and cart from the request body after only basic shape checks.
- [`apps/merchant-web/src/app/api/checkout/route.ts#L36-L40`](../apps/merchant-web/src/app/api/checkout/route.ts#L36-L40) is a narrower proxy-side control that derives the user ID from the authenticated merchant-web session.

The current identity documentation records a useful separation between merchant identity and
payment-provider identity, including the provider-side AI-agent exchange. It describes an
identity-binding foundation, not a reusable merchant commerce authorization contract.

- [`docs/identity.md#L3-L21`](../docs/identity.md#L3-L21) distinguishes the merchant IDP, payment provider IDP, applications, and chatbot bridge.
- [`docs/identity.md#L64-L114`](../docs/identity.md#L64-L114) documents the two-step merchant-token bridge and provider AI-agent token exchange.
- [`docs/identity.md#L159-L169`](../docs/identity.md#L159-L169) records that AI Agents are payment-provider-side identities and describes the current agent configuration.
- [`docs/architecture.md#L57-L113`](../docs/architecture.md#L57-L113) documents the current token flow from merchant browser login through the chatbot bridge to payment API calls.

### 6. Persistence, concurrency, and operational evidence

The shared JSON store is intentionally an unchecked JSON reader/writer. It has no runtime schema
validation, locking, atomic read-modify-write guard, or transaction boundary. The checkout route
reads transaction and loyalty arrays and writes updated arrays, so its sequential IDs and writes
are not evidence of duplicate-operation protection or durable reconciliation.

- [`packages/shared/src/data/json-store.ts#L1-L27`](../packages/shared/src/data/json-store.ts#L1-L27) explicitly describes the helper as having no locking, concurrency guards, or schema validation.
- [`apps/payment-api/src/app/api/checkout/route.ts#L165-L246`](../apps/payment-api/src/app/api/checkout/route.ts#L165-L246) performs read/append/write transaction handling and a separate best-effort loyalty read/modify/write.
- [`apps/payment-api/src/app/api/checkout/route.ts#L30-L41`](../apps/payment-api/src/app/api/checkout/route.ts#L30-L41) derives transaction/session IDs from existing records and timestamps rather than an idempotency record.

Token trace storage is local-disk based and the trace API does not authenticate the operator or
bind access to an authenticated user in the reviewed route. The trace store does use a temporary
file and rename for individual fragments, but that is not an operation-level monetary state
machine or reconciliation mechanism.

- [`apps/merchant-web/src/app/api/token-trace/route.ts#L1-L47`](../apps/merchant-web/src/app/api/token-trace/route.ts#L1-L47) exposes GET/POST/DELETE trace operations based on a caller-provided `traceSessionId` without an authentication check in the route.
- [`apps/merchant-web/src/lib/token-trace-store.ts#L1-L85`](../apps/merchant-web/src/lib/token-trace-store.ts#L1-L85) stores trace fragments below a local filesystem directory and merges them from local files.

### 7. Merchant onboarding and integration metadata

The maintained merchant runtime and onboarding files establish a reusable presentation/runtime
pattern and collect identity/deployment metadata. The reviewed onboarding documentation lists
issuer, client, callback, trusted issuer, group, and chatbot privilege inputs; it does not contain
a commerce adapter credential, capability, webhook, quote/cart version, or merchant order
integration manifest.

- [`docs/merchant-onboarding.md#L1-L21`](../docs/merchant-onboarding.md#L1-L21) establishes one shared runtime with merchant-specific external definitions and keeps secrets out of configuration files.
- [`docs/merchant-onboarding.md#L80-L104`](../docs/merchant-onboarding.md#L80-L104) covers catalog seed ownership, identity-provider setup, payment-provider organization/trusted-issuer values, group, and chatbot privilege configuration.
- [`docs/merchant-onboarding.md#L106-L124`](../docs/merchant-onboarding.md#L106-L124) describes deployment, guest/chat validation, merchant scope checks, consent, and payment-admin validation, but no commerce adapter lifecycle or webhook manifest.
- [`apps/merchant-web/src/lib/merchant-config.ts#L13-L31`](../apps/merchant-web/src/lib/merchant-config.ts#L13-L31) defines registry/definition fields for presentation, catalog merchant ID, and onboarding status.
- [`apps/merchant-web/src/lib/merchant-config.ts#L63-L101`](../apps/merchant-web/src/lib/merchant-config.ts#L63-L101) validates the local merchant definition and identity onboarding fields.

### 8. Existing architecture documentation and absent interoperability boundary

The existing architecture document accurately describes the POC's merchant-web, chatbot-agent,
payment-api, seed-data, and identity topology. It assigns the provider wallet, checkout, and
transaction ledger to the payment provider and the account/loyalty/catalog to the merchant in the
current demo description, while also documenting that the provider services read and write local
seed data.

- [`docs/architecture.md#L3-L12`](../docs/architecture.md#L3-L12) describes the current runtime ownership and the merchant/provider split.
- [`docs/architecture.md#L15-L53`](../docs/architecture.md#L15-L53) lists applications, ports, and current application roles.
- [`docs/architecture.md#L117-L137`](../docs/architecture.md#L117-L137) lists the shared types and provider-local seed files.

A repository review of the exercised paths found no platform-neutral commerce adapter interface,
connector boundary, merchant cart/checkout/order API, or merchant-facing MCP/tool contract. The
current direct paths above, together with the scaffold-only shared [`Cart`](../packages/shared/src/types/cart.ts#L1-L30)
and [`CheckoutSession`](../packages/shared/src/types/checkout.ts#L1-L35) types, are the evidence for
this absence. The search included runtime source and documentation; the only MCP references found
were Frodo provisioning notes, not a merchant-commerce contract. This is an absence finding from
repository inspection, not a claim that a future contract has been designed or that any vendor API
is supported.

## Gap register

The following register separates observed authentication from authorization, browser/conversation
state from merchant-authoritative state, and current implementation from absent controls.

| ID   | Current-state gap                                                                                                                                                                                                                                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                     | Boundary affected                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| G-01 | The chatbot's catalog prompt is sourced from provider-local `data/products.json`; the storefront catalog also calls the provider product route. No merchant catalog/availability/quote path is exercised.                                                                                      | [`chat route#L648-L666`](../apps/chatbot-agent/src/app/api/chat/route.ts#L648-L666); [`catalog.ts#L5-L21`](../apps/merchant-web/src/lib/catalog.ts#L5-L21); [`products route#L16-L47`](../apps/payment-api/src/app/api/products/route.ts#L16-L47)                                                                                                                                                                            | Commerce source of truth                |
| G-02 | No platform-neutral commerce adapter, connector, normalized commerce contract, or merchant-facing MCP contract is present in the inspected runtime.                                                                                                                                            | [`chat route#L533-L605`](../apps/chatbot-agent/src/app/api/chat/route.ts#L533-L605); [`checkout route#L102-L196`](../apps/payment-api/src/app/api/checkout/route.ts#L102-L196); [`Cart`](../packages/shared/src/types/cart.ts#L1-L30); [`CheckoutSession`](../packages/shared/src/types/checkout.ts#L1-L35)                                                                                                                  | Interoperability boundary               |
| G-03 | Browser/local conversation state contains product snapshots, captured prices, quantities, and synthetic cart IDs. It is not connected to an authoritative merchant cart, version, quote, or checkout session.                                                                                  | [`cart-provider.tsx#L39-L88`](../apps/merchant-web/src/components/cart-provider.tsx#L39-L88); [`cart.ts#L8-L30`](../packages/shared/src/types/cart.ts#L8-L30); [`checkout-form.tsx#L156-L183`](../apps/merchant-web/src/app/checkout/checkout-form.tsx#L156-L183)                                                                                                                                                            | Cart authority and synchronization      |
| G-04 | Chat confirmation creates a cart directly from a model proposal and calls the payment API; payment checkout uses provider product JSON and returns a provider-synthetic session rather than a merchant checkout/order result.                                                                  | [`chat route#L533-L645`](../apps/chatbot-agent/src/app/api/chat/route.ts#L533-L645); [`payment checkout#L102-L196`](../apps/payment-api/src/app/api/checkout/route.ts#L102-L196); [`checkout.ts#L14-L35`](../packages/shared/src/types/checkout.ts#L14-L35)                                                                                                                                                                  | Checkout, payment, and order authority  |
| G-05 | Consent currently requires only body presence of `source` and `confirmedAt` at the payment route. The chatbot forwards a client-provided timestamp and proposal; no cart/quote version, exact server-bound amount, nonce, expiry, or operation idempotency record is represented in this path. | [`chat route#L533-L605`](../apps/chatbot-agent/src/app/api/chat/route.ts#L533-L605); [`payment checkout#L55-L100`](../apps/payment-api/src/app/api/checkout/route.ts#L55-L100); [`embed.js#L759-L817`](../apps/chatbot-agent/public/embed.js#L759-L817)                                                                                                                                                                      | Consent and payment authorization       |
| G-06 | Bearer authentication checks token activity and issuer, but current middleware comments and implementation do not enforce scope, subject, audience/resource, agent, merchant, effective-subject, or object ownership.                                                                          | [`middleware.ts#L1-L20`](../apps/payment-api/src/middleware.ts#L1-L20); [`middleware.ts#L73-L114`](../apps/payment-api/src/middleware.ts#L73-L114)                                                                                                                                                                                                                                                                           | Authorization and tenant isolation      |
| G-07 | Several payment API handlers use caller-supplied `userId`/`merchantId` selectors; checkout accepts body `userId`, card, and cart after basic shape checks. The merchant-web proxy has a narrower server-session user binding, but that does not establish downstream object authorization.     | [`loyalty route#L19-L44`](../apps/payment-api/src/app/api/loyalty/route.ts#L19-L44); [`wallet route#L17-L31`](../apps/payment-api/src/app/api/wallet/route.ts#L17-L31); [`payment checkout#L67-L100`](../apps/payment-api/src/app/api/checkout/route.ts#L67-L100); [`merchant proxy#L36-L75`](../apps/merchant-web/src/app/api/checkout/route.ts#L36-L75)                                                                    | Identity-to-resource binding            |
| G-08 | The identity bridge is server-side after code submission, but the backend returns a merchant ID token to the widget and the widget retains it in runtime state. The callback uses wildcard `postMessage` targeting and relies on opener validation.                                            | [`merchant-bridge.ts#L51-L102`](../apps/chatbot-agent/src/lib/merchant-bridge.ts#L51-L102); [`route.ts#L421-L448`](../apps/chatbot-agent/src/app/api/chat/route.ts#L421-L448); [`embed.js#L156-L165`](../apps/chatbot-agent/public/embed.js#L156-L165); [`embed.js#L487-L493`](../apps/chatbot-agent/public/embed.js#L487-L493); [`silent-callback.html#L23-L38`](../apps/chatbot-agent/public/silent-callback.html#L23-L38) | Token confidentiality and browser trust |
| G-09 | Cross-origin chatbot responses and the embed asset currently allow wildcard origins in Next configuration. The opener checks the callback origin and state, but the checked-in server CORS policy is not merchant-origin-specific.                                                             | [`apps/chatbot-agent/next.config.mjs#L7-L19`](../apps/chatbot-agent/next.config.mjs#L7-L19); [`apps/chatbot-agent/next.config.mjs#L26-L45`](../apps/chatbot-agent/next.config.mjs#L26-L45); [`embed.js#L636-L640`](../apps/chatbot-agent/public/embed.js#L636-L640)                                                                                                                                                          | Origin and browser safety               |
| G-10 | JSON persistence has no locking, atomic operation state, schema validation, or idempotency/concurrency guard. Transaction and loyalty writes are separate and loyalty is explicitly best-effort.                                                                                               | [`json-store.ts#L1-L27`](../packages/shared/src/data/json-store.ts#L1-L27); [`payment checkout#L165-L246`](../apps/payment-api/src/app/api/checkout/route.ts#L165-L246)                                                                                                                                                                                                                                                      | Duplicate effects and recovery          |
| G-11 | Local token traces are stored on disk and the trace API exposes session-keyed operations without an authentication check in the reviewed route.                                                                                                                                                | [`token-trace/route.ts#L1-L47`](../apps/merchant-web/src/app/api/token-trace/route.ts#L1-L47); [`token-trace-store.ts#L1-L85`](../apps/merchant-web/src/lib/token-trace-store.ts#L1-L85)                                                                                                                                                                                                                                     | Observability access and retention      |
| G-12 | Merchant configuration/onboarding represents identity and presentation metadata, but no adapter credentials, commerce capabilities, webhook verification metadata, or merchant commerce endpoint manifest is represented in the reviewed files.                                                | [`docs/merchant-onboarding.md#L84-L104`](../docs/merchant-onboarding.md#L84-L104); [`merchant-config.ts#L20-L31`](../apps/merchant-web/src/lib/merchant-config.ts#L20-L31); [`northwind/onboarding.json#L1-L9`](../config/merchants/northwind/onboarding.json#L1-L9)                                                                                                                                                         | Merchant integration lifecycle          |

## Distinguishing what is implemented from what is absent

The following distinctions are important for subsequent design work:

- **Authentication is not authorization.** The current middleware performs Bearer-token
  introspection, active-token checking, and issuer comparison. That is evidence of an
  authentication gate, not evidence of scope, audience, agent, merchant, subject, or resource
  authorization ([`middleware.ts#L73-L114`](../apps/payment-api/src/middleware.ts#L73-L114)).
- **Browser/conversation state is not merchant state.** `localStorage`, the model proposal, and
  the shared cart snapshot carry identifiers, quantities, and captured display values. They are not
  evidence of a merchant cart, quote, checkout session, inventory reservation, or order
  ([`cart-provider.tsx#L39-L88`](../apps/merchant-web/src/components/cart-provider.tsx#L39-L88),
  [`route.ts#L689-L718`](../apps/chatbot-agent/src/app/api/chat/route.ts#L689-L718)).
- **A provider checkout record is not a merchant order.** The current checkout response is a
  provider-defined `CheckoutSession`, and the transaction is appended to provider-local JSON. No
  merchant order ID or merchant checkout response is produced in the inspected route
  ([`checkout.ts#L14-L35`](../packages/shared/src/types/checkout.ts#L14-L35),
  [`payment checkout#L178-L196`](../apps/payment-api/src/app/api/checkout/route.ts#L178-L196)).
- **Human interface confirmation is not server-bound payment consent.** The widget disables the
  button during a request, but the request carries a client timestamp and proposal; the API only
  checks that consent fields are present ([`embed.js#L769-L817`](../apps/chatbot-agent/public/embed.js#L769-L817),
  [`payment checkout#L55-L65`](../apps/payment-api/src/app/api/checkout/route.ts#L55-L65)).
- **An identity-binding foundation is not a commerce integration contract.** The existing bridge
  can bind a merchant IDP subject to a payment-provider user and agent token, but it does not
  define merchant catalog/cart/checkout/order/event operations ([`docs/identity.md#L64-L114`](../docs/identity.md#L64-L114),
  [`route.ts#L414-L525`](../apps/chatbot-agent/src/app/api/chat/route.ts#L414-L525)).

## Explicit non-findings and scope guard

This task does not claim that any future adapter, connector, merchant-native checkout, durable
operation store, stricter authorization policy, webhook processor, or production payment/order
state machine exists. It makes no vendor capability claim for Shopify, SAP Commerce, Oracle
Commerce, or another merchant platform. It also does not alter runtime code, AIC configuration,
seed data, merchant configuration, identity-provider state, or external resources.

The evidence baseline is complete for the Task 1 scope. Later tasks may use this gap register as
the current-state input when defining a target topology, canonical adapter contract, connector
strategy, security controls, reliability model, and Phase 1 acceptance evidence.
