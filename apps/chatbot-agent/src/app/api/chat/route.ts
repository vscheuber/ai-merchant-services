// POST /api/chat — Acme Assist chatbot powered by OpenAI GPT-4.1-mini.
//
// Accepts a JSON body matching `ChatRequest` from `@acme/shared`:
//   { "messages": [{ "role": "user", "content": "Show me laptops" }] }
//
// Returns a `ChatResponse` from `@acme/shared`:
//   { "message": { "role": "assistant", "content": "..." } }
//
// On each request:
//   1. Reads Northwind products from data/products.json to build the system prompt.
//   2. Calls OpenAI chat completions (model from OPENAI_MODEL, defaults to gpt-4.1-mini).
//   3. Returns the assistant turn.
//
// Token exchange and shopper context (loyalty/wallet) are wired in Task 10.

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { readJson } from '@acme/shared';
import type { ChatRequest, ChatResponse, ChatMessage, Product } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

const NORTHWIND_MERCHANT_ID = 'mrch_northwind';
const DEFAULT_MODEL = 'gpt-4.1-mini';

// Module-level singleton — created once when the env key is present, reused
// across all requests rather than being re-allocated per request.
// The POST handler's early guard ensures the client is only used when the key
// is available; the null case is handled there with a clear HTTP 500.
const openai: OpenAI | null = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/** Build the system prompt for Acme Assist using the Northwind product catalog. */
function buildSystemPrompt(products: Product[]): string {
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
    'No shopper session is active at this time. Loyalty status and saved payment cards will',
    'appear here once the shopper is authenticated.',
    '',
    '## Instructions',
    '- Help shoppers discover and evaluate products from the Northwind catalog above.',
    '- When recommending a product, always include the exact product name and SKU.',
    '- If a shopper expresses intent to purchase a specific product, confirm the product name,',
    '  SKU, and price before proceeding.',
    '- Be concise, friendly, and helpful.',
    '- Do not invent products that are not listed in the catalog above.',
  ].join('\n');
}

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

/** CORS preflight handler — required so browser-originated POSTs from embed.js
 *  (cross-origin, Content-Type: application/json) are not blocked. The actual
 *  CORS response headers are set via `headers()` in next.config.mjs; this
 *  handler ensures the preflight receives a 204 rather than a 405.
 */
export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

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

  // Load the Northwind product catalog for the system prompt.
  // A read failure degrades gracefully — the prompt will note no products.
  let products: Product[] = [];
  try {
    products = await readJson<Product[]>(dataFilePath('products'));
  } catch {
    // Intentionally swallowed: system prompt handles the empty-catalog case.
  }

  const systemPrompt = buildSystemPrompt(products);

  // Build the OpenAI messages array. The system prompt is always injected first
  // so the LLM has merchant identity and product context on every call.
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...incomingMessages.map(toChatParam),
  ];

  // Call the OpenAI chat completions API.
  let completion: OpenAI.ChatCompletion;
  try {
    completion = await openai.chat.completions.create({
      model,
      messages: openaiMessages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OpenAI API call failed.';
    return NextResponse.json(
      { error: 'upstream_error', message },
      { status: 502 },
    );
  }

  const assistantContent = completion.choices[0]?.message?.content ?? '';

  const responseMessage: ChatMessage = {
    role: 'assistant',
    content: assistantContent,
  };

  const response: ChatResponse = {
    message: responseMessage,
  };

  return NextResponse.json(response);
}
