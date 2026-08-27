#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const CADDYFILE = join(ROOT, 'Caddyfile');
const DATA_DIR = join(ROOT, '.caddy-data');
const STATE_PATH = join(DATA_DIR, 'caddy.json');
const PID_PATH = join(DATA_DIR, 'caddy.pid');
const ADMIN_ADDRESS = 'localhost:2019';
const HTTPS_PROBES = ['https://northwind.mytest.run/', 'https://payments.mytestrun.com/chatbot/'];

function run(args) {
  return spawnSync('caddy', args, { cwd: ROOT, encoding: 'utf8' });
}

function shell(command, args) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
}

function validate() {
  const result = run(['validate', '--config', CADDYFILE, '--adapter', 'caddyfile']);
  if (result.status !== 0) throw new Error(`Caddyfile validation failed: ${result.stderr.trim()}`);
}

function state() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return null; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function processCommand(pid) {
  return shell('ps', ['-p', String(pid), '-o', 'command=']).stdout.trim();
}

function processCwd(pid) {
  const output = shell('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).stdout;
  const line = output.split('\n').find((entry) => entry.startsWith('n'));
  return line?.slice(1) ?? '';
}

function adminOwner() {
  const output = shell('lsof', ['-nP', '-ti', `tcp:${ADMIN_ADDRESS.split(':')[1]}`]).stdout.trim();
  const pid = Number(output.split(/\s+/)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isRepositoryCaddy(pid) {
  if (!pid || !alive(pid)) return false;
  const command = processCommand(pid);
  const cwd = processCwd(pid);
  const configMatches = command.includes(`--config ${CADDYFILE}`) || command.includes('--config Caddyfile');
  return command.startsWith('caddy ') && configMatches && command.includes('--adapter caddyfile') && cwd === ROOT;
}

function reconcileOwnership() {
  const saved = state();
  if (saved?.pid && isRepositoryCaddy(saved.pid)) {
    return { pid: saved.pid, mode: 'managed' };
  }
  const discoveredPid = adminOwner();
  if (discoveredPid && isRepositoryCaddy(discoveredPid)) {
    writeState(discoveredPid, 'adopted');
    return { pid: discoveredPid, mode: 'adopted' };
  }
  if (discoveredPid && alive(discoveredPid)) {
    return { pid: discoveredPid, mode: 'foreign' };
  }
  return { pid: null, mode: saved?.pid ? 'stale' : 'down' };
}

function writeState(pid, mode = 'managed') {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PID_PATH, `${pid}\n`);
  writeFileSync(STATE_PATH, JSON.stringify({ pid, config: CADDYFILE, mode, updatedAt: new Date().toISOString() }, null, 2));
}

function adminProbe() {
  return shell('curl', ['--silent', '--show-error', '--fail', '--max-time', '5', `http://${ADMIN_ADDRESS}/config/`]);
}

function httpsProbe(url) {
  return shell('curl', ['--silent', '--show-error', '--fail', '--insecure', '--max-time', '10', '-o', '/dev/null', '-w', '%{http_code}', url]);
}

function assertHealthy(ownership) {
  if (!ownership.pid) throw new Error(`Caddy ${ownership.mode}: no matching repository-owned process found.`);
  if (ownership.mode === 'foreign') throw new Error(`Caddy foreign/unmanaged listener PID ${ownership.pid}; refusing to adopt or stop it.`);
  const admin = adminProbe();
  if (admin.status !== 0) throw new Error(`Caddy admin endpoint is not ready: ${admin.stderr.trim()}`);
  const failed = HTTPS_PROBES.find((url) => {
    const probe = httpsProbe(url);
    return probe.status !== 0 || !/^(2|3)\d\d$/.test(probe.stdout.trim());
  });
  if (failed) throw new Error(`Caddy HTTPS probe failed: ${failed}`);
}

function parseCommand(argv) {
  const [command = 'status', ...rest] = argv;
  return { command, force: rest.includes('--force') };
}

async function waitForHealthy(ownership, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'not ready';
  while (Date.now() < deadline) {
    try {
      assertHealthy(ownership);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw new Error(lastError);
}

async function start() {
  validate();
  const existing = reconcileOwnership();
  if (existing.mode === 'foreign') throw new Error(`Caddy foreign/unmanaged listener PID ${existing.pid}; refusing to start a second instance.`);
  if (existing.pid) {
    await waitForHealthy(existing);
    console.log(`Caddy ${existing.mode} (PID ${existing.pid}).`);
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn('caddy', [
    'run', '--config', CADDYFILE, '--adapter', 'caddyfile',
    '--data-dir', DATA_DIR, '--config-dir', DATA_DIR,
    '--pidfile', PID_PATH,
  ], { cwd: ROOT, detached: true, stdio: 'ignore' });
  child.unref();
  const ownership = { pid: child.pid, mode: 'managed' };
  try {
    await waitForHealthy(ownership);
    writeState(child.pid, 'managed');
    console.log(`Caddy started (PID ${child.pid}).`);
  } catch (error) {
    if (child.pid && alive(child.pid)) {
      try { process.kill(child.pid, 'SIGTERM'); } catch {}
    }
    rmSync(STATE_PATH, { force: true });
    rmSync(PID_PATH, { force: true });
    throw error;
  }
}

async function status() {
  const ownership = reconcileOwnership();
  await waitForHealthy(ownership, 2000);
  console.log(`Caddy ${ownership.mode} (PID ${ownership.pid}), admin and HTTPS probes ready.`);
}

async function reload() {
  validate();
  const ownership = reconcileOwnership();
  if (ownership.mode === 'foreign') throw new Error(`Caddy foreign/unmanaged listener PID ${ownership.pid}; refusing to reload it.`);
  await waitForHealthy(ownership);
  const result = run(['reload', '--config', CADDYFILE, '--adapter', 'caddyfile', '--address', ADMIN_ADDRESS]);
  if (result.status !== 0) throw new Error(`Caddy reload failed: ${result.stderr.trim()}`);
  await waitForHealthy(ownership);
  console.log(`Caddy reloaded (PID ${ownership.pid}).`);
}

async function stop(force) {
  const ownership = reconcileOwnership();
  if (!ownership.pid) {
    rmSync(STATE_PATH, { force: true });
    rmSync(PID_PATH, { force: true });
    console.log('Caddy already stopped.');
    return;
  }
  if (ownership.mode === 'foreign' && !force) throw new Error(`Caddy foreign/unmanaged listener PID ${ownership.pid}; refusing to stop it.`);
  if (ownership.mode === 'foreign') console.warn(`--force requested; stopping Caddy PID ${ownership.pid}.`);
  try { process.kill(ownership.pid, 'SIGTERM'); } catch (error) { if (!force) throw error; }
  const deadline = Date.now() + 10000;
  while (alive(ownership.pid) && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  if (alive(ownership.pid)) throw new Error(`Caddy PID ${ownership.pid} did not stop.`);
  rmSync(STATE_PATH, { force: true });
  rmSync(PID_PATH, { force: true });
  console.log(`Caddy stopped (PID ${ownership.pid}).`);
}

const { command, force } = parseCommand(process.argv.slice(2));
try {
  if (command === 'start') await start();
  else if (command === 'status') await status();
  else if (command === 'reload') await reload();
  else if (command === 'stop') await stop(force);
  else throw new Error(`Unknown Caddy command: ${command}`);
} catch (error) {
  console.error(`caddy-lifecycle: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
