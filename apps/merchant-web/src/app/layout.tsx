// Root layout for merchant-web. Wraps every page in the shared `ThemeProvider`
// so shadcn dark-mode tokens resolve consistently, and — this is the primary
// integration point for AC 6 — includes the Acme Assist overlay bundle via a
// `<script>` tag pointing at chatbot-agent's `/embed.js`. Because the include
// lives in the *root* layout, the overlay renders on every route of this app
// (not on a separate route the user navigates to), which satisfies the FR 8 /
// AC 6 primary-surface half.
//
// The `embed.js` URL is hard-coded to `http://localhost:3004/embed.js` for the
// scaffold's simplicity. `chatbot-agent`'s Next config (Task 5) already sets
// `Access-Control-Allow-Origin: *` and an explicit
// `Content-Type: application/javascript` on that path, so the cross-origin
// load from `localhost:3000` works without any per-app config here. A
// follow-on PR can swap the string for `process.env.NEXT_PUBLIC_CHATBOT_EMBED_URL`
// (declared in `.env.example`) when environments beyond local dev come online.
//
// Next.js App Router requires a default export.

import type { ReactNode } from 'react';
import { ThemeProvider } from '@acme/ui';

import './globals.css';

const CHATBOT_EMBED_URL = 'http://localhost:3004/embed.js';

export const metadata = {
  title: 'Northwind Retail — shop electronics, laptops, phones, and more',
  description:
    'Northwind Retail is a fictional consumer-electronics merchant used to demonstrate the Acme Payments agentic-commerce POC. The Acme Assist chat overlay is embedded on every page.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
        {/*
          Acme Assist overlay — served by chatbot-agent on port 3004.
          The bundle is a vanilla-JS IIFE that appends a fixed-position chat
          shell to document.body on load. Runs client-side only; safe to be
          `async`. Rendered here in the root layout so it mounts on every
          route of this app.
        */}
        <script src={CHATBOT_EMBED_URL} async />
      </body>
    </html>
  );
}
