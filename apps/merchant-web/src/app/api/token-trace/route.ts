import { NextResponse } from 'next/server';
import type { TokenTrace } from '@acme/shared';
import { appendMerchantTokenTrace, clearMerchantTokenTrace, getMerchantTokenTrace } from '../../../lib/token-trace-store';

export const dynamic = 'force-dynamic';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  return response;
}

function sessionId(request: Request): string | null {
  return new URL(request.url).searchParams.get('traceSessionId');
}

export async function GET(request: Request): Promise<NextResponse> {
  const id = sessionId(request);
  if (!id) return noStore(NextResponse.json({ error: 'traceSessionId is required.' }, { status: 400 }));
  try {
    return noStore(NextResponse.json(getMerchantTokenTrace(id)));
  } catch {
    return noStore(NextResponse.json({ error: 'Invalid traceSessionId.' }, { status: 400 }));
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const id = sessionId(request);
  if (!id) return noStore(NextResponse.json({ error: 'traceSessionId is required.' }, { status: 400 }));
  try {
    const body = (await request.json()) as TokenTrace;
    if (body.traceSessionId !== id) return noStore(NextResponse.json({ error: 'Trace session mismatch.' }, { status: 400 }));
    return noStore(NextResponse.json(appendMerchantTokenTrace(body)));
  } catch {
    return noStore(NextResponse.json({ error: 'Invalid trace payload.' }, { status: 400 }));
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const id = sessionId(request);
  if (!id) return noStore(NextResponse.json({ error: 'traceSessionId is required.' }, { status: 400 }));
  try {
    clearMerchantTokenTrace(id);
    return noStore(NextResponse.json(null));
  } catch {
    return noStore(NextResponse.json({ error: 'Invalid traceSessionId.' }, { status: 400 }));
  }
}
