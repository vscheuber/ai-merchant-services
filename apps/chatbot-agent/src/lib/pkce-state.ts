// Module-level PKCE state shared between /api/auth/start and /api/auth/callback.
//
// Keyed by the opaque `state` string generated in /api/auth/start.
// The entry is consumed (deleted) by /api/auth/callback once the code has been
// exchanged, so each state value is single-use.
//
// NOTE: This in-process Map works for a single-instance dev server. A
// distributed deployment would need an external store (Redis, KV, etc.).

export interface PkceEntry {
  codeVerifier: string;
  returnOrigin: string;
}

export const pkceState: Map<string, PkceEntry> = new Map();
