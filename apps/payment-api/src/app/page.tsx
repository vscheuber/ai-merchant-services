// Static index for the payment API app. This app has no consumer UI; the
// page just documents its role and lists the stub route handlers so a
// developer visiting http://localhost:3003/ knows what they are looking at.
// Next.js requires a default export for App Router pages.

const routes: ReadonlyArray<{ method: string; path: string; note: string }> = [
  { method: 'GET', path: '/api/health', note: 'Liveness probe — returns {status,service}.' },
  { method: 'GET', path: '/api/transactions', note: 'List transactions (stub: empty array).' },
  { method: 'POST', path: '/api/transactions', note: 'Create transaction (stub: 501).' },
  { method: 'GET', path: '/api/wallet', note: 'List wallet cards (stub: empty array).' },
  { method: 'POST', path: '/api/wallet', note: 'Create wallet card (stub: 501).' },
  { method: 'GET', path: '/api/loyalty', note: 'List loyalty balances (stub: empty array).' },
  { method: 'POST', path: '/api/loyalty', note: 'Update loyalty balance (stub: 501).' },
  { method: 'POST', path: '/api/checkout', note: 'Initiate checkout (stub: 501).' },
];

export default function Page() {
  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.25rem' }}>
      <header>
        <p
          style={{
            display: 'inline-block',
            padding: '0.25rem 0.6rem',
            borderRadius: 999,
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            fontSize: 12,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          Acme Payments
        </p>
        <h1 style={{ fontSize: '2rem', margin: '0.75rem 0 0.25rem' }}>Payment API</h1>
        <p style={{ margin: 0, color: '#94a3b8' }}>
          Internal service for wallet, loyalty, transaction, and checkout operations. Consumed by
          the merchant surfaces and (once wired) by the Acme Assist chatbot on behalf of an
          authenticated shopper.
        </p>
      </header>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Role in the flow
        </h2>
        <p style={{ color: '#cbd5e1' }}>
          This app runs on port <code>3003</code> and exposes stub route handlers only. Requests
          that would mutate state return <code>501 Not Implemented</code>; read endpoints return
          shape-correct empty results. Real logic lands in follow-on PRs.
        </p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Routes
        </h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {routes.map((r) => (
            <li
              key={`${r.method} ${r.path}`}
              style={{
                display: 'flex',
                gap: '0.75rem',
                padding: '0.5rem 0',
                borderBottom: '1px solid #1e293b',
              }}
            >
              <span
                style={{
                  flex: '0 0 3.5rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  color: '#38bdf8',
                }}
              >
                {r.method}
              </span>
              <code
                style={{
                  flex: '0 0 12rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: '#e2e8f0',
                }}
              >
                {r.path}
              </code>
              <span style={{ color: '#94a3b8', fontSize: 14 }}>{r.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer style={{ marginTop: '3rem', color: '#475569', fontSize: 12 }}>
        Scaffold placeholder — no auth, no external network, no cross-app fetches.
      </footer>
    </main>
  );
}
