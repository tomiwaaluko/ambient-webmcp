import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkToolCountBound,
  checkConcurrencyBound,
  checkSurfaceChangeRateBound,
  checkResultSizeBound,
  MAX_TOOLS_PER_ORIGIN,
  MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN,
  MAX_SURFACE_CHANGES_PER_MINUTE,
  CHROME_BUDGETS
} from '../src/host/bounds.js';

test('tool count breach names BOUND_EXCEEDED_TOOL_COUNT', () => {
  const outcome = checkToolCountBound(MAX_TOOLS_PER_ORIGIN + 1);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.code, 'BOUND_EXCEEDED_TOOL_COUNT');
    assert.equal(outcome.bound, 'toolCount');
  }
});

test('concurrency breach names concurrentExecutions bound', () => {
  const outcome = checkConcurrencyBound(MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.bound, 'concurrentExecutions');
});

test('surface change rate breach is named', () => {
  const now = Date.now();
  const stamps = Array.from({ length: MAX_SURFACE_CHANGES_PER_MINUTE + 1 }, () => now);
  const outcome = checkSurfaceChangeRateBound(stamps, now);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.bound, 'surfaceChangeRate');
});

test('result size breach is named', () => {
  const outcome = checkResultSizeBound(CHROME_BUDGETS.result + 1);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.bound, 'resultSize');
});

test('documented Chrome-less thresholds match exports', () => {
  assert.equal(MAX_TOOLS_PER_ORIGIN, 16);
  assert.equal(MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN, 4);
  assert.equal(MAX_SURFACE_CHANGES_PER_MINUTE, 12);
});
