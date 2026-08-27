'use client';

import { useEffect, useRef, useState } from 'react';
import type { TokenTrace } from '@acme/shared';

const STORAGE_KEY = 'merchant-demo-token-trace';
const TRACE_SESSION_KEY = 'merchant-demo-token-trace-session';

function redactToken(token: string): string {
  if (token.length < 24) return '[redacted]';
  return `${token.slice(0, 12)}…${token.slice(-8)}`;
}

function newTraceSessionId(): string {
  return `${crypto.randomUUID()}-${crypto.randomUUID()}`;
}

function getTraceSessionId(): string {
  const configured = (window as Window & { CHATBOT_CONFIG?: { traceSessionId?: string } }).CHATBOT_CONFIG?.traceSessionId;
  if (configured) {
    try {
      window.sessionStorage.setItem(TRACE_SESSION_KEY, configured);
    } catch {
      // Storage may be unavailable in a restrictive browser context.
    }
    return configured;
  }
  try {
    const existing = window.sessionStorage.getItem(TRACE_SESSION_KEY);
    if (existing) return existing;
    const id = newTraceSessionId();
    window.sessionStorage.setItem(TRACE_SESSION_KEY, id);
    return id;
  } catch {
    return newTraceSessionId();
  }
}

export function TokenTracePanel() {
  const [enabled, setEnabled] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [trace, setTrace] = useState<TokenTrace | null>(null);
  const sessionIdRef = useRef<string>('');
  const generationRef = useRef(0);
  const latestRevisionRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current = getTraceSessionId();
    const initialEnabled = window.sessionStorage.getItem(STORAGE_KEY) === 'on';
    const initialRaw = window.sessionStorage.getItem('merchant-demo-token-trace-raw') === 'on';
    setEnabled(initialEnabled);
    setShowRaw(initialRaw);
    const acceptTrace = (detail: TokenTrace | null) => {
      if (!detail || detail.traceSessionId !== sessionIdRef.current) return;
      if ((detail.revision ?? 0) < latestRevisionRef.current) return;
      latestRevisionRef.current = detail.revision ?? latestRevisionRef.current;
      setTrace(detail);
    };
    const onTrace = (event: Event) => {
      const detail = (event as CustomEvent<TokenTrace>).detail;
      acceptTrace(detail);
      if (detail?.traceSessionId === sessionIdRef.current) {
        void fetch(`/api/token-trace?traceSessionId=${encodeURIComponent(sessionIdRef.current)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(detail),
          cache: 'no-store',
        }).catch(() => undefined);
      }
    };
    window.addEventListener('chatbot:trace', onTrace);
    const publishTraceSettings = () =>
      window.dispatchEvent(
        new CustomEvent('chatbot:trace-toggle', {
          detail: {
            enabled: window.sessionStorage.getItem(STORAGE_KEY) === 'on',
            rawTokens: window.sessionStorage.getItem('merchant-demo-token-trace-raw') === 'on',
            traceSessionId: sessionIdRef.current,
          },
        }),
      );
    publishTraceSettings();
    let stopped = false;
    const pollTrace = window.setInterval(async () => {
      const generation = generationRef.current;
      try {
        const response = await fetch(
          `/api/token-trace?traceSessionId=${encodeURIComponent(sessionIdRef.current)}`,
          { cache: 'no-store' },
        );
        if (stopped || generation !== generationRef.current || !response.ok) return;
        const nextTrace = (await response.json()) as TokenTrace | null;
        if (nextTrace === null) {
          latestRevisionRef.current = 0;
          setTrace(null);
        } else {
          acceptTrace(nextTrace);
        }
      } catch {
        // Trace polling is best-effort while the API route is compiling or unavailable.
      }
    }, 1000);
    window.addEventListener('chatbot:trace-settings-ready', publishTraceSettings);
    return () => {
      stopped = true;
      generationRef.current += 1;
      window.removeEventListener('chatbot:trace', onTrace);
      window.removeEventListener('chatbot:trace-settings-ready', publishTraceSettings);
      window.clearInterval(pollTrace);
    };
  }, []);

  async function clearTrace() {
    generationRef.current += 1;
    latestRevisionRef.current = 0;
    setTrace(null);
    try {
      await fetch(`/api/token-trace?traceSessionId=${encodeURIComponent(sessionIdRef.current)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
    } catch {
      // The local state is cleared even if the best-effort persistence call fails.
    }
  }

  function toggle(next: boolean) {
    setEnabled(next);
    window.sessionStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    window.sessionStorage.setItem('merchant-demo-token-trace-raw', showRaw ? 'on' : 'off');
    window.dispatchEvent(
      new CustomEvent('chatbot:trace-toggle', {
        detail: { enabled: next, rawTokens: showRaw, traceSessionId: sessionIdRef.current },
      }),
    );
    if (!next) void clearTrace();
  }

  return (
    <aside className="fixed bottom-4 left-4 z-[2147483001] w-[min(440px,calc(100vw-2rem))] rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 shadow-xl dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => toggle(event.target.checked)}
          />
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
                        `${stage.status.toUpperCase()} ${stage.name}${stage.tokenRole ? ` [${stage.tokenRole}]` : ''}${stage.httpStatus ? ` (${stage.httpStatus})` : ''}`,
                        stage.endpoint ? `endpoint: ${stage.endpoint}` : '',
                        stage.tokenType ? `type: ${stage.tokenType}` : '',
                        stage.scope
                          ? `scope: ${Array.isArray(stage.scope) ? stage.scope.join(' ') : stage.scope}`
                          : '',
                        stage.message ? `message: ${stage.message}` : '',
                        stage.claims ? `claims: ${JSON.stringify(stage.claims)}` : '',
                        stage.rawToken
                          ? `token: ${showRaw ? stage.rawToken : redactToken(stage.rawToken)}`
                          : '',
                      ];
                      return lines.filter(Boolean).join('\\n');
                    })
                    .join('\\n\\n');
                  void navigator.clipboard.writeText(`request: ${trace.requestId}\\n\\n${output}`);
                }}
              >
                Copy trace
              </button>
            ) : null}
            <button type="button" className="underline" onClick={() => void clearTrace()}>
              Clear
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-1 opacity-80">
        Diagnostic mode is scoped to this browser tab and should not be enabled for real users.
      </p>
      {enabled ? (
        <>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={(event) => {
                const next = event.target.checked;
                setShowRaw(next);
                window.sessionStorage.setItem('merchant-demo-token-trace-raw', next ? 'on' : 'off');
                window.dispatchEvent(
                  new CustomEvent('chatbot:trace-toggle', {
                    detail: { enabled, rawTokens: next, traceSessionId: sessionIdRef.current },
                  }),
                );
              }}
            />
            Request raw caller-token strings (server gate required)
          </label>
          {trace ? (
            <div className="mt-2 max-h-72 space-y-2 overflow-auto rounded bg-black/10 p-2 font-mono">
              <div>request: {trace.requestId}</div>
              {trace.stages.map((stage, index) => (
                <div key={`${stage.name}-${index}`} className="border-t border-current/20 pt-1">
                  <div>
                    {stage.status.toUpperCase()} {stage.name}
                    {stage.tokenRole ? ` [${stage.tokenRole}]` : ''}
                    {stage.httpStatus ? ` (${stage.httpStatus})` : ''}
                  </div>
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
  );
}
