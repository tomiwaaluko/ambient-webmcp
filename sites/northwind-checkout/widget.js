/**
 * Northwind Checkout widget — quote (read-only) and pay (mutating).
 */

import { registerConformantTool } from './vendor/helper.js';
import { getAttestation } from './vendor/attest.js';

export const HOST = 'https://ambient-host-tomiwaalukos-projects.vercel.app';
export const ORIGIN = 'https://northwind-checkout-tomiwaalukos-projects.vercel.app';

/** @type {{ sku: string, name: string, unitPrice: number }[]} */
const catalog = [
  { sku: 'NW-001', name: 'Trail pack', unitPrice: 48 },
  { sku: 'NW-002', name: 'Insulated bottle', unitPrice: 22 },
  { sku: 'NW-003', name: 'Summit lamp', unitPrice: 64 }
];

/** @type {{ orderId: string, sku: string, quantity: number, total: number }[]} */
const orders = [];

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

export function getOrders() {
  return orders.map((row) => ({ ...row }));
}

function findProduct(sku) {
  return catalog.find((row) => row.sku === sku) ?? null;
}

/**
 * @param {{ onStatus?: (line: string) => void }} [opts]
 */
export async function bootWidget({ onStatus } = {}) {
  const log = (line) => onStatus?.(line);

  await registerConformantTool({
    widgetId: 'checkout',
    name: 'quote',
    description: 'Quote line totals for catalog products and quantities.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Catalog product sku.' },
        quantity: { type: 'integer', minimum: 1, description: 'Units to price.' }
      },
      required: ['sku', 'quantity'],
      additionalProperties: false
    },
    readOnly: true,
    untrustedContent: false,
    exposedTo: [HOST],
    execute: async (input) => {
      const sku = String(input?.sku ?? '');
      const quantity = Number(input?.quantity ?? 0);
      const product = findProduct(sku);
      if (!product || !Number.isInteger(quantity) || quantity < 1) {
        return {
          content: [{ type: 'text', text: 'Unknown sku or invalid quantity.' }],
          isError: true
        };
      }
      const total = product.unitPrice * quantity;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              sku,
              name: product.name,
              quantity,
              unitPrice: product.unitPrice,
              total
            })
          }
        ]
      };
    }
  });
  log('registered quote');

  await registerConformantTool({
    widgetId: 'checkout',
    name: 'pay',
    description: 'Record a synthetic payment against a quoted order total.',
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Catalog product sku being purchased.' },
        quantity: { type: 'integer', minimum: 1, description: 'Units being purchased.' },
        orderLabel: { type: 'string', description: 'Human-readable order label for the receipt.' }
      },
      required: ['sku', 'quantity', 'orderLabel'],
      additionalProperties: false
    },
    readOnly: false,
    untrustedContent: false,
    exposedTo: [HOST],
    authorize: () => sessionAuthorized,
    execute: async (input) => {
      const sku = String(input?.sku ?? '');
      const quantity = Number(input?.quantity ?? 0);
      const orderLabel = String(input?.orderLabel ?? '').trim();
      const product = findProduct(sku);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || !orderLabel) {
        return {
          content: [{ type: 'text', text: 'pay refused: invalid sku, quantity, or orderLabel.' }],
          isError: true
        };
      }
      const orderId = `ord-${orders.length + 1}`;
      const total = product.unitPrice * quantity;
      orders.push({ orderId, sku, quantity, total });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ orderId, orderLabel, sku, quantity, total, status: 'paid-synthetic' })
          }
        ]
      };
    }
  });
  log('registered pay');

  return { attestation: getAttestation(), orders: getOrders() };
}
