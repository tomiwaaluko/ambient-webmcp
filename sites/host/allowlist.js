/**
 * Canonical host allowlist — vendor labels come ONLY from here, never from widgets.
 */

/** @typedef {{ vendorLabel: string, widgetId: string }} AllowlistEntry */

/** @type {Readonly<Record<string, AllowlistEntry>>} */
export const ALLOWLIST = Object.freeze({
  'https://acme-booking-tomiwaalukos-projects.vercel.app': {
    vendorLabel: 'acme',
    widgetId: 'booking'
  },
  'https://northwind-checkout-tomiwaalukos-projects.vercel.app': {
    vendorLabel: 'northwind',
    widgetId: 'checkout'
  },
  'https://zenith-support-tomiwaalukos-projects.vercel.app': {
    vendorLabel: 'zenith',
    widgetId: 'support'
  }
});
