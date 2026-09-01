import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvelope, buildFailureEnvelope, CHROME_BUDGETS } from '../src/host/envelope.js';

const ORIGIN = 'https://acme-booking-tomiwaalukos-projects.vercel.app';

test('buildEnvelope carries origin and third-party delimiters', () => {
  const outcome = buildEnvelope({
    origin: ORIGIN,
    kind: 'description',
    value: 'Search flights.'
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.match(outcome.text, /Third-party/i);
    assert.ok(outcome.text.includes(ORIGIN));
  }
});

test('buildEnvelope truncates inside template rather than passing raw overflow', () => {
  const long = 'x'.repeat(600);
  const outcome = buildEnvelope({ origin: ORIGIN, kind: 'description', value: long });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.ok(outcome.text.length <= CHROME_BUDGETS.description);
    assert.match(outcome.text, /Third-party/i);
  }
});

test('buildEnvelope redacts credential-shaped text before templating', () => {
  const outcome = buildEnvelope({
    origin: ORIGIN,
    kind: 'description',
    value: 'Use card 4111 1111 1111 1111 for payment.'
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.doesNotMatch(outcome.text, /4111/);
    assert.match(outcome.text, /redacted/i);
  }
});

test('buildFailureEnvelope returns enveloped failure text', () => {
  const { text } = buildFailureEnvelope({
    origin: ORIGIN,
    code: 'EXECUTION_TIMEOUT',
    message: 'Timed out.'
  });
  assert.match(text, /EXECUTION_TIMEOUT/);
  assert.match(text, /Third-party/i);
  assert.ok(text.includes(ORIGIN));
});

test('buildEnvelope rejects unknown kind', () => {
  const outcome = buildEnvelope({ origin: ORIGIN, kind: 'title', value: 'x' });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, 'ENVELOPE_KIND_UNKNOWN');
});
