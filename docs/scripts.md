# Scripts

## Dev lifecycle scripts

Four shell wrappers in `scripts/` manage the five application services. They are wired to root pnpm commands and delegate to the managed lifecycle controller in `scripts/dev-process.mjs`.

### Recommended application workflow

```bash
pnpm dev:start
pnpm dev:status
pnpm dev:restart
pnpm dev:stop
```

`pnpm dev:restart` is the reliable post-change command: it stops the selected services, confirms their listeners are gone, removes their `.next` build/cache artifacts, and starts them again with route-aware readiness checks. Use `pnpm dev:restart -- --preserve-next` only when a cache-preserving restart is specifically wanted.

### Start and stop behavior

- `dev-start.sh`, `dev-stop.sh`, `dev-status.sh`, and `dev-restart.sh` are the four wrappers.
- Each service has ignored JSON state under `scripts/pids/<service>.json`; state records the managed process and start metadata.
- Start fails rather than skipping a configured port occupied by a foreign or unmanaged process.
- Stop validates ownership and refuses to kill an unrelated listener. Do not use a broad `lsof | kill` command.
- `--service <name>` limits start, stop, status, or restart to one managed application.
- Logs append stdout and stderr to `logs/<service>.log`; tail those files separately.

### `pnpm dev:status`

Status is strict by default and exits nonzero if any selected service is down, foreign/stale, or fails its route-aware HTTP readiness probe. It reports `OWNED`, `FOREIGN/STALE`, or `DOWN` with port and HTTP status. Use `--non-strict` only for a diagnostic report that should not fail its caller.

Readiness probes are defined in `scripts/dev-services.json`; they include `/api/health` for `payment-api`, `/admin/` for `payment-admin-web`, and `/chatbot/` for `chatbot-agent`.

---

## Merchant definition generator

### `pnpm merchant:create` → `scripts/create-merchant.mjs`

Creates a local merchant definition under `config/merchants/<id>/`. Interactive prompts collect the canonical ID, brand, tagline, domain, assistant name, theme primary color, and optional logo. Use `--non-interactive` with `--id`, `--brand`, `--tagline`, and `--domain` for automation.

```bash
pnpm merchant:create -- --dry-run
pnpm merchant:create -- --non-interactive --id contoso --brand "Contoso Goods" \
  --tagline "Everyday goods, thoughtfully chosen" --domain contoso.mytest.run \
  --logo ./assets/contoso-mark.svg --dry-run
```

`--dry-run` performs no writes. The generator refuses existing targets unless `--force` is provided, validates IDs/domains/colors/logo paths, and never calls the live identity provider, creates credentials, edits `.env.local`, or changes DNS/Caddy. It is a scaffolding step only; complete `onboarding.json`, review the generated files, and run the AIC provisioner dry-run separately. See [merchant-onboarding.md](./merchant-onboarding.md).

## AIC provisioner

## Caddy lifecycle

Caddy is required for the standard HTTPS/path-routed demo and is managed separately from the five application services.

```bash
pnpm caddy:start
pnpm caddy:status
pnpm caddy:reload
pnpm caddy:stop
```

The controller validates `Caddyfile` with the `caddyfile` adapter and uses repository-local state under `.caddy-data/`. If a matching Caddy process was started manually with this repository's `Caddyfile`, `pnpm caddy:status` and `pnpm caddy:start` safely adopt it and repair stale state. They never adopt or stop an unrelated Caddy process. Direct localhost app ports are available for limited app-only development, but they do not reproduce the public demo routing.

## AIC provisioner

### `pnpm --filter @acme/aic-config provision`

Reads payment-provider desired state from realm directories under `config/payment/aic/inputs/` and merchant desired state from `config/merchant/aic/inputs/bravo/`, then idempotently creates or updates resources in a live Ping AIC tenant. Uses the `@rockcarver/frodo-lib` SDK.

**Required configuration** (see [environment.md](./environment.md) for full descriptions):

| Source                                                 | Purpose                                                                                                                                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| frodo connection profile (`~/.frodo/Connections.json`) | AIC service account credentials — the provisioner calls `frodo.conn.getConnectionProfileByHost` to retrieve the service account ID and JWK; no env vars needed for authentication |
| `BRAVO_USER_DEFAULT_PASSWORD` (env var)                | Initial password assigned to demo merchant IDP users on creation                                                                                                                  |

If the frodo connection profile for the AIC tenant is missing or has no service account credentials, the provisioner exits with a descriptive error. Run `frodo conn save https://openam-volker-dev.forgeblocks.com/am` to create or refresh the profile. `BRAVO_USER_DEFAULT_PASSWORD` is optional — if absent a built-in fallback is used and a warning is printed.

### What the provisioner creates

Resources are declared in realm-specific JSON directories: payment-provider resources in `config/payment/aic/inputs/alpha/` and merchant resources in `config/merchant/aic/inputs/bravo/`. The provisioner performs an **upsert**: if a resource exists it is updated (deep-merge); if it does not exist it is created.

**Payment provider IDP (alpha realm):**

| Resource type          | IDs                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| OAuth2Client           | `payment-api`, `payment-user-web`, `payment-admin-web`                                                                         |
| OAuth2Client           | `chatbot-agent` (legacy client retained; Northwind replacement is opt-in)                                                      |
| OAuth2Client           | `payment-bridge` — confidential, `authorization_code` grant; used only server-side by `chatbot-agent`'s Step 1 session→token bridge |
| AIAgent                | `northwind-chatbot-agent` (desired identity; migration deletes only its OAuth2 client)                                         |
| Application            | `payment-api`, `payment-user-web`, `payment-admin-web` — payment-provider applications linked to the matching OAuth2 clients   |
| OAuth2TrustedJwtIssuer | `bravo-realm` — registers the merchant IDP as a trusted JWT issuer, used by `merchant-web`'s own `alpha-token.ts` (account/products/checkout pages, unrelated to the chatbot). The chatbot's own Step 1 (`merchant-token-login` journey) validates issuers dynamically per merchant instead, not via this tenant-wide registration |
| Organization           | `northwind` (`alpha_organization`, keyed by the custom `merchantId` attribute) — one record per onboarded merchant, carrying that merchant's `merchantTrustedIssuerConfig` read dynamically by the journey below |
| Journey                | `merchant-token-login` — validates a merchant ID token against the target merchant's `Organization` record and JIT-provisions/updates the corresponding `alpha_user`; see [identity.md](./identity.md) |
| MerchantGroup (opt-in) | `mrch-northwind` — dynamic group for `custom_merchantId == "northwind"`; desired state is gated until the custom schema exists |

**Merchant IDP (bravo realm):**

| Resource type                  | IDs                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| OAuth2Client                   | `merchant-web`                                                                       |
| OAuth2Client                   | `merchant-bridge` — public, `authorization_code` + PKCE; the additive, payment-provider-owned client the chatbot widget uses for silent SSO. Never touches `merchant-web`'s own client/config. |
| Application                    | `merchant-web`                                                                       |
| BravoUser (managed/bravo_user) | Three demo shoppers from `data/users.json` (Ada Lovelace, Grace Hopper, Alan Turing) |

Demo users are created with `BRAVO_USER_DEFAULT_PASSWORD` as their initial password. On subsequent runs the profile fields are updated but the password is left unchanged to avoid accidental credential resets.

### Controlled Northwind chatbot migration

`northwind-chatbot-agent` is deliberately absent from `config/payment/aic/inputs/alpha/oauth2-clients.json`; it remains only in `ai-agents.json`. The legacy `chatbot-agent` OAuth2 client is untouched. The replacement is destructive and requires the explicit opt-in flag:

```bash
# Deterministic plan; no tenant reads or writes (the Frodo connection profile is still loaded)
pnpm --filter @acme/aic-config provision -- --dry-run

# Apply only after reviewing the plan and approving the generated OAuth2 secret impact
pnpm --filter @acme/aic-config provision -- --replace-northwind-chatbot-client
```

Live migration behavior is narrowly gated. The original destructive attempt deleted the target OAuth2 client, then AIC returned HTTP 500 `AI Agent: Failed to create agent identity.` The retry path therefore performs no deletion: it requires an explicit flag, confirms both the target OAuth2 client and AI Agent are 404, and creates from the non-secret desired agent configuration. The create payload includes both flattened `aiAgentIdentityAttributes` and Frodo's nested `_aiAgentIdentity` with an empty `_privileges` array; no identity UUID is generated. The create response identity `_id` is authoritative when present. With Frodo 4.1.7, whose create response may omit it, the provisioner performs one immediate identity-inclusive read as the documented fallback and then validates the returned identity ID. Any missing or mismatched identity stops the phase without further mutation. The legacy `chatbot-agent` client remains untouched, and secrets are never printed.

### Journey and organization provisioning

Unlike the Northwind chatbot migration, `Organization` and `Journey` desired state is upserted unconditionally on every run — plain `frodo journey import` (no `--re-uuid`) is Frodo's own idempotent, PUT-by-ID mechanism, safe to run repeatedly:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run   # shows Organization[northwind], Journey[merchant-token-login]
pnpm --filter @acme/aic-config provision                # upserts both, along with everything else
```

Use `--merchant-id <id>` to restrict organization, group, and demo-user actions to one merchant during review. This does not mutate the tenant during dry-run:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run --merchant-id contoso
```

`merchant-token-login` was cloned from an earlier proof-of-concept journey named `poc-jwt-login` (fresh node/inner-node UUIDs via one-time `--re-uuid`, never repeated) and verified live before being adopted as desired state. The old journey is retired via a separate, explicitly opt-in one-time flag — dormant by default, and only meant to run after the new journey has been verified end-to-end in production use:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run --migrate-merchant-token-login-journey
pnpm --filter @acme/aic-config provision -- --migrate-merchant-token-login-journey
```

This performs a deep delete of `poc-jwt-login` (its own now-orphaned nodes/inner-nodes; shared scripts like the default Config Provider script are untouched) with a 404 read-back verification. It does not run as part of a normal `provision` invocation.

### Merchant group provisioning (schema-gated)

Merchant group desired state is isolated behind `--provision-merchant-groups`. The global settings in `inputs/merchant-groups.json` are prefix `mrch`, merchant ID attribute `custom_merchantId`, and merchant customer identity attribute `custom_merchantCustomerId`; the merchant registry currently contains `northwind`, so the derived group is `mrch-northwind` and its condition is `custom_merchantId == "northwind"`.

Dry-run is always safe and prints the intended group without reading or writing the tenant:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run --provision-merchant-groups
```

Normal provisioning does not touch groups. A live group attempt requires both the explicit flag and `AIC_MERCHANT_SCHEMA_APPROVED=true`; the provisioner then reads `alpha_user` schema and refuses before any group write when either custom property is absent. Do not set the gate until the custom schema write contract and approval are complete. Runtime JIT provisioning uses the same gate and remains blocked while schema work is unresolved; when enabled, it queries by `(custom_merchantId, custom_merchantCustomerId)`, omits `_id` for IDM UUID generation, and generates a separate UUID `userName`.

### Dry run

Preview what the provisioner would do without making any tenant API calls. The optional prune flag reports its fixed cleanup target without reading or deleting tenant data:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run
pnpm --filter @acme/aic-config provision -- --dry-run --prune-stale-applications
```

Output:

```
--- Dry-run plan ---
  dry-run  OAuth2Client               [/alpha] payment-user-web
  dry-run  OAuth2Client               [/alpha] payment-admin-web
  dry-run  OAuth2Client               [/alpha] payment-api
  dry-run  OAuth2Client               [/alpha] chatbot-agent
  dry-run  OAuth2Client               [/alpha] payment-bridge
  planned  OAuth2Client               [/alpha] northwind-chatbot-agent
  planned  AIAgent                    [/alpha] northwind-chatbot-agent
  dry-run  Application                [/alpha] payment-api
  dry-run  Application                [/alpha] payment-user-web
  dry-run  Application                [/alpha] payment-admin-web
  dry-run  OAuth2TrustedJwtIssuer     [/alpha] bravo-realm
  dry-run  Organization               [/alpha] northwind
  dry-run  Journey                    [/alpha] merchant-token-login
  dry-run  OAuth2Client               [/bravo] merchant-web
  dry-run  OAuth2Client               [/bravo] merchant-bridge
  dry-run  Application                [/bravo] merchant-web
  dry-run  BravoUser                  [/bravo] <user-id-1>
  dry-run  BravoUser                  [/bravo] <user-id-2>
  dry-run  BravoUser                  [/bravo] <user-id-3>
--- End dry-run plan ---
```

A frodo connection profile for the AIC tenant is required even for `--dry-run` — the provisioner resolves credentials from the profile before printing the plan. Only the actual AIC API calls are skipped during a dry run.

### Run output

When run live (without `--dry-run`), the provisioner writes a timestamped JSON summary to `config/payment/aic/outputs/provision-run-<timestamp>.json`. The file records every action taken (`created`, `updated`, `skipped`) along with the resource type, realm, and ID.

### Running the provisioner

Ensure a frodo connection profile exists for the AIC tenant (run once):

```bash
frodo conn save https://openam-volker-dev.forgeblocks.com/am
```

Then set the bravo user password and run:

```bash
export BRAVO_USER_DEFAULT_PASSWORD='<initial-password>'

# Preview plan (frodo profile is read, but no AIC API calls are made)
pnpm --filter @acme/aic-config provision -- --dry-run

# Apply (does not prune stale applications)
pnpm --filter @acme/aic-config provision

# Explicitly prune only alpha merchant-web, non-deep, after reviewing the dry-run
pnpm --filter @acme/aic-config provision -- --prune-stale-applications
```

Alternatively, copy `config/payment/aic/.env.example` to `config/payment/aic/.env` and fill in the values, then source it before running:

```bash
cp config/payment/aic/.env.example config/payment/aic/.env
# edit config/payment/aic/.env
source config/payment/aic/.env
pnpm --filter @acme/aic-config provision
```
