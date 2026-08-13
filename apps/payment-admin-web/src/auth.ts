// Auth.js v5 configuration for payment-admin-web.
//
// Registers a single custom OIDC provider pointing at the AIC alpha realm.
// The alpha access_token is captured in the encrypted JWT session cookie on
// the first sign-in (jwt callback) and then exposed on the session object
// (session callback) so Server Components and API routes can consume it.
//
// The `client_secret_post` token-endpoint auth method is required because the
// AIC alpha realm's payment-admin-web OAuth2 client is provisioned with
// `advancedOAuth2ClientConfig.tokenEndpointAuthMethod = "client_secret_post"`.
// Auth.js v5 defaults to `client_secret_basic`, so we must explicitly override.
//
// Environment variables (all required at runtime; see .env.example):
//   PAYMENT_OIDC_ISSUER        — AIC alpha realm issuer URL
//   PAYMENT_OIDC_CLIENT_ID     — OAuth2 client ID (payment-admin-web)
//   PAYMENT_OIDC_CLIENT_SECRET — OAuth2 client secret
//   AUTH_SECRET                — Random secret used to sign/encrypt Auth.js cookies

// Extend the built-in Auth.js Session type to expose the alpha access_token
// and the OIDC subject identifier.
import type { Session } from "next-auth"
declare module "next-auth" {
  interface Session {
    /** Alpha realm access_token — used as Bearer token for payment-api calls. */
    accessToken?: string
    /**
     * OIDC subject identifier from the alpha realm JWT.
     * Matches the userId keys in data/*.json (e.g. "user_ada").
     */
    userId?: string
  }
}

import NextAuth from "next-auth"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    {
      id: "aic",
      name: "AIC Alpha",
      type: "oidc",
      // Issuer URL for the AIC alpha realm — used to discover the OIDC metadata
      // endpoint (/.well-known/openid-configuration), authorization endpoint,
      // token endpoint, and JWKS URI automatically.
      issuer: process.env["PAYMENT_OIDC_ISSUER"],
      clientId: process.env["PAYMENT_OIDC_CLIENT_ID"],
      clientSecret: process.env["PAYMENT_OIDC_CLIENT_SECRET"],
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
      if (account?.access_token) {
        token["accessToken"] = account.access_token
      }
      return token
    },
    session({ session, token }) {
      // Expose the persisted access_token on the session object.
      ;(session as Session).accessToken = token["accessToken"] as string | undefined
      // Expose the OIDC sub as session.userId for payment-api calls.
      ;(session as Session).userId = token.sub
      return session
    },
  },
})
