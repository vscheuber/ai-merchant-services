'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

const EVENT_REQUEST = 'chatbot:auth-request'
const EVENT_STATE = 'chatbot:auth-state'

type AuthStateDetail = {
  source: 'merchant-web'
  status: 'authenticated' | 'anonymous'
  firstName?: string
}

function firstName(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.split(/\s+/)[0]?.slice(0, 80)
}

export function ChatbotAuthBridge() {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status === 'loading') return
    const detail: AuthStateDetail = {
      source: 'merchant-web',
      status: status === 'authenticated' && Boolean(session?.accessToken) ? 'authenticated' : 'anonymous',
      ...(status === 'authenticated' && session?.accessToken
        ? { firstName: firstName(session.firstName ?? session.user?.name) }
        : {}),
    }
    const publish = () => window.dispatchEvent(new CustomEvent(EVENT_STATE, { detail }))
    publish()
    window.addEventListener(EVENT_REQUEST, publish)
    return () => window.removeEventListener(EVENT_REQUEST, publish)
  }, [session, status])

  return null
}
