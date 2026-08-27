# Merchant Onboarding

This project uses one maintained storefront runtime with external merchant definitions. Do not copy `apps/merchant-web` for each merchant: every merchant deployment runs the same runtime with a different `MERCHANT_ID` and mounted configuration. This ensures template fixes and new capabilities are inherited by every deployment.

## Configuration model

Merchant presentation and deployment metadata live under `config/merchants/<merchantId>/`:

```text
config/merchants/
  registry.json
  northwind/
    definition.json
    theme.json
    onboarding.json
    assets/logo.svg
```

The canonical merchant ID is the same value used in merchant and payment-provider configuration, such as `northwind` or `contoso`. A derived payment-provider group may be named `mrch-northwind`; that prefix is not a second merchant ID.

`definition.json` owns brand, tagline, domains, assistant name, catalog scope, and onboarding status. `theme.json` owns light/dark semantic tokens, radius, and font settings. `onboarding.json` contains non-secret issuer, audience, client, and callback metadata. Never store OAuth secrets, service-account keys, passwords, or bridge credentials in these files.

Run the shared runtime with a selected definition through the managed lifecycle controller:

```bash
MERCHANT_ID=northwind \
MERCHANT_CONFIG_DIR="$PWD/config/merchants" \
pnpm dev:start -- --service merchant-web
```

After changing the selected definition, use `pnpm dev:restart -- --service merchant-web` so the managed process is stopped, its Next.js cache is cleaned, and readiness is verified.

## Brand assets

The storefront header renders the logo in a `32 × 32` CSS-pixel square. The embedded assistant renders it in a `24 × 24` square. Both use contain sizing.

Provide:

- A square 1:1 mark, preferably SVG with a square `viewBox`.
- Transparent background unless the brand requires a background.
- At least `128 × 128` pixels for raster assets; `256 × 256` is preferred.
- Artwork inset by roughly 10% so it remains legible at 24px.
- A separate square mark when the brand also has a wide wordmark.

Test the mark on light and dark backgrounds. A root-relative URL is resolved by the merchant storefront origin, not by `chatbot-agent`; use a served merchant asset path or approved absolute HTTPS URL. Product `imageUrl` fields are currently reserved: the product grid does not render product images yet.

## Create a merchant definition

Interactive mode prompts for required values:

```bash
pnpm merchant:create
```

Non-interactive mode is suitable for repeatable setup and CI:

```bash
pnpm merchant:create -- \
  --non-interactive \
  --id contoso \
  --brand "Contoso Goods" \
  --tagline "Everyday goods, thoughtfully chosen" \
  --domain contoso.mytest.run \
  --assistant-name "Contoso Assistant" \
  --logo ./assets/contoso-mark.svg \
  --dry-run
```

The command validates lowercase IDs, domains, theme values, and logo paths. It writes only definition/theme/onboarding artifacts and never calls the live payment-provider IDP, creates credentials, changes `.env.local`, or edits DNS/Caddy automatically.

Useful flags:

- `--dry-run` prints the target and planned files without writing.
- `--force` permits replacing an existing definition; use it deliberately.
- `--config-dir <path>` selects another configuration root.
- `--from <merchantId>` is reserved for copying presentation artifacts only; it must never copy source code, users, products, transactions, secrets, or IDP resources.

New definitions start as `draft`. Complete issuer/client/callback metadata and review the generated onboarding manifest before marking a merchant ready.

## Catalog and data

Add products to the authoritative catalog with the canonical `merchantId`. SKUs must be unique within the merchant. Do not copy Northwind users, loyalty balances, transactions, wallet data, or credentials into a new merchant. Seed records should be added intentionally and reviewed for ownership and privacy.

## Identity and payment-provider setup

For a new merchant, collect:

1. Merchant IDP issuer/discovery URL.
2. Merchant OIDC client ID and secret, stored only in deployment secrets.
3. Exact Auth.js callback URL: `https://<merchant-domain>/api/auth/callback/aic`.
4. Silent-SSO bridge client and callback configuration.
5. Payment-provider organization/trusted issuer values: issuer, audience, authorized parties, and token lifetime.
6. Optional payment-provider group `mrch-<merchantId>` after the schema approval gate.
7. Chatbot agent/client privilege configuration, if the merchant uses the assistant.

The shared `merchant-token-login` journey should be reused. It does not need to be cloned for each merchant.

Review desired state before applying changes:

```bash
pnpm --filter @acme/aic-config provision -- --dry-run
```

Apply provisioning only after reviewing the plan and ensuring the merchant's actual discovery issuer and redirect URIs match the metadata. The create command itself is deliberately local and safe.

## Deployment and ingress

Configure deployment secrets, `MERCHANT_ID`, and `MERCHANT_CONFIG_DIR` for the merchant deployment. Add the merchant domain to DNS/TLS and manually review a Caddy/reverse-proxy entry. The current checked-in `Caddyfile` contains the Northwind example and shared payment/chatbot routes; it does not automatically discover new merchant domains.

Build the shared runtime once, then deploy/restart it with the selected merchant configuration. Definition and asset changes require the deployment's configured reload/restart policy; runtime code changes come from the shared runtime release.

## Validation checklist

- Anonymous visitor sees the correct catalog and merchant branding.
- Logo loads at the merchant origin, or the initial-letter fallback appears.
- Light and dark themes have readable contrast.
- Sign-in returns to the exact merchant callback URL.
- Chatbot guest mode works when silent SSO is unavailable.
- Silent SSO uses the correct merchant IDP issuer and merchant ID.
- Products, loyalty, cart storage, and checkout use the canonical merchant scope.
- A cross-merchant SKU or tampered cart is rejected.
- Chatbot purchase confirmation requires explicit consent.
- Payment admin and transaction records show the correct merchant.
- `pnpm -w typecheck`, `pnpm -w lint`, and `pnpm format` pass.

## Rollback

Disable or remove the merchant definition from the deployment, revert the runtime/config release, revoke merchant-specific clients/secrets, and remove the domain/Caddy entry after traffic is drained. Preserve transaction records and retain the AIC provisioning output for auditability.
