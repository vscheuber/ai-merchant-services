// POST /api/chat — Acme Assist chatbot powered by OpenAI GPT-4.1-mini.
//
// Task 10 additions on top of the Task 8 LLM integration:
//   1. Accepts `accessToken` (alpha realm user token) in the request body.
//   2. Step 2 token exchange: exchanges the alpha token for a chatbot-agent
//      agent token using `chatbot-agent` client credentials and the
//      `urn:ietf:params:oauth:grant-type:token-exchange` grant.
//   3. Fetches shopper context (loyalty balance + wallet cards) from payment-api
//      using the agent token as Bearer.
//   4. Enriches the system prompt with the shopper's loyalty tier, points, and
//      saved cards.
//   5. Defines a `propose_purchase` OpenAI function tool. When the LLM calls
//      this tool, the structured purchase data is returned in `proposedPurchase`.
//   6. Checkout confirmation path: when `confirmedAt` + `proposedPurchase` are
//      present in the request body, calls `POST /api/checkout` on the payment-api
//      with `consent.source = "chatbot"` and returns the result as a chat message.
//
// CORS preflight is handled by the OPTIONS handler (see next.config.mjs headers).

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { readJson } from '@acme/shared';
import type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  Product,
  LoyaltyBalance,
  WalletCard,
  ProposedPurchase,
  Cart,
} from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';
import { exchangeToken } from '../../../lib/token-exchange';

const NORTHWIND_MERCHANT_ID = 'mrch_northwind';
const DEFAULT_MODEL = 'gpt-4.1-mini';

// Module-level singleton — created once when the env key is present, reused
// across all requests rather than being re-allocated per request.
// The POST handler's early guard ensures the client is only used when the key
// is available; the null case is handled there with a clear HTTP 500.
const openai: OpenAI | null = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ── JWT decode helper (no signature verification) ────────────────────────────

/**
 * Decode a JWT payload without verifying the signature.
 *
 * We do not need to verify here: the alpha token was already validated by AIC
 * during the token exchange step (Step 2 will fail with an invalid token).
 * We only need the `sub` claim to scope the payment-api calls.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  const payloadPart = parts[1];
  if (parts.length !== 3 || !payloadPart) {
    throw new Error('Malformed JWT: expected three dot-separated segments.');
  }
  // base64url → base64 → utf-8
  const padded = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(paddingLength);
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8')) as Record<string, unknown>;
}

// ── Step 2 token exchange ────────────────────────────────────────────────────

/**
 * Exchange an alpha realm user token for a chatbot-agent agent token.
 *
 * Uses the `chatbot-agent` client credentials and the RFC 8693 token-exchange
 * grant against the AIC alpha realm token endpoint.
 *
 * Reads env vars: `AIC_ALPHA_TOKEN_ENDPOINT`, `CHATBOT_AGENT_CLIENT_ID`,
 * `CHATBOT_AGENT_CLIENT_SECRET`.
 *
 * @returns The `access_token` string for the agent token.
 */
async function exchangeForAgentToken(alphaToken: string): Promise<string> {
  const tokenEndpoint = process.env.AIC_ALPHA_TOKEN_ENDPOINT;
  const clientId = process.env.CHATBOT_AGENT_CLIENT_ID;
  const clientSecret = process.env.CHATBOT_AGENT_CLIENT_SECRET;

  if (!tokenEndpoint || !clientId || !clientSecret) {
    throw new Error(
      'Missing required env vars for Step 2 token exchange: ' +
        'AIC_ALPHA_TOKEN_ENDPOINT, CHATBOT_AGENT_CLIENT_ID, CHATBOT_AGENT_CLIENT_SECRET.',
    );
  }

  const tokenResponse = await exchangeToken(
    {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: alphaToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    },
    { tokenEndpoint, clientId, clientSecret },
  );

  return tokenResponse.access_token;
}

// ── Payment-api context fetch ────────────────────────────────────────────────

interface UserContext {
  loyalty: LoyaltyBalance | null;
  walletCards: WalletCard[];
}

/**
 * Fetch the shopper's loyalty balance and saved wallet cards from the payment-api.
 *
 * Uses the chatbot-agent token (from Step 2) as the Bearer credential so that
 * the payment-api JWT middleware accepts the request.
 */
async function fetchUserContext(agentToken: string, userId: string): Promise<UserContext> {
  const baseUrl = (process.env.PAYMENT_API_BASE_URL ?? 'http://localhost:3003').replace(/\/$/, '');
  const authHeaders = { Authorization: `Bearer ${agentToken}` };

  const [loyaltyRes, walletRes] = await Promise.all([
    fetch(
      `${baseUrl}/api/loyalty?userId=${encodeURIComponent(userId)}&merchantId=${NORTHWIND_MERCHANT_ID}`,
      { headers: authHeaders },
    ),
    fetch(`${baseUrl}/api/wallet?userId=${encodeURIComponent(userId)}`, {
      headers: authHeaders,
    }),
  ]);

  let loyalty: LoyaltyBalance | null = null;
  if (loyaltyRes.ok) {
    const records = (await loyaltyRes.json()) as LoyaltyBalance[];
    loyalty = records[0] ?? null;
  }

  let walletCards: WalletCard[] = [];
  if (walletRes.ok) {
    walletCards = (await walletRes.json()) as WalletCard[];
  }

  return { loyalty, walletCards };
}

// ── System prompt ────────────────────────────────────────────────────────────

/** Build the system prompt for Acme Assist, optionally enriched with shopper context. */
function buildSystemPrompt(products: Product[], userCtx: UserContext | null): string {
  const northwindProducts = products.filter((p) => p.merchantId === NORTHWIND_MERCHANT_ID);

  const productCatalog =
    northwindProducts.length === 0
      ? '(No products available at this time.)'
      : northwindProducts
          .map(
            (p) =>
              `- ${p.name} (SKU: ${p.sku}, Price: $${p.price.toFixed(2)} ${p.currency}, Category: ${p.category})${p.description ? `: ${p.description}` : ''}`,
          )
          .join('\n');

  let shopperSection: string;
  if (userCtx?.loyalty) {
    const { loyalty, walletCards } = userCtx;
    const cardList =
      walletCards.length === 0
        ? '  (No saved cards on file.)'
        : walletCards
            .map((c) => `  - ${c.brand.toUpperCase()} ending in ${c.last4} (${c.cardholderName})`)
            .join('\n');
    shopperSection = [
      `Loyalty tier: ${loyalty.tier.toUpperCase()} (${loyalty.points.toLocaleString()} points available, ${loyalty.lifetimePoints.toLocaleString()} lifetime)`,
      '',
      'Saved payment cards:',
      cardList,
    ].join('\n');
  } else {
    shopperSection =
      'No shopper session is active at this time. Loyalty status and saved payment cards will\n' +
      'appear here once the shopper is authenticated.';
  }

  return [
    'You are Acme Assist, a helpful AI shopping assistant embedded on the Northwind Retail website.',
    '',
    '## Merchant: Northwind Retail',
    'Northwind Retail is a premium electronics retailer specialising in laptops, smartphones,',
    'headphones, gaming peripherals, and home electronics.',
    '',
    '## Available Product Catalog',
    productCatalog,
    '',
    '## Shopper Context',
    shopperSection,
    '',
    '## Instructions',
    '- Help shoppers discover and evaluate products from the Northwind catalog above.',
    '- When recommending a product, always include the exact product name and SKU.',
    '- If a shopper expresses intent to purchase a specific product, confirm the product name,',
    '  SKU, and price before proceeding.',
    '- When you are ready to propose a specific product for purchase, use the propose_purchase',
    '  function. Include a natural-language confirmation message explaining the order details',
    '  so the shopper can review them before clicking "Confirm & pay".',
    '- Be concise, friendly, and helpful.',
    '- Do not invent products that are not listed in the catalog above.',
  ].join('\n');
}

// ── OpenAI tool definition ───────────────────────────────────────────────────

/** The `propose_purchase` function tool definition for structured purchase proposals. */
const PROPOSE_PURCHASE_TOOL: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'propose_purchase',
    description:
      'Propose a specific product from the Northwind catalog for the shopper to purchase. ' +
      'Call this when the shopper has expressed clear intent to buy a specific product and you ' +
      'have confirmed the product name, SKU, and price. The shopper will be shown a ' +
      '"Confirm & pay" button before any charge is made.',
    parameters: {
      type: 'object',
      properties: {
        sku: {
          type: 'string',
          description: 'Exact product SKU from the Northwind catalog (e.g. NW-LP-14-SILVER).',
        },
        productName: {
          type: 'string',
          description: 'Full product name as listed in the catalog.',
        },
        unitPrice: {
          type: 'number',
          description: 'Unit price in major currency units (e.g. 1299.00 for $1,299.00).',
        },
        quantity: {
          type: 'integer',
          description: 'Number of units to purchase (normally 1).',
          minimum: 1,
        },
        currency: {
          type: 'string',
          description: 'ISO 4217 currency code (e.g. USD).',
        },
        confirmationMessage: {
          type: 'string',
          description:
            'Natural language message summarising the purchase for the shopper to review, ' +
            'e.g. "I\'ll order 1x Northwind Aero 14 (NW-LP-14-SILVER) for $1,299.00. ' +
            'Click Confirm & pay to proceed."',
        },
      },
      required: ['sku', 'productName', 'unitPrice', 'quantity', 'currency', 'confirmationMessage'],
    } as Record<string, unknown>,
  },
};

// ── OpenAI message mapper ────────────────────────────────────────────────────

/**
 * Map a `ChatMessage` to an OpenAI chat completion message parameter.
 * Uses exhaustive role narrowing so TypeScript can verify assignability to the
 * `OpenAI.ChatCompletionMessageParam` discriminated union without a broad cast.
 */
function toChatParam(m: ChatMessage): OpenAI.ChatCompletionMessageParam {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content };
    case 'user':
      return { role: 'user', content: m.content };
    case 'assistant':
      return { role: 'assistant', content: m.content };
  }
}

// ── CORS preflight ───────────────────────────────────────────────────────────

/** CORS preflight handler — required so browser-originated POSTs from embed.js
 *  (cross-origin, Content-Type: application/json) are not blocked. The actual
 *  CORS response headers are set via `headers()` in next.config.mjs; this
 *  handler ensures the preflight receives a 204 rather than a 405.
 */
export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  // Guard: OPENAI_API_KEY must be set (module-level singleton is null when absent).
  if (!openai) {
    return NextResponse.json(
      {
        error: 'configuration_error',
        message: 'OPENAI_API_KEY is not configured. Set it in .env.local.',
      },
      { status: 500 },
    );
  }

  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

  // Parse request body.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const chatRequest = body as ChatRequest;
  const incomingMessages = Array.from(chatRequest.messages ?? []);
  const alphaToken = chatRequest.accessToken;
  const confirmedAt = chatRequest.confirmedAt;
  const incomingProposedPurchase = chatRequest.proposedPurchase;

  // ── Step 2 token exchange + user context ─────────────────────────────────
  //
  // When `alphaToken` is present:
  //   1. Decode the alpha JWT to extract `sub` (userId).
  //   2. Exchange the alpha token for a chatbot-agent agent token (Step 2).
  //   3. Fetch the shopper's loyalty balance + wallet cards from payment-api.
  //
  // All three steps are best-effort for the normal chat path — a failure in
  // context-fetching degrades to an unauthenticated prompt rather than an error.
  // However, Step 2 failure on the checkout confirmation path IS fatal (no agent
  // token → cannot call payment-api).

  let agentToken: string | null = null;
  let userId: string | null = null;
  let userCtx: UserContext | null = null;

  if (alphaToken) {
    // Decode alpha token payload to extract `sub`.
    try {
      const payload = decodeJwtPayload(alphaToken);
      const sub = payload['sub'];
      userId = typeof sub === 'string' ? sub : null;
    } catch {
      // Non-fatal: proceed without userId; context fetch will be skipped.
    }

    // Step 2: exchange alpha user token for chatbot-agent agent token.
    try {
      agentToken = await exchangeForAgentToken(alphaToken);
    } catch (err) {
      // Fatal for checkout path; for normal chat, return an error so the client
      // knows the exchange configuration issue rather than silently degrading.
      const message = err instanceof Error ? err.message : 'Step 2 token exchange failed.';
      return NextResponse.json({ error: 'token_exchange_error', message }, { status: 502 });
    }

    // Fetch shopper context (loyalty + wallet cards) using the agent token.
    if (userId) {
      try {
        userCtx = await fetchUserContext(agentToken, userId);
      } catch {
        // Non-fatal: proceed with no shopper context in the system prompt.
      }
    }
  }

  // ── Checkout confirmation path ────────────────────────────────────────────
  //
  // When the client sends `confirmedAt` + `proposedPurchase`, the shopper has
  // clicked "Confirm & pay". We call POST /api/checkout on the payment-api and
  // return the result as a chat message (no LLM call needed).

  if (confirmedAt && incomingProposedPurchase) {
    if (!agentToken || !userId) {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'A valid accessToken is required to confirm a purchase.',
        },
        { status: 401 },
      );
    }

    // Use the first saved wallet card as the payment instrument.
    const selectedCard = userCtx?.walletCards[0];
    if (!selectedCard) {
      const noCardMsg: ChatResponse = {
        message: {
          role: 'assistant',
          content:
            "I couldn't complete the purchase because no saved payment card was found in your wallet. " +
            'Please add a card to your Acme Payments account and try again.',
        },
      };
      return NextResponse.json(noCardMsg);
    }

    const cart: Cart = {
      id: `cart_${Date.now()}`,
      userId,
      merchantId: NORTHWIND_MERCHANT_ID,
      currency: incomingProposedPurchase.currency,
      items: [
        {
          sku: incomingProposedPurchase.sku,
          quantity: incomingProposedPurchase.quantity,
          unitPrice: incomingProposedPurchase.unitPrice,
        },
      ],
    };

    const baseUrl = (process.env.PAYMENT_API_BASE_URL ?? 'http://localhost:3003').replace(/\/$/, '');
    let checkoutResultContent: string;

    try {
      const checkoutRes = await fetch(`${baseUrl}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${agentToken}`,
        },
        body: JSON.stringify({
          userId,
          selectedCardId: selectedCard.id,
          cart,
          consent: {
            source: 'chatbot',
            confirmedAt,
          },
        }),
      });

      if (checkoutRes.ok) {
        const session = (await checkoutRes.json()) as {
          status?: string;
          totalAmount?: number;
          currency?: string;
        };
        const status = session.status ?? 'captured';
        const amount =
          session.totalAmount !== undefined ? `$${session.totalAmount.toFixed(2)}` : '';
        const currency = session.currency ?? '';
        const last4 = selectedCard.last4;
        checkoutResultContent =
          `Payment ${status}! ` +
          (amount
            ? `${amount} ${currency} charged to your ${selectedCard.brand.toUpperCase()} card ending in ${last4}.`
            : `Your order for ${incomingProposedPurchase.productName} has been placed.`);
      } else {
        let errMessage = checkoutRes.statusText;
        try {
          const errBody = (await checkoutRes.json()) as { message?: string };
          if (errBody.message) errMessage = errBody.message;
        } catch {
          // ignore parse failure
        }
        checkoutResultContent = `Payment could not be processed: ${errMessage}.`;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout call failed.';
      checkoutResultContent = `Payment could not be processed: ${message}.`;
    }

    const checkoutResponse: ChatResponse = {
      message: { role: 'assistant', content: checkoutResultContent },
    };
    return NextResponse.json(checkoutResponse);
  }

  // ── Normal chat path (LLM call) ───────────────────────────────────────────

  // Load the Northwind product catalog for the system prompt.
  // A read failure degrades gracefully — the prompt will note no products.
  let products: Product[] = [];
  try {
    products = await readJson<Product[]>(dataFilePath('products'));
  } catch {
    // Intentionally swallowed: system prompt handles the empty-catalog case.
  }

  const systemPrompt = buildSystemPrompt(products, userCtx);

  // Build the OpenAI messages array. The system prompt is always injected first
  // so the LLM has merchant identity and product context on every call.
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...incomingMessages.map(toChatParam),
  ];

  // Call the OpenAI chat completions API with the propose_purchase tool.
  let completion: OpenAI.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
      tools: [PROPOSE_PURCHASE_TOOL],
      tool_choice: 'auto',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI API call failed.';
    return NextResponse.json({ error: 'upstream_error', message }, { status: 502 });
  }

  const choice = completion.choices[0];
  let assistantContent = choice?.message?.content ?? '';
  let proposedPurchaseOut: ProposedPurchase | undefined;

  // Check for a propose_purchase tool call in the completion.
  const toolCalls = choice?.message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      if (tc.type === 'function' && tc.function.name === 'propose_purchase') {
        try {
          const args = JSON.parse(tc.function.arguments) as {
            sku: string;
            productName: string;
            unitPrice: number;
            quantity: number;
            currency: string;
            confirmationMessage: string;
          };
          proposedPurchaseOut = {
            sku: args.sku,
            productName: args.productName,
            unitPrice: args.unitPrice,
            quantity: args.quantity,
            currency: args.currency,
          };
          // Use the model's confirmationMessage as the assistant turn.
          assistantContent = args.confirmationMessage;
        } catch {
          // Tool argument parse failed — fall through with empty content.
        }
        break; // Only process the first propose_purchase call.
      }
    }
  }

  const responseMessage: ChatMessage = {
    role: 'assistant',
    content: assistantContent,
  };

  const response: ChatResponse = {
    message: responseMessage,
    ...(proposedPurchaseOut !== undefined ? { proposedPurchase: proposedPurchaseOut } : {}),
  };

  return NextResponse.json(response);
}
