# Task 4 Summary

## Status

DONE with live AI Agent provisioning blocker documented

## Changes

- Added `northwind-chatbot-agent` to `config/aic/inputs/alpha/ai-agents.json` as a first-class AIC AI Agent desired state.
- Set the OAuth/client shape to match the existing Northwind client and set identity attributes to `Northwind Shopping Assistant` with a merchant-scoped description.
- Updated `upsertAIAgent` to read with `includeAgentIdentity=true`, create with `includeAgentIdentity=true`, and update with `includeAgentIdentity=true`.
- Added the Frodo-compatible `_aiAgentIdentity` create payload, including generated UUID identity ID, `oauth2ClientId`, name, description, and empty privileges. Read-back-only identity metadata is excluded from update payloads while desired `aiAgentIdentityAttributes` remains available for reconciliation.
- Dry-run remains write-free and includes the new OAuth client plus AIAgent action.
- No custom schema, group, privilege, unrelated agent, or old `chatbot-agent` deletion/retirement was performed.

## Validation

- `pnpm --filter @acme/aic-config typecheck` passed.
- `NODE_OPTIONS='--conditions require' config/aic/node_modules/.bin/tsx config/aic/provision.ts --dry-run` passed and listed the Northwind AIAgent action.
- `git diff --check` passed.

## Live mutation outcome

A live provision run completed; it did not hang. The run:

- Updated existing alpha clients (`payment-user-web`, `payment-admin-web`, `payment-api`, and retained `chatbot-agent`).
- Created `northwind-chatbot-agent` OAuth2 client on the first run; subsequent run reconciled it as updated.
- Updated the four alpha applications and existing trusted issuer.
- Updated existing bravo client/users.
- Attempted `northwind-chatbot-agent` first-class AIAgent creation but Frodo returned the generic `Error creating alpha realm AI agent northwind-chatbot-agent`. A follow-up read confirmed the AIAgent is still absent (404), so no orphan AI Agent or identity was left behind.

The first live attempt used only flattened `aiAgentIdentityAttributes`; inspection of installed Frodo 4.1.7 shows `createAIAgent(..., true)` expects the related identity under `_aiAgentIdentity`, which is now implemented in code. A follow-up mutation retry was blocked by the execution permission classifier, so no second live mutation was attempted. The provisioner now captures nested Frodo `originalErrors`, HTTP status/code/message, response data/body, and bounded redacted diagnostics in the skip log. The read path now creates only after a confirmed HTTP 404; permission, transport, schema, and other read failures are surfaced without falling through to a mutation. The exact API reason still requires one authorized retry or a raw authenticated trace. The already-created OAuth2 client is within the authorized desired state; the existing `chatbot-agent` remains untouched.
