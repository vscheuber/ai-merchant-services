# Phase 1 Proof-of-Concept Slice

**Status:** Task 7 Phase 1 slice definition and integration/e2e acceptance evidence plan. This
document defines what the first implementation slice must demonstrate and how a reviewer verifies
it. It performs no implementation: every step marked **[Phase 1 build]** is a future seam, and no
behavior described here exists in the runtime today unless marked **[exists today]** with evidence.

**Scope:** One thin Northwind adapter/test double on the `generic.v1` profile (connector strategy
§9), one canonical contract, the current merchant-hosted overlay, the current chatbot-agent
backend, the existing merchant-IDP federation, one authorized loyalty lookup, discovery, an
ephemeral conversational cart, merchant-cart synchronization, explicit confirmation, a server-side
payment/order flow, and a demonstrable failure/fallback set. Test data, capability flags,
observability, acceptance evidence, and migration seams for future connectors are defined below.

This is a plan, not execution. No source, configuration, seed-data, or identity-provider change is
made by this task. The normative references cited as "Contract §n" are
[`commerce-adapter-contract.md`](./commerce-adapter-contract.md); the reliability rules are in
[`checkout-reliability.md`](./checkout-reliability.md); the identity and authorization controls are
in [`commerce-security-identity.md`](./commerce-security-identity.md).

## 1. Slice definition and boundary

### 1.1 What is in scope (bounded list)

| #   | Element                        | Selection and anchor                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | One adapter/test double        | Northwind merchant-hosted test double on the `generic.v1` profile, the Task 4 first-connector decision (connector strategy §9.1–§9.2). It is the only commerce path on the exercised chat route.                                                                                                             |
| 2   | One canonical contract         | `merchant-commerce-adapter/v1` exactly as normative in Contract §3–§8; no profile-specific surface leaks into the agent.                                                                                                                                                                                     |
| 3   | Current overlay                | The existing merchant-hosted `embed.js` widget on `northwind.mytest.run` (G-01 host integration is reused, not rebuilt).                                                                                                                                                                                     |
| 4   | Current chatbot-agent          | The existing BFF (`apps/chatbot-agent`), extended server-side with the adapter boundary (`apps/chatbot-agent/src/lib/commerce-adapter.ts`, Contract §12.1) — no vendor calls in the agent.                                                                                                                   |
| 5   | Existing identity federation   | The implemented silent-SSO/`merchant-token-login`/Step-2 agent-token exchange (security §4 Flows A/B-1/C), formalized as a server-derived, merchant-scoped shopper context.                                                                                                                                  |
| 6   | One authorized loyalty lookup  | One `GET`-class loyalty read for the signed-in shopper, field-minimized per security §7, subject-bound per the security §5.2 checks 5–7.                                                                                                                                                                     |
| 7   | Discovery                      | `searchCatalog`/`getProduct`/`checkAvailability` through the adapter with opaque `ResourceRef`s and pagination (Contract §5.1) — replacing the `data/products.json` prompt source on the exercised route (G-01, fixture F-04).                                                                               |
| 8   | Ephemeral conversational cart  | Server-side intent only: merchant refs, quantities, options, session, TTL (checkout reliability §2). Browser state remains a display projection.                                                                                                                                                             |
| 9   | Merchant-cart synchronization  | `createCart`/`reconcileCart`/`validateCart` with `If-Match`/`expectedVersion`, idempotency keys, and authoritative re-resolution before checkout (Contract §5.3, §6.1, §6.3).                                                                                                                                |
| 10  | Explicit confirmation          | Server-side consent record bound to subject, merchant, exact quote version, amount/currency, payment reference, nonce, expiry (security §6) — replacing the presence-only consent check (G-05, fixture F-09).                                                                                                |
| 11  | Server-side payment/order flow | Checkout session, provider-side `authorizePayment`/`capturePayment` with a server-bound payment reference and `consentRef`, then `createOrder`/`confirmOrder` per the double's declared profile (Contract §5.4) — replacing the provider-synthetic `captured` session on the chat path (G-04, fixture F-10). |
| 12  | Failure/fallback paths         | The six scenarios in §3: price change, decline, timeout/unknown, duplicate confirmation, redirect fallback, unsupported capability.                                                                                                                                                                          |
| 13  | Idempotency evidence record    | An operation/idempotency record in the double sufficient to prove repeated confirmation with one key yields one logical effect (Contract §6.1–§6.2) — a boundary test, not a production persistence implementation (checkout reliability §8).                                                                |

### 1.2 What is explicitly excluded (plan non-scope)

- Autonomous purchases; every purchase is shopper-initiated, reviewed, and confirmed.
- Multi-platform production connectors (Shopify-, SAP-, Oracle-style) and live vendor accounts.
- Provider-owned long-lived catalog/cart/order/loyalty storage.
- Arbitrary merchant-facing MCP exposure; MCP stays optional provider-internal plumbing.
- Raw PAN/CVV handling anywhere in the flow.
- Silently accepting changed merchant totals (no exception to checkout reliability §1 rule 2).
- Broad catalog/order migration, storefront web-checkout migration, and database migration: the
  storefront web checkout (`/cart`, `/checkout`) remains on its current path in Phase 1 and is a
  documented follow-on milestone (§10), which is also what makes it usable as a negative control
  in §2.3.
- No payment-processor integration, no webhook endpoint in `payment-api`, no production secret
  store: the double's credentials are fixture values.

### 1.3 Why this boundary

The riskiest unknown in the target architecture is not vendor translation — it is the canonical
boundary itself: authority, idempotent replay, consent binding, unknown-outcome reconciliation,
and fallback behavior (connector strategy §9.2). A merchant-hosted test double proves those
deterministically and injectably, where a vendor sandbox cannot; it is also the only style the
repository can host end-to-end today. Building the conformance-shaped boundary first prevents the
first connector from hardening into the product contract (connector risk R-C01) and keeps every
Phase 1 artifact reusable when a real connector replaces the double (§8).

## 2. End-to-end acceptance scenario

The happy path below is executable by a reviewer with the current demo environment plus the Phase 1
build. Step markers: **[exists today]** = verifiable in the current repository/runtime;
**[Phase 1 build]** = the seam this slice introduces. Phase numbers in parentheses refer to the
required sequence in checkout reliability §3: step 5 covers phases 1–2, steps 6–8 cover phase 2,
steps 9–10 cover phases 3–4, steps 11–13 cover phases 5–7, and steps 14–15 cover phase 8 (the §3
reconciler leg is covered by F-3's query-before-retry and the §5 declared polling source).

The scenario must make the security §5.2 authorization checks observable — §6.1 defines which of
them are evidenced at which step, so a reviewer can confirm authentication is not being treated as
authorization.

### 2.1 Preconditions and service startup **[exists today]**

1. `.env.local` present for all five apps; IDPs provisioned per
   [`getting-started.md`](./getting-started.md); demo user `ada.lovelace` / `Password1!`
   (merchant IDP, `bravo` realm label).
2. From the repo root:

   ```bash
   pnpm caddy:start
   pnpm dev:start
   pnpm dev:status
   pnpm caddy:status
   ```

3. Verify readiness: `https://northwind.mytest.run` renders the storefront;
   `https://payments.mytestrun.com/api/health` returns
   `{"status":"ok","service":"payment-api"}`. (Equivalent direct ports: storefront `localhost:3000`,
   chatbot agent `localhost:3004` / `payments.mytestrun.com/chatbot`.)
4. Open log tails for evidence capture: `logs/chatbot-agent.log`, `logs/payment-api.log`,
   `logs/merchant-web.log`, plus the test double's log (§6).

### 2.2 Scenario steps

| #   | Step                             | What the reviewer does and observes                                                                                                                                                                                                                                                                                                                                                 | Status                                                                                                                                                                  |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Shopper login via merchant IDP   | Open `https://northwind.mytest.run`, click **Sign in**, authenticate as `ada.lovelace` at the merchant IDP (`idc.mytest.run`). Land authenticated on the storefront.                                                                                                                                                                                                                | [exists today]                                                                                                                                                          |
| 2   | Widget open + silent SSO         | Open the **Acme Assist** widget (bottom-right, injected by `embed.js`). No visible login appears: the popup `prompt=none` + PKCE silent flow succeeds against the `merchant-bridge` public client.                                                                                                                                                                                  | [exists today]                                                                                                                                                          |
| 3   | Server-side bridge + agent token | Send any message. Logs show the server-side `merchant-token-login` journey (merchant ID token validated against Northwind's trusted-issuer config, JIT subject correlation on `custom_merchantId` + `custom_merchantCustomerId`), then the Step-2 RFC 8693 exchange with `audience=payment-api` and `act.sub=northwind-chatbot-agent`.                                              | [exists today] (flow) / [Phase 1 build] (browser retains only an opaque short-lived session handle; the widget-cached merchant ID token, G-08, is removed on this path) |
| 4   | Catalog discovery                | Ask: "Find me a laptop." The BFF calls adapter `searchCatalog`; the reply shows merchant-resolved summaries with opaque refs. The system prompt no longer embeds `data/products.json` rows on this route (G-01/F-04 removal). Adapter log shows the operation with `X-Merchant-Id: northwind` and the correlation ID.                                                               | [Phase 1 build]                                                                                                                                                         |
| 5   | Cart proposal (ephemeral intent) | Ask to add the **Aero 14** (`NW-LP-14-SILVER`) and a **Pulse X7** (`NW-PH-X7`). The BFF stores intent server-side (refs, quantities, session, TTL). The widget renders a `cart-proposed` display projection.                                                                                                                                                                        | [Phase 1 build] (intent) / [exists today] (widget surface)                                                                                                              |
| 6   | Merchant-cart synchronization    | The BFF creates/reconciles the Northwind cart via the adapter (`reconcileCart`, idempotency key, `If-Match`). The double resolves authoritative lines at request time — Ada's member price on the Pulse X7 comes from the merchant quote, not from field sniffing (F-02 correction) — and returns cart handle + `version` + `expiresAt`.                                            | [Phase 1 build]                                                                                                                                                         |
| 7   | Authorized loyalty lookup        | The conversation shows Ada's loyalty effect (gold, 2,500 points display state). The lookup is one authorized, subject-bound, field-minimized read through the merchant-scoped capability (security §5.2 checks 5–7, §7); redemption enters only as a merchant quote/cart input.                                                                                                     | [exists today] (lookup exists, caller-supplied selectors) / [Phase 1 build] (subject-bound, field-minimized)                                                            |
| 8   | Review                           | The widget shows merchant-resolved lines, tax/shipping, total, quote expiry, loyalty effect, and the payment method summary (`visa •••• 4242`). Amounts come only from the quote with `sourceVersion`/`expiresAt`.                                                                                                                                                                  | [Phase 1 build]                                                                                                                                                         |
| 9   | Explicit confirmation            | The shopper clicks **Confirm & pay**. The BFF records a server-side consent record: subject, merchant, exact quote version, amount/currency, payment reference, consent text version, server-observed timestamp, expiry, single-use nonce, correlation ID (security §6). The client timestamp is advisory.                                                                          | [Phase 1 build] (replaces presence-only consent, G-05)                                                                                                                  |
| 10  | Merchant revalidation            | The BFF calls `validateCart` with `If-Match` = the consented version before any charge. No delta → proceed; any delta → §3 F-1 behavior.                                                                                                                                                                                                                                            | [Phase 1 build]                                                                                                                                                         |
| 11  | Checkout session                 | `createCheckoutSession` (idempotency key, expected version) returns `checkoutRef`, `mode: in_chat`, permitted methods, final amount/version, `expiresAt`.                                                                                                                                                                                                                           | [Phase 1 build]                                                                                                                                                         |
| 12  | Server-side payment              | `authorizePayment` bound to the checkout reference, exact authoritative amount/currency, subject, `consentRef`, idempotency key; capture follows per the double's declared profile. `PaymentData.status` reaches `captured` only from the authoritative result. The adapter and double see only the server-bound payment reference — never PAN or provider secrets (Contract §5.4). | [Phase 1 build] (replaces provider-local recomputation on the chat path, G-04/F-07)                                                                                     |
| 13  | Order confirmation               | `createOrder`/`confirmOrder` (payment-before-order profile, declared by the double) returns the merchant order reference with `OrderData.status = confirmed`. Only now does the widget emit `order-confirmed` (checkout reliability §3 phase 8).                                                                                                                                    | [Phase 1 build]                                                                                                                                                         |
| 14  | Receipt                          | The widget shows a safe receipt: merchant order ref, `visa •••• 4242`, total as charged by the merchant, correlation ID.                                                                                                                                                                                                                                                            | [Phase 1 build]                                                                                                                                                         |
| 15  | Cross-checks                     | Storefront `/cart` and `/checkout` still run on the browser-local snapshot (unchanged current behavior) and were never consulted by the chat purchase; the order exists in the double's merchant ledger, not as a provider-synthetic session. `payment-api` local `transactions.json` is not the exercised record for this purchase.                                                | [exists today] (storefront surfaces) / [Phase 1 build] (chat-path authority change)                                                                                     |

### 2.3 The browser-state authority proof (AC-2)

Two cheap, decisive checks inside the same session:

1. **Projection is display-only.** After step 5, edit the browser-local
   `acme-cart:northwind` entry in devtools — set the Aero 14 `unitPrice` to `0.01`, or clear the
   key entirely. The chat checkout at steps 8–14 is unaffected: displayed and charged amounts are
   the merchant quote values, and clearing the projection does not break the flow. Browser state
   carried captured prices (G-03) and would have driven the old checkout; the adapter-resolved
   quote is the only authority here.
2. **The storefront checkout is the counterexample.** In a second tab, add the same SKU to the
   storefront cart and open `/checkout`: the form computes its total from browser snapshots
   (`checkout-form.tsx`) and posts a client-built cart — current behavior, deliberately not
   migrated in Phase 1 (§1.2). The reviewer sees both surfaces side by side: the chat path
   revalidates against merchant truth; the web path still trusts the snapshot. This contrast is
   the demonstration that browser-local state is not authoritative and that synchronization is
   what the chat path adds.

## 3. Failure-path scenario set

Every scenario reuses the §2 setup to the point of review. Injection is a per-merchant control
surface in the test double (fixture flags, §4) — no provider code knows the injection exists, which
is itself part of the evidence. Expected evidence is the observable, greppable record, not error
copy.

| ID  | Scenario                                    | Injection mechanism (in the double)                                                                                                                                                                    | Required observable evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1 | Price change requiring fresh consent        | Flag `inject.priceChange: NW-LP-14-SILVER` → next `validateCart`/`reconcileCart` returns `price_changed` (`409`), new unit price `1399.00`, `changedFields: ["price"]`                                 | Consent→charge gap holds: operation pauses after step 9; widget shows exact old ($1,299.00) vs new ($1,399.00); no payment record exists for correlation v1; fresh consent record v2 bound to the new version; payment (if the shopper re-confirms) is one effect at the new amount — never a silent charge of the delta                                                                                      |
| F-2 | Payment decline                             | Flag `inject.paymentOutcome: declined` → `authorizePayment` returns `PaymentData.status = declined` (`402`/`422 payment_declined`)                                                                     | Terminal `failed` operation; zero order records for the correlation ID; one declined payment effect in the double's ledger; widget offers an approved alternative method; a retry with a different method is a new consent + new idempotency key (a new logical operation), never a blind same-key re-charge                                                                                                  |
| F-3 | Timeout/unknown with query-before-retry     | Flag `inject.paymentOutcome: timeout_unknown` → the double accepts the mutation, delays past the deadline, then returns `operation_unknown`/`adapter_timeout` (`504`/`202`) with `operationId`         | Widget shows "Verifying — do not resubmit"; the BFF reconciles via `getOperationStatus` **with the same idempotency key** (key echo in both logs); the double's key→result map returns the original outcome (e.g. `captured`); final state resolves from that authoritative answer; the ledger contains exactly one captured effect despite the client-side retry                                             |
| F-4 | Duplicate confirmation → one logical effect | Flag `inject.duplicateWindowMs: 4000` (holds the first response open) then double-click **Confirm & pay** / race two confirmations                                                                     | Both submissions carry the same idempotency key and converge on one in-progress operation; one payment + one order in the ledger; the second response returns the original result. Negative variant: same key, different body → `409 idempotency_key_reused` and no second effect                                                                                                                             |
| F-5 | Redirect fallback (Contract §11)            | Flag `inject.checkoutMode: redirect` → `createCheckoutSession` returns `mode: redirect`, single-use `continuationId`, Northwind storefront checkout URL as the hosted-checkout stand-in                | Widget emits `redirect-required`; the opened URL carries no token, credential, or total; the shopper completes the native checkout; the return route consumes the continuation exactly once (a second navigation fails single-use validation) and reconciles via `getCheckoutSession`/`getOrder` — `success=true` in the query string is never proof; `order-confirmed` fires only after authoritative status |
| F-6 | Unsupported capability → host fallback      | Flag `inject.disableCheckout: true` (capability document reports `checkout.create: unsupported`) → `createCheckoutSession` returns `501 capability_not_supported` with a merchant-host fallback action | No provider-owned order or charge is created; the widget surfaces the host fallback action; the capability error is canonical (`code`, `category`, `retryable: false`) with redacted details                                                                                                                                                                                                                  |

F-1..F-6 map to the checkout reliability §7 failure-mode rows and together satisfy AC-3; the
§2.2/§3 combination is the Contract §12 conformance evidence for the double. `requires_action`
challenge handling is exercised optionally (flag `inject.paymentOutcome: requires_action`) but is
not required for Phase 1 acceptance.

## 4. Test data plan

**Seeded from existing `data/` fixtures (no schema change needed):**

| Fixture                                      | Used by the double for                                                                                                                                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/products.json` (Northwind `NW-*` SKUs) | Merchant catalog for `searchCatalog`/`getProduct`/`checkAvailability`; `stock` becomes availability; `membersOnly`/`memberPrice` becomes quote-time customer-group pricing resolved inside `quoteCart` (F-02 correction), never a caller-side field |
| `data/merchants.json`                        | Merchant registry entry for `northwind` scope validation (`X-Merchant-Id`)                                                                                                                                                                          |
| `data/users.json` (`ada.lovelace`)           | Merchant customer record behind the server-derived subject correlation                                                                                                                                                                              |
| `data/loyalty.json` (Ada: 2,500 pts, gold)   | The one authorized `loyalty.lookup` fixture                                                                                                                                                                                                         |
| `data/wallet-cards.json` (visa `•••• 4242`)  | Provider-side payment references — these stay in the payment domain and are never sent to the adapter or the browser beyond the last-four display summary                                                                                           |

**Must be added by Phase 1** (a new adapter fixture area colocated with the double; exact location
follows the §8 package-boundary decision):

- Per-product opaque `ResourceRef` mappings and version counters (native SKU IDs stay
  adapter-internal per connector strategy §6 rule 1).
- Quote/cart/checkout/order records carrying `version`, RFC 3339 `expiresAt`, and the Contract
  §3.3 domain status enums (`CartData`, `QuoteData`, `CheckoutData`, `PaymentData`, `OrderData`).
- Failure-injection control surface: `priceChange`, `inventoryChange`, `paymentOutcome`
  (`captured | declined | timeout_unknown | requires_action`), `checkoutMode`
  (`in_chat | redirect`), `disableCheckout`, `duplicateWindowMs` — resettable per scenario.
- Idempotency key → result store honoring the Contract §6.1 rules (identical retry returns the
  original result; same-key/different-body → `409`) with a declared reconciliation window.
- Server-side consent and operation record storage in the BFF per Contract §6.2 and security §6
  (ephemeral in-memory is acceptable for Phase 1 and is listed as not proven, §9).
- A cross-merchant negative fixture is already present: Contoso SKUs must fail closed with
  `resource_forbidden` when referenced from the Northwind context (security §5.4).

## 5. Capability flags (the double's capability document)

The double publishes `GET /v1/capabilities` per Contract §4.1: an explicit entry for every
canonical capability, each with `status` (`supported`/`limited`/`unsupported`) and `mode`
(`sync`/`async`/`none`), so conformance is judged against the full set (connector strategy §2).
Excerpt (non-normative shape; the full schema is the Contract §4.1 document):

- `supported`: `capability.discovery`, `catalog.search`, `catalog.product`,
  `catalog.availability`, `commerce.quote` (`maxTtlSeconds: 300`), `cart.*` with
  `optimisticConcurrency: true`, `checkout.create` (`in_chat`), `checkout.redirect` (single-use),
  `checkout.read`, `checkout.cancel`, `payment.authorize`/`payment.capture` (`async`,
  test payment reference only), `order.create`/`order.confirm`/`order.read` (payment-before-order
  profile declared), `operation.status`, `customer.lookup` (`requiresSubject: true`).
- **`limited` (at least one, enforced by the provider):**
  - `loyalty.lookup`: `limited`, `scopes: ["loyalty.read"]`, `requiresSubject: true` — projection
    allowlisted to display name/tier/points; a request beyond the projection is a field-policy
    error, never silent expansion (security §7, Contract §10).
  - `events.webhook`: `limited` — Phase 1 reconciliation runs on `getOperationStatus`/resource
    reads (a declared polling/reconciliation source, connector strategy §3.4 and §7); a
    deterministic test-signature HMAC profile is declared for the conformance suite's event
    verification cases, not required by the §2/§3 scenarios.
- **`unsupported` (at least one, exercised for the `501` path):** `fulfillment.status` — Phase 1
  does not demonstrate the fulfillment lifecycle; calling it MUST return
  `501 capability_not_supported` (F-6 family) rather than being silently emulated.
- `limits`: `maxPageSize: 50`, `defaultTimeoutMs: 5000`, `maxTimeoutMs: 30000`;
  `supportedCurrencies: ["USD"]`, `supportedLocales: ["en-US"]`.

Capability metadata carries `meta.expiresAt`; the provider refreshes it after expiry, double
configuration changes, or a capability error (Contract §4).

## 6. Observability and evidence capture

- **Correlation IDs.** One correlation ID per logical shopper operation, generated at the
  widget/BFF boundary and threaded through BFF → adapter → double → payment → logs (Contract
  §3.2, §6.2). Every §2/§3 step names its correlation ID in the evidence; `operationId` is
  adapter-generated per mutation and echoed everywhere.
- **Operation records.** The BFF and the double record per-mutation state per Contract §6.2:
  merchant scope, operation family, idempotency key **hash** (never the raw key), correlation ID,
  subject/agent references, input digest, expected version, state, merchant resource references,
  payment reference, attempt count, deadline, expiry, redacted result. These records are the
  duplicate-effect evidence for F-3/F-4.
- **Token trace redaction.** Any trace fragments written during the scenarios must be redacted at
  construction time (security §8, Contract §10): no raw merchant/provider tokens, codes,
  verifiers, or secrets; correlation and operation IDs and merchant scope are expected. The
  acceptance evidence includes a grep over traces proving no raw token material appears. The
  unauthenticated trace route itself is the recorded gap G-11 and is not part of the acceptance
  path.
- **Log evidence.** Per service: `logs/chatbot-agent.log` (journey outcomes, Step-2 exchange
  audience/scope, adapter operation codes), `logs/payment-api.log` (payment authorization results),
  the double's log (capability reads, cart/checkout/payment/order operations, injected errors,
  idempotency resolutions), `logs/merchant-web.log` (host events). The §3 scenarios each list
  which of these to grep.
- **No-secret surfaces.** Widget state, model prompts, URLs, referrers, and Problem Details follow
  security §8 and Contract §10; the browser evidence check (AC-5) is a devtools inspection of
  `localStorage`/`sessionStorage`/network payloads during steps 8–14.

### 6.1 Which §5.2 checks are observable at which step

Phase 1 proves the checks on the exercised loyalty and checkout paths; the §2.2 steps that evidence
each are listed. A denial must be distinguishable by the failed check number in logs (security §10).

| Security §5.2 check                    | Observable at                        | Evidence                                                                                                                                    |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–3 token validity / issuer / audience | Step 3, every BFF→`payment-api` call | Step-2 exchange log binds `audience=payment-api`; an inactive or wrong-issuer token yields `401` before any handler logic                   |
| 4 required scope                       | Steps 7, 12                          | Loyalty read requires the loyalty scope; checkout requires the checkout scope; missing scope → `403 authorization_failed`                   |
| 5 agent identity                       | Steps 3–13                           | `act.sub` = `northwind-chatbot-agent` in the exchange log; a bare client-credentials token is rejected for subject-scoped routes            |
| 6 effective subject                    | Steps 7, 12                          | `userId` selectors on the exercised routes match the server-derived subject; a mismatched one → `403`, never an independent selector        |
| 7 merchant binding + object ownership  | Steps 4–7, 10–13                     | `X-Merchant-Id: northwind` matches the token's merchant claim; a Contoso SKU reference → `403 resource_forbidden` (fail closed, no probing) |
| 8 consent + idempotency                | Steps 9–12                           | Exact-match single-use consent record before charge (F-1 pause proves version binding); F-3/F-4 prove same-key idempotency rules            |

## 7. Acceptance evidence checklist

| AC (plan Task 7)                                                                                          | Proof                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer executes one end-to-end authenticated, consented, merchant-authoritative purchase                | §2.1–§2.2 steps 1–14 completed once, with the §6 log evidence for each step                                                                          |
| Browser-local state is not authoritative; synchronization/revalidation demonstrated                       | §2.3 checks 1–2; step 6/10 `If-Match` records in the double's log                                                                                    |
| A changed-price/inventory, decline, timeout/unknown, or redirect fallback is demonstrable                 | §3 F-1 through F-5 each executed once with their evidence rows                                                                                       |
| Repeated confirmation with the same idempotency key yields one logical effect                             | §3 F-4 (converge-on-one) and F-3 (query-before-retry, same key), backed by operation records                                                         |
| No merchant credential, payment secret, raw identity token, or authoritative total exposed to the browser | Devtools inspection during steps 8–14: widget state holds only display-safe values and the opaque session handle; §6 redaction grep over traces/logs |
| Phase 1 exclusions and follow-on milestones listed                                                        | §1.2 exclusions; §10 milestones                                                                                                                      |

## 8. Migration seams for future connectors

- **Contract-stable swap point.** A real connector replaces the double by changing the merchant
  integration manifest (Contract §4.2): `adapterEndpoint`, auth scheme/`secretReference`, scopes,
  capability overrides, webhook profile. `chatbot-agent` and the widget are unchanged — that
  invariance is the proof the boundary is real (connector strategy §9.2 point 5).
- **Package boundary (decision to validate, not create).** Per connector strategy §9.4, before
  implementation validate: (a) the adapter/test-double workspace package location (e.g.
  `apps/merchant-adapters/` vs `packages/`), (b) merchant-hosted vs provider-hosted hosting for
  the double (Contract §9 permits both; the choice affects deployment, secrets, and network path),
  and (c) how the double shares schemas with `packages/shared/src/types/commerce.ts` (Contract
  §12.1) without coupling merchant code to provider runtime. Phase 1 evidence must not depend on
  the choice; this document assumes only that the double implements the canonical contract at an
  authenticated server-to-server endpoint.
- **Provider-side seams.** `packages/shared/src/types/commerce.ts` for versioned
  request/response/error/event types; `apps/chatbot-agent/src/lib/commerce-adapter.ts` as the
  capability-enforcing provider boundary; server-side consent/operation storage per Contract §6.2
  (ephemeral in Phase 1, durable per milestone §10.1). Existing `packages/shared/src/types/cart.ts`
  and `checkout.ts` remain POC scaffolds pending reconciliation (Contract §12.1).
- **Exercised-path migration.** Phase 1 removes the direct provider-catalog prompt source and the
  direct payment-api checkout call from the chat path only (G-01/G-04 on that route). The
  merchant-web catalog proxy and storefront checkout keep their current paths until the §10
  milestone, so the demo environment keeps working throughout.
- **Conformance continuity.** The Contract §12 conformance suite runs against this double first
  and is then re-run, parameterized by profile, against each future connector (connector strategy
  §9.3) — the double's fixtures and injection flags become the suite's first target profile.

## 9. Not proven by Phase 1

- Any vendor capability: Shopify, SAP Commerce, Oracle Commerce, or any other platform supports
  nothing because the double passes (Contract §12 closing rule).
- Production persistence: the double's ledger and the in-memory consent/operation state have no
  durable storage, unique constraints, or crash recovery (G-10); duplicate-effect evidence is a
  boundary demonstration, not a durability guarantee.
- A real payment processor: payment outcomes are double-injected test references; no processor
  integration, challenge network, or settlement behavior is exercised.
- Webhook infrastructure at production fidelity: no real event delivery, retry/dead-letter under
  load, or out-of-order streams at scale; the reconciliation window and ordering rules are
  exercised only via the fixture.
- Full §5.2 authorization enforcement across every route class: Phase 1 proves the observable
  checks for the exercised loyalty/checkout routes; other route classes remain on the current
  profile until the §10 milestone.
- Sender-constrained browser artifacts (DPoP/mTLS), multi-instance session state, rate-limit
  realism against conversational burst traffic, locale/currency breadth, and performance.
- Autonomous purchases, multi-merchant production onboarding, and any raw-PAN path — excluded by
  design (§1.2).

## 10. Follow-on milestones after Phase 1

1. Durable operation/idempotency/consent storage with unique constraints, atomic transitions, and
   an outbox/reconciliation worker (checkout reliability §8; gap G-10).
2. `payment-api` middleware §5.2 checks (audience, scope, agent, subject, merchant, object
   ownership) across all route classes (security §12; gaps G-06/G-07).
3. Opaque, short-lived, audience-bound BFF session artifact replacing the widget-held merchant ID
   token (security §12; gap G-08) and merchant-origin-specific CORS (G-09).
4. A Shopify-style redirect-heavy profile as the second test double, then SAP-/Oracle-style
   profiles once the conformance suite is parameterized by profile (connector strategy §9.3).
5. Adapter-backed merchant catalog path replacing the provider product route for the storefront
   (G-01 full resolution), and migration of the storefront web checkout onto the synchronized
   cart/checkout flow (retiring the browser-authoritative `checkout-form.tsx` path).
6. Merchant onboarding manifest, secret-manager integration, and credential rotation lifecycle
   (Contract §4.2, §9.3; gap G-12).
7. Webhook gateway productionization: signature profiles, replay windows, dedupe storage,
   dead-letter handling (Contract §8; connector strategy §8 F-15).
8. DPoP/sender-constraint assessment for browser→BFF artifacts (security §4.5).

## 11. Cross-references

- [`commerce-interoperability.md`](./commerce-interoperability.md) — target architecture, trust
  topology, and gap register G-01..G-12 that this slice is scoped against.
- [`commerce-adapter-contract.md`](./commerce-adapter-contract.md) — normative operation surface
  (§5), capability document (§4.1), idempotency (§6), errors (§7), redirect fallback (§11),
  conformance (§12).
- [`connector-strategy.md`](./connector-strategy.md) — first-connector decision (§9), fixture
  representativeness (§8), capability-gap fallbacks (§7).
- [`checkout-reliability.md`](./checkout-reliability.md) — purchase sequence (§3), state machine
  (§4), failure modes (§7), redirect fallback (§9).
- [`commerce-security-identity.md`](./commerce-security-identity.md) — authorization matrix (§5),
  consent record (§6), minimization (§7), non-secret handling (§8).
- [`demo-walkthrough.md`](./demo-walkthrough.md) and [`getting-started.md`](./getting-started.md) —
  the demo environment (services, URLs, users) the scenario runs in.
