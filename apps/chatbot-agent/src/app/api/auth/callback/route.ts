// GET /api/auth/callback
//
// Handles the OIDC redirect from the merchant IDP after the user authenticates.
// Returns a minimal HTML page whose inline script posts a message back to the
// opener/parent window (embed.js or the merchant-web iframe).
//
// Query-string cases:
//   ?error=<value>&state=<state>     → posts { type: 'chatbot-error', error }
//   ?code=<code>&state=<state>       → exchanges code → alpha token, posts
//                                       { type: 'chatbot-token', accessToken }
//   missing/unknown state            → 400 HTML

import { getAlphaToken } from '../../../../lib/alpha-token';
import { pkceState } from '../../../../lib/pkce-state';

// ── XSS-safe HTML escaping ────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── HTML page builders ────────────────────────────────────────────────────────

function errorPage(errorValue: string, origin: string): string {
  const safeError = escapeHtml(errorValue);
  const safeOrigin = escapeHtml(origin);
  return `<!DOCTYPE html><html><body><script>
(function(){
  var msg = { type: 'chatbot-error', error: '${safeError}' };
  var origin = '${safeOrigin}';
  if (window.opener && window.opener !== window) {
    window.opener.postMessage(msg, origin);
    window.close();
  } else {
    window.parent.postMessage(msg, origin);
  }
})();
</script></body></html>`;
}

function successPage(alphaToken: string, origin: string): string {
  const safeToken = escapeHtml(alphaToken);
  const safeOrigin = escapeHtml(origin);
  return `<!DOCTYPE html><html><body><script>
(function(){
  var msg = { type: 'chatbot-token', accessToken: '${safeToken}' };
  var origin = '${safeOrigin}';
  if (window.opener && window.opener !== window) {
    window.opener.postMessage(msg, origin);
    window.close();
  } else {
    window.parent.postMessage(msg, origin);
  }
})();
</script></body></html>`;
}

function badStatePage(): string {
  return `<!DOCTYPE html><html><body><script>
(function(){
  var msg = { type: 'chatbot-error', error: 'invalid_state' };
  if (window.opener && window.opener !== window) {
    window.opener.postMessage(msg, '*');
    window.close();
  } else {
    window.parent.postMessage(msg, '*');
  }
})();
</script></body></html>`;
}

const HTML_HEADERS = { 'Content-Type': 'text/html' };

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state') ?? '';
  const error = searchParams.get('error');

  // ── Error case ────────────────────────────────────────────────────────────
  if (error !== null) {
    const entry = pkceState.get(state);
    const returnOrigin = entry?.returnOrigin ?? '*';
    pkceState.delete(state);
    return new Response(errorPage(error, returnOrigin), { headers: HTML_HEADERS });
  }

  // ── Success case ──────────────────────────────────────────────────────────

  // a. Look up PKCE state; return 400 HTML if not found.
  const entry = pkceState.get(state);
  if (!entry) {
    return new Response(badStatePage(), { status: 400, headers: HTML_HEADERS });
  }

  const { codeVerifier, returnOrigin } = entry;

  if (!code) {
    pkceState.delete(state);
    return new Response(errorPage('missing_code', returnOrigin), {
      status: 400,
      headers: HTML_HEADERS,
    });
  }

  // b. Exchange the code at the bravo realm token endpoint.
  const issuer = (process.env['MERCHANT_OIDC_ISSUER'] ?? '').replace(/\/$/, '');
  const clientId = process.env['MERCHANT_OIDC_CLIENT_ID'] ?? '';
  const clientSecret = process.env['MERCHANT_OIDC_CLIENT_SECRET'] ?? '';
  const redirectUri = process.env['MERCHANT_OIDC_REDIRECT_URI'] ?? '';

  let bravoAccessToken: string;
  try {
    const tokenEndpoint = `${issuer}/access_token`;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      throw new Error(`Token endpoint responded ${tokenResponse.status}: ${text}`);
    }

    // c. Parse bravoAccessToken from the response.
    const tokenData = (await tokenResponse.json()) as { access_token: string };
    bravoAccessToken = tokenData.access_token;
  } catch (err) {
    pkceState.delete(state);
    const message = err instanceof Error ? err.message : 'token_exchange_failed';
    return new Response(errorPage(message, returnOrigin), { headers: HTML_HEADERS });
  }

  // d. Exchange bravoAccessToken for an alpha realm token.
  let alphaToken: string;
  try {
    alphaToken = await getAlphaToken(bravoAccessToken);
  } catch (err) {
    pkceState.delete(state);
    const message = err instanceof Error ? err.message : 'alpha_exchange_failed';
    return new Response(errorPage(message, returnOrigin), { headers: HTML_HEADERS });
  }

  // e. Remove the state entry from the PKCE map (single-use).
  pkceState.delete(state);

  // f. Return success HTML.
  return new Response(successPage(alphaToken, returnOrigin), { headers: HTML_HEADERS });
}
