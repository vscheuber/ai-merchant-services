'use client';

import * as React from 'react';
import { MessageCircle, X } from 'lucide-react';

import { cn } from '../lib/cn';
import { Button } from './button';

export interface ChatShellMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface ChatShellProps {
  /** Header title. Defaults to "Acme Assist". */
  title?: string;
  /** Subtitle line under the title. */
  subtitle?: string;
  /** Optional message stream to render. A mocked pair renders by default. */
  messages?: readonly ChatShellMessage[];
  /**
   * If true, the shell is rendered inline (no fixed positioning). Used by the
   * standalone dev preview at chatbot-agent's `/preview` route. When false
   * (default), the shell fixes itself to the bottom-right of the viewport.
   */
  inline?: boolean;
  /** Extra class names applied to the outer container. */
  className?: string;
}

const DEFAULT_MESSAGES: readonly ChatShellMessage[] = [
  {
    role: 'assistant',
    content:
      "Hi! I'm Acme Assist. I can help you find products, check your loyalty balance, and complete purchases with your saved cards.",
  },
  {
    role: 'user',
    content: 'Show me headphones under $200.',
  },
  {
    role: 'assistant',
    content:
      "Great - here are a few options in your price range. When you're ready to check out, I'll need you to confirm the payment below.",
  },
];

/**
 * Shared chat-UI shell used by:
 *   - the chatbot-agent standalone `/preview` route (inline mode)
 *   - the mocked overlay markup duplicated in `apps/chatbot-agent/public/embed.js`
 *     (they render the same visual layout independently; the embed cannot
 *      import React modules at runtime)
 *
 * Reserves a structural consent-slot placeholder: a disabled "Confirm & pay"
 * button under the input, per FR 12 (human-in-the-loop is mandatory; the
 * button is a placeholder in this scaffold PR - wiring lands in a follow-on).
 *
 * The composer input is a plain textarea placeholder with no send handler.
 */
export function ChatShell({
  title = 'Acme Assist',
  subtitle = 'Merchant-embedded assistant',
  messages = DEFAULT_MESSAGES,
  inline = false,
  className,
}: ChatShellProps): React.JSX.Element {
  const [open, setOpen] = React.useState(true);

  const containerClasses = inline
    ? 'relative w-full max-w-md'
    : 'fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)]';

  if (!open && !inline) {
    return (
      <div className={cn(containerClasses, className)}>
        <Button
          onClick={() => setOpen(true)}
          size="lg"
          className="shadow-lg"
          aria-label="Open Acme Assist"
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Chat with {title}
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-label={`${title} chat panel`}
      className={cn(
        containerClasses,
        'flex h-[32rem] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl',
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        </div>
        {inline ? null : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label={`Close ${title}`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </header>

      <ol className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <li
            key={index}
            className={cn(
              'flex',
              message.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}
            >
              {message.content}
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2 border-t border-border p-3">
        <label htmlFor="chat-shell-input" className="sr-only">
          Message {title}
        </label>
        <textarea
          id="chat-shell-input"
          rows={2}
          placeholder="Type a message..."
          className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          readOnly
        />
        {/*
          Consent-slot placeholder per FR 12. Disabled in this scaffold PR;
          wiring lands with the checkout flow in a follow-on task.
        */}
        <Button
          type="button"
          variant="default"
          className="w-full"
          disabled
          aria-disabled="true"
          data-consent-slot="confirm-and-pay"
        >
          Confirm & pay
        </Button>
      </div>
    </section>
  );
}
