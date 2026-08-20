/** A redacted or explicitly revealed token-exchange diagnostic stage. */
export interface TokenTraceStage {
  /** Stable stage name, for example `merchant-provider-token` or `idm-lookup`. */
  name: string
  status: 'started' | 'succeeded' | 'not-found' | 'failed'
  endpoint?: string
  httpStatus?: number
  tokenType?: string
  scope?: string | readonly string[]
  claims?: Record<string, unknown>
  /** Populated only when the demo trace's raw-token option is enabled. */
  rawToken?: string
  message?: string
}

/** Diagnostics returned only when an operator explicitly enables demo tracing. */
export interface TokenTrace {
  requestId: string
  capturedAt: string
  stages: readonly TokenTraceStage[]
}
