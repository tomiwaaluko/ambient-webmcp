// GENERATED FILE - DO NOT EDIT.
// Copied verbatim from src/widget/ by scripts/sync-sites.mjs.
// Edit the source in src/widget/ and re-run: node scripts/sync-sites.mjs
/**
 * Third-party WebMCP origin trial injection.
 *
 * Chrome validates third-party tokens against the origin of the script that
 * injects them, not the document origin. Each vendor deployment must serve this
 * file from its own origin with that origin's third-party token.
 *
 * Default token: acme, minted 2026-09-01 (isThirdParty: true, expires 2026-11-17).
 * Northwind and zenith need their own third-party tokens before deploy (PRO-14).
 *
 * Injection is synchronous and idempotent. Call ensureOriginTrialInjected()
 * before the first registerTool — registerConformantTool does this automatically.
 */

/** @type {boolean} */
let injected = false;

/**
 * Acme third-party token — proven on Chrome 151 via sites/acme-booking/ot-inject-3p.js.
 * origin: https://acme-booking-tomiwaalukos-projects.vercel.app:443
 */
export const DEFAULT_THIRD_PARTY_TOKEN =
  'AyF28xSuwhxbaYHRCUPbiQOJapabDkGn180xz9gKpohpILxhuroy1a3iDBHDhAjZSRQ7GkZd2ukamHDijxeKXwoAAACBeyJvcmlnaW4iOiJodHRwczovL2FjbWUtYm9va2luZy10b21pd2FhbHVrb3MtcHJvamVjdHMudmVyY2VsLmFwcDo0NDMiLCJmZWF0dXJlIjoiV2ViTUNQIiwiZXhwaXJ5IjoxNzk0ODczNjAwLCJpc1RoaXJkUGFydHkiOnRydWV9';

/**
 * Whether the origin-trial meta element has been injected in this document.
 * @returns {boolean}
 */
export function isOriginTrialInjected() {
  return injected;
}

/**
 * Inject the third-party origin trial meta element if not already present.
 * Runs synchronously; safe to call repeatedly.
 *
 * @param {string} [token] token to inject; defaults to DEFAULT_THIRD_PARTY_TOKEN
 * @returns {void}
 */
export function ensureOriginTrialInjected(token = DEFAULT_THIRD_PARTY_TOKEN) {
  if (injected) return;
  if (typeof document === 'undefined') return;

  const meta = document.createElement('meta');
  meta.httpEquiv = 'origin-trial';
  meta.content = token;
  document.head.appendChild(meta);
  injected = true;
}

/**
 * Reset injection state. For tests only.
 * @returns {void}
 */
export function resetOriginTrialInjection() {
  injected = false;
}
