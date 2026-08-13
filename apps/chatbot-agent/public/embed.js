/*
 * Acme Assist — interactive chat overlay.
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
 * Interactive behaviour (Task 11):
 *   - On open: fetches a short-lived alpha realm token from the merchant-web
 *     token proxy (`GET /api/chatbot/token`). 401 → shows "Please sign in".
 *   - Send button + Enter key: posts `{ messages, accessToken }` to the
 *     chatbot-agent `/api/chat` endpoint and renders the assistant response.
 *   - "Confirm & pay" button becomes active when the chatbot proposes a purchase
 *     (`proposedPurchase` in the response). Clicking it sends a confirmation
 *     request with `confirmedAt` and displays the checkout result.
 *
 * No ESM imports. Named-export ESLint rule does not apply (public static asset).
 */
(function () {
  'use strict';

  var MOUNT_ID = 'acme-assist-overlay-root';
  var TOKEN_URL = 'http://localhost:3000/api/chatbot/token';
  var CHAT_URL = 'http://localhost:3004/api/chat';

  // ── Module-level state ─────────────────────────────────────────────────────
  // Preserved across open/close cycles so conversation is not lost on minimise.

  /** Alpha realm access token; null until the token proxy call succeeds. */
  var accessToken = null;

  /** True while a token fetch is in-flight — prevents duplicate requests. */
  var tokenFetching = false;

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

  /** Remove the readonly guard from the textarea once an async operation completes. */
  function reenableInput() {
    if (activeTextarea && accessToken) {
      activeTextarea.removeAttribute('readonly');
    }
  }

  // ── Token fetch ────────────────────────────────────────────────────────────

  /**
   * Fetch a short-lived alpha realm access token from the merchant-web token
   * proxy (`GET /api/chatbot/token`).
   *
   * On HTTP 401: appends a "please sign in" assistant bubble; textarea stays
   * read-only so the shopper cannot send messages.
   * On success: stores the token in `accessToken` and removes the readonly guard
   * from the textarea, enabling the shopper to start typing.
   */
  function fetchAccessToken() {
    if (tokenFetching) return;
    tokenFetching = true;

    fetch(TOKEN_URL)
      .then(function (res) {
        if (res.status === 401) {
          appendBubble(
            'assistant',
            'Please sign in to use Acme Assist. Visit your account page to log in, then refresh this page.',
          );
          return null;
        }
        if (!res.ok) {
          appendBubble(
            'assistant',
            'Unable to start a session. Please refresh the page and try again.',
          );
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        accessToken = data.accessToken;
        if (activeTextarea) {
          activeTextarea.removeAttribute('readonly');
          activeTextarea.focus();
        }
      })
      .catch(function () {
        appendBubble(
          'assistant',
          'Unable to connect to Acme Assist. Please refresh the page and try again.',
        );
      })
      .then(function () {
        // Runs after both success and error branches — simulates Promise.finally.
        tokenFetching = false;
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
    if (!text || !accessToken) return;

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
      body: JSON.stringify({ messages: messageHistory, accessToken: accessToken }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Chat API returned ' + String(res.status));
        return res.json();
      })
      .then(function (data) {
        if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);

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
    if (!pendingProposedPurchase || !accessToken) return;

    var purchase = pendingProposedPurchase;
    var confirmedAt = new Date().toISOString();

    // Immediately disable consent button and lock textarea to prevent re-submission.
    setConsentButtonState(null);
    if (activeTextarea) activeTextarea.setAttribute('readonly', '');

    fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messageHistory,
        accessToken: accessToken,
        confirmedAt: confirmedAt,
        proposedPurchase: purchase,
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
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
          'aria-label': 'Open Acme Assist',
          onclick: function () {
            root.replaceWith(build(true));
          },
        },
        [
          h('span', { text: '\u{1F4AC}', style: { fontSize: '16px' } }),
          h('span', { text: 'Chat with Acme Assist' }),
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
        "Hi! I'm Acme Assist. I can help you find products, check your loyalty balance, and complete purchases with your saved cards.",
      ),
    ]);
    activeBubbleList = listEl;

    // Replay stored conversation into the freshly built list.
    for (var i = 0; i < messageHistory.length; i += 1) {
      var m = messageHistory[i];
      listEl.appendChild(bubble(m.role, m.content));
    }
    // Scroll to the bottom after replaying history.
    listEl.scrollTop = listEl.scrollHeight;

    // ── Textarea ──────────────────────────────────────────────────────────────
    // Starts read-only; the readonly guard is lifted after `fetchAccessToken`
    // confirms the user is signed in and returns a valid token.
    var textarea = h('textarea', {
      rows: '2',
      placeholder: 'Type a message...',
      readonly: !accessToken,
      'aria-label': 'Message Acme Assist',
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
      { 'aria-label': 'Acme Assist chat panel', style: panelStyle },
      [
        h('header', { style: headerStyle }, [
          h('div', { style: titleWrapStyle }, [
            h('span', { style: titleStyle, text: 'Acme Assist' }),
            h('span', { style: subtitleStyle, text: 'Merchant-embedded assistant' }),
          ]),
          h(
            'button',
            {
              type: 'button',
              style: closeBtnStyle,
              'aria-label': 'Close Acme Assist',
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

    // Fetch the access token when the panel opens (if not already available).
    // A 401 response means the user is not signed in — textarea stays locked.
    if (!accessToken) {
      setTimeout(fetchAccessToken, 0);
    }

    return root;
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  function mount() {
    if (document.getElementById(MOUNT_ID)) return;
    document.body.appendChild(build(true));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
