/**
 * Node-loadable checker subject for Acme Booking (load-time, conformant).
 */

import { buildAttestation } from '../../src/widget/attest.js';

export const ORIGIN = 'https://acme-booking-tomiwaalukos-projects.vercel.app';
export const role = 'widget';
export const attestation = buildAttestation({ widgetId: 'booking', origin: ORIGIN });

/** @type {{ change: string, name: string }[]} */
export const surfaceNotifications = [
  { change: 'register', name: 'search' },
  { change: 'register', name: 'book' }
];

const catalog = [
  { id: 'bk-101', destination: 'Lisbon', date: '2026-10-12', seats: 2 },
  { id: 'bk-102', destination: 'Tokyo', date: '2026-11-03', seats: 1 }
];

const state = {
  bookings: /** @type {{ id: string, destination: string, guestName: string }[]} */ ([]),
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
    description: 'Search available bookings by destination or travel date.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Destination or date fragment to match.' }
      },
      required: ['query'],
      additionalProperties: false
    }
  }),
  descriptor({
    name: 'book',
    description: 'Reserve a catalog booking for a named guest.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        bookingId: { type: 'string', description: 'Catalog booking id to reserve.' },
        guestName: { type: 'string', description: 'Guest name for the reservation.' }
      },
      required: ['bookingId', 'guestName'],
      additionalProperties: false
    }
  })
];

export function getObservedState() {
  return {
    bookings: state.bookings.map((row) => ({ ...row })),
    authorized: state.authorized
  };
}

/**
 * Fixture-local execute mirror for W4 probing.
 *
 * @param {string} name
 * @param {object} input
 */
export function execute(name, input) {
  if (name === 'search') {
    const query = String(input?.query ?? '').toLowerCase().trim();
    const matches = catalog.filter((row) => {
      const dest = row.destination.toLowerCase();
      return dest.includes(query) || query.includes(dest) || row.date.includes(query);
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ results: matches }) }]
    };
  }

  if (name === 'book') {
    if (!state.authorized) {
      return {
        content: [{ type: 'text', text: 'Authorization refused this call.' }],
        isError: true
      };
    }
    const bookingId = String(input?.bookingId ?? '');
    const guestName = String(input?.guestName ?? '').trim();
    const entry = catalog.find((row) => row.id === bookingId);
    if (!entry || !guestName) {
      return {
        content: [{ type: 'text', text: 'book refused: missing catalog entry or guestName.' }],
        isError: true
      };
    }
    state.bookings.push({ id: bookingId, destination: entry.destination, guestName });
    return {
      content: [{ type: 'text', text: JSON.stringify({ booked: bookingId, guestName }) }]
    };
  }

  return { content: [{ type: 'text', text: 'unknown tool' }], isError: true };
}

/** @param {boolean} value */
export function setAuthorized(value) {
  state.authorized = Boolean(value);
}

export function resetFixture() {
  state.bookings.length = 0;
  state.authorized = false;
}
