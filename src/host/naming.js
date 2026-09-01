/**
 * Compose host-assigned federated tool names.
 *
 * Pure logic — no DOM access.
 */

const MAX_NAME_LENGTH = 128;
const LEGAL_NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * @param {string} vendorLabel
 * @param {string} widgetId
 * @returns {string}
 */
export function identityKey(vendorLabel, widgetId) {
  return `${vendorLabel}.${widgetId}`;
}

/**
 * @param {Map<string, { window: object }>} registry
 * @param {string} key
 * @param {object} windowRef
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function claimInstance(registry, key, windowRef) {
  const existing = registry.get(key);
  if (existing && existing.window !== windowRef) {
    return {
      ok: false,
      code: 'INSTANCE_LIMIT_REACHED',
      message: `Only one instance of ${key} may federate on this page; another live instance is already registered.`
    };
  }
  if (!existing) {
    registry.set(key, { window: windowRef });
  }
  return { ok: true };
}

/**
 * @param {{ vendorLabel: string, widgetId: string, verb: string, windowRef?: object, instanceRegistry?: Map<string, { window: object }> }} parts
 * @returns {{ ok: true, name: string } | { ok: false, code: string, message: string }}
 */
export function composeName({ vendorLabel, widgetId, verb, windowRef, instanceRegistry }) {
  if (instanceRegistry && windowRef) {
    const claimed = claimInstance(instanceRegistry, identityKey(vendorLabel, widgetId), windowRef);
    if (!claimed.ok) return claimed;
  }

  const name = `${vendorLabel}.${widgetId}.${verb}`;

  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      code: 'NAME_TOO_LONG',
      message: `Composed name is ${name.length} characters; the limit is ${MAX_NAME_LENGTH}.`
    };
  }

  if (!LEGAL_NAME.test(name)) {
    return {
      ok: false,
      code: 'NAME_ILLEGAL_CHARS',
      message: 'Composed names may contain only ASCII alphanumerics, underscore, hyphen, and period.'
    };
  }

  return { ok: true, name };
}
