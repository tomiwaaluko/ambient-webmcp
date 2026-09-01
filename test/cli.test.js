import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, runCli, createFixtureHarness, exitCodeFor } from '../src/checker/cli.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(repoRoot, 'src', 'checker', 'cli.js');
const fixtures = join(repoRoot, 'test', 'fixtures');

function spawnCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    cwd: repoRoot
  });
}

describe('parseArgs', () => {
  test('reads --fixture and --origin', () => {
    assert.equal(parseArgs(['--fixture', 'a.js']).fixture, 'a.js');
    assert.equal(parseArgs(['--origin', 'b.js']).origin, 'b.js');
  });
});

describe('createFixtureHarness', () => {
  test('returns undefined when the fixture has no introspection hooks', async () => {
    const mod = await import(new URL('./fixtures/non-instrumented.js', import.meta.url));
    assert.equal(createFixtureHarness(mod), undefined);
  });

  test('observes a read-only contradiction against an instrumented fixture', async () => {
    const mod = await import(new URL('./fixtures/violating-readonly.js', import.meta.url));
    if (typeof mod.resetFixture === 'function') mod.resetFixture();
    const harness = createFixtureHarness(mod);
    const outcome = harness.probe('readOnlyContradiction', { subject: { tools: mod.tools } });
    assert.equal(outcome.result, 'fail');
    assert.match(outcome.message, /wrote observable fixture state/);
  });
});

describe('runCli', () => {
  test('a widget passing every evaluable rule exits zero', async () => {
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const stderr = { text: '', write(chunk) { this.text += chunk; } };
    const { exitCode, results } = await runCli(
      ['--fixture', join(fixtures, 'conformant-widget.js')],
      { stdout, stderr }
    );
    assert.equal(exitCode, 0);
    assert.equal(exitCodeFor(results), 0);
    assert.equal(results.some((r) => r.result === 'fail'), false);
    assert.match(stdout.text, /W1/);
    assert.match(stdout.text, /attested/);
  });

  test('a free-form context parameter fails W5 and exits non-zero', async () => {
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const stderr = { text: '', write(chunk) { this.text += chunk; } };
    const { exitCode, results } = await runCli(
      ['--fixture', join(fixtures, 'violating-schema.js')],
      { stdout, stderr }
    );
    assert.equal(exitCode, 1);
    assert.equal(results.find((r) => r.ruleId === 'W5').result, 'fail');
  });

  test('an agent-directed description fails W6', async () => {
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const { exitCode, results } = await runCli(
      ['--fixture', join(fixtures, 'violating-instruction.js')],
      { stdout }
    );
    assert.equal(exitCode, 1);
    assert.equal(results.find((r) => r.ruleId === 'W6').result, 'fail');
  });

  test('missing attestation fails W8 and leaves attested rules not-evaluable', async () => {
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const { exitCode, results } = await runCli(
      ['--fixture', join(fixtures, 'missing-attestation.js')],
      { stdout }
    );
    assert.equal(exitCode, 1);
    assert.equal(results.find((r) => r.ruleId === 'W8').result, 'fail');
    assert.equal(results.find((r) => r.ruleId === 'W2').result, 'not-evaluable');
    assert.equal(results.find((r) => r.ruleId === 'W2').evidence, 'attested');
  });

  test('observed rules against a non-instrumented widget are not-evaluable, not pass', async () => {
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const { exitCode, results } = await runCli(
      ['--fixture', join(fixtures, 'non-instrumented.js')],
      { stdout }
    );
    assert.equal(exitCode, 0);
    const w4 = results.find((r) => r.ruleId === 'W4');
    assert.equal(w4.result, 'not-evaluable');
    assert.equal(w4.evidence, 'observed');
    assert.match(w4.message, /harness|generic/i);
  });

  test('host rules stay not-evaluable when the CLI evaluates a widget', async () => {
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const { results } = await runCli(
      ['--fixture', join(fixtures, 'conformant-widget.js')],
      { stdout }
    );
    assert.equal(results.find((r) => r.ruleId === 'H1').result, 'not-evaluable');
    assert.notEqual(results.find((r) => r.ruleId === 'H1').result, 'pass');
  });

  test('--origin on an https URL does not invent a tool surface', async () => {
    const stderr = { text: '', write(chunk) { this.text += chunk; } };
    const stdout = { text: '', write(chunk) { this.text += chunk; } };
    const { exitCode } = await runCli(['--origin', 'https://example.invalid'], {
      stdout,
      stderr
    });
    assert.equal(exitCode, 2);
    assert.match(stderr.text, /ORIGIN_HARVEST_UNAVAILABLE/);
  });
});

describe('cli process exit codes', () => {
  test('conformant fixture process exits 0', () => {
    const spawned = spawnCli(['--fixture', 'test/fixtures/conformant-widget.js']);
    assert.equal(spawned.status, 0, spawned.stderr);
    assert.match(spawned.stdout, /W4\s+pass\s+observed/);
  });

  test('violating schema process exits 1', () => {
    const spawned = spawnCli(['--fixture', 'test/fixtures/violating-schema.js']);
    assert.equal(spawned.status, 1, spawned.stderr);
  });

  test('violating read-only fixture fails W4 as observed', () => {
    const spawned = spawnCli(['--fixture', 'test/fixtures/violating-readonly.js']);
    assert.equal(spawned.status, 1, spawned.stderr);
    assert.match(spawned.stdout, /W4\s+fail\s+observed/);
  });

  test('--origin path is accepted as a fixture', () => {
    const spawned = spawnCli(['--origin', 'test/fixtures/conformant-widget.js']);
    assert.equal(spawned.status, 0, spawned.stderr);
  });
});
