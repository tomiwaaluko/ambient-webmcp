// GENERATED FILE - DO NOT EDIT.
// Copied from src/host/ by scripts/sync-sites.mjs (import paths adjusted for deployment).
// Edit the source in src/host/ and re-run: node scripts/sync-sites.mjs
/**
 * Host aggregator — phases 1-2: discovery, naming, screening, envelope.
 *
 * Governed surface is the default one; raw widget tools remain reachable via
 * getTools({ fromOrigins }) from host script (spike Q5).
 */

import { ALLOWLIST } from '../allowlist.js';
import { composeName } from './naming.js';
import { buildEnvelope, buildFailureEnvelope } from './envelope.js';
import { screenOrigin, screenPublished } from './screening.js';
import { executeToolCompat } from '../vendor/adapter.js';

export { ALLOWLIST };

/** @type {Map<string, { sourceTool: object, abort: AbortController, origin: string }>} */
const registeredProxies = new Map();

/** @type {Map<string, { state: string, reason: string, tools: string[] }>} */
const originStates = new Map();

/** @type {Map<string, { window: object }>} */
const instanceRegistry = new Map();

let passInFlight = false;
let passQueued = false;
let generation = 0;

/** @type {((snapshot: object) => void) | null} */
let onUpdate = null;

/** @type {object | null} */
let manifestCache = null;

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

function getOriginState(origin) {
  let state = originStates.get(origin);
  if (!state) {
    state = { state: 'discovering', reason: 'Origin discovered.', tools: [] };
    originStates.set(origin, state);
  }
  return state;
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
  const abort = new AbortController();
  const sourceTool = tool;

  await document.modelContext.registerTool(
    {
      name: composed.name,
      description: descriptionOutcome.text,
      inputSchema: envelopedSchema,
      annotations: buildProxyAnnotations(tool),
      async execute(input) {
        const outcome = await executeToolCompat(sourceTool, input);
        if (!outcome.ok) {
          const { text } = buildFailureEnvelope({
            origin,
            code: outcome.code,
            message: outcome.message
          });
          return { content: [{ type: 'text', text }] };
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
    origin: globalThis.location?.origin ?? 'https://ambient-host-tomiwaalukos-projects.vercel.app',
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
      const runtime = getOriginState(origin);
      const originTools = allTools.filter((tool) => tool.origin === origin);

      if (originTools.length === 0) {
        runtime.state = 'degraded';
        runtime.reason = 'Embedded origin reported no tools.';
        origins.push({
          origin,
          state: runtime.state,
          reason: runtime.reason,
          tools: runtime.tools
        });
        continue;
      }

      const screen = screenOrigin({
        manifest,
        tools: originTools,
        origin,
        allowlist: ALLOWLIST
      });

      if (!screen.ok) {
        withdrawOriginProxies(origin);
        runtime.state = 'quarantined';
        runtime.reason = screen.reason;
        runtime.tools = [];
        errors.push({ origin, code: screen.code, message: screen.reason });
        origins.push({
          origin,
          state: runtime.state,
          reason: runtime.reason,
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
      runtime.state = proxyNames.length > 0 ? 'active' : 'degraded';
      runtime.reason =
        proxyNames.length > 0
          ? 'Proxies registered on the governed surface.'
          : 'No proxies could be registered.';

      origins.push({
        origin,
        state: runtime.state,
        reason: runtime.reason,
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

export function resetAggregatorForTests() {
  for (const name of [...registeredProxies.keys()]) {
    withdrawProxy(name);
  }
  originStates.clear();
  instanceRegistry.clear();
  manifestCache = null;
  passInFlight = false;
  passQueued = false;
  generation = 0;
}
