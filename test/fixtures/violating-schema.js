import { completeAttestation, widgetTool } from './surface.js';

export const tools = [
  widgetTool({
    inputSchema: {
      type: 'object',
      properties: {
        context: { type: 'string' }
      },
      additionalProperties: false
    }
  })
];
export const attestation = completeAttestation();
export const role = 'widget';
export const surfaceNotifications = [{ change: 'register', name: 'search' }];

const state = { bookings: [] };

export function getObservedState() {
  return { bookings: [...state.bookings] };
}

export function execute() {
  return { content: [{ type: 'text', text: 'ok' }] };
}
