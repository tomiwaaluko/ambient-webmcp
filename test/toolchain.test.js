// Guards the test toolchain itself, so `npm test` can never pass vacuously on an
// empty suite. Owned by no ticket — leave it in place; add your own test files
// alongside it rather than editing this one.
//
// If this fails, stop and fix the toolchain before writing feature code:
//   - `npm test` runs bare `node --test` (auto-discovery).
//   - `node --test test/` is NOT equivalent; it fails with MODULE_NOT_FOUND on
//     Node 24 + Windows. See CONVENTIONS.md > Testing.

import { test } from 'node:test';
import assert from 'node:assert';

test('ES module syntax and node:test are both available', () => {
  // Reaching this line at all proves package.json "type": "module" is in effect —
  // without it, the import statements above would have thrown at parse time.
  assert.equal(typeof test, 'function');
});

test('assertion failures actually fail', () => {
  // A suite that cannot fail is not a gate.
  assert.throws(() => assert.equal(1, 2), assert.AssertionError);
});
