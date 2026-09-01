/**
 * PRO-5 spike widget behaviour, shared by the vendor origins.
 *
 * Disposable. PRO-7 writes the real `registerConformantTool` helper and PRO-14
 * writes the real vendor pages; this only has to be parameterisable enough to
 * flip one leg of the three-way AND at a time and report what each side sees.
 *
 * Query parameters read from the widget page's own URL:
 *   exposed=host   registerTool's second argument gets exposedTo: [HOST]  (default)
 *   exposed=none   no exposedTo at all
 *   exposed=wrong  exposedTo names a decoy origin
 *   late=<ms>      register a second tool after <ms>, for the toolchange probe
 */

export const ORIGINS = {
  host: 'https://ambient-host-tomiwaalukos-projects.vercel.app',
  acme: 'https://acme-booking-tomiwaalukos-projects.vercel.app',
  northwind: 'https://northwind-checkout-tomiwaalukos-projects.vercel.app',
  zenith: 'https://zenith-support-tomiwaalukos-projects.vercel.app'
};

/**
 * @param {object} config
 * @param {string} config.label       vendor label, e.g. 'acme'
 * @param {string[]} config.toolNames tools to register on load
 * @param {(line: string) => void} config.onLog
 */
export function startSpikeWidget({ label, toolNames, onLog }) {
  const params = new URLSearchParams(location.search);
  const exposedMode = params.get('exposed') ?? 'host';
  const lateMs = params.get('late') ? Number(params.get('late')) : null;

  const diagnostics = {
    label,
    origin: location.origin,
    exposedMode,
    hasModelContext: typeof document.modelContext !== 'undefined',
    isFramed: window.top !== window.self,
    registered: [],
    errors: []
  };

  function exposedToFor(mode) {
    if (mode === 'none') return undefined;
    if (mode === 'wrong') return [ORIGINS.zenith === location.origin ? ORIGINS.acme : ORIGINS.zenith];
    return [ORIGINS.host];
  }

  /**
   * `exposedTo` belongs in registerTool's SECOND argument. Inside the
   * descriptor it is an unrecognised dictionary member: dropped in silence,
   * the tool still registers, and the host sees nothing with no error on
   * either side. registerTool also returns a promise, so a call that is not
   * awaited throws its own rejection away.
   */
  async function register(name, description) {
    const options = {};
    const exposedTo = exposedToFor(exposedMode);
    if (exposedTo) options.exposedTo = exposedTo;

    try {
      await document.modelContext.registerTool(
        {
          name,
          description,
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: `Free-text query for ${label}.` } },
            required: ['query']
          },
          annotations: { readOnlyHint: true },
          async execute(input) {
            return {
              content: [
                { type: 'text', text: `${label}:${name} received query=${JSON.stringify((input && input.query) ?? null)}` }
              ]
            };
          }
        },
        options
      );
      diagnostics.registered.push(name);
      onLog(`registered ${name} exposedTo=${JSON.stringify(exposedTo ?? null)}`);
      return true;
    } catch (cause) {
      const text = `${cause && cause.name}: ${cause && cause.message}`;
      diagnostics.errors.push(`${name} -> ${text}`);
      onLog(`FAILED ${name} -> ${text}`);
      return false;
    }
  }

  function postToParent(type, extra = {}) {
    if (window.top === window.self) return;
    parent.postMessage({ source: 'ambient-spike-widget', type, diagnostics, ...extra }, '*');
  }

  window.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || data.target !== 'ambient-spike-widget') return;
    const reply = (extra) => postToParent('cmd-result', { cmd: data.cmd, replyTo: data.replyTo, ...extra });

    if (data.cmd === 'register-late') {
      const name = data.name || `${label}_late_${Date.now()}`;
      reply({ ok: await register(name, 'Late tool registered on host command.'), name });
      return;
    }

    if (data.cmd === 'report') {
      try {
        const own = await document.modelContext.getTools();
        reply({ own: own.map((t) => ({ name: t.name, origin: t.origin })), ownError: null });
      } catch (cause) {
        reply({ own: null, ownError: `${cause && cause.name}: ${cause && cause.message}` });
      }
      return;
    }

    // Can this frame reach *upward* to the embedder's tools, or *sideways* to a
    // sibling frame's, just by naming the origin? Spike Q5.
    if (data.cmd === 'report-cross') {
      try {
        const tools = await document.modelContext.getTools({ fromOrigins: data.fromOrigins ?? [] });
        reply({
          asked: data.fromOrigins ?? [],
          cross: tools.map((t) => ({ name: t.name, origin: t.origin })),
          crossError: null
        });
      } catch (cause) {
        reply({ asked: data.fromOrigins ?? [], cross: null, crossError: `${cause && cause.name}: ${cause && cause.message}` });
      }
    }
  });

  (async () => {
    if (!diagnostics.hasModelContext) {
      onLog('document.modelContext is undefined — WebMCP unavailable here.');
    } else {
      for (const name of toolNames) await register(name, `${label} capability: ${name}.`);
    }

    if (lateMs !== null && diagnostics.hasModelContext) {
      setTimeout(async () => {
        await register(`${label}_late`, 'Registered after first paint, to test embedder toolchange.');
        postToParent('late-registered');
      }, lateMs);
    }

    onLog(`modelContext=${diagnostics.hasModelContext} framed=${diagnostics.isFramed}`);
    postToParent('ready');
  })();

  return diagnostics;
}
