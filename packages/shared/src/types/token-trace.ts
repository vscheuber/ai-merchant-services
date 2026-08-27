/** A redacted or operator-authorized token-exchange diagnostic stage. */
export interface TokenTraceStage {
  /** Stable stage name, for example `merchant-provider-token` or `idm-lookup`. */
  name: string;
  /** Correlation identifier for the token operation that produced this stage. */
  requestId?: string;
  status: 'started' | 'succeeded' | 'not-found' | 'reconciled' | 'failed';
  endpoint?: string;
  httpStatus?: number;
  tokenType?: string;
  scope?: string | readonly string[];
  claims?: Record<string, unknown>;
  /** Semantic token role, allowing the UI to distinguish user tokens from service tokens. */
  tokenRole?: 'merchant-user' | 'payment-user' | 'agent' | 'service' | 'session';
  /** Populated only when the demo trace's raw-token option is enabled. */
  rawToken?: string;
  message?: string;
}

/** Diagnostics returned only when an operator explicitly enables demo tracing. */
export interface TokenTrace {
  /** Opaque browser/auth diagnostic session. Never use a token or cookie value. */
  traceSessionId: string;
  /** Correlation identifier for the operation that produced this trace fragment. */
  requestId: string;
  /** Identifies the service that produced the trace. */
  source?: 'merchant-web-auth' | 'merchant-web-token-exchange' | 'chatbot-agent';
  capturedAt: string;
  /** Store revision, assigned when the trace is persisted. */
  revision?: number;
  updatedAt?: string;
  stages: readonly TokenTraceStage[];
}
