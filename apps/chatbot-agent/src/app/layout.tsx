// Root layout for chatbot-agent. Wraps every page in the shared
// `ThemeProvider` so shadcn dark-mode tokens resolve consistently across
// the landing page and the standalone `/preview` route. Next.js App Router
// requires a default export (ESLint override in eslint.config.mjs).

import type { ReactNode } from 'react';
import { ThemeProvider } from '@acme/ui';

import './globals.css';

export const metadata = {
  title: 'Acme Assist — merchant-embedded chatbot',
  description:
    'Acme Assist is the merchant-embedded chat assistant provided by Acme Payments. It ships as a JavaScript overlay merchants drop into their own sites.',
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
