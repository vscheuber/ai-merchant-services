import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ merchantId: string; asset: string }>;
}

const MIME_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { merchantId, asset } = await params;
  if (!/^[a-z][a-z0-9-]*$/.test(merchantId) || !/^[a-zA-Z0-9_.-]+$/.test(asset)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const root = resolve(process.env['MERCHANT_CONFIG_DIR'] ?? resolve(process.cwd(), '..', '..', 'config', 'merchants'));
  const path = join(root, merchantId, 'assets', asset);
  if (!path.startsWith(join(root, merchantId, 'assets') + '/')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const bytes = await readFile(path);
    const extension = asset.split('.').pop()?.toLowerCase() ?? '';
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
}
