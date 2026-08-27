import Link from 'next/link'
import { auth, signOut } from '../auth'

import { ChatbotLauncherBtn } from './chatbot-launcher-btn'
import { CartHeaderAction } from './cart-header-action'

export async function MerchantHeaderActions() {
  const session = await auth()
  const firstName = session?.firstName ?? session?.user?.name?.trim().split(/\s+/)[0]

  return (
    <div className="flex items-center gap-3">
      <CartHeaderAction />
      <ChatbotLauncherBtn />
      {session?.accessToken ? (
        <details className="relative">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground transition-colors hover:text-foreground">
            <span className="sr-only">Open account menu</span>
            {firstName ? `Hello ${firstName}` : 'Account'}
          </summary>
          <div className="absolute right-0 top-full z-50 mt-2 min-w-32 rounded-md border border-border bg-background p-1 shadow-md">
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/' })
              }}
            >
              <button
                type="submit"
                className="w-full rounded px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Sign out
              </button>
            </form>
          </div>
        </details>
      ) : (
        <Link
          href="/api/auth/signin"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign in
        </Link>
      )}
    </div>
  )
}
