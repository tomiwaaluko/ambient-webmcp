/**
 * Shared builders for synthetic checker fixtures.
 * These are Node-loadable stand-ins for getTools() descriptors, not browser widgets.
 */

export const FIXTURE_ORIGIN = 'https://fixture.example';

/**
 * @param {object} [overrides]
 * @returns {object} a getTools()-shaped descriptor (inputSchema is a JSON string)
 */
export function widgetTool(overrides = {}) {
  const schema =
    overrides.inputSchema === undefined
      ? {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Destination or keyword to search.' }
          },
          required: ['query'],
          additionalProperties: false
        }
      : overrides.inputSchema;

  const { inputSchema: _ignored, ...rest } = overrides;

  return {
    name: 'search',
    description: 'Search available bookings by destination.',
    title: '',
    inputSchema: typeof schema === 'string' ? schema : JSON.stringify(schema),
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    origin: FIXTURE_ORIGIN,
    ...rest
  };
}

/**
 * @param {object} [overrides]
 * @returns {object}
 */
export function completeAttestation(overrides = {}) {
  const { claims: claimOverrides, ...rest } = overrides;
  return {
    widgetId: 'booking',
    origin: FIXTURE_ORIGIN,
    version: 1,
    attestedRules: ['W2', 'W3', 'W9', 'W10'],
    claims: {
      exposedToScoped: {
        statement: 'exposedTo lists concrete HTTPS host origins only.',
        enforcedBy: 'fixture'
      },
      untrustedContentMarked: {
        statement: 'Returned content the widget did not author is marked untrustedContentHint.',
        enforcedBy: 'fixture'
      },
      authorizationEnforced: {
        statement: 'Mutating tools invoke authorization before any side effect.',
        enforcedBy: 'fixture'
      },
      noSensitiveValues: {
        statement: 'Tools neither accept nor return credentials, secrets, tokens, or payment instrument numbers.',
        enforcedBy: 'fixture'
      },
      ...claimOverrides
    },
    ...rest
  };
}
