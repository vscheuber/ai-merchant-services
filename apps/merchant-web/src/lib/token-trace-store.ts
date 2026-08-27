import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { TokenTrace, TokenTraceStage } from '@acme/shared';

const TRACE_ROOT = process.env['TOKEN_TRACE_DIR'] ?? resolve(process.cwd(), '..', '..', 'logs', 'merchant-token-traces');
const SESSION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_STAGES = 256;

function assertTraceSessionId(traceSessionId: string): void {
  if (!SESSION_PATTERN.test(traceSessionId)) {
    throw new Error('Invalid token trace session identifier.');
  }
}

function sessionDirectory(traceSessionId: string): string {
  assertTraceSessionId(traceSessionId);
  return join(TRACE_ROOT, traceSessionId);
}

function stageKey(requestId: string, stage: TokenTraceStage): string {
  return `${requestId}:${stage.name}`;
}

function mergeTraceFragments(fragments: readonly TokenTrace[]): TokenTrace | null {
  if (fragments.length === 0) return null;
  const ordered = [...fragments].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  const latest = ordered[ordered.length - 1];
  if (!latest) return null;
  const first = ordered[0];
  if (!first) return null;
  const stages = new Map<string, TokenTraceStage>();
  for (const fragment of ordered) {
    for (const stage of fragment.stages) stages.set(stageKey(fragment.requestId, stage), stage);
  }
  return {
    traceSessionId: latest.traceSessionId,
    requestId: latest.requestId,
    source: latest.source,
    capturedAt: first.capturedAt,
    revision: ordered.length,
    updatedAt: latest.updatedAt ?? latest.capturedAt,
    stages: Array.from(stages.values()).slice(-MAX_STAGES),
  };
}

function readFragments(traceSessionId: string): TokenTrace[] {
  const directory = sessionDirectory(traceSessionId);
  try {
    return readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .flatMap((name) => {
        try {
          const fragment = JSON.parse(readFileSync(join(directory, name), 'utf8')) as TokenTrace;
          return fragment.traceSessionId === traceSessionId ? [fragment] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

/** Append a trace fragment without replacing other process/session writes. */
export function appendMerchantTokenTrace(trace: TokenTrace): TokenTrace {
  assertTraceSessionId(trace.traceSessionId);
  const directory = sessionDirectory(trace.traceSessionId);
  mkdirSync(directory, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.json`;
  const temporaryPath = join(directory, `.${fileName}.tmp`);
  const targetPath = join(directory, fileName);
  writeFileSync(temporaryPath, `${JSON.stringify(trace)}\n`, 'utf8');
  renameSync(temporaryPath, targetPath);
  return getMerchantTokenTrace(trace.traceSessionId) ?? trace;
}

export function getMerchantTokenTrace(traceSessionId: string): TokenTrace | null {
  return mergeTraceFragments(readFragments(traceSessionId));
}

export function clearMerchantTokenTrace(traceSessionId: string): void {
  rmSync(sessionDirectory(traceSessionId), { recursive: true, force: true });
}
