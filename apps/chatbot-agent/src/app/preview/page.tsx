// Standalone dev-preview route. Renders the `ChatShell` from `@acme/ui`
// inline against a plain background so a developer can iterate on the shell
// in isolation from the embeddable-overlay bootstrap. This is the *secondary*
// surface per AC 6; the primary surface is the overlay embedded inside
// `merchant-web` (Task 6). Next.js App Router requires a default export.

import { ChatShell } from '@acme/ui';

export default function PreviewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Acme Assist — standalone preview
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Chat shell (inline)</h1>
        <p className="text-sm text-muted-foreground">
          This is the standalone dev preview at{' '}
          <code className="rounded bg-muted px-1">/preview</code>. The same shell renders as a
          fixed-position overlay inside merchant-web (primary surface).
        </p>
      </div>
      <ChatShell inline />
    </main>
  );
}
