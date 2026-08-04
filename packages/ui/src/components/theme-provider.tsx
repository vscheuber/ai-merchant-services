'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ThemeProviderProps as NextThemesProviderProps } from 'next-themes';

export type ThemeProviderProps = NextThemesProviderProps;

/**
 * Thin wrapper around next-themes' provider so every app has a single
 * consistent entry point (`@acme/ui`) rather than importing next-themes
 * directly. Consumers typically pass:
 *   attribute="class" defaultTheme="system" enableSystem
 */
export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps): React.JSX.Element {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
