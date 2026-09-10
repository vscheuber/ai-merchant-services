# Task 1 Summary

## Status

**DONE**

## What was implemented

Created the Task 1 evidence baseline and current-state gap register in:

- `docs/commerce-interoperability.md`

The assessment documents verified repository behavior for:

- merchant-web's embedded chatbot configuration, catalog loader, and checkout proxy;
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
- Repository evidence-link validation passed: 129 relative-link occurrences resolve across 28 distinct repository target files.
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

## Fix Iteration 1

### Findings addressed

- **Important — payment-route validation was overstated**: Narrowed the evidence baseline's payment API description to the checks actually present. It now distinguishes presence/falsy checks and the non-empty items/merchant ID checks from the missing complete runtime validation: `userId` and `selectedCardId` are only string-cast, item SKU/object types are not checked, and the declared cart currency is not runtime-validated. It separately records the implemented positive-integer quantity, provider-catalog SKU resolution, and matching-product currency checks.
- **Important — catalog loader was mischaracterized as a proxy**: Replaced “catalog/checkout proxies” with the precise “catalog loader and checkout proxy” wording. The catalog loader directly calls the payment API; the merchant-web checkout route is the proxy.
- **Suggestion — link-audit wording was ambiguous**: Clarified that the audit found 129 relative-link occurrences across 28 distinct repository target files.
- **Suggestion — bounded evidence-completeness wording**: Changed the evidence baseline scope guard from “complete for the Task 1 scope” to “covers the repository areas reviewed for the Task 1 scope.”

### Files modified

- `docs/commerce-interoperability.md` — corrected payment checkout validation evidence and bounded the evidence-baseline completeness statement.
- `.polaris/merchant-chatbot-ecommerce-interoperability/task-summaries/task-1-summary.md` — corrected catalog-loader topology wording, clarified link-audit counts, and recorded this fix iteration.

### Verification

- Tests: not run — the plan specifies `Testing: none` for this documentation/evidence task, and no runtime files changed.
- Lint: not run — not applicable to the documentation-only fix.
- Typecheck: not run — not applicable to the documentation-only fix.
- Build: not run — not applicable to the documentation-only fix.
- `git diff --check` — passed.
- `pnpm exec prettier --check docs/commerce-interoperability.md .polaris/merchant-chatbot-ecommerce-interoperability/task-summaries/task-1-summary.md` — passed.
