import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeProxy, createConcurrencyGate } from '../src/host/proxy.js';

const ORIGIN = 'https://acme-booking-tomiwaalukos-projects.vercel.app';

test('executeProxy returns failure envelope when source is unavailable', async () => {
  const outcome = await executeProxy({
    sourceTool: {},
    input: {},
    origin: ORIGIN,
    isUnavailable: () => true
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, 'TOOL_HANDLE_INVALID');
    assert.match(outcome.text, /Third-party/i);
  }
});

test('executeProxy returns failure envelope on timeout', async () => {
  const outcome = await executeProxy({
    sourceTool: {},
    input: {},
    origin: ORIGIN,
    timeoutMs: 20,
    executeFn: () => new Promise(() => {})
  });
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, 'EXECUTION_TIMEOUT');
    assert.match(outcome.text, /EXECUTION_TIMEOUT/);
  }
});

test('executeProxy drops late results after timeout', async () => {
  /** @type {object[]} */
  const drops = [];
  const executeFn = () =>
    new Promise((resolve) => {
      setTimeout(
        () => resolve({ ok: true, result: { content: [{ type: 'text', text: 'late' }] }, shape: 'json-string' }),
        80
      );
    });

  const outcome = await executeProxy({
    sourceTool: {},
    input: {},
    origin: ORIGIN,
    timeoutMs: 20,
    executeFn,
    onDrop: (record) => drops.push(record)
  });

  assert.equal(outcome.ok, false);
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(drops.some((d) => d.kind === 'late-result'));
});

test('executeProxy drops result when revoked mid-flight', async () => {
  let revoked = false;
  const executeFn = async () => {
    await new Promise((r) => setTimeout(r, 10));
    revoked = true;
    return { ok: true, result: { content: [{ type: 'text', text: 'done' }] }, shape: 'json-string' };
  };

  const outcome = await executeProxy({
    sourceTool: {},
    input: {},
    origin: ORIGIN,
    isRevoked: () => revoked,
    executeFn
  });

  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, 'RESULT_AFTER_REVOCATION');
});

test('executeProxy refuses when concurrency gate is full', async () => {
  const gate = createConcurrencyGate(1);
  gate.tryAcquire();

  const outcome = await executeProxy({
    sourceTool: {},
    input: {},
    origin: ORIGIN,
    concurrencyGate: gate,
    executeFn: async () => ({ ok: true, result: 'ok', shape: 'json-string' })
  });

  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.code, 'BOUND_EXCEEDED_CONCURRENCY');
  gate.release();
});

test('executeProxy forwards successful results through envelope', async () => {
  const outcome = await executeProxy({
    sourceTool: {},
    input: { q: 'hi' },
    origin: ORIGIN,
    executeFn: async () => ({
      ok: true,
      result: { content: [{ type: 'text', text: 'hello' }] },
      shape: 'json-string'
    })
  });
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.ok(outcome.result.content[0].text.includes('Third-party'));
  }
});
