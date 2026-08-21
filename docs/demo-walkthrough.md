# Demo Walkthrough

A step-by-step guide for demonstrating the full Acme Payments + Northwind Retail + Acme Assist stack.

---

## Prerequisites

All five services must be running and Caddy must be active before starting:

```bash
# From repo root
pnpm dev:start      # starts all five apps
pnpm dev:status     # confirm all show UP

caddy reload --config Caddyfile   # (or: sudo caddy start --config Caddyfile on first run)
```

---

## Service Map

| App                                       | Local port | Public URL (via Caddy)                 | Realm                        |
| ----------------------------------------- | ---------- | -------------------------------------- | ---------------------------- |
| merchant-web (Northwind Retail)           | 3000       | https://northwind.mytest.run           | bravo (merchant IDP)         |
| payment-user-web (Acme Payments consumer) | 3001       | https://payments.mytestrun.com         | alpha (payment provider IDP) |
| payment-admin-web (Acme Payments admin)   | 3002       | https://payments.mytestrun.com/admin   | alpha                        |
| payment-api                               | 3003       | https://payments.mytestrun.com/api     | alpha (JWT validation)       |
| chatbot-agent (Acme Assist)               | 3004       | https://payments.mytestrun.com/chatbot | alpha                        |

**IDP domains (AIC custom-domain-scoped sessions):**

| Realm                        | Domain            | Issuer                              |
| ---------------------------- | ----------------- | ----------------------------------- |
| alpha (payment provider IDP) | idc.mytestrun.com | https://idc.mytestrun.com/am/oauth2 |
| bravo (merchant IDP)         | idc.mytest.run    | https://idc.mytest.run/am/oauth2    |

---

## Demo Users

All merchant users authenticate against the **bravo realm** (merchant IDP) at `idc.mytest.run`.

| Name         | Username       | Password     | Merchant                   |
| ------------ | -------------- | ------------ | -------------------------- |
| Ada Lovelace | `ada.lovelace` | `Password1!` | Northwind (mrch_northwind) |
| Grace Hopper | `grace.hopper` | `Password1!` | Northwind (mrch_northwind) |
| Alan Turing  | `alan.turing`  | `Password1!` | Contoso (mrch_contoso)     |

> Ada and Grace belong to Northwind Retail; Alan belongs to Contoso. The chatbot is wired to Northwind so Alan's token exchange produces a different merchant context.

---

## Walkthrough

### Step 1 — Merchant signs in to Northwind Retail

1. Open **https://northwind.mytest.run** in a browser.
2. Click **Sign in**.
3. You are redirected to the AIC bravo realm login page at `idc.mytest.run`.
4. Sign in as **ada.lovelace / Password1!**
5. You land on the Northwind Retail home page, authenticated as Ada Lovelace.

**What to highlight:** The merchant authenticates against the merchant IDP (bravo realm). The session cookie is domain-scoped to `idc.mytest.run`.

---

### Step 2 — Merchant discovers the Acme Assist chatbot

1. On the Northwind Retail page, look for the **Acme Assist** chat widget embedded in the bottom-right corner (injected via `embed.js` from `payments.mytestrun.com/chatbot`).
2. Click the widget to open the chat panel.

---

### Step 3 — Chatbot token exchange (bravo → alpha)

When Ada sends her first message, the chatbot performs a two-step token exchange in the background:

- **Step 1** (`merchant-web /api/chatbot/token`): exchanges Ada's bravo session token for an alpha realm token using the `payment-api` client credentials (`urn:ietf:params:oauth:grant-type:token-exchange`).
- **Step 2** (`chatbot-agent /api/chat`): exchanges the alpha token for a `northwind-chatbot-agent`-scoped token before forwarding the chat to the OpenAI API and calling back into `payment-api` for contextual data.

---

### Step 4 — Chatbot prompts to try

Type these prompts in the Acme Assist widget to demonstrate different capabilities:

| Prompt                                   | Expected response                                               |
| ---------------------------------------- | --------------------------------------------------------------- |
| `What is my account balance?`            | Returns Ada's account balance from payment-api                  |
| `Show me my recent transactions`         | Lists Ada's latest payment records                              |
| `What is the status of my last payment?` | Status of the most recent transaction                           |
| `I want to pay an invoice`               | Chatbot guides through the payment flow                         |
| `Who am I?`                              | Returns Ada Lovelace / Northwind Retail identity from the token |

---

### Step 5 — Payment provider admin view

1. Open **https://payments.mytestrun.com/admin** in a separate browser tab or incognito window.
2. Sign in with an **alpha realm** account (Acme Payments staff — these are separate from the bravo realm users).
3. View merchant transactions, accounts, or admin dashboards.

**What to highlight:** The admin UI authenticates against the payment provider IDP (alpha realm), completely separate from the merchant IDP. The same AIC tenant hosts both realms with domain-scoped session isolation.

---

### Step 6 — Consumer payment flow

1. Open **https://payments.mytestrun.com** (no `/admin` path).
2. Sign in as a payment-provider consumer (alpha realm user).
3. Walk through the checkout flow that Northwind Retail triggers.

---

## Log Tailing

To watch real-time logs from all services in this session:

```bash
# All logs at once (requires multitail or watching separate terminals)
tail -f logs/merchant-web.log
tail -f logs/payment-user-web.log
tail -f logs/payment-admin-web.log
tail -f logs/payment-api.log
tail -f logs/chatbot-agent.log
```

Watch all five simultaneously:

```bash
tail -f logs/*.log
```

Or follow a single service during a specific flow:

```bash
# Token exchange flow — watch merchant-web and payment-api together
tail -f logs/merchant-web.log logs/payment-api.log

# Chatbot flow — watch chatbot-agent and payment-api
tail -f logs/chatbot-agent.log logs/payment-api.log
```

---

## Stopping Services

```bash
pnpm dev:stop       # stops all five Next.js processes
caddy stop          # stops Caddy (or: sudo caddy stop)
```

---

## Key Configuration Files

| File                                                       | Purpose                                               |
| ---------------------------------------------------------- | ----------------------------------------------------- |
| `Caddyfile`                                                | Reverse proxy — HTTPS termination, path-based routing |
| `config/payment/aic/inputs/alpha/oauth2-clients.json`      | Alpha realm OAuth2 clients                            |
| `config/merchant/aic/inputs/bravo/oauth2-clients.json`     | Bravo realm OAuth2 clients                            |
| `config/payment/aic/inputs/alpha/trusted-jwt-issuers.json` | Trusted JWT issuer for token exchange                 |
| `config/payment/aic/.env`                                  | Provisioner secrets (gitignored)                      |
| `apps/*/env.local`                                         | Per-app runtime config (gitignored)                   |
