import { completeAttestation, widgetTool } from './surface.js';

export const tools = [widgetTool()];
export const attestation = completeAttestation();
export const role = 'widget';

/** Recorded by the fixture at "register" time — the harness can see this. */
export const surfaceNotifications = [{ change: 'register', name: 'search' }];

const state = { bookings: [] };

export function getObservedState() {
  return { bookings: [...state.bookings] };
}

export function execute(_name, _input) {
  return { content: [{ type: 'text', text: 'search: 0 results' }] };
}

export function resetFixture() {
  state.bookings.length = 0;
}
