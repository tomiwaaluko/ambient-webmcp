import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/host/redact.js';

test('redact replaces credential-shaped strings', () => {
  const { text, redactions } = redact('token sk-live-test_abc123 assigned');
  assert.match(text, /\[redacted\]/);
  assert.ok(redactions.length > 0);
});

test('redact leaves benign text unchanged', () => {
  const input = 'Search flights to Lisbon.';
  const { text, redactions } = redact(input);
  assert.equal(text, input);
  assert.equal(redactions.length, 0);
});

test('redact handles empty input', () => {
  const { text, redactions } = redact('');
  assert.equal(text, '');
  assert.equal(redactions.length, 0);
});
