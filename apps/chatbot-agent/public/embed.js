/*
 * Acme Assist — embeddable chat overlay bootstrap.
 *
 * Served as a static asset from `/embed.js`. Merchant sites include it via:
 *
 *   <script src="http://localhost:3004/embed.js" async></script>
 *
 * On load it injects a fixed bottom-right chat-shell <div> into
 * `document.body` with inline styles (no external CSS dependency). The
 * markup deliberately mirrors the React ChatShell in `@acme/ui` but does
 * NOT import from `@acme/ui` — a <script>-tag embed cannot ES-import from
 * a workspace package at runtime. A follow-on PR can swap in a real
 * bundler if the JS footprint matters.
 *
 * Reserves a structural consent-slot placeholder ("Confirm & pay" button)
 * per FR 12 — human-in-the-loop is mandatory. Disabled/no-op in the
 * scaffold; wiring lands with the checkout flow in a follow-on.
 *
 * No auth, no LLM client, no external network calls. Named-export ESLint rule
 * does not apply to this file (public/*.js is served as a static asset;
 * it is not a source module).
 */
(function () {
  'use strict';

  var MOUNT_ID = 'acme-assist-overlay-root';

  // If two script tags accidentally include this bundle, do not mount twice.
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.getElementById(MOUNT_ID)) return;

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

  // Base container: fixed to the bottom-right corner of the viewport. Inline
  // styles keep the bundle self-contained so it renders identically on any
  // merchant host page regardless of its CSS.
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

  var composerStyle = {
    borderTop: '1px solid #e2e8f0',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  };

  var inputStyle = {
    width: '100%',
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

  // Consent-slot placeholder per FR 12 — disabled/no-op in the scaffold.
  var consentBtnStyle = {
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

  // Closed-state pill (launcher).
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
        h('ol', { style: listStyle }, [
          bubble(
            'assistant',
            "Hi! I'm Acme Assist. I can help you find products, check your loyalty balance, and complete purchases with your saved cards.",
          ),
          bubble('user', 'Show me headphones under $200.'),
          bubble(
            'assistant',
            "Great - here are a few options in your price range. When you're ready to check out, I'll need you to confirm the payment below.",
          ),
        ]),
        h('div', { style: composerStyle }, [
          h('textarea', {
            rows: '2',
            placeholder: 'Type a message...',
            readonly: true,
            'aria-label': 'Message Acme Assist',
            style: inputStyle,
          }),
          h(
            'button',
            {
              type: 'button',
              disabled: true,
              'aria-disabled': 'true',
              'data-consent-slot': 'confirm-and-pay',
              style: consentBtnStyle,
              text: 'Confirm & pay',
            },
            null,
          ),
        ]),
      ],
    );

    root.appendChild(panel);
    return root;
  }

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
