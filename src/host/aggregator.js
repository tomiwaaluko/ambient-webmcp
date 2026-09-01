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
 * @typedef {{ state: OriginState, tools: string[], changeTimestamps: number[], dropRecords: object[], concurrencyGate: ReturnType<typeof createConcurrencyGate> }} OriginRuntime
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

      if (originTools.length === 0) {
        if (runtime.state.state !== 'revoked' && runtime.state.state !== 'revoking') {
          moveOrigin(runtime, 'evaluating', 'No tools reported on this pass.');
          moveOrigin(runtime, 'degraded', 'Embedded origin reported no tools.');
        }
        origins.push({
          origin,
          state: runtime.state.state,
          reason: runtime.state.reason,
          tools: runtime.tools
        });
        continue;
      }

      runtime.changeTimestamps.push(Date.now());
      const rateCheck = checkSurfaceChangeRateBound(runtime.changeTimestamps);
      if (!rateCheck.ok) {
        withdrawOriginProxies(origin);
        moveOrigin(runtime, 'evaluating', rateCheck.message);
        moveOrigin(runtime, 'degraded', rateCheck.message);
        errors.push({ origin, code: rateCheck.code, message: rateCheck.message });
        origins.push({
          origin,
          state: runtime.state.state,
          reason: runtime.state.reason,
          tools: []
        });
        continue;
      }

      const countCheck = checkToolCountBound(originTools.length);
      if (!countCheck.ok) {
        withdrawOriginProxies(origin);
        moveOrigin(runtime, 'evaluating', countCheck.message);
        moveOrigin(runtime, 'degraded', countCheck.message);
        errors.push({ origin, code: countCheck.code, message: countCheck.message });
        origins.push({
          origin,
          state: runtime.state.state,
          reason: runtime.state.reason,
          tools: []
        });
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
        origins.push({
          origin,
          state: runtime.state.state,
          reason: runtime.state.reason,
          tools: []
        });
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

      origins.push({
        origin,
        state: runtime.state.state,
        reason: runtime.state.reason,
        tools: proxyNames
      });
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
