// Next.js App Router catch-all route that mounts the Auth.js v5 handler.
//
// This app sets Next.js's own `basePath: '/admin'` (next.config.mjs), so
// every Auth.js endpoint below is externally reachable under /admin/api/auth/*,
// not bare /api/auth/* — e.g.:
//   GET  /admin/api/auth/session         — returns the current session
//   GET  /admin/api/auth/signin          — shows the sign-in page (or auto-redirects to AIC)
//   GET  /admin/api/auth/callback/aic    — receives the OIDC authorization code redirect
//   GET  /admin/api/auth/signout         — renders the sign-out confirmation page
//   POST /admin/api/auth/signout         — destroys the session and redirects
//
// The AIC alpha realm's payment-admin-web OAuth2 client callback URL is
// configured as https://payments.mytestrun.com/admin/api/auth/callback/aic
// (confirmed via a live read of the OAuth2Client config) — the full external
// path, matching this route and Caddy's `handle /admin*` rule.
//
// The catch: Next.js's basePath strips `/admin` from the request *before*
// this handler runs — `handlers.GET`/`POST` (from auth.ts) would otherwise
// see a request for bare `/api/auth/signin`, which doesn't match the
// `basePath: "/admin/api/auth"` configured in auth.ts (needed so Auth.js's
// *outbound* OAuth redirect_uri comes out as the full path above). withAdminPrefix
// below reconstructs a NextRequest with `/admin` restored so inbound action
// parsing and outbound redirect_uri construction agree on the same basePath.
//
// Named re-export pattern is required by Next.js App Router route handlers.

import { NextRequest } from "next/server"
import { handlers } from "../../../../auth"

function withAdminPrefix(request: NextRequest): NextRequest {
  const url = new URL(request.url)
  url.pathname = `/admin${url.pathname}`

  // Typed from NextRequest's own constructor rather than the ambient DOM
  // `RequestInit` — next/server's RequestInit narrows `signal` (no `null`)
  // and adds `duplex`, so the two are not structurally assignable.
  type NextRequestInit = ConstructorParameters<typeof NextRequest>[1]

  // GET/HEAD requests never carry a body; a body stream requires
  // `duplex: "half"` in Node's fetch implementation.
  const init: NextRequestInit =
    request.method === "GET" || request.method === "HEAD"
      ? { method: request.method, headers: request.headers }
      : {
          method: request.method,
          headers: request.headers,
          body: request.body,
          duplex: "half",
        }

  return new NextRequest(url, init)
}

export async function GET(request: NextRequest) {
  return handlers.GET(withAdminPrefix(request))
}

export async function POST(request: NextRequest) {
  return handlers.POST(withAdminPrefix(request))
}
