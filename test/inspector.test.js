import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  renderInspector,
  resetInspectorForTests,
  getInspectorLogsForTests,
  classifyCause
} from '../src/host/inspector.js';
import {
  revokeOrigin,
  seedOriginForTests,
  resetAggregatorForTests,
  getRegisteredProxyNames,
  getOriginRuntimeForTests
} from '../src/host/aggregator.js';

const ACME = 'https://acme-booking-tomiwaalukos-projects.vercel.app';
const NORTHWIND = 'https://northwind-checkout-tomiwaalukos-projects.vercel.app';
const ZENITH = 'https://zenith-support-tomiwaalukos-projects.vercel.app';

const INSPECTOR_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/host/inspector.js'),
  'utf8'
);

function createNode(tagName) {
  const attrs = {};
  const datasetStore = {};
  const listeners = new Map();
  const node = {
    nodeType: tagName === '#text' ? 3 : 1,
    tagName: tagName === '#text' ? undefined : tagName.toUpperCase(),
    children: [],
    parentNode: null,
    className: '',
    _text: '',
    style: {},
    tabIndex: 0,
    type: '',
    hidden: false,
    attributes: attrs,
    dataset: datasetStore,
    get textContent() {
      if (this.children.length === 0) return this._text;
      return this.children.map((child) => child.textContent).join('');
    },
    set textContent(value) {
      this.children = [];
      this._text = value == null ? '' : String(value);
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
      const data = /^data-(.+)$/.exec(name);
      if (data) {
        datasetStore[dataToCamel(data[1])] = String(value);
      }
    },
    getAttribute(name) {
      if (Object.prototype.hasOwnProperty.call(attrs, name)) return attrs[name];
      return null;
    },
    appendChild(child) {
      if (typeof child === 'string') {
        child = createNode('#text');
        child.textContent = arguments[0];
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...nodes) {
      for (const item of nodes) {
        if (typeof item === 'string') {
          const text = createNode('#text');
          text.textContent = item;
          this.appendChild(text);
        } else {
          this.appendChild(item);
        }
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this._text = '';
      this.append(...nodes);
    },
    addEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    click() {
      for (const fn of listeners.get('click') ?? []) fn();
    },
    focus() {
      document.activeElement = this;
    },
    matches(selector) {
      return matchesSelector(this, selector);
    },
    querySelector(selector) {
      return walkFind(this, selector, false)[0] ?? null;
    },
    querySelectorAll(selector) {
      return walkFind(this, selector, true);
    }
  };

  Object.defineProperty(datasetStore, 'origin', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._origin;
    },
    set(value) {
      datasetStore._origin = String(value);
      attrs['data-origin'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'state', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._state;
    },
    set(value) {
      datasetStore._state = String(value);
      attrs['data-state'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'cause', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._cause;
    },
    set(value) {
      datasetStore._cause = String(value);
      attrs['data-cause'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'inspectorRoot', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._inspectorRoot;
    },
    set(value) {
      datasetStore._inspectorRoot = String(value);
      attrs['data-inspector-root'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'inspectorStatus', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._inspectorStatus;
    },
    set(value) {
      datasetStore._inspectorStatus = String(value);
      attrs['data-inspector-status'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'inspectorLive', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._inspectorLive;
    },
    set(value) {
      datasetStore._inspectorLive = String(value);
      attrs['data-inspector-live'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'inspectorLog', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._inspectorLog;
    },
    set(value) {
      datasetStore._inspectorLog = String(value);
      attrs['data-inspector-log'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'causeLabel', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._causeLabel;
    },
    set(value) {
      datasetStore._causeLabel = String(value);
      attrs['data-cause-label'] = String(value);
    }
  });
  Object.defineProperty(datasetStore, 'flight', {
    configurable: true,
    enumerable: true,
    get() {
      return datasetStore._flight;
    },
    set(value) {
      datasetStore._flight = String(value);
      attrs['data-flight'] = String(value);
    }
  });

  return node;
}

function dataToCamel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function classList(el) {
  return String(el.className || '')
    .split(/\s+/)
    .filter(Boolean);
}

function matchesSelector(el, selector) {
  const parts = String(selector).trim().split(/(?=[.#\[])/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('.')) {
      if (!classList(el).includes(part.slice(1))) return false;
    } else if (part.startsWith('[')) {
      const m = /^\[([^\s=\]]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/.exec(part);
      if (!m) return false;
      const name = m[1];
      const expected = m[2] ?? m[3] ?? m[4];
      const actual = el.getAttribute(name);
      if (expected === undefined) {
        if (actual == null) return false;
      } else if (actual !== expected) {
        return false;
      }
    } else if (part !== '*' && el.tagName !== part.toUpperCase()) {
      return false;
    }
  }
  return true;
}

function walkFind(root, selector, all) {
  const found = [];
  const visit = (node) => {
    for (const child of node.children) {
      if (child.nodeType === 1 && matchesSelector(child, selector)) {
        found.push(child);
        if (!all) return true;
      }
      if (visit(child)) return true;
    }
    return false;
  };
  visit(root);
  return found;
}

function installDom() {
  const head = createNode('head');
  const body = createNode('body');
  const html = createNode('html');
  html.append(head, body);

  const doc = {
    activeElement: body,
    documentElement: html,
    head,
    body,
    getElementById(id) {
      const all = walkFind(html, '*', true);
      return all.find((el) => el.getAttribute('id') === id || el.id === id) ?? null;
    },
    createElement(tag) {
      const el = createNode(tag);
      if (tag === 'style') {
        Object.defineProperty(el, 'id', {
          configurable: true,
          get() {
            return el.getAttribute('id');
          },
          set(value) {
            el.setAttribute('id', value);
          }
        });
      }
      return el;
    }
  };

  globalThis.document = doc;
  return doc;
}

function uninstallDom() {
  delete globalThis.document;
}

function flush() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function originRow(container, origin) {
  return walkFind(container, '.inspector-origin', true).find((el) => el.dataset.origin === origin);
}

function rowText(row) {
  return row ? row.textContent : '';
}

beforeEach(() => {
  installDom();
  resetInspectorForTests();
  resetAggregatorForTests();
});

afterEach(() => {
  resetInspectorForTests();
  resetAggregatorForTests();
  uninstallDom();
});

describe('renderInspector — seven lifecycle states', () => {
  const STATES = [
    ['discovering', 'Frame not yet loaded.', 'not-loaded'],
    ['evaluating', 'Evaluating widget tools.', 'evaluating'],
    ['active', 'Proxies registered on the governed surface.', 'active'],
    ['degraded', 'Embedded origin reported no tools.', 'zero-tools'],
    ['quarantined', 'INJECTION_PATTERN_MATCH: W6 agent-directed instruction.', 'quarantined'],
    ['revoking', 'Host owner requested revocation.', 'revoking'],
    ['revoked', 'Host owner revoked this origin; proxies withdrawn.', 'revoked']
  ];

  test('each of the seven states renders with its reason, data-state, and visible text', () => {
    const container = document.createElement('div');
    const origins = STATES.map(([state, reason], index) => ({
      origin: `${ACME.replace('acme-booking', `vendor-${index}`)}`,
      state,
      reason,
      tools: state === 'active' ? ['acme.booking.search'] : []
    }));
    origins[0].origin = ACME;
    origins[1].origin = NORTHWIND;
    origins[2].origin = ZENITH;
    origins[3].origin = 'https://degraded.example';
    origins[4].origin = 'https://quarantined.example';
    origins[5].origin = 'https://revoking.example';
    origins[6].origin = 'https://revoked.example';

    renderInspector(container, origins);

    for (const [state, reason] of STATES) {
      const row = walkFind(container, '.inspector-origin', true).find((el) => el.dataset.state === state);
      assert.ok(row, `missing row for ${state}`);
      assert.equal(row.dataset.state, state);
      assert.match(rowText(row), new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      const mark = STATE_MARK_LABEL[state];
      assert.match(rowText(row), new RegExp(mark, 'i'));
    }
  });

  test('legacy array call (two arguments) does not throw', () => {
    const container = document.createElement('div');
    renderInspector(container, [{ origin: ACME, state: 'active', reason: 'ok', tools: [] }]);
    assert.equal(originRow(container, ACME).dataset.state, 'active');
  });

  test('snapshot object form uses origins, errors, and generation', () => {
    const container = document.createElement('div');
    renderInspector(container, {
      generation: 4,
      errors: [],
      origins: [{ origin: ACME, state: 'active', reason: 'ok', tools: ['acme.booking.search'] }]
    });
    assert.match(rowText(originRow(container, ACME)), /acme\.booking\.search/);
  });
});

const STATE_MARK_LABEL = {
  discovering: 'Discovering',
  evaluating: 'Evaluating',
  active: 'Active',
  degraded: 'Degraded',
  quarantined: 'Quarantined',
  revoking: 'Revoking',
  revoked: 'Revoked'
};

describe('R29 distinguishable causes', () => {
  test('not-loaded, no-token, grant-missing, zero-tools, degraded bound, quarantined, and malformed call stay distinct', () => {
    const rows = [
      { origin: ACME, state: 'discovering', reason: 'Frame not yet loaded.' },
      {
        origin: NORTHWIND,
        state: 'degraded',
        reason: 'MODEL_CONTEXT_UNAVAILABLE: document.modelContext is undefined (trial not active).'
      },
      {
        origin: ZENITH,
        state: 'degraded',
        reason: 'NotAllowedError: Access to the feature "tools" is disallowed by permissions policy.'
      },
      {
        origin: 'https://zero.example',
        state: 'degraded',
        reason: 'Embedded origin reported no tools.'
      },
      {
        origin: 'https://bound.example',
        state: 'degraded',
        reason: 'BOUND_EXCEEDED_TOOL_COUNT: origin exceeded the tool-count bound.'
      },
      {
        origin: 'https://hostile.example',
        state: 'quarantined',
        reason: 'INJECTION_PATTERN_MATCH: description matched agent-directed-instruction (W6).'
      },
      {
        origin: 'https://malformed.example',
        state: 'degraded',
        reason:
          "TypeError: Failed to read the 'execute' property from 'ModelContextTool': Required member is undefined"
      }
    ];

    const keys = rows.map((row) => classifyCause(row).key);
    assert.deepEqual(keys, [
      'not-loaded',
      'no-token',
      'grant-missing',
      'zero-tools',
      'degraded-bound',
      'quarantined',
      'malformed-call'
    ]);

    const container = document.createElement('div');
    renderInspector(container, rows);

    assert.equal(originRow(container, ACME).dataset.cause, 'not-loaded');
    assert.equal(originRow(container, NORTHWIND).dataset.cause, 'no-token');
    assert.equal(originRow(container, ZENITH).dataset.cause, 'grant-missing');
    assert.equal(originRow(container, 'https://zero.example').dataset.cause, 'zero-tools');
    assert.equal(originRow(container, 'https://bound.example').dataset.cause, 'degraded-bound');
    assert.equal(originRow(container, 'https://hostile.example').dataset.cause, 'quarantined');
    assert.equal(originRow(container, 'https://malformed.example').dataset.cause, 'malformed-call');

    assert.match(rowText(originRow(container, NORTHWIND)), /No token/);
    assert.match(rowText(originRow(container, ZENITH)), /Grant missing/);
    assert.match(rowText(originRow(container, 'https://malformed.example')), /Malformed call/);
    assert.doesNotMatch(rowText(originRow(container, 'https://malformed.example')), /No token/);
  });

  test('zenith quarantined row shows the screening reason', () => {
    const container = document.createElement('div');
    renderInspector(container, [
      {
        origin: ZENITH,
        state: 'quarantined',
        reason: 'INJECTION_PATTERN_MATCH: description matched agent-directed-instruction (W6).',
        tools: []
      }
    ]);
    const row = originRow(container, ZENITH);
    assert.equal(row.dataset.state, 'quarantined');
    assert.match(rowText(row), /INJECTION_PATTERN_MATCH/);
    assert.match(rowText(row), /Quarantined/);
  });
});

describe('R59 color is not the only carrier', () => {
  test('state is carried by data-state, visible label, and a shape character', () => {
    const container = document.createElement('div');
    renderInspector(container, [
      { origin: ACME, state: 'quarantined', reason: 'INJECTION_PATTERN_MATCH: W6.', tools: [] }
    ]);
    const row = originRow(container, ACME);
    assert.equal(row.dataset.state, 'quarantined');
    assert.match(rowText(row), /Quarantined/);
    assert.match(rowText(row), /■/);
    const style = INSPECTOR_SRC;
    assert.equal(style.includes('background: red') && !style.includes('data-state'), false);
  });
});

describe('R56 session-scoped logs', () => {
  test('logs are module memory, reset between tests, and use no persistence APIs', async () => {
    assert.doesNotMatch(INSPECTOR_SRC, /localStorage|sessionStorage|indexedDB|sendBeacon/);
    const persistFetch = INSPECTOR_SRC.match(/\bfetch\s*\(/);
    assert.equal(persistFetch, null);

    const container = document.createElement('div');
    seedOriginForTests(ACME, {
      state: 'active',
      reason: 'Proxies registered on the governed surface.',
      tools: ['acme.booking.search'],
      proxyNames: ['acme.booking.search']
    });
    renderInspector(container, [
      { origin: ACME, state: 'active', reason: 'Proxies registered on the governed surface.', tools: ['acme.booking.search'] }
    ]);

    const button = walkFind(container, 'button', true)[0];
    button.click();
    assert.ok(getInspectorLogsForTests().length > 0);
    assert.match(getInspectorLogsForTests().join('\n'), /Revoking/);
    await flush();
    await flush();

    resetInspectorForTests();
    assert.equal(getInspectorLogsForTests().length, 0);
  });

  test('widget-shaped secrets are redacted before they enter logs or reason text', () => {
    const container = document.createElement('div');
    renderInspector(container, [
      {
        origin: ACME,
        state: 'degraded',
        reason: 'token sk-live-test_abc123 assigned by widget',
        tools: []
      }
    ]);
    const row = originRow(container, ACME);
    assert.match(rowText(row), /\[redacted\]/);
    assert.doesNotMatch(rowText(row), /sk-live-test_abc123/);
  });
});

describe('revokeOrigin', () => {
  test('active → revoking → revoked, proxies withdrawn, illegal transitions throw', async () => {
    seedOriginForTests(ACME, {
      state: 'active',
      reason: 'Proxies registered on the governed surface.',
      tools: ['acme.booking.search'],
      proxyNames: ['acme.booking.search']
    });
    assert.ok(getRegisteredProxyNames().includes('acme.booking.search'));

    const snapshots = await revokeOrigin(ACME);
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[0].origins.find((row) => row.origin === ACME).state, 'revoking');
    assert.equal(snapshots[1].origins.find((row) => row.origin === ACME).state, 'revoked');
    assert.equal(getOriginRuntimeForTests(ACME).state.state, 'revoked');
    assert.equal(getRegisteredProxyNames().includes('acme.booking.search'), false);

    seedOriginForTests(NORTHWIND, {
      state: 'discovering',
      reason: 'Origin discovered.'
    });
    await assert.rejects(() => revokeOrigin(NORTHWIND), /Illegal transition: discovering -> revoking/);
  });

  test('degraded and quarantined can revoke; revoked cannot', async () => {
    seedOriginForTests(ACME, { state: 'degraded', reason: 'Embedded origin reported no tools.' });
    const [revoking, revoked] = await revokeOrigin(ACME);
    assert.equal(revoking.origins[0].state, 'revoking');
    assert.equal(revoked.origins[0].state, 'revoked');

    seedOriginForTests(ZENITH, {
      state: 'quarantined',
      reason: 'INJECTION_PATTERN_MATCH: W6.'
    });
    const after = await revokeOrigin(ZENITH);
    assert.equal(after[1].origins.find((row) => row.origin === ZENITH).state, 'revoked');

    await assert.rejects(() => revokeOrigin(ZENITH), /Illegal transition: revoked -> revoking/);
  });
});

describe('in-flight revocation copy', () => {
  test('shows in-flight side effect may still complete and late result discarded, never cancelled', async () => {
    seedOriginForTests(ACME, {
      state: 'active',
      reason: 'Proxies registered on the governed surface.',
      tools: ['acme.booking.search'],
      proxyNames: ['acme.booking.search'],
      inFlight: 1,
      dropRecords: [
        {
          kind: 'revocation',
          code: 'RESULT_AFTER_REVOCATION',
          message: 'Result arrived after revocation; dropped, not forwarded.',
          at: Date.now()
        }
      ]
    });

    const snapshots = await revokeOrigin(ACME);
    const revoked = snapshots[1].origins.find((row) => row.origin === ACME);
    assert.equal(revoked.inFlightAtRevoke, 1);

    const container = document.createElement('div');
    renderInspector(container, snapshots[1]);
    const text = rowText(originRow(container, ACME));
    assert.match(text, /may still complete/i);
    assert.match(text, /discarded/i);
    assert.match(text, /RESULT_AFTER_REVOCATION/);
    assert.doesNotMatch(text, /cancell/i);
    assert.doesNotMatch(text, /prevented/i);
    assert.doesNotMatch(text, /secured/i);
  });
});

describe('revocation control', () => {
  test('revoke button is a real button; after click, state progresses and focus stays on the row', async () => {
    seedOriginForTests(ACME, {
      state: 'active',
      reason: 'Proxies registered on the governed surface.',
      tools: ['acme.booking.search'],
      proxyNames: ['acme.booking.search']
    });

    const container = document.createElement('div');
    let pageRevoked = null;
    renderInspector(
      container,
      [
        {
          origin: ACME,
          state: 'active',
          reason: 'Proxies registered on the governed surface.',
          tools: ['acme.booking.search']
        }
      ],
      { onRevoke: (origin) => { pageRevoked = origin; } }
    );

    const button = walkFind(container, 'button', true)[0];
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');

    button.click();
    assert.equal(pageRevoked, ACME);
    assert.equal(originRow(container, ACME).dataset.state, 'revoking');
    assert.equal(document.activeElement, originRow(container, ACME));
    assert.equal(walkFind(originRow(container, ACME), 'button', true).length, 0);

    await flush();
    await flush();

    const revokedRow = originRow(container, ACME);
    assert.equal(revokedRow.dataset.state, 'revoked');
    assert.equal(document.activeElement, revokedRow);
    assert.equal(walkFind(revokedRow, 'button', true).length, 0);
  });

  test('missing onRevoke still runs aggregator revokeOrigin and states that PP grant is the page\'s job', async () => {
    seedOriginForTests(NORTHWIND, {
      state: 'active',
      reason: 'Proxies registered on the governed surface.',
      tools: ['northwind.checkout.quote'],
      proxyNames: ['northwind.checkout.quote']
    });
    const container = document.createElement('div');
    renderInspector(container, [
      {
        origin: NORTHWIND,
        state: 'active',
        reason: 'Proxies registered on the governed surface.',
        tools: ['northwind.checkout.quote']
      }
    ]);
    walkFind(container, 'button', true)[0].click();
    await flush();
    await flush();
    const row = originRow(container, NORTHWIND);
    assert.equal(row.dataset.state, 'revoked');
    assert.match(rowText(row), /Permissions Policy grant is the page's job/i);
    assert.equal(getRegisteredProxyNames().includes('northwind.checkout.quote'), false);
  });

  test('live regions exist and receive text on state change', async () => {
    seedOriginForTests(ACME, {
      state: 'active',
      reason: 'Proxies registered on the governed surface.',
      tools: ['acme.booking.search'],
      proxyNames: ['acme.booking.search']
    });
    const container = document.createElement('div');
    renderInspector(container, [
      { origin: ACME, state: 'active', reason: 'Proxies registered on the governed surface.', tools: ['acme.booking.search'] }
    ]);
    const polite = container.querySelector('[data-inspector-live="polite"]');
    const assertive = container.querySelector('[data-inspector-live="assertive"]');
    assert.equal(polite.getAttribute('aria-live'), 'polite');
    assert.equal(assertive.getAttribute('aria-live'), 'assertive');

    walkFind(container, 'button', true)[0].click();
    await flush();
    await flush();
    const liveText = `${polite.textContent} ${assertive.textContent}`;
    assert.match(liveText, /Revok/i);
  });
});
