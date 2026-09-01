// GENERATED FILE - DO NOT EDIT.
// Copied verbatim from src/shared/ by scripts/sync-sites.mjs.
// Edit the source in src/shared/ and re-run: node scripts/sync-sites.mjs
/**
 * Widget helper stub — PRO-7 replaces this with the real implementation.
 *
 * Registers one conformant tool. No authorization gate, no attestation,
 * no third-party origin-trial injection.
 */

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
  if (!widgetId || typeof widgetId !== 'string') {
    throw new TypeError('registerConformantTool requires a widgetId string.');
  }
  if (!name || typeof name !== 'string') {
    throw new TypeError('registerConformantTool requires a tool name string.');
  }
  if (!description || typeof description !== 'string') {
    throw new TypeError('registerConformantTool requires a description string.');
  }
  if (!inputSchema || typeof inputSchema !== 'object') {
    throw new TypeError('registerConformantTool requires an inputSchema object.');
  }
  if (typeof readOnly !== 'boolean') {
    throw new TypeError('registerConformantTool requires readOnly as a boolean.');
  }
  if (!Array.isArray(exposedTo) || exposedTo.length === 0) {
    throw new TypeError('registerConformantTool requires a non-empty exposedTo array.');
  }
  if (typeof execute !== 'function') {
    throw new TypeError('registerConformantTool requires an execute function.');
  }
  if (!readOnly && typeof authorize !== 'function') {
    throw new TypeError('registerConformantTool requires authorize when readOnly is false.');
  }

  if (!document.modelContext || typeof document.modelContext.registerTool !== 'function') {
    throw new Error('document.modelContext.registerTool is unavailable.');
  }

  const wrappedExecute = readOnly
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

  await document.modelContext.registerTool(
    {
      name,
      description,
      inputSchema,
      annotations: {
        readOnlyHint: readOnly,
        untrustedContentHint: untrustedContent
      },
      execute: wrappedExecute
    },
    { exposedTo }
  );
}
