# Task 3 Summary

## Status

**DONE**

## What was implemented

Added the canonical platform-neutral Merchant Commerce Adapter contract in:

- `docs/commerce-adapter-contract.md`

The contract definition includes:

- normative language and an explicit distinction between the normative core, incorporated HTTP/
  OpenAPI 3.1.1/JSON Schema 2020-12/CloudEvents v1.0.2 standards, and beta/vendor profiles;
- merchant-versus-provider authority boundaries and a hard prohibition on client/model-authoritative
  price, tax, inventory, shipping, total, payment, order, and loyalty values;
- version negotiation, media types, correlation IDs, idempotency keys, merchant scope, subject/agent
  context, expected version/ETag, deadlines, trace context, and operation metadata;
- machine-readable OpenAPI and JSON Schema excerpts for opaque merchant references, money, line intent,
  server-derived subject context, resolved lines, response envelopes, and structured Problem Details;
- authenticated capability discovery, capability status/mode/limits/expiry, optional capability
  disablement, fallback declaration, and a non-secret merchant integration manifest;
- canonical operations for catalog search/product retrieval, availability and quote, customer and
  loyalty lookup, cart creation/read/update/validation/reconciliation/expiration, checkout lifecycle,
  payment authorization/capture handoff, order creation/confirmation/read/cancellation, fulfillment
  status, operation reconciliation, and webhook handling;
- normalized fields versus adapter-resolved values, pagination, namespaced extensions, profile metadata,
  source versions, quote/cart/checkout expiry, and merchant-authoritative cart/order rules;
- idempotency replay and same-key/different-body behavior, correlation/operation records, optimistic
  concurrency and version conflicts, expiry enforcement, bounded retry policy, timeout behavior, and
  ambiguous-outcome reconciliation;
- RFC 9457 error taxonomy covering validation, authorization, capability, inventory/price drift,
  expiry, version, rate limit, merchant availability, payment decline/challenge, unknown outcomes,
  and webhook integrity;
- CloudEvents webhook envelope, signature/authentication boundary, timestamp/replay checks,
  source/event deduplication, ordering/version handling, retry/dead-letter behavior, and idempotent
  event effects;
- minimum merchant frontend SDK/widget events and exact-origin/nonce handling;
- backend adapter API, server-side credential/scopes, secret-manager setup, rotation/revocation,
  network/authentication path, and merchant-hosted adapter requirements;
- redaction rules for tokens, credentials, payment data, personal data, event payloads, logs, model
  context, and frontend events; and
- hosted-checkout fallback with authoritative pre-confirmation reconciliation, single-use
  merchant-bound continuation, return reconciliation, and no browser callback as proof of success.

The document records expected future implementation seams without creating runtime code, generated
TypeScript types, connectors, payment resources, webhook endpoints, or live identity resources.

## Verification

- Embedded JSON fenced blocks: all 6 parsed successfully with Python's JSON parser.
- Operation/requirement coverage check: all required operation identifiers and contract metadata terms
  were found in the document.
- `git diff --check` passed.
- `pnpm exec prettier --check docs/commerce-adapter-contract.md` passed.
- Tests, lint, typecheck, and build were not run because the plan specifies `Testing: none` for this
  documentation-only contract-definition task.

## Deviations

- The contract is a new standalone document as specified by Task 3; the existing
  `docs/commerce-interoperability.md` remains the Task 1/Task 2 evidence and architecture record.
- The OpenAPI and JSON Schema content is intentionally an illustrative normative excerpt with
  placeholder `example.invalid` schema URLs; no generated schema package or implementation was added.
- Vendor-specific Shopify-, SAP-, and Oracle-style behavior is deliberately described only as beta
  profile metadata and translation boundaries; no vendor API shape, certification, live account, or
  connector support claim is introduced.
- No runtime, configuration, seed-data, identity-provider, payment, merchant, adapter, webhook, or
  external-resource changes were made.

## Fix Iteration 1

### Status

**DONE**

### Review findings addressed

- Replaced the tiny illustrative OpenAPI/JSON Schema excerpt with two checked-in machine-readable
  contract artifacts: `docs/commerce-adapter-openapi.json` and
  `docs/commerce-adapter-schemas.json`. The OpenAPI document now declares all canonical operation
  IDs, logical routes, methods, request bodies, typed operation responses, shared headers, security,
  capability annotations, and structured error responses. The adjacent JSON Schema 2020-12 document
  provides complete request, response, capability, Problem Details, CloudEvent, and webhook schemas.
- Removed unresolved `example.invalid` references and the fictional server URL. OpenAPI references the
  adjacent local schema artifact and uses a relative `/v1` deployment base path; deployment-specific
  origins remain onboarding configuration rather than contract placeholders.
- Completed capability coverage for every canonical operation, including `capability.discovery`,
  `cart.read`, `order.create`, and the separate `checkout.redirect` fallback capability. The
  capability schema requires an explicit entry for every capability, including `unsupported` entries.
- Separated HTTP mutation idempotency from webhook event deduplication. `Idempotency-Key` is required
  for state-changing HTTP operations (with quote reservations called out as conditional); webhook
  ingestion does not use that header and deduplicates valid CloudEvents by `(source, id)` before
  applying effects.
- Corrected the CloudEvents v1.0.2 distinction: the specification-required context attributes are
  `specversion`, `id`, `source`, and `type`; `subject`, `time`, `datacontenttype`, and `data` are
  optional in the specification but required by this normalized merchant-event contract, with
  `merchantid` and `contractversion` also contract-required.

### Fix Iteration 1 verification

- Parsed all four JSON fenced examples in the Markdown contract with Python's JSON parser.
- Parsed `docs/commerce-adapter-openapi.json` and `docs/commerce-adapter-schemas.json` successfully.
- Verified all 25 canonical operation IDs are present exactly once, every operation has a capability
  annotation, every capability annotation belongs to the declared vocabulary, and every capability
  vocabulary entry is required by the capability schema.
- Verified all OpenAPI component schema references resolve to definitions in the adjacent JSON Schema
  artifact and no `example.invalid` reference remains.
- `pnpm exec prettier --check docs/commerce-adapter-contract.md docs/commerce-adapter-openapi.json docs/commerce-adapter-schemas.json` passed.
- `git diff --check` passed.
- Tests, lint, typecheck, and build were not run because the plan specifies `Testing: none` for this
  documentation-only contract-definition task.

### Fix Iteration 1 deviations

- Added the two machine-readable JSON artifacts within the existing documentation-only Task 3 scope;
  no generated TypeScript types, runtime adapter, connector, endpoint, payment, identity, or webhook
  implementation was introduced.
- No review file was present at the requested Task 3 path in the checkout; the requested findings were
  applied from the user-provided review summary.

## Fix Iteration 2

### Status

**DONE**

### Review findings addressed

Important 3: `AdapterResponse.status` allowed only generic operation states while Section 5.4 required
explicit payment/order states such as `payment_pending`/`order_pending`, which appear in no schema;
the two status layers were not linked normatively.

- `docs/commerce-adapter-contract.md` Section 3.3: added a normative paragraph after the shared
  vocabulary list defining the two status layers — the envelope `status` (schema `Status`) is the
  generic operation outcome (succeeded/accepted/running/requires_action/pending/unknown/failed/
  cancelled) describing whether and how the operation completed, while the merchant domain lifecycle
  state is carried machine-readably on the typed `data` payload (`CheckoutData.status`,
  `PaymentData.status`, `OrderData.status`, `CartData.status`, `FulfillmentData.status`, each with its
  own enum). Provider logic MUST branch on the envelope `status` for operation control flow and on the
  domain `data.*.status` for payment/order lifecycle decisions, and MUST NOT infer payment or order
  lifecycle from the envelope `status` alone.
- `docs/commerce-adapter-contract.md` Section 5.4: rewrote the offending sentence so the required
  explicit states are the schema enums — payment state per `PaymentData.status`, order state per
  `OrderData.status`, checkout state per `CheckoutData.status` — with the envelope `status` following
  the generic operation vocabulary of Section 3.3. Removed the invented strings `payment_pending` and
  `order_pending`; a clause now states that such native states map to the domain `pending` value
  within `PaymentData` or `OrderData`, not to the envelope `status`. The existing rule that the
  provider reports an order as confirmed only after a merchant-authoritative response or verified
  event is preserved.
- `docs/commerce-adapter-schemas.json`: added a `description` on `AdapterResponse.status` (as a
  JSON Schema 2020-12 sibling of the `$ref`) pointing to the domain status fields on the typed data
  payload. No enum values were changed; no other schema content was modified.
- `docs/commerce-adapter-openapi.json`: unchanged (it only references the schemas file).

### Fix Iteration 2 verification

- `pnpm exec prettier --check docs/commerce-adapter-contract.md docs/commerce-adapter-schemas.json
  docs/commerce-adapter-openapi.json` passed.
- `python3 -c "import json;json.load(open('docs/commerce-adapter-schemas.json'))"` passed; same for
  `docs/commerce-adapter-openapi.json`.
- `git diff --check` passed.
- `pnpm lint` was not run (known pre-existing failures in unrelated script files, per dispatch).

### Fix Iteration 2 deviations

- None; all edits were surgical and within the documentation-only scope.
