// GENERATED FILE - DO NOT EDIT.
// Copied from src/host/ by scripts/sync-sites.mjs (import paths adjusted for deployment).
// Edit the source in src/host/ and re-run: node scripts/sync-sites.mjs
/**
 * Resource bounds — Chrome budgets plus thresholds Chrome does not supply.
 *
 * Threshold reasoning (U9 / R47–R52):
 * - MAX_TOOLS_PER_ORIGIN = 16: demo vendors expose at most four tools; sixteen is
 *   fourfold headroom before one origin can dominate the default surface.
 * - MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN = 4: typical agent batches stay small;
 *   four in-flight calls cap runaway parallelism without blocking normal use.
 * - MAX_SURFACE_CHANGES_PER_MINUTE = 12: toolchange carries no payload (spike Q4);
 *   more than twelve surface changes per minute implies churn beyond normal lifecycle.
 */

import { CHROME_BUDGETS } from './envelope.js';

export { CHROME_BUDGETS };

export const MAX_TOOLS_PER_ORIGIN = 16;
export const MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN = 4;
export const MAX_SURFACE_CHANGES_PER_MINUTE = 12;
export const SURFACE_CHANGE_WINDOW_MS = 60_000;

/**
 * @param {number} toolCount
 * @returns {{ ok: true } | { ok: false, code: string, message: string, bound: string }}
 */
export function checkToolCountBound(toolCount) {
  if (toolCount > MAX_TOOLS_PER_ORIGIN) {
    return {
      ok: false,
      code: 'BOUND_EXCEEDED_TOOL_COUNT',
      message: `Origin offered ${toolCount} tools; the limit is ${MAX_TOOLS_PER_ORIGIN}.`,
      bound: 'toolCount'
    };
  }
  return { ok: true };
}

/**
 * @param {number} metadataLength
 * @param {keyof typeof CHROME_BUDGETS} field
 * @returns {{ ok: true } | { ok: false, code: string, message: string, bound: string }}
 */
export function checkMetadataBound(metadataLength, field) {
  const limit = CHROME_BUDGETS[field];
  if (metadataLength > limit) {
    return {
      ok: false,
      code: 'BOUND_EXCEEDED_METADATA',
      message: `${field} is ${metadataLength} characters; the Chrome budget is ${limit}.`,
      bound: 'metadataSize'
    };
  }
  return { ok: true };
}

/**
 * @param {number} resultLength
 * @returns {{ ok: true } | { ok: false, code: string, message: string, bound: string }}
 */
export function checkResultSizeBound(resultLength) {
  const limit = CHROME_BUDGETS.result;
  if (resultLength > limit) {
    return {
      ok: false,
      code: 'BOUND_EXCEEDED_RESULT_SIZE',
      message: `Result is ${resultLength} characters; the Chrome budget is ${limit}.`,
      bound: 'resultSize'
    };
  }
  return { ok: true };
}

/**
 * @param {number[]} changeTimestamps ms epoch values within the rolling window
 * @param {number} [now]
 * @returns {{ ok: true } | { ok: false, code: string, message: string, bound: string }}
 */
export function checkSurfaceChangeRateBound(changeTimestamps, now = Date.now()) {
  const recent = changeTimestamps.filter((t) => now - t <= SURFACE_CHANGE_WINDOW_MS);
  if (recent.length > MAX_SURFACE_CHANGES_PER_MINUTE) {
    return {
      ok: false,
      code: 'BOUND_EXCEEDED_SURFACE_CHANGE_RATE',
      message: `Origin changed its surface ${recent.length} times in ${SURFACE_CHANGE_WINDOW_MS / 1000}s; the limit is ${MAX_SURFACE_CHANGES_PER_MINUTE}.`,
      bound: 'surfaceChangeRate'
    };
  }
  return { ok: true };
}

/**
 * @param {number} activeExecutions
 * @returns {{ ok: true } | { ok: false, code: string, message: string, bound: string }}
 */
export function checkConcurrencyBound(activeExecutions) {
  if (activeExecutions >= MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN) {
    return {
      ok: false,
      code: 'BOUND_EXCEEDED_CONCURRENCY',
      message: `Origin already has ${activeExecutions} in-flight executions; the limit is ${MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN}.`,
      bound: 'concurrentExecutions'
    };
  }
  return { ok: true };
}
