import { registerConformantTool } from "./helper-stub.js";

export const WIDGET_ID = "noteboard";

/** Synthetic embedder origin. This widget is not a real vendor product. */
export const EXPOSED_TO = ["https://example.com"];

const notes = [
  {
    id: "note-1",
    title: "Plant watering",
    body: "Water the ferns on Tuesday.",
  },
];

let registered = false;

async function authorizeAdd() {
  if (typeof globalThis.confirm === "function") {
    return globalThis.confirm("Add this note to the board?");
  }
  if (typeof globalThis.__ambientAuthorize === "function") {
    return globalThis.__ambientAuthorize();
  }
  return false;
}

export async function registerWidget() {
  if (registered) {
    return;
  }

  await registerConformantTool({
    widgetId: WIDGET_ID,
    name: "list",
    description: "Returns the notes currently on the board.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    readOnly: true,
    untrustedContent: true,
    exposedTo: EXPOSED_TO,
    execute() {
      return {
        notes: notes.map((note) => ({
          id: note.id,
          title: note.title,
          body: note.body,
        })),
      };
    },
  });

  await registerConformantTool({
    widgetId: WIDGET_ID,
    name: "add",
    description: "Adds a note with the given title and body to the board.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short title of the note.",
        },
        body: {
          type: "string",
          description: "Body text of the note.",
        },
      },
      required: ["title", "body"],
      additionalProperties: false,
    },
    readOnly: false,
    untrustedContent: true,
    exposedTo: EXPOSED_TO,
    authorize: authorizeAdd,
    execute(input) {
      const title = typeof input?.title === "string" ? input.title : "";
      const body = typeof input?.body === "string" ? input.body : "";
      const note = {
        id: `note-${notes.length + 1}`,
        title,
        body,
      };
      notes.push(note);
      return { added: { id: note.id, title: note.title, body: note.body } };
    },
  });

  registered = true;
}

if (typeof window !== "undefined") {
  registerWidget().catch((error) => {
    console.error(error);
  });
}
