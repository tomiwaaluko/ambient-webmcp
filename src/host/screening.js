/**
 * Per-origin conformance screening via the shared checker engine.
 */

import { evaluate } from '../checker/engine.js';

/**
 * @param {{ manifest: object, tools: object[], origin: string, allowlist: Record<string, { vendorLabel: string, widgetId: string }> }} args
 * @returns {{ ok: true, results: object[] } | { ok: false, results: object[], reason: string, code: string }}
 */
export function screenOrigin({ manifest, tools, origin, allowlist }) {
  if (!allowlist[origin]) {
    return {
      ok: false,
      results: [],
      reason: `ORIGIN_NOT_ALLOWLISTED: origin ${origin} is not allowlisted.`,
      code: 'ORIGIN_NOT_ALLOWLISTED'
    };
  }

  const widgetResults = evaluate({
    manifest,
    subject: {
      role: 'widget',
      tools
    }
  });

  const results = widgetResults;
  const failures = results.filter((row) => row.result === 'fail');

  if (failures.length > 0) {
    const first = failures[0];
    const codeMatch = first.message.match(/^([A-Z_]+):/);
    const code = codeMatch ? codeMatch[1] : 'SCREENING_FAILED';
    return {
      ok: false,
      results,
      reason: first.message,
      code
    };
  }

  return { ok: true, results };
}

/**
 * Screen host-published proxy descriptors (post-envelope).
 *
 * @param {{ manifest: object, tools: object[], allowlist: Record<string, object> }} args
 * @returns {{ ok: true, results: object[] } | { ok: false, results: object[], reason: string, code: string }}
 */
export function screenPublished({ manifest, tools, allowlist }) {
  const allowlistEntries = Object.entries(allowlist).map(([origin, entry]) => ({
    origin,
    ...entry
  }));

  const results = evaluate({
    manifest,
    subject: {
      role: 'host',
      tools,
      allowlist: allowlistEntries
    }
  });

  const failures = results.filter((row) => row.result === 'fail');
  if (failures.length > 0) {
    const first = failures[0];
    const codeMatch = first.message.match(/^([A-Z_]+):/);
    const code = codeMatch ? codeMatch[1] : 'SCREENING_FAILED';
    return {
      ok: false,
      results,
      reason: first.message,
      code
    };
  }

  return { ok: true, results };
}
