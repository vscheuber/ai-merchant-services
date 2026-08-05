// Landing page for chatbot-agent. Uses the shared `AppShell` from `@acme/ui`
// so brand + dark-mode toggle + nav placeholder render consistently with the
// other Next.js surfaces in the scaffold. Describes Acme Assist's role in the
// three-party architecture and points a developer at the two other surfaces
// this app exposes (the embeddable bundle at /embed.js and the standalone
// preview at /preview). Next.js App Router requires a default export.

import { AppShell, Card, CardHeader, CardTitle, CardDescription, CardContent } from '@acme/ui';

const nav = [
  { label: 'Preview', href: '/preview' },
  { label: 'Embed', href: '/embed.js' },
  { label: 'Chat API', href: '/api/chat' },
] as const;

export default function Page() {
  return (
    <AppShell brand="Acme Assist" tagline="Merchant-embedded chatbot" nav={nav}>
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Acme Assist</h1>
        <p className="max-w-2xl text-muted-foreground">
          Acme Assist is the merchant-embedded chat assistant provided by Acme Payments.
          Merchants drop a single script tag into their site and the overlay renders in the
          bottom-right corner on every page. This app hosts both the embeddable bundle and a
          stub chat API. It runs on port <code className="rounded bg-muted px-1">3004</code>.
        </p>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Embeddable overlay</CardTitle>
            <CardDescription>Primary surface — dropped into merchant sites.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Served as a static asset at <code className="rounded bg-muted px-1">/embed.js</code>.
            Injects a fixed-position chat shell into the host page. Consumed by
            <code className="mx-1 rounded bg-muted px-1">merchant-web</code>
            via a <code className="rounded bg-muted px-1">&lt;script&gt;</code> tag in its root layout.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Standalone preview</CardTitle>
            <CardDescription>Secondary surface — for isolated development.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Visit <code className="rounded bg-muted px-1">/preview</code> to see the same chat
            shell rendered inline against a plain background.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Chat API stub</CardTitle>
            <CardDescription>Stubbed echo — no LLM client wired in this PR.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1">POST /api/chat</code> echoes the last user
            message back with a static assistant preamble. The real LLM path lands in a
            follow-on PR.
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Role in the flow
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every chatbot-initiated payment requires explicit in-chat user consent
          (human-in-the-loop is mandatory). The chat shell reserves a disabled
          &ldquo;Confirm &amp; pay&rdquo; button as a structural placeholder for that consent
          slot; wiring lands with the checkout flow in a follow-on task.
        </p>
      </section>
    </AppShell>
  );
}
