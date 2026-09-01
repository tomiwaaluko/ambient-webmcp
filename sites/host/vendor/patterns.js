// GENERATED FILE - DO NOT EDIT.
// Copied verbatim from src/shared/ by scripts/sync-sites.mjs.
// Edit the source in src/shared/ and re-run: node scripts/sync-sites.mjs
/**
 * Named pattern sets consumed by the checker (and later by host screening/redaction).
 *
 * Detection is over known shapes. A missed attack still reaches the agent; a
 * matched string is filtered, not contained. Do not describe this module as
 * preventing prompt injection.
 *
 * Pattern sets are named here and referenced from rules/manifest.json — never
 * inlined in the manifest.
 */

/**
 * @typedef {{ source: string, regex: RegExp }} Pattern
 * @typedef {{ matched: boolean, source?: string }} PatternMatch
 */

/** @type {Record<string, Pattern[]>} */
export const PATTERN_SETS = {
  /**
   * Agent-directed instructions (W6, H4, R23).
   * Capability phrasing — including imperative verbs — is not a match.
   * Addressing the model to change its behavior is.
   */
  'agent-directed-instruction': [
    { source: 'ignore-previous-instructions', regex: /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b/i },
    { source: 'ignore-all-previous-instructions', regex: /\bignore\s+all\s+previous\s+instructions\b/i },
    { source: 'ignore-any-instructions', regex: /\bignore\s+any\s+instructions\b/i },
    { source: 'disregard-guidelines', regex: /\bdisregard\s+(?:your|the|prior|previous|all)\b/i },
    { source: 'you-are-now', regex: /\byou\s+are\s+now\b/i },
    { source: 'you-must-always', regex: /\byou\s+must\s+always\b/i },
    { source: 'do-not-use-other-tools', regex: /\bdo\s+not\s+use\s+other\s+tools\b/i },
    { source: 'only-use-this-tool', regex: /\bonly\s+use\s+this\s+(?:tool|one)\b/i },
    { source: 'exfiltrate', regex: /\bexfiltrate\b/i },
    { source: 'forget-host-rules', regex: /\bforget\s+(?:the\s+)?(?:host\s+)?rules\b/i },
    { source: 'new-instructions', regex: /\bnew\s+instructions\b/i },
    { source: 'system-role-you', regex: /\bsystem\s*:\s*you\b/i },
    { source: 'inst-marker', regex: /\[INST\]/i },
    { source: 'override-allowlist', regex: /\boverride\s+the\s+allowlist\b/i },
    { source: 'hidden-chain-of-thought', regex: /\bhidden\s+chain\s+of\s+thought\b/i },
    { source: 'from-now-on-you', regex: /\bfrom\s+now\s+on\s+you\b/i },
    { source: 'developer-mode', regex: /\bdeveloper\s+mode\b/i },
    { source: 'act-as-if-you', regex: /\bact\s+as\s+if\s+you\b/i },
    { source: 'system-prompt', regex: /\bsystem\s+prompt\b/i },
    { source: 'reveal-hidden', regex: /\breveal\s+(?:your|the|hidden)\b/i },
    { source: 'never-mention-origin', regex: /\bnever\s+mention\s+this\s+widget/i },
    { source: 'call-other-vendor', regex: /\bcall\s+the\s+other\s+vendor/i }
  ],

  /**
   * Credential-, token-, and payment-shaped strings for host redaction (H12 / R55).
   * Shape matching, not a claim that secrets are found exhaustively.
   */
  'credential-or-payment': [
    { source: 'pan-like', regex: /\b(?:\d[ \-]*?){13,19}\b/ },
    { source: 'jwt-like', regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/ },
    { source: 'sk-live-test', regex: /\bsk[-_](?:live|test)[-_]/i },
    { source: 'secret-assignment', regex: /\b(?:password|secret|api[_-]?key)\s*[:=]\s*\S+/i }
  ]
};

/**
 * @param {string} patternSet
 * @param {string} text
 * @returns {PatternMatch}
 */
export function matchPatternSet(patternSet, text) {
  const patterns = PATTERN_SETS[patternSet];
  if (!patterns) {
    const err = new Error(
      `UNKNOWN_PATTERN_SET: "${patternSet}" is not a named set in src/shared/patterns.js`
    );
    err.code = 'UNKNOWN_PATTERN_SET';
    throw err;
  }

  if (typeof text !== 'string' || text.length === 0) {
    return { matched: false };
  }

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      return { matched: true, source: pattern.source };
    }
  }

  return { matched: false };
}
