import Link from 'next/link'
import { auth, signOut } from '../auth'
import { ChatbotLauncherBtn } from './chatbot-launcher-btn'

export async function MerchantHeaderActions() {
  const session = await auth()

  return (
    <div className="flex items-center gap-3">
      <ChatbotLauncherBtn />
      {session?.accessToken ? (
        <form
          action={async () => {
            'use server'
            await signOut({ redirectTo: '/' })
          }}
        >
          <button
            type="submit"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </form>
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
