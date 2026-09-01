/**
 * Rebuild agent-visible strings into host-authored envelopes.
 *
 * Widget text is extracted, redacted, truncated to Chrome budgets, and written
 * into a host template. Text that will not fit is dropped, not passed through.
 */

import { redact } from './redact.js';

/** Chrome recommended budgets — basis for R48/R49. */
export const CHROME_BUDGETS = Object.freeze({
  name: 30,
  description: 500,
  paramDescription: 150,
  result: 1500
});

/**
 * @param {string} origin
 * @param {string} body
 * @returns {string}
 */
function envelopeTemplate(origin, body) {
  return `[Third-party data from ${origin}] ${body} [/Third-party]`;
}

/**
 * @param {string} origin
 * @param {number} budget
 * @returns {number}
 */
function maxBodyLength(origin, budget) {
  const shell = envelopeTemplate(origin, '');
  return Math.max(0, budget - shell.length);
}

/**
 * @param {string} origin
 * @param {string} body
 * @param {number} budget
 * @returns {string}
 */
function fitBody(origin, body, budget) {
  let trimmed = body;
  let text = envelopeTemplate(origin, trimmed);
  while (text.length > budget && trimmed.length > 0) {
    trimmed = trimmed.slice(0, trimmed.length - 1);
    text = envelopeTemplate(origin, trimmed);
  }
  if (text.length > budget) {
    return envelopeTemplate(origin, '');
  }
  return text;
}

/**
 * @param {{ origin: string, kind: 'description' | 'paramDescription' | 'enumValue' | 'result', value: string }} args
 * @returns {{ ok: true, text: string } | { ok: false, code: string, message: string }}
 */
export function buildEnvelope({ origin, kind, value }) {
  if (!origin || typeof origin !== 'string') {
    return {
      ok: false,
      code: 'ENVELOPE_ORIGIN_REQUIRED',
      message: 'An envelope requires the contributing origin.'
    };
  }
  if (typeof value !== 'string') {
    return {
      ok: false,
      code: 'ENVELOPE_VALUE_REQUIRED',
      message: 'Envelope input must be a string.'
    };
  }

  const budget = CHROME_BUDGETS[kind];
  if (!budget) {
    return {
      ok: false,
      code: 'ENVELOPE_KIND_UNKNOWN',
      message: `Unknown envelope kind "${kind}".`
    };
  }

  const { text: redacted } = redact(value);
  const allowedBody = maxBodyLength(origin, budget);
  const body = allowedBody === 0 ? '' : redacted.slice(0, allowedBody);
  const text = fitBody(origin, body, budget);

  return { ok: true, text };
}

/**
 * @param {{ origin: string, code: string, message: string }} args
 * @returns {{ text: string }}
 */
export function buildFailureEnvelope({ origin, code, message }) {
  const raw = `Execution failed (${code}): ${message}`;
  const built = buildEnvelope({ origin, kind: 'result', value: raw });
  if (built.ok) {
    return { text: built.text };
  }
  const fallback = envelopeTemplate(origin ?? 'unknown', raw.slice(0, CHROME_BUDGETS.result));
  return { text: fallback.slice(0, CHROME_BUDGETS.result) };
}
