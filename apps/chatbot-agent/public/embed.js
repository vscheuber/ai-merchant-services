/*
 * Shopping assistant — interactive chat overlay.
 *
 * Served as a static asset from `/embed.js`. Merchant sites include it via:
 *
 *   <script src="http://localhost:3004/embed.js" async></script>
 *
 * On load it injects a fixed bottom-right chat-shell <div> into `document.body`
 * with inline styles (no external CSS dependency). The markup mirrors the React
 * ChatShell in `@acme/ui` but does NOT import from `@acme/ui` — a <script>-tag
 * embed cannot ES-import from a workspace package at runtime.
 *
 * Interactive behaviour:
 *   - On open: attempts silent SSO into the merchant IDP's payment-provider-owned
 *     `merchant-bridge` public client (`prompt=none` + PKCE, via a small popup —
 *     see `silent-callback.html`). If the shopper has a live merchant IDP session,
 *     this yields a merchant ID token with zero UI. If not (guest, popup blocked,
 *     `login_required`), the widget falls back to guest mode — no error shown,
 *     guests can still browse the catalog. Never touches merchant-web's own
 *     session/login code; this is an entirely separate, additive OIDC client.
 *   - Send button + Enter key: posts `{ messages, merchantId, ...credential }` to
 *     the chatbot-agent `/api/chat` endpoint, where `...credential` is either the
 *     one-time PKCE `{ merchantAuthCode, merchantCodeVerifier }` pair (first turn)
 *     or a cached `{ merchantToken }` (every turn after — the backend exchanges the
 *     code once and echoes the resulting merchant ID token back for the widget to
 *     cache, since the code itself is single-use). The backend performs the code
 *     exchange, the merchant-token-login journey, and the session→token bridge
 *     (Step 1) itself, then renders the assistant response.
 *   - "Confirm & pay" button becomes active when the chatbot proposes a purchase
 *     (`proposedPurchase` in the response). Clicking it sends a confirmation
 *     request with `confirmedAt` and displays the checkout result.
 *
 * No ESM imports. Named-export ESLint rule does not apply (public static asset).
 */
(function () {
  'use strict';

  var MOUNT_ID = 'acme-assist-overlay-root';

  // Read chatbot display name from window.CHATBOT_CONFIG set by the host page.
  var CHATBOT_NAME =
    (window.CHATBOT_CONFIG && window.CHATBOT_CONFIG.name) || 'Shopping Assistant';

  // Derive the chatbot API base URL from this script's own src.
  // document.currentScript is null for async scripts, so we search the DOM.
  var _selfScript = null;
  var _allScripts = document.querySelectorAll('script[src]');
  for (var _si = 0; _si < _allScripts.length; _si++) {
    if (_allScripts[_si].src.indexOf('embed.js') !== -1) {
      _selfScript = _allScripts[_si];
      break;
    }
  }
  var _chatbotBase = _selfScript
    ? _selfScript.src.replace(/\/embed\.js([?#].*)?$/, '')
    : '';

  // The chatbot API is served by this bundle's host.
  var CHAT_URL =
    (window.CHATBOT_CONFIG && window.CHATBOT_CONFIG.chatUrl) ||
    (_chatbotBase ? _chatbotBase + '/api/chat' : '/chatbot/api/chat');

  // ── Silent-SSO config ───────────────────────────────────────────────────────
  // Set by the host page (merchant-web's root layout or equivalent) — the
  // additive, per-merchant trust setup. Any field missing skips silent SSO
  // entirely and the widget starts in guest mode.
  var cfg = window.CHATBOT_CONFIG || {};
  var MERCHANT_ID = cfg.merchantId || null;
  var MERCHANT_IDP_AUTHORIZE_URL = cfg.merchantIdpAuthorizeUrl || null;
  var MERCHANT_BRIDGE_CLIENT_ID = cfg.merchantBridgeClientId || null;
  var SILENT_CALLBACK_URL = cfg.silentCallbackUrl || null;
  var SSO_POPUP_TIMEOUT_MS = 4000;
  var traceEnabled = false;
  var traceRaw = false;

  function syncTraceSettings() {
    var detail = null;
    try {
      traceEnabled = window.sessionStorage.getItem('northwind-demo-token-trace') === 'on';
      detail = window.sessionStorage.getItem('northwind-demo-token-trace-raw') === 'on';
    } catch (_) {
      // Storage may be unavailable in a restrictive embed context.
    }
    traceRaw = Boolean(detail);
  }

  window.addEventListener('chatbot:trace-toggle', function (event) {
    var detail = event && event.detail;
    traceEnabled = Boolean(detail && detail.enabled);
    traceRaw = Boolean(detail && detail.rawTokens);
    try {
      window.sessionStorage.setItem('northwind-demo-token-trace', traceEnabled ? 'on' : 'off');
      window.sessionStorage.setItem('northwind-demo-token-trace-raw', traceRaw ? 'on' : 'off');
    } catch (_) {
      // Storage may be unavailable in a restrictive embed context.
    }
  });

  // ── Module-level state ─────────────────────────────────────────────────────
  // Preserved across open/close cycles so conversation is not lost on minimise.

  /**
   * PKCE authorization code + verifier from silent SSO, null until the popup
   * flow succeeds. Single-use — sent to the backend once, which exchanges it
   * for a merchant ID token and hands that back for `merchantToken` to cache
   * (see the chatbot:trace-independent response handling in sendMessage).
   */
  var merchantAuthCode = null;
  var merchantCodeVerifier = null;
  /** Merchant ID token, once the backend has exchanged the auth code for one. */
  var merchantToken = null;
  var guestSession = true;

  /** True while the silent-SSO popup flow is in-flight — prevents duplicate attempts. */
  var ssoInFlight = false;
  /** True once a silent-SSO attempt has run (success or fallback) — attempted only once per page load. */
  var ssoAttempted = false;

  /** Ordered conversation turns for the LLM (system turns excluded). */
  var messageHistory = []; // { role: 'user'|'assistant', content: string }[]

  /** Purchase proposed by the chatbot in the most recent turn; awaiting confirmation. */
  var pendingProposedPurchase = null;

  // Active DOM references — updated each time the open panel is rendered.
  // Async callbacks use these to mutate the live panel without a full rebuild.
  var activeBubbleList = null;
  var activeConsentBtn = null;
  var activeTextarea = null;

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.getElementById(MOUNT_ID)) return;

  // ── DOM helper ─────────────────────────────────────────────────────────────
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'style' && typeof v === 'object') {
          for (var s in v) {
            if (Object.prototype.hasOwnProperty.call(v, s)) el.style[s] = v[s];
          }
        } else if (k === 'text') {
          el.textContent = v;
        } else if (k.indexOf('on') === 0 && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) {
          el.setAttribute(k, '');
        } else if (v === false || v == null) {
          // skip
        } else {
          el.setAttribute(k, String(v));
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i += 1) {
        var c = children[i];
        if (c == null) continue;
        if (typeof c === 'string') el.appendChild(document.createTextNode(c));
        else el.appendChild(c);
      }
    }
    return el;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  var containerStyle = {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: '2147483000',
    width: '352px',
    maxWidth: 'calc(100vw - 32px)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    boxSizing: 'border-box',
  };

  var panelStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '512px',
    maxHeight: 'calc(100vh - 32px)',
    background: '#ffffff',
    color: '#0f172a',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    overflow: 'hidden',
    boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.35)',
    boxSizing: 'border-box',
  };

  var headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    padding: '12px 16px',
  };

  var titleWrapStyle = { display: 'flex', flexDirection: 'column', lineHeight: '1.15' };
  var titleStyle = { fontSize: '14px', fontWeight: '600', color: '#0f172a' };
  var subtitleStyle = { fontSize: '12px', color: '#64748b' };

  var closeBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: '0',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    borderRadius: '6px',
    fontSize: '18px',
    lineHeight: '1',
  };

  var listStyle = {
    listStyle: 'none',
    margin: '0',
    padding: '16px',
    flex: '1 1 auto',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  var composerStyle = {
    borderTop: '1px solid #e2e8f0',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  // Textarea sits inside a flex row alongside the send button — flex: '1 1 auto'
  // lets it expand while the send button stays fixed-width.
  var inputStyle = {
    flex: '1 1 auto',
    minWidth: '0',
    resize: 'none',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#0f172a',
    fontSize: '14px',
    lineHeight: '1.35',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  var sendBtnStyle = {
    flexShrink: '0',
    alignSelf: 'flex-end',
    padding: '8px 14px',
    borderRadius: '6px',
    border: '0',
    background: '#0f172a',
    color: '#f8fafc',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };

  // Consent button — disabled state (no proposed purchase pending).
  var consentBtnDisabledStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '0',
    background: '#94a3b8',
    color: '#f8fafc',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'not-allowed',
    opacity: '0.7',
  };

  // Consent button — active state (proposed purchase is ready for confirmation).
  var consentBtnActiveStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '0',
    background: '#0f172a',
    color: '#f8fafc',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    opacity: '1',
  };

  var launcherStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '999px',
    border: '0',
    background: '#0f172a',
    color: '#f8fafc',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    boxShadow: '0 12px 24px -8px rgba(15, 23, 42, 0.35)',
    fontFamily: 'inherit',
  };

  // ── Bubble builder ─────────────────────────────────────────────────────────
  function bubble(role, text) {
    var isUser = role === 'user';
    return h(
      'li',
      {
        style: {
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        },
      },
      [
        h(
          'div',
          {
            style: {
              maxWidth: '85%',
              padding: '8px 12px',
              borderRadius: '10px',
              fontSize: '14px',
              lineHeight: '1.35',
              background: isUser ? '#0f172a' : '#f1f5f9',
              color: isUser ? '#f8fafc' : '#0f172a',
            },
            text: text,
          },
          null,
        ),
      ],
    );
  }

  // ── DOM mutation helpers ───────────────────────────────────────────────────

  /**
   * Append a chat bubble to the active message list and scroll it into view.
   * No-ops silently when the panel is closed (activeBubbleList is null or detached).
   * Returns the created <li> element so callers can remove it (e.g. loading dots).
   */
  function appendBubble(role, text) {
    if (!activeBubbleList) return null;
    var b = bubble(role, text);
    activeBubbleList.appendChild(b);
    activeBubbleList.scrollTop = activeBubbleList.scrollHeight;
    return b;
  }

  /**
   * Update the consent button label and enabled/disabled state to reflect the
   * given proposed purchase. Pass null to clear the proposal and disable the button.
   */
  function setConsentButtonState(purchase) {
    pendingProposedPurchase = purchase;
    if (!activeConsentBtn) return;

    var targetStyle = purchase ? consentBtnActiveStyle : consentBtnDisabledStyle;
    for (var k in targetStyle) {
      if (Object.prototype.hasOwnProperty.call(targetStyle, k)) {
        activeConsentBtn.style[k] = targetStyle[k];
      }
    }

    if (purchase) {
      var qty = purchase.quantity > 1 ? ' × ' + String(purchase.quantity) : '';
      activeConsentBtn.textContent =
        'Confirm & pay: ' +
        purchase.productName +
        ' — $' +
        purchase.unitPrice.toFixed(2) +
        qty;
      activeConsentBtn.removeAttribute('disabled');
      activeConsentBtn.setAttribute('aria-disabled', 'false');
    } else {
      activeConsentBtn.textContent = 'Confirm & pay';
      activeConsentBtn.setAttribute('disabled', '');
      activeConsentBtn.setAttribute('aria-disabled', 'true');
    }
  }

  // ── Re-enable input ────────────────────────────────────────────────────────

  /** True once the widget has some merchant credential to send with the next chat request. */
  function hasMerchantCredential() {
    return Boolean(merchantToken || (merchantAuthCode && merchantCodeVerifier));
  }

  /**
   * Fields to merge into the next `/api/chat` request body. Prefers the
   * cached merchant ID token (from a prior response) over the one-time PKCE
   * code, since the code is already consumed once the backend exchanges it.
   */
  function merchantCredentialFields() {
    if (merchantToken) return { merchantToken: merchantToken, merchantId: MERCHANT_ID };
    if (merchantAuthCode && merchantCodeVerifier) {
      return {
        merchantAuthCode: merchantAuthCode,
        merchantCodeVerifier: merchantCodeVerifier,
        merchantId: MERCHANT_ID,
      };
    }
    return {};
  }

  /** Cache a merchant ID token the backend just exchanged from our one-time code. */
  function cacheMerchantTokenFromResponse(data) {
    if (data && data.merchantToken) {
      merchantToken = data.merchantToken;
      merchantAuthCode = null;
      merchantCodeVerifier = null;
    }
  }

  /** Remove the readonly guard from the textarea once an async operation completes. */
  function reenableInput() {
    if (activeTextarea && hasMerchantCredential()) {
      activeTextarea.removeAttribute('readonly');
    }
  }

  // ── Silent SSO (Step 1, browser side) ──────────────────────────────────────
  //
  // Reuses the shopper's existing merchant IDP SSO cookie (established entirely
  // by the merchant's own login, unrelated to this widget) to silently obtain a
  // merchant ID token via a payment-provider-owned public client
  // (`merchant-bridge`), using OIDC `prompt=none` + PKCE through a tiny popup.
  // Failure of any kind (no session, popup blocked, config missing) is a normal
  // guest-mode fallback, not an error — no bubble is shown.

  function base64UrlEncode(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString() {
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  function sha256Base64Url(value) {
    var data = new TextEncoder().encode(value);
    return window.crypto.subtle.digest('SHA-256', data).then(function (digest) {
      return base64UrlEncode(new Uint8Array(digest));
    });
  }

  /** Fall back to guest mode: unlock the textarea, leave merchant credentials null. */
  function ssoFallbackToGuest(reason) {
    guestSession = true;
    ssoInFlight = false;
    if (reason) {
      console.warn('[acme-assist] silent SSO fallback to guest: ' + reason);
    }
    if (activeTextarea) activeTextarea.removeAttribute('readonly');
  }

  /**
   * Attempt silent SSO into the merchant IDP once per page load. No-ops if
   * already attempted/in-flight, or if any required config field is missing
   * (widget stays in guest mode).
   *
   * The resulting PKCE code+verifier are handed to the chat backend, not
   * exchanged here: the merchant IDP's token endpoint has no CORS headers
   * for browser-originated requests, and chatbot-agent's backend can do that
   * exchange itself server-to-server (see sendMessage/confirmAndPay).
   */
  function attemptSilentSso() {
    if (hasMerchantCredential() || ssoInFlight || ssoAttempted) return;
    if (!MERCHANT_ID || !MERCHANT_IDP_AUTHORIZE_URL || !MERCHANT_BRIDGE_CLIENT_ID || !SILENT_CALLBACK_URL) {
      ssoAttempted = true;
      ssoFallbackToGuest('silent SSO not configured for this merchant');
      return;
    }
    if (!window.crypto || !window.crypto.subtle || !window.open) {
      ssoAttempted = true;
      ssoFallbackToGuest('crypto.subtle or window.open unavailable');
      return;
    }

    ssoInFlight = true;
    var codeVerifier = randomString();
    var state = randomString();
    var callbackOrigin;
    try {
      callbackOrigin = new URL(SILENT_CALLBACK_URL, window.location.href).origin;
    } catch {
      ssoAttempted = true;
      ssoFallbackToGuest('invalid silentCallbackUrl');
      return;
    }

    sha256Base64Url(codeVerifier)
      .then(function (codeChallenge) {
        var authorizeUrl =
          MERCHANT_IDP_AUTHORIZE_URL +
          '?' +
          new URLSearchParams({
            client_id: MERCHANT_BRIDGE_CLIENT_ID,
            response_type: 'code',
            redirect_uri: SILENT_CALLBACK_URL,
            scope: 'openid profile email',
            prompt: 'none',
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            state: state,
          }).toString();

        var popup = window.open(
          authorizeUrl,
          'acme-assist-sso',
          'width=1,height=1,left=-1000,top=-1000',
        );
        if (!popup) {
          ssoAttempted = true;
          ssoFallbackToGuest('popup blocked');
          return;
        }

        var settled = false;
        var timeoutId = window.setTimeout(function () {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          try {
            popup.close();
          } catch {
            // Popup may already be closed/cross-origin — ignore.
          }
          ssoAttempted = true;
          ssoFallbackToGuest('silent SSO timed out');
        }, SSO_POPUP_TIMEOUT_MS);

        function onMessage(event) {
          if (event.origin !== callbackOrigin) return;
          var data = event.data || {};
          if (data.source !== 'acme-assist-silent-sso' || data.state !== state) return;
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          window.removeEventListener('message', onMessage);
          try {
            popup.close();
          } catch {
            // Ignore.
          }
          ssoAttempted = true;

          if (data.error || !data.code) {
            ssoFallbackToGuest(data.error || 'no authorization code returned');
            return;
          }

          // Hand the code+verifier to the chat backend, which exchanges it
          // for a merchant ID token itself (see sendMessage) — the browser
          // never calls the merchant IDP's token endpoint directly.
          merchantAuthCode = data.code;
          merchantCodeVerifier = codeVerifier;
          guestSession = false;
          ssoInFlight = false;
          if (activeTextarea) {
            activeTextarea.removeAttribute('readonly');
            activeTextarea.focus();
          }
        }

        window.addEventListener('message', onMessage);
      })
      .catch(function (err) {
        ssoAttempted = true;
        ssoFallbackToGuest(err && err.message ? err.message : 'PKCE setup failed');
      });
  }

  // ── Send handler ───────────────────────────────────────────────────────────

  /**
   * Append a user bubble, POST the conversation to `/api/chat`, then render the
   * assistant response. Activates the consent button when `proposedPurchase` is
   * present in the response.
   */
  function sendMessage(text) {
    text = String(text).trim();
    if (!text) return;

    // Optimistically render and record the user's message.
    appendBubble('user', text);
    messageHistory.push({ role: 'user', content: text });

    // Lock the textarea while waiting for the server response.
    if (activeTextarea) {
      activeTextarea.value = '';
      activeTextarea.setAttribute('readonly', '');
    }

    // Temporary loading indicator — removed when the response arrives.
    var loadingEl = appendBubble('assistant', '…');

    fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        Object.assign(
          {
            messages: messageHistory,
            trace: traceEnabled,
            traceRaw: traceRaw,
          },
          merchantCredentialFields(),
        ),
      ),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (data) {
            if (data && data.trace) {
              window.dispatchEvent(new CustomEvent('chatbot:trace', { detail: data.trace }));
            }
            if (res.status === 401 && data && data.error === 'login_required') {
              appendBubble('assistant', 'Please sign in before confirming a purchase.');
            }
            throw new Error('Chat API returned ' + String(res.status));
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        if (data && data.trace) {
          window.dispatchEvent(new CustomEvent('chatbot:trace', { detail: data.trace }));
        }
        cacheMerchantTokenFromResponse(data);

        var content =
          data && data.message && typeof data.message.content === 'string'
            ? data.message.content
            : '';
        if (!content) content = 'Sorry, I could not generate a response. Please try again.';

        appendBubble('assistant', content);
        messageHistory.push({ role: 'assistant', content: content });

        if (data && data.proposedPurchase) {
          setConsentButtonState(data.proposedPurchase);
        }

        reenableInput();
      })
      .catch(function () {
        if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        appendBubble('assistant', 'Sorry, something went wrong. Please try again.');
        reenableInput();
      });
  }

  // ── Confirm & pay handler ──────────────────────────────────────────────────

  /**
   * POST a checkout confirmation to `/api/chat` with `confirmedAt` and the
   * pending proposed purchase. Renders the checkout result (captured / declined)
   * as an assistant bubble.
   *
   * The button is disabled immediately on click to prevent double-submission.
   * No checkout call is made without an explicit button click (FR 14 / human-in-the-loop).
   */
  function confirmAndPay() {
    if (!pendingProposedPurchase || !hasMerchantCredential()) return;

    var purchase = pendingProposedPurchase;
    var confirmedAt = new Date().toISOString();

    // Immediately disable consent button and lock textarea to prevent re-submission.
    setConsentButtonState(null);
    if (activeTextarea) activeTextarea.setAttribute('readonly', '');

    fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        Object.assign(
          {
            messages: messageHistory,
            confirmedAt: confirmedAt,
            proposedPurchase: purchase,
          },
          merchantCredentialFields(),
        ),
      ),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Chat API returned ' + String(res.status));
        return res.json();
      })
      .then(function (data) {
        cacheMerchantTokenFromResponse(data);
        var content =
          data && data.message && typeof data.message.content === 'string'
            ? data.message.content
            : 'Your purchase has been processed.';
        appendBubble('assistant', content);
        messageHistory.push({ role: 'assistant', content: content });
        reenableInput();
      })
      .catch(function () {
        appendBubble('assistant', 'Payment could not be processed. Please try again.');
        reenableInput();
      });
  }

  // ── Build panel ────────────────────────────────────────────────────────────

  /**
   * Build (or rebuild) the overlay root element.
   *
   * `open = false` → compact launcher pill.
   * `open = true`  → full chat panel with send handler, consent button, and
   *                   conversation history replayed from `messageHistory`.
   *
   * Active DOM refs (`activeBubbleList`, `activeConsentBtn`, `activeTextarea`)
   * are updated here so that async callbacks always target the live panel.
   */
  function build(open) {
    var root = h('div', { id: MOUNT_ID, 'data-acme-assist': 'overlay', style: containerStyle });

    if (!open) {
      var launcher = h(
        'button',
        {
          type: 'button',
          style: launcherStyle,
          'aria-label': 'Open ' + CHATBOT_NAME,
          onclick: function () {
            root.replaceWith(build(true));
          },
        },
        [
          h('span', { text: '\u{1F4AC}', style: { fontSize: '16px' } }),
          h('span', { text: 'Chat with ' + CHATBOT_NAME }),
        ],
      );
      root.appendChild(launcher);
      return root;
    }

    // ── Message list ──────────────────────────────────────────────────────────
    // Always starts with the welcome bubble; history is replayed beneath it.
    var listEl = h('ol', { style: listStyle }, [
      bubble(
        'assistant',
        "Hi! I'm your " +
          CHATBOT_NAME +
          '. I can help you find products, check your loyalty balance, and complete purchases with your saved cards.',
      ),
    ]);
    activeBubbleList = listEl;

    // Replay stored conversation into the freshly built list.
    for (var i = 0; i < messageHistory.length; i += 1) {
      var m = messageHistory[i];
      listEl.appendChild(bubble(m.role, m.content));
    }
    // Scroll to the bottom after replaying history.
    // Uses setTimeout to defer until after the root element is inserted into the
    // document — detached elements have no computed layout, so scrollHeight is 0
    // until the element is live in the DOM.
    setTimeout(function () {
      listEl.scrollTop = listEl.scrollHeight;
    }, 0);

    // ── Textarea ──────────────────────────────────────────────────────────────
    // Starts read-only only on the very first open, while silent SSO is
    // in-flight; the readonly guard is lifted once `attemptSilentSso` resolves
    // (merchant token or guest fallback). On subsequent opens the SSO attempt
    // has already resolved, so the textarea is immediately usable.
    var textarea = h('textarea', {
      rows: '2',
      placeholder: 'Type a message...',
      readonly: !hasMerchantCredential() && !ssoAttempted,
      'aria-label': 'Message ' + CHATBOT_NAME,
      style: inputStyle,
    });
    activeTextarea = textarea;

    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!textarea.hasAttribute('readonly')) {
          sendMessage(textarea.value);
        }
      }
    });

    // ── Send button ───────────────────────────────────────────────────────────
    var sendBtn = h(
      'button',
      {
        type: 'button',
        style: sendBtnStyle,
        'aria-label': 'Send message',
        onclick: function () {
          if (!textarea.hasAttribute('readonly')) {
            sendMessage(textarea.value);
          }
        },
      },
      ['Send'],
    );

    // ── Consent button ────────────────────────────────────────────────────────
    // Disabled until the chatbot proposes a specific purchase (`proposedPurchase`
    // in the /api/chat response). Per FR 14: no payment without an explicit click.
    var consentBtnEl = h(
      'button',
      {
        type: 'button',
        disabled: !pendingProposedPurchase,
        'aria-disabled': pendingProposedPurchase ? 'false' : 'true',
        'data-consent-slot': 'confirm-and-pay',
        style: pendingProposedPurchase ? consentBtnActiveStyle : consentBtnDisabledStyle,
        text: pendingProposedPurchase
          ? 'Confirm & pay: ' +
            pendingProposedPurchase.productName +
            ' — $' +
            pendingProposedPurchase.unitPrice.toFixed(2)
          : 'Confirm & pay',
        onclick: confirmAndPay,
      },
      null,
    );
    activeConsentBtn = consentBtnEl;

    // ── Composer ──────────────────────────────────────────────────────────────
    var composerEl = h('div', { style: composerStyle }, [
      h(
        'div',
        { style: { display: 'flex', gap: '8px', alignItems: 'flex-end' } },
        [textarea, sendBtn],
      ),
      consentBtnEl,
    ]);

    // ── Full panel ────────────────────────────────────────────────────────────
    var panel = h(
      'section',
      { 'aria-label': CHATBOT_NAME + ' chat panel', style: panelStyle },
      [
        h('header', { style: headerStyle }, [
          h('div', { style: titleWrapStyle }, [
            h('span', { style: titleStyle, text: CHATBOT_NAME }),
            h('span', { style: subtitleStyle, text: 'Your shopping assistant' }),
          ]),
          h(
            'button',
            {
              type: 'button',
              style: closeBtnStyle,
              'aria-label': 'Close ' + CHATBOT_NAME,
              onclick: function () {
                root.replaceWith(build(false));
              },
            },
            [h('span', { text: '×' })],
          ),
        ]),
        listEl,
        composerEl,
      ],
    );

    root.appendChild(panel);

    // Attempt silent SSO on first open only. Called synchronously (not via
    // setTimeout) so the popup opens within the same call stack as the click
    // that opened the panel — most browsers only allow window.open without
    // being treated as a popup-blocked call when it happens during a user
    // gesture's own call stack.
    if (!hasMerchantCredential() && !ssoAttempted) {
      attemptSilentSso();
    }

    return root;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  syncTraceSettings();

  function mount() {
    if (document.getElementById(MOUNT_ID)) return;
    document.body.appendChild(build(false));
  }

  // Dispatching 'chatbot:open' from the host page opens the chat panel.
  window.addEventListener('chatbot:open', function () {
    var existing = document.getElementById(MOUNT_ID);
    if (existing) {
      // Already mounted as launcher pill — switch to open panel.
      if (!existing.querySelector('section')) {
        existing.replaceWith(build(true));
      }
    } else {
      document.body.appendChild(build(true));
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
