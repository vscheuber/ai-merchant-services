// Session-aware header action for payment-admin-web — mirrors merchant-web's
// MerchantHeaderActions. Every admin page passes this into AppShell's
// `actions` slot.
//
// Without this, there was no sign-in/sign-out control anywhere in the app:
// an expired access token (the alpha OAuth2 client's tokens live 1 hour) left
// the admin stuck looking at "Unable to load transactions (HTTP 401)" with no
// way to re-authenticate short of typing /admin/api/auth/signin by hand.
//
// Uses the same explicit-provider-id pattern as merchant-web's header
// actions: calling signIn('aic')/signOut() directly from a Server Action
// skips Auth.js's generic provider-picker page (see merchant-web's
// client-header-actions.tsx for the fuller writeup of why that page exists).

import { auth, signIn, signOut } from '../auth'

export async function HeaderActions() {
  const session = await auth()

  if (session?.accessToken) {
    const name = session.user?.name ?? 'Admin'
    return (
      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/' })
        }}
        className="flex items-center gap-3 text-sm text-muted-foreground"
      >
        <span>{name}</span>
        <button
          type="submit"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    )
  }

  return (
    <form
      action={async () => {
        'use server'
        await signIn('aic')
      }}
    >
      <button
        type="submit"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in
      </button>
    </form>
  )
}
