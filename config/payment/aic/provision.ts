import { frodo } from '@rockcarver/frodo-lib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  TenantConfig,
  OAuth2ClientPayload,
  AIAgentPayload,
  ApplicationPayload,
  TrustedJwtIssuerPayload,
  BravoUser,
  ActionRecord,
  ResourceType,
  RunSummary,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Input loading
// ---------------------------------------------------------------------------

function loadJson<T>(relPath: string): T {
  const abs = join(__dirname, relPath);
  return JSON.parse(readFileSync(abs, 'utf-8')) as T;
}

type AicRealm = 'alpha' | 'bravo';

const realmInputDirectories: Record<AicRealm, string> = {
  alpha: 'inputs/alpha',
  bravo: '../../merchant/aic/inputs/bravo',
};

function loadConfig(): TenantConfig {
  return loadJson<TenantConfig>('inputs/tenant.json');
}

function loadRealmJson<T>(realm: AicRealm, fileName: string): T {
  return loadJson<T>(join(realmInputDirectories[realm], fileName));
}

function loadAlphaOAuth2Clients(): OAuth2ClientPayload[] {
  return loadRealmJson<OAuth2ClientPayload[]>('alpha', 'oauth2-clients.json');
}

function loadAlphaAIAgents(): AIAgentPayload[] {
  return loadRealmJson<AIAgentPayload[]>('alpha', 'ai-agents.json');
}

function loadAlphaApplications(): ApplicationPayload[] {
  return loadRealmJson<ApplicationPayload[]>('alpha', 'applications.json');
}

function loadAlphaTrustedJwtIssuers(): TrustedJwtIssuerPayload[] {
  return loadRealmJson<TrustedJwtIssuerPayload[]>('alpha', 'trusted-jwt-issuers.json');
}

function loadBravoOAuth2Clients(): OAuth2ClientPayload[] {
  return loadRealmJson<OAuth2ClientPayload[]>('bravo', 'oauth2-clients.json');
}

function loadBravoApplications(): ApplicationPayload[] {
  return loadRealmJson<ApplicationPayload[]>('bravo', 'applications.json');
}

function loadBravoUsers(): BravoUser[] {
  return loadJson<BravoUser[]>('../../../data/users.json');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively unwrap {inherited, value} objects returned by some frodo reads.
 * Arrays pass through unchanged (each element is not recursed).
 */
function flattenWrapped(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj;
  }
  if (typeof obj === 'object' && obj !== null) {
    const rec = obj as Record<string, unknown>;
    if ('inherited' in rec && 'value' in rec) {
      return flattenWrapped(rec['value']);
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(rec)) {
      result[key] = flattenWrapped(rec[key]);
    }
    return result;
  }
  return obj;
}

/**
 * Deep merge — source overwrites target for primitives; recurse for objects;
 * arrays from source REPLACE arrays in target (not concatenate).
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      !Array.isArray(sv) &&
      typeof sv === 'object' &&
      sv !== null &&
      typeof tv === 'object' &&
      tv !== null &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Frodo instance type alias
// ---------------------------------------------------------------------------

type FrodoInstance = ReturnType<typeof frodo.createInstanceWithServiceAccount>;

// ---------------------------------------------------------------------------
// Upsert helpers
// ---------------------------------------------------------------------------

/**
 * If OAUTH2_SECRET_<CLIENT_ID_UPPERCASED> is set, inject it as the client
 * secret (coreOAuth2ClientConfig.userpassword). This lets operators set known
 * secrets via config/payment/aic/.env without committing credentials in JSON files.
 */
function injectClientSecret(clientId: string, payload: OAuth2ClientPayload): OAuth2ClientPayload {
  const envKey = `OAUTH2_SECRET_${clientId.toUpperCase().replace(/-/g, '_')}`;
  const secret = process.env[envKey];
  if (!secret) return payload;
  return {
    ...payload,
    coreOAuth2ClientConfig: {
      ...(payload.coreOAuth2ClientConfig ?? {}),
      userpassword: secret,
    },
  };
}

async function upsertOAuth2Client(
  clientId: string,
  desired: OAuth2ClientPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'OAuth2Client';
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: clientId };
  }
  const desiredWithSecret = injectClientSecret(clientId, desired);
  try {
    let live: Record<string, unknown>;
    try {
      live = (await instance.oauth2oidc.client.readOAuth2Client(clientId)) as unknown as Record<
        string,
        unknown
      >;
    } catch {
      await instance.oauth2oidc.client.createOAuth2Client(
        clientId,
        desiredWithSecret as Parameters<typeof instance.oauth2oidc.client.createOAuth2Client>[1],
      );
      console.log(`[${realm}] OAuth2Client created: ${clientId}`);
      return { action: 'created', resourceType, realm, id: clientId };
    }
    const flat = flattenWrapped(live) as Record<string, unknown>;
    const merged = deepMerge(flat, desiredWithSecret as Record<string, unknown>);
    await instance.oauth2oidc.client.updateOAuth2Client(
      clientId,
      merged as Parameters<typeof instance.oauth2oidc.client.updateOAuth2Client>[1],
    );
    console.log(`[${realm}] OAuth2Client updated: ${clientId}`);
    return { action: 'updated', resourceType, realm, id: clientId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${realm}] OAuth2Client skipped (${clientId}): ${msg}`);
    return { action: 'skipped', resourceType, realm, id: clientId, error: msg };
  }
}

async function upsertTrustedJwtIssuer(
  issuerId: string,
  desired: TrustedJwtIssuerPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'OAuth2TrustedJwtIssuer';
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: issuerId };
  }
  try {
    let live: Record<string, unknown>;
    try {
      live = (await instance.oauth2oidc.issuer.readOAuth2TrustedJwtIssuer(
        issuerId,
      )) as unknown as Record<string, unknown>;
    } catch {
      await instance.oauth2oidc.issuer.createOAuth2TrustedJwtIssuer(
        issuerId,
        desired as unknown as Parameters<
          typeof instance.oauth2oidc.issuer.createOAuth2TrustedJwtIssuer
        >[1],
      );
      console.log(`[${realm}] OAuth2TrustedJwtIssuer created: ${issuerId}`);
      return { action: 'created', resourceType, realm, id: issuerId };
    }
    const flat = flattenWrapped(live) as Record<string, unknown>;
    const merged = deepMerge(flat, desired as Record<string, unknown>);
    await instance.oauth2oidc.issuer.updateOAuth2TrustedJwtIssuer(
      issuerId,
      merged as unknown as Parameters<
        typeof instance.oauth2oidc.issuer.updateOAuth2TrustedJwtIssuer
      >[1],
    );
    console.log(`[${realm}] OAuth2TrustedJwtIssuer updated: ${issuerId}`);
    return { action: 'updated', resourceType, realm, id: issuerId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${realm}] OAuth2TrustedJwtIssuer skipped (${issuerId}): ${msg}`);
    return { action: 'skipped', resourceType, realm, id: issuerId, error: msg };
  }
}

const ERROR_DETAIL_KEYS = new Set([
  'message',
  'name',
  'httpCode',
  'httpStatus',
  'httpMessage',
  'httpErrorReason',
  'httpErrorText',
  'httpDescription',
  'status',
  'statusText',
  'data',
  'body',
  'originalErrors',
  'response',
]);
const SENSITIVE_ERROR_KEYS = /secret|password|token|authorization|cookie|jwk|private|credential/i;

/**
 * Preserve Frodo's useful nested HTTP diagnostics without serialising headers
 * or credentials into the provision output. Frodo wraps transport failures in
 * `originalErrors`, so retaining that chain is essential when the top-level
 * message is only "Error creating ... AI agent".
 */
function formatFrodoError(error: unknown): string {
  const seen = new WeakSet<object>();

  const redact = (value: unknown, key?: string): unknown => {
    if (key && SENSITIVE_ERROR_KEYS.test(key)) return '[redacted]';
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => redact(item));

    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const field of ERROR_DETAIL_KEYS) {
      if (field in record) result[field] = redact(record[field], field);
    }
    return result;
  };

  const details = redact(error);
  const text = JSON.stringify(details);
  return text && text !== '{}' ? text.slice(0, 8000) : String(error);
}

function hasHttpStatus(error: unknown, status: number): boolean {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): boolean => {
    if (value === null || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (
      record['httpStatus'] === status ||
      record['status'] === status ||
      record['httpStatus'] === String(status) ||
      record['status'] === String(status)
    ) {
      return true;
    }
    if (
      typeof record['response'] === 'object' &&
      record['response'] !== null &&
      visit(record['response'])
    ) {
      return true;
    }
    return Array.isArray(record['originalErrors']) && record['originalErrors'].some(visit);
  };
  return visit(error);
}

function stripAgentIdentityReadbackFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result = { ...obj };
  // These fields are read-only relationship metadata. Keep the desired
  // aiAgentIdentityAttributes so Frodo can reconcile the first-class identity.
  delete result['aiAgentIdentityUid'];
  delete result['_aiAgentIdentity'];
  return result;
}

async function upsertAIAgent(
  agentId: string,
  desired: AIAgentPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'AIAgent';
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: agentId };
  }
  const safeDesired = desired as Record<string, unknown>;
  // Frodo's createAIAgent identity path expects the identity object under
  // _aiAgentIdentity (the read path exposes it there), not the flattened
  // aiAgentIdentityAttributes input shape.
  const identity = desired.aiAgentIdentityAttributes;
  const identityData = identity
    ? {
        _id: randomUUID(),
        oauth2ClientId: agentId,
        name: identity.name,
        description: identity.description,
        ...(identity.customAttributes ? { customAttributes: identity.customAttributes } : {}),
        _privileges: [],
      }
    : undefined;
  const createDesired = identityData
    ? { ...safeDesired, _aiAgentIdentity: identityData }
    : safeDesired;
  try {
    let live: Record<string, unknown>;
    try {
      live = (await instance.agent.readAIAgent(agentId, true)) as unknown as Record<
        string,
        unknown
      >;
    } catch (readError) {
      if (!hasHttpStatus(readError, 404)) {
        throw readError;
      }
      // Create only after a confirmed not-found response. Permission,
      // transport, schema, and other read failures must never fall through to
      // a tenant mutation.
      await instance.agent.createAIAgent(
        agentId,
        createDesired as Parameters<typeof instance.agent.createAIAgent>[1],
        true,
      );
      console.log(`[${realm}] AIAgent created with identity: ${agentId}`);
      return { action: 'created', resourceType, realm, id: agentId };
    }
    const flat = flattenWrapped(live) as Record<string, unknown>;
    const merged = stripAgentIdentityReadbackFields(deepMerge(flat, safeDesired));
    await instance.agent.updateAIAgent(
      agentId,
      merged as Parameters<typeof instance.agent.updateAIAgent>[1],
      true,
    );
    console.log(`[${realm}] AIAgent updated with identity: ${agentId}`);
    return { action: 'updated', resourceType, realm, id: agentId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const detail = formatFrodoError(e);
    console.error(`[${realm}] AIAgent skipped (${agentId}): ${msg}; details=${detail}`);
    return { action: 'skipped', resourceType, realm, id: agentId, error: msg };
  }
}

async function upsertApplication(
  applicationId: string,
  desired: ApplicationPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'Application';
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: applicationId };
  }
  try {
    let live: Record<string, unknown>;
    try {
      live = (await instance.app.readApplicationByName(desired.name)) as unknown as Record<
        string,
        unknown
      >;
    } catch {
      await instance.app.createApplication(
        applicationId,
        desired as unknown as Parameters<typeof instance.app.createApplication>[1],
      );
      console.log(`[${realm}] Application created: ${applicationId}`);
      return { action: 'created', resourceType, realm, id: applicationId };
    }
    const flat = flattenWrapped(live) as Record<string, unknown>;
    const existingId = typeof flat['_id'] === 'string' ? flat['_id'] : applicationId;
    const merged = deepMerge(flat, desired as Record<string, unknown>);
    await instance.app.updateApplication(
      existingId,
      merged as Parameters<typeof instance.app.updateApplication>[1],
    );
    console.log(`[${realm}] Application updated: ${applicationId}`);
    return { action: 'updated', resourceType, realm, id: applicationId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${realm}] Application skipped (${applicationId}): ${msg}`);
    return { action: 'skipped', resourceType, realm, id: applicationId, error: msg };
  }
}

async function upsertBravoUser(
  user: BravoUser,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
  userPassword: string,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'BravoUser';
  const userId = user.id;
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: userId };
  }
  // Base profile fields shared by create and update.
  // merchantId is not a bravo_user schema field; apps source it from their own config.
  const moBase = {
    userName: user.userName,
    mail: user.email,
    givenName: user.givenName,
    sn: user.sn,
  };
  try {
    // IDM requires _id to be a UUID; look up by userName instead of user.id.
    const existing = await instance.idm.managed.queryManagedObjects(
      'bravo_user',
      `userName eq "${user.userName}"`,
      ['_id', 'userName'],
    );
    if (existing.length === 0) {
      // Does not exist — create without custom _id so IDM auto-generates a UUID.
      const moCreate = { ...moBase, password: userPassword };
      await instance.idm.managed.createManagedObject(
        'bravo_user',
        moCreate as Parameters<typeof instance.idm.managed.createManagedObject>[1],
      );
      console.log(`[${realm}] BravoUser created: ${userId} (${user.userName})`);
      return { action: 'created', resourceType, realm, id: userId };
    }
    // Exists — update profile fields only; skip password to prevent accidental
    // credential resets after initial provisioning. IDM PUT requires _id in body.
    const existingUuid = existing[0]!._id as string;
    await instance.idm.managed.updateManagedObject('bravo_user', existingUuid, {
      ...moBase,
      _id: existingUuid,
    } as Parameters<typeof instance.idm.managed.updateManagedObject>[2]);
    console.log(`[${realm}] BravoUser updated: ${userId} (${user.userName})`);
    return { action: 'updated', resourceType, realm, id: userId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${realm}] BravoUser skipped (${userId}): ${msg}`);
    return { action: 'skipped', resourceType, realm, id: userId, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Explicit stale-application cleanup
// ---------------------------------------------------------------------------

/**
 * Remove only the known legacy merchant-web application from the payment
 * provider realm. This is deliberately opt-in and always uses a non-deep
 * delete so dependencies cannot be removed as a side effect.
 */
async function pruneStaleAlphaApplications(
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord[]> {
  // Dry runs do not call tenant APIs. Report the fixed, narrow cleanup target.
  if (dryRun) {
    return [
      {
        action: 'dry-run',
        resourceType: 'StaleApplication',
        realm,
        id: 'merchant-web',
      },
    ];
  }
  const applications = await instance.app.readApplications();
  const staleApplications = applications.filter(
    (application) =>
      application._id === 'merchant-web' &&
      application.name === 'merchant-web' &&
      (application.ssoEntities as unknown as Record<string, unknown>)['oidcId'] === 'merchant-web',
  );
  const actions: ActionRecord[] = [];
  for (const application of staleApplications) {
    const id = application._id;
    if (!id) continue;
    try {
      await instance.app.deleteApplication(id, false);
      // Verify the non-deep delete did not leave the targeted application.
      try {
        await instance.app.readApplication(id);
        throw new Error(`application '${id}' still exists after non-deep delete`);
      } catch (readError) {
        if (!hasHttpStatus(readError, 404)) throw readError;
      }
      actions.push({ action: 'deleted', resourceType: 'StaleApplication', realm, id });
      console.log(`[${realm}] stale Application deleted (non-deep): ${id}`);
    } catch (error) {
      if (hasHttpStatus(error, 404)) {
        actions.push({
          action: 'skipped',
          resourceType: 'StaleApplication',
          realm,
          id,
          error: 'already absent (404)',
        });
        console.log(`[${realm}] stale Application already absent: ${id}`);
        continue;
      }
      const msg = formatFrodoError(error);
      actions.push({ action: 'skipped', resourceType: 'StaleApplication', realm, id, error: msg });
      console.error(`[${realm}] stale Application skipped (${id}): ${msg}`);
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Main provision function
// ---------------------------------------------------------------------------

export async function provision(
  config: TenantConfig,
  dryRun: boolean,
  pruneStaleApplications = false,
): Promise<RunSummary> {
  const { tenantUrl } = config;

  const profile = await frodo.conn.getConnectionProfileByHost(tenantUrl);

  const svcAccountId = profile.svcacctId;
  if (!svcAccountId) {
    throw new Error(
      `Frodo connection profile for '${tenantUrl}' is missing svcacctId. ` +
        `Run 'frodo conn save ${tenantUrl}' to populate the connection profile.`,
    );
  }

  const rawJwk: unknown = profile.svcacctJwk;
  if (!rawJwk) {
    throw new Error(
      `Frodo connection profile for '${tenantUrl}' is missing svcacctJwk. ` +
        `Run 'frodo conn save ${tenantUrl}' to populate the connection profile.`,
    );
  }
  // Normalise: frodo-lib decryption may return a JSON string or a parsed object.
  const svcAccountJwk: string = typeof rawJwk === 'string' ? rawJwk : JSON.stringify(rawJwk);

  // Load inputs
  const alphaClients = loadAlphaOAuth2Clients();
  const alphaAgents = loadAlphaAIAgents();
  const alphaApplications = loadAlphaApplications();
  const alphaTrustedIssuers = loadAlphaTrustedJwtIssuers();
  const bravoClients = loadBravoOAuth2Clients();
  const bravoApplications = loadBravoApplications();
  const bravoUsers = loadBravoUsers();

  // Create frodo instances
  const alphaInstance = frodo.createInstanceWithServiceAccount(
    tenantUrl,
    svcAccountId,
    svcAccountJwk,
  );
  alphaInstance.state.setRealm('/alpha');

  const bravoInstance = frodo.createInstanceWithServiceAccount(
    tenantUrl,
    svcAccountId,
    svcAccountJwk,
  );
  bravoInstance.state.setRealm('/bravo');

  if (!dryRun) {
    await alphaInstance.login.getTokens();
    await bravoInstance.login.getTokens();
  }

  // Resolve the password used when creating bravo demo users. Source it from
  // BRAVO_USER_DEFAULT_PASSWORD so credentials are not committed in source.
  // Fall back to the built-in default only if the env var is absent, and emit
  // a clear warning so operators know they are using the fallback value.
  const bravoUserPassword = (() => {
    const pw = process.env['BRAVO_USER_DEFAULT_PASSWORD'];
    if (!pw) {
      console.warn(
        '[provision] WARNING: BRAVO_USER_DEFAULT_PASSWORD is not set. ' +
          'Using built-in fallback password for bravo user creation. ' +
          'Set this env var (see config/payment/aic/.env.example) to avoid credentials in source.',
      );
    }
    return pw ?? 'Br@vo1234!';
  })();

  const actions: ActionRecord[] = [];

  // Alpha OAuth2Clients
  for (const client of alphaClients) {
    const id = client._id;
    if (!id) continue;
    actions.push(await upsertOAuth2Client(id, client, alphaInstance, '/alpha', dryRun));
  }

  // Alpha AIAgents
  for (const agent of alphaAgents) {
    const id = agent._id;
    if (!id) continue;
    actions.push(await upsertAIAgent(id, agent, alphaInstance, '/alpha', dryRun));
  }

  // Alpha Applications
  for (const application of alphaApplications) {
    const id = application._id;
    if (!id) continue;
    actions.push(await upsertApplication(id, application, alphaInstance, '/alpha', dryRun));
  }

  // Alpha TrustedJwtIssuers
  for (const issuer of alphaTrustedIssuers) {
    const id = issuer._id;
    if (!id) continue;
    actions.push(await upsertTrustedJwtIssuer(id, issuer, alphaInstance, '/alpha', dryRun));
  }

  // Bravo OAuth2Clients
  for (const client of bravoClients) {
    const id = client._id;
    if (!id) continue;
    actions.push(await upsertOAuth2Client(id, client, bravoInstance, '/bravo', dryRun));
  }

  // Bravo Applications
  for (const application of bravoApplications) {
    const id = application._id;
    if (!id) continue;
    actions.push(await upsertApplication(id, application, bravoInstance, '/bravo', dryRun));
  }

  if (pruneStaleApplications) {
    actions.push(...(await pruneStaleAlphaApplications(alphaInstance, '/alpha', dryRun)));
  }

  // Bravo Users
  for (const user of bravoUsers) {
    actions.push(await upsertBravoUser(user, bravoInstance, '/bravo', dryRun, bravoUserPassword));
  }

  const summary: RunSummary = {
    timestamp: new Date().toISOString(),
    tenant: tenantUrl,
    dryRun,
    actions,
  };

  if (dryRun) {
    console.log('\n--- Dry-run plan ---');
    console.log(
      actions
        .map((a) => `  ${a.action.padEnd(8)} ${a.resourceType.padEnd(26)} [${a.realm}] ${a.id}`)
        .join('\n'),
    );
    console.log('--- End dry-run plan ---\n');
  } else {
    const outputDir = join(__dirname, 'outputs');
    mkdirSync(outputDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = join(outputDir, `provision-run-${ts}.json`);
    writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\nSummary written to ${outPath}`);
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export const main = async (): Promise<void> => {
  const dryRun = process.argv.includes('--dry-run');
  const pruneStaleApplications = process.argv.includes('--prune-stale-applications');
  const config = loadConfig();
  await provision(config, dryRun, pruneStaleApplications);
};

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
});
