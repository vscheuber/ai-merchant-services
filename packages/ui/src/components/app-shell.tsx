import * as React from 'react';

import { cn } from '../lib/cn';
import { ThemeToggle } from './theme-toggle';

export interface AppShellNavItem {
  label: string;
  href: string;
}

export interface AppShellProps {
  brand: string;
  tagline?: string;
  nav?: readonly AppShellNavItem[];
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Shared layout skeleton for every Next.js app in the scaffold. Provides:
 *   - a sticky header with brand name, optional tagline, nav slot, and theme toggle
 *   - a main content region for the page's own children
 *   - a footer slot with fictional-brand-safe defaults
 *
 * Consumers wrap their root layout's children in <AppShell brand="..." nav={...}>.
 */
export function AppShell({
  brand,
  tagline,
  nav,
  footer,
  className,
  children,
}: AppShellProps): React.JSX.Element {
  return (
    <div className={cn('flex min-h-screen flex-col bg-background', className)}>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold tracking-tight">
                {brand}
              </span>
              {tagline ? (
                <span className="text-xs text-muted-foreground">{tagline}</span>
              ) : null}
            </div>
            {nav && nav.length > 0 ? (
              <nav
                aria-label="Primary"
                className="hidden items-center gap-4 md:flex"
              >
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="container flex-1 py-8">{children}</main>
      <footer className="border-t border-border">
        <div className="container flex h-14 items-center justify-between text-xs text-muted-foreground">
          {footer ?? <span>{brand} - scaffold preview</span>}
        </div>
      </footer>
    </div>
  );
}
