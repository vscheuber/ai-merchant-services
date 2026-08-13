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
 * Interactive behaviour:
 *   - On open: obtains an access token via OIDC PKCE popup (default) or silent
 *     iframe (`data-auth-mode="silent"`). On 401 from /api/chat, transparently
 *     re-authenticates via silent iframe then falls back to PKCE popup.
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

  // ── Auth configuration ─────────────────────────────────────────────────────
  var SCRIPT_ELEMENT = document.currentScript;
  var AUTH_MODE = (SCRIPT_ELEMENT && SCRIPT_ELEMENT.getAttribute('data-auth-mode')) || 'pkce';
  // Derive chatbot-agent origin from CHAT_URL via a DOM <a> element (ES5-compatible URL parsing)
  var _a = document.createElement('a');
  _a.href = CHAT_URL;
  var CHATBOT_AGENT_ORIGIN = _a.protocol + '//' + _a.host;
  var AUTH_START_URL = CHATBOT_AGENT_ORIGIN + '/api/auth/start';

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
   * Obtain an access token using a standards-based OIDC PKCE or silent flow.
   *
   * PKCE mode (default / forcePkce === true):
   *   1. Calls AUTH_START_URL → gets { authorizationUrl }.
   *   2. Opens a popup window at that URL.
   *   3. If popup is blocked: appends a sign-in bubble with a direct link.
   *   4. Listens for a postMessage from CHATBOT_AGENT_ORIGIN:
   *      - chatbot-token  → stores token, calls reenableInput().
   *      - chatbot-error  → retries with a fresh PKCE popup.
   *
   * Silent mode (AUTH_MODE === 'silent'):
   *   1. Calls AUTH_START_URL → gets { authorizationUrl }.
   *   2. Injects a hidden iframe with prompt=none appended to the URL.
   *   3. Listens for the same postMessage events.
   *   4. On login_required / interaction_required: removes iframe and falls
   *      back to PKCE popup.
   *
   * @param {boolean} [forcePkce] - Override AUTH_MODE and always use PKCE.
   */
  function fetchAccessToken(forcePkce) {
    if (tokenFetching) return;
    tokenFetching = true;

    var effectiveMode = (forcePkce || AUTH_MODE !== 'silent') ? 'pkce' : 'silent';

    fetch(AUTH_START_URL)
      .then(function (authRes) {
        return authRes.json();
      })
      .then(function (data) {
        var authorizationUrl = data && data.authorizationUrl;
        if (!authorizationUrl) {
          tokenFetching = false;
          appendBubble(
            'assistant',
            'Unable to start a session. Please refresh the page and try again.',
          );
          return;
        }

        if (effectiveMode === 'silent') {
          // ── Silent mode: inject hidden iframe with prompt=none ─────────────
          var siFrame = document.createElement('iframe');
          siFrame.setAttribute(
            'style',
            'display:none;position:absolute;width:0;height:0;border:0',
          );
          siFrame.src = authorizationUrl + '&prompt=none';

          function silentHandler(event) {
            if (event.origin !== CHATBOT_AGENT_ORIGIN) return;
            var msg = event.data;
            if (msg && msg.type === 'chatbot-token') {
              window.removeEventListener('message', silentHandler);
              if (siFrame.parentNode) siFrame.parentNode.removeChild(siFrame);
              accessToken = msg.accessToken;
              tokenFetching = false;
              reenableInput();
            } else if (
              msg &&
              msg.type === 'chatbot-error' &&
              (msg.error === 'login_required' || msg.error === 'interaction_required')
            ) {
              window.removeEventListener('message', silentHandler);
              if (siFrame.parentNode) siFrame.parentNode.removeChild(siFrame);
              tokenFetching = false;
              fetchAccessToken(true); // fall back to PKCE popup
            }
          }

          window.addEventListener('message', silentHandler);
          document.body.appendChild(siFrame);
        } else {
          // ── PKCE mode: open popup window ───────────────────────────────────
          var popup = window.open(authorizationUrl, 'chatbot_auth', 'width=500,height=600');

          if (!popup) {
            // Popup was blocked — show a sign-in bubble with a direct link.
            tokenFetching = false;
            if (activeBubbleList) {
              var pbLink = h(
                'a',
                { href: authorizationUrl, target: '_blank', text: 'click here to continue' },
                null,
              );
              var pbDiv = h(
                'div',
                {
                  style: {
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    lineHeight: '1.35',
                    background: '#f1f5f9',
                    color: '#0f172a',
                  },
                },
                ['Sign in to use Acme Assist — ', pbLink],
              );
              var pbLi = h(
                'li',
                { style: { display: 'flex', justifyContent: 'flex-start' } },
                [pbDiv],
              );
              activeBubbleList.appendChild(pbLi);
              activeBubbleList.scrollTop = activeBubbleList.scrollHeight;
            }
            return;
          }

          // Monitor popup: if it closes before sending a token, clear the
          // tokenFetching flag so a subsequent open attempt is not blocked.
          var popupCheckInterval = setInterval(function () {
            if (popup.closed) {
              clearInterval(popupCheckInterval);
              window.removeEventListener('message', pkceHandler);
              tokenFetching = false;
            }
          }, 500);

          function pkceHandler(event) {
            if (event.origin !== CHATBOT_AGENT_ORIGIN) return;
            var msg = event.data;
            if (msg && msg.type === 'chatbot-token') {
              window.removeEventListener('message', pkceHandler);
              clearInterval(popupCheckInterval);
              accessToken = msg.accessToken;
              tokenFetching = false;
              reenableInput();
            } else if (
              msg &&
              msg.type === 'chatbot-error' &&
              (msg.error === 'login_required' || msg.error === 'interaction_required')
            ) {
              window.removeEventListener('message', pkceHandler);
              clearInterval(popupCheckInterval);
              tokenFetching = false;
              fetchAccessToken(); // retry with a fresh PKCE popup
            }
          }

          window.addEventListener('message', pkceHandler);
        }
      })
      .catch(function () {
        tokenFetching = false;
        appendBubble(
          'assistant',
          'Unable to connect to Acme Assist. Please refresh the page and try again.',
        );
      });
  }

  // ── Send handler ───────────────────────────────────────────────────────────

  /**
   * Append a user bubble, POST the conversation to `/api/chat`, then render the
   * assistant response. Activates the consent button when `proposedPurchase` is
   * present in the response.
   *
   * 401 recovery: on a 401 from /api/chat the optimistic user bubble and
   * messageHistory entry are rolled back, a silent re-auth iframe is injected,
   * and the original message is retried once the new token arrives. If silent
   * auth fails the flow falls back to a PKCE popup; if that is also blocked a
   * sign-in bubble is shown.
   */
  function sendMessage(text) {
    text = String(text).trim();
    if (!text || !accessToken) return;

    // Optimistically render and record the user's message.
    // Capture the element so it can be removed if a 401 forces a re-auth rollback.
    var userBubbleEl = appendBubble('user', text);
    messageHistory.push({ role: 'user', content: text });

    // Lock the textarea while waiting for the server response.
    if (activeTextarea) {
      activeTextarea.value = '';
      activeTextarea.setAttribute('readonly', '');
    }

    // Temporary loading indicator — removed when the response arrives.
    var loadingEl = appendBubble('assistant', '…');

    // Sentinel thrown on 401 to bypass the normal error handler in .catch().
    var REAUTH_IN_PROGRESS = {};

    fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messageHistory, accessToken: accessToken }),
    })
      .then(function (res) {
        if (res.status === 401) {
          accessToken = null;

          // Roll back the optimistic render so sendMessage can replay it cleanly.
          if (loadingEl && loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
          if (userBubbleEl && userBubbleEl.parentNode) userBubbleEl.parentNode.removeChild(userBubbleEl);
          messageHistory.pop();

          // ── Silent re-auth attempt ─────────────────────────────────────────
          // Always try silent first, regardless of AUTH_MODE.
          fetch(AUTH_START_URL)
            .then(function (authRes) {
              return authRes.json();
            })
            .then(function (authData) {
              var authorizationUrl = authData && authData.authorizationUrl;
              if (!authorizationUrl) {
                appendBubble(
                  'assistant',
                  'Your session has expired. Please refresh the page to sign in again.',
                );
                reenableInput();
                return;
              }

              var recoveryFrame = document.createElement('iframe');
              recoveryFrame.setAttribute(
                'style',
                'display:none;position:absolute;width:0;height:0;border:0',
              );
              recoveryFrame.src = authorizationUrl + '&prompt=none';

              function silentRecoveryHandler(event) {
                if (event.origin !== CHATBOT_AGENT_ORIGIN) return;
                var rmsg = event.data;
                if (rmsg && rmsg.type === 'chatbot-token') {
                  window.removeEventListener('message', silentRecoveryHandler);
                  if (recoveryFrame.parentNode) recoveryFrame.parentNode.removeChild(recoveryFrame);
                  accessToken = rmsg.accessToken;
                  sendMessage(text); // retry the original message
                } else if (
                  rmsg &&
                  rmsg.type === 'chatbot-error' &&
                  (rmsg.error === 'login_required' || rmsg.error === 'interaction_required')
                ) {
                  window.removeEventListener('message', silentRecoveryHandler);
                  if (recoveryFrame.parentNode) recoveryFrame.parentNode.removeChild(recoveryFrame);

                  // ── PKCE popup fallback ────────────────────────────────────
                  var pkcePopup = window.open(
                    authorizationUrl,
                    'chatbot_auth',
                    'width=500,height=600',
                  );

                  if (!pkcePopup) {
                    // Popup blocked — show an expired-session bubble with a link.
                    if (activeBubbleList) {
                      var expLink = h(
                        'a',
                        { href: authorizationUrl, target: '_blank', text: 'click here to sign in' },
                        null,
                      );
                      var expDiv = h(
                        'div',
                        {
                          style: {
                            maxWidth: '85%',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            fontSize: '14px',
                            lineHeight: '1.35',
                            background: '#f1f5f9',
                            color: '#0f172a',
                          },
                        },
                        ['Your session has expired — ', expLink],
                      );
                      var expLi = h(
                        'li',
                        { style: { display: 'flex', justifyContent: 'flex-start' } },
                        [expDiv],
                      );
                      activeBubbleList.appendChild(expLi);
                      activeBubbleList.scrollTop = activeBubbleList.scrollHeight;
                    }
                    reenableInput();
                    return;
                  }

                  var pkcePopupCheck = setInterval(function () {
                    if (pkcePopup.closed) {
                      clearInterval(pkcePopupCheck);
                    }
                  }, 500);

                  function pkceRecoveryHandler(event) {
                    if (event.origin !== CHATBOT_AGENT_ORIGIN) return;
                    var pmsg = event.data;
                    if (pmsg && pmsg.type === 'chatbot-token') {
                      window.removeEventListener('message', pkceRecoveryHandler);
                      clearInterval(pkcePopupCheck);
                      accessToken = pmsg.accessToken;
                      sendMessage(text); // retry the original message
                    } else if (
                      pmsg &&
                      pmsg.type === 'chatbot-error' &&
                      (pmsg.error === 'login_required' || pmsg.error === 'interaction_required')
                    ) {
                      window.removeEventListener('message', pkceRecoveryHandler);
                      clearInterval(pkcePopupCheck);
                      // Show expired session bubble with link.
                      if (activeBubbleList) {
                        var expLink2 = h(
                          'a',
                          {
                            href: authorizationUrl,
                            target: '_blank',
                            text: 'click here to sign in',
                          },
                          null,
                        );
                        var expDiv2 = h(
                          'div',
                          {
                            style: {
                              maxWidth: '85%',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              fontSize: '14px',
                              lineHeight: '1.35',
                              background: '#f1f5f9',
                              color: '#0f172a',
                            },
                          },
                          ['Your session has expired — ', expLink2],
                        );
                        var expLi2 = h(
                          'li',
                          { style: { display: 'flex', justifyContent: 'flex-start' } },
                          [expDiv2],
                        );
                        activeBubbleList.appendChild(expLi2);
                        activeBubbleList.scrollTop = activeBubbleList.scrollHeight;
                      }
                      reenableInput();
                    }
                  }

                  window.addEventListener('message', pkceRecoveryHandler);
                }
              }

              window.addEventListener('message', silentRecoveryHandler);
              document.body.appendChild(recoveryFrame);
            })
            .catch(function () {
              appendBubble(
                'assistant',
                'Your session has expired. Please refresh the page to sign in again.',
              );
              reenableInput();
            });

          // Signal the outer promise chain to skip normal error handling.
          throw REAUTH_IN_PROGRESS;
        }

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
      .catch(function (err) {
        // Silently discard the sentinel — re-auth recovery is already running.
        if (err === REAUTH_IN_PROGRESS) return;
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
        if (res.status === 401) {
          // Token expired between proposal and confirmation click.
          // Restore the pending purchase so the button works again after re-auth.
          accessToken = null;
          setConsentButtonState(purchase);
          fetchAccessToken();
          return null;
        }
        if (!res.ok) throw new Error('Chat API returned ' + String(res.status));
        return res.json();
      })
      .then(function (data) {
        if (data === null) return; // 401 branch — already handled above
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
          h('span', { text: '💬', style: { fontSize: '16px' } }),
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
    // Uses setTimeout to defer until after the root element is inserted into the
    // document — detached elements have no computed layout, so scrollHeight is 0
    // until the element is live in the DOM.
    setTimeout(function () {
      listEl.scrollTop = listEl.scrollHeight;
    }, 0);

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
