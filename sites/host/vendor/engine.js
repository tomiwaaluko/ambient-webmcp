// GENERATED FILE - DO NOT EDIT.
// Copied from src/checker/engine.js by scripts/sync-sites.mjs (import paths adjusted).
// Edit the source in src/checker/engine.js and re-run: node scripts/sync-sites.mjs
/**
 * Manifest-driven conformance engine.
 *
 * One evaluation path for the CLI gate and the in-page inspector. Evidence
 * class is always the rule's declared class — an attestation can never surface
 * as mechanical, and an observed result is only reported when a harness ran.
 *
 * @module src/checker/engine.js
 */

import { matchPatternSet } from './patterns.js';

export const UNKNOWN_CHECK = 'UNKNOWN_CHECK';
export const SUBJECT_INVALID = 'SUBJECT_INVALID';

const CHECKS = {
  'tool-name-segments': checkToolNameSegments,
  'input-schema-shape': checkInputSchemaShape,
  'text-pattern-absent': checkTextPatternAbsent,
  'attestation-present': checkAttestationPresent,
  'attestation-claim': checkAttestationClaim,
  'origin-allowlisted': checkOriginAllowlisted,
  'composed-name-valid': checkComposedNameValid,
  'envelope-shape': checkEnvelopeShape,
  'annotation-preserved': checkAnnotationPreserved,
  'harness-probe': checkHarnessProbe
};

/**
 * @param {{ manifest: object, subject: { tools: object[], attestation?: object, role?: string, allowlist?: object[] }, harness?: { probe: Function } }} args
 * @returns {{ ruleId: string, result: 'pass'|'fail'|'not-evaluable', evidence: 'mechanical'|'attested'|'observed', message: string }[]}
 */
export function evaluate({ manifest, subject, harness }) {
  if (!manifest || !Array.isArray(manifest.rules)) {
    const err = new Error('SUBJECT_INVALID: manifest.rules must be an array');
    err.code = SUBJECT_INVALID;
    throw err;
  }
  if (!subject || !Array.isArray(subject.tools)) {
    const err = new Error('SUBJECT_INVALID: subject.tools must be an array');
    err.code = SUBJECT_INVALID;
    throw err;
  }

  const role = subject.role ?? 'widget';
  const results = [];

  for (const rule of manifest.rules) {
    const check = rule.predicate?.check;
    if (!check || typeof CHECKS[check] !== 'function') {
      const err = new Error(
        `UNKNOWN_CHECK: manifest rule ${rule.id} names check "${check}", which the engine does not implement`
      );
      err.code = UNKNOWN_CHECK;
      throw err;
    }

    if (rule.role && rule.role !== role) {
      results.push({
        ruleId: rule.id,
        result: 'not-evaluable',
        evidence: rule.evidence,
        message: `Rule ${rule.id} applies to ${rule.role} subjects; this subject is ${role}.`
      });
      continue;
    }

    const outcome = CHECKS[check](rule, subject, harness, manifest);
    results.push({
      ruleId: rule.id,
      result: outcome.result,
      evidence: rule.evidence,
      message: outcome.message
    });
  }

  return results;
}

function toolsOf(subject) {
  return subject.tools;
}

function parseInputSchema(inputSchema, toolName) {
  if (inputSchema == null) {
    return {
      ok: false,
      code: 'INPUT_SCHEMA_PARSE_FAILED',
      message: `INPUT_SCHEMA_PARSE_FAILED: tool "${toolName}" has no inputSchema.`
    };
  }
  if (typeof inputSchema === 'object') {
    return { ok: true, schema: inputSchema };
  }
  if (typeof inputSchema !== 'string') {
    return {
      ok: false,
      code: 'INPUT_SCHEMA_PARSE_FAILED',
      message: `INPUT_SCHEMA_PARSE_FAILED: tool "${toolName}" inputSchema is not a string or object.`
    };
  }
  try {
    return { ok: true, schema: JSON.parse(inputSchema) };
  } catch {
    return {
      ok: false,
      code: 'INPUT_SCHEMA_PARSE_FAILED',
      message: `INPUT_SCHEMA_PARSE_FAILED: tool "${toolName}" inputSchema is not valid JSON.`
    };
  }
}

function isUnconstrainedString(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.type !== 'string' && schema.type !== undefined) return false;
  if (schema.enum || schema.const || schema.pattern || schema.format) return false;
  if (schema.maxLength != null || schema.minLength != null) return false;
  return schema.type === 'string';
}

function checkToolNameSegments(rule, subject) {
  const separator = rule.predicate.params.separator ?? '.';
  const maxSegments = rule.predicate.params.maxSegments ?? 2;

  for (const tool of toolsOf(subject)) {
    const name = typeof tool.name === 'string' ? tool.name : '';
    if (!name) {
      return { result: 'fail', message: `Tool is missing a name.` };
    }
    const segments = name.split(separator);
    if (segments.length > maxSegments) {
      return {
        result: 'fail',
        message: `Tool name "${name}" has ${segments.length} "${separator}"-separated segments; a widget may declare at most ${maxSegments} (the host owns the vendor segment).`
      };
    }
  }

  return { result: 'pass', message: 'Tool names stay within the widget-owned segment budget.' };
}

function checkInputSchemaShape(rule, subject) {
  const params = rule.predicate.params;
  const forbidden = new Set(
    (params.forbidUnconstrainedStringNames ?? []).map((n) => String(n).toLowerCase())
  );

  for (const tool of toolsOf(subject)) {
    const parsed = parseInputSchema(tool.inputSchema, tool.name ?? '(unnamed)');
    if (!parsed.ok) {
      return { result: 'fail', message: parsed.message };
    }

    const schema = parsed.schema;
    if (params.requireDeclaredProperties && (!schema.properties || typeof schema.properties !== 'object')) {
      return {
        result: 'fail',
        message: `Tool "${tool.name}" inputSchema does not declare properties.`
      };
    }

    if (params.forbidAdditionalProperties && schema.additionalProperties !== false) {
      return {
        result: 'fail',
        message: `Tool "${tool.name}" inputSchema allows additional properties (a passthrough channel).`
      };
    }

    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const [name, propSchema] of Object.entries(properties)) {
      if (forbidden.has(name.toLowerCase()) && isUnconstrainedString(propSchema)) {
        return {
          result: 'fail',
          message: `Tool "${tool.name}" declares unconstrained string parameter "${name}", which is a free-form context/passthrough field.`
        };
      }
    }
  }

  return { result: 'pass', message: 'Input schemas declare properties and do not offer a passthrough field.' };
}

function collectSchemaTexts(schema, field, sink) {
  if (!schema || typeof schema !== 'object') return;

  if (field === 'paramDescription' && typeof schema.description === 'string') {
    sink.push({ field, text: schema.description });
  }

  if (field === 'enumValue' && Array.isArray(schema.enum)) {
    for (const value of schema.enum) {
      if (typeof value === 'string') sink.push({ field, text: value });
    }
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const prop of Object.values(schema.properties)) {
      collectSchemaTexts(prop, field, sink);
    }
  }

  if (schema.items) collectSchemaTexts(schema.items, field, sink);
}

function collectTextFields(tool, fieldNames) {
  const texts = [];
  let parseFailure = null;

  for (const field of fieldNames) {
    if (field === 'description' && typeof tool.description === 'string') {
      texts.push({ field, text: tool.description });
    } else if (field === 'title' && typeof tool.title === 'string') {
      texts.push({ field, text: tool.title });
    } else if (field === 'result' && typeof tool.result === 'string') {
      texts.push({ field, text: tool.result });
    } else if (field === 'paramDescription' || field === 'enumValue') {
      const parsed = parseInputSchema(tool.inputSchema, tool.name ?? '(unnamed)');
      if (!parsed.ok) {
        parseFailure = parsed;
      } else {
        collectSchemaTexts(parsed.schema, field, texts);
      }
    }
  }

  return { texts, parseFailure };
}

function checkTextPatternAbsent(rule, subject) {
  const { fields, patternSet, reasonCode } = rule.predicate.params;

  for (const tool of toolsOf(subject)) {
    const { texts, parseFailure } = collectTextFields(tool, fields ?? []);
    if (parseFailure && (fields ?? []).some((f) => f === 'paramDescription' || f === 'enumValue')) {
      return { result: 'fail', message: parseFailure.message };
    }

    for (const { field, text } of texts) {
      const match = matchPatternSet(patternSet, text);
      if (match.matched) {
        const code = reasonCode ? `${reasonCode}: ` : '';
        return {
          result: 'fail',
          message: `${code}Tool "${tool.name}" ${field} matched pattern "${match.source}" from set "${patternSet}".`
        };
      }
    }
  }

  return {
    result: 'pass',
    message: `No ${patternSet} match in the scanned fields.`
  };
}

function readClaim(attestation, claimKey) {
  if (!attestation || typeof attestation !== 'object') return 'absent';
  const claims = attestation.claims;
  if (!claims || typeof claims !== 'object') return 'absent';
  if (!Object.prototype.hasOwnProperty.call(claims, claimKey)) return 'absent';
  const value = claims[claimKey];
  if (value === false || value === null) return 'denied';
  if (value === true) return 'asserted';
  if (typeof value === 'object') return 'asserted';
  if (typeof value === 'string' && value.length > 0) return 'asserted';
  return 'absent';
}

function checkAttestationPresent(rule, subject, _harness, manifest) {
  const attestation = subject.attestation;
  if (!attestation || typeof attestation !== 'object') {
    return { result: 'fail', message: 'No attestation document was supplied.' };
  }

  const required = [];
  const cover = rule.predicate.params.mustCoverEvidence;
  for (const other of manifest.rules) {
    if (other.evidence !== cover) continue;
    if (other.role && other.role !== rule.role) continue;
    if (other.predicate?.check === 'attestation-claim' && other.predicate.params?.claim) {
      required.push(other.predicate.params.claim);
    }
  }

  const missing = required.filter((key) => readClaim(attestation, key) === 'absent');
  if (missing.length > 0) {
    return {
      result: 'fail',
      message: `Attestation is incomplete; missing claims: ${missing.join(', ')}.`
    };
  }

  return {
    result: 'pass',
    message: 'Attestation is present and covers every attested-class claim.'
  };
}

function checkAttestationClaim(rule, subject) {
  const claimKey = rule.predicate.params.claim;
  const status = readClaim(subject.attestation, claimKey);

  if (status === 'absent') {
    return {
      result: 'not-evaluable',
      message: `No attestation claim "${claimKey}"; absence of a claim is not a passing claim.`
    };
  }

  if (status === 'denied') {
    return {
      result: 'fail',
      message: `Vendor attestation claim "${claimKey}" is explicitly false.`
    };
  }

  return {
    result: 'pass',
    message: `Vendor attests "${claimKey}". This rests on the vendor's word, not the registered surface.`
  };
}

function checkOriginAllowlisted(rule, subject) {
  const allowlist = subject.allowlist;
  if (!Array.isArray(allowlist)) {
    return {
      result: 'not-evaluable',
      message: 'No allowlist on the subject; cannot evaluate origin admission.'
    };
  }

  const allowed = new Set(allowlist.map((entry) => (typeof entry === 'string' ? entry : entry.origin)));
  const reasonCode = rule.predicate.params.reasonCode ?? 'ORIGIN_NOT_ALLOWLISTED';

  for (const tool of toolsOf(subject)) {
    if (!allowed.has(tool.origin)) {
      return {
        result: 'fail',
        message: `${reasonCode}: origin ${tool.origin} is not allowlisted.`
      };
    }
  }

  return { result: 'pass', message: 'Every tool origin is on the allowlist.' };
}

function checkComposedNameValid(rule, subject) {
  const { separator, maxLength, charset, segments, reasonCodes } = rule.predicate.params;
  const charsetRe = new RegExp(`^[${charset}]+$`);
  const expected = Array.isArray(segments) ? segments.length : 3;
  const tooLong = reasonCodes?.[0] ?? 'NAME_TOO_LONG';
  const illegal = reasonCodes?.[1] ?? 'NAME_ILLEGAL_CHARS';

  for (const tool of toolsOf(subject)) {
    const name = typeof tool.name === 'string' ? tool.name : '';
    if (name.length > maxLength) {
      return {
        result: 'fail',
        message: `${tooLong}: "${name}" is ${name.length} characters; the limit is ${maxLength}.`
      };
    }
    const parts = name.split(separator);
    if (parts.length !== expected || parts.some((part) => !part || !charsetRe.test(part))) {
      return {
        result: 'fail',
        message: `${illegal}: "${name}" is not ${segments.join(separator)} with charset ${charset}.`
      };
    }
  }

  return { result: 'pass', message: 'Composed names are valid.' };
}

const THIRD_PARTY_MARK = /third[\s-]?party/i;

function envelopeFields(tool, kinds) {
  const fields = [];
  for (const kind of kinds) {
    if (kind === 'description' && typeof tool.description === 'string' && tool.description.length > 0) {
      fields.push({ kind, text: tool.description });
    } else if (kind === 'result' && typeof tool.result === 'string' && tool.result.length > 0) {
      fields.push({ kind, text: tool.result });
    } else if (kind === 'paramDescription' || kind === 'enumValue') {
      const parsed = parseInputSchema(tool.inputSchema, tool.name ?? '(unnamed)');
      if (parsed.ok) {
        const sink = [];
        collectSchemaTexts(parsed.schema, kind, sink);
        for (const item of sink) fields.push({ kind, text: item.text });
      }
    }
  }
  return fields;
}

function checkEnvelopeShape(rule, subject) {
  const kinds = rule.predicate.params.kinds ?? [];
  const mustCarry = rule.predicate.params.mustCarry ?? [];
  const tools = toolsOf(subject);

  if (tools.length === 0) {
    return { result: 'pass', message: 'No published tools to envelope.' };
  }

  for (const tool of tools) {
    const fields = envelopeFields(tool, kinds);
    if (fields.length === 0) {
      return {
        result: 'fail',
        message: `No rebuilt agent-visible text on "${tool.name}".`
      };
    }
    for (const { kind, text } of fields) {
      if (mustCarry.includes('origin') && (!tool.origin || !String(text).includes(tool.origin))) {
        return {
          result: 'fail',
          message: `${kind} on "${tool.name}" does not carry the contributing origin.`
        };
      }
      if (mustCarry.includes('thirdPartyDelimiters') && !THIRD_PARTY_MARK.test(text)) {
        return {
          result: 'fail',
          message: `${kind} on "${tool.name}" does not carry third-party delimiters.`
        };
      }
    }
  }

  return {
    result: 'pass',
    message: 'Published text carries origin and third-party delimiters.'
  };
}

function checkAnnotationPreserved(rule, subject) {
  const key = rule.predicate.params.annotation;
  const direction = rule.predicate.params.direction;
  let comparable = 0;

  for (const tool of toolsOf(subject)) {
    const source = tool.sourceAnnotations?.[key];
    if (source === undefined) continue;
    comparable += 1;
    const published = tool.annotations?.[key];
    if (direction === 'never-weaken' && source === false && published === true) {
      return {
        result: 'fail',
        message: `Published ${key} weakened a mutating annotation to read-only on "${tool.name}".`
      };
    }
  }

  if (comparable === 0) {
    return {
      result: 'not-evaluable',
      message: `No source ${key} values to compare; cannot evaluate preservation.`
    };
  }

  return {
    result: 'pass',
    message: `${key} was not weakened on the published surface.`
  };
}

function checkHarnessProbe(rule, subject, harness) {
  const probe = rule.predicate.params.probe;

  if (!harness || typeof harness.probe !== 'function') {
    return {
      result: 'not-evaluable',
      message: `No execution harness supplied; ${rule.id} (${probe}) is observed and cannot be evaluated. Ambient does not claim generic behavioral detection for arbitrary widgets.`
    };
  }

  const outcome = harness.probe(probe, {
    subject,
    rule,
    params: rule.predicate.params
  });

  if (!outcome || !['pass', 'fail', 'not-evaluable'].includes(outcome.result)) {
    return {
      result: 'not-evaluable',
      message: `Harness did not return a result for probe "${probe}".`
    };
  }

  return {
    result: outcome.result,
    message: typeof outcome.message === 'string' ? outcome.message : `Probe "${probe}" returned ${outcome.result}.`
  };
}
