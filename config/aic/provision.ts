// AIC provisioning entry point.
//
// This file is a deliberate stub for the scaffold PR. It exists so
// `pnpm --filter @acme/aic-config provision` has a target to invoke and so
// the follow-on wiring PR has a stable entry point to fill in without
// re-deciding the folder shape.
//
// The follow-on PR will:
//   1. Read `inputs/tenant.json` + `inputs/{alpha,bravo}/*.json`.
//   2. Reconcile against AIC via `mcp-volker-dev` tools.
//   3. Write the result to `outputs/{alpha,bravo}.json` (gitignored).
//
// For now, this exits 0 with a fixed log so downstream verification passes.

export const main = (): void => {
  console.log('config/aic/provision.ts — not yet implemented');
};

main();
