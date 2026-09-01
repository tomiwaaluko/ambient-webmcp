/**
 * executeTool input-shape compatibility.
 *
 * The WebMCP spec types `executeTool`'s second argument as a WebIDL `object`.
 * Chrome's imperative-API documentation passes a JSON **string**. They
 * disagree, so a call written against either one alone breaks on the other.
 *
 * Observed on Chrome 151.0.7922.174 (origin trial WebMCP, id
 * 4163014905550602241) — see `docs/spike-report.md`, Q3:
 *
 *   executeTool(tool, '{"q":"hi"}')  -> resolves; returns a JSON **string**
 *   executeTool(tool, { q: 'hi' })   -> throws DOMException
 *                                       name    = 'UnknownError'
 *                                       message = 'Failed to parse input arguments'
 *
 * Two facts make runtime detection safe rather than reckless:
 *
 * 1. The rejected shape fails during argument parsing, *before* the tool's
 *    own `execute()` runs. This was measured with an invocation counter: after
 *    a failed object-form call the counter read 0. Probing the other shape
 *    therefore cannot fire a side effect twice on this build.
 * 2. The failure carries no shape-specific signal — a malformed JSON string
 *    throws the identical `UnknownError: Failed to parse input arguments`.
 *    So the shape cannot be inferred from the error; it has to be tried.
 *
 * Because fact 1 is a property of the current build and not a guarantee, the
 * winning shape is cached after the first success and every later call uses it
 * directly. Only the first call in a page's lifetime can probe twice.
 */

/** @typedef {'json-string' | 'object'} InputShape */

/** Shapes tried, in order. JSON string first: it is what Chrome 151 accepts. */
const SHAPE_ORDER = /** @type {InputShape[]} */ (['json-string', 'object']);

/** @type {InputShape | null} Winning shape for this document, once known. */
let cachedShape = null;

/**
 * The shape that last succeeded, or null if no call has succeeded yet.
 * @returns {InputShape | null}
 */
export function getInputShape() {
  return cachedShape;
}

/**
 * Forget the cached shape. Exists for tests; production code has no reason to
 * call it.
 * @returns {void}
 */
export function resetInputShape() {
  cachedShape = null;
}

/**
 * Coerce `input` into one concrete shape.
 * @param {InputShape} shape
 * @param {unknown} input
 * @returns {unknown}
 */
function coerce(shape, input) {
  if (shape === 'json-string') {
    return typeof input === 'string' ? input : JSON.stringify(input ?? {});
  }
  return typeof input === 'string' ? JSON.parse(input) : (input ?? {});
}

/**
 * Chrome 151 returns the tool result as a JSON string. The spec returns an
 * object. Accept either and hand back structured data, but never silently
 * discard something unparseable.
 * @param {unknown} raw
 * @returns {{ ok: true, result: unknown } | { ok: false, code: string, message: string }}
 */
function parseResult(raw) {
  if (typeof raw !== 'string') return { ok: true, result: raw };
  try {
    return { ok: true, result: JSON.parse(raw) };
  } catch (cause) {
    return {
      ok: false,
      code: 'RESULT_PARSE_FAILED',
      message: `Tool returned a string that is not JSON: ${String(cause && cause.message)}`
    };
  }
}

/**
 * Execute a tool without caring which input shape the running browser wants.
 *
 * @param {object} tool  A RegisteredTool handle from `getTools()`. Chrome
 *   rejects a bare tool *name* here with a TypeError, so pass the handle.
 * @param {unknown} input  Tool arguments as a plain object, or as a JSON
 *   string. Either is accepted; this function converts as needed.
 * @returns {Promise<{ ok: true, result: unknown, shape: InputShape }
 *                 | { ok: false, code: string, message: string }>}
 */
export async function executeToolCompat(tool, input) {
  if (!tool || typeof tool !== 'object') {
    return {
      ok: false,
      code: 'TOOL_HANDLE_INVALID',
      message: 'executeToolCompat needs a RegisteredTool handle from getTools(), not a name.'
    };
  }

  const modelContext = globalThis.document && globalThis.document.modelContext;
  if (!modelContext || typeof modelContext.executeTool !== 'function') {
    return {
      ok: false,
      code: 'MODEL_CONTEXT_UNAVAILABLE',
      message: 'document.modelContext.executeTool is not available. WebMCP is off or the origin trial token is missing.'
    };
  }

  const shapes = cachedShape ? [cachedShape] : SHAPE_ORDER;
  const failures = [];

  for (const shape of shapes) {
    let coerced;
    try {
      coerced = coerce(shape, input);
    } catch (cause) {
      failures.push(`${shape}: input could not be coerced (${String(cause && cause.message)})`);
      continue;
    }

    let raw;
    try {
      raw = await modelContext.executeTool(tool, coerced);
    } catch (cause) {
      failures.push(`${shape}: ${String(cause && cause.name)}: ${String(cause && cause.message)}`);
      continue;
    }

    // Reaching here means the platform accepted this shape. Record it so no
    // later call re-probes, then report any result-parsing problem separately —
    // a bad result must not be misread as a bad input shape.
    cachedShape = shape;
    const parsed = parseResult(raw);
    if (!parsed.ok) return parsed;
    return { ok: true, result: parsed.result, shape };
  }

  return {
    ok: false,
    code: 'INPUT_SHAPE_UNSUPPORTED',
    message: `executeTool refused every known input shape. Attempts: ${failures.join(' | ')}`
  };
}
