// Next.js configuration for `payment-admin-web` (Acme Payments Admin UI).
//
// - `transpilePackages` picks up the workspace packages as raw TypeScript
//   (there is no build step for `@acme/ui` or `@acme/shared`; both are
//   consumed via path aliases in `tsconfig.base.json`).
// - `reactStrictMode` matches the sibling apps.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@acme/ui', '@acme/shared'],
};

export default nextConfig;
