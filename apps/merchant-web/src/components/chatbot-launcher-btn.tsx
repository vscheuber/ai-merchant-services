'use client'

export function ChatbotLauncherBtn() {
  return (
    <button
      type="button"
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      onClick={() => window.dispatchEvent(new Event('chatbot:open'))}
    >
      Chat
    </button>
  )
}
