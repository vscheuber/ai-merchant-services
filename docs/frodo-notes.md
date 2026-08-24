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

The current payment-provider desired state is `config/payment/aic/inputs/alpha/trusted-jwt-issuers.json`. Its exact issuer payload is:

```json
{
  "_id": "bravo-realm",
  "issuer": "https://idc.mytest.run:443/am/oauth2",
  "jwksCacheTimeout": 3600000,
  "jwkStoreCacheMissCacheTime": 60000,
  "jwksUri": "https://idc.mytest.run/am/oauth2/connect/jwk_uri",
  "resourceOwnerIdentityClaim": "sub"
}
```

The live read-only `/alpha` issuer list returned the same issuer ID and `resourceOwnerIdentityClaim: "sub"`, plus `allowedSubjects: []` and `consentedScopesClaim: "scope"`. It did not expose a second mapping field, managed-object type, query filter, merchant ID attribute, or UUID translation rule. The live `alpha_user` query returned UUID `_id` values and `userName` values, but no configured merchant metadata fields in the returned records; no user data was changed.

### Ping-supported scripted issuer surface

Ping/ForgeRock-provided AIC/AM material is present in the Frodo CLI Cloud and ForgeOps exports and default script template. The authoritative public documentation is [AIC OAuth 2.0 JWT Bearer grant](https://docs.pingidentity.com/pingoneaic/latest/am-oauth2/oauth2-jwt-bearer-grant.html), which defines the trusted issuer profile, resource-owner claim, and allowed-subject behavior, and [AIC Token Exchange](https://docs.pingidentity.com/pingoneaic/latest/am-oauth2/token-exchange.html), which limits token exchange to tokens issued by the same OAuth provider and documents claim-copy behavior.

- `frodos/vscheuber/frodo-cli/test/e2e/exports/all-separate/cloud/global/scripttype/OAUTH2_SCRIPTED_JWT_ISSUER.scripttype.json`
- `frodos/vscheuber/frodo-cli/test/e2e/exports/all-separate/cloud/realm/root-alpha/script/OAuth2-JWT-Issuer-Script.script.json`
- `frodos/vscheuber/frodo-cli/test/e2e/exports/all-separate/cloud/realm/root-alpha/script/OAuth2-JWT-Issuer-Script.script.js`

The supported scripted issuer context receives `issuer`, `realm`, `scriptName`, `logger`, `httpClient`, `idRepository`, and `secrets`. It returns `org.forgerock.oauth2.core.TrustedJwtIssuerConfig`, whose documented constructor/payload is:

```text
TrustedJwtIssuerConfig(
  issuer,
  resourceOwnerIdentityClaim,
  consentedScopesClaim,
  allowedSubjects,
  jwkSet,
  jwksUri,
  jwksCacheTimeout,
  jwkStoreCacheMissCacheTime
)
```

The supplied example uses `idRepository.getIdentity(issuer)` to load issuer configuration and returns issuer metadata plus an allowed-subject list (example source: `mail`). It does not receive the JWT subject as a mapping callback, return a managed-user UUID, rewrite `sub`, or perform a token-exchange resource-owner lookup. Scripted JWT issuer support can dynamically derive trusted-issuer configuration and restrict accepted subjects; it is **not established as a supported external-subject-to-`alpha_user._id` mapping mechanism**. Returning a payment UUID in `allowedSubjects` would only allow that exact incoming subject; it would not translate a merchant subject into that UUID.

The pinned Frodo 4.1.7 declarations/source independently establish the trusted-issuer fields as `allowedSubjects`, `jwksCacheTimeout`, `jwkSet`, `consentedScopesClaim`, `issuer`, `jwkStoreCacheMissCacheTime`, `resourceOwnerIdentityClaim`, and `jwksUri`. The issuer API is a realm-config CRUD wrapper at `/json<realm>/realm-config/agents/TrustedJwtIssuer/<id>`. Frodo has no additional resource-owner-to-managed-user mapping field or helper, and no token-exchange request parameter for one. Its template defaults `resourceOwnerIdentityClaim` to `sub`; its RFC 7523 helper only optionally restricts `allowedSubjects` and does not translate subjects.

The Ping JWT-bearer/script contract establishes that `iss` must match the trusted issuer, `sub` is mandatory, and the configured resource-owner claim identifies the resource owner. Neither the script contract nor the issuer payload documents an arbitrary lookup from that claim to `alpha_user._id`. The AI-agent on-behalf-of flow likewise expects an already-issued payment user access token whose `sub` is the managed-user UUID. IDM `rsFilter` `subjectMapping`/`staticUserMapping` is a separate IDM bearer-authentication feature, not an established OAuth trusted-JWT token-exchange mapping.

The application Step 1 exchange sends this exact form shape (values redacted):

```text
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<merchant access token>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
requested_token_type=urn:ietf:params:oauth:token-type:access_token
scope=openid profile email
client_id=<payment-api client>
client_secret=<payment-api secret>
```

It sends no `resource_owner`, `subject`, mapping selector, merchant ID, or payment UUID. The application deliberately creates an IDM-generated UUID `_id` and keeps merchant `sub` only in pair-backed metadata, so the exchange cannot succeed by subject/`_id` equality. **Conclusion: no supported Ping/Frodo scripted mapping has been found that resolves the external merchant subject to the generated payment `alpha_user` UUID or otherwise issues the correct payment resource owner.** Do not add an undocumented issuer field, send an invented exchange parameter, or revert to using an external merchant subject as an IDM `_id`/path.

The minimal alternative is to issue an authenticated payment-realm user token first, with `sub` already equal to the generated payment UUID, and use that token for the AI-agent exchange. If that architecture is not acceptable, obtain Ping/AIC confirmation of another supported resource-owner mapping product/configuration before changing the flow; do not infer one from IDM mappings or the scripted issuer example.

**Next approval gate:** obtain authoritative Ping/AIC confirmation of a supported resource-owner mapping (or approve the payment-token-first alternative), then approve one narrow non-production validation with a known test user. The validation must prove issuer/claim configuration, token exchange success, returned access-token `sub` equals the generated payment `_id`, and read-back authorization scoping. No issuer, script, schema, user, or token-exchange mutation was performed during this investigation.

## Task 8 scripted-issuer and Next Generation binding investigation

The proposed workaround was investigated against the Ping documentation and the local Frodo exports. The important distinction is between (a) a scripted issuer resolving issuer configuration and (b) token processing resolving the resource owner from a claim. The first is supported; the second is claim-based and does not provide a callback that can rewrite an incoming merchant subject.

### Confirmed scripted-issuer contract

The AIC JWT-bearer documentation says a scripted JWT issuer may be created as either **Next Generation or Legacy** and must return `org.forgerock.oauth2.core.TrustedJwtIssuerConfig`. Its example uses the supplied `issuer` value to retrieve an external identity via `idRepository`, reads the issuer JWK data, and returns issuer metadata. The JWT must contain both `iss` and `sub`; the example uses both to identify the external entity. The documented `resourceOwnerIdentityClaim` is the name of the claim containing the AIC resource-owner identifier, not the identifier value itself.

The public documentation describes these supported inputs/outputs, but does not say that the complete JWT claims map or the incoming `sub` is passed as a separate script argument. The local default template is more precise about the legacy/scripted-issuer binding: the available variables are `issuer`, `realm`, `scriptName`, `logger`, `httpClient`, `idRepository`, and `secrets`, and the return value is a `TrustedJwtIssuerConfig`. It does not list `openidm`, `jwtAssertion`, `jwtValidator`, `request`, or a subject/claims object.

Local evidence:

- `frodos/vscheuber/frodo-cli/test/e2e/exports/all-separate/cloud/global/scripttype/OAUTH2_SCRIPTED_JWT_ISSUER.scripttype.json` has `bindings: []`, evaluator version `1.0`, and a legacy AM/ForgeRock allow-list. The allow-list includes `TrustedJwtIssuerConfig`, `ScriptedIdentityRepository`, and `PromiseImpl`, but no Next Generation binding descriptor and no `openidm` binding entry.
- `frodos/vscheuber/frodo-cli/test/e2e/exports/all-separate/cloud/realm/root-alpha/script/OAuth2-JWT-Issuer-Script.script.js` documents exactly the variables above and constructs `new frJava.TrustedJwtIssuerConfig(issuer, 'sub', 'scope', allowedSubjects, jwkSet, jwksUri, jwksCacheTimeout, jwkStoreCacheMissCacheTime)`.
- `frodos/vscheuber/frodo-cli/src`/the pinned library API exposes only the trusted-issuer configuration fields `allowedSubjects`, `jwksCacheTimeout`, `jwkSet`, `consentedScopesClaim`, `issuer`, `jwkStoreCacheMissCacheTime`, `resourceOwnerIdentityClaim`, and `jwksUri`; the REST wrapper is `/json<realm>/realm-config/agents/TrustedJwtIssuer/<id>`. None is a managed-user ID mapping field.

The AIC common-bindings documentation separately states that `openidm` is a **Next Generation-only** binding and exposes `create`, `read`, `update`, `delete`, `patch`, `action`, and `query`. Its IDM scripting reference documents `openidm.query(resourceName, params, fields)`, a result object with `result` and `resultCount`, common-filter `_queryFilter`, and optional paging/sorting parameters. However, the common-bindings page does not explicitly list `OAUTH2_SCRIPTED_JWT_ISSUER` as a Next Generation context, and the issuer export above does not establish that selecting the Next Generation UI variant adds `openidm` to this context. This is a **confirmed binding distinction** plus an **unresolved deployment/version question**, not evidence that `openidm` is callable from the issuer script.

### Why the proposed lookup cannot perform the requested mapping

Even if Ping confirms that a Next Generation scripted issuer instance can use `openidm.query`, the query would need an input value. The documented issuer script receives `issuer` (the JWT `iss` value), not the JWT `sub` or a `custom_merchantCustomerId` argument. A hypothetical query would therefore only be meaningful if the configured JWT issuer itself were the customer key, which is not the merchant-customer flow:

```javascript
// Illustrative validation pseudocode only; not an approved production script.
var q = openidm.query(
  'managed/alpha_user',
  { _queryFilter: 'custom_merchantCustomerId eq "' + escapedCustomerId + '"' },
  ['_id', 'custom_merchantCustomerId']
);
if (q.resultCount !== 1) { return null; }
var paymentId = q.result[0]._id;
```

The query API can return `_id`; this is **confirmed by the IDM scripting documentation**. The missing `escapedCustomerId` binding and the missing return channel are the blockers. `TrustedJwtIssuerConfig.resourceOwnerIdentityClaim` can be set to a claim name such as `sub` or `payment_user_id`; it cannot be set to the generated UUID value and does not rewrite the incoming claim. Returning `paymentId` in `allowedSubjects` would only allow a token whose incoming subject already equals that UUID. It is an allow-list, not a subject translation map. Returning an arbitrary object with a `resourceOwner`/`resourceOwnerId` field is not a documented constructor or supported issuer return contract.

Token exchange independently closes this path: AIC documents that exchanged tokens preserve subject and issuer claims from the subject token. It does not document a trusted-issuer script callback that replaces the subject after an IDM lookup. Therefore a merchant token with `sub = merchant-subject` cannot become a payment token with `sub = generated-alpha_user._id` merely because a script queried `alpha_user`.

### Inference versus confirmed contract

- **Confirmed:** `openidm.query` exists as a Next Generation binding; its documented call is `openidm.query(resourceName, params, fields)` and its result contains `result`/`resultCount`.
- **Confirmed:** `TrustedJwtIssuerConfig` carries issuer metadata, claim-name strings, key material/cache values, and an allowed-subject collection; no generated-resource-owner value field is documented.
- **Confirmed:** `resourceOwnerIdentityClaim` names the claim containing the resource-owner identifier; it is not a value substitution operation.
- **Confirmed:** AIC token exchange copies the subject and issuer claims from the subject token; no subject rewrite is documented.
- **Confirmed:** the local `OAUTH2_SCRIPTED_JWT_ISSUER` export has no declared `openidm` binding and the default template has no subject/claims input.
- **Inference requiring tenant/version validation:** the AIC UI may allow a Next Generation issuer script whose runtime receives `openidm` even though the exported default context is legacy-shaped. No local export, API declaration, or public page inspected here proves that combination.
- **Inference rejected as unsupported:** `openidm.query` + `TrustedJwtIssuerConfig` cannot by itself translate `custom_merchantCustomerId` to `_id` for the incoming token. The script has no documented per-token customer input and the config has no subject-value return field.

### Concrete no-mutation validation plan

1. Obtain Ping/AIC confirmation for the exact tenant release that **OAUTH2_SCRIPTED_JWT_ISSUER** may run as Next Generation, including the complete binding list and whether `openidm.query` is available. Do not rely on the UI label alone.
2. In a disposable non-production realm, create only a diagnostic script that logs binding presence/type (never token values), invokes `openidm.query` against `managed/alpha_user` with a fixed test filter, and returns the normal `TrustedJwtIssuerConfig` for a known issuer. First validate script compilation and issuer resolution with a signed test JWT.
3. If the binding is present, validate exact filter escaping, permission scope, result cardinality (`0`, `1`, and duplicate matches), UUID `_id` read-back, timeout behavior, and whether query is synchronous in this context. The public IDM page documents the call/result shape but not issuer-context async behavior; do not use `await` or promise chaining until the tenant runtime proves it.
4. Separately test whether the incoming JWT `sub` or a custom claim is exposed to the script. If no per-token customer value is exposed, stop; do not derive it from `issuer`.
5. If an upstream component can issue a JWT containing `payment_user_id = alpha_user._id`, configure `resourceOwnerIdentityClaim: 'payment_user_id'` and verify the resulting token's resource-owner behavior. This tests claim selection, not script-based translation.
6. For the current merchant-token flow, validate the supported alternatives: issue a payment-provider token whose `sub` is already the generated `_id`, or obtain an explicit Ping-approved token-exchange/resource-owner mapping mechanism. Prove issuer validation, exchange success, returned `sub == alpha_user._id`, and downstream authorization read-back.

No issuer, script, schema, user, or token mutation was performed. The proposed lookup should remain a hypothesis/diagnostic test until the exact Next Generation issuer binding and a supported claim-to-resource-owner mechanism are confirmed.

## Task 9 — RESOLVED: journey-based merchant-subject mapping

The Task 7/8 blocker is superseded, not fixed within the trusted-issuer/token-exchange surface those tasks investigated. A different, correct design — built and live-tested outside this document's investigation — resolves the underlying problem entirely inside AM/IDM:

- A journey (in `/alpha`, to be provisioned as `merchant-token-login`) validates the merchant OIDC ID token per-merchant, using a **`ConfigProviderNode`** whose script reads per-merchant trust configuration (`merchantTrustedIssuerConfig`) from a new custom attribute on a **managed `Organization`** object (`alpha_organization`), keyed by another custom attribute (`merchantId`). This config is fed into a wrapped **`OidcNode`** ("OIDC ID Token Validator") to validate the token dynamically, per request — there is no single static `OAuth2TrustedJwtIssuer` to configure at all for this flow.
- A transformation script (context `OIDC_NODE`) maps the validated token's claims to profile attributes, notably `sub → custom_merchantCustomerId`.
- `IdentifyExistingUserNode`/`CreateObjectNode`/`PatchObjectNode` (against `managed/alpha_user`) resolve or JIT-create the payment identity by `custom_merchantCustomerId`, entirely inside AM — the payment `_id`/`userName` remain IDM-generated, exactly per the Task 6 runtime contract above; the merchant subject never becomes the managed-object path or `_id`.

Task 7/8's specific finding — "no supported mapping from an external subject to a generated `alpha_user` UUID exists in the trusted-issuer/token-exchange surface" — is **not contradicted**. The resolution works by not using that surface at all.

**Resellability**: onboarding a new merchant is "add one `Organization` record describing their issuer" plus registering one new OIDC client in their realm for silent SSO — no new journey, no payment-provider code change, no per-merchant AM/IDM configuration beyond that record. See the cross-project tracker (`/Users/volker.scheuber/Documents/Projects/frodos/frodo-tracker.md`, Section 9) for the full node-by-node trace, confirmed journey clone/rename mechanics (`frodo journey export`/`import`, `--re-uuid` semantics, script-reference preservation), and the confirmed AM-session→OAuth-token bridging pattern used downstream.

**Schema note**: `custom_merchantId`/`custom_merchantCustomerId` — flagged as blocked pending an authoritative write contract in Task 6 above — are now live on the `alpha_user` schema (`type: string`, `searchable: false`). The exact write mechanism used was not captured by this document; the schema-write contract questions in "Open schema questions" below remain open in the abstract even though this specific instance succeeded.

**MCP tool bug found this session**: `oauth2oidc.client.*` Frodo MCP skills silently ignore the `realm` parameter and always execute against `/alpha`, regardless of the realm requested — confirmed via identical request URLs for both `/alpha`- and `/bravo`-targeted calls; the tool's own `metadata.scope.appliedRealm` field echoed the requested realm without reflecting the actual (wrong) realm hit. `authn.journey.*`, `authn.node.*`, and `idm.managed.*` skills correctly honored realm switching. Any earlier finding — in this document or elsewhere — describing live `/bravo` OAuth2-client state should be treated as unverified unless it was cross-checked via the Frodo CLI directly (`frodo oauth client list --long <host> bravo`).

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

The application and Northwind OAuth2/AI Agent desired-state work is present. The custom payment-provider user schema attributes are now live (see Task 9). The merchant-subject-to-payment-UUID mapping blocker is resolved via the journey-based design in Task 9, pending: cloning `poc-jwt-login` to a production name, adding provisioner support for journeys/organizations/the two new bridging OAuth2 clients, and moving the runtime Step 1 flow into `apps/chatbot-agent`. These are tracked as in-progress implementation work, not open blockers.
