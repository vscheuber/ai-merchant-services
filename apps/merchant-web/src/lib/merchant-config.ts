import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import type {
  MerchantStorefrontConfig,
  StorefrontThemeTokens,
} from '../config/merchant';

const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const HSL_PATTERN = /^\d{1,3} \d{1,3}% \d{1,3}%$/;
const DEFAULT_CONFIG_DIR = resolve(process.cwd(), '..', '..', 'config', 'merchants');

interface RegistryEntry {
  id: string;
  enabled: boolean;
  definition: string;
  theme: string;
}

interface DefinitionFile {
  schemaVersion: number;
  id: string;
  name: string;
  brand: string;
  tagline: string;
  domains: string[];
  assistantName: string;
  catalogMerchantId: string;
  logoAsset?: string;
  onboarding?: { status?: 'draft' | 'ready' | 'disabled' };
}

interface ThemeFile {
  light: StorefrontThemeTokens;
  dark: StorefrontThemeTokens;
  radius: string;
  fontFamily: string;
}

function assertSafeId(value: string, label: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(`${label} must match [a-z][a-z0-9-]*.`);
}

function assertThemeTokens(tokens: StorefrontThemeTokens, label: string): void {
  for (const [key, value] of Object.entries(tokens)) {
    if (typeof value !== 'string' || !HSL_PATTERN.test(value)) {
      throw new Error(`${label}.${key} must be an HSL triple.`);
    }
  }
}

function assertInsideRoot(root: string, candidate: string): string {
  const resolved = resolve(root, candidate);
  const rel = relative(root, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Merchant config path escapes config root.');
  return resolved;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function loadMerchantConfig(): Promise<MerchantStorefrontConfig> {
  const merchantId = process.env['MERCHANT_ID'];
  const configDir = resolve(process.env['MERCHANT_CONFIG_DIR'] ?? DEFAULT_CONFIG_DIR);
  if (!merchantId) throw new Error('MERCHANT_ID is required for merchant-web.');
  if (!process.env['MERCHANT_CONFIG_DIR']) throw new Error('MERCHANT_CONFIG_DIR is required for merchant-web.');
  assertSafeId(merchantId, 'MERCHANT_ID');

  const registry = await readJson<RegistryEntry[]>(join(configDir, 'registry.json'));
  const entry = registry.find((candidate) => candidate.id === merchantId);
  if (!entry || !entry.enabled) throw new Error(`Merchant definition is unavailable: ${merchantId}.`);

  const definition = await readJson<DefinitionFile>(assertInsideRoot(configDir, entry.definition));
  const theme = await readJson<ThemeFile>(assertInsideRoot(configDir, entry.theme));
  const onboardingPath = join(configDir, merchantId, 'onboarding.json');
  const onboarding = await readJson<{ status?: 'draft' | 'ready' | 'disabled'; issuer?: string; redirectUris?: string[] }>(onboardingPath);
  if (definition.schemaVersion !== 1 || definition.id !== merchantId) throw new Error('Merchant definition schema or id is invalid.');
  if (onboarding.status !== 'ready') throw new Error(`Merchant onboarding is not ready: ${merchantId}.`);
  if (!onboarding.issuer || onboarding.issuer.includes('example')) throw new Error(`Merchant onboarding issuer is incomplete: ${merchantId}.`);
  if (!Array.isArray(onboarding.redirectUris) || onboarding.redirectUris.length === 0) throw new Error(`Merchant onboarding redirectUris are incomplete: ${merchantId}.`);
  assertSafeId(definition.catalogMerchantId, 'catalogMerchantId');
  assertThemeTokens(theme.light, 'theme.light');
  assertThemeTokens(theme.dark, 'theme.dark');
  if (!/^\d+(\.\d+)?rem$/.test(theme.radius)) throw new Error('Theme radius must be expressed in rem.');
  if (!/^[\w\s,.-]+$/.test(theme.fontFamily)) throw new Error('Theme fontFamily contains unsupported characters.');

  const logoUrl = definition.logoAsset
    ? `/merchant-assets/${encodeURIComponent(merchantId)}/${encodeURIComponent(definition.logoAsset.split('/').pop() ?? '')}`
    : undefined;
  return {
    merchantId,
    brand: definition.brand,
    tagline: definition.tagline,
    domains: definition.domains,
    logoUrl,
    assistantName: definition.assistantName,
    catalog: { merchantId: definition.catalogMerchantId },
    theme,
    onboardingStatus: onboarding.status,
  };
}
