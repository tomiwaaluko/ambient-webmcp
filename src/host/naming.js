/**
 * Compose host-assigned federated tool names.
 *
 * Pure logic — no DOM access. PRO-8 adds instance-limit checks here.
 */

const MAX_NAME_LENGTH = 128;
const LEGAL_NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * @param {{ vendorLabel: string, widgetId: string, verb: string }} parts
 * @returns {{ ok: true, name: string } | { ok: false, code: string, message: string }}
 */
export function composeName({ vendorLabel, widgetId, verb }) {
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
