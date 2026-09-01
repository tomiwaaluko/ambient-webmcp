/**
 * Node-loadable subject for a checker.
 * CONTRACT.md does not specify this module's export shape; this is a best-effort surface:
 * widgetId, tools (name, description, inputSchema, annotations, execute), attestation.
 */
import { registerWidget, WIDGET_ID } from "./widget.js";
import { getAttestation, getRegisteredTools } from "./helper-stub.js";

await registerWidget();

export const widgetId = WIDGET_ID;
export const tools = getRegisteredTools();
export const attestation = getAttestation(WIDGET_ID);

export default {
  widgetId,
  tools,
  attestation,
};
