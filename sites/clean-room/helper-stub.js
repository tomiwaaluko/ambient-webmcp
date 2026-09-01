/**
 * Local stub of the widget helper public API in HELPER-API.txt.
 * Not a host aggregator. Not the vendor helper implementation.
 */

const PASSTHROUGH_NAMES = new Set([
  "context",
  "passthrough",
  "prompt",
  "instructions",
  "raw",
  "extra",
]);

const registeredTools = [];
const attestationsByWidget = new Map();

export class ConformanceRefusal extends Error {
  /**
   * @param {string} code SCREAMING_SNAKE reason code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "ConformanceRefusal";
    this.code = code;
  }
}

function isNodeRuntime() {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function stubRegisterTool(descriptor, options) {
  registeredTools.push({
    descriptor,
    options,
    widgetId: undefined,
  });
  return Promise.resolve();
}

function ensureRegisterTool() {
  if (isNodeRuntime()) {
    if (typeof globalThis.document === "undefined") {
      globalThis.document = {};
    }
    if (!globalThis.document.modelContext) {
      globalThis.document.modelContext = {};
    }
    if (typeof globalThis.document.modelContext.registerTool !== "function") {
      globalThis.document.modelContext.registerTool = stubRegisterTool;
    }
  }

  if (
    typeof globalThis.document === "undefined" ||
    !globalThis.document.modelContext ||
    typeof globalThis.document.modelContext.registerTool !== "function"
  ) {
    throw new ConformanceRefusal(
      "MODEL_CONTEXT_UNAVAILABLE",
      "document.modelContext.registerTool is not available."
    );
  }
}

function isConcreteHttpsOrigin(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (value.includes("*")) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}

function walkSchemaForPassthrough(schema, path) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    return;
  }
  const properties = schema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const key of Object.keys(properties)) {
      if (PASSTHROUGH_NAMES.has(key.toLowerCase())) {
        throw new ConformanceRefusal(
          "INPUT_SHAPE_UNSUPPORTED",
          `inputSchema property "${key}" at ${path} is a free-form passthrough field.`
        );
      }
      walkSchemaForPassthrough(properties[key], `${path}.properties.${key}`);
    }
  }
  if (schema.items) {
    walkSchemaForPassthrough(schema.items, `${path}.items`);
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((entry, i) => walkSchemaForPassthrough(entry, `${path}.anyOf[${i}]`));
  }
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((entry, i) => walkSchemaForPassthrough(entry, `${path}.oneOf[${i}]`));
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((entry, i) => walkSchemaForPassthrough(entry, `${path}.allOf[${i}]`));
  }
}

function assertClosedObjectSchema(schema) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new ConformanceRefusal(
      "INPUT_SCHEMA_PARSE_FAILED",
      "inputSchema must be a JSON Schema object."
    );
  }
  if (schema.type !== "object") {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "inputSchema must be a closed object schema (type: object)."
    );
  }
  if (schema.additionalProperties !== false) {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "inputSchema must be closed with additionalProperties: false."
    );
  }
  walkSchemaForPassthrough(schema, "inputSchema");
}

function widgetOrigin() {
  if (typeof globalThis.location !== "undefined" && globalThis.location.origin) {
    return globalThis.location.origin;
  }
  return "https://example.com";
}

function claim(statement, enforcedBy) {
  return { statement, enforcedBy };
}

function publishAttestation(widgetId, exposedTo) {
  const attestation = {
    widgetId,
    origin: widgetOrigin(),
    version: 1,
    attestedRules: ["W2", "W3", "W9", "W10"],
    claims: {
      exposedToScoped: claim(
        "exposedTo lists only concrete HTTPS origins that embed this widget; no wildcards.",
        "registerConformantTool refuses empty, wildcard, and non-HTTPS exposedTo values."
      ),
      untrustedContentMarked: claim(
        "Every tool that returns content this widget did not author is marked with untrustedContent.",
        "Vendor attestation. Helper records the declared untrustedContent flag; it does not verify authorship."
      ),
      authorizationEnforced: claim(
        "Mutating tools confirm with the user and honor session permissions before any side effect.",
        "registerConformantTool requires authorize when readOnly is false and wraps execute so a denied result does not run execute."
      ),
      noSensitiveValues: claim(
        "Tools neither accept nor return credentials, secrets, tokens, or payment instrument numbers.",
        "Vendor attestation of this widget's parameters and results."
      ),
    },
  };

  attestationsByWidget.set(widgetId, attestation);
  globalThis.__ambientAttestation = attestation;
  globalThis.__ambientAttestations = Object.fromEntries(attestationsByWidget);
}

function wrapExecute(readOnly, authorize, execute) {
  return async function wrappedExecute(input) {
    if (readOnly === false) {
      const allowed = await Promise.resolve(authorize(input));
      if (allowed !== true) {
        throw new ConformanceRefusal(
          "AUTHORIZATION_DENIED",
          "Authorization was not granted; the mutating execute function was not called."
        );
      }
    }
    return execute(input);
  };
}

function rememberRegistration(widgetId, descriptor, exposedTo) {
  const existing = registeredTools.find((entry) => entry.descriptor === descriptor);
  if (existing) {
    existing.widgetId = widgetId;
    existing.options = { exposedTo };
    return;
  }
  registeredTools.push({
    widgetId,
    descriptor,
    options: { exposedTo },
  });
}

/**
 * @param {{
 *   widgetId: string,
 *   name: string,
 *   description: string,
 *   inputSchema: object,
 *   readOnly: boolean,
 *   untrustedContent?: boolean,
 *   exposedTo: string[],
 *   authorize?: (input: unknown) => boolean | Promise<boolean>,
 *   execute: (input: unknown) => unknown | Promise<unknown>,
 * }} spec
 * @returns {Promise<void>}
 */
export async function registerConformantTool(spec) {
  if (spec === null || typeof spec !== "object") {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "registerConformantTool requires a specification object."
    );
  }

  const {
    widgetId,
    name,
    description,
    inputSchema,
    readOnly,
    untrustedContent,
    exposedTo,
    authorize,
    execute,
  } = spec;

  if (typeof widgetId !== "string" || widgetId.length === 0 || widgetId.includes(".")) {
    throw new ConformanceRefusal(
      "WIDGET_ID_INVALID",
      "widgetId must be a non-empty widget-owned identifier with no vendor label and no '.'."
    );
  }

  if (typeof name !== "string" || name.length === 0 || name.includes(".")) {
    throw new ConformanceRefusal(
      "NAME_ILLEGAL_CHARS",
      "name must be a non-empty unqualified verb with no '.'."
    );
  }

  if (typeof description !== "string") {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "description must be a string."
    );
  }

  if (typeof readOnly !== "boolean") {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "readOnly must be a boolean."
    );
  }

  if (untrustedContent !== undefined && typeof untrustedContent !== "boolean") {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "untrustedContent must be a boolean when provided."
    );
  }

  if (!Array.isArray(exposedTo) || exposedTo.length === 0) {
    throw new ConformanceRefusal(
      "EXPOSED_TO_INVALID",
      "exposedTo must be a non-empty array of concrete HTTPS origin strings."
    );
  }
  for (const origin of exposedTo) {
    if (!isConcreteHttpsOrigin(origin)) {
      throw new ConformanceRefusal(
        "EXPOSED_TO_INVALID",
        `exposedTo entry ${JSON.stringify(origin)} is not a concrete HTTPS origin (no wildcards).`
      );
    }
  }

  assertClosedObjectSchema(inputSchema);

  if (typeof execute !== "function") {
    throw new ConformanceRefusal(
      "INPUT_SHAPE_UNSUPPORTED",
      "execute must be a function."
    );
  }

  if (readOnly === false && typeof authorize !== "function") {
    throw new ConformanceRefusal(
      "AUTHORIZE_REQUIRED",
      "authorize is required when readOnly is false."
    );
  }

  ensureRegisterTool();

  const annotations = {
    readOnlyHint: readOnly,
  };
  if (untrustedContent === true) {
    annotations.untrustedContentHint = true;
  }

  const descriptor = {
    name,
    description,
    inputSchema,
    annotations,
    execute: wrapExecute(readOnly, authorize, execute),
  };

  // exposedTo is the registerTool second argument, not a field on the descriptor.
  await globalThis.document.modelContext.registerTool(descriptor, { exposedTo });
  rememberRegistration(widgetId, descriptor, exposedTo);
  publishAttestation(widgetId, exposedTo);
}

export function getRegisteredTools() {
  return registeredTools.map((entry) => ({
    name: entry.descriptor.name,
    description: entry.descriptor.description,
    inputSchema: entry.descriptor.inputSchema,
    annotations: {
      readOnlyHint: entry.descriptor.annotations.readOnlyHint,
      ...(entry.descriptor.annotations.untrustedContentHint === true
        ? { untrustedContentHint: true }
        : {}),
    },
    execute: entry.descriptor.execute,
  }));
}

export function getAttestation(widgetId) {
  if (widgetId) {
    return attestationsByWidget.get(widgetId) ?? null;
  }
  const only = [...attestationsByWidget.values()];
  return only.length === 1 ? only[0] : only;
}

export function getAttestations() {
  return Object.fromEntries(attestationsByWidget);
}
