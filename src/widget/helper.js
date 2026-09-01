/**
 * Conformant registerTool wrapper for widget vendors (PRO-7 / U5).
 *
 * Refuses non-conformant registrations at call time, injects the third-party
 * origin trial token, emits attestation, and wraps mutating tool execution so
 * authorization cannot be bypassed through the registered execute handle.
 */

import { ensureOriginTrialInjected } from './origin-trial.js';
import { publishAttestation } from './attest.js';

/** Parameter names treated as free-form context/passthrough fields (R8). */
const PASSTHROUGH_PARAM_NAMES = new Set([
  'context',
  'passthrough',
  'prompt',
  'instructions',
  'raw',
  'extra'
]);

/**
 * Refusal with a machine-readable reason code.
 */
export class ConformanceRefusal extends Error {
  /**
   * @param {string} code SCREAMING_SNAKE reason code
   * @param {string} message human-readable explanation
   */
  constructor(code, message) {
    super(message);
    this.name = 'ConformanceRefusal';
    this.code = code;
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {never}
 */
function refuse(code, message) {
  throw new ConformanceRefusal(code, message);
}

/**
 * @param {string} widgetId
 * @returns {void}
 */
export function validateWidgetId(widgetId) {
  if (!widgetId || typeof widgetId !== 'string') {
    refuse('WIDGET_ID_REQUIRED', 'registerConformantTool requires a widgetId string.');
  }
  if (widgetId.includes('.')) {
    refuse(
      'WIDGET_ID_SEPARATOR',
      'widgetId must not contain "." — the vendor segment is assigned by the host, not the widget.'
    );
  }
}

/**
 * @param {string[]} exposedTo
 * @returns {void}
 */
export function validateExposedTo(exposedTo) {
  if (!Array.isArray(exposedTo) || exposedTo.length === 0) {
    refuse('EXPOSED_TO_REQUIRED', 'registerConformantTool requires a non-empty exposedTo array.');
  }

  for (const origin of exposedTo) {
    if (typeof origin !== 'string' || origin.length === 0) {
      refuse('EXPOSED_TO_INVALID', 'Every exposedTo entry must be a non-empty origin string.');
    }
    if (origin.includes('*')) {
      refuse(
        'EXPOSED_TO_WILDCARD',
        'exposedTo must list concrete host origins; wildcards are refused.'
      );
    }
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      refuse('EXPOSED_TO_INVALID', `exposedTo entry is not a valid URL: ${origin}`);
    }
    if (parsed.protocol !== 'https:') {
      refuse(
        'EXPOSED_TO_INSECURE',
        'exposedTo entries must use HTTPS origins.'
      );
    }
  }
}

/**
 * @param {string} name
 * @param {unknown} schema
 * @returns {boolean}
 */
function isPassthroughProperty(name, schema) {
  if (typeof name !== 'string') return false;
  if (PASSTHROUGH_PARAM_NAMES.has(name.toLowerCase())) return true;
  if (!schema || typeof schema !== 'object') return false;

  /** @type {Record<string, unknown>} */
  const node = /** @type {Record<string, unknown>} */ (schema);

  if (node.type === 'object') {
    if (node.additionalProperties === true) return true;
    if (!node.properties && node.additionalProperties !== false) return true;
  }

  return false;
}

/**
 * Walk inputSchema for free-form context/passthrough parameters (R8).
 *
 * @param {unknown} inputSchema
 * @returns {void}
 */
export function validateInputSchema(inputSchema) {
  if (!inputSchema || typeof inputSchema !== 'object') {
    refuse('INPUT_SCHEMA_REQUIRED', 'registerConformantTool requires an inputSchema object.');
  }

  /** @type {Record<string, unknown>} */
  const schema = /** @type {Record<string, unknown>} */ (inputSchema);

  if (schema.additionalProperties !== false) {
    refuse(
      'SCHEMA_ADDITIONAL_PROPERTIES',
      'inputSchema must set additionalProperties to false — omitting it leaves a passthrough channel open.'
    );
  }

  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    for (const [name, propSchema] of Object.entries(
      /** @type {Record<string, unknown>} */ (properties)
    )) {
      if (isPassthroughProperty(name, propSchema)) {
        refuse(
          'SCHEMA_PASSTHROUGH_FIELD',
          `inputSchema property "${name}" is refused as a free-form context or passthrough field.`
        );
      }
    }
  }
}

/**
 * Notify the embedder that this widget's tool surface changed (R10).
 *
 * @param {'register' | 'abort'} change
 * @param {object} detail
 * @returns {void}
 */
export function notifySurfaceChange(change, detail) {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;

  window.parent.postMessage(
    {
      source: 'ambient-widget-helper',
      type: 'surface-change',
      change,
      ...detail
    },
    '*'
  );
}

/**
 * @param {object} opts
 * @param {string} opts.widgetId
 * @param {string} opts.name
 * @param {string} opts.description
 * @param {object} opts.inputSchema
 * @param {boolean} opts.readOnly
 * @param {boolean} [opts.untrustedContent]
 * @param {string[]} opts.exposedTo
 * @param {((input: unknown) => boolean | Promise<boolean>) | undefined} [opts.authorize]
 * @param {(input: unknown) => unknown | Promise<unknown>} opts.execute
 * @returns {Promise<void>}
 */
export async function registerConformantTool({
  widgetId,
  name,
  description,
  inputSchema,
  readOnly,
  untrustedContent = false,
  exposedTo,
  authorize,
  execute
}) {
  validateWidgetId(widgetId);

  if (!name || typeof name !== 'string') {
    refuse('TOOL_NAME_REQUIRED', 'registerConformantTool requires a tool name string.');
  }
  if (!description || typeof description !== 'string') {
    refuse('TOOL_DESCRIPTION_REQUIRED', 'registerConformantTool requires a description string.');
  }

  validateInputSchema(inputSchema);
  validateExposedTo(exposedTo);

  if (typeof readOnly !== 'boolean') {
    refuse('READ_ONLY_REQUIRED', 'registerConformantTool requires readOnly as a boolean.');
  }
  if (typeof execute !== 'function') {
    refuse('EXECUTE_REQUIRED', 'registerConformantTool requires an execute function.');
  }
  if (!readOnly && typeof authorize !== 'function') {
    refuse(
      'AUTHORIZE_REQUIRED',
      'registerConformantTool requires authorize when readOnly is false.'
    );
  }

  if (typeof document === 'undefined' || !document.modelContext) {
    refuse(
      'MODEL_CONTEXT_UNAVAILABLE',
      'document.modelContext.registerTool is unavailable.'
    );
  }
  if (typeof document.modelContext.registerTool !== 'function') {
    refuse(
      'MODEL_CONTEXT_UNAVAILABLE',
      'document.modelContext.registerTool is unavailable.'
    );
  }

  // Token injection must finish before registerTool is awaited (Q6 / U5).
  ensureOriginTrialInjected();

  publishAttestation({ widgetId });

  /**
   * Platform-facing execute handle. Authorization runs here — the vendor's
   * execute is never registered directly, so calling the registered tool
   * cannot bypass authorize().
   */
  const platformExecute = readOnly
    ? execute
    : async (input) => {
        const allowed = await authorize(input);
        if (!allowed) {
          return {
            content: [{ type: 'text', text: 'Authorization refused this call.' }],
            isError: true
          };
        }
        return execute(input);
      };

  try {
    await document.modelContext.registerTool(
      {
        name,
        description,
        inputSchema,
        annotations: {
          readOnlyHint: readOnly,
          untrustedContentHint: untrustedContent
        },
        execute: platformExecute
      },
      { exposedTo }
    );

    notifySurfaceChange('register', { widgetId, name });
  } catch (cause) {
    notifySurfaceChange('abort', {
      widgetId,
      name,
      message: cause instanceof Error ? cause.message : String(cause)
    });
    throw cause;
  }
}
