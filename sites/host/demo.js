/**
 * Host demo page boot — three vendor embeds, cross-vendor task path, Gate 2 API.
 */

import { startAggregator, ALLOWLIST } from './host/aggregator.js';
import { renderInspector } from './host/inspector.js';
import { executeToolCompat } from './vendor/adapter.js';

/** Canonical vendor origins — must match allowlist.js verbatim. */
export const ORIGINS = Object.freeze({
  acme: 'https://acme-booking-tomiwaalukos-projects.vercel.app',
  northwind: 'https://northwind-checkout-tomiwaalukos-projects.vercel.app',
  zenith: 'https://zenith-support-tomiwaalukos-projects.vercel.app'
});

/** @type {ReadonlyArray<{ origin: string, title: string }>} */
const WIDGETS = Object.freeze([
  { origin: ORIGINS.acme, title: 'Acme Booking' },
  { origin: ORIGINS.northwind, title: 'Northwind Checkout' },
  { origin: ORIGINS.zenith, title: 'Zenith Support' }
]);

/**
 * Withdraw Permissions Policy grant for one origin and reload that iframe.
 * @param {string} origin
 */
export function withdrawGrantAndReset(origin) {
  const iframe = document.querySelector(`iframe[data-origin="${CSS.escape(origin)}"]`);
  if (!(iframe instanceof HTMLIFrameElement)) return;

  const parts = (iframe.getAttribute('allow') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== `tools ${origin}`);

  iframe.setAttribute('allow', parts.join('; '));
  iframe.src = iframe.src;
}

/**
 * @param {HTMLElement} container
 */
function mountWidgetFrames(container) {
  container.replaceChildren();
  for (const { origin, title } of WIDGETS) {
    const frame = document.createElement('iframe');
    frame.allow = `tools ${origin}`;
    frame.dataset.origin = origin;
    frame.src = `${origin}/`;
    frame.title = title;
    container.appendChild(frame);
  }
}

/**
 * @returns {Promise<Array<{ name: string, origin: string | undefined }>>}
 */
async function listHostTools() {
  if (!document.modelContext?.getTools) return [];
  const tools = await document.modelContext.getTools();
  return tools.map((tool) => ({ name: tool.name, origin: tool.origin }));
}

/**
 * @param {string} name
 * @param {unknown} input
 */
async function callProxy(name, input) {
  if (!document.modelContext?.getTools) {
    return {
      ok: false,
      code: 'MODEL_CONTEXT_UNAVAILABLE',
      message: 'document.modelContext is not available on this page.'
    };
  }

  const tools = await document.modelContext.getTools();
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) {
    return {
      ok: false,
      code: 'PROXY_NOT_FOUND',
      message: `No tool named ${name} on the governed host surface.`
    };
  }
  return executeToolCompat(tool, input);
}

/**
 * @param {{ ok: true, result: unknown } | { ok: false, code: string, message: string }} outcome
 * @returns {unknown}
 */
function extractPayload(outcome) {
  if (!outcome.ok) return null;
  const result = /** @type {{ content?: Array<{ text?: string }> }} */ (outcome.result);
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') return outcome.result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * @param {HTMLElement} outcomeEl
 * @param {{ flights: unknown, support: unknown, acmeOk: boolean, zenithOk: boolean }} data
 */
function renderTripOutcome(outcomeEl, data) {
  outcomeEl.replaceChildren();
  outcomeEl.dataset.state = 'complete';

  const heading = document.createElement('h2');
  heading.id = 'outcome-heading';
  heading.textContent = 'Trip plan ready';

  const intro = document.createElement('p');
  intro.className = 'outcome-lead';
  intro.textContent =
    'An agent combined flights from Acme Booking with return-policy articles from Zenith Support — two vendors, one page-level outcome.';

  const grid = document.createElement('div');
  grid.className = 'outcome-grid';

  const flightsCard = document.createElement('article');
  flightsCard.className = 'outcome-card';
  flightsCard.innerHTML = '<h3>Flights · Acme Booking</h3>';
  const flightsBody = document.createElement('div');
  flightsBody.className = 'outcome-card-body';
  if (data.acmeOk && data.flights) {
    flightsBody.appendChild(formatFlightResults(data.flights));
  } else {
    flightsBody.textContent = 'Flight search did not return results.';
  }
  flightsCard.appendChild(flightsBody);

  const supportCard = document.createElement('article');
  supportCard.className = 'outcome-card';
  supportCard.innerHTML = '<h3>Support · Zenith Support</h3>';
  const supportBody = document.createElement('div');
  supportBody.className = 'outcome-card-body';
  if (data.zenithOk && data.support) {
    supportBody.appendChild(formatSupportResults(data.support));
  } else {
    supportBody.textContent = 'Support search did not return results.';
  }
  supportCard.appendChild(supportBody);

  grid.append(flightsCard, supportCard);
  outcomeEl.append(heading, intro, grid);
}

/**
 * @param {unknown} payload
 * @returns {HTMLElement}
 */
function formatFlightResults(payload) {
  const wrap = document.createElement('div');
  const results = /** @type {{ results?: Array<{ destination?: string, date?: string, seats?: number, id?: string }> }} */ (
    payload
  ).results;
  if (!Array.isArray(results) || results.length === 0) {
    wrap.textContent = 'No matching flights.';
    return wrap;
  }
  const list = document.createElement('ul');
  list.className = 'outcome-list';
  for (const row of results) {
    const item = document.createElement('li');
    item.textContent = `${row.destination ?? 'Unknown'} · ${row.date ?? '—'} · ${row.seats ?? '?'} seats (${row.id ?? '—'})`;
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

/**
 * @param {unknown} payload
 * @returns {HTMLElement}
 */
function formatSupportResults(payload) {
  const wrap = document.createElement('div');
  const results = /** @type {{ results?: Array<{ title?: string, id?: string }> }} */ (payload).results;
  if (!Array.isArray(results) || results.length === 0) {
    wrap.textContent = 'No matching support articles.';
    return wrap;
  }
  const list = document.createElement('ul');
  list.className = 'outcome-list';
  for (const row of results) {
    const item = document.createElement('li');
    item.textContent = `${row.title ?? 'Untitled'} (${row.id ?? '—'})`;
    list.appendChild(item);
  }
  wrap.appendChild(list);
  return wrap;
}

/**
 * @param {HTMLElement} outcomeEl
 */
function renderOutcomePending(outcomeEl) {
  outcomeEl.replaceChildren();
  outcomeEl.dataset.state = 'pending';

  const heading = document.createElement('h2');
  heading.id = 'outcome-heading';
  heading.textContent = 'Plan a Lisbon trip';

  const copy = document.createElement('p');
  copy.className = 'outcome-lead';
  copy.textContent =
    'Ask an agent to find flights to Lisbon and check return policies — or run the demo task below. The outcome appears here first.';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.id = 'run-trip-plan';
  runBtn.textContent = 'Run cross-vendor trip plan';
  runBtn.addEventListener('click', () => {
    runTripPlan(outcomeEl).catch((error) => {
      renderOutcomeError(outcomeEl, String(error?.message ?? error));
    });
  });

  outcomeEl.append(heading, copy, runBtn);
}

/**
 * @param {HTMLElement} outcomeEl
 * @param {string} message
 */
function renderOutcomeError(outcomeEl, message) {
  outcomeEl.dataset.state = 'error';
  const alert = document.createElement('p');
  alert.className = 'outcome-error';
  alert.textContent = message;
  outcomeEl.appendChild(alert);
}

/**
 * AE12 cross-vendor path — both namespaced search tools, visible page outcome.
 * @param {HTMLElement} [outcomeEl]
 */
export async function runTripPlan(outcomeEl = document.getElementById('outcome')) {
  if (!(outcomeEl instanceof HTMLElement)) {
    throw new Error('Outcome region is missing from the page.');
  }

  outcomeEl.dataset.state = 'running';
  outcomeEl.replaceChildren();
  const status = document.createElement('p');
  status.className = 'outcome-lead';
  status.textContent = 'Searching Acme flights and Zenith support articles…';
  outcomeEl.appendChild(status);

  const [acmeOutcome, zenithOutcome] = await Promise.all([
    callProxy('acme.booking.search', { query: 'lisbon' }),
    callProxy('zenith.support.search', { query: 'return' })
  ]);

  renderTripOutcome(outcomeEl, {
    flights: extractPayload(acmeOutcome),
    support: extractPayload(zenithOutcome),
    acmeOk: acmeOutcome.ok,
    zenithOk: zenithOutcome.ok
  });

  return { acme: acmeOutcome, zenith: zenithOutcome };
}

/**
 * @param {HTMLElement} listEl
 * @param {{ origins: Array<{ origin: string, tools?: string[] }> }} snapshot
 */
function renderToolList(listEl, snapshot) {
  listEl.replaceChildren();

  /** @type {Array<{ name: string, origin: string }>} */
  const rows = [];
  for (const entry of snapshot.origins ?? []) {
    for (const name of entry.tools ?? []) {
      rows.push({ name, origin: entry.origin });
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'tools-empty';
    empty.textContent = 'No federated tools on the governed surface yet.';
    listEl.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = 'tool-provenance-list';
  for (const row of rows) {
    const item = document.createElement('li');
    const name = document.createElement('code');
    name.textContent = row.name;
    const origin = document.createElement('span');
    origin.className = 'tool-origin';
    origin.textContent = row.origin;
    item.append(name, origin);
    list.appendChild(item);
  }
  listEl.appendChild(list);
}

/**
 * PRO-16 call site: full snapshot plus onRevoke. Skeletal inspector reads `.origins` only.
 *
 * @param {HTMLElement} container
 * @param {{ generation?: number, origins?: Array<{ origin: string, state?: string, tools?: string[] }>, errors?: unknown[] }} snapshot
 * @param {{ onRevoke?: (origin: string) => void }} [options]
 */
function mountInspector(container, snapshot, options) {
  renderInspector(container, snapshot, options);
  if (container.querySelector('[data-origin="generation"]')) {
    container.replaceChildren();
    renderInspector(container, snapshot.origins ?? []);
  }
}

/**
 * @param {HTMLElement} unsupportedEl
 * @param {HTMLElement} demoEl
 */
function showUnsupportedBrowser(unsupportedEl, demoEl) {
  unsupportedEl.hidden = false;
  demoEl.hidden = true;
}

/**
 * Boot the host demo when WebMCP is available.
 */
export function bootDemo() {
  const unsupportedEl = document.getElementById('unsupported');
  const demoEl = document.getElementById('demo');
  const outcomeEl = document.getElementById('outcome');
  const toolListEl = document.getElementById('tool-list');
  const framesEl = document.getElementById('frames');
  const inspectorEl = document.getElementById('inspector');

  if (
    !(unsupportedEl instanceof HTMLElement) ||
    !(demoEl instanceof HTMLElement) ||
    !(outcomeEl instanceof HTMLElement) ||
    !(toolListEl instanceof HTMLElement) ||
    !(framesEl instanceof HTMLElement) ||
    !(inspectorEl instanceof HTMLElement)
  ) {
    throw new Error('Demo page is missing required mount points.');
  }

  if (!document.modelContext) {
    showUnsupportedBrowser(unsupportedEl, demoEl);
    return;
  }

  unsupportedEl.hidden = true;
  demoEl.hidden = false;

  mountWidgetFrames(framesEl);
  renderOutcomePending(outcomeEl);

  window.ambient = {
    ALLOWLIST,
    call: callProxy,
    listTools: listHostTools,
    runTripPlan: () => runTripPlan(outcomeEl)
  };

  startAggregator((snapshot) => {
    mountInspector(inspectorEl, snapshot, {
      onRevoke: (origin) => withdrawGrantAndReset(origin)
    });
    renderToolList(toolListEl, snapshot);
  });

  const gateBtn = document.getElementById('gate2-call');
  gateBtn?.addEventListener('click', async () => {
    const logEl = document.getElementById('gate2-log');
    const outcome = await callProxy('acme.booking.search', { query: 'flights to lisbon' });
    if (logEl instanceof HTMLElement) {
      logEl.textContent = JSON.stringify(outcome, null, 2);
    }
  });
}
