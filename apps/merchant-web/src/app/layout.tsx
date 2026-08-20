// Root layout for merchant-web. Wraps every page in the shared `ThemeProvider`
// so shadcn dark-mode tokens resolve consistently, and — this is the primary
// integration point for AC 6 — includes the shopping assistant overlay bundle via a
// `<script>` tag pointing at chatbot-agent's `/embed.js`. Because the include
// lives in the *root* layout, the overlay renders on every route of this app
// (not on a separate route the user navigates to), which satisfies the FR 8 /
// AC 6 primary-surface half.
//
// The `embed.js` URL is read from `NEXT_PUBLIC_CHATBOT_EMBED_URL`, falling back
// to `http://localhost:3004/embed.js` for local development. The env var is
// declared in `.env.example`. `chatbot-agent`'s Next config already sets
// `Access-Control-Allow-Origin: *` and an explicit
// `Content-Type: application/javascript` on that path, so the cross-origin
// load from `localhost:3000` works without any per-app config here.
//
// Next.js App Router requires a default export.

import type { ReactNode } from 'react';
import { ThemeProvider } from '@acme/ui';
import { SessionProvider } from 'next-auth/react';
import { CartProvider } from '../components/cart-provider';
import { TokenTracePanel } from '../components/token-trace-panel';

import './globals.css';

const CHATBOT_EMBED_URL =
  process.env['NEXT_PUBLIC_CHATBOT_EMBED_URL'] ?? 'http://localhost:3004/chatbot/embed.js';
const CHATBOT_NAME =
  process.env['NEXT_PUBLIC_CHATBOT_NAME'] ?? 'Shopping Assistant';

export const metadata = {
  title: 'Northwind Retail — shop electronics, laptops, phones, and more',
  description: 'Northwind Retail is a consumer-electronics storefront. Browse the catalog, add items to your cart, and use the shopping assistant for personalised recommendations.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <SessionProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </SessionProvider>
        </ThemeProvider>
        {/* Set chatbot config before the async embed script loads. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.CHATBOT_CONFIG = ${JSON.stringify({
              name: CHATBOT_NAME,
              tokenUrl: '/api/chatbot/token',
              chatUrl: 'https://payments.mytestrun.com/chatbot/api/chat',
            })};`,
          }}
        />
        {/* Shopping assistant overlay — served by chatbot-agent. */}
        <script src={CHATBOT_EMBED_URL} async />
        <TokenTracePanel />
      </body>
    </html>
  );
}
