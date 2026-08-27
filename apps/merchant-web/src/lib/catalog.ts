import type { Product } from '@acme/shared';

import type { MerchantStorefrontConfig } from '../config/merchant';

export async function getCatalog(config: MerchantStorefrontConfig): Promise<Product[]> {
  const baseUrl = (process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003').replace(/\/$/, '');
  const response = await fetch(
    `${baseUrl}/api/products?merchantId=${encodeURIComponent(config.catalog.merchantId)}`,
    { cache: 'no-store' },
  );

  if (!response.ok) {
    throw new Error(`Unable to load ${config.brand} catalog (HTTP ${response.status.toString()}).`);
  }

  const products = (await response.json()) as Product[];
  if (products.some((product) => product.merchantId !== config.merchantId)) {
    throw new Error('Catalog response contains products for another merchant.');
  }
  return products;
}
