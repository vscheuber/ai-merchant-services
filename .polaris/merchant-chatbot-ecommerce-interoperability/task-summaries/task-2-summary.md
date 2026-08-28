# Task 2 Summary

## Status

**DONE**

## What was implemented

Added the Task 2 target architecture decision to:

- `docs/commerce-interoperability.md`

The decision record now makes one recommendation unambiguous: the payment provider owns the
reusable chatbot, server-side orchestration, identity/trust orchestration, agent authorization,
payment orchestration, consent, adapter framework, and operational controls; the merchant remains
the system of record for catalog, availability, pricing, promotions, customer/account, loyalty,
tax, shipping, checkout, order, and fulfillment; and the merchant-hosted integration remains a
thin widget/SDK surface.

The document also defines:

- responsibilities and prohibited behavior for the merchant host, widget, provider BFF, identity
  services, adapter gateway, merchant connector, merchant commerce system, payment orchestrator,
  and webhook/reconciliation worker;
- provider versus merchant trust and data-flow boundaries;
- an architecture topology and in-chat discovery/cart/consent/payment/order sequence showing that
  the widget has no direct call to merchant commerce APIs, merchant adapters, or payment
  orchestration;
- the ephemeral conversational-cart and merchant-authoritative-cart synchronization boundary;
- rejected alternatives for a provider-owned long-lived commerce system, platform-specific chatbot
  contract, widget-to-merchant direct API calls, merchant-owned chatbot runtimes, and merchant-facing
  MCP;
- MCP as optional provider-internal plumbing only; and
- decision consequences and implementation guardrails explicitly labeled as future work rather than
  current implementation.

The Task 1 evidence baseline remains explicitly current-state evidence, while the document header
now distinguishes the new Task 2 future-state recommendation from the later contract, connector,
security, reliability, and Phase 1 tasks.

## Verification

- `git diff --check` passed.
- `pnpm exec prettier --check docs/commerce-interoperability.md .polaris/merchant-chatbot-ecommerce-interoperability/task-summaries/task-2-summary.md` passed.
- Manual requirements review passed: one recommendation is stated; merchant/provider ownership is
  explicit; alternatives and rejection rationale are recorded; and both topology/sequence diagrams
  show no widget-to-merchant-commerce or widget-to-payment path.
- Tests, lint, typecheck, and build were not run because this task changes documentation only and
  the plan specifies `Testing: none`.

## Deviations

- The target architecture was added to the existing Task 1 document, as the plan identifies
  `docs/commerce-interoperability.md` as the likely shared architecture/decision artifact. No runtime,
  configuration, seed-data, adapter, API, MCP, database, identity, or live-resource changes were
  made.
- The requested Mermaid diagram/sequence was represented as fenced text diagrams to keep the
  architecture decision readable in repository Markdown without adding a diagram dependency.
