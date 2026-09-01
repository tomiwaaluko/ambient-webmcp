import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeName,
  claimInstance,
  identityKey
} from '../src/host/naming.js';

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

test('two origins same verb produce distinct composed names', () => {
  const acme = composeName({ vendorLabel: 'acme', widgetId: 'booking', verb: 'search' });
  const zenith = composeName({ vendorLabel: 'zenith', widgetId: 'support', verb: 'search' });
  assert.equal(acme.ok, true);
  assert.equal(zenith.ok, true);
  if (acme.ok && zenith.ok) {
    assert.notEqual(acme.name, zenith.name);
  }
});

describe('instance limit', () => {
  test('second window with same identity is refused with INSTANCE_LIMIT_REACHED', () => {
    const registry = new Map();
    const windowA = { id: 'a' };
    const windowB = { id: 'b' };

    const first = composeName({
      vendorLabel: 'acme',
      widgetId: 'booking',
      verb: 'search',
      windowRef: windowA,
      instanceRegistry: registry
    });
    assert.equal(first.ok, true);

    const second = composeName({
      vendorLabel: 'acme',
      widgetId: 'booking',
      verb: 'search',
      windowRef: windowB,
      instanceRegistry: registry
    });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.code, 'INSTANCE_LIMIT_REACHED');
  });

  test('same window re-compose is allowed', () => {
    const registry = new Map();
    const windowA = { id: 'a' };
    const again = composeName({
      vendorLabel: 'acme',
      widgetId: 'booking',
      verb: 'book',
      windowRef: windowA,
      instanceRegistry: registry
    });
    assert.equal(again.ok, true);
    assert.equal(registry.get(identityKey('acme', 'booking'))?.window, windowA);
  });

  test('claimInstance distinguishes limit from charset failures', () => {
    const registry = new Map();
    const a = claimInstance(registry, 'acme.booking', { id: 1 });
    const b = claimInstance(registry, 'acme.booking', { id: 2 });
    assert.equal(a.ok, true);
    assert.equal(b.ok, false);
    if (!b.ok) assert.equal(b.code, 'INSTANCE_LIMIT_REACHED');
  });
});
