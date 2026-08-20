'use client'

import { useEffect, useState } from 'react'
import type { TokenTrace } from '@acme/shared'

const STORAGE_KEY = 'northwind-demo-token-trace'

function redactToken(token: string): string {
  if (token.length < 24) return '[redacted]'
  return `${token.slice(0, 12)}…${token.slice(-8)}`
}

export function TokenTracePanel() {
  const [enabled, setEnabled] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [trace, setTrace] = useState<TokenTrace | null>(null)

  useEffect(() => {
    const initialEnabled = window.sessionStorage.getItem(STORAGE_KEY) === 'on'
    const initialRaw = window.sessionStorage.getItem('northwind-demo-token-trace-raw') === 'on'
    setEnabled(initialEnabled)
    setShowRaw(initialRaw)
    window.dispatchEvent(
      new CustomEvent('chatbot:trace-toggle', {
        detail: { enabled: initialEnabled, rawTokens: initialRaw },
      }),
    )
    const onTrace = (event: Event) => {
      const detail = (event as CustomEvent<TokenTrace>).detail
      setTrace(detail)
    }
    window.addEventListener('chatbot:trace', onTrace)
    return () => window.removeEventListener('chatbot:trace', onTrace)
  }, [])

  function toggle(next: boolean) {
    setEnabled(next)
    window.sessionStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
    window.sessionStorage.setItem('northwind-demo-token-trace-raw', showRaw ? 'on' : 'off')
    window.dispatchEvent(
      new CustomEvent('chatbot:trace-toggle', {
        detail: { enabled: next, rawTokens: showRaw },
      }),
    )
    if (!next) setTrace(null)
  }

  return (
    <aside className="fixed bottom-4 left-4 z-[2147483001] w-[min(440px,calc(100vw-2rem))] rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 shadow-xl dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={enabled} onChange={(event) => toggle(event.target.checked)} />
          Demo token tracing
        </label>
        {enabled ? (
          <div className="flex items-center gap-3">
            {trace ? (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  const output = trace.stages
                    .map((stage) => {
                      const lines = [
                        `${stage.status.toUpperCase()} ${stage.name}${stage.httpStatus ? ` (${stage.httpStatus})` : ''}`,
                        stage.endpoint ? `endpoint: ${stage.endpoint}` : '',
                        stage.tokenType ? `type: ${stage.tokenType}` : '',
                        stage.scope ? `scope: ${Array.isArray(stage.scope) ? stage.scope.join(' ') : stage.scope}` : '',
                        stage.message ? `message: ${stage.message}` : '',
                        stage.claims ? `claims: ${JSON.stringify(stage.claims)}` : '',
                        stage.rawToken ? `token: ${showRaw ? stage.rawToken : redactToken(stage.rawToken)}` : '',
                      ]
                      return lines.filter(Boolean).join('\\n')
                    })
                    .join('\\n\\n')
                  void navigator.clipboard.writeText(`request: ${trace.requestId}\\n\\n${output}`)
                }}
              >
                Copy trace
              </button>
            ) : null}
            <button type="button" className="underline" onClick={() => setTrace(null)}>
              Clear
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-1 opacity-80">Diagnostic mode is scoped to this browser tab and should not be enabled for real users.</p>
      {enabled ? (
        <>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(event) => {
                const next = event.target.checked
                setShowRaw(next)
                window.sessionStorage.setItem('northwind-demo-token-trace-raw', next ? 'on' : 'off')
                window.dispatchEvent(
                  new CustomEvent('chatbot:trace-toggle', {
                    detail: { enabled, rawTokens: next },
                  }),
                )
              }}
            />
            Reveal raw token strings
          </label>
          {trace ? (
            <div className="mt-2 max-h-72 space-y-2 overflow-auto rounded bg-black/10 p-2 font-mono">
              <div>request: {trace.requestId}</div>
              {trace.stages.map((stage, index) => (
                <div key={`${stage.name}-${index}`} className="border-t border-current/20 pt-1">
                  <div>{stage.status.toUpperCase()} {stage.name}{stage.httpStatus ? ` (${stage.httpStatus})` : ''}</div>
                  {stage.endpoint ? <div>endpoint: {stage.endpoint}</div> : null}
                  {stage.tokenType ? <div>type: {stage.tokenType}</div> : null}
                  {stage.scope ? <div>scope: {Array.isArray(stage.scope) ? stage.scope.join(' ') : stage.scope}</div> : null}
                  {stage.message ? <div>message: {stage.message}</div> : null}
                  {stage.claims ? <pre className="whitespace-pre-wrap">{JSON.stringify(stage.claims, null, 2)}</pre> : null}
                  {stage.rawToken ? <div>token: {showRaw ? stage.rawToken : redactToken(stage.rawToken)}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 opacity-80">Open the assistant or send a message to capture a trace.</div>
          )}
        </>
      ) : null}
    </aside>
  )
}
