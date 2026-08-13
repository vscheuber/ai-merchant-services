// Next.js App Router catch-all route that mounts the Auth.js v5 handler.
//
// All Auth.js endpoints are served from /api/auth/*, including:
//   GET  /api/auth/session              — returns the current session
//   GET  /api/auth/signin               — shows the sign-in page (or auto-redirects to AIC)
//   GET  /api/auth/callback/aic         — receives the OIDC authorization code redirect
//   GET  /api/auth/signout              — renders the sign-out confirmation page
//   POST /api/auth/signout              — destroys the session and redirects
//
// The AIC alpha realm's payment-admin-web OAuth2 client callback URL is configured as
// http://localhost:3002/api/auth/callback/aic which matches this route.
//
// Named re-export pattern is required by Next.js App Router route handlers.

import { handlers } from "../../../../auth"

export const { GET, POST } = handlers
