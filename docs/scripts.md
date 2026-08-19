# Scripts

## Dev lifecycle scripts

Three shell scripts in `scripts/` manage the dev server lifecycle. They are wired to pnpm commands at the repo root.

### `pnpm dev:start` → `scripts/dev-start.sh`

Starts all five apps as background processes.

- Runs `nohup pnpm --filter <pkg> dev` for each app.
- Writes each process's PID to `scripts/pids/<pkg>.pid` so `dev-stop.sh` can kill it later.
- Checks whether each port is already occupied (via `lsof -ti tcp:<port>`). If a process is already listening, that app is skipped with a message — no duplicate starts.
- Appends stdout and stderr to `logs/<pkg>.log`. The `logs/` directory is created automatically; log files are gitignored.

After all apps start:

```bash
pnpm dev:start
# Starting Acme Payments / Northwind Retail dev servers...
#   Northwind Retail (merchant-web)       — started (PID 12345) → http://localhost:3000  |  logs/merchant-web.log
#   ...
# Run 'pnpm dev:status' to check service health.
```

To tail a log while a service is running:

```bash
tail -f logs/merchant-web.log
tail -f logs/chatbot-agent.log
```

### `pnpm dev:stop` → `scripts/dev-stop.sh`

Stops all five apps.

1. Reads `scripts/pids/<pkg>.pid` and sends `SIGTERM` to the recorded PID.
2. If the PID file is absent or the recorded process is no longer alive, falls back to `lsof -ti tcp:<port>` to find and kill whatever is listening on that port.
3. If nothing is listening on the port, prints `not running on :<port>`.

### `pnpm dev:status` → `scripts/dev-status.sh`

Reports the live/down status of each service.

- Uses `lsof -ti tcp:<port>` to determine whether anything is listening.
- Prints `UP` or `DOWN` with PID and URL for each app.
- If `DOWN` but a stale PID file exists, notes the stale PID alongside the status.

```
Service status:

  UP      Northwind Retail (merchant-web)       PID 12345  →  http://localhost:3000
  UP      Acme Payments consumer (payment-user-web)  PID 12346  →  http://localhost:3001
  DOWN    Acme Payments API     (payment-api)        nothing listening on :3003
```

---

## AIC provisioner

### `pnpm --filter @acme/aic-config provision`

Reads the desired-state configuration from `config/aic/inputs/` and idempotently creates or updates resources in a live Ping AIC tenant. Uses the `@rockcarver/frodo-lib` SDK.

**Required configuration** (see [environment.md](./environment.md) for full descriptions):

| Source | Purpose |
| --- | --- |
| frodo connection profile (`~/.frodo/Connections.json`) | AIC service account credentials — the provisioner calls `frodo.conn.getConnectionProfileByHost` to retrieve the service account ID and JWK; no env vars needed for authentication |
| `BRAVO_USER_DEFAULT_PASSWORD` (env var) | Initial password assigned to demo merchant IDP users on creation |

If the frodo connection profile for the AIC tenant is missing or has no service account credentials, the provisioner exits with a descriptive error. Run `frodo conn save https://openam-volker-dev.forgeblocks.com/am` to create or refresh the profile. `BRAVO_USER_DEFAULT_PASSWORD` is optional — if absent a built-in fallback is used and a warning is printed.

### What the provisioner creates

Resources are declared in `config/aic/inputs/` as JSON files. The provisioner performs an **upsert**: if a resource exists it is updated (deep-merge); if it does not exist it is created.

**Payment provider IDP (alpha realm):**

| Resource type | IDs |
| --- | --- |
| OAuth2Client | `payment-api`, `payment-user-web`, `payment-admin-web` |
| AIAgent | `chatbot-agent` |
| OAuth2TrustedJwtIssuer | `bravo-realm` — registers the merchant IDP as a trusted JWT issuer for Step 1 token exchange |

**Merchant IDP (bravo realm):**

| Resource type | IDs |
| --- | --- |
| OAuth2Client | `merchant-web` |
| BravoUser (managed/bravo_user) | Three demo shoppers from `data/users.json` (Ada Lovelace, Grace Hopper, Alan Turing) |

Demo users are created with `BRAVO_USER_DEFAULT_PASSWORD` as their initial password. On subsequent runs the profile fields are updated but the password is left unchanged to avoid accidental credential resets.

### Dry run

Preview what the provisioner would do without making any API calls:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run
```

Output:

```
--- Dry-run plan ---
  dry-run  OAuth2Client               [/alpha] payment-api
  dry-run  OAuth2Client               [/alpha] payment-user-web
  dry-run  OAuth2Client               [/alpha] payment-admin-web
  dry-run  AIAgent                    [/alpha] chatbot-agent
  dry-run  OAuth2TrustedJwtIssuer     [/alpha] bravo-realm
  dry-run  OAuth2Client               [/bravo] merchant-web
  dry-run  BravoUser                  [/bravo] <user-id-1>
  dry-run  BravoUser                  [/bravo] <user-id-2>
  dry-run  BravoUser                  [/bravo] <user-id-3>
--- End dry-run plan ---
```

A frodo connection profile for the AIC tenant is required even for `--dry-run` — the provisioner resolves credentials from the profile before printing the plan. Only the actual AIC API calls are skipped during a dry run.

### Run output

When run live (without `--dry-run`), the provisioner writes a timestamped JSON summary to `config/aic/outputs/provision-run-<timestamp>.json`. The file records every action taken (`created`, `updated`, `skipped`) along with the resource type, realm, and ID.

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

# Apply
pnpm --filter @acme/aic-config provision
```

Alternatively, copy `config/aic/.env.example` to `config/aic/.env` and fill in the values, then source it before running:

```bash
cp config/aic/.env.example config/aic/.env
# edit config/aic/.env
source config/aic/.env
pnpm --filter @acme/aic-config provision
```
