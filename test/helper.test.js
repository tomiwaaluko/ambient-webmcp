import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  registerConformantTool,
  validateWidgetId,
  validateExposedTo,
  validateInputSchema,
  ConformanceRefusal,
  notifySurfaceChange
} from '../src/widget/helper.js';
import {
  ATTESTED_RULE_IDS,
  ATTESTATION_CLAIM_KEYS,
  buildAttestation,
  getAttestation,
  publishAttestation,
  resetAttestation
} from '../src/widget/attest.js';
import {
  ensureOriginTrialInjected,
  isOriginTrialInjected,
  resetOriginTrialInjection
} from '../src/widget/origin-trial.js';

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ATTESTED_IDS = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'fixtures', 'attested-rule-ids.json'), 'utf8')
);

const HOST = 'https://ambient-host-tomiwaalukos-projects.vercel.app';

/** @type {Array<{ change: string, detail: object }>} */
let surfaceMessages = [];

/** @type {object | null} */
let registeredDescriptor = null;

/** @type {object | null} */
let registeredOptions = null;

/** @type {((input: unknown) => unknown) | null} */
let platformExecute = null;

function installDom() {
  surfaceMessages = [];
  registeredDescriptor = null;
  registeredOptions = null;
  platformExecute = null;

  const headChildren = [];

  globalThis.document = {
    head: {
      appendChild(el) {
        headChildren.push(el);
      },
      children: headChildren
    },
    createElement(tag) {
      return { tagName: tag.toUpperCase(), httpEquiv: '', content: '' };
    },
    modelContext: {
      registerTool: async (descriptor, options) => {
        registeredDescriptor = descriptor;
        registeredOptions = options;
        platformExecute = descriptor.execute;
      }
    }
  };

  globalThis.window = {
    parent: {
      postMessage(payload) {
        surfaceMessages.push({ change: payload.change, detail: payload });
      }
    }
  };
}

function uninstallDom() {
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.location;
  delete globalThis.__ambientWidgetAttestation;
}

beforeEach(() => {
  resetOriginTrialInjection();
  resetAttestation();
  installDom();
});

afterEach(() => {
  uninstallDom();
});

describe('validateWidgetId (R4)', () => {
  test('refuses widgetId containing a separator', () => {
    assert.throws(
      () => validateWidgetId('acme.booking'),
      (err) => {
        assert.ok(err instanceof ConformanceRefusal);
        assert.equal(err.code, 'WIDGET_ID_SEPARATOR');
        return true;
      }
    );
  });
});

describe('validateExposedTo (R5)', () => {
  test('refuses wildcard exposedTo', () => {
    assert.throws(
      () => validateExposedTo(['https://*.example.com']),
      (err) => {
        assert.equal(err.code, 'EXPOSED_TO_WILDCARD');
        return true;
      }
    );
  });

  test('refuses insecure exposedTo origins', () => {
    assert.throws(
      () => validateExposedTo(['http://insecure.example']),
      (err) => {
        assert.equal(err.code, 'EXPOSED_TO_INSECURE');
        return true;
      }
    );
  });
});

describe('validateInputSchema (R8 / W5)', () => {
  test('refuses schema with properties but no additionalProperties', () => {
    assert.throws(
      () =>
        validateInputSchema({
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }),
      (err) => {
        assert.equal(err.code, 'SCHEMA_ADDITIONAL_PROPERTIES');
        return true;
      }
    );
  });

  test('refuses a free-form context parameter', () => {
    assert.throws(
      () =>
        validateInputSchema({
          type: 'object',
          properties: {
            context: { type: 'string' }
          },
          additionalProperties: false
        }),
      (err) => {
        assert.equal(err.code, 'SCHEMA_PASSTHROUGH_FIELD');
        return true;
      }
    );
  });

  test('refuses additionalProperties true at root', () => {
    assert.throws(
      () =>
        validateInputSchema({
          type: 'object',
          additionalProperties: true,
          properties: {
            query: { type: 'string' }
          }
        }),
      (err) => {
        assert.equal(err.code, 'SCHEMA_ADDITIONAL_PROPERTIES');
        return true;
      }
    );
  });

  test('refuses raw as a passthrough parameter name', () => {
    assert.throws(
      () =>
        validateInputSchema({
          type: 'object',
          properties: {
            raw: { type: 'string' }
          },
          additionalProperties: false
        }),
      (err) => {
        assert.equal(err.code, 'SCHEMA_PASSTHROUGH_FIELD');
        return true;
      }
    );
  });

  test('allows message as a typed capability parameter with closed schema', () => {
    assert.doesNotThrow(() =>
      validateInputSchema({
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message body to send.' }
        },
        required: ['message'],
        additionalProperties: false
      })
    );
  });
});

describe('registerConformantTool authorization (R38)', () => {
  test('refuses mutating tool without authorize at registration', async () => {
    await assert.rejects(
      () =>
        registerConformantTool({
          widgetId: 'booking',
          name: 'book',
          description: 'Book a reservation.',
          inputSchema: {
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false
          },
          readOnly: false,
          exposedTo: [HOST],
          execute: async () => ({ content: [{ type: 'text', text: 'booked' }] })
        }),
      (err) => {
        assert.equal(err.code, 'AUTHORIZE_REQUIRED');
        return true;
      }
    );
  });

  test('denied authorization does not run vendor side effect', async () => {
    let sideEffect = false;

    await registerConformantTool({
      widgetId: 'booking',
      name: 'book',
      description: 'Book a reservation.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false
      },
      readOnly: false,
      exposedTo: [HOST],
      authorize: async () => false,
      execute: async () => {
        sideEffect = true;
        return { content: [{ type: 'text', text: 'booked' }] };
      }
    });

    assert.equal(typeof platformExecute, 'function');
    const result = await platformExecute({ id: '42' });
    assert.equal(sideEffect, false);
    assert.equal(result.isError, true);
  });

  test('registers wrapped execute, not the vendor execute reference', async () => {
    const vendorExecute = async () => ({
      content: [{ type: 'text', text: 'ok' }]
    });

    await registerConformantTool({
      widgetId: 'booking',
      name: 'search',
      description: 'Search bookings.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false
      },
      readOnly: false,
      exposedTo: [HOST],
      authorize: async () => true,
      execute: vendorExecute
    });

    assert.notEqual(registeredDescriptor.execute, vendorExecute);
  });
});

describe('registerConformantTool platform wiring', () => {
  test('passes exposedTo as registerTool second argument', async () => {
    await registerConformantTool({
      widgetId: 'booking',
      name: 'search',
      description: 'Search bookings.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false
      },
      readOnly: true,
      exposedTo: [HOST],
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] })
    });

    assert.deepEqual(registeredOptions, { exposedTo: [HOST] });
    assert.equal(registeredDescriptor.exposedTo, undefined);
  });

  test('sets untrustedContentHint annotation spelling', async () => {
    await registerConformantTool({
      widgetId: 'booking',
      name: 'search',
      description: 'Search bookings.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false
      },
      readOnly: true,
      untrustedContent: true,
      exposedTo: [HOST],
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] })
    });

    assert.equal(registeredDescriptor.annotations.untrustedContentHint, true);
    assert.equal(registeredDescriptor.annotations.readOnlyHint, true);
  });

  test('injects origin trial meta before registerTool resolves', async () => {
    let metaPresentDuringRegister = false;

    document.modelContext.registerTool = async (descriptor, options) => {
      metaPresentDuringRegister = isOriginTrialInjected();
      registeredDescriptor = descriptor;
      registeredOptions = options;
    };

    await registerConformantTool({
      widgetId: 'booking',
      name: 'search',
      description: 'Search bookings.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false
      },
      readOnly: true,
      exposedTo: [HOST],
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] })
    });

    assert.equal(metaPresentDuringRegister, true);
    assert.equal(isOriginTrialInjected(), true);
  });
});

describe('surface-change notification (R10)', () => {
  test('notifies host on register', async () => {
    await registerConformantTool({
      widgetId: 'booking',
      name: 'search',
      description: 'Search bookings.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false
      },
      readOnly: true,
      exposedTo: [HOST],
      execute: async () => ({ content: [{ type: 'text', text: 'ok' }] })
    });

    assert.equal(surfaceMessages.length, 1);
    assert.equal(surfaceMessages[0].change, 'register');
    assert.equal(surfaceMessages[0].detail.name, 'search');
  });

  test('notifies host on abort when registerTool rejects', async () => {
    document.modelContext.registerTool = async () => {
      throw new Error('NotAllowedError: permissions policy');
    };

    await assert.rejects(() =>
      registerConformantTool({
        widgetId: 'booking',
        name: 'search',
        description: 'Search bookings.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false
        },
        readOnly: true,
        exposedTo: [HOST],
        execute: async () => ({ content: [{ type: 'text', text: 'ok' }] })
      })
    );

    assert.equal(surfaceMessages.length, 1);
    assert.equal(surfaceMessages[0].change, 'abort');
  });

  test('notifySurfaceChange posts ambient-widget-helper message', () => {
    notifySurfaceChange('register', { widgetId: 'booking', name: 'search' });
    assert.equal(surfaceMessages[0].detail.source, 'ambient-widget-helper');
    assert.equal(surfaceMessages[0].detail.type, 'surface-change');
  });
});

describe('attestation manifest (R37)', () => {
  test('lists exactly the manifest attested-class rule ids', () => {
    assert.deepEqual([...ATTESTED_RULE_IDS], FIXTURE_ATTESTED_IDS);
    const attestation = buildAttestation({
      widgetId: 'booking',
      origin: 'https://acme-booking-tomiwaalukos-projects.vercel.app'
    });
    assert.deepEqual(attestation.attestedRules, FIXTURE_ATTESTED_IDS);
    assert.deepEqual(Object.keys(attestation.claims).sort(), [...ATTESTATION_CLAIM_KEYS].sort());
    assert.equal(attestation.claims.exposedToScoped.enforcedBy, 'registerConformantTool');
    assert.equal(attestation.claims.authorizationEnforced.enforcedBy, 'registerConformantTool');
    assert.equal(attestation.claims.untrustedContentMarked.enforcedBy, 'vendor');
    assert.equal(attestation.claims.noSensitiveValues.enforcedBy, 'vendor');
    assert.equal(attestation.attestedRules.includes('W4'), false);
  });

  test('publishAttestation exposes manifest on globalThis', () => {
    publishAttestation({
      widgetId: 'booking',
      origin: 'https://acme-booking-tomiwaalukos-projects.vercel.app'
    });
    assert.deepEqual(getAttestation().attestedRules, FIXTURE_ATTESTED_IDS);
    assert.deepEqual(globalThis.__ambientWidgetAttestation.attestedRules, FIXTURE_ATTESTED_IDS);
    assert.deepEqual(Object.keys(globalThis.__ambientWidgetAttestation.claims).sort(), [
      ...ATTESTATION_CLAIM_KEYS
    ].sort());
  });
});

describe('origin-trial injection', () => {
  test('ensureOriginTrialInjected is idempotent', () => {
    ensureOriginTrialInjected();
    ensureOriginTrialInjected();
    assert.equal(isOriginTrialInjected(), true);
    assert.equal(document.head.children.length, 1);
  });
});
