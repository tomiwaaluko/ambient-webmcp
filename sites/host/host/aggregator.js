// GENERATED FILE - DO NOT EDIT.
// Copied verbatim from src/shared/ by scripts/sync-sites.mjs.
// Edit the source in src/shared/ and re-run: node scripts/sync-sites.mjs
/**
 * Skeletal host aggregator — PRO-8 replaces this with the full pipeline.
 *
 * One pass: discover allowlisted widget tools, compose namespaced proxy names,
 * register proxies in the host document. Single-flight guard only.
 */

import { composeName } from './naming.js';
import { executeToolCompat } from '../vendor/adapter.js';

/** @typedef {{ vendorLabel: string, widgetId: string }} AllowlistEntry */

/** Canonical allowlist for the walking skeleton. */
export const ALLOWLIST = Object.freeze({
  'https://acme-booking-tomiwaalukos-projects.vercel.app': {
    vendorLabel: 'acme',
    widgetId: 'booking'
  }
});

/** @type {Map<string, object>} composed proxy name -> source RegisteredTool handle */
const registeredProxies = new Map();

let passInFlight = false;
let passQueued = false;
let generation = 0;

/** @type {((snapshot: object) => void) | null} */
let onUpdate = null;

/**
 * @param {unknown} inputSchema
 * @returns {object}
 */
function parseInputSchema(inputSchema) {
  if (typeof inputSchema === 'string') {
    return JSON.parse(inputSchema);
  }
  return inputSchema;
}

/**
 * @param {object} tool descriptor from getTools()
 * @param {AllowlistEntry} entry
 * @returns {Promise<{ ok: true, name: string } | { ok: false, code: string, message: string }>}
 */
async function registerProxyForTool(tool, entry) {
  const composed = composeName({
    vendorLabel: entry.vendorLabel,
    widgetId: entry.widgetId,
    verb: tool.name
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
      message: `Could not parse inputSchema for ${tool.name} @ ${tool.origin}: ${String(cause && cause.message)}`
    };
  }

  await document.modelContext.registerTool({
    name: composed.name,
    description: tool.description,
    inputSchema,
    annotations: {
      readOnlyHint: tool.annotations?.readOnlyHint ?? true,
      untrustedContentHint: tool.annotations?.untrustedContentHint ?? false
    },
    async execute(input) {
      const outcome = await executeToolCompat(tool, input);
      if (!outcome.ok) {
        throw new Error(`${outcome.code}: ${outcome.message}`);
      }
      return outcome.result;
    }
  });

  registeredProxies.set(composed.name, tool);
  return { ok: true, name: composed.name };
}

/**
 * Run one aggregation pass across all allowlisted origins.
 * @returns {Promise<{ generation: number, origins: Array<{ origin: string, state: string, tools: string[] }>, errors: Array<{ origin: string, code: string, message: string }> }>}
 */
export async function aggregateOnce() {
  if (passInFlight) {
    passQueued = true;
    return null;
  }

  passInFlight = true;
  const myGeneration = ++generation;

  /** @type {Array<{ origin: string, state: string, tools: string[] }>} */
  const origins = [];
  /** @type {Array<{ origin: string, code: string, message: string }>} */
  const errors = [];

  try {
    const allowlistedOrigins = Object.keys(ALLOWLIST);
    const allTools = await document.modelContext.getTools({ fromOrigins: allowlistedOrigins });

    for (const origin of allowlistedOrigins) {
      const entry = ALLOWLIST[origin];
      const originTools = allTools.filter((tool) => tool.origin === origin);
      /** @type {string[]} */
      const proxyNames = [];

      for (const tool of originTools) {
        const outcome = await registerProxyForTool(tool, entry);
        if (outcome.ok) {
          proxyNames.push(outcome.name);
        } else {
          errors.push({ origin, code: outcome.code, message: outcome.message });
        }
      }

      if (proxyNames.length > 0) {
        origins.push({ origin, state: 'active', tools: proxyNames });
      }
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

/**
 * Wire toolchange-driven re-aggregation.
 * @param {(snapshot: object) => void} [callback]
 * @returns {() => void} teardown
 */
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

/**
 * Names of proxy tools registered so far. For tests and the skeleton console.
 * @returns {string[]}
 */
export function getRegisteredProxyNames() {
  return [...registeredProxies.keys()];
}
