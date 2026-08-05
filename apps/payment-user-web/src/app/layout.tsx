// Root layout for payment-user-web (Acme Payments — consumer UI). Wraps
// every page in the shared `ThemeProvider` so shadcn dark-mode tokens
// resolve consistently across every route.
//
// Next.js App Router requires a default export.

import type { ReactNode } from 'react';
import { ThemeProvider } from '@acme/ui';

import './globals.css';

export const metadata = {
  title: 'Acme Payments — your account and transactions',
  description:
    'Acme Payments is a fictional payment provider used to demonstrate the agentic-commerce POC. This consumer-facing surface shows a shopper their transactions and profile across every merchant they use.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
