// Minimal root layout for the API-only Next.js app. No shadcn/ui, no
// ThemeProvider, no fonts — the only HTML rendered from this app is the
// static index at `/`. Named-export ESLint rule is disabled for App Router
// layout files (see `eslint.config.mjs`); Next.js requires a default export.

import type { ReactNode } from 'react';

export const metadata = {
  title: 'Acme Payments — Payment API',
  description:
    'Internal Acme Payments API app (scaffold). Route handlers only — this app is not user-facing.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: 0,
          backgroundColor: '#0b1220',
          color: '#e2e8f0',
        }}
      >
        {children}
      </body>
    </html>
  );
}
