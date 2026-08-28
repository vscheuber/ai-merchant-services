# Task 1 Summary

## Status

**DONE**

## What was implemented

Created the Task 1 evidence baseline and current-state gap register in:

- `docs/commerce-interoperability.md`

The assessment documents verified repository behavior for:

- merchant-web's embedded chatbot configuration and current catalog/checkout proxies;
- chatbot-agent's silent SSO/PKCE, merchant-token-login, provider token bridge, agent exchange,
  local catalog prompt, provider context fetch, model proposal, and direct payment-api checkout;
- merchant-web browser-local cart snapshots and client-built checkout payloads;
- payment-api's provider-local catalog pricing, transaction/loyalty writes, synthetic checkout
  session, and caller-supplied identity/resource selectors;
- payment middleware's active-token/issuer checks and explicitly deferred scope/subject checks;
- shared JSON persistence's lack of locking, runtime validation, operation state, and
  read-modify-write protection;
- local-disk token trace storage and its unauthenticated session-keyed route;
- merchant configuration/onboarding and existing architecture/identity documentation; and
- the absence of a platform-neutral commerce adapter, connector boundary, merchant commerce
  contract, or merchant-facing MCP contract in the inspected runtime/documentation.

The gap register explicitly separates authentication from authorization, browser/conversation
state from merchant-authoritative state, provider checkout records from merchant orders, and
identity binding from commerce integration. The document labels current behavior as evidence and
uses an explicit non-findings/scope guard so no future-state control is presented as implemented.

## Verification

- `git diff --check` passed.
- Repository evidence-link validation passed: 28 distinct relative repository links resolve.
- `pnpm exec prettier --check docs/commerce-interoperability.md` passed.
- No runtime, AIC, seed-data, merchant configuration, or external resource changes were made.
- No tests were authored or run: the plan specifies `Testing: none` for this documentation/evidence
  task.

## Deviations

- The assessment artifact is new rather than an update to an existing architecture document because
  `docs/commerce-interoperability.md` did not exist in the repository.
- The repository search found MCP references only in Frodo provisioning notes, not a
  merchant-commerce contract; this is recorded as an absence finding and not treated as evidence
  against unrelated MCP infrastructure.
