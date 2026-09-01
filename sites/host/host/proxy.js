// GENERATED FILE - DO NOT EDIT.
// Copied from src/host/ by scripts/sync-sites.mjs (import paths adjusted for deployment).
// Edit the source in src/host/ and re-run: node scripts/sync-sites.mjs
/**
 * Proxy execution — timeout, concurrency, failure envelopes, late-result drops.
 *
 * Aborting a registration does not cancel an in-flight side effect; late results
 * are dropped and recorded rather than forwarded.
 */

import { executeToolCompat } from '../vendor/adapter.js';
import { buildFailureEnvelope, buildEnvelope, CHROME_BUDGETS } from './envelope.js';
import { checkResultSizeBound } from './bounds.js';

/** @typedef {{ kind: 'timeout'|'revocation'|'late-result', code: string, message: string, at: number }} DropRecord */

/**
 * @param {object} args
 * @param {object} args.sourceTool RegisteredTool handle
 * @param {unknown} args.input
 * @param {string} args.origin
 * @param {number} [args.timeoutMs]
 * @param {() => boolean} [args.isRevoked]
 * @param {() => boolean} [args.isUnavailable]
 * @param {{ tryAcquire: () => boolean, release: () => void }} [args.concurrencyGate]
 * @param {typeof executeToolCompat} [args.executeFn]
 * @param {(record: DropRecord) => void} [args.onDrop]
 * @returns {Promise<{ ok: true, result: unknown } | { ok: false, text: string, code: string }>}
 */
export async function executeProxy({
  sourceTool,
  input,
  origin,
  timeoutMs = 30_000,
  isRevoked = () => false,
  isUnavailable = () => false,
  concurrencyGate,
  executeFn = executeToolCompat,
  onDrop
}) {
  if (isUnavailable()) {
    return failure(origin, 'TOOL_HANDLE_INVALID', 'The source widget tool is no longer available.');
  }

  if (isRevoked()) {
    return failure(origin, 'RESULT_AFTER_REVOCATION', 'This origin was revoked before execution started.');
  }

  if (concurrencyGate && !concurrencyGate.tryAcquire()) {
    return failure(
      origin,
      'BOUND_EXCEEDED_CONCURRENCY',
      'Too many concurrent executions for this origin.'
    );
  }

  let settled = false;
  let timedOut = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  try {
    const execution = executeFn(sourceTool, input);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(Object.assign(new Error('EXECUTION_TIMEOUT'), { code: 'EXECUTION_TIMEOUT' }));
      }, timeoutMs);
    });

    let outcome;
    try {
      outcome = await Promise.race([execution, timeoutPromise]);
    } catch (cause) {
      if (timedOut) {
        execution
          .then((late) => {
            if (late && !settled) {
              onDrop?.({
                kind: 'late-result',
                code: 'EXECUTION_TIMEOUT',
                message: 'Result arrived after timeout; dropped, not forwarded.',
                at: Date.now()
              });
            }
          })
          .catch(() => {});
        return failure(origin, 'EXECUTION_TIMEOUT', 'Execution exceeded the configured timeout.');
      }
      const code = cause && cause.code ? String(cause.code) : 'EXECUTION_ERROR';
      return failure(origin, code, String(cause && cause.message ? cause.message : cause));
    } finally {
      if (timer) clearTimeout(timer);
    }

    settled = true;

    if (isRevoked()) {
      onDrop?.({
        kind: 'revocation',
        code: 'RESULT_AFTER_REVOCATION',
        message: 'Result arrived after revocation; dropped, not forwarded.',
        at: Date.now()
      });
      return failure(
        origin,
        'RESULT_AFTER_REVOCATION',
        'Execution finished after this origin was revoked; result discarded.'
      );
    }

    if (!outcome.ok) {
      return failure(origin, outcome.code, outcome.message);
    }

    const serialized =
      typeof outcome.result === 'string' ? outcome.result : JSON.stringify(outcome.result ?? {});
    const sizeCheck = checkResultSizeBound(serialized.length);
    if (!sizeCheck.ok) {
      return failure(origin, sizeCheck.code, sizeCheck.message);
    }

    const enveloped = envelopeResult(origin, outcome.result);
    return { ok: true, result: enveloped };
  } finally {
    concurrencyGate?.release();
  }
}

/**
 * @param {string} origin
 * @param {unknown} result
 * @returns {unknown}
 */
function envelopeResult(origin, result) {
  if (result && typeof result === 'object' && Array.isArray(result.content)) {
    const content = result.content.map((item) => {
      if (item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string') {
        const built = buildEnvelope({ origin, kind: 'result', value: item.text });
        return { ...item, text: built.ok ? built.text : item.text.slice(0, CHROME_BUDGETS.result) };
      }
      return item;
    });
    return { ...result, content };
  }

  if (typeof result === 'string') {
    const built = buildEnvelope({ origin, kind: 'result', value: result });
    return built.ok ? built.text : result.slice(0, CHROME_BUDGETS.result);
  }

  return result;
}

/**
 * @param {string} origin
 * @param {string} code
 * @param {string} message
 * @returns {{ ok: false, text: string, code: string }}
 */
function failure(origin, code, message) {
  const { text } = buildFailureEnvelope({ origin, code, message });
  return { ok: false, text, code };
}

/**
 * @param {number} limit
 * @returns {{ tryAcquire: () => boolean, release: () => void, active: () => number }}
 */
export function createConcurrencyGate(limit) {
  let active = 0;
  return {
    tryAcquire() {
      if (active >= limit) return false;
      active += 1;
      return true;
    },
    release() {
      active = Math.max(0, active - 1);
    },
    active() {
      return active;
    }
  };
}
