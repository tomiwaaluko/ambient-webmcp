// GENERATED FILE - DO NOT EDIT.
// Copied verbatim from src/widget/ by scripts/sync-sites.mjs.
// Edit the source in src/widget/ and re-run: node scripts/sync-sites.mjs
/**
 * Machine-readable widget attestation (R37 / W8).
 *
 * Covers obligations the registered tool surface cannot reveal. Rule ids and
 * claim keys match rules/manifest.json attested-class widget rules W2, W3,
 * W9, W10. W4 (read-only truthfulness) is observed — not attested here.
 */

/**
 * Attested-class rule ids from rules/manifest.json (widget role, evidence: attested).
 * @type {readonly string[]}
 */
export const ATTESTED_RULE_IDS = Object.freeze(['W2', 'W3', 'W9', 'W10']);

/** Claim keys the checker reads via attestation-claim predicates (manifest notes.attestationClaims). */
export const ATTESTATION_CLAIM_KEYS = Object.freeze([
  'exposedToScoped',
  'untrustedContentMarked',
  'authorizationEnforced',
  'noSensitiveValues'
]);

/** @type {object | null} latest attestation emitted for this document */
let currentAttestation = null;

/**
 * Build an attestation manifest for a widget surface.
 *
 * @param {object} opts
 * @param {string} opts.widgetId
 * @param {string} opts.origin document origin serving the attestation
 * @returns {{ widgetId: string, origin: string, version: 1, attestedRules: string[], claims: object }}
 */
export function buildAttestation({ widgetId, origin }) {
  return {
    widgetId,
    origin,
    version: 1,
    attestedRules: [...ATTESTED_RULE_IDS],
    claims: {
      exposedToScoped: {
        statement:
          'exposedTo lists concrete HTTPS host origins only; wildcard entries are refused at registration.',
        enforcedBy: 'registerConformantTool'
      },
      untrustedContentMarked: {
        statement:
          'Tools returning content the widget did not author are registered with untrustedContentHint.',
        enforcedBy: 'vendor'
      },
      authorizationEnforced: {
        statement:
          'Mutating tools invoke an authorization callback before any side effect; the registered execute handle cannot bypass it.',
        enforcedBy: 'registerConformantTool'
      },
      noSensitiveValues: {
        statement:
          'Tools neither accept nor return credentials, secrets, tokens, or payment instrument numbers.',
        enforcedBy: 'vendor'
      }
    }
  };
}

/**
 * Publish attestation for checker consumption and return it.
 *
 * @param {object} opts
 * @param {string} opts.widgetId
 * @param {string} [opts.origin]
 * @returns {object}
 */
export function publishAttestation({ widgetId, origin }) {
  const resolvedOrigin =
    origin ?? (typeof location !== 'undefined' ? location.origin : 'unknown');
  currentAttestation = buildAttestation({ widgetId, origin: resolvedOrigin });

  if (typeof globalThis !== 'undefined') {
    globalThis.__ambientWidgetAttestation = currentAttestation;
  }

  return currentAttestation;
}

/**
 * Return the latest attestation for this document, if any.
 * @returns {object | null}
 */
export function getAttestation() {
  return currentAttestation;
}

/**
 * Clear attestation state. For tests only.
 * @returns {void}
 */
export function resetAttestation() {
  currentAttestation = null;
  if (typeof globalThis !== 'undefined') {
    delete globalThis.__ambientWidgetAttestation;
  }
}
