// Next.js configuration for `payment-api`.
//
// `transpilePackages` includes `@acme/shared` so Next's compiler picks up the
// package's raw TypeScript sources (there is no build step for workspace
// packages; they are consumed via the `@acme/shared` path alias in
// `tsconfig.base.json`).
//
// This is an API-only Next.js app (route handlers under `src/app/api/**`).
// The single top-level page at `/` is a plain HTML index describing the app's
// role — no styling package or shadcn primitives are needed here.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@acme/shared'],
};

export default nextConfig;
