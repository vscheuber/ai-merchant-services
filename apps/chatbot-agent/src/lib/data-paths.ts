// Route-local path helper for the seed JSON files under `<repo>/data/`.
//
// `@acme/shared` exports a `DATA_DIR` constant that resolves relative to its
// own source file via `import.meta.url`. That works fine when consumers run
// the source directly, but Next.js transpiles workspace packages via SWC and
// the effective location of the shared module inside `.next/server/**` is
// unstable — the ".." hops out of `packages/shared/src/data/` no longer land
// on the repo `data/` directory. Resolving at request time from
// `process.cwd()` avoids that snag entirely: `next dev`/`next start` run
// with the app directory (`apps/chatbot-agent`) as cwd, so `../../data` is
// the repo `data/` dir regardless of where the compiled module ends up.

import { resolve } from 'node:path';

import type { DataFileName } from '@acme/shared';

/**
 * Absolute path to the repo's `data/` directory, resolved from the process
 * cwd (which is `apps/chatbot-agent` under both `next dev` and `next start`).
 */
export function dataDir(): string {
  return resolve(process.cwd(), '..', '..', 'data');
}

/** Absolute path to a named seed JSON file under `<repo>/data/`. */
export function dataFilePath(name: DataFileName): string {
  return resolve(dataDir(), `${name}.json`);
}
