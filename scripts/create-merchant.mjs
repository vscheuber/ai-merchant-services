#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const DEFAULT_CONFIG_DIR = resolve(process.cwd(), 'config/merchants');
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const HSL_PATTERN = /^\d{1,3} \d{1,3}% \d{1,3}%$/;

function parseArgs(argv) {
  const values = { domains: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    if (key === 'dry-run' || key === 'force' || key === 'non-interactive') {
      values[key] = true;
      continue;
    }
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`Missing value for --${key}.`);
    if (key === 'domain') values.domains.push(value);
    else values[key] = value;
  }
  return values;
}

function validate(values) {
  if (!values.id || !ID_PATTERN.test(values.id)) {
    throw new Error('Merchant id must match [a-z][a-z0-9-]*.');
  }
  if (!values.brand) throw new Error('--brand is required.');
  if (!values.tagline) throw new Error('--tagline is required.');
  if (!values.domains.length) throw new Error('At least one --domain is required.');
  for (const domain of values.domains) {
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(domain)) {
      throw new Error(`Invalid domain: ${domain}`);
    }
  }
  if (values.primary && !HSL_PATTERN.test(values.primary)) {
    throw new Error('--primary must be an HSL triple such as "215 82% 53%".');
  }
  if (values.logo && !existsSync(resolve(values.logo))) {
    throw new Error(`Logo file does not exist: ${values.logo}`);
  }
}

async function promptMissing(values) {
  const rl = createInterface({ input, output });
  try {
    const ask = async (key, message, fallback) => {
      if (!values[key]) values[key] = (await rl.question(`${message}${fallback ? ` [${fallback}]` : ''}: `)) || fallback;
    };
    await ask('id', 'Canonical merchant id');
    await ask('brand', 'Brand/display name');
    await ask('tagline', 'Tagline', 'Everyday goods, thoughtfully chosen');
    if (!values.domains.length) values.domains = [(await rl.question('Primary domain: ')).trim()];
    await ask('assistant-name', 'Assistant name', `${values.brand} Assistant`);
    await ask('primary', 'Primary HSL color', '215 82% 53%');
    await ask('catalog', 'Catalog merchant id', values.id);
  } finally {
    rl.close();
  }
  return values;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function makeDefinition(values) {
  return {
    schemaVersion: 1,
    id: values.id,
    name: values.brand,
    brand: values.brand,
    tagline: values.tagline,
    domains: values.domains,
    assistantName: values['assistant-name'] ?? `${values.brand} Assistant`,
    catalogMerchantId: values.catalog ?? values.id,
    logoAsset: values.logo ? 'assets/logo' + (basename(values.logo).match(/\.[^.]+$/)?.[0] ?? '.svg') : undefined,
    onboarding: {
      status: 'draft',
      merchantOidcClientId: values['oidc-client-id'] ?? `merchant-web-${values.id}`,
      callbackPath: '/api/auth/callback/aic',
    },
  };
}

function makeTheme(values) {
  const primary = values.primary ?? '215 82% 53%';
  return {
    light: {
      background: '0 0% 100%', foreground: '222 47% 11%', card: '0 0% 100%', cardForeground: '222 47% 11%',
      primary, primaryForeground: '0 0% 100%', secondary: '214 32% 96%', secondaryForeground: '222 47% 11%',
      muted: '214 32% 96%', mutedForeground: '215 16% 47%', accent: '214 95% 93%', accentForeground: '215 82% 32%',
      border: '214 25% 88%', input: '214 25% 88%', ring: primary, destructive: '0 72% 51%', destructiveForeground: '0 0% 100%',
    },
    dark: {
      background: '222 47% 7%', foreground: '210 40% 98%', card: '222 43% 10%', cardForeground: '210 40% 98%',
      primary: '213 94% 68%', primaryForeground: '222 47% 11%', secondary: '217 33% 17%', secondaryForeground: '210 40% 98%',
      muted: '217 33% 17%', mutedForeground: '215 20% 65%', accent: '217 33% 22%', accentForeground: '213 94% 82%',
      border: '217 33% 22%', input: '217 33% 22%', ring: '213 94% 68%', destructive: '0 63% 42%', destructiveForeground: '210 40% 98%',
    },
    radius: '0.65rem',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  };
}

function writePlan(values, configDir) {
  const target = join(configDir, values.id);
  const files = [
    join(target, 'definition.json'),
    join(target, 'theme.json'),
    join(target, 'onboarding.json'),
  ];
  if (values.logo) files.push(join(target, 'assets', basename(values.logo)));
  console.log(JSON.stringify({ target, files, dryRun: Boolean(values['dry-run']) }, null, 2));
  if (values['dry-run']) return;
  if (existsSync(target) && !values.force) throw new Error(`Merchant already exists: ${target}. Use --force to replace it.`);
  const temp = join(configDir, `.${values.id}.tmp-${process.pid}`);
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(join(temp, 'assets'), { recursive: true });
  writeFile(join(temp, 'definition.json'), makeDefinition(values));
  writeFile(join(temp, 'theme.json'), makeTheme(values));
  writeFile(join(temp, 'onboarding.json'), { status: 'draft', merchantId: values.id, issuer: '', redirectUris: values.domains.map((domain) => `https://${domain}/api/auth/callback/aic`) });
  if (values.logo) cpSync(resolve(values.logo), join(temp, 'assets', basename(values.logo)));
  mkdirSync(configDir, { recursive: true });
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  renameSync(temp, target);
  console.log(`Created ${target}. Complete onboarding.json, then run the AIC provisioner dry-run.`);
}

function writeFile(path, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf8');
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  try {
    if (!values['non-interactive']) await promptMissing(values);
    validate(values);
    writePlan(values, resolve(values['config-dir'] ?? DEFAULT_CONFIG_DIR));
  } catch (error) {
    console.error(`create-merchant: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

await main();
