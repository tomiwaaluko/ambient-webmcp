// GENERATED FILE - DO NOT EDIT.
// Copied from src/host/ by scripts/sync-sites.mjs (import paths adjusted for deployment).
// Edit the source in src/host/ and re-run: node scripts/sync-sites.mjs
/**
 * Redact credential-, token-, and payment-shaped strings before envelopes or logs.
 *
 * Shape matching lowers exposure; it is not exhaustive secret detection.
 */

import { PATTERN_SETS } from '../vendor/patterns.js';

const REPLACEMENT = '[redacted]';

/**
 * @param {string} text
 * @returns {{ text: string, redactions: Array<{ kind: string, count: number }> }}
 */
export function redact(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { text: typeof text === 'string' ? text : '', redactions: [] };
  }

  let output = text;
  /** @type {Map<string, number>} */
  const counts = new Map();

  for (const pattern of PATTERN_SETS['credential-or-payment']) {
    pattern.regex.lastIndex = 0;
    const matches = output.match(new RegExp(pattern.regex.source, pattern.regex.flags.includes('g') ? pattern.regex.flags : `${pattern.regex.flags}g`));
    if (!matches || matches.length === 0) continue;

    counts.set(pattern.source, (counts.get(pattern.source) ?? 0) + matches.length);
    pattern.regex.lastIndex = 0;
    output = output.replace(pattern.regex, REPLACEMENT);
  }

  const redactions = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return { text: output, redactions };
}
