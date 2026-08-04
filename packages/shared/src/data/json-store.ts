// Tiny typed JSON reader/writer used by `apps/payment-api` route handlers.
//
// Deliberately dumb: no locking, no concurrency guards, no schema validation.
// This is a POC persistence layer whose whole job is to move JSON blobs in
// and out of `data/*.json` files without every caller re-implementing
// `readFile → JSON.parse` and `JSON.stringify → writeFile`.

import { readFile, writeFile } from 'node:fs/promises';

/**
 * Read a JSON file and cast the result to `T`. The cast is unchecked — the
 * scaffold relies on strict TS in consumers and reviewer-verified schemas in
 * `data/*.json` rather than a runtime validator, per plan Task 3 scope.
 */
export async function readJson<T>(path: string): Promise<T> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as T;
}

/**
 * Write a value to a JSON file. Pretty-printed with two-space indent so
 * hand-editing the seed files in a review stays sane. A trailing newline is
 * appended so the file matches Prettier's default.
 */
export async function writeJson<T>(path: string, value: T): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, text, 'utf8');
}
