import { completeAttestation, widgetTool } from './surface.js';

/**
 * Mechanical + attested surface only. No execute hook, no observed-state
 * buffer, no surface-change log — observed rules must stay not-evaluable.
 */
export const tools = [widgetTool()];
export const attestation = completeAttestation();
export const role = 'widget';
