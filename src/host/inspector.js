/**
 * Federation inspector — one row per origin: lifecycle, reason, tools, revoke.
 *
 * Renders aggregator state; it does not decide it. Revocation withdraws host
 * proxies and asks the page to withdraw the iframe Permissions Policy grant.
 * Aborting a registration does not cancel an in-flight side effect.
 */

import { redact } from './redact.js';
import { revokeOrigin as aggregatorRevokeOrigin } from './aggregator.js';

const LIFECYCLE_STATES = Object.freeze([
  'discovering',
  'evaluating',
  'active',
  'degraded',
  'quarantined',
  'revoking',
  'revoked'
]);

/** Shape + text carry state; color is optional decoration only (R59). */
const STATE_MARK = Object.freeze({
  discovering: { shape: '○', label: 'Discovering' },
  evaluating: { shape: '◔', label: 'Evaluating' },
  active: { shape: '●', label: 'Active' },
  degraded: { shape: '▲', label: 'Degraded' },
  quarantined: { shape: '■', label: 'Quarantined' },
  revoking: { shape: '◇', label: 'Revoking' },
  revoked: { shape: '✕', label: 'Revoked' }
});

const REVOKEABLE = new Set(['active', 'degraded', 'quarantined']);

const INSPECTOR_CSS = `
.ambient-inspector { font: inherit; min-width: 0; }
.inspector-status { margin: 0 0 0.6rem; font-size: 0.9em; }
.inspector-origins { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.65rem; }
.inspector-origin { border: 1px solid color-mix(in srgb, currentColor 28%, transparent); border-radius: 6px; padding: 0.6rem 0.7rem; display: grid; gap: 0.3rem; min-width: 0; }
.inspector-origin:focus { outline: 2px solid currentColor; outline-offset: 2px; }
.inspector-origin-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.65rem; min-width: 0; }
.inspector-shape { font-size: 0.95em; }
.inspector-origin-id { font-weight: 600; overflow-wrap: anywhere; }
.inspector-state-label { font-weight: 600; }
.inspector-cause { font-size: 0.9em; }
.inspector-reason, .inspector-tools, .inspector-flight, .inspector-note { margin: 0; overflow-wrap: anywhere; }
ul.inspector-tools { padding-left: 1.1rem; }
.inspector-actions { margin-top: 0.25rem; }
.inspector-actions button { font: inherit; min-height: 2.25rem; padding: 0.35rem 0.75rem; }
.inspector-log { margin-top: 0.85rem; }
.inspector-log h3 { font-size: 0.95em; margin: 0 0 0.35rem; }
.inspector-log ol { margin: 0; padding-left: 1.2rem; font-size: 0.85em; overflow-wrap: anywhere; }
.inspector-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
`;

/** @type {{ at: number, text: string }[]} */
let sessionLogs = [];

/** @type {Map<string, string>} */
let previousByOrigin = new Map();

/** @type {string | null} */
let pendingFocusOrigin = null;

/** @type {{ onRevoke?: (origin: string) => void }} */
let lastOptions = {};

/** @type {HTMLElement | null} */
let lastContainer = null;

/** @type {Set<string>} */
let revokedWithoutPageGrant = new Set();

/**
 * Session-scoped inspector memory. Does not persist and is not transmitted.
 */
export function resetInspectorForTests() {
  sessionLogs = [];
  previousByOrigin = new Map();
  pendingFocusOrigin = null;
  lastOptions = {};
  lastContainer = null;
  revokedWithoutPageGrant = new Set();
}

export function getInspectorLogsForTests() {
  return sessionLogs.map((entry) => entry.text);
}

/**
 * @param {HTMLElement} container
 * @param {object | Array<object>} snapshotOrRows
 * @param {{ onRevoke?: (origin: string) => void }} [options]
 */
export function renderInspector(container, snapshotOrRows, options) {
  if (!container) {
    throw new Error('renderInspector requires a container element.');
  }

  lastOptions = options ?? {};
  lastContainer = container;

  const snapshot = normalizeSnapshot(snapshotOrRows);
  ensureStyles();
  const chrome = ensureChrome(container);
  renderOriginList(chrome, snapshot);
  renderLog(chrome.logList);
  announceChanges(chrome, snapshot);
  restoreFocus(container);
}

function normalizeSnapshot(snapshotOrRows) {
  if (Array.isArray(snapshotOrRows)) {
    return { origins: snapshotOrRows, errors: [], generation: null };
  }
  if (snapshotOrRows && typeof snapshotOrRows === 'object') {
    return {
      origins: Array.isArray(snapshotOrRows.origins) ? snapshotOrRows.origins : [],
      errors: Array.isArray(snapshotOrRows.errors) ? snapshotOrRows.errors : [],
      generation: snapshotOrRows.generation ?? null
    };
  }
  return { origins: [], errors: [], generation: null };
}

function ensureStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ambient-inspector-styles')) return;
  const style = document.createElement('style');
  style.id = 'ambient-inspector-styles';
  style.textContent = INSPECTOR_CSS;
  const host = document.head ?? document.documentElement;
  host?.appendChild?.(style);
}

function ensureChrome(container) {
  let root = childByClass(container, 'ambient-inspector');
  if (!root) {
    container.replaceChildren();
    root = document.createElement('div');
    root.className = 'ambient-inspector';
    root.dataset.inspectorRoot = 'true';
    root.tabIndex = -1;

    const status = document.createElement('p');
    status.className = 'inspector-status';
    status.dataset.inspectorStatus = 'true';

    const polite = document.createElement('div');
    polite.className = 'inspector-sr-only';
    polite.dataset.inspectorLive = 'polite';
    polite.setAttribute('aria-live', 'polite');
    polite.setAttribute('aria-atomic', 'true');

    const assertive = document.createElement('div');
    assertive.className = 'inspector-sr-only';
    assertive.dataset.inspectorLive = 'assertive';
    assertive.setAttribute('aria-live', 'assertive');
    assertive.setAttribute('aria-atomic', 'true');

    const list = document.createElement('ul');
    list.className = 'inspector-origins';

    const logSection = document.createElement('section');
    logSection.className = 'inspector-log';
    logSection.setAttribute('aria-label', 'Inspector session log');
    const logHeading = document.createElement('h3');
    logHeading.textContent = 'Session log';
    const logList = document.createElement('ol');
    logList.dataset.inspectorLog = 'true';
    logSection.append(logHeading, logList);

    root.append(status, polite, assertive, list, logSection);
    container.appendChild(root);
  }

  return {
    root,
    status: root.querySelector('[data-inspector-status]'),
    polite: root.querySelector('[data-inspector-live="polite"]'),
    assertive: root.querySelector('[data-inspector-live="assertive"]'),
    list: childByClass(root, 'inspector-origins'),
    logList: root.querySelector('[data-inspector-log]')
  };
}

function childByClass(node, className) {
  if (!node?.children) return null;
  for (const child of node.children) {
    if (typeof child.className === 'string' && child.className.split(/\s+/).includes(className)) {
      return child;
    }
  }
  return node.querySelector?.('.' + className) ?? null;
}

function renderOriginList(chrome, snapshot) {
  const { list } = chrome;
  list.replaceChildren();

  if (snapshot.origins.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'inspector-empty';
    empty.textContent = 'No federated origins yet.';
    list.appendChild(empty);
    return;
  }

  for (const row of snapshot.origins) {
    list.appendChild(buildOriginRow(row, snapshot));
  }
}

function buildOriginRow(row, snapshot) {
  const origin = String(row.origin ?? '');
  const state = LIFECYCLE_STATES.includes(row.state) ? row.state : 'degraded';
  const reason = visibleReason(row.reason);
  const cause = classifyCause(row, snapshot.errors);
  const mark = STATE_MARK[state] ?? STATE_MARK.degraded;

  const li = document.createElement('li');
  li.className = 'inspector-origin';
  li.dataset.origin = origin;
  li.dataset.state = state;
  li.dataset.cause = cause.key;
  li.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'inspector-origin-head';

  const shape = document.createElement('span');
  shape.className = 'inspector-shape';
  shape.setAttribute('aria-hidden', 'true');
  shape.textContent = mark.shape;

  const id = document.createElement('span');
  id.className = 'inspector-origin-id';
  id.textContent = origin;

  const stateLabel = document.createElement('span');
  stateLabel.className = 'inspector-state-label';
  stateLabel.textContent = mark.label;

  const causeLabel = document.createElement('span');
  causeLabel.className = 'inspector-cause';
  causeLabel.dataset.causeLabel = cause.key;
  causeLabel.textContent = cause.label;

  head.append(shape, id, stateLabel, causeLabel);

  const reasonEl = document.createElement('p');
  reasonEl.className = 'inspector-reason';
  reasonEl.textContent = redactText(reason);

  li.append(head, reasonEl);

  const tools = Array.isArray(row.tools) ? row.tools : [];
  if (tools.length > 0) {
    const toolsList = document.createElement('ul');
    toolsList.className = 'inspector-tools';
    for (const name of tools) {
      const item = document.createElement('li');
      item.textContent = redactText(String(name));
      toolsList.appendChild(item);
    }
    li.appendChild(toolsList);
  } else {
    const none = document.createElement('p');
    none.className = 'inspector-tools';
    none.textContent = 'No tools on the governed surface.';
    li.appendChild(none);
  }

  const flight = flightCopy(row);
  if (flight) {
    const flightEl = document.createElement('p');
    flightEl.className = 'inspector-flight';
    flightEl.dataset.flight = 'true';
    flightEl.textContent = flight;
    li.appendChild(flightEl);
  }

  if (REVOKEABLE.has(state)) {
    const actions = document.createElement('div');
    actions.className = 'inspector-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Revoke tools';
    button.setAttribute('aria-label', `Revoke tools from ${origin}`);
    button.addEventListener('click', () => {
      handleRevoke(origin, snapshot);
    });
    actions.appendChild(button);
    li.appendChild(actions);
  } else if (state === 'revoked' && revokedWithoutPageGrant.has(origin)) {
    const note = document.createElement('p');
    note.className = 'inspector-note';
    note.textContent =
      'Host proxies withdrawn. Withdrawing the iframe Permissions Policy grant is the page\'s job.';
    li.appendChild(note);
  }

  return li;
}

function visibleReason(reason) {
  if (typeof reason === 'string' && reason.length > 0) {
    return reason;
  }
  return 'REASON_MISSING';
}

/**
 * Distinguish silent-failure families so they are not one "broken" row (R29).
 * Malformed calls are classified before "capability unavailable".
 *
 * @param {object} row
 * @param {Array<{ origin: string, code?: string, message?: string }>} errors
 */
export function classifyCause(row, errors = []) {
  const state = row.state;
  const matched = errors.find((item) => item.origin === row.origin);
  const blob = [
    row.reason,
    row.code,
    matched?.code,
    matched?.message
  ]
    .filter((part) => typeof part === 'string' && part.length > 0)
    .join(' ');

  if (state === 'discovering') {
    return { key: 'not-loaded', label: 'Not loaded' };
  }
  if (state === 'evaluating') {
    return { key: 'evaluating', label: 'Evaluating' };
  }
  if (state === 'active') {
    return { key: 'active', label: 'Active' };
  }
  if (state === 'revoking') {
    return { key: 'revoking', label: 'Revoking' };
  }
  if (state === 'revoked') {
    return { key: 'revoked', label: 'Revoked' };
  }
  if (state === 'quarantined') {
    return { key: 'quarantined', label: 'Quarantined' };
  }

  if (isMalformedCall(blob)) {
    return { key: 'malformed-call', label: 'Malformed call' };
  }
  if (isNoToken(blob)) {
    return { key: 'no-token', label: 'No token' };
  }
  if (isGrantMissing(blob)) {
    return { key: 'grant-missing', label: 'Grant missing' };
  }
  if (isBoundNamed(blob)) {
    return { key: 'degraded-bound', label: 'Degraded (bound named)' };
  }
  if (isZeroTools(blob)) {
    return { key: 'zero-tools', label: 'Zero tools' };
  }

  return { key: 'degraded', label: 'Degraded' };
}

function isMalformedCall(blob) {
  return /malformed|TypeError|Required member is undefined|inputSchema|INPUT_SCHEMA_PARSE_FAILED|INPUT_SHAPE_UNSUPPORTED|execute property|Required member/i.test(
    blob
  );
}

function isNoToken(blob) {
  return /MODEL_CONTEXT_UNAVAILABLE|origin trial|no token|modelContext/i.test(blob);
}

function isGrantMissing(blob) {
  return /NotAllowedError|permissions policy|grant missing|allow=["']?tools/i.test(blob);
}

function isBoundNamed(blob) {
  return /BOUND_EXCEEDED|change-rate|tool-count|concurrency/i.test(blob);
}

function isZeroTools(blob) {
  return /no tools|zero tools|reported no tools/i.test(blob);
}

function flightCopy(row) {
  const inFlight = Number(row.inFlightAtRevoke || row.inFlight || 0);
  const drops = Array.isArray(row.dropRecords) ? row.dropRecords : [];
  const discarded = drops.filter(
    (record) => record && (record.code === 'RESULT_AFTER_REVOCATION' || record.kind === 'revocation')
  );

  if (inFlight <= 0 && discarded.length === 0) {
    if (row.state !== 'revoking' && row.state !== 'revoked') return '';
    return '';
  }

  const parts = [];
  if (inFlight > 0) {
    parts.push(
      `An execution was in flight at revocation. The side effect may still complete.`
    );
  }
  if (discarded.length > 0) {
    parts.push(
      `Late result discarded (${discarded[0].code || 'RESULT_AFTER_REVOCATION'}); not forwarded.`
    );
  } else if (inFlight > 0) {
    parts.push('A late result will be discarded if it arrives; it is not forwarded.');
  }
  return parts.join(' ');
}

function redactText(text) {
  return redact(text).text;
}

function pushLog(text) {
  sessionLogs.push({ at: Date.now(), text: redactText(text) });
}

function renderLog(logList) {
  if (!logList) return;
  logList.replaceChildren();
  const recent = sessionLogs.slice(-40);
  if (recent.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No inspector events this session. Logs are held in memory only.';
    logList.appendChild(item);
    return;
  }
  for (const entry of recent) {
    const item = document.createElement('li');
    item.textContent = entry.text;
    logList.appendChild(item);
  }
}

function announceChanges(chrome, snapshot) {
  const firstPaint = previousByOrigin.size === 0;
  const lines = [];
  let urgent = false;

  for (const row of snapshot.origins) {
    const prev = previousByOrigin.get(row.origin);
    if (!firstPaint && prev && prev !== row.state) {
      const label = (STATE_MARK[row.state] ?? STATE_MARK.degraded).label;
      lines.push(`${shortOrigin(row.origin)} ${label}: ${redactText(visibleReason(row.reason))}`);
      if (row.state === 'quarantined' || row.state === 'revoking' || row.state === 'revoked') {
        urgent = true;
      }
    }
    previousByOrigin.set(row.origin, row.state);
  }

  if (lines.length === 0) {
    return;
  }

  const text = lines.join(' ');
  setLive(chrome, urgent ? 'assertive' : 'polite', text);
}

function shortOrigin(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

function setLive(chrome, kind, text) {
  if (chrome.status) {
    chrome.status.textContent = text;
  }
  const region = kind === 'assertive' ? chrome.assertive : chrome.polite;
  const other = kind === 'assertive' ? chrome.polite : chrome.assertive;
  if (other) other.textContent = '';
  if (!region) return;
  region.textContent = '';
  queueMicrotask(() => {
    region.textContent = text;
  });
}

function restoreFocus(container) {
  if (!pendingFocusOrigin) return;
  const row = findOriginRow(container, pendingFocusOrigin);
  if (row && typeof row.focus === 'function') {
    row.focus();
    // Hold focus until revoked. A mid-revoke toolchange can briefly paint
    // `active` again; clearing on REVOKEABLE would drop pending and lose
    // focus to document.body when the button is finally removed (R60).
    if (row.dataset.state === 'revoked') {
      pendingFocusOrigin = null;
    }
    return;
  }
  const root = childByClass(container, 'ambient-inspector');
  if (root && typeof root.focus === 'function') {
    root.focus();
  }
  pendingFocusOrigin = null;
}

function findOriginRow(container, origin) {
  const rows = container.querySelectorAll?.('.inspector-origin') ?? [];
  for (const row of rows) {
    if (row.dataset?.origin === origin) return row;
  }
  return null;
}

function handleRevoke(origin, snapshot) {
  pendingFocusOrigin = origin;
  const pageRevoke = lastOptions.onRevoke;
  if (typeof pageRevoke === 'function') {
    pageRevoke(origin);
  } else {
    revokedWithoutPageGrant.add(origin);
    pushLog(
      `PP_GRANT_PAGE_JOB: Permissions Policy grant withdrawal for ${origin} is the page's job; host proxies will still be withdrawn.`
    );
  }

  pushLog(`Revoking ${origin}.`);

  const revokingSnapshot = patchOrigin(snapshot, origin, {
    state: 'revoking',
    reason: 'Host owner requested revocation.',
    tools: []
  });
  if (lastContainer) {
    renderInspector(lastContainer, revokingSnapshot, lastOptions);
  }

  runRevoke(origin, snapshot);
}

function patchOrigin(snapshot, origin, patch) {
  return {
    generation: snapshot.generation,
    errors: snapshot.errors,
    origins: snapshot.origins.map((row) => (row.origin === origin ? { ...row, ...patch } : row))
  };
}

async function runRevoke(origin, snapshot) {
  try {
    const snapshots = await aggregatorRevokeOrigin(origin);
    const latest = snapshots?.[snapshots.length - 1];
    if (latest && lastContainer) {
      const byOrigin = new Map(latest.origins.map((item) => [item.origin, item]));
      const merged = {
        generation: latest.generation,
        errors: snapshot.errors,
        origins: snapshot.origins.map((row) => byOrigin.get(row.origin) ?? row)
      };
      for (const item of latest.origins) {
        if (!snapshot.origins.some((row) => row.origin === item.origin)) {
          merged.origins.push(item);
        }
      }
      renderInspector(lastContainer, merged, lastOptions);
    }
  } catch (cause) {
    pushLog(String(cause && cause.message ? cause.message : cause));
    if (lastContainer) {
      renderInspector(lastContainer, snapshot, lastOptions);
    }
  }
}
