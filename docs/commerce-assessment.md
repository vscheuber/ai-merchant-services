# Commerce Interoperability Assessment

**Status:** Task 8 consolidated review-ready assessment. This document consolidates the Task 1–7
artifacts into a single reviewable package: the recommendation, the requirements traceability
checklist, the decision log, the ordered migration backlog, the consolidated risk register and
open validation questions, the reviewer checklist, and the explicit non-claims. It introduces no
new normative content — every section here summarizes and links an artifact that defines the
detail. Nothing described as a target is implemented in the runtime today.

## 1. Executive summary

**Recommendation.** The payment provider owns a reusable, merchant-subscribed chatbot product
delivered as a merchant-hosted thin integration (a versioned script/SDK overlay plus a provider
BFF), backed by the platform-neutral **`merchant-commerce-adapter/v1` Merchant Commerce Adapter
contract**. The merchant commerce platform remains the authoritative system of record for catalog,
availability, pricing, promotions, customer/account, loyalty, tax, shipping, checkout, order, and
fulfillment. The provider keeps only a short-lived, non-authoritative conversational cart (merchant
references, quantities, options, TTL), synchronizes it into the merchant's authoritative cart, and
revalidates every commercial value against merchant truth immediately before explicit,
server-recorded human consent. Checkout, payment authorization, and order confirmation are
server-authoritative; capability gaps produce a declared fallback (hosted-checkout redirect or a
host action), never a best-effort charge. MCP stays optional provider-internal plumbing, never the
merchant contract.

**Current state.** The repository POC proves the identity-binding and consent-UX patterns (silent
SSO/PKCE, server-side merchant-token bridge, RFC 8693 agent exchange, explicit confirm UI) but its
commerce path is provider-local: local catalog JSON in the model prompt, a browser-local cart with
captured prices, and a checkout that recomputes totals from provider seed data into a
provider-synthetic transaction. Gap register G-01..G-12 in
[`commerce-interoperability.md`](./commerce-interoperability.md) records this precisely and
distinguishes current evidence from target architecture.

**Phase 1.** Validate the boundary — not a vendor — with one Northwind merchant-hosted test double
on the `generic.v1` profile, one canonical contract, the current overlay and BFF, the existing
identity federation, one authorized loyalty lookup, discovery, cart synchronization, explicit
consent, one server-side payment/order flow, and six injectable failure paths
([`phase1-poc-slice.md`](./phase1-poc-slice.md)).

**Migration shape.** Move from the local catalog/direct payment calls toward (1) adapter-backed
catalog and merchant cart, (2) server-side checkout/order/payment orchestration, (3) durable
idempotency/reconciliation, (4) connector conformance, and (5) expanded merchant onboarding — with
identity/authorization enforcement sequenced alongside (§4 below).

### Document map (Tasks 1–7 artifacts)

| Task | Artifact (authoritative for)                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [`commerce-interoperability.md`](./commerce-interoperability.md) — current-state evidence baseline, gap register G-01..G-12                                                                                                                                 |
| 2    | [`commerce-interoperability.md`](./commerce-interoperability.md) — target architecture decision, ownership/trust topology, rejected alternatives, MCP role                                                                                                  |
| 3    | [`commerce-adapter-contract.md`](./commerce-adapter-contract.md) + [`commerce-adapter-openapi.json`](./commerce-adapter-openapi.json) + [`commerce-adapter-schemas.json`](./commerce-adapter-schemas.json) — normative contract, machine-readable artifacts |
| 4    | [`connector-strategy.md`](./connector-strategy.md) — platform-style profiles, canonical mapping, capability-gap fallbacks, first-connector decision                                                                                                         |
| 5    | [`commerce-security-identity.md`](./commerce-security-identity.md) — trust topology, token flows, authorization matrix, consent record, minimization, threat model                                                                                          |
| 6    | [`checkout-reliability.md`](./checkout-reliability.md) — invariants, purchase sequence, state machine, idempotency/concurrency/expiry, webhooks, redirect fallback                                                                                          |
| 7    | [`phase1-poc-slice.md`](./phase1-poc-slice.md) — Phase 1 slice, acceptance scenario, failure-path set, evidence plan, follow-on milestones                                                                                                                  |
| 8    | This document — consolidation, traceability, migration backlog, risks, review checklist                                                                                                                                                                     |

### Architecture coverage index (review AC)

The eight architecture areas the review acceptance criteria name, each mapped to the artifact
that defines it:

| Area                            | Where it is specified                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| System-of-record boundary       | interoperability (ownership table, rejected alternatives); contract §2                                   |
| Local-cart synchronization      | checkout reliability §2–§3; interoperability (cart authority); phase 1 slice §2.2 steps 5–6, §2.3        |
| Canonical adapter contract      | contract §1–§12; openapi.json + schemas.json                                                             |
| Identity/payment security       | security §2–§11; contract §3.2, §9.4; phase 1 slice §6.1                                                 |
| Failure recovery                | checkout reliability §4, §5, §7; phase 1 slice §3 (F-1..F-6)                                             |
| Fallback checkout               | contract §11; checkout reliability §9; connector strategy §7; phase 1 slice F-5/F-6                      |
| Webhook/idempotency             | contract §6, §8; checkout reliability §5–§6, §8; phase 1 slice §5 (capabilities), §6 (operation records) |
| Shopify/SAP/Oracle implications | connector strategy §3–§7; requirements §8 sources (to-be-validated claims)                               |

Each index row is design coverage, not implementation: the corresponding migration stages in §4
that turn design into behavior are noted in §2 and in the gap list below.

## 2. Requirements coverage checklist

### 2.1 Requirements sections

Traceability of every numbered section of
[`requirements.md`](../.polaris/merchant-chatbot-ecommerce-interoperability/requirements.md).
Coverage status means the target requirement is specified in the named artifact; all target
coverage is design-only until the corresponding migration stage lands (§4).

| Req §           | Requirement (summary)                                                                                                                                                                                            | Covered by (artifact §)                                                                                                                                             | Notes                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1               | Purpose and outcome: reusable subscribed chatbot, merchant authority, provider trust/payment authority, cross-platform, Phase 1 demonstrable                                                                     | interoperability (decision); connector strategy (§1–§3); phase 1 slice (§1)                                                                                         | Covered                                                                                                                  |
| 2.1             | Ownership boundary: provider owns runtime/integration/identity/agent-authz/payment/consent/adapter lifecycle; merchant SOR; no second long-lived SOR                                                             | interoperability (ownership table, rejected alternatives); contract §2, §9.4                                                                                        | Covered                                                                                                                  |
| 2.2             | Trust boundary: secrets/tokens server-side; opaque short-lived session artifact; browser/model never payment authorization; server-derived identity                                                              | security §2, §8; contract §2, §3.2                                                                                                                                  | Covered (G-08/G-09 record the current violations; replacement is stage M5)                                               |
| 3               | Target topology: host, provider BFF, adapter, payment orchestrator, merchant platform, event gateway; widget/model cannot call merchant APIs directly                                                            | interoperability (trust topology + request sequence); checkout reliability §3                                                                                       | Covered                                                                                                                  |
| 4.1             | Required adapter capabilities (discovery, catalog, product, availability, quote, customer/loyalty, cart lifecycle, checkout session, payment, order, fulfillment, webhooks)                                      | contract §4.1, §5; openapi.json operation IDs; schemas.json                                                                                                         | Covered                                                                                                                  |
| 4.2             | Error and capability model: correlation ID on every response; eight failure classes; opaque IDs/versions; capability flags incl. in-chat payment, redirect, lookup, quote, order confirmation, events            | contract §4.1, §7.1; schemas (Problem Details extensions)                                                                                                           | Covered                                                                                                                  |
| 4.3             | Why an adapter rather than a provider-owned cart; ephemeral conversational-cart rules; cache freshness bound                                                                                                     | interoperability (cart authority, rejected alternatives); checkout reliability §2, §6.4                                                                             | Covered                                                                                                                  |
| NFR 1           | Security and least privilege (TLS, scoped credentials, audience/resource, short-lived tokens, tenant isolation)                                                                                                  | security §2, §4.4, §5, §9; contract §9.3–§9.4                                                                                                                       | Covered (design; enforcement is M5/M7)                                                                                   |
| NFR 2           | Confidentiality and minimization; widget ID-token caching replaced                                                                                                                                               | security §7, §8; phase 1 slice (§2.2 step 3, AC-5)                                                                                                                  | Covered as target; current behavior is the recorded gap G-08                                                             |
| NFR 3           | Tenant isolation: everything merchant-scoped; cross-merchant fails closed                                                                                                                                        | security §5.2 check 7, §5.4; contract §7.1 `resource_forbidden`                                                                                                     | Covered (design)                                                                                                         |
| NFR 4           | Integrity and canonicalization: runtime validation; model values never authoritative                                                                                                                             | contract §2.1 (client-authoritative prohibition), §3.3 schemas; security §8                                                                                         | Covered (design); current chat-route cast is evidence G-01/G-05                                                          |
| NFR 5           | Availability and resilience: bounded timeouts/retries, circuit breaking, reconciliation                                                                                                                          | contract §7.2–§7.3; checkout reliability §1, §7                                                                                                                     | Covered                                                                                                                  |
| NFR 6           | Concurrency: version/ETag optimistic concurrency; transactional/atomic provider persistence                                                                                                                      | contract §6.3; checkout reliability §5, §8; phase 1 slice §10.1                                                                                                     | Covered as target; current JSON store is gap G-10                                                                        |
| NFR 7           | Auditability: correlation-threaded, redacted audit evidence                                                                                                                                                      | security §10; contract §6.2, §10                                                                                                                                    | Covered (design); trace route gap G-11                                                                                   |
| NFR 8           | Interoperability: machine-readable OpenAPI/JSON Schema, version negotiation, generated contract tests                                                                                                            | contract §3.1 (artifacts), §12; openapi.json + schemas.json exist                                                                                                   | Covered                                                                                                                  |
| NFR 9           | User experience: guest browsing; actionable login path; understandable, confirmed changes                                                                                                                        | security §5.4 (guest row); contract §9.1 events; phase 1 slice §2                                                                                                   | Covered                                                                                                                  |
| NFR 10          | Origin and browser safety: origins derived from onboarding, not `*`                                                                                                                                              | security §8 (messaging/origin rules); contract §9.1; gap G-09 records current wildcard CORS                                                                         | Covered as target                                                                                                        |
| NFR 11          | Observability and privacy: authenticated operator views, redaction, retention, multi-instance                                                                                                                    | security §8, §10; phase 1 slice §6                                                                                                                                  | Covered as target; gap G-11                                                                                              |
| NFR 12          | Versioning and rollout: SDK/contract/schema/event/consent versioning, backward-compatible window                                                                                                                 | contract §3.1 (version negotiation, compatibility rules); connector strategy §6.6 (extension governance)                                                            | Covered                                                                                                                  |
| NFR 13          | Testing: the enumerated automated coverage list                                                                                                                                                                  | contract §12 (conformance); phase 1 slice §2–§3, §8 (scenarios + suite)                                                                                             | **Partial** — specified and planned; no meaningful automated suite exists in the repo today (§2.5)                       |
| 5               | Identity, delegation, authorization (OIDC/PKCE, server-side exchange, RFC 8693 constraints, API checks, DPoP, correlation, loyalty minimization, PAR/JAR)                                                        | security §4 (Flows A/B/C, §4.4 table), §5, §7; contract §3.2 `SubjectContext`                                                                                       | Covered (design; enforcement is M5/M7; DPoP assessment is M10)                                                           |
| 6               | Minimum merchant integration surface (frontend SDK/events, backend adapter APIs, credentials/scopes, webhooks, idempotency/concurrency)                                                                          | contract §9.1–§9.4, §8, §6                                                                                                                                          | Covered                                                                                                                  |
| 6.1             | Frontend SDK and events (versioned script, public config, origin-checked handshake, 8 host events, no secrets in frontend config, fallback, exact-origin/nonce postMessage)                                      | contract §9.1 (event table, postMessage rules); security §8                                                                                                         | Covered                                                                                                                  |
| 6.2             | Backend adapter APIs (authenticated calls for catalog/cart/checkout/order/customer/events; timeouts, bounded retries, structured errors, correlation, schema versioning)                                         | contract §9.2, §3.2, §7                                                                                                                                             | Covered                                                                                                                  |
| 6.3             | Credentials and scopes (server-side least privilege; per-capability manifest scopes; disablement without uninstall)                                                                                              | contract §4.2, §9.3; security §7, §9                                                                                                                                | Covered (lifecycle mechanics are stage M10)                                                                              |
| 6.4             | Webhooks/events (signed where supported; product/price, inventory, cart/checkout, order, fulfillment; signature+timestamp validation, replay rejection, event-ID dedupe, ordering metadata, retry/dead-letter)   | contract §8; checkout reliability §6                                                                                                                                | Covered (productionization is stage M9)                                                                                  |
| 6.5             | Idempotency and concurrency (provider-generated key scoped to merchant+operation; persisted key/result mapping; cart version/ETag; stale cart reconciles, never overwrites)                                      | contract §6.1, §6.3; checkout reliability §5                                                                                                                        | Covered (durable persistence is stage M6)                                                                                |
| 7               | In-chat checkout and payment sequence (12 steps incl. SCA/challenge, audit trail)                                                                                                                                | checkout reliability §3 (phases 1–9), §4, §9; security §6; phase 1 slice §2.2                                                                                       | Covered; challenge (`requires_action`) handling is exercised only optionally in Phase 1 (§2.5)                           |
| 8               | Connector model for Shopify-, SAP-, Oracle-style platforms                                                                                                                                                       | connector strategy §3, §4 (style profiles + mapping)                                                                                                                | Covered; SAP/Oracle endpoint claims remain explicitly non-normative (§2.5)                                               |
| 9               | Phase 1 acceptance slice (12 numbered MUSTs + exclusions)                                                                                                                                                        | phase 1 slice §1.1 (bounded in-scope list), §2, §3, §5, §7                                                                                                          | Covered; item 12 (signed webhook verify/dedupe) is a declared capability + conformance case, not a §2/§3 scenario (§2.5) |
| 10              | Current repository assessment and required follow-up order                                                                                                                                                       | interoperability gap register G-01..G-12; this document §4 (ordered backlog)                                                                                        | Covered                                                                                                                  |
| 11              | Targeted company context (internal reference architectures, TAPDEV-662, PingAuthorize storefront)                                                                                                                | consistent by construction; directional sources cited in requirements (§11, §11.1)                                                                                  | Context only; no normative claim taken from it                                                                           |
| Tech. Context   | Current technical context, architecture comparison, standards list, required follow-up order (requirements preamble + comparison tables)                                                                         | interoperability (Task 1 evidence sections); this document §3 (decisions), §4 (follow-up order)                                                                     | Covered; the requirements' 7-step follow-up order is refined into stages M1–M10                                          |
| Constraints 1–7 | Heterogeneity; server-side secrets; no second SOR; thin Phase 1 adapter with HITL consent; merchant-hosted thin deployment (no duplicated runtime); current-POC preservation; per-merchant platform verification | connector strategy §1.1/§3; security §8/§9; interoperability ownership boundary + rejected alternatives; phase 1 slice §1; contract §9; connector strategy §1.1/§10 | Covered                                                                                                                  |

### 2.2 Acceptance criteria traceability

The 18 acceptance criteria at the end of `requirements.md`:

| #   | Criterion (summary)                                                                                                    | Where specified / verified                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | Versioned canonical adapter contract and capability matrix                                                             | contract §3.1, §4.1, §5; openapi.json + schemas.json                                     |
| 2   | One Northwind adapter is the only chatbot commerce path; provider-seed reads removed from that path                    | phase 1 slice §1.1 items 1/7, §2.2 step 4, §8 (build stage M2)                           |
| 3   | Guest browse; authenticated shopper linked merchant→provider→agent with server-side delegation                         | security §4, §5.4; phase 1 slice §2.2 steps 1–3                                          |
| 4   | No raw token/secret/PAN/authority-bearing ID in widget config, localStorage, model messages, logs                      | security §8; phase 1 slice §6 redaction evidence, AC-5 check                             |
| 5   | Proposal stores merchant refs/quantities/options only; materialized into merchant cart before checkout                 | checkout reliability §2; contract §2.1; phase 1 slice §2.2 steps 5–6                     |
| 6   | Pre-consent display of authoritative values; model totals never authorized                                             | checkout reliability §3 phases 2–3; contract §2.1                                        |
| 7   | Price/inventory drift → visible delta and renewed consent                                                              | checkout reliability §7; phase 1 slice F-1                                               |
| 8   | Server-created consent binding; replay/stale rejected                                                                  | security §6; checkout reliability §1 rule 4; phase 1 slice §2.2 step 9                   |
| 9   | One successful flow creates payment authorization + merchant order; merchant-authoritative success only                | checkout reliability §3 phases 6–8; phase 1 slice §2.2 steps 11–14                       |
| 10  | Duplicate confirmation idempotent; stale version reconciles, never overwrites                                          | contract §6.1, §6.3; phase 1 slice F-3/F-4                                               |
| 11  | Decline, merchant failure, expiry, challenge cancel, ambiguous timeout produce explicit states                         | checkout reliability §4, §7; phase 1 slice F-2/F-3                                       |
| 12  | Unsupported in-chat checkout → single-use merchant-bound redirect; reconciled return                                   | contract §11; checkout reliability §9; phase 1 slice F-5                                 |
| 13  | Endpoints reject cross-merchant resources; enforce issuer/audience/scope/agent/subject/ownership                       | security §5.2–§5.4; phase 1 slice §6.1 (enforcement stages M5/M7)                        |
| 14  | Frontend events and exact-origin/nonce messaging documented and exercised                                              | contract §9.1; security §8; phase 1 slice §2.2 (widget events), F-5                      |
| 15  | Least-privilege capabilities independently disableable                                                                 | contract §4.1, §4.2 manifest; security §7; phase 1 slice §5 (`limited` entries)          |
| 16  | At least one signed webhook verified/replay-checked/deduplicated/correlated, retried/dead-lettered                     | contract §8; checkout reliability §6; phase 1 slice §5 (`events.webhook` + HMAC profile) |
| 17  | Adapter contract tests cover discovery/normalization/errors/retries/idempotency/version conflicts/dedupe               | contract §12; phase 1 slice §8 (conformance continuity)                                  |
| 18  | Phase 1 exclusions (autonomous tx, model API execution, multi-platform, provider-owned state, LLM/browser credentials) | phase 1 slice §1.2; interoperability exclusions                                          |

### 2.3 Locked decisions (discuss.md)

| #   | Locked decision                                                                                                                                                         | Honored in                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Provider owns reusable chatbot, identity/trust orchestration, agent authorization, payment orchestration, consent, adapter framework                                    | interoperability (ownership table); security §2, §3                         |
| 2   | Merchant is system of record for catalog, availability, pricing, promotions, customer account, loyalty, order, fulfillment, tax, shipping, merchant-side checkout state | interoperability (ownership table); contract §2; connector §4               |
| 3   | Merchant-hosted deployment as a thin integration layer, not a duplicated runtime                                                                                        | interoperability (merchant host row; rejected alternative 4); contract §9.1 |
| 4   | Target experience is in-chat discovery/cart/checkout/payment with explicit human consent in Phase 1; autonomous transactions future scope                               | checkout reliability §3; phase 1 slice §1.2 (autonomous purchases excluded) |
| 5   | Browser-local conversational cart distinguished from merchant authoritative cart, with defined synchronization before order creation                                    | checkout reliability §2, §3 phases 1–4; interoperability (cart authority)   |
| 6   | Identity and payment authorization use server-authoritative secure tokens/standards; browser UI hints never payment authorization                                       | security §3, §4, §5, §6; contract §2.1; checkout reliability §1 rule 4      |

The five discuss.md **constraints** (heterogeneity; server-side secrets; no second SOR; thin
Phase 1 adapter with HITL consent; POC preservation/generalizable boundaries) are honored
respectively by connector strategy §1.1/§3, security §8/§9, interoperability ownership boundary,
phase 1 slice §1, and contract §9.

### 2.4 Requirements Open Questions

Each open question in `requirements.md` is tracked, not resolved silently: first
merchant/platform capability → connector strategy §10.1; central vs merchant-hosted connectors and
the package boundary → connector strategy §9.4, phase 1 slice §8; Ping deployment/profile for token
exchange, DPoP, consent records, policy → security §4.4/§4.5, §12; approved loyalty fields and
customer-correlation contract → security §7, contract §5.2; audit/operational retention and
reconciliation SLAs → security §10 (target requirements; SLA values are a deployment decision,
tracked as open); money representation, tax/shipping allocation, rounding, version/ETag and webhook
guarantees → contract §3.3 (integer minor-unit money), §6.3, §8.2; remaining per-deployment values
are validation questions (§6 below).

### 2.5 Explicit coverage gaps

Requirements that are specified but not yet satisfied in the repository — tracked here rather than
papered over:

- **NFR 13 (automated testing):** no meaningful automated test suite exists today. The conformance
  suite (contract §12) and the Phase 1 scenario/evidence set are the specified vehicle; they are
  built at stages M2–M6 and extended at M9. Until then this NFR is design-only.
- **Signed webhook exercise (req §9.12 / AC-16):** Phase 1 declares `events.webhook` limited with a
  deterministic HMAC profile for conformance cases; production webhook infrastructure is stage M9.
- **EMV 3-D Secure challenge (req §7.8):** modeled as `requires_action` in the state machine and
  conformance cases, but only optionally injected in Phase 1 (`phase1-poc-slice.md` §3).
- **SAP- and Oracle-style validation:** mapping is style-level; endpoint/payment claims are
  non-normative until per-deployment validation (stage M9; connector strategy §10).
- **DPoP/sender-constrained artifacts (req §5.5):** assessment stage M10; current profile is
  introspection-verified bearer.
- **Audit/operational SLAs (req Open Questions):** retention, deletion, regionalization, and
  reconciliation SLA values remain a deployment decision.

## 3. Decision log (Tasks 2–7)

Each entry records the decision, its rationale, and the artifact that is authoritative for it.

| ID   | Decision                                                                                                                                                                       | Rationale (one line)                                                                                                                         | Artifact (authoritative)                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| D-01 | Provider-owned orchestration boundary + canonical Merchant Commerce Adapter; merchant as commerce SOR                                                                          | Preserves merchant pricing/inventory/tax/checkout/order authority while keeping one reusable product across heterogeneous platforms          | interoperability (Task 2 decision, ownership table)         |
| D-02 | Reject provider-owned long-lived catalog/cart/order, platform-specific chatbot contracts, widget-direct merchant calls, merchant-duplicated runtimes, MCP-as-merchant-contract | Each duplicates merchant truth, hardens one vendor's model into the product, bypasses server-side controls, or destroys the thin integration | interoperability (rejected alternatives; Role of MCP)       |
| D-03 | Ephemeral conversational cart synchronized into the merchant cart before checkout; delta forces re-consent                                                                     | Dialogue speed without a competing system of record; stale totals are the dominant correctness risk                                          | checkout reliability §2–§4; interoperability cart authority |
| D-04 | `merchant-commerce-adapter/v1` normative core: capability document, opaque refs, client-authoritative-value prohibition, version negotiation                                   | The contract — not any platform — defines conformance; client/model values can never be authority                                            | contract §1–§5; openapi.json + schemas.json                 |
| D-05 | Two-layer status vocabulary: envelope `Status` (control flow) vs domain lifecycle enums (`CartData`/`QuoteData`/`CheckoutData`/`PaymentData`/`OrderData`)                      | Lifecycle must not be inferred from transport envelope state; unknown is a first-class outcome                                               | contract §3.3; checkout reliability §1, §4                  |
| D-06 | Idempotency keys per logical operation (reused across retries), optimistic concurrency via `If-Match`, RFC 3339 expiry on every quoted value                                   | POST is not retry-safe (RFC 7231 §4.2.2); duplicate charges and stale writes are the top monetary risks                                      | contract §6; checkout reliability §5                        |
| D-07 | Problem Details (RFC 9457) error taxonomy with canonical `code`/`category`/`retryable`, redacted details, native codes quarantined in `x-` extensions                          | Uniform retry/fallback behavior across heterogeneous platforms without leaking vendor payloads                                               | contract §7; connector strategy §6                          |
| D-08 | CloudEvents v1.0.2 webhook envelope with contract-required attributes; signature verification, replay window, `(source, id)` dedupe, out-of-order tolerance, effect rule       | Events are eventual-consistency signals, never authority to overwrite merchant truth                                                         | contract §8; checkout reliability §6                        |
| D-09 | Hosted-checkout redirect fallback as a first-class contract capability (single-use merchant-bound continuation, reconciled return)                                             | Capability gaps must have a deterministic fallback, not a best-effort charge                                                                 | contract §11; checkout reliability §9                       |
| D-10 | Connector strategy: four style profiles (Shopify/SAP/Oracle/generic) mapped to the canonical surface; controlled `x-` extension strategy; lossiness accepted                   | Platform differences belong in connectors; no vendor API becomes the product contract                                                        | connector strategy §3–§6                                    |
| D-11 | First connector = Northwind merchant-hosted test double on `generic.v1`, exercised through the conformance suite before any vendor connector                                   | It is the only style hostable end-to-end today, it injects every failure path deterministically, and it prevents first-connector-as-contract | connector strategy §9; phase 1 slice §1, §3                 |
| D-12 | Three-domain security model: identity binding, loyalty lookup, and payment authorization are separate grants                                                                   | Conflating them is the root payment-authority failure; OIDC authentication alone never authorizes payment                                    | security §3, §6                                             |
| D-13 | API authorization matrix: eight ordered §5.2 checks (validity, issuer, audience, scope, agent, subject, merchant binding, consent/idempotency)                                 | Closes the issuer-only/active-token gap (G-06/G-07); introspection alone is not authorization                                                | security §5                                                 |
| D-14 | Consent is a server-side record bound to subject, merchant, exact quote version, amount/currency, payment reference, nonce, expiry                                             | A click, client timestamp, localStorage value, or model response is never payment authorization                                              | security §6; checkout reliability §1 rule 4                 |
| D-15 | Non-secret handling rules per surface (browser, prompts, logs, URLs, referrers, adapter payloads, frontend config)                                                             | Redaction at construction time; no token ever reaches browser, model, URL, log, or adapter payload                                           | security §8                                                 |
| D-16 | Reliability invariants: merchant truth only; no silent charge of changed state; one effect per idempotency key; consent as record; success only from authoritative state       | The five rules every other reliability control enforces                                                                                      | checkout reliability §1                                     |
| D-17 | Operation record + outbox/reconciliation worker as the target monetary boundary; current JSON read-modify-write is not                                                         | Unlocked JSON read-modify-write plus timestamp IDs cannot prevent duplicate charges/lost effects                                             | checkout reliability §8; contract §6.2                      |
| D-18 | Phase 1 boundary: one Northwind `generic.v1` double, one contract, current overlay/BFF/federation, six failure scenarios, evidence plan; explicit exclusions                   | Prove the boundary, not vendor translation; keep every Phase 1 artifact reusable when a real connector replaces the double                   | phase 1 slice §1, §3, §8, §9                                |

## 4. Migration sequence

Ordered implementation backlog. Ordering follows the plan's sequencing (adapter-backed catalog and
merchant cart → server-side checkout/order/payment orchestration → durable idempotency/reconciliation
→ connector conformance → expanded merchant onboarding), with security enforcement sequenced as the
Phase 1 slice requires it (observable on exercised paths first, full route classes later). Stages M2–M5
compose the Phase 1 slice; M6–M10 align with `phase1-poc-slice.md` §10 milestones (refined).

| Stage | Scope                                                                                                                                                                                                            | Proposed artifact / file boundary                                                                                                                                                     | Depends on | Resolves                                        | Observable acceptance outcome                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1    | Freeze the canonical contract in code: versioned types, capability/error/status model                                                                                                                            | `packages/shared/src/types/commerce.ts` (new); conformance-test harness skeleton; `cart.ts`/`checkout.ts` marked deprecated-but-unmodified                                            | —          | G-02 (part)                                     | Types compile; schemas agree with openapi.json/schemas.json; version negotiation and error taxonomy representable in types                                       |
| M2    | Northwind `generic.v1` merchant-hosted test double + provider adapter boundary; adapter-backed catalog, availability, quote on the chat path                                                                     | Test-double package (location per connector strategy §9.4 decision); `apps/chatbot-agent/src/lib/commerce-adapter.ts`; exercised chat route no longer reads `data/products.json`      | M1         | G-01 (chat path), G-02                          | Phase 1 §2.2 steps 4–6 observable: adapter log shows `X-Merchant-Id` + correlation; prompt no longer embeds seed catalog on this route                           |
| M3    | Merchant-cart synchronization, authoritative revalidation, delta-consent pause; server-side ephemeral intent                                                                                                     | Server-side intent/consent records in the BFF; `reconcileCart`/`validateCart` with `If-Match`; browser projection demoted to display-only                                             | M2         | G-03, G-05 (record), G-04 (part)                | Phase 1 §2.3 checks 1–2 pass (projection tampering harmless); F-1 shows exact delta + fresh consent; no silent charge                                            |
| M4    | Server-side checkout/order/payment orchestration: checkout session, server-bound payment authorize/capture, order confirmation; idempotency evidence records                                                     | `createCheckoutSession`/`authorizePayment`/`capturePayment`/`createOrder` flows; operation/idempotency evidence records in the double + BFF (Contract §6.2)                           | M3         | G-04, G-10 (evidence)                           | Phase 1 §2.2 steps 11–15: merchant-authoritative confirmation only; F-2/F-3/F-4/F-5/F-6 pass with one-logical-effect evidence                                    |
| M5    | Authorization enforcement on the exercised Phase 1 paths: §5.2 checks; opaque short-lived BFF session artifact; merchant-origin CORS                                                                             | `apps/payment-api/src/middleware.ts` route-class checks (loyalty/checkout rows); `apps/chatbot-agent` session-handle replacement for the widget token (G-08); origin allowlist (G-09) | M2         | G-05, G-06, G-07 (exercised routes), G-08, G-09 | Phase 1 §6.1 table evidenced; devtools shows no raw token/secret (AC-5); wrong-issuer/wrong-audience/cross-merchant probes fail closed                           |
| M6    | Durable operation/idempotency/consent storage: unique constraints, atomic transitions, append-only evidence, outbox/reconciliation worker                                                                        | New durable store replacing JSON read-modify-write for operations/consent/payment evidence (checkout reliability §8 target model)                                                     | M4         | G-10                                            | Crash/restart between writes resolves by replay-and-reconcile; duplicate submission under concurrency yields one effect; no lost loyalty/transaction writes      |
| M7    | Full §5.2 enforcement across all route classes; authenticated, redacted, retained operator traces                                                                                                                | `middleware.ts` + every payment-api route handler per security §5.3 matrix; `token-trace` route auth + retention (G-11)                                                               | M5         | G-06, G-07 (full), G-11                         | Every §5.3 matrix row meets its target; denials distinguishable by failed check number in audit logs                                                             |
| M8    | Storefront migration: adapter-backed merchant catalog path; storefront web checkout onto the synchronized cart/checkout flow                                                                                     | `apps/merchant-web/src/lib/catalog.ts` → adapter path; retire browser-authoritative `checkout-form.tsx` cart build                                                                    | M4, M6     | G-01 (full), G-03 (full)                        | Storefront catalog no longer served by `payment-api/api/products`; `/checkout` revalidates merchant truth; client-built cart posts eliminated                    |
| M9    | Connector conformance + webhook productionization: suite parameterized by profile; Shopify-style redirect-heavy double second; webhook gateway (signature profiles, replay windows, dedupe storage, dead-letter) | Conformance suite package; second double profile; event-gateway service per contract §8                                                                                               | M4         | G-02 (full), G-12 (webhook metadata)            | Conformance green on Northwind double, then Shopify-style profile; SAP/Oracle validated per deployment; signed events verified, replayed, deduped, dead-lettered |
| M10   | Expanded merchant onboarding: commerce integration manifest, secret-manager references, rotation lifecycle, capability disablement; DPoP/sender-constraint assessment                                            | Manifest schema in merchant onboarding (contract §4.2); secret-manager integration; rotation runbook; DPoP assessment note (security §12.6)                                           | M9         | G-12, T-01 (residual)                           | A second merchant onboards via manifest only (no code change); secrets only in the secret manager; expired credential disables capability fail-closed            |

Explicitly **not** sequenced in this backlog (non-scope of the architecture): autonomous
transactions, raw PAN handling, provider-owned long-lived commerce storage, and arbitrary
merchant-facing MCP exposure — all remain excluded per `phase1-poc-slice.md` §1.2.

**Demo continuity during migration.** The sequencing is deliberately incremental so the demo
environment keeps working throughout: M2–M5 migrate the chat path only, leaving the storefront web
checkout and merchant-web catalog proxy on their current browser-local/provider-proxy paths as the
documented negative control (phase 1 slice §2.3 check 2); M6–M7 harden the provider control plane
without changing storefront behavior; M8 is the stage that retires the storefront's
browser-authoritative path once chat-path authority, durable operation state, and authorization
enforcement all exist. Each stage's acceptance outcome is observable independently of the next, so
a stage can land without partially-migrated behavior in the exercised paths.

## 5. Consolidated risk register

Consolidated from connector strategy §5 (R-C01..C09), security §11 (T-01..T-13 + residual risks),
checkout reliability §7/§8, the plan confidence table, and phase 1 §9 ("not proven"). Registers
remain authoritative; this table is the review index.

| ID         | Risk (summary)                                                                                                                                             | Source register | Primary control (artifact)                                                | Residual status                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| R-C01      | First connector hardens into the de facto product contract                                                                                                 | connector §5    | Double-first sequencing; conformance suite before profiles (D-11)         | Controlled; re-verify at M9                                               |
| R-C02      | Native payloads/IDs/cursors leak into prompts, widget, logs, events                                                                                        | connector §5    | Opaque refs, redaction at construction, `x-` quarantine (D-04/D-07)       | Persistent risk; conformance + phase 1 §6 redaction evidence each release |
| R-C03      | Heterogeneous throttling breaks uniform retry behavior                                                                                                     | connector §5    | `rate_limited` + `Retry-After`, bounded retries, declared limits          | Per-connector validation (M9)                                             |
| R-C04      | Async order/fulfillment lag reported as failure or false success                                                                                           | connector §5    | Envelope-vs-domain status, `operation.status` reconciliation (D-05)       | Covered by design; exercised F-3, SAP profile later                       |
| R-C05      | Out-of-order/delayed events overwrite newer projections                                                                                                    | connector §5    | `dataversion`/`sequence` handling; re-read before effect (D-08)           | Covered; webhook prod at M9                                               |
| R-C06      | Credential sprawl across distributed services/landscapes                                                                                                   | connector §5    | Manifest scope list, rotation with overlap, fail closed (§9.3)            | Onboarding lifecycle is M10                                               |
| R-C07      | Missing native concurrency silently breaks stale-write safety                                                                                              | connector §5    | `optimisticConcurrency: false` honesty; undeclared = unavailable          | Validation question VQ-4                                                  |
| R-C08      | Guest vs subject-bound differences misdeclared                                                                                                             | connector §5    | `requiresSubject` capability declarations                                 | Conformance case at M9                                                    |
| R-C09      | Capability drift after connector/merchant config changes                                                                                                   | connector §5    | Capability expiry + refresh triggers                                      | Conformance case at M9                                                    |
| T-01/T-10  | Bearer/agent token replay; agent privilege escalation (audience/scope inflation)                                                                           | security §11    | Short lifetimes, audience binding, `act.sub` enforcement; DPoP assessment | Residual until M10; introspection latency noted below                     |
| T-02/T-06  | Widget-held merchant ID token; postMessage forgery                                                                                                         | security §11    | Opaque session handle + exact-origin/nonce messaging (M5)                 | Current state violates (G-08/G-09)                                        |
| T-03/T-04  | Caller-supplied selectors as authority; cross-merchant access                                                                                              | security §11    | §5 checks 6–7 fail closed (M5/M7)                                         | Current gap until enforced                                                |
| T-07       | Consent replay / duplicate submission                                                                                                                      | security §11    | Single-use nonce, exact-match binding, idempotency keys (M3/M4)           | Exercised F-1/F-4                                                         |
| T-08       | Prompt injection exfiltrating secrets or fabricating totals                                                                                                | security §11    | Model values never authoritative; redaction before prompt assembly        | Standing rule; phase 1 §6 redaction grep each release                     |
| T-11/T-12  | Connector credential/webhook secret leakage; forged or replayed merchant events                                                                            | security §11    | Secret manager, rotation, fail closed; signature + dedupe (M9/M10)        | Current absence recorded (G-02/G-12)                                      |
| P-01       | Durable idempotency/authorization policy variance (plan feasibility/estimation risk)                                                                       | plan Confidence | Durable operation storage (M6), conformance suite (M9), bounded Phase 1   | Material variance acknowledged for M6/M9 sizing                           |
| P-02       | Merchant API/processor/checkout-capability variance per deployment                                                                                         | plan Confidence | Capability documents per deployment; validation questions §6              | Open until per-merchant validation                                        |
| NP-1..NP-8 | Not proven by Phase 1 (durability, real processor, webhook infra at scale, DPoP, multi-instance, rate-limit realism, locale/currency breadth, performance) | phase 1 §9      | Explicitly listed as unproven; later stages close named items             | Do not infer production behavior from Phase 1                             |

## 6. Open validation questions

Consolidated from connector strategy §10 (VQ-1..VQ-7), the requirements Open Questions, and the
phase 1 package-boundary decision. These are validation questions, not implementation blockers;
each is answered by the named step, not by this document.

1. **Shopify-style payment path:** does the merchant's approved integration expose any server-side
   payment path, or is hosted checkout always the exit? (Decides `in_chat` availability; connector
   validation, before M9 profile work.)
2. **SAP-style quotes:** which landscapes' pricing/availability services support
   reservation-capable quotes, and what is the real quote TTL? (Determines whether `quoteCart` is
   read-only or idempotency-required.)
3. **Oracle-style service families:** which families (order management, loyalty, promotions) are
   actually enabled per merchant, and what is the full native state space to map to canonical
   enums or `unknown`?
4. **Native concurrency evidence:** what version/ETag/reservation evidence exists per merchant —
   enough to declare `optimisticConcurrency: true` honestly rather than by default?
5. **Webhook signing profiles:** what do real platforms in scope offer, and where is RFC 9421
   needed as fallback?
6. **Subject binding per platform:** which customer-identity binding is stable enough for
   `SubjectContext` resolution without email as a key, given changing hosted-platform identity
   models?
7. **Rate-limit budgets:** do real budgets leave room for conversational bursts, or do catalog
   reads need provider-side caching with explicit freshness bounds?
8. **Hosting and package boundary (connector strategy §9.4):** adapter/test-double workspace
   location (`apps/merchant-adapters/` vs `packages/`), merchant-hosted vs provider-hosted double,
   and how the double shares schemas with `packages/shared/src/types/commerce.ts` without coupling
   merchant code to provider runtime. Decided before M2; Phase 1 evidence must not depend on it.
9. **First production merchant/platform** for the first real connector, and the approved
   loyalty/customer-correlation field set for it (requirements Open Questions).
10. **Audit/operational SLAs:** retention, deletion, regionalization, and reconciliation windows
    for audit and operational records (deployment decision).

## 7. Review checklist

What a human reviewer should verify to accept this assessment:

1. **Run the current demo** per [`getting-started.md`](./getting-started.md) and
   [`demo-walkthrough.md`](./demo-walkthrough.md) (`pnpm caddy:start && pnpm dev:start`, open
   `https://northwind.mytest.run`) and confirm the current-state description matches observed
   behavior: silent SSO, local-catalog prompt, "Confirm & pay" producing a provider-synthetic
   captured session, and browser-local storefront cart.
2. **Execute the Phase 1 scenario** (`phase1-poc-slice.md` §2.1–§2.3) against the Phase 1 build
   once implemented, including the browser-state authority proof (§2.3) and the six failure
   injections (§3 F-1..F-6); the §7 evidence table is the pass/fail record.
3. **Spot-check contract conformance claims:** verify
   [`commerce-adapter-openapi.json`](./commerce-adapter-openapi.json) operation IDs and
   [`commerce-adapter-schemas.json`](./commerce-adapter-schemas.json) definitions resolve without
   placeholders; walk the §12 conformance checklist against the prose contract (§4, §6, §7, §8,
   §11) and confirm the two status layers (§3.3) are consistently represented.
4. **Audit the gap register against code:** open each evidence path for G-01..G-12 in
   [`commerce-interoperability.md`](./commerce-interoperability.md) and confirm the claimed gap is
   observable (e.g., G-01 `chat/route.ts#L648-L666`, G-06 `middleware.ts#L73-L114`, G-10
   `json-store.ts#L1-L27`).
5. **Verify traceability:** confirm every requirements section maps in §2 above, every locked
   decision in `discuss.md` is honored in §2.3, and every stage in §4 names an artifact boundary
   and an observable acceptance outcome.
6. **Check honesty of the risk/open-question registers:** confirm no risk in §5 or question in §6
   is silently resolved elsewhere, and that non-claims (§8) are not contradicted elsewhere in the
   document set.
7. **Confirm scope discipline:** the change set is documentation-only; no source/config edits, no
   provisioning, no implementation commits are included with this assessment.

## 8. Explicit non-claims

This document and the artifact set it consolidates make none of the following claims:

- **No production readiness.** Nothing described is implemented, deployed, load-tested, or
  operationally supported. The target architecture is a recommendation; the current runtime remains
  the POC described by the gap register.
- **No vendor conformance or support claim.** A passing test double is evidence that the boundary
  works, not that Shopify, SAP Commerce, Oracle Commerce, or any other platform supports any
  operation (contract §12 closing rule). All platform characteristics in
  [`connector-strategy.md`](./connector-strategy.md) are style-of-platform descriptions, not
  verified vendor facts; SAP/Oracle endpoint behavior is explicitly non-normative until
  per-deployment validation.
- **No lossless normalization promise.** Adapter mapping is deliberately lossy; vendor data outside
  the canonical vocabulary is dropped or carried only in namespaced `x-` extensions (connector
  strategy §6.7).
- **No control-existence claim.** The §5.2 authorization checks, consent records, idempotency
  storage, webhook gateway, opaque session artifact, and CORS restriction are target controls
  (stages M5–M9); the current middleware, consent check, and CORS/trace behavior are the recorded
  gaps.
- **No Phase 1 over-claim.** Phase 1 does not prove durability, real payment processors, webhook
  infrastructure at production fidelity, DPoP, multi-instance session state, rate-limit realism,
  locale/currency breadth, or performance (`phase1-poc-slice.md` §9).
- **No autonomous transactions.** Every purchase in the target and Phase 1 is shopper-initiated,
  reviewed, and explicitly confirmed; autonomous checkout is future scope excluded by design.
- **No live changes.** No AIC/Frodo provisioning, IDP mutation, payment-processor integration, or
  runtime/config modification is performed or claimed by this assessment.

## 9. Related documents

- [`commerce-interoperability.md`](./commerce-interoperability.md) — Task 1 evidence baseline and
  gap register; Task 2 target architecture and trust topology
- [`commerce-adapter-contract.md`](./commerce-adapter-contract.md) — normative adapter contract
- [`commerce-adapter-openapi.json`](./commerce-adapter-openapi.json) /
  [`commerce-adapter-schemas.json`](./commerce-adapter-schemas.json) — machine-readable artifacts
- [`connector-strategy.md`](./connector-strategy.md) — platform-style profiles and first-connector
  decision
- [`commerce-security-identity.md`](./commerce-security-identity.md) — security and identity
  controls
- [`checkout-reliability.md`](./checkout-reliability.md) — reliability and recovery model
- [`phase1-poc-slice.md`](./phase1-poc-slice.md) — Phase 1 slice and evidence plan
- Project requirements and decisions:
  [`requirements.md`](../.polaris/merchant-chatbot-ecommerce-interoperability/requirements.md),
  [`discuss.md`](../.polaris/merchant-chatbot-ecommerce-interoperability/discuss.md),
  [`plan.md`](../.polaris/merchant-chatbot-ecommerce-interoperability/plan.md)
