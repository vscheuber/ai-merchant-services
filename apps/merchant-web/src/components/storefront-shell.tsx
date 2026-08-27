'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@acme/ui';

import { useMerchantConfig } from './merchant-config-provider';

const nav = [
  { label: 'Products', href: '/products' },
  { label: 'Cart', href: '/cart' },
  { label: 'Checkout', href: '/checkout' },
  { label: 'Account', href: '/account' },
] as const;

export function StorefrontShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const merchantConfig = useMerchantConfig();
  return (
    <AppShell
      brand={merchantConfig.brand}
      tagline={merchantConfig.tagline}
      logoUrl={merchantConfig.logoUrl}
      nav={nav}
      actions={actions}
    >
      {children}
    </AppShell>
  );
}
