'use client'

import { signIn, signOut, useSession } from 'next-auth/react'
import { CartHeaderAction } from './cart-header-action'

function firstName(name: string | null | undefined): string {
  const value = name?.trim()
  return value ? value.split(/\s+/)[0] ?? value : 'there'
}

export function ClientHeaderActions() {
  const { data: session, status } = useSession()
  const greeting = session?.firstName ?? firstName(session?.user?.name)

  return (
    <div className="flex items-center gap-3">
      <CartHeaderAction />
      <button
        type="button"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => window.dispatchEvent(new Event('chatbot:open'))}
      >
        Chat
      </button>
      {status !== 'loading' && session?.accessToken ? (
        <details className="relative">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground transition-colors hover:text-foreground">
            Hello {greeting}
          </summary>
          <div className="absolute right-0 z-50 mt-2 min-w-28 rounded-md border border-border bg-background p-1 shadow-md">
            <button
              type="button"
              className="w-full rounded px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => void signOut({ redirectTo: '/' })}
            >
              Sign out
            </button>
          </div>
        </details>
      ) : status === 'unauthenticated' ? (
        // A plain link to /api/auth/signin renders Auth.js's generic
        // provider-picker page (one button per configured provider, even
        // when there's only one) before actually redirecting to the IDP.
        // Calling signIn() with the explicit provider id here skips that
        // extra click and redirects straight to AIC's authorize endpoint.
        <button
          type="button"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => void signIn('aic')}
        >
          Sign in
        </button>
      ) : null}
    </div>
  )
}
