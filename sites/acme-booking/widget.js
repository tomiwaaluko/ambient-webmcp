/**
 * Acme Booking widget — search (read-only) and book (mutating).
 */

import { registerConformantTool } from './vendor/helper.js';
import { getAttestation } from './vendor/attest.js';

export const HOST = 'https://ambient-host-tomiwaalukos-projects.vercel.app';
export const ORIGIN = 'https://acme-booking-tomiwaalukos-projects.vercel.app';

/** @type {{ id: string, destination: string, date: string, seats: number }[]} */
const catalog = [
  { id: 'bk-101', destination: 'Lisbon', date: '2026-10-12', seats: 2 },
  { id: 'bk-102', destination: 'Tokyo', date: '2026-11-03', seats: 1 },
  { id: 'bk-103', destination: 'Reykjavik', date: '2026-12-01', seats: 4 }
];

/** @type {{ id: string, destination: string, guestName: string }[]} */
const bookings = [];

let sessionAuthorized = false;

export function isAuthorized() {
  return sessionAuthorized;
}

export function setAuthorized(value) {
  sessionAuthorized = Boolean(value);
}

export function getCatalog() {
  return catalog.map((row) => ({ ...row }));
}

export function getBookings() {
  return bookings.map((row) => ({ ...row }));
}

function findCatalogEntry(bookingId) {
  return catalog.find((row) => row.id === bookingId) ?? null;
}

/**
 * @param {{ onStatus?: (line: string) => void }} [opts]
 */
export async function bootWidget({ onStatus } = {}) {
  const log = (line) => onStatus?.(line);

  await registerConformantTool({
    widgetId: 'booking',
    name: 'search',
    description: 'Search available bookings by destination or travel date.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Destination or date fragment to match.' }
      },
      required: ['query'],
      additionalProperties: false
    },
    readOnly: true,
    untrustedContent: false,
    exposedTo: [HOST],
    execute: async (input) => {
      const query = String(input?.query ?? '').toLowerCase().trim();
      const matches = catalog.filter((row) => {
        const dest = row.destination.toLowerCase();
        return dest.includes(query) || query.includes(dest) || row.date.includes(query);
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ results: matches.map((row) => ({ ...row })) })
          }
        ]
      };
    }
  });
  log('registered search');

  await registerConformantTool({
    widgetId: 'booking',
    name: 'book',
    description: 'Reserve a catalog booking for a named guest.',
    inputSchema: {
      type: 'object',
      properties: {
        bookingId: { type: 'string', description: 'Catalog booking id to reserve.' },
        guestName: { type: 'string', description: 'Guest name for the reservation.' }
      },
      required: ['bookingId', 'guestName'],
      additionalProperties: false
    },
    readOnly: false,
    untrustedContent: false,
    exposedTo: [HOST],
    authorize: () => sessionAuthorized,
    execute: async (input) => {
      const bookingId = String(input?.bookingId ?? '');
      const guestName = String(input?.guestName ?? '').trim();
      const entry = findCatalogEntry(bookingId);
      if (!entry) {
        return {
          content: [{ type: 'text', text: `Unknown booking id ${JSON.stringify(bookingId)}.` }],
          isError: true
        };
      }
      if (!guestName) {
        return {
          content: [{ type: 'text', text: 'guestName is required.' }],
          isError: true
        };
      }
      bookings.push({ id: bookingId, destination: entry.destination, guestName });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ booked: bookingId, guestName, destination: entry.destination })
          }
        ]
      };
    }
  });
  log('registered book');

  return { attestation: getAttestation(), bookings: getBookings() };
}
