/**
 * Node-loadable checker subject for Zenith Support (load-time, conformant).
 */

import { buildAttestation } from '../../src/widget/attest.js';

export const ORIGIN = 'https://zenith-support-tomiwaalukos-projects.vercel.app';
export const role = 'widget';
export const attestation = buildAttestation({ widgetId: 'support', origin: ORIGIN });

/** @type {{ change: string, name: string }[]} */
export const surfaceNotifications = [
  { change: 'register', name: 'search' },
  { change: 'register', name: 'contact' }
];

const articles = [
  { id: 'kb-01', title: 'Reset device pairing', body: 'Hold the button for ten seconds.' },
  { id: 'kb-02', title: 'Shipping delays', body: 'Carrier scans may lag up to 48 hours.' }
];

const state = {
  tickets: /** @type {{ ticketId: string, subject: string, message: string }[]} */ ([]),
  authorized: false
};

/**
 * @param {object} opts
 * @returns {object}
 */
function descriptor({ name, description, inputSchema, readOnly }) {
  return {
    name,
    description,
    title: '',
    inputSchema: JSON.stringify(inputSchema),
    annotations: { readOnlyHint: readOnly, untrustedContentHint: false },
    origin: ORIGIN
  };
}

export const tools = [
  descriptor({
    name: 'search',
    description: 'Search support articles by title or body text.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword to match against article titles and bodies.' }
      },
      required: ['query'],
      additionalProperties: false
    }
  }),
  descriptor({
    name: 'contact',
    description: 'Open a support ticket with a subject and message.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Ticket subject line.' },
        message: { type: 'string', description: 'Customer message body.' }
      },
      required: ['subject', 'message'],
      additionalProperties: false
    }
  })
];

export function getObservedState() {
  return {
    tickets: state.tickets.map((row) => ({ ...row })),
    authorized: state.authorized
  };
}

/**
 * @param {string} name
 * @param {object} input
 */
export function execute(name, input) {
  if (name === 'search') {
    const query = String(input?.query ?? '').toLowerCase();
    const matches = articles.filter(
      (row) =>
        row.title.toLowerCase().includes(query) || row.body.toLowerCase().includes(query)
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ results: matches.map((row) => ({ id: row.id, title: row.title })) })
        }
      ]
    };
  }

  if (name === 'contact') {
    if (!state.authorized) {
      return {
        content: [{ type: 'text', text: 'Authorization refused this call.' }],
        isError: true
      };
    }
    const subject = String(input?.subject ?? '').trim();
    const message = String(input?.message ?? '').trim();
    if (!subject || !message) {
      return { content: [{ type: 'text', text: 'contact refused.' }], isError: true };
    }
    const ticketId = `tkt-${state.tickets.length + 1}`;
    state.tickets.push({ ticketId, subject, message });
    return { content: [{ type: 'text', text: JSON.stringify({ ticketId, status: 'open' }) }] };
  }

  return { content: [{ type: 'text', text: 'unknown tool' }], isError: true };
}

/** @param {boolean} value */
export function setAuthorized(value) {
  state.authorized = Boolean(value);
}

export function resetFixture() {
  state.tickets.length = 0;
  state.authorized = false;
}
