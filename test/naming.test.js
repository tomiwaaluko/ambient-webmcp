import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeName } from '../src/host/naming.js';

test('composeName builds vendor.widget.verb', () => {
  const outcome = composeName({ vendorLabel: 'acme', widgetId: 'booking', verb: 'search' });
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.name, 'acme.booking.search');
});

test('composeName refuses names longer than 128 characters', () => {
  const outcome = composeName({
    vendorLabel: 'a'.repeat(50),
    widgetId: 'b'.repeat(50),
    verb: 'c'.repeat(50)
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, 'NAME_TOO_LONG');
});

test('composeName refuses illegal characters', () => {
  const outcome = composeName({ vendorLabel: 'acme', widgetId: 'book ing', verb: 'search' });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, 'NAME_ILLEGAL_CHARS');
});
