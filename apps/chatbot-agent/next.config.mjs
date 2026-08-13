// Next.js configuration for `chatbot-agent`.
//
// - `transpilePackages` picks up the workspace packages as raw TypeScript
//   (there is no build step for `@acme/ui` or `@acme/shared`; both are
//   consumed via path aliases in `tsconfig.base.json`).
// - `reactStrictMode` matches the sibling `payment-api` app.
// - `headers()` sets:
//   - `Access-Control-Allow-Origin: *` on `/embed.js` so that `merchant-web`
//     on :3000 (Task 6) can fetch the bundle if it ever moves from a plain
//     `<script>` include to something CORS-sensitive (e.g. a `fetch()` + eval,
//     or a preload with `crossorigin`). A vanilla `<script src="…">` include
//     is not subject to CORS today, but the header is cheap and future-proofs
//     the primary integration path.
//   - CORS headers on `/api/:path*` so that `embed.js` running in the
//     merchant-web context (origin http://localhost:3000) can POST to
//     http://localhost:3004/api/chat without being blocked by the browser's
//     same-origin policy. A `POST` with `Content-Type: application/json`
//     triggers a CORS preflight (`OPTIONS`); the route.ts also exports an
//     `OPTIONS` handler to return a 204 for the preflight.

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
      {
        // Allow embed.js (merchant-web origin :3000) to POST to /api/chat.
        // The Access-Control-Allow-Headers must include Authorization because
        // Task 11 embed.js sends `Authorization: Bearer <alphaToken>`.
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
