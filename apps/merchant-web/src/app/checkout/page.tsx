// Checkout page — requires an authenticated Auth.js session.
//
// Server Component that:
//   1. Guards the route with auth() — redirects unauthenticated users to the
//      AIC bravo realm login page with a callbackUrl pointing back to /checkout.
//   2. Exchanges the bravo access_token from the Auth.js session for an alpha
//      realm token via getAlphaToken, then fetches the shopper's saved wallet
//      cards from payment-api using the alpha token as Bearer.
//   3. Passes walletCards and userId to CheckoutForm for the interactive UI.
//
// payment-api validates tokens against the alpha realm JWKS only; a bravo token
// would be rejected with 401. getAlphaToken performs the full Step 1 exchange
// (matching the pattern used by account/page.tsx and products/page.tsx).
//
// The cart summary, card selector, and form submission are handled by the
// CheckoutForm client component (checkout-form.tsx), which reads cart state
// from CartProvider (wired in the root layout by Task 6).
//
// Next.js App Router requires a default export.

import { redirect } from 'next/navigation'
import type { WalletCard } from '@acme/shared'
import { auth } from '../../auth'
import { getAlphaToken } from '../../lib/alpha-token'
import { CheckoutForm } from './checkout-form'

export default async function CheckoutPage() {
  const session = await auth()

  // Redirect to the AIC bravo realm login if there is no active session or if
  // the bravo access_token is missing (e.g. misconfigured jwt callback).
  // Using the same accessToken guard as the proxy route ensures the page only
  // renders when a valid Bearer token is available for the wallet fetch and
  // subsequent form submission.
  if (!session?.accessToken) {
    redirect('/api/auth/signin?callbackUrl=' + encodeURIComponent('/checkout'))
  }

  const userId = session.userId ?? ''
  const baseUrl = process.env['PAYMENT_API_BASE_URL'] ?? 'http://localhost:3003'

  // Exchange the bravo access_token for an alpha realm token so the wallet
  // fetch is accepted by payment-api (which validates against the alpha realm
  // JWKS only). Best-effort: if the exchange fails the page renders with an
  // empty wallet list and CheckoutForm shows a "no saved cards" message.
  let alphaToken = ''
  try {
    alphaToken = await getAlphaToken(session.accessToken ?? '', session.user)
  } catch {
    // Non-blocking — wallet fetch below will return 401 → empty walletCards.
  }

  // ── Wallet fetch (best-effort) ───────────────────────────────────────────
  // Non-blocking: if the payment-api is unavailable the checkout page renders
  // with an empty wallet list and CheckoutForm shows a "no saved cards" message.
  let walletCards: WalletCard[] = []
  try {
    const res = await fetch(
      `${baseUrl}/api/wallet?userId=${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${alphaToken}` }, cache: 'no-store' },
    )
    if (res.ok) {
      walletCards = (await res.json()) as WalletCard[]
    }
  } catch {
    // Non-blocking — CheckoutForm will display "no saved cards on file".
  }

  return <CheckoutForm walletCards={walletCards} userId={userId} />
}
