# Frodo Notes

This note records Frodo-related challenges and improvement opportunities found while implementing Agent IAM Core merchant scoping. It is an engineering follow-up, not a tenant export or an operational runbook. Examples use the project’s conceptual terms **payment provider IDP** and **merchant IDP**; `alpha` and `bravo` remain only where they are literal realm, path, type, or variable names.

## Scope and evidence

The findings below are grounded in:

- The installed `@rockcarver/frodo-lib` **4.1.7** package and its generated declarations/runtime under `config/payment/aic/node_modules/@rockcarver/frodo-lib/`.
- The provisioner in `config/payment/aic/provision.ts`, its desired state, and the phase-4 and phase-5 task summaries under `.polaris/agent-iam-core-merchant-scoping/task-summaries/`.
- Read-only live payment provider IDP observations recorded in the phase-1 and phase-5 summaries. No credentials, tokens, or raw tenant exports are reproduced here.

The phase findings are intentionally separated from proposed fixes. A recommendation is not evidence that the tenant supports a particular write contract.

## Library 4.1.7

The application is pinned to `@rockcarver/frodo-lib` `^4.1.7`, and the lockfile resolves **4.1.7**. The package requires Node 20 or newer. Its public declarations expose useful domain operations, including:

- AI Agent read/create/update/delete operations with an `includeAgentIdentity` flag.
- Application read/create/update/delete operations, with application deletion accepting a `deep` flag.
- Managed-object record operations and `readManagedObjectSchema`.

The implementation details matter for safe provisioning:

- `createAIAgent` first attempts a read, takes the related identity from `_aiAgentIdentity`, removes `_aiAgentIdentity` from the agent payload before writing the agent, and then creates/link privileges and relationships. A caller that supplies only the flattened `aiAgentIdentityAttributes` shape does not satisfy this create path.
- AI Agent identity/privilege work is multi-step. The implementation creates or reuses privilege records, links the agent, links the resource application, and attempts reverse links. Some reverse application/group-link errors are logged as optional debug events rather than surfaced as a failed operation.
- `readManagedObjectSchema` is a schema read. The declarations expose managed-object record writes separately; they do not expose a managed-object schema create/update operation.
- Application delete defaults to `deep = true` in the public wrapper. The runtime deletes the application record first and invokes dependency deletion only when `deep` is true. The exact dependency set and tenant-side cascade behavior are not established by this code inspection.

The version is therefore usable for the current read/reconcile work, but the application should pin a tested version and maintain focused contract tests around AI Agent identity creation, privilege linking, error propagation, and delete behavior before upgrading.

## CLI and MCP surface

The CLI and MCP surfaces are complementary but not interchangeable:

- The application provisioner uses the repository-pinned `@rockcarver/frodo-lib` **4.1.7**. It reads JSON desired state, loads a Frodo connection profile, creates realm-scoped instances, and performs mutations through the library. Its dry run still resolves the connection profile, but it skips tenant API calls after configuration is loaded.
- The locally installed Frodo CLI is newer than the application dependency: `frodo --version` reports CLI **4.7.1** and lib **4.4.2** (with an update notice for CLI 4.7.2). This is useful implementation evidence but is not a substitute for testing the repository-pinned library.
- The MCP/Frodo read-only probe provided high-value live discovery for application, AI Agent, privilege, group, user, and schema shapes. It established live object types and relationships without writing the tenant.
- The MCP skill catalog exposed `idm.managed.readManagedObjectSchema` and managed-record writes, but no schema-specific create/update/delete skill for the requested `alpha_user` custom properties. The absence of a schema-specific MCP skill is a contract gap, not evidence that an undocumented raw endpoint is safe to call.
- The CLI `idm schema object export/import` commands are not schema-document CRUD commands. They export/import IDM **configuration managed-object artifacts**. In the CLI source, import loads an exported `idm.managed` object and calls Frodo `importSubConfigEntity('managed', ...)`; the library replaces or appends the named object in the `managed.objects` array and updates the parent config entity.
- The CLI and MCP results use different levels of abstraction and error detail. A shape observed through a read skill must still be translated into the exact library method and payload before it is used by the provisioner.

A useful but bounded write finding is now established for the IDM configuration artifact: Frodo 4.1.7 declares `updateConfigEntity(entityId, entityData, wait?)`, and its runtime sends `PUT {idmBase}/config/{entityId}`. `idmBase` is the configured IDM host or, by default, the host-only URL plus `/openidm`; therefore the default path is `PUT https://<host>/openidm/config/managed`. The exported/imported payload shape is `{ "_id": "managed", "objects": [ ... ] }` (inside an export wrapper `{ "idm": { "managed": ... }, "meta": ... }`); each object has a `name` and may contain a `schema`. This endpoint/payload is established for IDM configuration managed objects, but it is **not established as an approved or safe alpha_user schema mutation contract for this tenant**. Do not send it merely because the path exists in Frodo source.

Recommended operating boundary: use MCP read-only discovery to establish live contracts, use CLI/library configuration writes only after an approved contract review, and capture read-back evidence after each mutation. Do not infer a schema write API from a managed-record PATCH or from the schema read endpoint.

## Unsafe broad read-fallback behavior

Several upsert helpers still treat **any** read exception as “not found” and then attempt a create:

- `upsertOAuth2Client` catches all errors from `readOAuth2Client` before calling `createOAuth2Client`.
- `upsertTrustedJwtIssuer` catches all errors from its read before calling create.
- `upsertApplication` catches all errors from `readApplicationByName` before calling create.

This is unsafe because a 401/403, transport outage, malformed response, schema error, rate limit, or transient service failure can be converted into an unintended mutation attempt. It can also obscure the original read failure behind a create failure.

The phase-4 AI Agent path was corrected separately: it now creates only after `readAIAgent` reports a confirmed HTTP 404, and it preserves nested error details. That narrower behavior should be the common pattern for every resource. A read failure must be classified first; only a confirmed not-found status may enter the create branch.

A related inconsistency remains in error handling. The non-agent upserts generally return an action with only `Error.message`, while the AI Agent and stale-application paths use bounded nested diagnostics. The resulting run summary can be actionable for one resource type and opaque for another.

## AI Agent create response and identity handling

The phase-4 work exposed two separate contracts that should be documented and tested:

1. **Payload shape.** Frodo 4.1.7’s `createAIAgent(agentId, agentData, true)` expects the related identity under `_aiAgentIdentity`. The provisioner now builds that object from the desired `aiAgentIdentityAttributes`, including a generated UUID identity `_id`, `oauth2ClientId`, name, description, and an empty `_privileges` array. The flattened desired attributes remain useful for reconciliation but are not sufficient as the create-only relationship shape.
2. **Response and side effects.** A successful-looking top-level agent operation can involve several underlying writes: the agent, identity-related privileges, agent links, resource application links, subject-group links, and optional reverse links. The caller needs read-back of the agent, identity, privilege records, and relationships rather than trusting only the returned top-level object.

The live phase-4 attempt returned only the generic Frodo message `Error creating ... AI agent`; a follow-up read showed that the first-class agent was still absent. The provisioner was consequently changed to retain nested `originalErrors`, HTTP status/code/message, response data/body, and bounded redacted details. The exact tenant rejection reason still requires an authorized retry or an equivalent authenticated trace; no fallback to an ordinary OAuth client is acceptable.

Improvement opportunity: make the library return a structured result that distinguishes the agent write from each identity/privilege/link step, and make partial creation/rollback behavior explicit. The provisioner should verify identity linkage and privilege relationships immediately after create/update.

## Delete cascade uncertainty

The provisioner’s stale-application cleanup is deliberately opt-in and calls `deleteApplication(id, false)`, followed by a read-back expecting 404. This avoids asking Frodo to remove dependencies as a side effect. The installed declarations and runtime confirm that `deep` controls whether Frodo invokes dependency deletion, but they do not establish:

- Which tenant relationships count as dependencies for an application.
- Whether non-deep deletion is rejected when relationships remain, leaves dangling references, or removes only the application record.
- Whether AI Agent identity deletion also removes privileges, reverse application/group links, or other objects in every tenant deployment.
- Whether a failed multi-step delete leaves a partially modified graph.

The library exposes `deleteAIAgent` and `deleteAIAgents` with documentation saying identity and privileges are deleted, but this note does not treat that description as a verified rollback contract. Before enabling destructive cleanup, capture a dependency-aware read-only inventory, use a disposable/test object where possible, verify each expected relationship after deletion, and document a restoration path.

## Wrapper inconsistencies

The current wrapper layer makes the same tenant failure appear differently depending on the resource:

- Read-then-create logic is broad for clients, trusted issuers, and applications, but status-gated for AI Agents.
- Some catches return only `Error.message`; others preserve nested Frodo details and redact sensitive keys.
- `flattenWrapped` recursively unwraps `{ inherited, value }` objects but deliberately passes arrays through unchanged. This is appropriate for some wrappers but can leave wrapped values inside array elements and produce inconsistent merge input.
- Deep merge preserves live fields and replaces arrays with desired arrays. That is convenient for desired state but can overwrite server-managed relationship arrays or discard live entries when a desired payload contains an array.
- Frodo’s AI Agent read/create/update methods default `includeAgentIdentity` to true, while the provisioner passes the flag explicitly. Other wrappers have different default field/relationship behavior, making read shape assumptions easy to miss.
- `readApplicationByName` is used to decide whether an application exists, while the desired application ID is supplied separately. A name collision or differing live `_id` must be treated as a drift condition, not silently normalized.

Recommended improvement: introduce a small shared result/error adapter with explicit `isNotFound`, safe diagnostic serialization, resource/action context, and read-back verification. Keep relationship fields out of generic deep merges unless the resource contract explicitly declares them desired state.

## Diagnostics and safety

The phase-4 investigation showed why top-level messages are insufficient: Frodo wraps transport/API failures and may expose the useful status and response only through nested error fields. The current `formatFrodoError` implementation intentionally limits fields, redacts names matching secret/password/token/authorization/cookie/JWK/private/credential, detects circular objects, and caps output length. This is a good baseline for diagnostics, but coverage is incomplete because it is not used uniformly.

Diagnostics should:

- Preserve HTTP status, response status text, API error reason, and bounded response body where safe.
- Include realm, resource type, operation, and object ID without including credentials or raw tokens.
- Distinguish read classification failures from create/update failures.
- Stop the affected phase on permission, transport, schema, or relationship errors instead of continuing as if the object were absent.
- Redact values by semantic field and avoid logging entire request/response objects by default.

The existing debug log files and live traces are not treated as documentation sources here; no secrets or raw tokens should be copied into notes, commits, or run summaries.

## Schema API gap

The phase-5 read-only probe confirmed that payment provider IDP `alpha_user` requires `userName`, `givenName`, `sn`, and `mail`, and currently exposes `custom_mail2` and `custom_mobilePhoneNumbers`. The requested `custom_merchantId` and `custom_merchantCustomerId` properties were absent from both the schema property map and order list. The current live schema read also shows `custom_mail2` as a searchable=false string with a valid-email policy and `custom_mobilePhoneNumbers` as a searchable=false array of strings; these are observations only, not defaults for the requested properties.

The live target is a Cloud deployment at the active Frodo target, and MCP discovery reported 16 managed-object types with schema hydration available. `frodo_find_skills` matched `alpha_user` to `idm.managed.readManagedObjectSchema`; the descriptor requires `type` and optionally `refreshCache`/filter options, is read-only, and explicitly points relationship discovery toward `idm.managed.updateManagedObjectProperties`. No schema-specific create/update/delete skill was returned.

Frodo 4.1.7 exposes `readManagedObjectSchema`, plus managed-object record operations such as create, update, patch, and delete. Its declarations do **not** expose a managed-object schema create/update/delete operation. The managed-record patch runtime is `PATCH {idmBase}/managed/{type}/{id}` with JSON-patch operations and optional `If-Match`; it changes a record, not the type schema, and must not be used as a substitute.

The installed Frodo source does establish a configuration-artifact route: `getManagedObjectSchema` reads `GET {idmBase}/schema/managed/{type}`, while IDM config import updates a parent config entity with `PUT {idmBase}/config/{entityId}`. For an exported managed-object configuration artifact, `entityId` is `managed`, and the payload contains an object named `alpha_user` whose `schema` holds `properties`, `order`, and `required`. This establishes how Frodo's configuration import machinery works, not that this tenant accepts that artifact as the authoritative custom-property change mechanism. The MCP catalog did not expose that config write as an approved schema skill, and no live write was attempted.

Still unknown and blocking mutation:

- Whether `PUT /openidm/config/managed` (or a tenant-specific equivalent) is the authoritative and supported route for editing the live `alpha_user` schema, versus an administrative UI/configuration-control workflow or another service endpoint.
- The exact minimally scoped payload and whether the complete `managed` configuration artifact is required; do not assume a partial `{objects:[...]}` body is accepted.
- Scalar type, length/character policies, requiredness, user-editability, visibility, and search/index behavior for each requested property.
- Required administrative role/scope and whether Cloud configuration writes require additional approval or asynchronous completion (`waitForCompletion=true` is supported by Frodo's generic config writer but is not proven required here).
- Impact on existing records, indexes, mappings, dynamic groups, and tokens.
- Revision/ETag or concurrency semantics, repeat-write behavior, and partial-failure behavior.
- Supported rollback, including whether a property can be removed or only disabled.

No schema or user-data mutation was performed in phase 5 or during this research. The safe next step is to obtain the authoritative tenant/provider documentation or an approved UI/configuration-control trace, compare it with a read-only export, then obtain explicit approval for one narrow mutation and controlled read/write/read-back verification.

## Task 6 runtime identity contract

The merchant runtime now treats the merchant JWT `sub` as the customer identity metadata only. It looks up `alpha_user` by the configured attribute pair (default `custom_merchantId` and `custom_merchantCustomerId`), creates users through IDM's auto-ID create endpoint without supplying `_id`, and generates a separate UUID `userName`. Every create outcome (`200`, `201`, or `409`) is followed by a pair lookup and exactly one matching record is required; a `409` is not accepted as success unless the pair is immediately readable, and duplicate matches fail closed. The read-back must contain a nonempty UUID `_id`, a UUID `userName`, and both configured merchant attributes before token exchange. Non-2xx lookup/create responses remain failures and are not converted into a broad fallback. The same attribute names are global desired-state settings for dynamic group conditions and are validated as distinct `custom_` properties.

Token diagnostics remain redacted by default. Caller-controlled trace headers/body flags cannot enable raw output unless the server also sets `AIC_ALLOW_RAW_TOKEN_TRACE=true`; even in that operator/demo mode, the payment service-account bearer token is never emitted as `rawToken`. The token-exchange mapping blocker remains explicit and is not hidden by diagnostics.

This does not remove the token-exchange mapping blocker. The payment provider trusted issuer/resource-owner configuration still uses `sub` as its configured identity claim, while payment users now have IDM-generated UUID identifiers. The tenant must explicitly support mapping that trusted merchant subject to the pair-backed payment user (or an equivalent approved resource-owner mapping) before the exchange can be considered complete. The runtime does not use the external subject as `_id`, `userName`, or a path and does not hide an `invalid_request` exchange response.

## Task 7 trusted-JWT/resource-owner mapping investigation

The current payment-provider desired state is `config/payment/aic/inputs/alpha/trusted-jwt-issuers.json`. It defines one issuer (`bravo-realm`) with:

- `issuer`: the merchant/provider OAuth issuer URL;
- `jwksUri`: the issuer JWKS endpoint;
- `jwksCacheTimeout`: `3600000`;
- `jwkStoreCacheMissCacheTime`: `60000`; and
- `resourceOwnerIdentityClaim`: `sub`.

The live read-only `/alpha` issuer list returned the same issuer ID and the same `resourceOwnerIdentityClaim: "sub"`, plus `allowedSubjects: []` and `consentedScopesClaim: "scope"`. It did not expose a second mapping field, managed-object type, query filter, merchant ID attribute, or UUID translation rule. The live `alpha_user` query returned UUID `_id` values and `userName` values, but no configured merchant metadata fields in the returned records; no user data was changed.

The pinned Frodo 4.1.7 declarations/source establish the trusted-issuer object fields as `allowedSubjects`, `jwksCacheTimeout`, `jwkSet`, `consentedScopesClaim`, `issuer`, `jwkStoreCacheMissCacheTime`, `resourceOwnerIdentityClaim`, and `jwksUri`. The issuer API is a realm-config CRUD wrapper at `/json<realm>/realm-config/agents/TrustedJwtIssuer/<id>`. Frodo has no additional resource-owner-to-managed-user mapping field or helper. The generated trusted-issuer template defaults `resourceOwnerIdentityClaim` to `sub`; its RFC 7523 helper only optionally restricts `allowedSubjects` and does not translate subjects.

The Ping AIC JWT-bearer documentation establishes that `iss` must match the trusted issuer, `sub` is mandatory, and `sub` is the resource-owner identifier by default. `resourceOwnerIdentityClaim` may select another claim as the resource-owner identity, but `sub` remains mandatory. The documented flow does not perform an arbitrary lookup from that claim to `alpha_user._id`; it explicitly allows a subject that does not correspond to an AIC identity. The AI-agent on-behalf-of documentation likewise expects an already-issued payment user access token whose `sub` is the managed-user UUID. IDM `rsFilter` `subjectMapping`/`staticUserMapping` is a separate IDM bearer-authentication feature, not an established OAuth trusted-JWT token-exchange mapping.

The application Step 1 exchange currently sends only `grant_type`, merchant `subject_token`, `subject_token_type`, `requested_token_type`, `scope`, `client_id`, and `client_secret`. It sends no `resource_owner`, `subject`, mapping selector, merchant ID, or payment UUID. The application deliberately creates an IDM-generated UUID `_id` and keeps merchant `sub` only in the pair-backed metadata, so the exchange cannot succeed by subject/_id equality. The blocker is therefore confirmed: no supported claim/field/configuration for mapping merchant-IDP `sub` to the pair-backed `alpha_user._id` has been established.

Safe options are: (1) obtain Ping/AIC confirmation of a supported scripted trusted-issuer configuration or other approved resource-owner mapping that resolves the merchant subject to the payment user UUID; (2) change the exchange architecture so an authenticated payment-realm token is issued first, with its `sub` already equal to the generated payment UUID, then use that token for the AI-agent exchange; or (3) if the product contract permits it, retain a stable payment-side identifier as the subject only after an approved identity-linking design. Do not add an undocumented issuer field, send an invented exchange parameter, or revert to using an external merchant subject as an IDM `_id`/path.

**Next approval gate:** obtain authoritative tenant/provider documentation or a supported scripted issuer example, then approve one narrow non-production validation with a known test user. The validation must prove issuer/claim configuration, token exchange success, returned access-token `sub` equals the generated payment `_id`, and read-back authorization scoping. No issuer, schema, user, or token-exchange mutation was performed during this investigation.

## Recommended improvements

Prioritize the following improvements before expanding live provisioning:

1. **Centralize status-gated upserts.** Require confirmed 404 for create fallback across OAuth2 clients, trusted issuers, applications, and AI Agents. Preserve the original error for every other status.
2. **Standardize structured diagnostics.** Use one redacting formatter and one action-error shape for all resources; include nested Frodo status/response details without secrets.
3. **Add contract tests against mocked Frodo operations.** Cover 404 create, 401/403 no-create, transport no-create, malformed-read no-create, successful identity/privilege read-back, and partial-link failures.
4. **Separate desired fields from server relationships.** Replace generic deep merge for relationship-bearing objects with resource-specific merge policies, especially for arrays and reverse links.
5. **Make create response verification mandatory.** After AI Agent creation, read the agent, identity, privileges, payment API application relationship, and merchant group relationship before reporting success.
6. **Document destructive-operation contracts.** Establish dependency inventories and rollback procedures for `deep` and non-deep application/AI Agent deletion; do not infer cascade safety from method names or defaults.
7. **Close the schema API gap.** Add an authoritative read-only discovery/describe path for managed-object schema writes to the MCP surface, including payload schema, permissions, revision semantics, and rollback guidance. Add a library method only after that contract is confirmed.
8. **Align CLI and MCP contracts.** Define which surface discovers, which surface mutates, and how both represent realms, relationships, pagination, statuses, and errors. Return explicit “unsupported” rather than silently falling back to a broader read or write.
9. **Pin and regression-test Frodo upgrades.** Treat changes to AI Agent identity shape, include-identity defaults, dependency deletion, and error wrapping as compatibility-sensitive. Review generated declarations and runtime behavior before changing 4.1.7.
10. **Keep safety boundaries visible.** Retain dry-run, explicit prune flags, no-secret logging, phase stopping on tenant failures, and explicit approval gates for schema and relationship mutations.

## Phase status

The application and Northwind OAuth2/AI Agent desired-state work is present, but the live first-class AI Agent create rejection remains unresolved and custom payment-provider user schema work remains blocked pending an authoritative write contract. These are known Frodo/tenant integration gaps, not reasons to weaken the identity or merchant authorization boundary.
