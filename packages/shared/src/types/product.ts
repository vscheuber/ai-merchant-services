/**
 * A product on sale at a specific merchant.
 *
 * Seed data lives at `data/products.json`. Every product carries the
 * `merchantId` foreign key so admin funnel views can group per merchant
 * without a join, and so the merchant-web surface can filter to its own
 * catalog.
 */
export type ProductCategory = 'laptops' | 'phones' | 'headphones' | 'gaming' | 'home';

export interface Product {
  /** Stable synthetic id, e.g. `prod_northwind_001`. */
  id: string;
  /** Merchant SKU — unique within a merchant. */
  sku: string;
  /** Owning merchant. */
  merchantId: string;
  /** Human-readable product name. */
  name: string;
  /** Product category — used for grouping and category tiles on the storefront. */
  category: ProductCategory;
  /** Price in the merchant's currency, expressed in major units (e.g. dollars). */
  price: number;
  /** ISO 4217 currency code, e.g. `USD`. */
  currency: string;
  /** Public URL/path to the product image. Placeholder in the scaffold. */
  imageUrl: string;
  /** Short product blurb. */
  description: string;
  /** On-hand inventory count. */
  stock: number;
}
