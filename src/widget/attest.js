/**
 * Machine-readable widget attestation (R37).
 *
 * Covers obligations the registered tool surface cannot reveal: hint truthfulness,
 * untrusted-content marking at runtime, and mutating-tool authorization.
 *
 * ATTESTED_RULE_IDS is fixture-coupled to PRO-6 rules/manifest.json — update when
 * the manifest lands so ids match the attested-class widget rules exactly.
 */

/**
 * Attested-class rule ids this helper attests to.
 * PRO-6 coupling: replace with manifest-derived ids when rules/manifest.json exists.
 * @type {readonly string[]}
 */
export const ATTESTED_RULE_IDS = Object.freeze([
  'widget-mutation-auth',
  'widget-readonly-truthful',
  'widget-untrusted-marked'
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
      'widget-mutation-auth': {
        statement:
          'Mutating tools registered through this helper invoke an authorization callback before any side effect.',
        enforcedBy: 'registerConformantTool'
      },
      'widget-readonly-truthful': {
        statement:
          'readOnlyHint on each registered tool truthfully reflects whether the tool mutates state.',
        enforcedBy: 'vendor'
      },
      'widget-untrusted-marked': {
        statement:
          'Tools returning content the widget did not author carry untrustedContentHint.',
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
