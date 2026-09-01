/**
 * Conformance checker CLI gate.
 *
 * Loads a widget fixture (or a harvested subject document), runs the engine,
 * prints one line per rule, and exits non-zero on any fail. not-evaluable is
 * not a fail.
 *
 * Observed rules use an in-fixture introspection hook when the fixture
 * exposes one. That is valid only for fixtures whose state the harness can
 * see. It is not generic false-read-only detection.
 *
 * Usage:
 *   node src/checker/cli.js --fixture test/fixtures/conformant-widget.js
 *   node src/checker/cli.js --origin <path-or-url>
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluate } from './engine.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANIFEST = resolve(REPO_ROOT, 'rules', 'manifest.json');

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const out = {
    fixture: null,
    origin: null,
    manifest: null,
    role: null,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--fixture') out.fixture = argv[++i];
    else if (arg === '--origin') out.origin = argv[++i];
    else if (arg === '--manifest') out.manifest = argv[++i];
    else if (arg === '--role') out.role = argv[++i];
  }

  return out;
}

export function usage() {
  return [
    'Usage: node src/checker/cli.js --fixture <path> | --origin <path-or-url>',
    '',
    '  --fixture <path>   Node-loadable widget fixture (tools, attestation, optional harness hooks)',
    '  --origin <spec>    Filesystem path (same as --fixture) or https URL of a harvested subject JSON',
    '  --manifest <path>  Rule manifest (default: rules/manifest.json)',
    '  --role widget|host Subject role (default: widget, or the fixture\'s exported role)',
    '',
    'Exit 1 if any rule fails. not-evaluable is not a fail.',
    'Live WebMCP getTools() harvest requires a browser; this CLI does not fake one.'
  ].join('\n');
}

/**
 * Build a harness that can see fixture-local state. No claim that this works
 * against an arbitrary third-party widget.
 *
 * @param {object} mod
 * @returns {{ probe: Function } | undefined}
 */
export function createFixtureHarness(mod) {
  const hasExecute = typeof mod.execute === 'function';
  const hasState = typeof mod.getObservedState === 'function';
  const hasNotifications = Array.isArray(mod.surfaceNotifications);

  if (!hasExecute && !hasState && !hasNotifications) {
    return undefined;
  }

  return {
    probe(probeName, { subject }) {
      if (probeName === 'readOnlyContradiction') {
        return probeReadOnlyContradiction(mod, subject.tools ?? []);
      }
      if (probeName === 'surfaceChangeNotification') {
        return probeSurfaceChange(mod);
      }
      return {
        result: 'not-evaluable',
        message: `Probe "${probeName}" is not instrumented on this fixture. Behavioral contradiction detection ships only for fixture-local hooks.`
      };
    }
  };
}

function probeReadOnlyContradiction(mod, tools) {
  if (typeof mod.execute !== 'function' || typeof mod.getObservedState !== 'function') {
    return {
      result: 'not-evaluable',
      message:
        'readOnlyContradiction requires fixture execute() and getObservedState() hooks. Ambient does not claim generic false-read-only detection.'
    };
  }

  const before = JSON.stringify(mod.getObservedState());
  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint === true) {
      mod.execute(tool.name, {});
    }
  }
  const after = JSON.stringify(mod.getObservedState());

  if (before !== after) {
    return {
      result: 'fail',
      message: 'A tool with readOnlyHint:true wrote observable fixture state.'
    };
  }

  return {
    result: 'pass',
    message: 'Read-only tools did not write observable fixture state (fixture-local observation only).'
  };
}

function probeSurfaceChange(mod) {
  if (!Array.isArray(mod.surfaceNotifications)) {
    return {
      result: 'not-evaluable',
      message: 'Fixture did not expose a surface-change notification buffer; W7 cannot be observed.'
    };
  }
  if (mod.surfaceNotifications.length === 0) {
    return {
      result: 'fail',
      message: 'Fixture is instrumented for surface-change but recorded no notification.'
    };
  }
  return {
    result: 'pass',
    message: 'Fixture recorded a surface-change notification.'
  };
}

export function loadManifest(manifestPath) {
  const path = resolve(manifestPath ?? DEFAULT_MANIFEST);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {string} spec
 * @param {{ fetchSubject?: Function }} [io]
 */
export async function loadSubject(spec, io = {}) {
  if (/^https?:\/\//i.test(spec)) {
    const fetchSubject = io.fetchSubject;
    if (typeof fetchSubject !== 'function') {
      const err = new Error(
        `ORIGIN_HARVEST_UNAVAILABLE: ${spec} is a URL. This CLI does not drive a browser, so it cannot call getTools(). Serve a harvested ambient-subject.json or pass --fixture.`
      );
      err.code = 'ORIGIN_HARVEST_UNAVAILABLE';
      throw err;
    }
    const url = spec.replace(/\/$/, '') + '/ambient-subject.json';
    return fetchSubject(url);
  }

  const path = resolve(spec);
  if (path.endsWith('.json')) {
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  const mod = await import(pathToFileURL(path).href);
  return { module: mod };
}

export function formatReport(results) {
  const pad = (value, width) => String(value).padEnd(width);
  const lines = results.map(
    (row) =>
      `${pad(row.ruleId, 4)} ${pad(row.result, 14)} ${pad(row.evidence, 12)} ${row.message}`
  );

  const fail = results.filter((r) => r.result === 'fail').length;
  const pass = results.filter((r) => r.result === 'pass').length;
  const rest = results.filter((r) => r.result === 'not-evaluable').length;
  lines.push('');
  lines.push(
    `${results.length} rules: ${pass} pass, ${fail} fail, ${rest} not-evaluable. Exit non-zero on fail only.`
  );
  return lines.join('\n');
}

export function exitCodeFor(results) {
  return results.some((r) => r.result === 'fail') ? 1 : 0;
}

/**
 * @param {string[]} argv
 * @param {{ stdout?: { write: Function }, stderr?: { write: Function }, fetchSubject?: Function }} [io]
 */
export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const args = parseArgs(argv);

  if (args.help) {
    stdout.write(usage() + '\n');
    return { exitCode: 0, results: [] };
  }

  const spec = args.fixture ?? args.origin;
  if (!spec) {
    stderr.write(usage() + '\n');
    return { exitCode: 2, results: [] };
  }

  let loaded;
  try {
    loaded = await loadSubject(spec, io);
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return { exitCode: 2, results: [] };
  }

  const manifest = loadManifest(args.manifest);
  const mod = loaded.module ?? loaded;
  const tools = loaded.tools ?? mod.tools;
  const attestation = loaded.attestation !== undefined ? loaded.attestation : mod.attestation;
  const role = args.role ?? loaded.role ?? mod.role ?? 'widget';

  if (!Array.isArray(tools)) {
    stderr.write('SUBJECT_INVALID: harvested subject has no tools array.\n');
    return { exitCode: 2, results: [] };
  }

  const subject = {
    role,
    tools,
    attestation: attestation ?? null,
    allowlist: loaded.allowlist ?? mod.allowlist
  };

  const harness = loaded.module ? createFixtureHarness(mod) : undefined;
  const results = evaluate({ manifest, subject, harness });
  stdout.write(formatReport(results) + '\n');
  return { exitCode: exitCodeFor(results), results };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (invokedDirectly()) {
  const { exitCode } = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}
