// Auth.js v5 configuration for merchant-web.
//
// Registers a single custom OIDC provider pointing at the AIC bravo realm.
// The bravo access_token is captured in the encrypted JWT session cookie on
// the first sign-in (jwt callback) and then exposed on the session object
// (session callback) so Server Components and API routes can consume it
// without re-decrypting the cookie themselves.
//
// The `client_secret_post` token-endpoint auth method is required because the
// AIC bravo realm's merchant-web OAuth2 client is provisioned with
// `advancedOAuth2ClientConfig.tokenEndpointAuthMethod = "client_secret_post"`.
// Auth.js v5 defaults to `client_secret_basic`, so we must explicitly override.
//
// Environment variables (all required at runtime; see .env.example):
//   MERCHANT_OIDC_ISSUER        — AIC bravo realm issuer URL
//   MERCHANT_OIDC_CLIENT_ID     — OAuth2 client ID (merchant-web)
//   MERCHANT_OIDC_CLIENT_SECRET — OAuth2 client secret
//   AUTH_SECRET                 — Random secret used to sign/encrypt Auth.js cookies

// Extend the built-in Auth.js Session type to expose the bravo access_token
// and the OIDC subject identifier (used as userId in payment-api calls).
// This augmentation must be declared in the same module that exports `auth` so
// that TypeScript picks it up wherever `auth()` is called.
import type { Session } from "next-auth"
declare module "next-auth" {
  interface Session {
    /** Bravo realm access_token — persisted for downstream token-exchange (Task 9). */
    accessToken?: string
    /**
     * OIDC subject identifier from the bravo realm JWT.
     * In this project the AIC bravo_user `_id` is set to the data-layer userId
     * (e.g. "user_ada"), so this value can be used directly as the `userId`
     * query parameter in payment-api calls.
     */
    userId?: string
  }
}

import NextAuth from "next-auth"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "aic",
      name: "AIC Bravo",
      type: "oidc",
      // Issuer URL for the AIC bravo realm — used to discover the OIDC metadata
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
    jwt({ token, account }) {
      // `account` is only non-null on the first sign-in event; on subsequent
      // session reads the JWT is decoded from the cookie and account is null.
      // We therefore only write when account is present to avoid overwriting a
      // previously stored value with undefined.
      if (account?.access_token) {
        token["accessToken"] = account.access_token
      }
      return token
    },
    session({ session, token }) {
      // Expose the persisted access_token on the session object.
      // The cast is safe: we only ever write a string to this slot in the jwt
      // callback above; the JWT's index signature types it as unknown.
      ;(session as Session).accessToken = token["accessToken"] as string | undefined
      // Expose the OIDC sub as session.userId for payment-api calls.
      // Auth.js v5 JWT sessions do NOT set session.user.id automatically
      // (only the database strategy does); we must propagate token.sub here.
      // token.sub is the bravo realm user's _id — provisioned as "user_ada"
      // etc. — so it matches the userId keys in data/*.json.
      ;(session as Session).userId = token.sub
      return session
    },
  },
})
