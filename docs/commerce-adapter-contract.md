# Merchant Commerce Adapter Contract

**Status:** Task 3 contract definition (normative core, with explicitly marked beta profiles)

**Scope:** Platform-neutral server-to-server contract between the payment provider's commerce
orchestration layer and a merchant connector. This document defines the contract shape and the
minimum merchant integration surface; it does not implement an adapter, connector, payment
processor, webhook endpoint, or live resource.

The contract is deliberately not a universal catalog or order database. The merchant remains the
system of record for merchant commerce data. The provider owns the reusable chatbot, server-side
orchestration, identity/trust and agent authorization, payment orchestration, consent, adapter
framework, and operational controls. A provider record may retain only the short-lived references,
versions, consent evidence, idempotency results, and audit/correlation metadata needed to execute
and reconcile an operation.

## 1. Normative language and profile status

The terms **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be
interpreted as normative requirements. A connector claiming `merchant-commerce-adapter/v1`
conformance MUST implement the normative core in this document or explicitly return the defined
capability/error response for an unsupported optional capability.

This document distinguishes three things that must not be conflated:

1. **Normative core:** The versioned field vocabulary, authority rules, operation semantics,
   HTTP behavior, error model, metadata, and event envelope below.
2. **Normative external standards:** Standards incorporated by reference for the relevant protocol
   behavior. A standard does not make a vendor API or a connector capability mandatory.
3. **Beta/vendor profiles:** Connector-specific mappings and extensions. A profile is not part of
   the platform-neutral product contract and must not make vendor payloads required for generic
   agent behavior.

### 1.1 Standards profile

| Area                                      | Contract rule                                                                                                                                                                                                                                            | Status                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| HTTP requests and responses               | Use HTTP semantics, status codes, headers, content negotiation, conditional requests, and `Retry-After` as defined by HTTP Semantics ([RFC 9110](https://www.rfc-editor.org/rfc/rfc9110)).                                                               | Normative core                                                               |
| Structured failures                       | Use `application/problem+json` and the Problem Details members defined by [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html), with the stable error extensions in this document.                                                                    | Normative core                                                               |
| API description                           | Publish an OpenAPI 3.1.1 description. OpenAPI 3.1 uses JSON Schema semantics for schemas; the contract schemas use JSON Schema 2020-12-compatible constructs.                                                                                            | Normative core                                                               |
| Data schemas                              | Validate requests and responses against the published JSON Schemas. Unknown `x-` extension members may be ignored; unknown required core members are a contract-version error.                                                                           | Normative core                                                               |
| Event envelope                            | Use CloudEvents v1.0.2. The specification requires only `specversion`, `id`, `source`, and `type`; this contract additionally requires `subject`, `time`, `datacontenttype`, `merchantid`, `contractversion`, and `data` for normalized merchant events. | Normative core                                                               |
| Webhook authentication                    | Verify the merchant's configured native signature, or use an approved HTTP Message Signature profile ([RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html)) when native signing is unavailable.                                                       | Normative core                                                               |
| OAuth/mTLS credentials                    | Use an approved server-to-server OAuth profile or mTLS profile. OAuth scopes, resource/audience restriction, token exchange, and sender-constrained artifacts are deployment security profiles and are not replaced by this commerce schema.             | Normative integration requirement; deployment profile selected at onboarding |
| Async event documentation                 | AsyncAPI MAY describe deployment channels in addition to CloudEvents. It does not replace the CloudEvents envelope or the delivery rules here.                                                                                                           | Optional                                                                     |
| Shopify-, SAP-, and Oracle-style mappings | These may be published as `*.beta` connector profiles. They are examples of adapter translation, not certification, support claims, or normative vendor API shapes.                                                                                      | Beta/vendor profile                                                          |

The normative core uses OpenAPI/JSON Schema/CloudEvents as protocol and schema standards. It does
not claim that a merchant platform implements any particular route, field, checkout mode, payment
sequence, event guarantee, or API version. The connector is responsible for translating its native
system into this contract.

## 2. Authority and trust boundary

The adapter is a server-side boundary. The widget, model, browser local storage, and merchant page
MUST NOT call a merchant connector or payment endpoint directly.

| Data or decision                                              | Authority                                               | Contract treatment                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product/variant identity                                      | Merchant                                                | Connector returns opaque merchant references. The provider may carry references but cannot invent or reassign them.                                  |
| Quantity and selected options                                 | Shopper intent, then merchant validation                | Requests may propose quantity/options. The merchant resolves availability, valid options, and accepted quantity before checkout.                     |
| Product name and description                                  | Merchant                                                | Adapter-resolved display values; model text is never authoritative.                                                                                  |
| Price, currency, discount, tax, shipping, delivery, and total | Merchant quote/checkout                                 | Returned values are authoritative only for the returned `version` and `expiresAt`; client/model values are never accepted as authority.              |
| Customer and loyalty context                                  | Merchant, subject to the merchant authorization grant   | Adapter returns only the minimum fields allowed by capability and policy. Email is not a cross-merchant identity key.                                |
| Cart and checkout state                                       | Merchant                                                | Provider may retain short-lived opaque handles, versions, and display projections only.                                                              |
| Payment authorization/capture                                 | Payment provider and approved merchant payment boundary | The adapter receives a server-bound payment reference or merchant-native payment result, never PAN, CVV, raw payment token, or provider secret.      |
| Order and fulfillment                                         | Merchant                                                | Provider reports success only from an authoritative merchant response or verified event.                                                             |
| Consent and agent authorization                               | Provider                                                | Consent is recorded server-side and bound to the exact merchant quote/cart/checkout version, subject, amount/currency, expiry, nonce, and operation. |

### 2.1 Prohibition on client-authoritative commercial values

The following fields MUST NOT be accepted as authority in any client, widget, model, or merchant-host
request: `unitPrice`, `discount`, `tax`, `shipping`, `delivery`, `subtotal`, `total`,
`availability`, `inventory`, `orderStatus`, `paymentStatus`, or `loyaltyBalance`. The contract
schemas omit these fields from proposal and mutation requests. If a caller sends them, the adapter
MUST reject the request with `client_authoritative_value` rather than silently ignoring an attempted
value override.

A request may include a requested `currency` or locale preference for discovery and quoting. It may
include product/variant references, quantities, selected option references, merchant cart handles,
and a shipping/customer context reference. These are intent or lookup inputs and MUST be revalidated
by the adapter. Response money and status values are merchant-resolved values and carry an explicit
source version and expiry where applicable.

## 3. Versioning, content negotiation, and common metadata

### 3.1 Contract version

The first stable contract is named `merchant-commerce-adapter/v1`.

- Requests MUST send `Accept: application/vnd.merchant-commerce.v1+json` and, when they carry JSON,
  `Content-Type: application/vnd.merchant-commerce.v1+json`.
- The provider and adapter MUST publish the same major contract version in
  `X-Merchant-Commerce-Contract-Version` or the response `meta.contractVersion`.
- Additive optional fields and new capability names are backward-compatible within major version 1.
  A changed meaning, removed field, incompatible enum, or changed authority rule requires a new major
  version and a new vendor media type.
- A connector that cannot serve the requested major version MUST return
  `contract_version_unsupported` with supported versions; it MUST NOT guess a schema.
- Profile and connector versions are separate from the core contract version. For example,
  `merchant-commerce-adapter/v1` with `profile: shopify-style.beta` does not imply a Shopify API
  version or production support.

The machine-readable contract artifacts are normative and versioned with this document:

- [`commerce-adapter-openapi.json`](./commerce-adapter-openapi.json) is the complete OpenAPI 3.1.1
  description. It declares every canonical operation ID, logical route, HTTP method, required
  metadata header, request body, success/accepted response, error response, capability requirement,
  security scheme, and local schema reference. A deployment MAY substitute its origin for the
  relative `/v1` server URL, but MUST preserve the operation IDs, schemas, and semantics.
- [`commerce-adapter-schemas.json`](./commerce-adapter-schemas.json) is the complete JSON Schema
  2020-12 vocabulary. It defines the common metadata, capability document, request models, typed
  operation response envelopes, RFC 9457 Problem Details extensions, CloudEvent, and webhook
  acknowledgment. The OpenAPI file references these definitions directly; there is no unresolved
  remote schema dependency or unresolved placeholder reference.

These two files are the implementation handoff: a connector team can validate payloads and generate
client/server scaffolding from them without reconstructing schemas from prose. This Markdown file
remains normative for authority, lifecycle, retry, security, and conformance semantics that JSON
Schema and OpenAPI cannot express. If prose and a machine-readable artifact disagree, the contract
version must be corrected before implementation; an implementation MUST NOT silently choose one.

The OpenAPI document uses the relative deployment server `/v1` rather than a fictional host. A
merchant/provider deployment MUST publish the same files at a versioned registry or package location
and resolve the adjacent JSON Schema reference before serving the contract to tooling.

### 3.2 HTTP request metadata

Every request MUST include the following metadata, either in the standard header or the equivalent
server-side request context. A provider-to-connector call MUST NOT allow a browser to choose a
merchant context or effective subject.

| Metadata         | HTTP representation                                            | Requirement and meaning                                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contract version | `Accept` and `Content-Type`                                    | Required for version negotiation.                                                                                                                                                                                                                                                          |
| Merchant scope   | `X-Merchant-Id` or authenticated tenant context                | Required on every request. It MUST match the authenticated connector registration; a body value cannot widen scope.                                                                                                                                                                        |
| Correlation ID   | `X-Correlation-Id`                                             | Required on every request and response. One logical shopper operation carries the same value through BFF, adapter, merchant, payment, and event records.                                                                                                                                   |
| Idempotency key  | `Idempotency-Key`                                              | Required on state-changing HTTP operations; not used for webhook event deduplication. The key is scoped to merchant, operation family, and authenticated integration.                                                                                                                      |
| Expected version | `If-Match` and/or request `expectedVersion`                    | Required when mutating an existing cart, checkout, or order if the merchant exposes a version/ETag. Omission is allowed only when the capability says optimistic concurrency is unavailable and the operation is safe under the merchant's native semantics.                               |
| Subject context  | Authenticated server-side context and minimal `subject` object | Required for customer, loyalty, cart, checkout, payment, and order operations. Guest catalog reads may omit it. The subject is derived from provider authorization and merchant correlation, never from an arbitrary client `userId`.                                                      |
| Agent context    | Authenticated server-side context and `agentId`                | Required for provider-mediated actions. It identifies the approved payment-provider agent and policy context; it is not a merchant customer identity.                                                                                                                                      |
| Deadline         | Server-side request deadline                                   | Required for bounded execution. An adapter MUST stop work at the deadline and return a known or ambiguous outcome; it MUST NOT hold an HTTP request indefinitely. A deployment MAY pass an internal deadline header, but the header is not a substitute for authenticated operation state. |
| Trace context    | `traceparent`/`tracestate` when tracing is enabled             | Recommended for distributed tracing. Trace values and all response payloads remain subject to redaction.                                                                                                                                                                                   |

The adapter response envelope MUST echo `merchantId`, `correlationId`, `contractVersion`, and a
server-generated `operationId`. It MAY include an `idempotencyKey` echo, but logs and client-facing
responses MUST NOT expose credentials or raw upstream requests.

### 3.3 JSON Schema core models

The complete JSON Schema definitions live in `commerce-adapter-schemas.json`. The following named
schemas are the minimum shared vocabulary and are referenced by every operation in the OpenAPI
document:

- `ResourceRef`, `Currency`, `Money`, and `LineIntent` define opaque merchant references, ISO
  currency, integer minor-unit money, and client intent. `Money` is never accepted as an authority
  in a mutation request.
- `SubjectContext` carries server-derived provider subject and agent context. The browser cannot
  choose an effective subject, merchant, or agent.
- `ResponseMeta`, `Status`, and the operation-specific `*Response` definitions enforce merchant,
  correlation, operation, contract-version, observation, status, and typed data fields.
- `ResolvedLine`, `CartData`, `QuoteData`, `CheckoutData`, `PaymentData`, `OrderData`, and
  `FulfillmentData` contain merchant-resolved values and versions/expiry where applicable.
- `Problem` defines the RFC 9457 members plus stable `code`, `category`, `retryable`, correlation,
  operation, version, and redacted detail extensions.
- `CapabilityDocument` defines the complete capability vocabulary and requires an entry for every
  canonical capability, including explicitly unsupported entries.
- `CloudEvent` and `WebhookAck` define the normalized event input and safe duplicate acknowledgment.

Adapter responses carry two distinct status layers. The envelope `status` (schema `Status`) is the
generic operation outcome — one of `succeeded`, `accepted`, `running`, `requires_action`, `pending`,
`unknown`, `failed`, or `cancelled` — and describes whether and how the operation completed, not the
merchant lifecycle. The domain state of the affected commerce resource is carried machine-readably in
the typed `data` payload: `CheckoutData.status`, `PaymentData.status`, `OrderData.status`,
`CartData.status`, and `FulfillmentData.status` each carry their own enum. Provider logic MUST branch
on the envelope `status` for operation control flow (retry, reconciliation, deadline handling) and on
the domain `data.*.status` for payment and order lifecycle decisions. Provider logic MUST NOT infer
payment or order lifecycle from the envelope `status` alone.

The schemas set `additionalProperties: false` on core objects. Optional connector data is permitted
only through `x-` namespaced extension maps. A connector MUST validate both request and response
instances against the selected version before invoking or returning a native platform payload.

`Money` is an amount representation, not permission to charge. A money value is authoritative only
when it appears in a merchant quote, checkout, or other adapter response with a matching version and
validity interval. A request MUST NOT use `Money` to override a merchant-resolved amount. The
prohibition on client-authoritative price, tax, inventory, status, and total fields is therefore
represented both by the request schemas (those properties are absent) and by the runtime validation
rule in Section 2.1.

## 4. Capability discovery and integration metadata

A connector MUST expose `GET /v1/capabilities` before the provider enables an operation. Capability
discovery is merchant-scoped and authenticated; it is not a prompt or model-tool discovery surface.
The provider MUST cache it only with an explicit `expiresAt` and MUST refresh it after a connector
configuration change or capability error.

### 4.1 Capability document

`GET /v1/capabilities` returns the `CapabilityDocument` schema. Its `capabilities` object MUST
contain an explicit entry for every canonical capability below; an entry with `status: unsupported`
is still a contract-complete declaration and MUST produce `501 capability_not_supported` when
called. This prevents a connector from silently omitting a required operation:

```text
capability.discovery       catalog.search          catalog.product
catalog.availability       commerce.quote          customer.lookup
loyalty.lookup             cart.create             cart.read
cart.update                cart.validate           cart.reconcile
cart.expire                checkout.create         checkout.redirect
checkout.read              checkout.cancel         payment.authorize
payment.capture            order.create            order.confirm
order.read                 order.cancel            fulfillment.status
operation.status           events.webhook
```

A conforming capability document is represented by the following complete JSON shape (the full
schema, including property constraints, is in `commerce-adapter-schemas.json`):

```json
{
  "meta": {
    "merchantId": "merchant-opaque-id",
    "correlationId": "corr-opaque-id",
    "operationId": "op-opaque-id",
    "contractVersion": "merchant-commerce-adapter/v1",
    "adapterProfile": "generic.v1",
    "observedAt": "2026-08-28T12:00:00Z",
    "expiresAt": "2026-08-28T12:15:00Z"
  },
  "adapter": {
    "adapterId": "connector-opaque-id",
    "displayName": "Merchant connector",
    "profile": "generic.v1",
    "profileStatus": "stable",
    "connectorVersion": "1.4.0"
  },
  "capabilities": {
    "capability.discovery": { "status": "supported", "mode": "sync" },
    "catalog.search": { "status": "supported", "mode": "sync" },
    "catalog.product": { "status": "supported", "mode": "sync" },
    "catalog.availability": { "status": "supported", "mode": "sync" },
    "commerce.quote": { "status": "supported", "mode": "sync", "maxTtlSeconds": 300 },
    "customer.lookup": { "status": "supported", "mode": "sync", "requiresSubject": true },
    "loyalty.lookup": {
      "status": "limited",
      "mode": "sync",
      "scopes": ["loyalty.read"],
      "requiresSubject": true
    },
    "cart.create": { "status": "supported", "mode": "sync", "optimisticConcurrency": true },
    "cart.read": { "status": "supported", "mode": "sync", "optimisticConcurrency": true },
    "cart.update": { "status": "supported", "mode": "sync", "optimisticConcurrency": true },
    "cart.validate": { "status": "supported", "mode": "sync", "optimisticConcurrency": true },
    "cart.reconcile": { "status": "supported", "mode": "sync", "optimisticConcurrency": true },
    "cart.expire": { "status": "supported", "mode": "sync", "optimisticConcurrency": true },
    "checkout.create": { "status": "supported", "mode": "sync", "singleUse": true },
    "checkout.redirect": { "status": "supported", "mode": "sync", "singleUse": true },
    "checkout.read": { "status": "supported", "mode": "sync" },
    "checkout.cancel": { "status": "supported", "mode": "sync" },
    "payment.authorize": { "status": "supported", "mode": "async", "requiresSubject": true },
    "payment.capture": { "status": "supported", "mode": "async", "requiresSubject": true },
    "order.create": { "status": "supported", "mode": "sync", "requiresSubject": true },
    "order.confirm": { "status": "supported", "mode": "sync", "requiresSubject": true },
    "order.read": { "status": "supported", "mode": "sync", "requiresSubject": true },
    "order.cancel": { "status": "limited", "mode": "async", "requiresSubject": true },
    "fulfillment.status": { "status": "supported", "mode": "async", "requiresSubject": true },
    "operation.status": { "status": "supported", "mode": "sync", "requiresSubject": true },
    "events.webhook": { "status": "supported", "mode": "async" }
  },
  "limits": {
    "maxPageSize": 100,
    "maxRequestBytes": 1048576,
    "defaultTimeoutMs": 5000,
    "maxTimeoutMs": 30000
  },
  "supportedLocales": ["en-US"],
  "supportedCurrencies": ["USD"],
  "webhook": {
    "eventTypes": [
      "com.merchant.commerce.order.updated",
      "com.merchant.commerce.inventory.changed"
    ],
    "signatureProfile": "merchant-native-hmac",
    "replayWindowSeconds": 300
  }
}
```

Each capability entry MUST declare `status` (`supported`, `limited`, or `unsupported`) and `mode`
(`sync`, `async`, or `none`). It MUST declare relevant constraints such as scopes, maximum TTL,
supported payment methods, pagination limits, optimistic-concurrency support, or required subject
context. Capability metadata expires with the response `meta.expiresAt`; the provider MUST refresh
it after expiry, connector configuration changes, or a capability error.

`limited` means the provider must enforce the declared constraint and expose a deterministic
fallback. `unsupported` MUST produce `501` with `capability_not_supported` when called; the adapter
MUST NOT silently emulate it with an unsafe provider-side record. For checkout, an unsupported
`checkout.create` in-chat mode MUST be paired with an explicitly advertised redirect capability in
the connector profile or an explicit failure path.

### 4.2 Merchant integration manifest

The provider's onboarding registry MUST contain a non-secret integration manifest equivalent to:

```json
{
  "merchantId": "merchant-opaque-id",
  "contractVersion": "merchant-commerce-adapter/v1",
  "adapterEndpoint": "https://adapter.merchant.example/v1",
  "adapterProfile": "generic.v1",
  "auth": {
    "scheme": "oauth2-client-credentials",
    "resource": "https://adapter.merchant.example",
    "secretReference": "vault://merchant/connector/client"
  },
  "scopes": [
    "catalog.read",
    "availability.read",
    "customer.read",
    "loyalty.read",
    "cart.write",
    "checkout.write",
    "order.write",
    "fulfillment.read",
    "events.verify"
  ],
  "capabilityOverrides": {
    "loyalty.lookup": "disabled"
  },
  "allowedOrigins": ["https://storefront.merchant.example"],
  "webhook": {
    "endpoint": "https://provider.example/hooks/merchant-opaque-id",
    "secretReference": "vault://merchant/connector/webhook",
    "signatureProfile": "merchant-native-hmac"
  }
}
```

The manifest MUST NOT contain a client secret, private key, access token, payment credential, raw
identity token, PAN, or credential-bearing URL. `secretReference` identifies provider-managed secret
storage only. A merchant MUST be able to disable an optional capability or scope without uninstalling
the connector. Credential setup MUST support initial verification, rotation with an overlap window,
revocation, and a health/capability refresh. The provider MUST fail closed when a credential is
expired, revoked, or bound to a different merchant.

## 5. Canonical operation surface

The following routes are logical canonical routes. A deployment MAY use an equivalent transport or
route layout if its OpenAPI document preserves the operation IDs, schemas, metadata, authority rules,
and status/error behavior.

All operations return the common response envelope unless otherwise noted. All requests are
merchant-scoped and server-authenticated. `correlationId` is required for every operation. An
`idempotencyKey` is required for every state-changing operation. `expectedVersion`/`If-Match` is
required for an existing resource whenever the capability advertises optimistic concurrency.

| Operation ID                   | Logical HTTP route                                   | Required capability                                            | Subject context                                                                  | Mutation metadata                                                                | Result and authority                                                                                    |
| ------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `discoverCapabilities`         | `GET /capabilities`                                  | Always                                                         | Optional for public capability metadata; authenticated merchant context required | Correlation; no idempotency                                                      | Capability document with expiry.                                                                        |
| `searchCatalog`                | `POST /catalog/search`                               | `catalog.search`                                               | Optional for public catalog; required for personalized results                   | Correlation; no idempotency                                                      | Paginated product summaries resolved by merchant.                                                       |
| `getProduct`                   | `GET /catalog/products/{productRef}`                 | `catalog.product`                                              | Optional unless customer-specific                                                | Correlation; no idempotency                                                      | Product/variant details and current display values from merchant.                                       |
| `checkAvailability`            | `POST /catalog/availability`                         | `catalog.availability`                                         | Optional for public stock; required for customer/channel-specific availability   | Correlation; no idempotency; optional observed version                           | Availability and accepted quantity from merchant.                                                       |
| `quoteCart`                    | `POST /cart/quote`                                   | `commerce.quote`                                               | Required when customer, loyalty, tax, shipping, or channel affects quote         | Correlation; no idempotency unless the merchant creates a reservation; quote TTL | Authoritative lines, discounts, tax, shipping, delivery, total, currency, source version, expiry.       |
| `getCustomer`                  | `GET /customers/{customerRef}`                       | `customer.lookup`                                              | Required; merchant customer reference is adapter-resolved or server-bound        | Correlation; no idempotency                                                      | Minimum approved customer context; no export.                                                           |
| `getLoyalty`                   | `GET /customers/{customerRef}/loyalty`               | `loyalty.lookup`                                               | Required and explicitly scoped                                                   | Correlation; no idempotency                                                      | Minimum approved loyalty context; redemption remains a merchant quote/cart input.                       |
| `createCart`                   | `POST /carts`                                        | `cart.create`                                                  | Required for an authenticated cart; guest support is connector-defined           | Correlation, idempotency, subject, optional expected catalog version             | Merchant cart reference, resolved lines, version, totals, expiry.                                       |
| `getCart`                      | `GET /carts/{cartRef}`                               | `cart.read` or `cart.create`                                   | Required for private carts                                                       | Correlation; no idempotency                                                      | Merchant-authoritative cart and version.                                                                |
| `updateCart`                   | `PATCH /carts/{cartRef}`                             | `cart.update`                                                  | Required                                                                         | Correlation, idempotency, subject, expected version/`If-Match`                   | Re-resolved cart. Client-provided commercial values are rejected.                                       |
| `validateCart`                 | `POST /carts/{cartRef}/validate`                     | `cart.validate` or `cart.reconcile`                            | Required                                                                         | Correlation, idempotency, subject, expected version                              | Validation warnings/deltas and current authoritative quote. No silent overwrite.                        |
| `reconcileCart`                | `POST /carts/{cartRef}/reconcile`                    | `cart.reconcile`                                               | Required                                                                         | Correlation, idempotency, subject, expected version/`If-Match`                   | Materializes proposal lines, resolves current values, and returns a new version or a conflict.          |
| `expireCart`                   | `POST /carts/{cartRef}/expire`                       | `cart.expire`                                                  | Required                                                                         | Correlation, idempotency, subject, expected version                              | Merchant expiration result, or `capability_not_supported` if native expiry is unavailable.              |
| `createCheckoutSession`        | `POST /checkouts`                                    | `checkout.create`                                              | Required                                                                         | Correlation, idempotency, subject, expected cart/quote version                   | Merchant checkout reference, payment requirements, mode, expiry, and redirect continuation when needed. |
| `getCheckoutSession`           | `GET /checkouts/{checkoutRef}`                       | `checkout.read`                                                | Required                                                                         | Correlation; no idempotency                                                      | Merchant-authoritative checkout state and version.                                                      |
| `cancelCheckoutSession`        | `POST /checkouts/{checkoutRef}/cancel`               | `checkout.cancel`                                              | Required                                                                         | Correlation, idempotency, subject, expected version                              | Cancellation result; cancellation is not a refund unless explicitly supported.                          |
| `authorizePayment`             | `POST /checkouts/{checkoutRef}/payment/authorize`    | `payment.authorize` or a documented merchant-native equivalent | Required; provider payment reference is server-bound                             | Correlation, idempotency, subject, expected checkout version, consent reference  | Authorization status or challenge/continuation. No raw instrument.                                      |
| `capturePayment`               | `POST /checkouts/{checkoutRef}/payment/capture`      | `payment.capture` or a documented merchant-native equivalent   | Required                                                                         | Correlation, idempotency, subject, expected checkout version                     | Capture status and payment reference.                                                                   |
| `createOrder` / `confirmOrder` | `POST /orders` or `/checkouts/{checkoutRef}/confirm` | `order.create` / `order.confirm`                               | Required                                                                         | Correlation, idempotency, subject, expected checkout version, payment reference  | Merchant order reference/status only after authoritative confirmation.                                  |
| `getOrder`                     | `GET /orders/{orderRef}`                             | `order.read`                                                   | Required                                                                         | Correlation; no idempotency                                                      | Merchant order status and safe receipt data.                                                            |
| `cancelOrder`                  | `POST /orders/{orderRef}/cancel`                     | `order.cancel`                                                 | Required                                                                         | Correlation, idempotency, subject, expected version                              | Merchant cancellation result; may be asynchronous.                                                      |
| `getFulfillmentStatus`         | `GET /orders/{orderRef}/fulfillment`                 | `fulfillment.status`                                           | Required                                                                         | Correlation; no idempotency                                                      | Merchant fulfillment status, tracking links classified as display-safe, and version.                    |
| `getOperationStatus`           | `GET /operations/{operationId}`                      | `operation.status`                                             | Required                                                                         | Correlation; no idempotency                                                      | Reconciliation status for accepted/unknown mutations.                                                   |
| `handleWebhook`                | `POST /events`                                       | `events.webhook`                                               | Authenticated event source, not shopper subject                                  | Event ID/source dedupe; no shopper idempotency key                               | Signature verification and normalized CloudEvent acknowledgment.                                        |

`mutateCart` is the conceptual adapter operation that groups `updateCart` and
`reconcileCart`; a deployment MAY expose it as one endpoint, but it MUST preserve the separate
validation, version, idempotency, and authority semantics. `authorizePayment` and `capturePayment`
are included to define the payment handoff. A merchant-native flow may instead expose a documented
`payment.nativeEquivalent` capability (for example, an order-confirmation call that atomically
accepts a provider authorization reference); it MUST still return the same normalized payment/order
states and correlation guarantees.

### 5.1 Catalog and pagination

`searchCatalog` accepts `query`, structured merchant-approved `filters`, `locale`, a requested
`currency`, `channel`, and an opaque `pageToken`. It returns display-safe product summaries, an
opaque `nextPageToken`, and `hasMore`. It MUST NOT expose a native query language or arbitrary API
filter passthrough. `pageToken` is scoped to merchant, operation, and contract version; the provider
MUST NOT log it if it embeds native data.

`getProduct` and `checkAvailability` accept only opaque product/variant references from the
merchant-scoped catalog. An unknown or cross-merchant reference is a non-retryable
`resource_not_found` or `resource_forbidden` error, never a lookup in another merchant's catalog.

### 5.2 Customer and loyalty lookup

Customer and loyalty operations require a server-derived `SubjectContext` and an enabled capability.
The adapter MAY resolve the provider subject to a merchant customer reference, but the mapping MUST
be merchant-scoped and MUST NOT use email as the sole stable key. The response MUST be field-minimized
and MAY include only fields explicitly enabled in the manifest, such as a display name, loyalty tier,
available points, or eligible benefits. Loyalty redemption, points debits, and promotion effects MUST
be represented as merchant cart/quote results and revalidated before payment; a cached balance cannot
authorize a discount.

### 5.3 Quote and cart authority

`quoteCart` and `reconcileCart` are the authority boundary before checkout:

1. The provider sends product/variant references, quantities, selected options, customer context,
   and shipping context. It does not send a client total or client price.
2. The adapter resolves current availability, accepted quantity, current unit prices, promotions,
   tax, shipping, delivery estimates, currency, and total from the merchant.
3. The response includes `sourceVersion` and `expiresAt`, and identifies any warning or delta.
4. A price, inventory, promotion, tax, shipping, quantity, currency, or version change pauses
   checkout. The provider displays the authoritative delta and obtains fresh human confirmation.
5. The provider may retain the merchant cart reference and version for the session, but the merchant
   cart remains the sole authoritative cart.

### 5.4 Checkout, payment, and order boundary

`createCheckoutSession` returns one of these modes:

- `in_chat`: the merchant and payment profiles support the provider's server-side in-chat flow;
- `redirect`: the merchant requires hosted checkout or a customer challenge; the response includes a
  short-lived, single-use continuation and a merchant-approved checkout URL; or
- `unsupported`: no safe checkout path is enabled, with a capability error and a host fallback path.

The provider payment service binds its server-side payment authorization to merchant, checkout
reference, exact authoritative amount/currency, subject, consent record, and correlation/idempotency
keys. The adapter sees only a provider payment reference or an approved merchant-native equivalent.
It MUST NOT receive raw PAN, CVV, wallet secret, access token, or a client-selected card identifier.

An order may be created before or after payment only according to the merchant's declared profile.
The adapter MUST return the merchant lifecycle state machine-readably in the typed response `data` —
payment state per `PaymentData.status` (`pending`, `requires_action`, `authorized`, `captured`,
`declined`, `cancelled`, or `unknown`), order state per `OrderData.status` (`pending`, `confirmed`,
`cancelled`, or `unknown`), and checkout state per `CheckoutData.status` — while the envelope `status`
follows the generic operation vocabulary of Section 3.3. Native states such as a merchant
"payment pending" or "order pending" map to the domain `pending` value within `PaymentData` or
`OrderData` respectively, not to the envelope `status`. The provider MUST report an order as confirmed
only after a merchant-authoritative order response or verified event.

### 5.5 Operation status and unknown outcomes

If a connector returns `202 Accepted`, loses the connection after submission, or cannot determine
whether a state-changing operation took effect, it MUST return `pending` or `unknown` with the
`operationId`, `correlationId`, and reconciliation instructions. The provider MUST query
`getOperationStatus`, the merchant resource, or the merchant event stream by the same idempotency and
correlation values before retrying or telling the shopper that no effect occurred.

## 6. Idempotency, correlation, versions, and expiry

### 6.1 Idempotency

Every state-changing HTTP operation (`createCart`, `updateCart`, `reconcileCart`, checkout, payment,
order, and cancellation) MUST have an `Idempotency-Key`. Read operations and webhook delivery MUST
not use this header as their deduplication mechanism. A quote request MAY omit it when it only
resolves a quote; if the declared quote capability creates a reservation or other state change, it
becomes a state-changing HTTP operation and requires the key.

- The provider generates the key for one logical operation and reuses it for retries and
  reconciliation. A browser may request an operation, but it cannot select the authority or reuse a
  key across merchants.
- The adapter stores the key/result mapping for at least the merchant's stated reconciliation
  window and MUST return the original result for an identical retry.
- A retry with the same key and a different canonical request body MUST return
  `idempotency_key_reused` (`409`) and MUST NOT execute a second effect.
- Concurrent requests with the same key MUST converge on one result or one in-progress operation.
- A timeout after a mutation was submitted is an unknown outcome, not permission to create a new key.

Idempotency keys are not correlation IDs. A key identifies one HTTP mutation; a correlation ID links all
related operations, events, payment references, and audit records. HTTP idempotency is an application
safeguard for retrying a state-changing request; HTTP method choice alone does not make a request
retry-safe.

Webhook event deduplication is a separate event-ingestion rule. A valid CloudEvent is deduplicated by
its identity tuple `(source, id)` and the dedupe result is recorded before applying an event effect.
The receiver MUST NOT require or infer an `Idempotency-Key` for a webhook, and the event ID MUST NOT be
used as an HTTP mutation key. A duplicate valid event may be acknowledged as `duplicate` without
repeating effects. These two mechanisms remain separate even when the event was emitted because of
an HTTP mutation.

### 6.2 Correlation and operation state

The provider creates a `correlationId` at the user operation boundary and an `operationId` for each
adapter mutation. The adapter MUST echo correlation and operation IDs in responses, logs, events, and
reconciliation records. A connector MUST preserve merchant-native request IDs in namespaced metadata
without exposing credentials.

At minimum, an operation record contains merchant scope, operation family, idempotency key hash,
correlation ID, subject/agent references, input digest, expected version, current state, merchant
resource references, payment reference if any, attempt count, deadline, expiry, and redacted result
or failure code. The record is operational metadata, not a provider-owned commerce order.

### 6.3 Optimistic concurrency

A connector that supports merchant versions MUST expose an opaque `version` or HTTP `ETag` and honor
`If-Match`/`expectedVersion` on cart, checkout, and order mutations. A stale version MUST return
`version_conflict` (`409` or `412` according to the connector's HTTP mapping) with the current safe
version and a revalidation instruction. It MUST NOT overwrite the newer merchant state.

If a native platform lacks versions, the capability document MUST say
`optimisticConcurrency: false` and declare the native protection (for example, a reservation or
server-side compare operation). The provider MUST treat an undeclared concurrency guarantee as
unavailable and must not claim stale-write safety.

### 6.4 Expiry

Quotes, cart projections, checkout sessions, payment continuations, redirect continuations, and
consent records MUST carry an RFC 3339 `expiresAt` where they are time-bounded. The provider and
adapter MUST use server time, not a browser timestamp, to enforce expiry.

- An expired quote or checkout session returns `quote_expired` or `checkout_expired`; the provider
  re-reads/reconciles rather than reusing its amount.
- A redirect continuation is short-lived, merchant-bound, single-use, and contains only an opaque
  reference. It MUST NOT contain an identity token, payment token, secret, or authority-bearing
  user ID.
- A webhook outside its configured replay window is rejected as stale even if its event ID is new.
- A provider cache may improve responsiveness but MUST never authorize a payment or order after its
  `expiresAt` or source-version invalidation.

## 7. Errors, retry policy, and timeouts

### 7.1 Problem Details error shape

All non-2xx responses use `Content-Type: application/problem+json` and the RFC 9457 members
`type`, `title`, `status`, `detail`, and `instance` as appropriate. The following extensions are
required when known:

```json
{
  "type": "urn:merchant-commerce-adapter:error:version-conflict",
  "title": "Merchant resource changed",
  "status": 409,
  "detail": "The cart changed before this update was applied.",
  "instance": "/operations/op-opaque-id",
  "code": "version_conflict",
  "category": "concurrency",
  "retryable": false,
  "correlationId": "corr-opaque-id",
  "operationId": "op-opaque-id",
  "currentVersion": "merchant-version-2",
  "retryAfter": null,
  "details": {
    "changedFields": ["price", "availability"]
  }
}
```

`detail` and `details` MUST be display-safe and redacted. An upstream stack trace, token, native
credential, PAN, full customer record, or unrestricted merchant payload MUST NOT be copied into a
problem response.

The canonical taxonomy is:

| Code                                                       | Category                   | Typical HTTP status                 | Retry or user action                                                                                           |
| ---------------------------------------------------------- | -------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `invalid_request`                                          | Validation                 | `400`                               | Fix schema or required field; never retry unchanged.                                                           |
| `client_authoritative_value`                               | Authority violation        | `422`                               | Remove client price/status/total; re-quote.                                                                    |
| `contract_version_unsupported`                             | Contract negotiation       | `406` or `415`                      | Select a supported contract version; do not guess.                                                             |
| `authentication_failed`                                    | Authentication             | `401`                               | Refresh server credential through the integration lifecycle; never expose a token to the browser.              |
| `authorization_failed`                                     | Authorization              | `403`                               | Check merchant scope, subject, agent, operation capability, and policy.                                        |
| `resource_not_found`                                       | Resource                   | `404`                               | Reconcile or ask the shopper to select a current item.                                                         |
| `resource_forbidden`                                       | Tenant isolation           | `403`                               | Fail closed; do not probe another merchant.                                                                    |
| `capability_not_supported`                                 | Capability                 | `501`                               | Use declared fallback, usually hosted checkout; never silently emulate.                                        |
| `validation_failed`                                        | Merchant business rule     | `422`                               | Show safe field/warning information and obtain corrected input.                                                |
| `inventory_unavailable`                                    | Availability               | `409` or `422`                      | Refresh availability and request confirmation if lines change.                                                 |
| `price_changed`                                            | Quote drift                | `409`                               | Re-quote, show the delta, and require fresh human consent.                                                     |
| `cart_expired` / `quote_expired` / `checkout_expired`      | Expiry                     | `410` or `409`                      | Recreate/reconcile; never reuse the old amount.                                                                |
| `version_conflict`                                         | Concurrency                | `409` or `412`                      | Re-read, reconcile, and retry only with a new expected version and fresh consent if commercial values changed. |
| `idempotency_key_reused`                                   | Idempotency                | `409`                               | Use the original operation result; never execute the new body.                                                 |
| `rate_limited`                                             | Capacity                   | `429`                               | Honor `Retry-After`; use bounded backoff.                                                                      |
| `merchant_unavailable`                                     | Upstream availability      | `502` or `503`                      | Retry only when safe and within deadline; otherwise surface recoverable failure.                               |
| `adapter_timeout`                                          | Deadline                   | `504`                               | Query/reconcile if mutation may have been submitted; do not assume no effect.                                  |
| `payment_declined`                                         | Payment                    | `402` or `422`                      | Ask for an approved alternative or stop; do not retry blindly.                                                 |
| `customer_action_required`                                 | Payment/checkout challenge | `409` or `202`                      | Return a short-lived challenge/redirect continuation.                                                          |
| `operation_unknown`                                        | Ambiguous outcome          | `202` or `504`                      | Query operation/resource/event status by correlation and idempotency before retry.                             |
| `webhook_invalid` / `webhook_replay` / `webhook_duplicate` | Event integrity            | `400` / `409` / `2xx` duplicate ack | Reject invalid/replayed events; acknowledge safe duplicates without repeating effects.                         |

A connector MAY include a namespaced native code under `details.x-<connector>.code`, but generic
provider logic MUST branch on the canonical `code`, `category`, `retryable`, and capability state.

### 7.2 Retry behavior

Retries are bounded and operation-aware:

- Reads (`searchCatalog`, `getProduct`, `checkAvailability`, `getCart`, `getCustomer`,
  `getLoyalty`, `getCheckoutSession`, `getOrder`, and fulfillment reads) MAY be retried for network
  failures, `408`, `429`, `502`, `503`, and `504` with exponential backoff and jitter. The caller
  MUST honor `Retry-After` and stop before the request deadline or quote expiry.
- Quote and validation reads MAY be retried only within their deadline; the result may change between
  attempts and must carry the latest source version/expiry.
- Mutations MAY be retried only with the same idempotency key and only when the adapter profile says
  the operation is replay-safe. A lost response after submission is always reconciled before another
  attempt.
- A default implementation MUST use no more than three connector attempts per operation and MUST
  stop at the configured deadline; a profile may set a lower limit. There is no unbounded retry.
- `400`, `401`, `403`, `404`, `406`, `415`, `422`, `payment_declined`, and
  `capability_not_supported` are not transient retries unless the error response explicitly provides
  a new remediation.
- Webhook delivery uses a separate bounded retry/dead-letter policy described in Section 8.

### 7.3 Timeout behavior

Each capability document MUST declare default and maximum timeout budgets. The provider MUST apply an
overall deadline across connector retries and merchant calls. A connector MUST return a structured
`adapter_timeout` or `operation_unknown` result when the deadline expires. It MUST not keep a request
open while performing an unbounded background retry.

For synchronous operations, a successful response must fit the advertised budget. For asynchronous
operations, `202 Accepted` MUST include `operationId`, `correlationId`, current status, and either a
`Location` for `getOperationStatus` or an equivalent query reference. The provider reports `pending`
or `unknown` to the shopper until authoritative reconciliation completes.

## 8. Webhook and event contract

### 8.1 CloudEvents envelope

A merchant event is delivered as a CloudEvent v1.0.2 in structured mode or binary mode. Under the
CloudEvents specification, the four required context attributes are only `specversion`, `id`, `source`,
and `type`. `subject`, `time`, `datacontenttype`, and `data` are optional in the CloudEvents
specification. This contract adds stricter requirements for normalized merchant events: `subject`,
`time`, `datacontenttype` (which MUST be `application/json`), `merchantid`, `contractversion`, and
`data` are contract-required. The complete `CloudEvent` schema records that distinction. The
following extension attributes are contract-required when known:

- `merchantid`: the provider merchant scope; this contract requires it on every normalized event;
- `contractversion`: `merchant-commerce-adapter/v1`;
- `correlationid`: related operation correlation, if any;
- `operationid`: related mutation operation, if any;
- `dataversion`: merchant event/resource version, if available; and
- `sequence`: a source-local ordering value, if available.

Example normalized event:

```json
{
  "specversion": "1.0",
  "id": "merchant-event-opaque-id",
  "source": "https://merchant.example/events",
  "type": "com.merchant.commerce.inventory.changed",
  "subject": "product/variant-opaque-id",
  "time": "2026-08-28T12:04:00Z",
  "datacontenttype": "application/json",
  "merchantid": "merchant-opaque-id",
  "contractversion": "merchant-commerce-adapter/v1",
  "correlationid": "corr-opaque-id",
  "dataversion": "inventory-version-8",
  "sequence": 1842,
  "data": {
    "resourceType": "variant",
    "resourceRef": "variant-opaque-id",
    "availability": "limited",
    "observedAt": "2026-08-28T12:04:00Z"
  }
}
```

The core event types are:

- `com.merchant.commerce.catalog.changed`;
- `com.merchant.commerce.inventory.changed`;
- `com.merchant.commerce.quote.invalidated`;
- `com.merchant.commerce.cart.changed`;
- `com.merchant.commerce.checkout.changed`;
- `com.merchant.commerce.payment.changed`;
- `com.merchant.commerce.order.created` and `order.updated`; and
- `com.merchant.commerce.fulfillment.updated`.

A vendor profile MAY add `com.merchant.<profile>.…` event types, but a generic provider consumer
MUST be able to process the core type or safely ignore an optional extension.

### 8.2 Verification, replay, deduplication, and delivery

CloudEvents identifies an event but does not authenticate it. Before parsing or applying `data`, the receiver MUST:

1. authenticate the source using the configured native signature or approved HTTP Message Signature;
2. validate the signature over the exact request representation and required headers;
3. reject a missing, invalid, or stale timestamp outside the configured replay window;
4. validate `source`, `merchantid`, `contractversion`, event type, schema, and content type;
5. deduplicate on `(source, id)` and record the result before applying a side effect; and
6. preserve `time`, `dataversion`, and `sequence` for out-of-order handling.

A duplicate valid event may receive a 2xx acknowledgment, but MUST NOT repeat a cart invalidation,
order update, loyalty effect, or other side effect. An event with a lower known `dataversion` or
sequence MUST NOT overwrite a newer provider projection. Events are invalidation/reconciliation
signals, not permission to overwrite merchant truth. The provider re-reads the merchant resource
when an event affects a quote, checkout, payment, order, or fulfillment decision.

The receiver SHOULD acknowledge quickly after durable deduplication/outbox recording. Transient
processing failures return a non-2xx response or use the provider's queue acknowledgment contract;
delivery retries use exponential backoff, honor merchant/provider retry limits, and dead-letter
after the configured maximum. Invalid signatures, malformed schemas, and replayed invalid events
are not retried. The provider records event IDs, signature result, retry count, applied/ignored state,
and redacted failure code.

### 8.3 Webhook verification operation

`handleWebhook` is both an adapter concern and an integration capability:

- The connector MAY verify a native merchant webhook before creating the normalized CloudEvent.
- The provider event gateway MUST verify the configured connector-to-provider signature before
  accepting the normalized event.
- `signatureVerified` is internal audit metadata and MUST NOT be supplied by an untrusted caller as
  proof. A caller-provided `signatureVerified: true` is ignored or rejected.
- The normalized event payload MUST omit credentials, tokens, payment instrument data, and unnecessary
  personal data.

## 9. Minimum merchant integration surface

A merchant can provide a provider-hosted connector or a merchant-hosted thin adapter. In either
model, the merchant does not host or rewrite the provider chatbot runtime. The minimum surface is
below.

### 9.1 Frontend SDK/widget

The merchant host MUST:

1. load a versioned provider script/package over HTTPS from the approved provider origin;
2. initialize it with public `merchantId`, approved origin context, locale/currency preferences,
   feature/display configuration, and the provider endpoint identifier;
3. perform an origin-checked initialization handshake with a per-session nonce;
4. render display-safe state and provide a host checkout fallback; and
5. subscribe to the versioned event names below.

Frontend configuration MUST NOT contain a merchant secret, connector credential, payment credential,
raw merchant/provider token, raw identity assertion, PAN/CVV, or authority-bearing user ID. The host
MUST NOT construct a payment request from local storage, a model proposal, an event payload, or a
client timestamp.

If `postMessage` is used, the sender MUST use the exact allowlisted target origin, include the
per-session nonce, reject unsolicited/stale session handles, and validate the source window. The
provider MUST derive allowed origins from merchant onboarding; wildcard origins are not a conforming
production profile.

The minimum host event set is:

| Event               | Safe payload                                                                                | Host action                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ready`             | SDK/contract version, session state, enabled capabilities                                   | Render the widget and optional capability affordances.                                             |
| `login-required`    | Reason, provider login/redirect action, expiry                                              | Offer login or guest browsing; do not handle raw tokens.                                           |
| `cart-proposed`     | Opaque product/variant references, quantities, display projection, projection expiry        | Display proposal only; never treat it as an authoritative cart or amount.                          |
| `checkout-started`  | Correlation ID, merchant cart/quote reference, display-safe expiry                          | Prepare host UI; do not call payment directly.                                                     |
| `redirect-required` | Short-lived merchant-bound `continuationId`, approved `redirectUrl`, expiry, correlation ID | Open merchant checkout. Do not append tokens or treat return as success.                           |
| `order-confirmed`   | Merchant order reference, safe status/receipt URL, correlation ID                           | Show receipt and merchant order link. This event is emitted only after authoritative confirmation. |
| `error`             | Canonical error code, safe message, retry/fallback action, correlation ID                   | Display recovery; never display upstream credentials/details.                                      |
| `session-ended`     | Reason and correlation ID                                                                   | Clear local display state and opaque session handles.                                              |

The `redirectUrl` MUST be a merchant-approved hosted checkout URL or provider continuation endpoint
and MUST NOT contain a provider access token, raw identity token, payment secret, or credential. A
merchant-native opaque one-time cart handle is permitted when the merchant explicitly classifies it
as safe for the browser. On return, the provider reconciles payment/order status through the adapter
or verified events; query parameters and a browser callback are not proof of success.

### 9.2 Backend adapter API

The adapter endpoint MUST be reachable only through an authenticated server-to-server path and MUST
provide the canonical operations in Section 5 or advertise an explicit unsupported/limited
capability. It MUST support:

- OpenAPI 3.1.1 and equivalent JSON Schemas for the selected contract version;
- TLS-protected transport with certificate validation, and mTLS or a scoped OAuth profile where
  required by deployment policy;
- merchant tenant binding and least-privilege scopes separated for catalog, availability/price,
  customer, loyalty, cart, checkout, payment handoff, order, fulfillment, and event verification;
- correlation IDs, operation IDs, idempotency keys, expected version/ETag, bounded deadlines, and
  structured Problem Details errors;
- capability discovery with explicit sync/async, expiry, timeout, and fallback metadata; and
- a webhook/event receiver or an approved polling/reconciliation source for order/inventory changes.

A merchant-hosted adapter MUST NOT forward the provider's bearer token to the merchant browser. It
MUST validate the provider caller, merchant scope, allowed operation, subject/agent context, and
request schema before invoking native APIs. Native credentials remain in the connector's server-side
secret store.

### 9.3 Credential setup and rotation

During onboarding, the merchant and provider agree on:

- connector endpoint and contract/profile version;
- authentication scheme, resource/audience, and least-privilege scopes;
- secret or certificate references held in a secret manager;
- capability and origin allowlists;
- timeout, rate-limit, pagination, locale, and currency limits;
- webhook endpoint, signing profile, replay window, event types, and retry/dead-letter policy; and
- data retention/redaction policy for customer, loyalty, payment, and event fields.

Credential values are exchanged only through the approved secret-management path. Rotation MUST allow
old and new credentials to overlap only for a bounded deployment-defined window, verify the new
credential before cutover, and revoke the old credential after cutover. A failed verification or
expired credential disables the affected capability rather than falling back to an untrusted public
endpoint.

### 9.4 Network, authentication, and authorization path

The minimum path is:

```text
Browser/host ── opaque widget session ──► Provider BFF
Provider BFF ── server-side scoped call ──► Adapter gateway/connector
Adapter ── merchant credential ──► Merchant commerce system
Provider payment service ── server-side payment reference ──► Payment boundary
Merchant signed events ──► Provider event gateway/reconciler
```

The provider BFF derives merchant, subject, agent, audience/resource, scope, expiry, and consent
context from authenticated server state. The adapter MUST reject a caller-supplied `merchantId`,
`userId`, `customerId`, payment amount, or order status when it conflicts with that context. OIDC
authentication, a model tool call, or a browser click is not payment authorization.

## 10. Redaction and data handling

The following values MUST NOT appear in browser storage, model prompts, normal logs, analytics,
CloudEvent data, Problem Details, or frontend events:

- raw OIDC ID/access/refresh tokens or token exchange assertions;
- connector OAuth client secrets, private keys, webhook secrets, or payment-provider secrets;
- PAN, CVV, unmasked account numbers, or raw payment instrument data;
- passwords, authorization codes, PKCE verifiers, or session cookies;
- unneeded full customer profiles, loyalty histories, or shipping/payment addresses; and
- raw merchant API responses that contain any of the above.

Safe opaque references, canonical error codes, correlation/operation IDs, merchant order references,
quote/cart versions, and display-safe product/checkout values MAY appear where the capability and
purpose require them. Logs MUST hash or truncate idempotency keys and opaque references where full
values are not needed, and MUST include merchant scope without making it a secret. Redaction MUST be
applied before model context construction, tracing, event publication, and error serialization, not
as a later dashboard display step.

Customer and loyalty responses MUST use an allowlisted field projection. The adapter MUST return a
redaction or field-policy error rather than silently expanding a projection. Payment references are
opaque and server-bound; the frontend may receive only a display-safe payment method summary such as
network/last-four when policy allows, never the underlying credential.

## 11. Hosted-checkout fallback contract

Hosted checkout is a first-class capability, not an error disguised as in-chat success. A connector
MUST advertise `checkout.redirect` when it can create a merchant checkout session and return a
safe handoff.

The fallback sequence is:

1. `reconcileCart` obtains current merchant lines, price, tax, shipping, delivery, version, and
   expiry.
2. The provider obtains explicit human confirmation against those values and creates a server-side
   consent record.
3. `createCheckoutSession` returns `mode: redirect`, a merchant checkout reference, an approved
   checkout URL or provider continuation endpoint, and a short-lived single-use `continuationId`.
4. The widget emits `redirect-required`; the host opens the URL without adding credentials.
5. The merchant checkout performs any required customer authentication, payment challenge, and order
   creation under the merchant's native flow.
6. The return route consumes the continuation once, validates merchant/session binding, and queries
   the adapter for checkout/payment/order status. It does not trust a `success=true` query parameter.
7. The provider emits `order-confirmed` only after authoritative merchant/payment status or a verified
   webhook. An incomplete, cancelled, or ambiguous return remains `pending`, `cancelled`, or
   `unknown` with a recovery action.

A redirect continuation MUST bind merchant, provider session, subject, cart/checkout reference,
correlation ID, and expiry in server-side state. It MUST be single-use and invalidated on consumption
or expiry. It MUST not carry raw identity/payment tokens, a client total, or a reusable authorization
code in the URL.

If `checkout.redirect` is unavailable, the provider emits a capability error with a merchant-host
fallback action. It MUST NOT create a provider-owned order, charge a payment method, or claim an
in-chat order from a client-only cart.

## 12. Conformance and implementation boundary

A connector is conformant to `merchant-commerce-adapter/v1` only if a contract test can demonstrate:

- capability discovery, version negotiation, and explicit unsupported capability responses;
- schema validation and merchant/subject/agent scope enforcement;
- catalog/product search with pagination and opaque merchant references;
- availability and quote resolution with source version and expiry;
- customer/loyalty field minimization and capability disablement;
- cart creation, update, validation, reconciliation, expiration, optimistic version conflict, and
  no client-authoritative commercial values;
- checkout session creation/read/cancel, in-chat versus redirect capability, and single-use fallback;
- payment handoff without raw instruments, explicit payment/order states, and challenge handling;
- idempotent mutation replay, same-key/different-body rejection, timeout/unknown reconciliation,
  and bounded retries;
- order confirmation/read/cancel and fulfillment status without claiming merchant success from a
  browser callback;
- RFC 9457 error taxonomy, redacted details, retryability, and `Retry-After` behavior; and
- CloudEvents signature verification, timestamp/replay checks, source/event deduplication,
  out-of-order handling, retry/dead-letter behavior, and idempotent event effects.

The conformance suite should run against a fake merchant first and then against each connector. It
must distinguish stable normative behavior from connector profiles. A passing test double is evidence
that the boundary works; it is not evidence that Shopify, SAP Commerce, Oracle Commerce, or another
vendor supports every operation.

### 12.1 Future implementation targets

This document defines the contract without implementing it. The expected follow-on seams are:

- `packages/shared/src/types/commerce.ts` for versioned request/response/error/event schemas;
- `apps/chatbot-agent/src/lib/commerce-adapter.ts` for the provider-side boundary and capability
  enforcement;
- a merchant adapter/test-double package for Northwind Phase 1;
- durable operation/idempotency/reconciliation storage rather than the current JSON read-modify-write
  path; and
- contract, webhook, fallback, and end-to-end tests.

Existing `packages/shared/src/types/cart.ts` and `packages/shared/src/types/checkout.ts` are current
POC scaffolds and are not modified by this contract-definition task. They must eventually be
reconciled with the authoritative merchant cart/checkout references defined here.

## 13. Related decisions and sources

- [Commerce interoperability assessment and target architecture](./commerce-interoperability.md)
- [Connector strategy for Shopify-, SAP-, Oracle-, and custom-style merchants](./connector-strategy.md)
- [Commerce security and identity controls](./commerce-security-identity.md)
- [Checkout reliability and recovery model](./checkout-reliability.md)
- [Project requirements](../.polaris/merchant-chatbot-ecommerce-interoperability/requirements.md)
- [Implementation plan](../.polaris/merchant-chatbot-ecommerce-interoperability/plan.md)
- [HTTP Semantics (RFC 9110)](https://www.rfc-editor.org/rfc/rfc9110)
- [Problem Details for HTTP APIs (RFC 9457)](https://www.rfc-editor.org/rfc/rfc9457.html)
- [OpenAPI Specification 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-core.html)
- [CloudEvents Specification v1.0.2](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md)
- [HTTP Message Signatures (RFC 9421)](https://www.rfc-editor.org/rfc/rfc9421.html)
- [OAuth 2.0 (RFC 6749)](https://www.rfc-editor.org/rfc/rfc6749)
- [OAuth 2.0 Mutual-TLS Client Authentication and Certificate-Bound Access Tokens (RFC 8705)](https://www.rfc-editor.org/rfc/rfc8705)
