// Route Handler that kicks off the AIC merchant-realm sign-in flow directly.
//
// Exists because Auth.js's signIn() needs to set cookies (CSRF/PKCE state),
// which Next.js only allows from a Server Action or Route Handler — not from
// a plain Server Component's render body. Server Components that need to
// force sign-in on an unauthenticated visit (account/page.tsx,
// checkout/page.tsx) redirect() here — a plain, synchronous redirect, valid
// anywhere — rather than calling signIn() inline.
//
// GET /login?redirectTo=/account

import { NextRequest } from 'next/server'
import { signIn } from '../../auth'

export async function GET(request: NextRequest) {
  const redirectTo = request.nextUrl.searchParams.get('redirectTo') ?? '/'
  await signIn('aic', { redirectTo })
}
