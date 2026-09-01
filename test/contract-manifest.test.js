// Drift check between CONTRACT.md and rules/manifest.json.
//
// The manifest is the machine-readable form of the contract. If the two drift,
// the checker reports a rule the contract does not state — which makes the
// checker's output a lie, and every downstream gate inherits it. So the ids,
// the obligation text, and the evidence class are all asserted in both
// directions rather than only manifest -> prose.
//
// Owned by PRO-6 alongside the two files it guards.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../', import.meta.url);
const CONTRACT = readFileSync(fileURLToPath(new URL('CONTRACT.md', repoRoot)), 'utf8');
const MANIFEST = JSON.parse(
  readFileSync(fileURLToPath(new URL('rules/manifest.json', repoRoot)), 'utf8')
);

const PERMITTED_EVIDENCE = ['mechanical', 'attested', 'observed'];
const PERMITTED_ROLES = ['widget', 'host'];

// R3 proxy, and a ratchet rather than a proof. "Readable end to end in under
// two minutes" has to be enforced as something countable, so it is enforced as
// a word budget that fails the moment the contract grows.
//
// The budget is NOT a claim that the read takes two minutes. At ~1165 words it
// does not: two minutes would need roughly 580 words, and 22 obligations that
// each name the failure they prevent (R2) plus a limits section that states the
// non-guarantee in plain words (R36) do not fit in 580. The tension between R2
// and R3 is real and is surfaced in the PR rather than hidden behind a
// flattering words-per-minute rate chosen to make this assertion pass.
const R3_WORD_BUDGET = 1200;

// R36 requires the limits section to state the non-guarantee explicitly rather
// than by implication. These are the load-bearing phrases; softening any of them
// is exactly the drift this ticket exists to make impossible.
const R36_REQUIRED_PHRASES = [
  'do not constrain how a model treats text',
  'may still influence the agent',
  'cannot be guaranteed',
  'not the only one',
  'It cannot cancel work already begun',
  'the side effect may already have happened'
];

/** Parses the `| id | statement | \`evidence\` |` rows out of the two role tables. */
function parseObligationRows(markdown) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    const match = /^\|\s*([WH]\d{1,2})\s*\|(.+)\|\s*$/.exec(line);
    if (!match) continue;
    const cells = match[2].split('|').map((cell) => cell.trim());
    assert.equal(cells.length, 2, `row ${match[1]} does not have exactly two cells after the id`);
    rows.set(match[1], { statement: cells[0], evidence: cells[1].replace(/`/g, '') });
  }
  return rows;
}

/** Every rule id mentioned anywhere in the contract, tables and prose alike. */
function idsMentionedInContract(markdown) {
  return new Set(markdown.match(/\b[WH]\d{1,2}\b/g) ?? []);
}

function countWords(markdown) {
  return markdown
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length;
}

const rows = parseObligationRows(CONTRACT);
const rulesById = new Map(MANIFEST.rules.map((rule) => [rule.id, rule]));

test('manifest rule ids are unique', () => {
  assert.equal(rulesById.size, MANIFEST.rules.length, 'a rule id is declared twice');
});

test('every manifest rule id appears as an obligation in CONTRACT.md', () => {
  for (const rule of MANIFEST.rules) {
    assert.ok(rows.has(rule.id), `${rule.id} is in the manifest but has no obligation row in CONTRACT.md`);
  }
});

test('every obligation row in CONTRACT.md appears in the manifest', () => {
  for (const id of rows.keys()) {
    assert.ok(rulesById.has(id), `${id} is an obligation in CONTRACT.md but is absent from the manifest`);
  }
});

test('every rule id CONTRACT.md refers to in prose is a real rule', () => {
  for (const id of idsMentionedInContract(CONTRACT)) {
    assert.ok(rulesById.has(id), `CONTRACT.md refers to ${id}, which no manifest rule defines`);
  }
});

test('obligation text is identical in the manifest and the contract', () => {
  for (const rule of MANIFEST.rules) {
    assert.equal(
      rows.get(rule.id).statement,
      rule.statement,
      `${rule.id}: the manifest statement and the contract row have drifted apart`
    );
  }
});

test('evidence class is identical in the manifest and the contract', () => {
  for (const rule of MANIFEST.rules) {
    assert.equal(
      rows.get(rule.id).evidence,
      rule.evidence,
      `${rule.id}: the contract and the manifest disagree about how this rule is checkable`
    );
  }
});

test('every rule declares exactly one permitted evidence class', () => {
  for (const rule of MANIFEST.rules) {
    assert.equal(typeof rule.evidence, 'string', `${rule.id}: evidence must be a single class, not a list`);
    assert.ok(
      PERMITTED_EVIDENCE.includes(rule.evidence),
      `${rule.id}: "${rule.evidence}" is not one of ${PERMITTED_EVIDENCE.join(', ')}`
    );
  }
});

test('the manifest declares the same three evidence classes the rules use', () => {
  assert.deepEqual(MANIFEST.evidenceClasses, PERMITTED_EVIDENCE);
});

test('every rule names a role, and both roles are represented', () => {
  const roles = new Set();
  for (const rule of MANIFEST.rules) {
    assert.ok(PERMITTED_ROLES.includes(rule.role), `${rule.id}: unknown role "${rule.role}"`);
    roles.add(rule.role);
  }
  assert.deepEqual([...roles].sort(), [...PERMITTED_ROLES].sort(), 'R1 needs obligations for both roles');
});

test('every rule cites at least one plan requirement', () => {
  for (const rule of MANIFEST.rules) {
    assert.ok(Array.isArray(rule.requirements) && rule.requirements.length > 0, `${rule.id}: cites no requirement`);
    for (const requirement of rule.requirements) {
      assert.match(requirement, /^R\d+$/, `${rule.id}: "${requirement}" is not a requirement id`);
    }
  }
});

test('every rule carries a predicate the engine can dispatch on', () => {
  for (const rule of MANIFEST.rules) {
    assert.equal(typeof rule.predicate?.check, 'string', `${rule.id}: predicate has no check`);
    assert.equal(typeof rule.predicate?.params, 'object', `${rule.id}: predicate has no params`);
  }
});

test('an attested rule reads an attestation and an observed rule needs a harness', () => {
  for (const rule of MANIFEST.rules) {
    if (rule.evidence === 'attested') {
      assert.equal(
        rule.predicate.check,
        'attestation-claim',
        `${rule.id}: an attested rule must be evaluated against the attestation, never the surface`
      );
    }
    if (rule.evidence === 'observed') {
      assert.equal(
        rule.predicate.check,
        'harness-probe',
        `${rule.id}: an observed rule must require an execution harness`
      );
    }
    if (rule.evidence === 'mechanical') {
      assert.ok(
        !['attestation-claim', 'harness-probe'].includes(rule.predicate.check),
        `${rule.id}: a mechanical rule cannot rest on an attestation or a harness`
      );
    }
  }
});

test('refusal reason codes match between the manifest and the contract', () => {
  const inContract = new Set(CONTRACT.match(/\b[A-Z]{2,}(?:_[A-Z]+)+\b/g) ?? []);
  for (const code of MANIFEST.reasonCodes) {
    assert.ok(inContract.has(code), `${code} is in the manifest but CONTRACT.md does not list it`);
  }
  for (const code of inContract) {
    assert.ok(MANIFEST.reasonCodes.includes(code), `CONTRACT.md names ${code}, which the manifest does not carry`);
  }
});

test('reason codes referenced by a predicate are declared at the top level', () => {
  for (const rule of MANIFEST.rules) {
    const referenced = [rule.predicate.params.reasonCode, ...(rule.predicate.params.reasonCodes ?? [])];
    for (const code of referenced.filter(Boolean)) {
      assert.ok(MANIFEST.reasonCodes.includes(code), `${rule.id} references undeclared reason code ${code}`);
    }
  }
});

test('the limits section states the non-guarantee explicitly (R36)', () => {
  const limits = CONTRACT.slice(CONTRACT.indexOf('## What Ambient does not prevent'));
  assert.ok(limits.length > 0, 'CONTRACT.md has no limits section');
  for (const phrase of R36_REQUIRED_PHRASES) {
    assert.ok(limits.includes(phrase), `the limits section no longer says "${phrase}"`);
  }
});

test('CONTRACT.md stays within its size ratchet (R3 proxy)', () => {
  const words = countWords(CONTRACT);
  assert.ok(
    words <= R3_WORD_BUDGET,
    `CONTRACT.md is ${words} words, over the ${R3_WORD_BUDGET}-word budget R3 is enforced as`
  );
});
