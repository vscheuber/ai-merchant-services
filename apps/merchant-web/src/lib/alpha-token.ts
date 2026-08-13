// Server-side utility: thin BFF proxy for the bravo→alpha token exchange.
//
// Delegates the full Step 1 token-exchange flow (JWKS verification, service-account
// token, JIT alpha_user provisioning, RFC 8693 exchange) to the chatbot-agent BFF.
//
// Environment variables:
//   CHATBOT_AGENT_BFF_URL  — Base URL of the chatbot-agent BFF service

export async function getAlphaToken(
  bravoToken: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _sessionUser?: { name?: string | null; email?: string | null } | null,
): Promise<string> {
  const bffUrl = process.env['CHATBOT_AGENT_BFF_URL'];
  if (!bffUrl) throw new Error('CHATBOT_AGENT_BFF_URL environment variable is not set');

  const res = await fetch(`${bffUrl.replace(/\/$/, '')}/api/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bravoToken }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  const data = (await res.json()) as { accessToken: string };
  return data.accessToken;
}
