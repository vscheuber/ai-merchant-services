// Auth.js v5 configuration for merchant-web.
//
// Registers a single custom OIDC provider pointing at the merchant identity provider.
// The merchant access_token is captured in the encrypted JWT session cookie on
// the first sign-in (jwt callback) and then exposed on the session object
// (session callback) so Server Components and API routes can consume it
// without re-decrypting the cookie themselves.
//
// The `client_secret_post` token-endpoint auth method is required because the
// AIC merchant realm's merchant-web OAuth2 client is provisioned with
// `advancedOAuth2ClientConfig.tokenEndpointAuthMethod = "client_secret_post"`.
// Auth.js v5 defaults to `client_secret_basic`, so we must explicitly override.
//
// Environment variables (all required at runtime; see .env.example):
//   MERCHANT_OIDC_ISSUER        — AIC merchant realm issuer URL
//   MERCHANT_OIDC_CLIENT_ID     — OAuth2 client ID (merchant-web)
//   MERCHANT_OIDC_CLIENT_SECRET — OAuth2 client secret
//   AUTH_SECRET                 — Random secret used to sign/encrypt Auth.js cookies

// Extend the built-in Auth.js Session type to expose the merchant access_token
// and the OIDC subject identifier (used as userId in payment-api calls).
// This augmentation must be declared in the same module that exports `auth` so
// that TypeScript picks it up wherever `auth()` is called.
import type { Session } from "next-auth"
declare module "next-auth" {
  interface Session {
    /** Merchant identity-provider access token, persisted for downstream exchange. */
    accessToken?: string
    /**
     * OIDC subject identifier from the merchant identity-provider JWT.
     * In this project the AIC merchant-provider user `_id` is set to the data-layer userId
     * (e.g. "user_ada"), so this value can be used directly as the `userId`
     * query parameter in payment-api calls.
     */
    userId?: string
    /** Epoch milliseconds when the merchant access token expires. */
    accessTokenExpiresAt?: number
  }
}

import NextAuth from "next-auth"

interface RefreshedTokenResponse {
  access_token: string
  expires_in?: number
  expires_at?: number
  refresh_token?: string
}

function getJwtExpiry(token: string | undefined): number | undefined {
  const payload = token?.split('.')[1]
  if (!payload) return undefined
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4)
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { exp?: unknown }
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined
  } catch {
    return undefined
  }
}

async function refreshMerchantAccessToken(refreshToken: string): Promise<RefreshedTokenResponse> {
  const issuer = process.env['MERCHANT_OIDC_ISSUER']
  const clientId = process.env['MERCHANT_OIDC_CLIENT_ID']
  const clientSecret = process.env['MERCHANT_OIDC_CLIENT_SECRET']
  if (!issuer || !clientId || !clientSecret) {
    throw new Error('Merchant OIDC refresh configuration is incomplete')
  }

  const response = await fetch(`${issuer.replace(/\/$/, '')}/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  })
  if (!response.ok) {
    throw new Error(`Merchant OIDC refresh failed with HTTP ${response.status}`)
  }
  return (await response.json()) as RefreshedTokenResponse
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "aic",
      name: "Northwind Account",
      type: "oidc",
      // Issuer URL for the AIC merchant realm — used to discover the OIDC metadata
      // endpoint (/.well-known/openid-configuration), authorization endpoint,
      // token endpoint, and JWKS URI automatically.
      issuer: process.env["MERCHANT_OIDC_ISSUER"],
      clientId: process.env["MERCHANT_OIDC_CLIENT_ID"],
      clientSecret: process.env["MERCHANT_OIDC_CLIENT_SECRET"],
      // Override the default client_secret_basic to match AIC's configuration.
      client: {
        token_endpoint_auth_method: "client_secret_post",
      },
    },
  ],
  callbacks: {
    async jwt({ token, account }) {
      // `account` is only non-null on the first sign-in event; on subsequent
      // session reads the JWT is decoded from the cookie and account is null.
      if (account?.access_token) {
        token["accessToken"] = account.access_token
        token["refreshToken"] = account.refresh_token
        token["accessTokenExpiresAt"] = account.expires_at
          ? account.expires_at * 1000
          : getJwtExpiry(account.access_token) ?? Date.now() + (account.expires_in ?? 3600) * 1000
      }

      const expiresAt = token["accessTokenExpiresAt"] as number | undefined
      const refreshToken = token["refreshToken"] as string | undefined
      if (expiresAt && expiresAt <= Date.now() + 30_000 && refreshToken) {
        try {
          const refreshed = await refreshMerchantAccessToken(refreshToken)
          token["accessToken"] = refreshed.access_token
          token["refreshToken"] = refreshed.refresh_token ?? refreshToken
          token["accessTokenExpiresAt"] = refreshed.expires_at
            ? refreshed.expires_at * 1000
            : getJwtExpiry(refreshed.access_token) ?? Date.now() + (refreshed.expires_in ?? 3600) * 1000
        } catch {
          // The refresh token is no longer usable. Clear the access token so the
          // header switches to Sign in and the chatbot can fall back to guest mode.
          delete token["accessToken"]
          delete token["accessTokenExpiresAt"]
        }
      }
      return token
    },
    session({ session, token }) {
      // Expose the persisted access_token on the session object.
      // The cast is safe: we only ever write a string to this slot in the jwt
      // callback above; the JWT's index signature types it as unknown.
      const accessTokenExpiresAt = token["accessTokenExpiresAt"] as number | undefined
      const accessToken = token["accessToken"] as string | undefined
      ;(session as Session).accessToken =
        accessTokenExpiresAt && accessTokenExpiresAt <= Date.now() ? undefined : accessToken
      ;(session as Session).accessTokenExpiresAt = accessTokenExpiresAt
      // Expose the OIDC sub as session.userId for payment-api calls.
      // Auth.js v5 JWT sessions do NOT set session.user.id automatically
      // (only the database strategy does); we must propagate token.sub here.
      // token.sub is the merchant realm user's _id — provisioned as "user_ada"
      // etc. — so it matches the userId keys in data/*.json.
      ;(session as Session).userId = token.sub
      return session
    },
  },
})
