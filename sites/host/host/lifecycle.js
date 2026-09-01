// GENERATED FILE - DO NOT EDIT.
// Copied from src/host/ by scripts/sync-sites.mjs (import paths adjusted for deployment).
// Edit the source in src/host/ and re-run: node scripts/sync-sites.mjs
/**
 * Explicit origin lifecycle transitions — illegal moves throw.
 *
 * @typedef {'discovering'|'evaluating'|'active'|'degraded'|'quarantined'|'revoking'|'revoked'} OriginStateName
 * @typedef {{ state: OriginStateName, reason: string }} OriginState
 */

/** @type {Record<OriginStateName, OriginStateName[]>} */
export const TRANSITIONS = Object.freeze({
  discovering: ['evaluating', 'degraded'],
  evaluating: ['active', 'quarantined', 'degraded'],
  active: ['evaluating', 'quarantined', 'revoking'],
  degraded: ['evaluating', 'revoking'],
  quarantined: ['evaluating', 'revoking'],
  revoking: ['revoked'],
  revoked: []
});

/**
 * @param {OriginState} originState
 * @param {OriginStateName} nextState
 * @param {string} reason
 * @returns {OriginState}
 */
export function transition(originState, nextState, reason) {
  if (!originState || typeof originState.state !== 'string') {
    throw new Error('transition requires a current origin state.');
  }
  if (!originState.reason || originState.reason.length === 0) {
    throw new Error(`State "${originState.state}" must carry a non-empty reason before transitioning.`);
  }
  if (!reason || reason.length === 0) {
    throw new Error('transition requires a non-empty reason for the next state.');
  }

  const allowed = TRANSITIONS[originState.state];
  if (!allowed || !allowed.includes(nextState)) {
    throw new Error(`Illegal transition: ${originState.state} -> ${nextState}`);
  }

  return { state: nextState, reason };
}

/**
 * @param {OriginStateName} state
 * @param {string} reason
 * @returns {OriginState}
 */
export function initialState(state, reason) {
  if (!reason || reason.length === 0) {
    throw new Error('initialState requires a non-empty reason.');
  }
  return { state, reason };
}
