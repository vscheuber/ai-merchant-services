// Stub chat API. Accepts a JSON body of shape `{ messages: [{ role, content }] }`
// and echoes the last user message back with a static assistant preamble.
// No LLM client is instantiated (AC 15) and no external network is touched
// (AC 14/AC 15). Named exports only per Next.js route-handler convention.
//
// Request shape (informative — not schema-validated in the scaffold):
//   { "messages": [{ "role": "user", "content": "hi" }] }
// Response shape:
//   { "message": { "role": "assistant", "content": "..." } }

import { NextResponse } from 'next/server';

interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

interface ChatRequestBody {
  readonly messages?: readonly ChatMessage[];
}

const ASSISTANT_PREAMBLE =
  "I'm Acme Assist (scaffold echo). You said: ";

function extractLastUserMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const messages = (body as ChatRequestBody).messages;
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user' && typeof m.content === 'string') {
      return m.content;
    }
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Invalid JSON — respond with a canned assistant message rather than a
    // 4xx, because the scaffold echo is documented as always returning 200.
  }

  const lastUser = extractLastUserMessage(body);
  const content =
    lastUser === null
      ? "I'm Acme Assist (scaffold echo). Send a JSON body with a `messages` array to see it echoed back."
      : `${ASSISTANT_PREAMBLE}${lastUser}`;

  return NextResponse.json({
    message: { role: 'assistant', content },
  });
}
