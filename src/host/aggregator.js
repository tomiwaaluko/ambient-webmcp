/**
 * Host aggregator — discovery, screening, envelope, proxy registration.
 *
 * Governed surface is the default one; raw widget tools remain reachable via
 * getTools({ fromOrigins }) from host script (spike Q5).
 */

import { ALLOWLIST } from '../../sites/host/allowlist.js';
import { composeName } from './naming.js';
import { buildEnvelope } from './envelope.js';
import { screenOrigin, screenPublished } from './screening.js';
import { executeProxy, createConcurrencyGate } from './proxy.js';
import { transition, initialState } from './lifecycle.js';
import {
  checkToolCountBound,
  checkSurfaceChangeRateBound,
  MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN
} from './bounds.js';

export { ALLOWLIST };

/** @type {Map<string, { sourceTool: object, abort: AbortController, origin: string }>} */
const registeredProxies = new Map();

/** @type {Map<string, OriginRuntime>} */
const originRuntime = new Map();

/** @type {Map<string, { window: object }>} */
const instanceRegistry = new Map();

let passInFlight = false;
let passQueued = false;
let generation = 0;

/** @type {((snapshot: object) => void) | null} */
let onUpdate = null;

/** @type {object | null} */
let manifestCache = null;

/**
 * @typedef {import('./lifecycle.js').OriginState} OriginState
 * @typedef {{ state: OriginState, tools: string[], changeTimestamps: number[], dropRecords: object[], inFlightAtRevoke?: number, concurrencyGate: ReturnType<typeof createConcurrencyGate> }} OriginRuntime
 */

function parseInputSchema(inputSchema) {
  if (typeof inputSchema === 'string') {
    return JSON.parse(inputSchema);
  }
  return inputSchema;
}

function envelopeInputSchema(schema, origin) {
  if (!schema || typeof schema !== 'object') return schema;

  const copy = { ...schema };
  if (typeof copy.description === 'string') {
    const built = buildEnvelope({ origin, kind: 'paramDescription', value: copy.description });
    if (built.ok) copy.description = built.text;
  }

  if (copy.properties && typeof copy.properties === 'object') {
    const properties = {};
    for (const [key, prop] of Object.entries(copy.properties)) {
      const next = { ...prop };
      if (typeof next.description === 'string') {
        const built = buildEnvelope({ origin, kind: 'paramDescription', value: next.description });
        if (built.ok) next.description = built.text;
      }
      if (Array.isArray(next.enum)) {
        next.enum = next.enum.map((value) => {
          if (typeof value !== 'string') return value;
          const built = buildEnvelope({ origin, kind: 'enumValue', value });
          return built.ok ? built.text : value;
        });
      }
      properties[key] = next;
    }
    copy.properties = properties;
  }

  if (copy.items) {
    copy.items = envelopeInputSchema(copy.items, origin);
  }

  return copy;
}

function buildProxyAnnotations(tool) {
  /** @type {Record<string, boolean>} */
  const annotations = {};
  if (tool.annotations?.readOnlyHint !== undefined) {
    annotations.readOnlyHint = tool.annotations.readOnlyHint;
  }
  if (tool.annotations?.untrustedContentHint !== undefined) {
    annotations.untrustedContentHint = tool.annotations.untrustedContentHint;
  } else {
    annotations.untrustedContentHint = false;
  }
  return annotations;
}

function getOriginRuntime(origin) {
  let runtime = originRuntime.get(origin);
  if (!runtime) {
    runtime = {
      state: initialState('discovering', 'Origin discovered.'),
      tools: [],
      changeTimestamps: [],
      dropRecords: [],
      inFlightAtRevoke: 0,
      concurrencyGate: createConcurrencyGate(MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN)
    };
    originRuntime.set(origin, runtime);
  }
  return runtime;
}

function moveOrigin(runtime, next, reason) {
  runtime.state = transition(runtime.state, next, reason);
}

function withdrawProxy(proxyName) {
  const record = registeredProxies.get(proxyName);
  if (!record) return;
  record.abort.abort();
  registeredProxies.delete(proxyName);
}

function withdrawOriginProxies(origin) {
  for (const [name, record] of registeredProxies.entries()) {
    if (record.origin === origin) {
      withdrawProxy(name);
    }
  }
}

/**
 * @param {string} origin
 * @param {OriginRuntime} runtime
 * @param {string[]} [toolsOverride]
 */
function originRowFromRuntime(origin, runtime, toolsOverride) {
  const withdrawn = runtime.state.state === 'revoking' || runtime.state.state === 'revoked';
  const tools = withdrawn
    ? []
    : toolsOverride !== undefined
      ? [...toolsOverride]
      : [...runtime.tools];
  return {
    origin,
    state: runtime.state.state,
    reason: runtime.state.reason,
    tools,
    dropRecords: [...runtime.dropRecords],
    inFlight: runtime.concurrencyGate.active(),
    inFlightAtRevoke: runtime.inFlightAtRevoke ?? 0
  };
}

function buildSnapshot(errors = []) {
  const origins = [];
  const seen = new Set();
  for (const origin of Object.keys(ALLOWLIST)) {
    const runtime = originRuntime.get(origin);
    if (!runtime) continue;
    seen.add(origin);
    origins.push(originRowFromRuntime(origin, runtime));
  }
  for (const [origin, runtime] of originRuntime) {
    if (seen.has(origin)) continue;
    origins.push(originRowFromRuntime(origin, runtime));
  }
  return { generation, origins, errors };
}

function emitSnapshot(errors = []) {
  const snapshot = buildSnapshot(errors);
  onUpdate?.(snapshot);
  return snapshot;
}

function yieldBetweenStates() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    queueMicrotask(resolve);
  });
}

/**
 * Host-owner revocation: active|degraded|quarantined → revoking → revoked.
 * Withdraws proxies for the origin. Does not cancel in-flight side effects;
 * late results are dropped by executeProxy and recorded on dropRecords.
 *
 * @param {string} origin
 * @returns {Promise<object[]>} snapshots at revoking then revoked
 */
export async function revokeOrigin(origin) {
  const runtime = originRuntime.get(origin);
  if (!runtime) {
    throw new Error(`Cannot revoke unknown origin: ${origin}`);
  }

  runtime.inFlightAtRevoke = runtime.concurrencyGate.active();

  moveOrigin(runtime, 'revoking', 'Host owner requested revocation.');
  withdrawOriginProxies(origin);
  runtime.tools = [];

  const revokingSnapshot = emitSnapshot();
  await yieldBetweenStates();

  moveOrigin(runtime, 'revoked', 'Host owner revoked this origin; proxies withdrawn.');
  const revokedSnapshot = emitSnapshot();
  return [revokingSnapshot, revokedSnapshot];
}

/**
 * @param {string} origin
 * @param {{ state?: import('./lifecycle.js').OriginStateName, reason?: string, tools?: string[], dropRecords?: object[], proxyNames?: string[], inFlight?: number }} [opts]
 */
export function seedOriginForTests(
  origin,
  {
    state = 'active',
    reason = 'Seeded for tests.',
    tools = [],
    dropRecords = [],
    proxyNames = [],
    inFlight = 0
  } = {}
) {
  const runtime = getOriginRuntime(origin);
  runtime.state = { state, reason };
  runtime.tools = [...tools];
  runtime.dropRecords = [...dropRecords];
  runtime.inFlightAtRevoke = 0;
  runtime.concurrencyGate = createConcurrencyGate(MAX_CONCURRENT_EXECUTIONS_PER_ORIGIN);
  for (let i = 0; i < inFlight; i += 1) {
    runtime.concurrencyGate.tryAcquire();
  }
  for (const name of proxyNames) {
    registeredProxies.set(name, {
      sourceTool: {},
      abort: new AbortController(),
      origin
    });
  }
  return runtime;
}

export function setManifestForTests(manifest) {
  manifestCache = manifest;
}

async function loadManifest() {
  if (manifestCache) return manifestCache;
  if (typeof fetch === 'function') {
    const response = await fetch('/vendor/manifest.json');
    if (response.ok) {
      manifestCache = await response.json();
      return manifestCache;
    }
  }
  throw new Error('Manifest unavailable; pass setManifestForTests() in Node or deploy manifest.json.');
}

async function registerProxyForTool(tool, entry, origin, manifest) {
  const composed = composeName({
    vendorLabel: entry.vendorLabel,
    widgetId: entry.widgetId,
    verb: tool.name,
    windowRef: tool.window,
    instanceRegistry
  });
  if (!composed.ok) return composed;

  if (registeredProxies.has(composed.name)) {
    return { ok: true, name: composed.name };
  }

  let inputSchema;
  try {
    inputSchema = parseInputSchema(tool.inputSchema);
  } catch (cause) {
    return {
      ok: false,
      code: 'INPUT_SCHEMA_PARSE_FAILED',
      message: `Could not parse inputSchema for ${tool.name} @ ${origin}: ${String(cause && cause.message)}`
    };
  }

  const descriptionOutcome = buildEnvelope({
    origin,
    kind: 'description',
    value: typeof tool.description === 'string' ? tool.description : ''
  });
  if (!descriptionOutcome.ok) {
    return { ok: false, code: descriptionOutcome.code, message: descriptionOutcome.message };
  }

  const envelopedSchema = envelopeInputSchema(inputSchema, origin);
  const runtime = getOriginRuntime(origin);
  const abort = new AbortController();
  const sourceTool = tool;

  await document.modelContext.registerTool(
    {
      name: composed.name,
      description: descriptionOutcome.text,
      inputSchema: envelopedSchema,
      annotations: buildProxyAnnotations(tool),
      async execute(input) {
        const outcome = await executeProxy({
          sourceTool,
          input,
          origin,
          isRevoked: () =>
            runtime.state.state === 'revoked' || runtime.state.state === 'revoking',
          isUnavailable: () => !sourceTool || sourceTool.window?.closed === true,
          concurrencyGate: runtime.concurrencyGate,
          onDrop: (record) => {
            runtime.dropRecords.push(record);
          }
        });
        if (!outcome.ok) {
          return { content: [{ type: 'text', text: outcome.text }] };
        }
        return outcome.result;
      }
    },
    { signal: abort.signal }
  );

  registeredProxies.set(composed.name, { sourceTool, abort, origin });

  const published = {
    name: composed.name,
    description: descriptionOutcome.text,
    inputSchema: envelopedSchema,
    annotations: buildProxyAnnotations(tool),
    origin,
    sourceAnnotations: tool.annotations ?? {}
  };

  const publishedScreen = screenPublished({
    manifest,
    tools: [published],
    allowlist: ALLOWLIST
  });
  if (!publishedScreen.ok) {
    withdrawProxy(composed.name);
    return { ok: false, code: publishedScreen.code, message: publishedScreen.reason };
  }

  return { ok: true, name: composed.name };
}

export async function aggregateOnce() {
  if (passInFlight) {
    passQueued = true;
    return null;
  }

  passInFlight = true;
  const myGeneration = ++generation;

  /** @type {Array<{ origin: string, state: string, reason: string, tools: string[] }>} */
  const origins = [];
  /** @type {Array<{ origin: string, code: string, message: string }>} */
  const errors = [];

  try {
    const manifest = await loadManifest();
    const allowlistedOrigins = Object.keys(ALLOWLIST);
    const allTools = await document.modelContext.getTools({ fromOrigins: allowlistedOrigins });

    for (const origin of allowlistedOrigins) {
      if (myGeneration !== generation) {
        return null;
      }

      const entry = ALLOWLIST[origin];
      const runtime = getOriginRuntime(origin);
      const originTools = allTools.filter((tool) => tool.origin === origin);

      if (runtime.state.state === 'revoked' || runtime.state.state === 'revoking') {
        origins.push(originRowFromRuntime(origin, runtime));
        continue;
      }

      if (originTools.length === 0) {
        moveOrigin(runtime, 'evaluating', 'No tools reported on this pass.');
        moveOrigin(runtime, 'degraded', 'Embedded origin reported no tools.');
        origins.push(originRowFromRuntime(origin, runtime));
        continue;
      }

      runtime.changeTimestamps.push(Date.now());
      const rateCheck = checkSurfaceChangeRateBound(runtime.changeTimestamps);
      if (!rateCheck.ok) {
        withdrawOriginProxies(origin);
        moveOrigin(runtime, 'evaluating', rateCheck.message);
        moveOrigin(runtime, 'degraded', rateCheck.message);
        errors.push({ origin, code: rateCheck.code, message: rateCheck.message });
        runtime.tools = [];
        origins.push(originRowFromRuntime(origin, runtime, []));
        continue;
      }

      const countCheck = checkToolCountBound(originTools.length);
      if (!countCheck.ok) {
        withdrawOriginProxies(origin);
        moveOrigin(runtime, 'evaluating', countCheck.message);
        moveOrigin(runtime, 'degraded', countCheck.message);
        errors.push({ origin, code: countCheck.code, message: countCheck.message });
        runtime.tools = [];
        origins.push(originRowFromRuntime(origin, runtime, []));
        continue;
      }

      moveOrigin(runtime, 'evaluating', 'Evaluating widget tools.');

      const screen = screenOrigin({
        manifest,
        tools: originTools,
        origin,
        allowlist: ALLOWLIST
      });

      if (!screen.ok) {
        withdrawOriginProxies(origin);
        moveOrigin(runtime, 'quarantined', screen.reason);
        errors.push({ origin, code: screen.code, message: screen.reason });
        runtime.tools = [];
        origins.push(originRowFromRuntime(origin, runtime, []));
        continue;
      }

      /** @type {string[]} */
      const proxyNames = [];

      for (const tool of originTools) {
        const outcome = await registerProxyForTool(tool, entry, origin, manifest);
        if (outcome.ok) {
          proxyNames.push(outcome.name);
        } else {
          errors.push({ origin, code: outcome.code, message: outcome.message });
        }
      }

      runtime.tools = proxyNames;
      if (proxyNames.length > 0) {
        moveOrigin(runtime, 'active', 'Proxies registered on the governed surface.');
      } else {
        moveOrigin(runtime, 'degraded', 'No proxies could be registered.');
      }

      origins.push(originRowFromRuntime(origin, runtime, proxyNames));
    }

    if (myGeneration !== generation) {
      return null;
    }

    const snapshot = { generation: myGeneration, origins, errors };
    onUpdate?.(snapshot);
    return snapshot;
  } finally {
    passInFlight = false;
    if (passQueued) {
      passQueued = false;
      await aggregateOnce();
    }
  }
}

export function startAggregator(callback) {
  onUpdate = callback ?? null;

  const onToolchange = () => {
    aggregateOnce();
  };

  document.modelContext?.addEventListener?.('toolchange', onToolchange);
  aggregateOnce();

  return () => {
    document.modelContext?.removeEventListener?.('toolchange', onToolchange);
    onUpdate = null;
  };
}

export function getRegisteredProxyNames() {
  return [...registeredProxies.keys()];
}

export function getOriginRuntimeForTests(origin) {
  return originRuntime.get(origin);
}

export function resetAggregatorForTests() {
  for (const name of [...registeredProxies.keys()]) {
    withdrawProxy(name);
  }
  originRuntime.clear();
  instanceRegistry.clear();
  manifestCache = null;
  passInFlight = false;
  passQueued = false;
  generation = 0;
}
