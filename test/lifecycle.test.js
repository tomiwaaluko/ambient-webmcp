import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { transition, initialState, TRANSITIONS } from '../src/host/lifecycle.js';

describe('transition table', () => {
  test('every documented transition is permitted', () => {
    const cases = [
      ['discovering', 'evaluating'],
      ['discovering', 'degraded'],
      ['evaluating', 'active'],
      ['evaluating', 'quarantined'],
      ['evaluating', 'degraded'],
      ['active', 'evaluating'],
      ['active', 'quarantined'],
      ['active', 'revoking'],
      ['degraded', 'evaluating'],
      ['degraded', 'revoking'],
      ['quarantined', 'evaluating'],
      ['quarantined', 'revoking'],
      ['revoking', 'revoked']
    ];

    for (const [from, to] of cases) {
      const next = transition(initialState(from, `${from} reason`), to, `${to} reason`);
      assert.equal(next.state, to);
      assert.equal(next.reason, `${to} reason`);
    }
  });

  test('illegal transitions throw', () => {
    assert.throws(
      () => transition(initialState('revoked', 'done'), 'active', 'nope'),
      /Illegal transition: revoked -> active/
    );
    assert.throws(
      () => transition(initialState('discovering', 'start'), 'active', 'skip'),
      /Illegal transition: discovering -> active/
    );
  });

  test('every state requires a non-empty reason', () => {
    assert.throws(() => transition({ state: 'active', reason: '' }, 'evaluating', 'ok'), /non-empty reason/);
    assert.throws(() => transition(initialState('active', 'ok'), 'evaluating', ''), /non-empty reason/);
  });

  test('transition table covers all states', () => {
    const states = ['discovering', 'evaluating', 'active', 'degraded', 'quarantined', 'revoking', 'revoked'];
    for (const state of states) {
      assert.ok(Object.prototype.hasOwnProperty.call(TRANSITIONS, state));
    }
  });
});
