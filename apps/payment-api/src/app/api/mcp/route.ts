// MCP server route for the payment API.
//
// POST /api/mcp — stateless MCP endpoint; creates a fresh McpServer and
//   WebStandardStreamableHTTPServerTransport for every request. Exposes three
//   tools: get_loyalty, get_wallet, post_checkout.
// GET  /api/mcp — 405 Method Not Allowed.
//
// The route is automatically JWT-protected by the middleware in
// `src/middleware.ts` (matcher `/api/:path*`).

export const runtime = 'nodejs';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp';
import { z } from 'zod';
import { readJson, writeJson, deriveLoyaltyTier } from '@acme/shared';
import type {
  LoyaltyBalance,
  WalletCard,
  Product,
  Merchant,
  Transaction,
  CheckoutSession,
} from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

// ---------------------------------------------------------------------------
// Zod schemas for complex tool inputs
// ---------------------------------------------------------------------------

const CartItemSchema = z.object({
  sku: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
});

const CartSchema = z.object({
  id: z.string(),
  userId: z.string(),
  merchantId: z.string(),
  currency: z.string(),
  items: z.array(CartItemSchema),
  redeemedPoints: z.number().optional(),
});

const ConsentSchema = z.object({
  source: z.enum(['chatbot', 'web-checkout']),
  confirmedAt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers shared with the checkout route
// ---------------------------------------------------------------------------

/** Derive the next sequential transaction id from the existing list. */
function nextTxnId(existing: readonly Transaction[]): string {
  const max = existing.reduce((m, t) => {
    const n = parseInt(t.id.replace(/^txn_/, ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `txn_${String(max + 1).padStart(5, '0')}`;
}

/** Generate a checkout session id using the current timestamp. */
function nextChkId(): string {
  return `chk_${String(Date.now()).slice(-10)}`;
}

// ---------------------------------------------------------------------------
// MCP server factory — fresh instance per request (stateless)
// ---------------------------------------------------------------------------

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'payment-api', version: '1.0.0' });

  // ----- get_loyalty -------------------------------------------------------
  server.registerTool(
    'get_loyalty',
    {
      description: 'Get the loyalty balance for a user at a merchant.',
      inputSchema: { userId: z.string(), merchantId: z.string() },
    },
    async ({ userId, merchantId }) => {
      let records: LoyaltyBalance[];
      try {
        records = await readJson<LoyaltyBalance[]>(dataFilePath('loyalty'));
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'internal_error',
                message: 'Loyalty data unavailable.',
              }),
            },
          ],
          isError: true,
        };
      }

      let result = records;
      if (userId) result = result.filter((r) => r.userId === userId);
      if (merchantId) result = result.filter((r) => r.merchantId === merchantId);

      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  // ----- get_wallet --------------------------------------------------------
  server.registerTool(
    'get_wallet',
    {
      description: 'Get the wallet cards on file for a user.',
      inputSchema: { userId: z.string() },
    },
    async ({ userId }) => {
      let cards: WalletCard[];
      try {
        cards = await readJson<WalletCard[]>(dataFilePath('wallet-cards'));
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'internal_error',
                message: 'Wallet data unavailable.',
              }),
            },
          ],
          isError: true,
        };
      }

      const result = userId ? cards.filter((c) => c.userId === userId) : cards;
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  // ----- post_checkout -----------------------------------------------------
  server.registerTool(
    'post_checkout',
    {
      description:
        'Initiate a checkout: validates consent, computes the authoritative total ' +
        'from the product catalog, records the transaction, accrues loyalty points, ' +
        'and returns a CheckoutSession with status "captured".',
      inputSchema: {
        userId: z.string(),
        selectedCardId: z.string(),
        cart: CartSchema,
        consent: ConsentSchema,
      },
    },
    async ({ userId, selectedCardId, cart, consent }) => {
      // Guard against empty cart
      if (!Array.isArray(cart.items) || cart.items.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'bad_request',
                message: 'Cart must contain at least one item.',
              }),
            },
          ],
          isError: true,
        };
      }

      const merchantId = cart.merchantId;

      // --- Look up products to compute authoritative totalAmount ---
      let products: Product[];
      try {
        products = await readJson<Product[]>(dataFilePath('products'));
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'internal_error',
                message: 'Product catalog unavailable.',
              }),
            },
          ],
          isError: true,
        };
      }

      const productMap = new Map(products.map((p) => [p.sku, p]));
      let totalAmount = 0;
      for (const item of cart.items) {
        const product = productMap.get(item.sku);
        if (!product) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: 'bad_request',
                  message: `Unknown product SKU: ${item.sku}.`,
                }),
              },
            ],
            isError: true,
          };
        }
        totalAmount += product.price * item.quantity;
      }

      // Use the first product's currency; fall back to the cart's declared currency.
      const currency =
        (cart.items.length > 0 ? productMap.get(cart.items[0]!.sku)?.currency : undefined) ??
        cart.currency ??
        'USD';

      // --- Look up merchant name for the denormalized transaction field ---
      let merchants: Merchant[];
      try {
        merchants = await readJson<Merchant[]>(dataFilePath('merchants'));
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'internal_error',
                message: 'Merchant data unavailable.',
              }),
            },
          ],
          isError: true,
        };
      }

      const merchant = merchants.find((m) => m.id === merchantId);
      const merchantName = merchant?.name ?? merchantId;

      // --- Append the transaction ---
      let transactions: Transaction[];
      try {
        transactions = await readJson<Transaction[]>(dataFilePath('transactions'));
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'internal_error',
                message: 'Transactions unavailable.',
              }),
            },
          ],
          isError: true,
        };
      }

      const now = new Date().toISOString();

      const newTransaction: Transaction = {
        id: nextTxnId(transactions),
        userId,
        merchantId,
        merchantName,
        amount: totalAmount,
        currency,
        status: 'captured',
        createdAt: now,
        items: cart.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: productMap.get(item.sku)!.price,
        })),
        consent,
      };

      try {
        await writeJson(dataFilePath('transactions'), [...transactions, newTransaction]);
      } catch {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'internal_error',
                message: 'Failed to record transaction.',
              }),
            },
          ],
          isError: true,
        };
      }

      // --- Accrue loyalty points (best-effort) ---
      // A loyalty write failure does not roll back the captured transaction.
      const earnedPoints = Math.floor(totalAmount);
      try {
        const loyaltyRecords = await readJson<LoyaltyBalance[]>(dataFilePath('loyalty'));
        const loyaltyIdx = loyaltyRecords.findIndex(
          (r) => r.userId === userId && r.merchantId === merchantId,
        );

        let updatedLoyalty: LoyaltyBalance[];
        if (loyaltyIdx >= 0) {
          const existing = loyaltyRecords[loyaltyIdx]!;
          const newLifetimePoints = existing.lifetimePoints + earnedPoints;
          updatedLoyalty = [
            ...loyaltyRecords.slice(0, loyaltyIdx),
            {
              ...existing,
              points: existing.points + earnedPoints,
              lifetimePoints: newLifetimePoints,
              tier: deriveLoyaltyTier(newLifetimePoints),
            },
            ...loyaltyRecords.slice(loyaltyIdx + 1),
          ];
        } else {
          updatedLoyalty = [
            ...loyaltyRecords,
            {
              userId,
              merchantId,
              points: earnedPoints,
              lifetimePoints: earnedPoints,
              tier: deriveLoyaltyTier(earnedPoints),
            },
          ];
        }
        await writeJson(dataFilePath('loyalty'), updatedLoyalty);
      } catch {
        // Best-effort: log failure but do not affect the checkout response.
        console.error(
          '[mcp/post_checkout] Loyalty accrual failed for user',
          userId,
          '— skipping.',
        );
      }

      // --- Build and return the CheckoutSession ---
      const checkoutSession: CheckoutSession = {
        id: nextChkId(),
        userId,
        merchantId,
        cart,
        status: 'captured',
        selectedCardId,
        totalAmount,
        currency,
        ...(cart.redeemedPoints !== undefined
          ? { loyaltyPointsRedeemed: cart.redeemedPoints }
          : {}),
        createdAt: now,
      };

      return { content: [{ type: 'text', text: JSON.stringify(checkoutSession) }] };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Next.js App Router handlers
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  const server = buildMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export async function GET(): Promise<Response> {
  return new Response('Method Not Allowed', { status: 405 });
}
