// GENERATED FILE - DO NOT EDIT.
// Copied from src/host/ by scripts/sync-sites.mjs (import paths adjusted for deployment).
// Edit the source in src/host/ and re-run: node scripts/sync-sites.mjs
/**
 * Per-origin conformance screening via the shared checker engine.
 */

import { evaluate } from '../vendor/engine.js';

/**
 * Widget mechanical rules the host can evaluate from getTools() descriptors alone.
 * W8 (attestation-present) is mechanical but not harvestable cross-origin at runtime;
 * attested (W2/W3/W9/W10) and observed (W4/W7) rules are never quarantine triggers here.
 */
const LIVE_QUARANTINE_RULE_IDS = new Set(['W1', 'W5', 'W6']);

/**
 * @param {{ ruleId: string, result: string }[]} results
 * @returns {{ ruleId: string, result: string, message: string }[]}
 */
function liveQuarantineFailures(results) {
  return results.filter(
    (row) => row.result === 'fail' && LIVE_QUARANTINE_RULE_IDS.has(row.ruleId)
  );
}

/**
 * @param {{ ruleId: string, message: string }[]} failures
 * @returns {{ ok: false, results: object[], reason: string, code: string }}
 */
function quarantineResult(results, failures) {
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
  const failures = liveQuarantineFailures(results);

  if (failures.length > 0) {
    return quarantineResult(results, failures);
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
