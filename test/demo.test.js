import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = {
      add: (...names) => {
        this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(
          ' '
        );
      }
    };
    this.id = '';
    this._text = '';
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this._text = value == null ? '' : String(value);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  replaceChildren(...children) {
    this.children = [];
    this._text = '';
    this.append(...children);
  }
}

const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;
globalThis.HTMLElement = FakeElement;

const { runTripPlan } = await import('../sites/host/demo.js');

function toolResult(payload) {
  return JSON.stringify({
    content: [{ text: JSON.stringify(payload) }]
  });
}

function installModelContext(tools, executeTool = async () => toolResult({ results: [] })) {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    modelContext: {
      getTools: async () => tools,
      executeTool
    }
  };
}

function childById(root, id) {
  return root.children.find((child) => child.id === id);
}

describe('trip outcome honesty', () => {
  beforeEach(() => {
    installModelContext([]);
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  test('reports total proxy failure with each reason code and message', async () => {
    const outcome = new FakeElement();

    await runTripPlan(outcome);

    assert.equal(outcome.dataset.state, 'failed');
    assert.equal(childById(outcome, 'outcome-heading').textContent, 'Trip plan failed');
    assert.doesNotMatch(outcome.textContent, /Trip plan ready/);
    assert.match(
      outcome.textContent,
      /PROXY_NOT_FOUND — No tool named acme\.booking\.search on the governed host surface\./
    );
    assert.match(
      outcome.textContent,
      /PROXY_NOT_FOUND — No tool named zenith\.support\.search on the governed host surface\./
    );
    assert.doesNotMatch(outcome.textContent, /An agent combined/);
    assert.match(outcome.textContent, /host's governed proxy surface/i);
    assert.doesNotMatch(outcome.textContent, /surface called Acme Booking/);
    assert.match(outcome.textContent, /attempted to call Acme Booking and Zenith Support/i);
  });

  test('reports partial completion when only one vendor succeeds', async () => {
    const acmeTool = { name: 'acme.booking.search' };
    installModelContext([acmeTool], async () =>
      toolResult({
        results: [{ destination: 'Lisbon', date: '2026-09-20', seats: 2, id: 'ACME-1' }]
      })
    );
    const outcome = new FakeElement();

    await runTripPlan(outcome);

    assert.equal(outcome.dataset.state, 'partial');
    assert.equal(childById(outcome, 'outcome-heading').textContent, 'Trip plan partially ready');
    assert.doesNotMatch(outcome.textContent, /^Trip plan ready$/m);
    assert.match(outcome.textContent, /Lisbon/);
    assert.match(outcome.textContent, /PROXY_NOT_FOUND/);
  });

  test('reports partial completion when only Zenith succeeds', async () => {
    const zenithTool = { name: 'zenith.support.search' };
    installModelContext([zenithTool], async () =>
      toolResult({ results: [{ title: 'Returns', id: 'ZEN-1' }] })
    );
    const outcome = new FakeElement();

    await runTripPlan(outcome);

    assert.equal(outcome.dataset.state, 'partial');
    assert.match(outcome.textContent, /PROXY_NOT_FOUND/);
    assert.match(outcome.textContent, /Returns/);
  });

  test('reports null successful payloads as unavailable rather than complete', async () => {
    const acmeTool = { name: 'acme.booking.search' };
    const zenithTool = { name: 'zenith.support.search' };
    installModelContext([acmeTool, zenithTool], async () => null);
    const outcome = new FakeElement();

    await runTripPlan(outcome);

    assert.equal(outcome.dataset.state, 'failed');
    assert.equal(childById(outcome, 'outcome-heading').textContent, 'Trip plan failed');
    assert.match(outcome.textContent, /FLIGHT_RESULTS_UNAVAILABLE/);
    assert.match(outcome.textContent, /SUPPORT_RESULTS_UNAVAILABLE/);
    assert.doesNotMatch(outcome.textContent, /attempts? failed/);
  });

  test('reports tool discovery failures on both vendor cards', async () => {
    installModelContext([]);
    globalThis.document.modelContext.getTools = async () => {
      throw new Error('registry unavailable');
    };
    const outcome = new FakeElement();

    await runTripPlan(outcome);

    assert.equal(outcome.dataset.state, 'failed');
    assert.equal(
      [...outcome.textContent.matchAll(/TOOL_DISCOVERY_FAILED — registry unavailable/g)].length,
      2
    );
  });

  test('keeps the complete outcome when both vendors succeed', async () => {
    const acmeTool = { name: 'acme.booking.search' };
    const zenithTool = { name: 'zenith.support.search' };
    installModelContext([acmeTool, zenithTool], async (tool) => {
      if (tool === acmeTool) {
        return toolResult({
          results: [{ destination: 'Lisbon', date: '2026-09-20', seats: 2, id: 'ACME-1' }]
        });
      }
      return toolResult({ results: [{ title: 'Returns', id: 'ZEN-1' }] });
    });
    const outcome = new FakeElement();

    await runTripPlan(outcome);

    assert.equal(outcome.dataset.state, 'complete');
    assert.equal(childById(outcome, 'outcome-heading').textContent, 'Trip plan ready');
    assert.doesNotMatch(outcome.textContent, /An agent combined/);
    assert.match(outcome.textContent, /host's governed proxy surface/i);
  });
});

test.after(() => {
  globalThis.document = originalDocument;
  globalThis.HTMLElement = originalHTMLElement;
});
