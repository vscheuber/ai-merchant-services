// Root layout for payment-admin-web (Acme Payments Admin). Wraps every page
// in the shared `ThemeProvider` so shadcn dark-mode tokens resolve
// consistently across every route.
//
// Next.js App Router requires a default export.

import type { ReactNode } from 'react';
import { ThemeProvider } from '@acme/ui';

import './globals.css';

export const metadata = {
  title: 'Acme Payments Admin — merchants, users, transactions',
  description:
    'Acme Payments Admin is the fictional admin dashboard for the payment provider in this agentic-commerce POC. Admins review funnel metrics per merchant, list users, and inspect transactions.',
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
