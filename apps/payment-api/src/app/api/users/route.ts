// Users route — returns the full user registry from data/users.json.
//
// GET /api/users — reads `data/users.json` and returns the full array of
//   MerchantIdentity records. No filter params — admin-only endpoint.
//
// This route is protected by the JWT middleware in `src/middleware.ts`. A valid
// alpha-realm Bearer token must be present on the request.

import { NextResponse } from 'next/server'
import { readJson } from '@acme/shared'
import type { MerchantIdentity } from '@acme/shared'

import { dataFilePath } from '../../../lib/data-paths'

export async function GET(): Promise<NextResponse> {
  let users: MerchantIdentity[]
  try {
    users = await readJson<MerchantIdentity[]>(dataFilePath('users'))
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'User registry unavailable.' },
      { status: 503 },
    )
  }

  return NextResponse.json(users)
}
