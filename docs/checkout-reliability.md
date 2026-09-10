# Checkout Reliability and Recovery Model

**Status:** Task 6 reliability specification — target requirements for cart synchronization, the
checkout/payment state machine, webhook handling, and recovery. This document does not claim that
any behavior described here is implemented today; current-state behavior is cited inline as
evidence only.

**Scope:** The end-to-end in-chat purchase sequence (intent → review → consent → merchant
revalidation → checkout session → payment authorize/capture → order confirmation → safe response)
and the reliability model that prevents stale totals, duplicate orders, duplicate charges, and
false success. The operation surface, idempotency, error taxonomy, webhook envelope, and
hosted-checkout fallback cited below as "Contract §n" are normative in
[`commerce-adapter-contract.md`](./commerce-adapter-contract.md), with machine-readable artifacts in
[`commerce-adapter-openapi.json`](./commerce-adapter-openapi.json) and
[`commerce-adapter-schemas.json`](./commerce-adapter-schemas.json). The identity, consent, and API
authorization controls this document builds on are normative in
[`commerce-security-identity.md`](./commerce-security-identity.md).

This is a documentation-only task. It specifies no payment processor integration, no database
migration, no webhook endpoint, and no change to `payment-api`. It defines no autonomous
transaction flow: every purchase is initiated, reviewed, and confirmed by the shopper.

## 1. Invariants

The whole model reduces to five invariants. Every rule in this document enforces one of them.

1. **Merchant truth only.** Every money, availability, and lifecycle value comes from a merchant
   quote/cart/checkout/order response carrying a `version` and a valid `expiresAt`
   (Contract §2.1, §5.3, §6.4). Browser state, model output, and provider caches are never
   authority (G-03 evidence: [`cart-provider.tsx#L39-L88`](../apps/merchant-web/src/components/cart-provider.tsx#L39-L88)
   stores product snapshots and quantities in browser local storage with no merchant handle,
   version, or expiry).
2. **No silent charge of changed state.** If merchant revalidation returns different lines, price,
   promotion, tax, shipping, quantity, availability, currency, or version than the consented
   state, the operation pauses and the shopper re-confirms (Contract §5.3 step 4, §7.1
   `price_changed` / `version_conflict` rows).
3. **One logical effect per idempotency key.** Each mutation carries one provider-generated
   idempotency key reused for every retry and reconciliation (Contract §6.1). A lost response is
   an unknown outcome resolved by query-before-retry, never by a new key (Contract §5.5, §7.3).
4. **Consent is a server-side record, not a UI event.** Payment authority requires an exact-match,
   single-use, unexpired consent record bound to the authoritative version, amount, subject,
   merchant, and payment reference
   ([`commerce-security-identity.md`](./commerce-security-identity.md) §6; the current path checks
   only consent-field presence, G-05).
5. **Success is only ever reported from authoritative state.** An order is confirmed only from a
   merchant-authoritative response or verified event (Contract §5.4). A browser callback, query
   parameter, client timestamp, or LLM proposal is never proof (Contract §11, §9.1; current
   behavior returns a provider-synthetic `captured` session, G-04).

Two status layers carry state machine-readably (Contract §3.3): the envelope `status` (schema
`Status`: `succeeded`, `accepted`, `running`, `requires_action`, `pending`, `unknown`, `failed`,
`cancelled`) drives operation control flow, while the domain lifecycle is carried in
`CheckoutData.status`, `PaymentData.status`, `OrderData.status`, and `CartData.status`. The
provider MUST NOT infer payment or order lifecycle from the envelope status alone.

## 2. Conversational cart versus merchant cart

| Aspect          | Conversational cart (provider, non-authoritative)                                                                                              | Merchant cart (authoritative)                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Where it lives  | Server-side conversation state; browser local storage is a disposable display projection (G-03)                                                | Merchant commerce system, behind the adapter (`cart.create` / `cart.read` / `cart.update`, Contract §5)                       |
| Contents        | Opaque product/variant refs, quantities, selected option refs, session/conversation ID, observed quote/cart version, TTL                       | Merchant-resolved lines, prices, promotions, tax, shipping, delivery, totals, warnings, version, expiry                       |
| Trust           | Intent only; never authority for price, stock, identity, tax, shipping, loyalty, payment, or order                                             | Sole authority for all commercial values for its `version` and `expiresAt` (Contract §2, §5.3)                                |
| Synchronization | On meaningful mutation the backend may create/update a merchant cart; if it cannot, the intent stays marked unsynchronized and cannot checkout | `reconcileCart` materializes proposal lines and returns a new version or `version_conflict` (Contract §5)                     |
| Expiration      | TTL-bound server-side; browser projection expires with it                                                                                      | `cart.expire` or native TTL; expired cart returns `cart_expired` and is recreated, never re-quoted from cache (Contract §6.4) |
| After checkout  | Discarded with the session; never promoted into an order                                                                                       | Remains the sole authoritative cart; the provider keeps only the opaque handle, version, and correlation state                |

The browser-local `acme-cart:<merchantId>` snapshot today (G-03) is the negative example: it is
disconnected from any merchant cart, carries captured prices, and its checkout path
([`checkout-form.tsx#L156-L183`](../apps/merchant-web/src/app/checkout/checkout-form.tsx#L156-L183))
rebuilds a request from those snapshots. The target keeps the convenience projection but removes
its authority: it is a rendering cache for display only, synchronized server-side before checkout.

## 3. End-to-end in-chat purchase sequence

Phases 1–8 are the required happy path; the reconciler leg (9) closes the loop with merchant
events. Phase names match the plan's ordering.

```text
  Shopper   Widget     BFF / orchestr.   Adapter    Merchant SOR     Payment     Reconciler
     │         │              │             │             │             │             │
               │ 1 intent captured; conversational cart held server-side (merchant refs, qty, options, TTL)
                              │ 2 revalidate before display: reconcileCart / quoteCart carrying If-Match
                              │────────────►│
                              │ authoritative quote + sourceVersion + expiresAt
                              │◄─────────── │
     │ review merchant-resolved lines, totals, tax/shipping, loyalty effect, quote expiry
     │ 3 explicit confirmation click
     │───────────────────────►│
                              │ consent record: subject, merchant, exact quote version, amount/currency,
                              │ payment ref, single-use nonce, expiry, server-observed timestamp
                              │ 4 merchant revalidation: validateCart (If-Match = consented version)
                              │────────────►│
                              │ delta / version_conflict -> pause, show delta, fresh consent; never charge
                              │◄─────────── │
                              │ 5 createCheckoutSession (idempotency key, expected quote version)
                              │────────────►│
                              │ checkoutRef, mode, permitted methods, final amount/version, expiresAt
                              │◄─────────── │
                              │ 6 authorizePayment -> capturePayment (server payment reference, consentRef)
                              │────────────────────────────────────────►│
                              │ authorized / requires_action challenge / declined / pending / unknown
                              │◄─────────────────────────────────────── │
                              │ 7 createOrder / confirmOrder per declared merchant profile
                              │────────────►│
                              │ merchant orderRef + OrderData.status (authoritative)
                              │◄─────────── │
     │ 8 safe response: order-confirmed only from an authoritative result; otherwise a
     │ recoverable pending / failed / unknown status with an action
     │         │              │             │             │             │             │
                                                          │ signed merchant event
                                                          │──────────────────────────►│
                                                          │ 9 reconcile: verify, dedupe, record first, re-read merchant truth
```

| #   | Phase                     | Actor                  | Action and required checks                                                                                                                                                                                  | Failure / branch behavior                                                                                                                                                                                           |
| --- | ------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Intent                    | Widget → BFF           | Shopper expresses purchase intent; the BFF captures merchant product/variant references, quantities, selected options, session, and TTL server-side. LLM output is intent capture only (Contract §2.1).     | Unknown or cross-merchant reference → `resource_not_found` / `resource_forbidden`, non-retryable.                                                                                                                   |
| 2   | Revalidate before display | BFF → Adapter          | `reconcileCart` / `quoteCart` with `If-Match` when a cart version is held. Merchant resolves price, promotion, inventory, tax, shipping, delivery, total, `sourceVersion`, `expiresAt`.                     | Merchant unavailable → retry reads within deadline; expired projection → re-read, never reuse cached totals (Contract §6.4).                                                                                        |
| 3   | Explicit consent          | Shopper → Widget → BFF | The shopper reviews merchant-resolved values and confirms in the widget. The BFF records a server-side consent record (§1, rule 4); the client timestamp is advisory.                                       | Missing/invalid subject, scope, agent, merchant binding, or expired session → authorization failure with a login/identity recovery path (security §5.4).                                                            |
| 4   | Merchant revalidation     | BFF → Adapter          | `validateCart` with `If-Match` equal to the consented version. Any delta — lines, price, promotion, tax, shipping, quantity, availability, currency, version — pauses checkout.                             | `price_changed`, `inventory_unavailable`, `version_conflict` → display the exact delta and require fresh consent; a silently charged delta is prohibited. `cart_expired`/`quote_expired` → re-quote, fresh consent. |
| 5   | Checkout session          | BFF → Adapter          | `createCheckoutSession` with idempotency key and expected quote version. Returns `checkoutRef`, `mode` (`in_chat` / `redirect` / `unsupported`), permitted payment methods, final amount/version, expiry.   | `checkout_expired` → re-read and re-quote. `unsupported` or redirect mode → §7 fallback. `rate_limited` → honor `Retry-After`.                                                                                      |
| 6   | Payment authorize/capture | Payment orchestrator   | Server-side `authorizePayment` bound to checkout reference, exact authoritative amount/currency, subject, `consentRef`, idempotency key. Capture follows per the merchant profile.                          | `declined` → stop, offer approved alternatives. `requires_action` → short-lived challenge continuation. `pending`/`unknown` → §5 reconciliation, never re-submit with a new key.                                    |
| 7   | Order confirmation        | BFF → Adapter          | `createOrder`/`confirmOrder` before or after payment per the merchant's declared profile; only an authoritative merchant response or verified event may set `OrderData.status = confirmed`.                 | Merchant cancellation or decline after payment → follow the merchant cancellation policy; refund/void handling is merchant-owned. `unknown` → reconcile by correlation/idempotency before reporting anything.       |
| 8   | Safe response             | BFF → Widget           | Display-safe result: `order-confirmed` event only on authoritative confirmation; otherwise a recoverable status with an action. No tokens, secrets, raw payloads, or authority-bearing identifiers.         | Any ambiguous outcome → report `pending`/`unknown` with a recovery action; never claim failure or success without authority.                                                                                        |
| 9   | Reconciliation            | Reconciler             | Signed merchant events and `getOperationStatus`/`getOrder`/`getCheckoutSession` re-reads advance or correct operation state; events are invalidation signals, never permission to overwrite merchant truth. | Delayed, duplicated, out-of-order, or lost events → §6 rules.                                                                                                                                                       |

## 4. Checkout/payment state machine

One operation record per logical checkout attempt carries the generic envelope state (schema
`Status`) through the phases above. Domain lifecycle values live on the typed data payloads —
`PaymentData.status` (`pending`, `requires_action`, `authorized`, `captured`, `declined`,
`cancelled`, `unknown`), `OrderData.status` (`pending`, `confirmed`, `cancelled`, `unknown`),
`CheckoutData.status` (`created`, `pending`, `requires_action`, `completed`, `cancelled`,
`expired`, `unknown`) — and MUST be read from those fields, never inferred from the envelope.

```text
                  operation record created (correlationId + idempotency key)
                                              │
                                              ▼
                                        ┌───────────┐
                                        │  pending  │   preconditions verified: §5.2 checks,
  consent expired/mismatched,           └───────────┘   consent exact-match + single-use
  precondition failure, or       ┐─────◄                nonce, If-Match = consented version
  shopper cancel (pre-submit)    │            │
                                 │            │
                                 │            │
                                 │            │
                                 ▼            ▼        deadline / lost connection after submit
                       ┌────────────┐   ┌───────────┐            ┌───────────┐
                       │ cancelled  │◄──│  running  │ ──────────►│  unknown  │
                       └────────────┘   └───────────┘            └───────────┘
                                      ▲                                │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │         │                      │
                                      │─────────│───────────────────────
    query-before-retry (same idempotency key):  │                      ┘
    getOperationStatus / getOrder / events      │
                                                │
                                 ┐──────────────┘
                                 │              ┌─────────────────┐
                                 │                                │
                                 ▼              ▼                 ▼
                           ┌───────────┐  ┌───────────┐   ┌────────────────┐
                           │  failed   │  │ succeeded │   │requires_action │
                           └───────────┘   └───────────┘   └────────────────┘

          terminal: payment_declined,         terminal: PaymentData.status = captured,    challenge completed -> re-enter running
          validation_failed, expiry           OrderData.status = confirmed                with same idempotency key;
                                                                                          expired -> cancelled
```

### Transitions

| From              | Trigger                                                                     | To                                   | Contract basis                  | Shopper-safe response                              |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------ | ------------------------------- | -------------------------------------------------- |
| (created)         | Operation record written server-side                                        | `pending`                            | §6.2 operation record           | "Preparing checkout…"                              |
| `pending`         | Preconditions verified (subject/scope/agent, consent exact-match, If-Match) | `running`                            | security §5.2, §6               | —                                                  |
| `pending`         | Consent expired/mismatched/revoked, precondition failure, shopper cancel    | `cancelled`                          | security §6; §7.1               | "Checkout cancelled"                               |
| `running`         | Mutation submitted to adapter                                               | `running`                            | §5.5, §7.3                      | "Processing…"                                      |
| `running`         | Deadline hit or connection lost after submission                            | `unknown`                            | §5.5, §7.3 `operation_unknown`  | "Verifying — do not resubmit"                      |
| `running`         | Challenge returned                                                          | `requires_action`                    | §7.1 `customer_action_required` | Short-lived challenge continuation                 |
| `running`         | Authoritative terminal result                                               | `succeeded` / `failed`               | §5.4, §7.1                      | Receipt or recoverable failure                     |
| `running`         | Shopper cancels mid-flight                                                  | `cancelled`                          | §5 `cancelCheckoutSession`      | "Checkout cancelled"                               |
| `unknown`         | Query returns definitive outcome                                            | `succeeded` / `failed` / `cancelled` | §5.5, §6.1                      | Authoritative result once known                    |
| `unknown`         | No definitive outcome before the reconciliation window closes               | `unknown` (stays)                    | §5.5                            | "Verifying with the merchant — we will notify you" |
| `requires_action` | Challenge completed                                                         | `running`                            | §5.4                            | —                                                  |
| `requires_action` | Challenge expired/abandoned                                                 | `cancelled`                          | §6.4                            | "Checkout expired — start again"                   |

`succeeded` requires both `PaymentData.status = captured` (or `authorized` plus a declared
merchant capture profile) and `OrderData.status = confirmed`; neither is inferred from the other.

## 5. Idempotency, optimistic concurrency, and expiry

**Idempotency keys.** Every mutating step (cart reconcile, checkout create, payment authorize and
capture, order create/confirm/cancel, cancellations) carries one provider-generated
`Idempotency-Key` for the logical operation, reused unchanged across retries and reconciliation
attempts (Contract §6.1). The same key with a different body is a `409 idempotency_key_reused`
that MUST NOT execute a second effect. Concurrent duplicate submissions with the same key converge
on one result or one in-progress operation. A retry after timeout reuses the key — creating a new
key after an ambiguous outcome is exactly the duplicate-charge bug this prevents (Contract §6.1
last bullet).

**Optimistic concurrency.** Cart, checkout, and order mutations carry `If-Match`/`expectedVersion`
wherever the connector advertises `optimisticConcurrency: true` (Contract §6.3). A stale version
returns `version_conflict` with the current safe version; the provider re-reads, reconciles, and
requires fresh consent if commercial values changed. Where a platform has no versions, the
capability document must say `optimisticConcurrency: false` and declare the native protection; the
provider then treats stale-write safety as unavailable rather than pretending it exists
(connector §5 R-C07).

**Expiry.** Quotes, carts, checkout sessions, payment continuations, redirect continuations, and
consent records carry RFC 3339 `expiresAt` enforced with server time (Contract §6.4; security §6).
`quote_expired`, `cart_expired`, and `checkout_expired` force re-read/reconcile — never reuse of
the previous amount. A stale or replayed consent nonce is rejected (security §6.4).

## 6. Webhook and event handling (Contract §8)

Webhooks are eventual-consistency signals, not authority and not a substitute for
reconciliation reads. The provider event gateway enforces, in order (Contract §8.2):

1. **Authenticity.** Verify the configured connector-to-provider signature (native HMAC or an
   approved RFC 9421 profile) over the exact request representation before parsing or applying
   `data`. Caller-supplied `signatureVerified: true` is ignored or rejected (Contract §8.3).
2. **Replay window.** Reject a missing, invalid, or stale timestamp outside the configured
   `replayWindowSeconds`, even if the event ID is new (Contract §6.4, §8.2).
3. **Validation.** Check `source`, `merchantid`, `contractversion`, event type, schema, and
   content type; unknown event types are safely ignored, malformed ones rejected.
4. **Deduplication.** Deduplicate on the `(source, id)` identity tuple and record the result
   before applying any side effect (Contract §6.1 event-ingestion rule; schema `WebhookAck`).
   Duplicates are acknowledged `duplicate` with no repeated effect.
5. **Out-of-order tolerance.** Preserve `time`, `dataversion`, and `sequence`; an event with a
   lower known `dataversion`/`sequence` must not overwrite a newer provider projection (§8.2).
6. **Effect rule.** Events invalidate provider projections; the provider re-reads the merchant
   resource via the adapter when an event affects a quote, checkout, payment, order, or
   fulfillment decision. An event never overwrites merchant truth and never authorizes a charge.

Delivery failures: transient processing failures return non-2xx for bounded retry with backoff;
after the configured maximum, events dead-letter. Invalid signatures, malformed schemas, and
replayed invalid events are not retried (Contract §8.2). The receiver acknowledges quickly after
durable dedupe/outbox recording (§7 below), and records event ID, signature result, retry count,
applied/ignored state, and redacted failure code (security §10).

## 7. Failure-mode walkthrough

| Failure                        | What happens in the flow                                                           | Required handling                                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price changed                  | Phase 2 or 4 revalidation returns `price_changed` / a delta.                       | Pause; show exact old vs new; require fresh consent. Never charge the new amount silently (Contract §5.3 step 4, §7.1).                                                                                                         |
| Promotion/tax/shipping changed | Quote revalidation returns different promotion, tax, or shipping values.           | Same as price change: display delta, fresh consent (§5.3).                                                                                                                                                                      |
| Inventory conflict             | `inventory_unavailable` or reduced accepted quantity.                              | Display adjusted lines; shopper re-confirms the changed cart before any payment (Contract §7.1 `inventory_unavailable` row).                                                                                                    |
| Cart/quote expired             | `cart_expired` / `quote_expired` / `checkout_expired`.                             | Re-read/reconcile from merchant truth; never reuse the stale amount; fresh consent (Contract §6.4).                                                                                                                             |
| Consent stale/expired          | Consent record expired or version/amount mismatch detected pre-charge.             | `cancelled`; shopper re-reviews and re-confirms. A replayed nonce is never accepted (security §6).                                                                                                                              |
| Version conflict               | Concurrent mutation (e.g., shopper editing in another tab) wins first.             | `version_conflict` → re-read, reconcile, fresh consent if values changed; never overwrite newer merchant state (Contract §6.3).                                                                                                 |
| Payment declined               | `PaymentData.status = declined` (HTTP `402`/`422` `payment_declined`).             | Stop; offer an approved alternative payment method or end. No blind retry (Contract §7.1; connector R-C04).                                                                                                                     |
| Timeout/unknown                | Deadline or lost connection after submission → envelope `unknown` + `operationId`. | Query-before-retry: `getOperationStatus`, merchant resource reads, or verified events by the same idempotency/correlation values; report `pending`/`unknown`; never create a new key or claim failure (Contract §5.5, §7.3).    |
| Duplicate submit               | Same confirmation clicked twice, or a retry racing the original.                   | Same idempotency key → one logical effect; same-key/different-body → `idempotency_key_reused`; converge on the original result (Contract §6.1).                                                                                 |
| Partial completion             | Payment captured but order creation uncertain (or the reverse, per profile).       | Operation stays `unknown`/`pending`; reconciler correlates payment and order records by idempotency/correlation; shopper sees a truthful in-progress status, never a false success or a duplicate charge (Contract §5.4, §5.5). |
| Webhook delayed/lost           | Provider projection stale while the merchant has advanced.                         | Bounded retry then dead-letter on the sender; the provider reconciles via `operation.status`/`order.read` polling within the declared reconciliation window (Contract §8.2; connector R-C05).                                   |
| Webhook duplicated             | Same `(source, id)` delivered again.                                               | Ack `duplicate`, no repeated effect (Contract §6.1, §8.2).                                                                                                                                                                      |
| Webhook out-of-order           | Older event arrives after a newer one.                                             | Preserve `dataversion`/`sequence`; do not overwrite a newer projection; re-read merchant truth (Contract §8.2).                                                                                                                 |
| Merchant unavailable           | `merchant_unavailable` / `rate_limited` during mutation.                           | Bounded retries with backoff within the deadline; if the mutation may have been submitted, treat as `unknown` and reconcile (Contract §7.1–§7.3).                                                                               |

## 8. Why the current persistence cannot be the monetary boundary

The current checkout path is a provider-local transaction recorder, not a monetary boundary. Three
specific properties make it unsafe for duplicate-order, duplicate-charge, and false-success
prevention:

1. **Unlocked read-modify-write on shared JSON.**
   [`packages/shared/src/data/json-store.ts#L1-L27`](../packages/shared/src/data/json-store.ts#L1-L27)
   documents "no locking, no concurrency guards, no schema validation." The checkout route reads
   the transactions array, appends, and writes the whole file back
   ([`checkout/route.ts#L165-L196`](../apps/payment-api/src/app/api/checkout/route.ts#L165-L196)).
   Two concurrent checkouts can both read the same base state and the second write silently
   discards the first's transaction — a lost charge record with no error. There is no
   unique constraint on any key, so nothing prevents two rows for one logical operation (G-10).
2. **Timestamp/sequence-derived identifiers instead of idempotency records.** Transaction and
   checkout IDs are derived from existing rows and `Date.now()`
   ([`checkout/route.ts#L30-L42`](../apps/payment-api/src/app/api/checkout/route.ts#L31-L42)). A
   retry of the same confirmation — the timeout/double-click cases in §4 — produces a second
   transaction with a different ID, which is the definition of a duplicate charge. There is no
   idempotency-key record to return the original result on replay (Contract §6.1).
3. **Best-effort, non-transactional loyalty effects.** The loyalty accrual runs after the
   transaction write as a separate unlocked read-modify-write with an explicit "best-effort" skip
   on failure
   ([`checkout/route.ts#L204-L246`](../apps/payment-api/src/app/api/checkout/route.ts#L204-L246)).
   A failure silently loses the accrual (no rollback, no retry record); a partial crash between
   the two writes leaves payment and loyalty permanently inconsistent. Monetary-adjacent state
   changes need a transaction boundary plus reconciliation, not a swallowed error (G-10).

The target model replaces this with: durable operation records carrying
merchant scope, operation family, idempotency key hash, correlation ID, subject/agent references,
input digest, expected version, current state, merchant resource references, payment reference,
attempt count, deadline, expiry, and redacted result (Contract §6.2); unique constraints on
idempotency/correlation keys; atomic state transitions; append-only payment/consent evidence;
schema validation at the boundary; and an outbox/reconciliation worker so that a crash between two
writes is resolved by replay-and-reconcile instead of silent loss. These are follow-on
implementation seams (Contract §12.1), not current behavior.

**Outbox/reconciliation model.** State-changing operations write their outcome and the events they
must emit to durable storage in the same transaction (the outbox), and a worker publishes/retries
delivery separately. Consumers reconcile rather than assume: every ambiguous mutation is resolved
by `getOperationStatus`, authoritative resource reads, or verified events before the provider
reports success, failure, or charges again (Contract §5.5). Reconciliation continues until the
declared window closes; records still unresolved at window end are flagged for manual review with
their full correlation history — the shopper-facing status remains "verifying," never a false
success. The Phase 1 Northwind `generic.v1` test double is the validation vehicle for exactly
these semantics: it can inject stale versions, price changes, declines, timeouts, duplicates, and
redirect-only mode deterministically, and the conformance suite must show that repeated
confirmation with one key yields one logical payment/order effect (Contract §12; connector §9).

## 9. Redirect fallback checkout (Contract §11)

When the merchant profile cannot support `in_chat` — the typical Shopify-style hosted-commerce
shape (connector §3.1) — `createCheckoutSession` returns `mode: redirect` with a short-lived,
single-use, merchant-bound `continuationId` and an approved checkout URL. The sequence:

1. `reconcileCart` obtains current merchant lines, price, tax, shipping, delivery, version, and
   expiry (Contract §11 step 1).
2. The provider obtains explicit human confirmation against those values and records server-side
   consent (Contract §11 step 2; security §6).
3. `createCheckoutSession` returns `mode: redirect` with the continuation (Contract §11 step 3).
4. The widget emits `redirect-required`; the host opens the URL without appending any credential,
   token, or total (Contract §9.1).
5. The merchant checkout performs its native authentication, payment, and order flow.
6. The return route consumes the continuation once, validates merchant/session binding, and
   queries the adapter for checkout/payment/order status. A `success=true` query parameter is
   never proof (Contract §11 step 6).
7. The provider emits `order-confirmed` only after authoritative merchant/payment status or a
   verified webhook (Contract §11 step 7).

The continuation binds merchant, provider session, subject, cart/checkout reference, correlation
ID, and expiry server-side; it is single-use, invalidated on consumption or expiry, and carries no
raw identity/payment token, client total, or reusable authorization code (Contract §11). If
`checkout.redirect` is also unavailable, the provider returns `capability_not_supported` with a
merchant-host fallback action; it MUST NOT create a provider-owned order or charge anything
(Contract §4.1, §11). Redirect mode reuses the same operation state machine, idempotency, consent
binding, and reconciliation as in-chat checkout — only the payment surface changes.

## 10. Cross-references

- [`commerce-adapter-contract.md`](./commerce-adapter-contract.md) — normative operation surface,
  idempotency (§6), retry/timeout (§7), webhooks (§8), and hosted-checkout fallback (§11).
- [`commerce-security-identity.md`](./commerce-security-identity.md) — consent record contents and
  expiry/revocation (§6), server-side authorization checks (§5), threat model (§11).
- [`commerce-interoperability.md`](./commerce-interoperability.md) — Task 2 topology, ownership
  boundaries, gap register G-01..G-12.
- [`connector-strategy.md`](./connector-strategy.md) — capability-gap fallbacks (§7), the Phase 1
  Northwind `generic.v1` test double (§9), and fixture representativeness (§8).
- Phase 1 acceptance evidence and scenario selection are defined by the Phase 1 backlog task and
  are out of scope here.
