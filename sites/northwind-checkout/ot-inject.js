/**
 * PRO-5 spike Q6 — origin trial token delivery from an external JS file.
 *
 * A *third-party* origin trial token cannot be delivered by meta tag, inline
 * script, or HTTP header. It has to come from an external JS file that creates
 * the meta element at runtime. Ambient's vendor-distribution claim depends on
 * that mechanism working inside a cross-origin iframe, so the spike measures
 * it rather than assuming it.
 *
 * This file is a classic (non-module) script so it runs synchronously during
 * head parsing, before anything touches document.modelContext.
 *
 * Modes, selected by the query string of the *page that loads this file*:
 *   ?ot=extjs    inject Northwind's own token from here          (the mechanism under test)
 *   ?ot=none     inject nothing                                  (negative control)
 *   ?ot=foreign  inject Acme's first-party token on this page    (cross-origin control)
 *   (default)    same as extjs
 *
 * Note on scope: these are all *first-party* tokens. This file measures the
 * delivery mechanism — runtime meta creation from an external JS file — not
 * third-party token *matching*, which needs a token minted with third-party
 * matching enabled. See docs/spike-report.md Q6 for exactly which half is
 * observed and which is not.
 */
(function () {
  var TOKENS = {
    // origin: https://northwind-checkout-tomiwaalukos-projects.vercel.app:443
    northwind:
      'ArUJoI1xjLxAzqlJXU4vOjwIjcU0aJ5omkSsIi27W0UOG5i8j7XA3GgHKZBszLKS6DStluimhy0oYn+fCtsezwQAAABzeyJvcmlnaW4iOiJodHRwczovL25vcnRod2luZC1jaGVja291dC10b21pd2FhbHVrb3MtcHJvamVjdHMudmVyY2VsLmFwcDo0NDMiLCJmZWF0dXJlIjoiV2ViTUNQIiwiZXhwaXJ5IjoxNzk0ODczNjAwfQ==',
    // origin: https://acme-booking-tomiwaalukos-projects.vercel.app:443
    acme:
      'AjugPCasG1nAIXctKUfbGzzs3oLkxR1F/p5LoTPIHB2AZIbYUYC8cacTa0S6uCisxmuwUNtm2mTHgIM0L5uH3QoAAABteyJvcmlnaW4iOiJodHRwczovL2FjbWUtYm9va2luZy10b21pd2FhbHVrb3MtcHJvamVjdHMudmVyY2VsLmFwcDo0NDMiLCJmZWF0dXJlIjoiV2ViTUNQIiwiZXhwaXJ5IjoxNzk0ODczNjAwfQ=='
  };

  var mode = new URLSearchParams(location.search).get('ot') || 'extjs';
  var token = null;
  if (mode === 'extjs') token = TOKENS.northwind;
  else if (mode === 'foreign') token = TOKENS.acme;

  // Record what happened so the page (and the embedder) can read it back
  // without guessing.
  window.__otInject = {
    mode: mode,
    injected: false,
    tokenOwner: mode === 'extjs' ? 'northwind (self)' : mode === 'foreign' ? 'acme (cross-origin)' : null,
    // Whether WebMCP was already live before this file ran. Should be false;
    // if it is true the experiment proves nothing.
    modelContextBeforeInject: typeof document.modelContext,
    scriptSrc: document.currentScript ? document.currentScript.src : null
  };

  if (token) {
    var meta = document.createElement('meta');
    meta.httpEquiv = 'origin-trial';
    meta.content = token;
    document.head.appendChild(meta);
    window.__otInject.injected = true;
  }

  window.__otInject.modelContextAfterInject = typeof document.modelContext;
})();
