#!/usr/bin/env node

import { spawn, spawnSync as nativeSpawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PID_DIR = join(ROOT, 'scripts', 'pids');
const LOG_DIR = join(ROOT, 'logs');
const LOCK_DIR = join(PID_DIR, '.lifecycle.lock');
const SERVICES = JSON.parse(readFileSync(join(ROOT, 'scripts', 'dev-services.json'), 'utf8')).services;

function parseArgs(argv) {
  const options = { cleanNext: true, preserveNext: false, timeout: 60, freshLogs: false, caddyValidate: false, caddyReload: false, force: false, nonStrict: false, service: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--clean-next' || arg === '--clean') options.cleanNext = true;
    else if (arg === '--preserve-next') { options.preserveNext = true; options.cleanNext = false; }
    else if (arg === '--fresh-logs' || arg === '--rotate-logs') options.freshLogs = true;
    else if (arg === '--caddy-validate' || arg === '--caddy') options.caddyValidate = true;
    else if (arg === '--caddy-reload') options.caddyReload = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--no-wait') options.timeout = 0;
    else if (arg === '--timeout') options.timeout = Number(argv[++i]);
    else if (arg === '--service') options.service = argv[++i];
    else if (arg === '--non-strict') options.nonStrict = true;
  }
  if (!Number.isFinite(options.timeout) || options.timeout < 0) throw new Error('--timeout must be a non-negative number.');
  if (options.service && !SERVICES.some((service) => service.name === options.service)) throw new Error(`Unknown service: ${options.service}`);
  return options;
}

function statePath(service) {
  return join(PID_DIR, `${service.name}.json`);
}

function readState(service) {
  try {
    return JSON.parse(readFileSync(statePath(service), 'utf8'));
  } catch {
    return null;
  }
}

function portOwner(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`]);
  const pid = Number(result.stdout.trim().split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function spawnSync(command, args) {
  const result = nativeSpawnSync(command, args, { encoding: 'utf8' });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

function processCommand(pid) {
  try {
    return spawnSync('ps', ['-p', String(pid), '-o', 'command=']).stdout.trim();
  } catch {
    return '';
  }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLock() {
  mkdirSync(PID_DIR, { recursive: true });
  try {
    mkdirSync(LOCK_DIR);
    writeFileSync(join(LOCK_DIR, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } catch {
    let owner = '';
    try { owner = readFileSync(join(LOCK_DIR, 'owner.json'), 'utf8'); } catch {}
    throw new Error(`Another lifecycle command holds ${LOCK_DIR}${owner ? ` (${owner})` : ''}.`);
  }
  return () => rmSync(LOCK_DIR, { recursive: true, force: true });
}

function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

async function fetchProbe(service) {
  const url = `http://127.0.0.1:${service.port}${service.probe}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    const body = await response.text();
    const expected = Array.isArray(service.expected) ? service.expected : [service.expected];
    const bodyOkay = !service.body || body.includes(service.body);
    return { okay: expected.includes(response.status) && bodyOkay, status: response.status, body, url };
  } catch (error) {
    return { okay: false, status: 0, body: error instanceof Error ? error.message : String(error), url };
  }
}

async function waitReady(service, timeoutSeconds) {
  if (timeoutSeconds === 0) return fetchProbe(service);
  const deadline = Date.now() + timeoutSeconds * 1000;
  let consecutive = 0;
  let last = null;
  while (Date.now() < deadline) {
    last = await fetchProbe(service);
    consecutive = last.okay ? consecutive + 1 : 0;
    if (consecutive >= 3) return last;
    await sleep(1000);
  }
  return last ?? { okay: false, status: 0, body: 'readiness timeout', url: `http://127.0.0.1:${service.port}${service.probe}` };
}

function serviceLog(service) { return join(LOG_DIR, `${service.name}.log`); }

function tail(path, count = 40) {
  try {
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    return lines.slice(-count).join('\n');
  } catch { return '(no log available)'; }
}

function cleanNext(services) {
  for (const service of services) {
    const path = join(ROOT, 'apps', service.name, '.next');
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      console.log(`  cleaned ${path}`);
    }
  }
}

function rotateLogs(services) {
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const archive = join(LOG_DIR, 'archive', stamp);
  mkdirSync(archive, { recursive: true });
  for (const service of services) {
    const path = serviceLog(service);
    if (existsSync(path)) {
      writeFileSync(join(archive, `${service.name}.log`), readFileSync(path));
      writeFileSync(path, `\n=== lifecycle run ${new Date().toISOString()} ===\n`);
    }
  }
  console.log(`  logs archived to ${archive}`);
}

async function stopService(service, options) {
  const state = readState(service);
  const owner = portOwner(service.port);
  if (!state && !owner) return true;
  if (state && state.managerPid && isAlive(state.managerPid)) {
    const command = processCommand(state.managerPid);
    if (!command.includes(service.name) && !options.force) {
      throw new Error(`${service.name}: refusing to stop PID ${state.managerPid}; command identity does not match.`);
    }
    try { process.kill(-state.managerPid, 'SIGTERM'); } catch { try { process.kill(state.managerPid, 'SIGTERM'); } catch {} }
  } else if (owner) {
    const command = processCommand(owner);
    if (!options.force) {
      throw new Error(`${service.name}: foreign or unmanaged listener PID ${owner} on port ${service.port} (${command}); refusing to kill it.`);
    }
    console.warn(`${service.name}: --force requested; terminating unmanaged listener PID ${owner}.`);
    try { process.kill(owner, 'SIGTERM'); } catch {}
  }

  const deadline = Date.now() + options.timeout * 1000;
  while (portOwner(service.port) && Date.now() < deadline) await sleep(250);
  const remaining = portOwner(service.port);
  if (remaining && options.force) {
    try { process.kill(remaining, 'SIGKILL'); } catch {}
    await sleep(500);
  }
  if (portOwner(service.port)) throw new Error(`${service.name}: listener remains on port ${service.port}.`);
  rmSync(statePath(service), { force: true });
  return true;
}

async function stopServices(services, options) {
  for (const service of [...services].reverse()) {
    await stopService(service, options);
    console.log(`  stopped ${service.name}`);
  }
}

async function startService(service, options) {
  const owner = portOwner(service.port);
  if (owner) throw new Error(`${service.name}: port ${service.port} is already occupied by PID ${owner}.`);
  mkdirSync(LOG_DIR, { recursive: true });
  writeFileSync(serviceLog(service), `\n=== lifecycle start ${new Date().toISOString()} ===\n`, { flag: 'a' });
  const logFd = openSync(serviceLog(service), 'a');
  const child = spawn('pnpm', ['--filter', service.name, 'dev'], { cwd: ROOT, detached: true, stdio: ['ignore', logFd, logFd] });
  closeSync(logFd);
  child.unref();
  writeFileSync(statePath(service), JSON.stringify({ managerPid: child.pid, package: service.name, port: service.port, startedAt: new Date().toISOString() }, null, 2));
  const result = await waitReady(service, options.timeout);
  if (!result.okay) {
    console.error(`\n${service.name} failed readiness (${result.status}) ${result.url}\n${tail(serviceLog(service))}`);
    await stopService(service, { ...options, force: true });
    throw new Error(`${service.name} did not become ready.`);
  }
  console.log(`  ready ${service.name} (${result.status})`);
}

async function startServices(services, options) {
  for (const service of services) await startService(service, options);
}

async function statusServices(services, strict) {
  let healthy = true;
  for (const service of services) {
    const state = readState(service);
    const owner = portOwner(service.port);
    const probe = await fetchProbe(service);
    const managed = state?.managerPid && owner && isAlive(state.managerPid) ? 'OWNED' : owner ? 'FOREIGN/STALE' : 'DOWN';
    if (!probe.okay || managed !== 'OWNED') healthy = false;
    console.log(`${managed.padEnd(12)} ${service.name.padEnd(20)} port=${service.port} http=${probe.status}`);
  }
  if (strict && !healthy) process.exitCode = 1;
}

async function caddy(options) {
  if (!options.caddyValidate && !options.caddyReload) return;
  const config = join(ROOT, 'Caddyfile');
  const result = spawnSync('caddy', ['validate', '--config', config, '--adapter', 'caddyfile']);
  if (result.status !== 0) throw new Error(`Caddy validation failed: ${result.stderr}`);
  console.log('  Caddyfile validated');
  if (options.caddyReload) {
    const reload = spawnSync('caddy', ['reload', '--config', config, '--adapter', 'caddyfile']);
    if (reload.status !== 0) throw new Error(`Caddy reload failed: ${reload.stderr}`);
    console.log('  Caddy reloaded');
  }
}

async function main() {
  const [command = 'status', ...argv] = process.argv.slice(2);
  const options = parseArgs(argv);
  const release = acquireLock();
  try {
    const services = options.service ? SERVICES.filter((service) => service.name === options.service) : SERVICES;
    if (command === 'stop') await stopServices(services, options);
    else if (command === 'start') {
      if (options.cleanNext) cleanNext(services);
      if (options.freshLogs) rotateLogs(services);
      await startServices(services, options);
      await caddy(options);
    } else if (command === 'restart') {
      await stopServices(services, options);
      if (options.cleanNext) cleanNext(services);
      if (options.freshLogs) rotateLogs(services);
      await startServices(services, options);
      await caddy(options);
    } else if (command === 'status') await statusServices(services, !options.nonStrict);
    else if (command === 'health') await statusServices(services, true);
    else throw new Error(`Unknown lifecycle command: ${command}`);
  } finally { release(); }
}

main().catch((error) => { console.error(`lifecycle: ${error.message}`); process.exitCode = 1; });
