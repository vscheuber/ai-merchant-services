'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MerchantStorefrontConfig } from '../config/merchant';

const MerchantConfigContext = createContext<MerchantStorefrontConfig | null>(null);

export function MerchantConfigProvider({
  config,
  children,
}: {
  config: MerchantStorefrontConfig;
  children: ReactNode;
}) {
  return <MerchantConfigContext.Provider value={config}>{children}</MerchantConfigContext.Provider>;
}

export function useMerchantConfig(): MerchantStorefrontConfig {
  const config = useContext(MerchantConfigContext);
  if (!config) throw new Error('useMerchantConfig must be used inside MerchantConfigProvider.');
  return config;
}
