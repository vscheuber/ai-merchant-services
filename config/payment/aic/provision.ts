import { frodo } from '@rockcarver/frodo-lib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  TenantConfig,
  OAuth2ClientPayload,
  AIAgentPayload,
  AIAgentIdentityAttributes,
  ApplicationPayload,
  TrustedJwtIssuerPayload,
  OrganizationPayload,
  BravoUser,
  MerchantGroupConfig,
  MerchantGroupPayload,
  ActionRecord,
  ResourceType,
  RunSummary,
  ScriptPayload,
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

function loadAlphaOrganizations(): OrganizationPayload[] {
  return loadRealmJson<OrganizationPayload[]>('alpha', 'organizations.json');
}

/**
 * The checked-in file is a Frodo MultiTreeExportInterface (`{meta, trees}`),
 * produced by `frodo journey export`. Each journey we deploy lives in its own
 * file, keyed by its own journey ID inside `trees`.
 */
function loadAlphaJourneyBundle(journeyId: string): Record<string, unknown> {
  const bundle = loadRealmJson<{ trees?: Record<string, unknown> }>(
    'alpha',
    `journeys/${journeyId}.journey.json`,
  );
  const tree = bundle.trees?.[journeyId];
  if (!tree) {
    throw new Error(
      `Journey bundle 'journeys/${journeyId}.journey.json' does not contain a '${journeyId}' tree.`,
    );
  }
  return tree as Record<string, unknown>;
}

function loadMerchantGroupConfig(): MerchantGroupConfig {
  return loadJson<MerchantGroupConfig>('inputs/merchant-groups.json');
}

function loadAlphaMerchantGroups(): MerchantGroupPayload[] {
  return loadRealmJson<MerchantGroupPayload[]>('alpha', 'merchant-groups.json');
}

function loadBravoOAuth2Clients(): OAuth2ClientPayload[] {
  return loadRealmJson<OAuth2ClientPayload[]>('bravo', 'oauth2-clients.json');
}

function loadBravoScripts(): ScriptPayload[] {
  return loadRealmJson<ScriptPayload[]>('bravo', 'scripts.json');
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
function loadScriptBody(payload: ScriptPayload): string {
  return readFileSync(join(__dirname, '../../merchant/aic/inputs/bravo', payload.scriptFile), 'utf8');
}

async function upsertBravoScript(
  desired: ScriptPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType = 'Script' as ResourceType;
  if (dryRun) return { action: 'dry-run', resourceType, realm, id: desired._id };
  try {
    const scriptData = {
      _id: desired._id,
      name: desired.name,
      description: desired.description ?? '',
      default: desired.default,
      language: desired.language,
      context: desired.context,
      evaluatorVersion: desired.evaluatorVersion,
      // Frodo's script operation performs the required base64 encoding.
      script: loadScriptBody(desired),
    } as Parameters<typeof instance.script.updateScript>[1];
    try {
      await instance.script.readScript(desired._id);
    } catch (readError) {
      if (!hasHttpStatus(readError, 404)) throw readError;
      await instance.script.createScript(desired._id, desired.name, scriptData);
      console.log(`[${realm}] Script created: ${desired._id}`);
      return { action: 'created', resourceType, realm, id: desired._id };
    }
    await instance.script.updateScript(desired._id, scriptData);
    console.log(`[${realm}] Script updated: ${desired._id}`);
    return { action: 'updated', resourceType, realm, id: desired._id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${realm}] Script skipped (${desired._id}): ${msg}`);
    return { action: 'skipped', resourceType, realm, id: desired._id, error: msg };
  }
}

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

async function upsertOrganization(
  desired: OrganizationPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'Organization';
  const id = desired.merchantId;
  const detail = `merchantId=${desired.merchantId}`;
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id, detail };
  }
  try {
    const orgType = instance.idm.organization.getRealmManagedOrganization();
    const existing = await instance.idm.managed.queryManagedObjects(
      orgType,
      `merchantId eq "${desired.merchantId}"`,
      ['_id', 'merchantId'],
    );
    if (existing.length === 0) {
      await instance.idm.managed.createManagedObject(
        orgType,
        desired as unknown as Parameters<typeof instance.idm.managed.createManagedObject>[1],
      );
      console.log(`[${realm}] Organization created: ${id} (${detail})`);
      return { action: 'created', resourceType, realm, id, detail };
    }
    const existingUuid = existing[0]!['_id'] as string;
    const live = (await instance.idm.managed.readManagedObject(orgType, existingUuid)) as Record<
      string,
      unknown
    >;
    const flat = flattenWrapped(live) as Record<string, unknown>;
    const merged = deepMerge(flat, desired as Record<string, unknown>);
    await instance.idm.managed.updateManagedObject(
      orgType,
      existingUuid,
      merged as Parameters<typeof instance.idm.managed.updateManagedObject>[2],
    );
    console.log(`[${realm}] Organization updated: ${id} (${detail})`);
    return { action: 'updated', resourceType, realm, id, detail };
  } catch (error) {
    const msg = formatFrodoError(error);
    console.error(`[${realm}] Organization skipped (${id}): ${msg}`);
    return { action: 'skipped', resourceType, realm, id, detail, error: msg };
  }
}

/**
 * Journey import (without `--re-uuid`) is Frodo's own idempotent, PUT-by-ID
 * desired-state mechanism, so this always calls `importJourney` rather than
 * hand-rolling a node/script diff. The tree's own `_id` inside
 * `singleTreeExport.tree` — not the `journeyId` argument — is what Frodo
 * actually writes to; `journeyId` here is only used for the pre-check and
 * read-back verification, so the checked-in bundle's `tree._id` must match.
 */
async function upsertJourney(
  journeyId: string,
  singleTreeExport: Record<string, unknown>,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'Journey';
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: journeyId };
  }
  try {
    let action: 'created' | 'updated' = 'created';
    try {
      await instance.authn.journey.readJourney(journeyId);
      action = 'updated';
    } catch (error) {
      if (!hasHttpStatus(error, 404)) throw error;
    }
    await instance.authn.journey.importJourney(
      singleTreeExport as unknown as Parameters<typeof instance.authn.journey.importJourney>[0],
      { reUuid: false, deps: true },
    );
    const readBack = (await instance.authn.journey.readJourney(journeyId)) as unknown as Record<
      string,
      unknown
    >;
    if (!readBack || readBack['_id'] !== journeyId) {
      throw new Error(`Journey read-back mismatch for '${journeyId}'`);
    }
    console.log(`[${realm}] Journey ${action}: ${journeyId}`);
    return { action, resourceType, realm, id: journeyId };
  } catch (error) {
    const msg = formatFrodoError(error);
    console.error(`[${realm}] Journey failed (${journeyId}): ${msg}`);
    throw new Error(`Journey upsert failed for '${journeyId}': ${msg}`, { cause: error });
  }
}

/**
 * Deletes the deprecated `poc-jwt-login` journey (deep delete cascades to its
 * own now-orphaned nodes/inner-nodes only — shared scripts, e.g. the default
 * Config Provider script, are untouched). Deliberately NOT wired into the
 * steady-state `provision()` flow: invoke only once, explicitly, after
 * `merchant-token-login` has been verified end-to-end (task #36's gate).
 */
async function retirePocJwtLoginJourney(
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'Journey';
  const id = 'poc-jwt-login';
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id, operation: 'delete' };
  }
  try {
    await instance.authn.journey.deleteJourney(id, { deep: true, verbose: false });
    try {
      await instance.authn.journey.readJourney(id);
      throw new Error(`Journey '${id}' still exists after deep delete`);
    } catch (readError) {
      if (!hasHttpStatus(readError, 404)) throw readError;
    }
    console.log(`[${realm}] Journey deleted: ${id}`);
    return { action: 'deleted', resourceType, realm, id, operation: 'delete' };
  } catch (error) {
    if (hasHttpStatus(error, 404)) {
      console.log(`[${realm}] Journey already absent: ${id}`);
      return { action: 'skipped', resourceType, realm, id, operation: 'delete', error: 'already absent (404)' };
    }
    const msg = formatFrodoError(error);
    console.error(`[${realm}] Journey delete failed (${id}): ${msg}`);
    throw new Error(`Journey delete failed for '${id}': ${msg}`, { cause: error });
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

const SENSITIVE_PAYLOAD_KEYS = /secret|password|authorization|cookie|jwk|private|credential/i;

function stripSensitivePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripSensitivePayload(item));
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!SENSITIVE_PAYLOAD_KEYS.test(key)) result[key] = stripSensitivePayload(entry);
  }
  return result;
}

function getIdentityId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record['_id'] === 'string' && record['_id'].length > 0) return record['_id'];
  return undefined;
}

function extractCreatedIdentityId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const directIdentity =
    getIdentityId(record['_aiAgentIdentity']) ?? getIdentityId(record['aiAgentIdentity']);
  if (directIdentity) return directIdentity;
  const uid = record['aiAgentIdentityUid'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  if (typeof uid === 'object' && uid !== null) {
    const uidValue = (uid as Record<string, unknown>)['value'];
    if (typeof uidValue === 'string' && uidValue.length > 0) return uidValue;
  }
  return undefined;
}

function readBackIdentityId(value: Record<string, unknown>): string | undefined {
  const nested = getIdentityId(value['_aiAgentIdentity']);
  if (nested) return nested;
  return extractCreatedIdentityId(value);
}

function plannedAgentAction(realm: string): ActionRecord {
  return {
    action: 'planned',
    operation: 'replace',
    resourceType: 'AIAgent',
    realm,
    id: 'northwind-chatbot-agent',
  };
}

function buildAIAgentCreatePayload(
  agentId: string,
  source: Record<string, unknown>,
  identityAttributes: AIAgentIdentityAttributes,
): Record<string, unknown> {
  const payload = stripSensitivePayload({ ...source }) as Record<string, unknown>;
  // These are read/response metadata. The identity ID is server-assigned and
  // must never be generated or replayed in a create request.
  delete payload['_aiAgentIdentity'];
  delete payload['aiAgentIdentityUid'];
  delete payload['_type'];
  return {
    ...payload,
    _id: agentId,
    // The AIC endpoint requires the flattened identity attributes on the
    // agent payload as well as the nested identity consumed by Frodo's
    // includeAgentIdentity path.
    aiAgentIdentityAttributes: stripSensitivePayload({
      oauth2ClientId: agentId,
      ...identityAttributes,
      customAttributes: identityAttributes.customAttributes ?? {},
    }),
    _aiAgentIdentity: {
      oauth2ClientId: agentId,
      name: identityAttributes.name,
      description: identityAttributes.description,
      customAttributes: identityAttributes.customAttributes ?? {},
      _privileges: [],
    },
  };
}

/**
 * Replace only the Northwind OAuth2 client with a first-class AI Agent.
 * The retry path is intentionally non-destructive: an already-present source
 * client is a safety failure, while an absent target client may be created
 * only after an explicit opt-in and a confirmed AI Agent 404.
 */
async function replaceNorthwindChatbotClient(
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
): Promise<ActionRecord[]> {
  const agentId = 'northwind-chatbot-agent';
  const desiredAgent = loadAlphaAIAgents().find((agent) => agent._id === agentId);
  const identityAttributes = desiredAgent?.aiAgentIdentityAttributes;
  if (!desiredAgent || !identityAttributes) {
    return [
      {
        action: 'skipped',
        operation: 'replace',
        resourceType: 'AIAgent',
        realm,
        id: agentId,
        error: 'desired AI Agent identity attributes are missing',
      },
    ];
  }
  if (dryRun) {
    return [
      {
        action: 'planned',
        operation: 'replace',
        resourceType: 'OAuth2Client',
        realm,
        id: agentId,
      },
      plannedAgentAction(realm),
    ];
  }

  const actions: ActionRecord[] = [];
  try {
    // The retry is allowed only when the target protocol client is absent. It
    // must not delete or overwrite anything: the desired agent config is the
    // non-secret source for the new client/agent representation.
    try {
      await instance.oauth2oidc.client.readOAuth2Client(agentId);
      throw new Error(
        `OAuth2 client '${agentId}' already exists; refusing retry because this path only creates an absent target.`,
      );
    } catch (error) {
      if (!hasHttpStatus(error, 404)) throw error;
    }
    actions.push({
      action: 'verified',
      operation: 'verify-404',
      resourceType: 'OAuth2Client',
      realm,
      id: agentId,
    });

    try {
      await instance.agent.readAIAgent(agentId, true);
      throw new Error(`AI Agent '${agentId}' already exists; refusing to mutate it on retry.`);
    } catch (error) {
      if (!hasHttpStatus(error, 404)) throw error;
    }

    const createPayload = buildAIAgentCreatePayload(
      agentId,
      desiredAgent as Record<string, unknown>,
      identityAttributes,
    );
    const created = await instance.agent.createAIAgent(
      agentId,
      createPayload as Parameters<typeof instance.agent.createAIAgent>[1],
      true,
    );

    // The create response is authoritative when it includes the identity ID.
    // Frodo 4.1.7 returns only the base agent PUT response, so the approved
    // fallback is one immediate identity-inclusive read; never synthesize an ID.
    let identityId = extractCreatedIdentityId(created);
    let readBack: Record<string, unknown>;
    if (!identityId) {
      readBack = flattenWrapped(
        (await instance.agent.readAIAgent(agentId, true)) as unknown as Record<string, unknown>,
      ) as Record<string, unknown>;
      identityId = readBackIdentityId(readBack);
      if (!identityId) {
        throw new Error(
          `Frodo createAIAgent returned no identity _id for '${agentId}', and the immediate read-back also lacked one; refusing to generate a fallback ID.`,
        );
      }
    } else {
      readBack = flattenWrapped(
        (await instance.agent.readAIAgent(agentId, true)) as unknown as Record<string, unknown>,
      ) as Record<string, unknown>;
    }
    actions.push({
      action: 'created',
      operation: 'create',
      resourceType: 'AIAgent',
      realm,
      id: agentId,
      identityId,
    });

    if (readBack['_id'] !== agentId) {
      throw new Error(`AI Agent read-back ID mismatch for '${agentId}'`);
    }
    const linkedIdentityId = readBackIdentityId(readBack);
    if (!linkedIdentityId || linkedIdentityId !== identityId) {
      throw new Error(
        `AI Agent '${agentId}' read-back identity mismatch: expected '${identityId}', got '${linkedIdentityId ?? 'missing'}'`,
      );
    }
    actions.push({
      action: 'verified',
      operation: 'verify-identity',
      resourceType: 'AIAgent',
      realm,
      id: agentId,
      identityId,
    });
    console.log(
      `[${realm}] Northwind OAuth2 client replaced by AIAgent: ${agentId} (identity ${identityId})`,
    );
  } catch (error) {
    const msg = formatFrodoError(error);
    actions.push({
      action: 'skipped',
      operation: 'replace',
      resourceType: 'AIAgent',
      realm,
      id: agentId,
      error: msg,
    });
    console.error(`[${realm}] Northwind chatbot migration stopped: ${msg}`);
  }
  return actions;
}

function validateMerchantGroupDesiredState(
  config: MerchantGroupConfig,
  groups: MerchantGroupPayload[],
): void {
  if (!config.groupPrefix || !/^[a-z][a-z0-9-]*$/.test(config.groupPrefix)) {
    throw new Error('Merchant group prefix must be a stable lowercase identifier.');
  }
  for (const attribute of [config.merchantIdAttribute, config.merchantCustomerIdAttribute]) {
    if (!attribute || !/^custom_[A-Za-z][A-Za-z0-9_]*$/.test(attribute)) {
      throw new Error('Merchant identity attributes must use the custom_ prefix.');
    }
  }
  if (config.merchantIdAttribute === config.merchantCustomerIdAttribute) {
    throw new Error('Merchant identity attributes must be distinct.');
  }
  const expected = new Map(
    config.merchants.map((merchant) => [
      merchant.merchantId,
      {
        name: `${config.groupPrefix}-${merchant.merchantId}`,
        condition: `${config.merchantIdAttribute} == "${merchant.merchantId}"`,
      },
    ]),
  );
  for (const group of groups) {
    const merchantId = group.name.startsWith(`${config.groupPrefix}-`)
      ? group.name.slice(config.groupPrefix.length + 1)
      : undefined;
    const expectedGroup = merchantId ? expected.get(merchantId) : undefined;
    if (
      !expectedGroup ||
      group.name !== expectedGroup.name ||
      group.condition !== expectedGroup.condition
    ) {
      throw new Error(
        `Merchant group '${group._id ?? group.name}' does not match the global prefix/registry desired state.`,
      );
    }
  }
  if (groups.length !== expected.size) {
    throw new Error(
      'Merchant group desired state must contain exactly one group per registered merchant.',
    );
  }
}

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`alpha_user schema is malformed: '${field}' must be an array of strings.`);
  }
}

/**
 * Validate the exact schema contract needed before writing merchant groups.
 *
 * The approval environment variable is only an operator intent signal. The
 * tenant response is authoritative and must prove that both configured
 * identity properties exist, are scalar strings, and can be written by the
 * JIT user flow. Unknown or malformed metadata is rejected before any group
 * read or mutation is attempted.
 */
function assertMerchantIdentitySchema(
  schema: unknown,
  config: MerchantGroupConfig,
): asserts schema is UnknownRecord {
  if (!isUnknownRecord(schema) || schema['type'] !== 'object') {
    throw new Error(
      'alpha_user schema lookup returned malformed metadata; refusing merchant-group writes.',
    );
  }

  const properties = schema['properties'];
  if (!isUnknownRecord(properties)) {
    throw new Error('alpha_user schema is malformed: properties must be an object.');
  }
  assertStringArray(schema['order'], 'order');
  assertStringArray(schema['required'], 'required');

  for (const attribute of [config.merchantIdAttribute, config.merchantCustomerIdAttribute]) {
    if (!Object.prototype.hasOwnProperty.call(properties, attribute)) {
      throw new Error(
        `${attribute} is missing from alpha_user schema; merchant-group writes remain blocked.`,
      );
    }
    if (!schema['order'].includes(attribute)) {
      throw new Error(
        `${attribute} is missing from alpha_user schema order metadata; merchant-group writes remain blocked.`,
      );
    }

    const property = properties[attribute];
    if (!isUnknownRecord(property) || property['type'] !== 'string') {
      throw new Error(
        `${attribute} must be a scalar string in alpha_user schema; merchant-group writes remain blocked.`,
      );
    }

    // Frodo exposes userEditable; some IDM deployments also expose writable.
    // At least one marker must be explicitly true. If an additional marker is
    // returned, it must not contradict it, rejecting ambiguous metadata.
    const userEditable = property['userEditable'];
    const writable = property['writable'];
    if (userEditable !== undefined && userEditable !== true) {
      throw new Error(
        `${attribute} has userEditable metadata that is not true; merchant-group writes remain blocked.`,
      );
    }
    if (writable !== undefined && writable !== true) {
      throw new Error(
        `${attribute} has writable metadata that is not true; merchant-group writes remain blocked.`,
      );
    }
    if (userEditable !== true && writable !== true) {
      throw new Error(
        `${attribute} lacks explicit writable/userEditable=true metadata; merchant-group writes remain blocked.`,
      );
    }
  }
}

async function readAndValidateMerchantIdentitySchema(
  instance: FrodoInstance,
  config: MerchantGroupConfig,
): Promise<void> {
  // Flatten only the documented inherited/value wrapper; validation below
  // still rejects all other malformed 200 responses.
  const rawSchema = await instance.idm.managed.readManagedObjectSchema('alpha_user', true);
  assertMerchantIdentitySchema(flattenWrapped(rawSchema), config);
}

async function upsertMerchantGroup(
  groupId: string,
  desired: MerchantGroupPayload,
  instance: FrodoInstance,
  realm: string,
  dryRun: boolean,
  schemaApproved: boolean,
  merchantGroupConfigForRuntime: MerchantGroupConfig,
): Promise<ActionRecord> {
  const resourceType: ResourceType = 'MerchantGroup';
  const detail = `name=${desired.name}; condition=${desired.condition}`;
  if (dryRun) {
    return { action: 'dry-run', resourceType, realm, id: groupId, detail };
  }
  if (!schemaApproved) {
    throw new Error(
      `[${realm}] MerchantGroup ${groupId} refused: set AIC_MERCHANT_SCHEMA_APPROVED=true only after ${desired.name} identity schema approval`,
    );
  }

  try {
    // The group condition depends on the identity pair. Verify the complete
    // schema contract before any group read/upsert so an unsupported tenant
    // cannot be mutated. The explicit env gate above is not sufficient by
    // itself because it cannot attest to live tenant metadata.
    await readAndValidateMerchantIdentitySchema(instance, merchantGroupConfigForRuntime);

    let live: Record<string, unknown>;
    try {
      live = (await instance.idm.managed.readManagedObject('alpha_group', groupId)) as Record<
        string,
        unknown
      >;
    } catch (error) {
      if (!hasHttpStatus(error, 404)) throw error;
      await instance.idm.managed.createManagedObject(
        'alpha_group',
        desired as unknown as Parameters<typeof instance.idm.managed.createManagedObject>[1],
        groupId,
      );
      live = (await instance.idm.managed.readManagedObject('alpha_group', groupId)) as Record<
        string,
        unknown
      >;
      if (live['name'] !== desired.name || live['condition'] !== desired.condition) {
        throw new Error(`MerchantGroup read-back mismatch for '${groupId}'`);
      }
      console.log(`[${realm}] MerchantGroup created: ${groupId} (${detail})`);
      return { action: 'created', resourceType, realm, id: groupId, detail };
    }

    const flat = flattenWrapped(live) as Record<string, unknown>;
    const merged = deepMerge(flat, desired as Record<string, unknown>);
    await instance.idm.managed.updateManagedObject(
      'alpha_group',
      groupId,
      merged as Parameters<typeof instance.idm.managed.updateManagedObject>[2],
    );
    const readBack = (await instance.idm.managed.readManagedObject(
      'alpha_group',
      groupId,
    )) as Record<string, unknown>;
    if (readBack['name'] !== desired.name || readBack['condition'] !== desired.condition) {
      throw new Error(`MerchantGroup read-back mismatch for '${groupId}'`);
    }
    console.log(`[${realm}] MerchantGroup updated: ${groupId} (${detail})`);
    return { action: 'updated', resourceType, realm, id: groupId, detail };
  } catch (error) {
    const msg = formatFrodoError(error);
    console.error(`[${realm}] MerchantGroup failed (${groupId}): ${msg}`);
    throw new Error(`MerchantGroup upsert failed for '${groupId}': ${msg}`, { cause: error });
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

const MERCHANT_TOKEN_LOGIN_JOURNEY_ID = 'merchant-token-login';

export async function provision(
  config: TenantConfig,
  dryRun: boolean,
  pruneStaleApplications = false,
  replaceNorthwindChatbotClientOptIn = false,
  provisionMerchantGroups = false,
  retirePocJwtLoginJourneyOptIn = false,
  selectedMerchantId?: string,
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
  const alphaApplications = loadAlphaApplications();
  const alphaTrustedIssuers = loadAlphaTrustedJwtIssuers();
  const alphaOrganizations = loadAlphaOrganizations().filter(
    (organization) => !selectedMerchantId || organization.merchantId === selectedMerchantId,
  );
  const merchantTokenLoginJourney = loadAlphaJourneyBundle(MERCHANT_TOKEN_LOGIN_JOURNEY_ID);
  const merchantGroupConfig = loadMerchantGroupConfig();
  const allAlphaMerchantGroups = loadAlphaMerchantGroups();
  const selectedGroupConfig = selectedMerchantId
    ? { ...merchantGroupConfig, merchants: merchantGroupConfig.merchants.filter((merchant) => merchant.merchantId === selectedMerchantId) }
    : merchantGroupConfig;
  validateMerchantGroupDesiredState(selectedGroupConfig, selectedMerchantId ? allAlphaMerchantGroups.filter((group) => group.name === `${merchantGroupConfig.groupPrefix}-${selectedMerchantId}`) : allAlphaMerchantGroups);
  const alphaMerchantGroups = selectedMerchantId
    ? allAlphaMerchantGroups.filter(
        (group) => group.name === `${merchantGroupConfig.groupPrefix}-${selectedMerchantId}`,
      )
    : allAlphaMerchantGroups;
  const bravoClients = loadBravoOAuth2Clients();
  const bravoScripts = loadBravoScripts();
  const bravoApplications = loadBravoApplications();
  const bravoUsers = loadBravoUsers().filter(
    (user) => !selectedMerchantId || user.merchantId === selectedMerchantId,
  );

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
  const bravoUserPassword = process.env['BRAVO_USER_DEFAULT_PASSWORD'];
  if (!dryRun && bravoUsers.length > 0 && !bravoUserPassword) {
    throw new Error('BRAVO_USER_DEFAULT_PASSWORD is required for live Bravo user provisioning.');
  }

  const actions: ActionRecord[] = [];

  // An explicit live retry is intentionally isolated from normal desired-state
  // reconciliation. It performs only the guarded agent create/read-back path;
  // in particular it does not delete anything or update the legacy client.
  if (replaceNorthwindChatbotClientOptIn && !dryRun) {
    actions.push(...(await replaceNorthwindChatbotClient(alphaInstance, '/alpha', false)));
  } else {
    // Alpha OAuth2Clients. The Northwind client is intentionally absent from
    // desired state and can only be replaced through the explicit migration.
    for (const client of alphaClients) {
      const id = client._id;
      if (!id) continue;
      actions.push(await upsertOAuth2Client(id, client, alphaInstance, '/alpha', dryRun));
    }

    // The agent replacement is an explicit migration; do not include it in
    // ordinary dry-run plans unless the operator requested the flag.
    if (dryRun && replaceNorthwindChatbotClientOptIn) {
      actions.push(...(await replaceNorthwindChatbotClient(alphaInstance, '/alpha', true)));
    }
  }

  const isolatedRetry = replaceNorthwindChatbotClientOptIn && !dryRun;
  if (!isolatedRetry) {
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

    // Alpha Organizations — one per onboarded merchant.
    for (const organization of alphaOrganizations) {
      actions.push(await upsertOrganization(organization, alphaInstance, '/alpha', dryRun));
    }

    // Alpha Journeys. Plain import (no --re-uuid) is idempotent desired-state
    // reconciliation, safe to run on every provision — distinct from the
    // one-time clone/retire migration gated below.
    actions.push(
      await upsertJourney(
        MERCHANT_TOKEN_LOGIN_JOURNEY_ID,
        merchantTokenLoginJourney,
        alphaInstance,
        '/alpha',
        dryRun,
      ),
    );

    // One-time retirement of the pre-rename poc-jwt-login journey. Dormant by
    // default; only run after merchant-token-login has been verified
    // end-to-end in production use.
    if (retirePocJwtLoginJourneyOptIn) {
      actions.push(await retirePocJwtLoginJourney(alphaInstance, '/alpha', dryRun));
    }

    if (provisionMerchantGroups) {
      const schemaApproved = process.env['AIC_MERCHANT_SCHEMA_APPROVED'] === 'true';
      for (const group of alphaMerchantGroups) {
        const id = group._id ?? group.name;
        actions.push(
          await upsertMerchantGroup(
            id,
            group,
            alphaInstance,
            '/alpha',
            dryRun,
            schemaApproved,
            selectedGroupConfig,
          ),
        );
      }
    }

    // Bravo OIDC Claims scripts must exist before clients reference them.
    for (const script of bravoScripts) {
      actions.push(await upsertBravoScript(script, bravoInstance, '/bravo', dryRun));
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
      actions.push(await upsertBravoUser(user, bravoInstance, '/bravo', dryRun, bravoUserPassword ?? ''));
    }
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
  const merchantIdArgIndex = process.argv.indexOf('--merchant-id');
  const selectedMerchantId = merchantIdArgIndex >= 0 ? process.argv[merchantIdArgIndex + 1] : undefined;
  if (merchantIdArgIndex >= 0 && !selectedMerchantId) throw new Error('--merchant-id requires a value.');
  if (selectedMerchantId && !/^[a-z][a-z0-9-]*$/.test(selectedMerchantId)) throw new Error('Invalid --merchant-id.');
  const pruneStaleApplications = process.argv.includes('--prune-stale-applications');
  const replaceNorthwindChatbotClient = process.argv.includes('--replace-northwind-chatbot-client');
  const provisionMerchantGroups = process.argv.includes('--provision-merchant-groups');
  const retirePocJwtLoginJourneyOptIn = process.argv.includes(
    '--migrate-merchant-token-login-journey',
  );
  if (process.argv.includes('--dry-run') === process.argv.includes('--apply')) {
    throw new Error('Specify exactly one of --dry-run or --apply.');
  }
  const config = loadConfig();
  await provision(
    config,
    dryRun,
    pruneStaleApplications,
    replaceNorthwindChatbotClient,
    provisionMerchantGroups,
    retirePocJwtLoginJourneyOptIn,
    selectedMerchantId,
  );
};

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
});
