// Next.js configuration for `chatbot-agent`.
//
// - `transpilePackages` picks up the workspace packages as raw TypeScript
//   (there is no build step for `@acme/ui` or `@acme/shared`; both are
//   consumed via path aliases in `tsconfig.base.json`).
// - `reactStrictMode` matches the sibling `payment-api` app.
// - `headers()` sets `Access-Control-Allow-Origin: *` on `/embed.js` so that
//   `merchant-web` on :3000 (Task 6) can fetch the bundle if it ever moves
//   from a plain `<script>` include to something CORS-sensitive (e.g. a
//   `fetch()` + eval, or a preload with `crossorigin`). A vanilla
//   `<script src="…">` include is not subject to CORS today, but the header
//   is cheap and future-proofs the primary integration path.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@acme/ui', '@acme/shared'],
  async headers() {
    return [
      {
        source: '/embed.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
