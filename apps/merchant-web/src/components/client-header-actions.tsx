'use client'

import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'

export function ClientHeaderActions() {
  const { data: session } = useSession()

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => window.dispatchEvent(new Event('chatbot:open'))}
      >
        Chat
      </button>
      {session?.accessToken ? (
        <button
          type="button"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => void signOut({ callbackUrl: '/' })}
        >
          Sign out
        </button>
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
