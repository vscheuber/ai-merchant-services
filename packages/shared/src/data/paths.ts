// Filesystem-path helpers for the seed JSON files under `<repo>/data/`.
//
// The consumer's cwd cannot be trusted (Next.js API routes run from the app's
// own working directory), so paths are resolved relative to this file. The
// repo root is three levels up from `packages/shared/src/data/`.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Absolute filesystem path to the repository's `data/` directory. Resolved
 * relative to this file so consumers do not depend on their own cwd.
 */
export const DATA_DIR: string = resolve(__dirname, '..', '..', '..', '..', 'data');

/** Absolute path to a named seed JSON file under `data/`. */
export function dataPath(name: DataFileName): string {
  return resolve(DATA_DIR, `${name}.json`);
}

/** Names of the seed JSON files this package knows about. */
export type DataFileName =
  'merchants' | 'products' | 'users' | 'wallet-cards' | 'transactions' | 'loyalty';
