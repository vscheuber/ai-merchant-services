import type { CSSProperties } from 'react';

export interface StorefrontThemeTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
  destructive: string;
  destructiveForeground: string;
}

export interface MerchantStorefrontConfig {
  merchantId: string;
  brand: string;
  tagline: string;
  domains: readonly string[];
  logoUrl?: string;
  assistantName: string;
  catalog: { merchantId: string };
  theme: {
    light: StorefrontThemeTokens;
    dark: StorefrontThemeTokens;
    radius: string;
    fontFamily: string;
  };
  onboardingStatus: 'draft' | 'ready' | 'disabled';
}

export type PublicMerchantConfig = Omit<MerchantStorefrontConfig, 'onboardingStatus'>;

export const defaultLightTheme: StorefrontThemeTokens = {
  background: '0 0% 100%', foreground: '222 47% 11%', card: '0 0% 100%', cardForeground: '222 47% 11%',
  primary: '215 82% 53%', primaryForeground: '0 0% 100%', secondary: '214 32% 96%', secondaryForeground: '222 47% 11%',
  muted: '214 32% 96%', mutedForeground: '215 16% 47%', accent: '214 95% 93%', accentForeground: '215 82% 32%',
  border: '214 25% 88%', input: '214 25% 88%', ring: '215 82% 53%', destructive: '0 72% 51%', destructiveForeground: '0 0% 100%',
};

export const defaultDarkTheme: StorefrontThemeTokens = {
  background: '222 47% 7%', foreground: '210 40% 98%', card: '222 43% 10%', cardForeground: '210 40% 98%',
  primary: '213 94% 68%', primaryForeground: '222 47% 11%', secondary: '217 33% 17%', secondaryForeground: '210 40% 98%',
  muted: '217 33% 17%', mutedForeground: '215 20% 65%', accent: '217 33% 22%', accentForeground: '213 94% 82%',
  border: '217 33% 22%', input: '217 33% 22%', ring: '213 94% 68%', destructive: '0 63% 42%', destructiveForeground: '210 40% 98%',
};

function tokenDeclarations(tokens: StorefrontThemeTokens, config: MerchantStorefrontConfig): string {
  return Object.entries({
    '--background': tokens.background,
    '--foreground': tokens.foreground,
    '--card': tokens.card,
    '--card-foreground': tokens.cardForeground,
    '--primary': tokens.primary,
    '--primary-foreground': tokens.primaryForeground,
    '--secondary': tokens.secondary,
    '--secondary-foreground': tokens.secondaryForeground,
    '--muted': tokens.muted,
    '--muted-foreground': tokens.mutedForeground,
    '--accent': tokens.accent,
    '--accent-foreground': tokens.accentForeground,
    '--border': tokens.border,
    '--input': tokens.input,
    '--ring': tokens.ring,
    '--destructive': tokens.destructive,
    '--destructive-foreground': tokens.destructiveForeground,
    '--radius': config.theme.radius,
    '--font-sans': config.theme.fontFamily,
  }).map(([key, value]) => `${key}: ${value}`).join(';');
}

export function themeCssVariables(config: MerchantStorefrontConfig): string {
  return [
    `.merchant-theme { ${tokenDeclarations(config.theme.light, config)} }`,
    `.dark .merchant-theme { ${tokenDeclarations(config.theme.dark, config)} }`,
    '.merchant-theme { font-family: var(--font-sans); }',
  ].join('\n');
}

export function themeStyleVariables(config: MerchantStorefrontConfig): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(config.theme.light)) {
    vars[`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`] = value;
  }
  vars['--radius'] = config.theme.radius;
  vars['--font-sans'] = config.theme.fontFamily;
  return vars as CSSProperties;
}
