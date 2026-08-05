// Next.js configuration for `merchant-web`.
//
// - `transpilePackages` picks up the workspace packages as raw TypeScript
//   (there is no build step for `@acme/ui` or `@acme/shared`; both are
//   consumed via path aliases in `tsconfig.base.json`).
// - `reactStrictMode` matches the sibling apps.
//
// The overlay bundle from `chatbot-agent` (port 3004) is served with the
// CORS + Content-Type headers set in that app's `next.config.mjs`, so a plain
// `<script src="http://localhost:3004/embed.js" async>` include in the root
// layout works cross-origin without any per-app config here.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@acme/ui', '@acme/shared'],
};

export default nextConfig;
