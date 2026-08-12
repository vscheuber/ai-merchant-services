// Products route — returns the product catalog filtered by merchantId.
//
// `GET /api/products?merchantId=<id>` reads `data/products.json` and returns
// only the products belonging to the specified merchant. The `merchantId` query
// param is required; omitting it returns HTTP 400.
//
// This route is protected by the JWT middleware in `src/middleware.ts`. A valid
// alpha-realm Bearer token must be present on the request.

import { NextRequest, NextResponse } from 'next/server';
import { readJson } from '@acme/shared';
import type { Product } from '@acme/shared';

import { dataFilePath } from '../../../lib/data-paths';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const merchantId = searchParams.get('merchantId');

  if (!merchantId) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Missing required query param: merchantId.' },
      { status: 400 },
    );
  }

  const products = await readJson<Product[]>(dataFilePath('products'));
  const filtered = products.filter((p) => p.merchantId === merchantId);

  return NextResponse.json(filtered);
}
