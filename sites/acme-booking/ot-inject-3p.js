/**
 * PRO-5 spike Q6, second half — THIRD-PARTY origin trial token matching.
 *
 * This file is served from ACME and is meant to be loaded cross-origin by a page
 * on another origin. That is the whole point: a third-party token is validated
 * against the origin of the *script that injects it*, not the origin of the
 * document. Acme's script carrying Acme's third-party token should therefore
 * turn WebMCP on for a page that has no token of its own.
 *
 * That is Ambient's vendor-distribution claim in one file: a vendor adopts the
 * widget helper, and WebMCP lights up on every host that embeds it — without the
 * host owner registering for anything.
 *
 * Contrast with sites/northwind-checkout/ot-inject.js, which is served
 * SAME-ORIGIN and carries first-party tokens. That file measured the delivery
 * mechanism (runtime meta creation from external JS). This file measures
 * third-party MATCHING, which the first-party tokens could not test.
 *
 * Classic (non-module) script on purpose: it must run synchronously during head
 * parsing, before anything reads document.modelContext.
 */
(function () {
  // origin: https://acme-booking-tomiwaalukos-projects.vercel.app:443
  // isThirdParty: true, feature: WebMCP, expiry 1794873600 (2026-11-17)
  var THIRD_PARTY_TOKEN =
    'AyF28xSuwhxbaYHRCUPbiQOJapabDkGn180xz9gKpohpILxhuroy1a3iDBHDhAjZSRQ7GkZd2ukamHDijxeKXwoAAACBeyJvcmlnaW4iOiJodHRwczovL2FjbWUtYm9va2luZy10b21pd2FhbHVrb3MtcHJvamVjdHMudmVyY2VsLmFwcDo0NDMiLCJmZWF0dXJlIjoiV2ViTUNQIiwiZXhwaXJ5IjoxNzk0ODczNjAwLCJpc1RoaXJkUGFydHkiOnRydWV9';

  var script = document.currentScript;

  // Recorded before injection. If this is already 'object', the page had WebMCP
  // some other way and the measurement proves nothing.
  var before = typeof document.modelContext;

  var meta = document.createElement('meta');
  meta.httpEquiv = 'origin-trial';
  meta.content = THIRD_PARTY_TOKEN;
  document.head.appendChild(meta);

  window.__ot3p = {
    tokenOwner: 'acme (third-party, isThirdParty:true)',
    scriptSrc: script ? script.src : null,
    // The origin serving THIS script. Must differ from location.origin for the
    // result to mean anything.
    scriptOrigin: script ? new URL(script.src).origin : null,
    documentOrigin: location.origin,
    isActuallyCrossOrigin: script ? new URL(script.src).origin !== location.origin : null,
    injected: true,
    modelContextBeforeInject: before,
    modelContextAfterInject: typeof document.modelContext
  };
})();
