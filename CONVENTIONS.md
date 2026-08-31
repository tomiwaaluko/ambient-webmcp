# Conventions

This repo is built by several agents across several harnesses over three days. These conventions exist so the result reads as one codebase rather than five. **Read this before writing code.**

Judges may read this source. Coherence is part of the submission.

> **Working a ticket?** Read [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) too — it carries the work graph, file ownership (who else is editing what, right now), the checkpoint/cut triggers, and the standing constraints that bind every ticket. If `docs/spike-report.md` or `docs/skeleton-report.md` exist, read those before writing code: they carry corrections to assumptions this file was written under.

---

## Hard constraints

1. **No build step.** Hand-authored ES modules, served as static files. The product's central claim is that a plain page becomes agent-operable by pasting script tags — a bundler in the consumer's path contradicts it. A deploy-time file copy is fine; a bundler, transpiler, or minifier is not.
2. **No dependencies.** Not in `src/`, not in tests. Tests use `node --test`. If you think you need a package, you have misunderstood the constraint.
3. **No framework extraction.** No plugin systems, no abstract base classes, no registries, no "extensible" anything. The reference implementation proves the contract and stops there. Concrete beats general, every time, on this deadline.
4. **No TypeScript.** Plain `.js` with JSDoc types where a signature is non-obvious.

## Module style

- One concern per file. Named exports only — no default exports.
- `camelCase` functions and variables, `SCREAMING_SNAKE` module-level constants, `kebab-case.js` filenames.
- Pure logic modules (`naming.js`, `engine.js`, `bounds.js`) must not touch the DOM or `document.modelContext`. That is what makes them testable under `node --test` without a browser.
- Browser-only modules (`inspector.js`, `helper.js`) keep DOM access at the edges, not threaded through logic.
- Explicit `.js` extensions in every import — these are real ES modules loaded by a browser, not bundler-resolved specifiers.

## Errors and failures

- **Never fail silently.** Every refusal carries a machine-readable reason code plus human-readable text. WebMCP's own failure mode is a silent empty list; Ambient exists partly to make failure legible, so a swallowed error here is a defect against the product's thesis.
- **Never truncate silently.** Over-budget input is refused with a named cause, not quietly shortened.
- Reason codes are `SCREAMING_SNAKE`: `INSTANCE_LIMIT_REACHED`, `NAME_TOO_LONG`, `NAME_ILLEGAL_CHARS`, `ORIGIN_NOT_ALLOWLISTED`, `BOUND_EXCEEDED_TOOL_COUNT`, `INJECTION_PATTERN_MATCH`, `EXECUTION_TIMEOUT`, `RESULT_AFTER_REVOCATION`.
- Distinct causes get distinct codes. "Name rejected" is not good enough when the inspector must distinguish a length failure from an instance-limit failure.

## Language discipline

Ambient's credibility rests on not overclaiming. This applies to identifiers and comments, not only to prose.

- Do not name anything `sanitize`, `prevent`, `block`, or `secure` when the mechanism is filtering or labeling. Prefer `rebuild`, `redact`, `refuse`, `quarantine`, `bound`.
- Never write a comment implying the envelope prevents prompt injection, that revocation cancels in-flight work, or that detection is exhaustive. It doesn't, it can't, and it isn't.

## Cross-module interface contracts

**These signatures are shared across tickets. Do not change one unilaterally — if a shape is wrong, say so in the PR and coordinate.**

```js
// src/host/naming.js
composeName({ vendorLabel, widgetId, verb })
// -> { ok: true, name } | { ok: false, code, message }

// src/host/envelope.js  — the ONLY path widget text may take to an agent
buildEnvelope({ origin, kind, value })
// kind: 'description' | 'paramDescription' | 'enumValue' | 'result'
// -> { ok: true, text } | { ok: false, code, message }

buildFailureEnvelope({ origin, code, message })
// Used by proxy.js so failure text goes through redaction too. -> { text }

// src/host/redact.js
redact(text) // -> { text, redactions: [{ kind, count }] }

// src/host/lifecycle.js
transition(originState, nextState, reason) // throws on illegal transition
// states: discovering | evaluating | active | degraded | quarantined | revoking | revoked

// src/checker/engine.js
evaluate({ manifest, subject, harness })
// subject: { tools, attestation }; harness optional
// -> [{ ruleId, result: 'pass'|'fail'|'not-evaluable', evidence: 'mechanical'|'attested'|'observed', message }]

// src/widget/helper.js
registerConformantTool({ widgetId, name, description, inputSchema, readOnly, untrustedContent, exposedTo, authorize, execute })
// throws on any non-conformant shape. `authorize` required when readOnly is false.

// src/shared/adapter.js
executeToolCompat(tool, input) // handles object-vs-JSON-string, caches winner
```

## Testing

- `node --test test/`. Files are `test/<module>.test.js`.
- Test behavior, not implementation. A test asserting a function was called is not a test.
- Pure-logic modules get real coverage. Browser modules get what is testable without a browser; the rest is verified manually and stated in the PR.
- **Never assert a passing result the code did not actually earn** — especially evidence classes in the checker. A test that lets `attested` masquerade as `observed` defeats the entire three-class design.

## Git

- Branch `u<N>-<slug>` from `main`, e.g. `u6-host-aggregator`.
- Rebase on current `main` before requesting review.
- **The orchestrator merges, not the agent.** Do not merge your own PR.
- Self-review your diff line by line before pushing. Paste local gate output into the PR description.

## What "done" means

A ticket is done when its Definition of Done is *all* true. If you cannot satisfy an item, say so explicitly in the PR — do not drop it quietly. An honestly incomplete ticket is recoverable; a silently incomplete one is discovered on demo day.
