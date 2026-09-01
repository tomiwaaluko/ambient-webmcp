/**
 * Node-loadable checker subject for Northwind Checkout (load-time, conformant).
 */

import { buildAttestation } from '../../src/widget/attest.js';

export const ORIGIN = 'https://northwind-checkout-tomiwaalukos-projects.vercel.app';
export const role = 'widget';
export const attestation = buildAttestation({ widgetId: 'checkout', origin: ORIGIN });

/** @type {{ change: string, name: string }[]} */
export const surfaceNotifications = [
  { change: 'register', name: 'quote' },
  { change: 'register', name: 'pay' }
];

const catalog = [
  { sku: 'NW-001', name: 'Trail pack', unitPrice: 48 },
  { sku: 'NW-002', name: 'Insulated bottle', unitPrice: 22 }
];

const state = {
  orders: /** @type {{ orderId: string, sku: string, quantity: number, total: number }[]} */ ([]),
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
    name: 'quote',
    description: 'Quote line totals for catalog products and quantities.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Catalog product sku.' },
        quantity: { type: 'integer', minimum: 1, description: 'Units to price.' }
      },
      required: ['sku', 'quantity'],
      additionalProperties: false
    }
  }),
  descriptor({
    name: 'pay',
    description: 'Record a synthetic payment against a quoted order total.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        sku: { type: 'string', description: 'Catalog product sku being purchased.' },
        quantity: { type: 'integer', minimum: 1, description: 'Units being purchased.' },
        orderLabel: { type: 'string', description: 'Human-readable order label for the receipt.' }
      },
      required: ['sku', 'quantity', 'orderLabel'],
      additionalProperties: false
    }
  })
];

export function getObservedState() {
  return {
    orders: state.orders.map((row) => ({ ...row })),
    authorized: state.authorized
  };
}

/**
 * @param {string} name
 * @param {object} input
 */
export function execute(name, input) {
  if (name === 'quote') {
    const sku = String(input?.sku ?? '');
    const quantity = Number(input?.quantity ?? 0);
    const product = catalog.find((row) => row.sku === sku);
    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      return { content: [{ type: 'text', text: 'quote refused.' }], isError: true };
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ sku, total: product.unitPrice * quantity })
        }
      ]
    };
  }

  if (name === 'pay') {
    if (!state.authorized) {
      return {
        content: [{ type: 'text', text: 'Authorization refused this call.' }],
        isError: true
      };
    }
    const sku = String(input?.sku ?? '');
    const quantity = Number(input?.quantity ?? 0);
    const product = catalog.find((row) => row.sku === sku);
    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      return { content: [{ type: 'text', text: 'pay refused.' }], isError: true };
    }
    const orderId = `ord-${state.orders.length + 1}`;
    state.orders.push({ orderId, sku, quantity, total: product.unitPrice * quantity });
    return { content: [{ type: 'text', text: JSON.stringify({ orderId, status: 'paid-synthetic' }) }] };
  }

  return { content: [{ type: 'text', text: 'unknown tool' }], isError: true };
}

/** @param {boolean} value */
export function setAuthorized(value) {
  state.authorized = Boolean(value);
}

export function resetFixture() {
  state.orders.length = 0;
  state.authorized = false;
}
