// Merchants route — returns the full merchant registry from data/merchants.json.
//
// GET /api/merchants — reads `data/merchants.json` and returns the full array
//   of Merchant records.
//
// This route is protected by the JWT middleware in `src/middleware.ts`. A valid
// alpha-realm Bearer token must be present on the request.

import { NextResponse } from 'next/server'
import { readJson } from '@acme/shared'
import type { Merchant } from '@acme/shared'

import { dataFilePath } from '../../../lib/data-paths'

export async function GET(): Promise<NextResponse> {
  let merchants: Merchant[]
  try {
    merchants = await readJson<Merchant[]>(dataFilePath('merchants'))
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'Merchant registry unavailable.' },
      { status: 503 },
    )
  }

  return NextResponse.json(merchants)
}
