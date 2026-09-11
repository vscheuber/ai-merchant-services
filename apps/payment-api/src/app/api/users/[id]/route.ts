// Single-user lookup route.
//
// GET /api/users/:id — returns one user record.
//
//   1. Checks the local seed registry (data/users.json) first — the three
//      demo users' ids there are their real bravo-realm (merchant IDP) UUIDs,
//      so this covers session.userId lookups from merchant-web and any
//      transaction/loyalty/wallet row recorded against a seeded demo user.
//   2. Falls back to a live AIC IDM read of `managed/alpha_user/:id` for ids
//      that only exist as JIT-provisioned payment-provider identities (e.g.
//      a real chatbot purchase's `sub` claim) — those already carry the
//      shopper's real givenName/sn/mail, copied over from the merchant token
//      at JIT-provisioning time. The response also includes
//      `merchantCustomerId` (the alpha_user's `custom_merchantCustomerId`)
//      when present, so an admin can trace a JIT identity back to the
//      merchant-side customer it was provisioned for.
//   3. 404 if neither lookup finds the id.
//
// This route is protected by the JWT middleware in `src/middleware.ts`.

import { NextResponse } from 'next/server';
import { readJson } from '@acme/shared';
import type { MerchantIdentity } from '@acme/shared';

import { dataFilePath } from '../../../../lib/data-paths';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** A resolved user record, with an optional trace back to the merchant-side customer for JIT-provisioned (alpha-only) identities. */
type ResolvedUser = MerchantIdentity & { merchantCustomerId?: string };

async function getServiceAccountToken(): Promise<string> {
  const clientId = process.env['PAYMENT_OIDC_CLIENT_ID'];
  const clientSecret = process.env['PAYMENT_OIDC_CLIENT_SECRET'];
  const tokenEndpoint = process.env['AIC_ALPHA_TOKEN_ENDPOINT'];
  if (!clientId || !clientSecret || !tokenEndpoint) {
    throw new Error(
      'Missing required env vars: PAYMENT_OIDC_CLIENT_ID, PAYMENT_OIDC_CLIENT_SECRET, AIC_ALPHA_TOKEN_ENDPOINT',
    );
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'fr:idm:*',
    }).toString(),
  });
  if (!response.ok) {
    throw new Error(`Service-account token request failed: HTTP ${response.status.toString()}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

interface AlphaUserRecord {
  _id?: unknown;
  userName?: unknown;
  givenName?: unknown;
  sn?: unknown;
  mail?: unknown;
  custom_merchantId?: unknown;
  custom_merchantCustomerId?: unknown;
}

/**
 * Best-effort live read of one alpha_user by `_id`. Returns null on any
 * failure (missing config, network error, 404, malformed response) — this
 * is a fallback path for ids the local seed registry doesn't know about,
 * never a hard dependency.
 */
async function readAlphaUser(id: string): Promise<ResolvedUser | null> {
  const idmBaseUrl = process.env['AIC_IDM_BASE_URL'];
  if (!idmBaseUrl) return null;

  try {
    const serviceToken = await getServiceAccountToken();
    const fields = ['_id', 'userName', 'givenName', 'sn', 'mail', 'custom_merchantId', 'custom_merchantCustomerId'];
    const response = await fetch(
      `${idmBaseUrl}/managed/alpha_user/${encodeURIComponent(id)}?_fields=${fields.join(',')}`,
      { headers: { Authorization: `Bearer ${serviceToken}` } },
    );
    if (!response.ok) return null;

    const record = (await response.json()) as AlphaUserRecord;
    if (typeof record._id !== 'string') return null;

    return {
      id: record._id,
      userName: typeof record.userName === 'string' ? record.userName : record._id,
      email: typeof record.mail === 'string' ? record.mail : '',
      givenName: typeof record.givenName === 'string' ? record.givenName : '',
      sn: typeof record.sn === 'string' ? record.sn : '',
      merchantId: typeof record.custom_merchantId === 'string' ? record.custom_merchantId : '',
      ...(typeof record.custom_merchantCustomerId === 'string'
        ? { merchantCustomerId: record.custom_merchantCustomerId }
        : {}),
    };
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { id } = await params;

  let users: MerchantIdentity[];
  try {
    users = await readJson<MerchantIdentity[]>(dataFilePath('users'));
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'User registry unavailable.' },
      { status: 503 },
    );
  }

  const seeded = users.find((u) => u.id === id);
  if (seeded) return NextResponse.json(seeded satisfies ResolvedUser);

  const live = await readAlphaUser(id);
  if (live) return NextResponse.json(live);

  return NextResponse.json({ error: 'not_found', message: 'User not found.' }, { status: 404 });
}
