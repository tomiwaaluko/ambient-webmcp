# Clean-room portability report (PRO-17 / U13)

## Isolation conditions

- **Model:** Cursor Grok 4.6 (this implementer).
- **Harness:** Fresh isolated subagent. Working directory exclusive: `C:\Users\gokug\Documents\scratch-ambient-clean-room`.
- **Files provided and read:** `CONTRACT.md`, `HELPER-API.txt` only.
- **Not a Codex pass.** The ticket was pinned to Codex 5.6 Terra; a human overrode the implementer to Grok 4.6. This is not a clean Codex 5.6 Terra isolation run.

### What this agent did not do

- Did not read, grep, glob, or list `C:\Users\gokug\Documents\GitHub\ambient-webmcp` or any ambient-* worktree.
- Did not read `CONVENTIONS.md`, `ORCHESTRATION.md`, the plan, spike/skeleton reports, or any `src/`, `sites/`, `test/`, or rules files.
- Did not clone or fetch `github.com/tomiwaaluko/ambient-webmcp`.
- Did not web-search for Ambient, WebMCP Challenge, tomiwaaluko widgets, or existing implementations.
- Did not open `helper.js`, `attest.js`, checker, aggregator, or any vendor widget.
- Did not edit `CONTRACT.md`.
- Did not open a PR or copy files into the GitHub repo.

### Isolation caveat (not source)

The Cursor workspace defaulted to the Ambient GitHub checkout. Always-applied workspace rules injected the text of `AGENTS.md` (agent routing: read conventions, work graph, plan; non-negotiables; PRO-17 exception note). That is not `src/` and was not used as an implementation reference. It is still a deviation from “CONTRACT.md + HELPER-API.txt alone.” Isolation is **not claimed void for source contamination**; it is **not claimed hermetic against routing text**.

## Frozen widget file list

Provided (untouched):

- `CONTRACT.md`
- `HELPER-API.txt`

Written and frozen (do not later edit to make a checker pass):

- `package.json` — `"type": "module"` only; no dependencies
- `index.html` — loads `widget.js` as an ES module
- `widget.js` — registers tools via `registerConformantTool`
- `helper-stub.js` — local helper matching HELPER-API.txt (`ConformanceRefusal`, closed schema, authorize wrap, `exposedTo` as `registerTool` second arg, attestation publish; stubs `document.modelContext.registerTool` under Node)
- `subject.js` — Node-loadable ESM subject (`await` top-level import)

## Tools registered

Widget identifier: `noteboard` (no vendor label, no `.`).

| name | readOnly | untrustedContent | authorize | role |
|------|----------|------------------|-----------|------|
| `list` | true | true | n/a | Returns synthetic notes. |
| `add` | false | true | required (`confirm` in browser; `__ambientAuthorize` hook in Node; otherwise deny) | Appends a synthetic note. |

`exposedTo`: `["https://example.com"]` (concrete HTTPS, no wildcard).

Synthetic data only (`note-1` / “Plant watering”). No PII, credentials, or payments.

## Checker output

Command (black box; checker source not read):

```
node src/checker/cli.js --fixture C:\Users\gokug\Documents\scratch-ambient-clean-room\subject.js
```

Exit code: `0`

Stdout (first and only run, unmodified):

```
W1   pass           mechanical   Tool names stay within the widget-owned segment budget.
W2   pass           attested     Vendor attests "exposedToScoped". This rests on the vendor's word, not the registered surface.
W3   pass           attested     Vendor attests "untrustedContentMarked". This rests on the vendor's word, not the registered surface.
W4   not-evaluable  observed     No execution harness supplied; W4 (readOnlyContradiction) is observed and cannot be evaluated. Ambient does not claim generic behavioral detection for arbitrary widgets.
W5   pass           mechanical   Input schemas declare properties and do not offer a passthrough field.
W6   pass           mechanical   No agent-directed-instruction match in the scanned fields.
W7   not-evaluable  observed     No execution harness supplied; W7 (surfaceChangeNotification) is observed and cannot be evaluated. Ambient does not claim generic behavioral detection for arbitrary widgets.
W8   pass           mechanical   Attestation is present and covers every attested-class claim.
W9   pass           attested     Vendor attests "authorizationEnforced". This rests on the vendor's word, not the registered surface.
W10  pass           attested     Vendor attests "noSensitiveValues". This rests on the vendor's word, not the registered surface.
H1   not-evaluable  mechanical   Rule H1 applies to host subjects; this subject is widget.
H2   not-evaluable  mechanical   Rule H2 applies to host subjects; this subject is widget.
H3   not-evaluable  mechanical   Rule H3 applies to host subjects; this subject is widget.
H4   not-evaluable  mechanical   Rule H4 applies to host subjects; this subject is widget.
H5   not-evaluable  observed     Rule H5 applies to host subjects; this subject is widget.
H6   not-evaluable  mechanical   Rule H6 applies to host subjects; this subject is widget.
H7   not-evaluable  observed     Rule H7 applies to host subjects; this subject is widget.
H8   not-evaluable  observed     Rule H8 applies to host subjects; this subject is widget.
H9   not-evaluable  observed     Rule H9 applies to host subjects; this subject is widget.
H10  not-evaluable  observed     Rule H10 applies to host subjects; this subject is widget.
H11  not-evaluable  observed     Rule H11 applies to host subjects; this subject is widget.
H12  not-evaluable  observed     Rule H12 applies to host subjects; this subject is widget.

22 rules: 8 pass, 0 fail, 14 not-evaluable. Exit non-zero on fail only.
```

### Trace (first run)

**Zero fails.** 8 pass, 0 fail, 14 not-evaluable. Exit code 0 matches “Exit non-zero on fail only.” The frozen widget was not edited after this run.

**W4 and W7 not-evaluable.** Both are `observed` in CONTRACT.md: “Visible only by executing the tool against an instrumented widget.” W4: “Declare `readOnlyHint` truthfully — anything that mutates state, sends a message, or moves money is mutating.” W7: “Notify your host when your own tool surface changes, so it does not depend on cross-origin event propagation to learn that it did.” The checker reported no execution harness; that matches the limits section **False read-only claims in general**: “Contradiction between a declared `readOnlyHint` and real behavior is observed only against instrumented widgets whose state the harness can see; for an arbitrary widget, W4 is not evaluable and rests on the attestation W8 requires.” Ambient “does not claim generic behavioral detection for arbitrary widgets” is the same bound. W7 is the same evidence class without a harness, so it is also not-evaluable rather than a fail.

**H1–H12 not-evaluable.** CONTRACT.md splits two roles: “What a widget must do to be federated” (W1–W10) and “What a host must do to federate safely” (H1–H12). This subject is a widget. Host rules do not apply; they are not-evaluable, not fails.

**Passes that match evidence class.** W1, W5, W6, W8 are `mechanical`. W2, W3, W9, W10 are `attested` (“The vendor's word, reported as the vendor's word.”). W8: “Supply a machine-readable attestation covering every obligation the registered surface cannot reveal; without one, those obligations are unevaluated rather than passed.” The run passed W8 and reported the attested rules as the vendor’s word.

## Suspected contract gaps

Recorded while implementing. The contract was not amended.

1. **No Node-loadable subject shape.** CONTRACT.md discusses a checkable “registered tool surface” (`mechanical`: “Verifiable from the registered tool surface alone — names, schema shape, declared hints.”) but never names a file, export, or import a checker should load. `subject.js` is a best-effort default export `{ widgetId, tools, attestation }` plus named exports. That shape is not specified.

2. **Attestation publish site omitted.** HELPER-API.txt says “the helper publishes attestation the checker can read” and gives the object shape, including “Each claim is { statement, enforcedBy }.” It does not say whether that object is a global, a `document` property, a module export, or a well-known filename. This stub sets `globalThis.__ambientAttestation` / `globalThis.__ambientAttestations` and also exports `getAttestation` from `helper-stub.js`.

3. **Helper `ConformanceRefusal` codes omitted.** HELPER-API.txt: “Throws ConformanceRefusal with .code (SCREAMING_SNAKE) and .message. Never fail silently.” CONTRACT.md lists host/federation codes (`ORIGIN_NOT_ALLOWLISTED`, `NAME_TOO_LONG`, `NAME_ILLEGAL_CHARS`, … `MODEL_CONTEXT_UNAVAILABLE`, `INPUT_SHAPE_UNSUPPORTED`, …). It does not enumerate helper-side codes for invalid `widgetId`, empty/`*` `exposedTo`, or missing `authorize`. This stub invented `WIDGET_ID_INVALID`, `EXPOSED_TO_INVALID`, `AUTHORIZE_REQUIRED`, `AUTHORIZATION_DENIED`, and reused `NAME_ILLEGAL_CHARS`, `INPUT_SCHEMA_PARSE_FAILED`, `INPUT_SHAPE_UNSUPPORTED`, `MODEL_CONTEXT_UNAVAILABLE` where they seemed to fit.

4. **`registerTool` descriptor omitted.** HELPER-API.txt: “Do not put exposedTo on the tool descriptor. The helper does: await document.modelContext.registerTool(descriptor, { exposedTo }).” It never lists descriptor fields. This stub used `{ name, description, inputSchema, annotations: { readOnlyHint, untrustedContentHint? }, execute }` by reading the obligation names `readOnlyHint` / `untrustedContentHint` in CONTRACT.md, not from a helper field list.

5. **W7 has no widget API.** CONTRACT.md W7: “Notify your host when your own tool surface changes, so it does not depend on cross-origin event propagation to learn that it did.” HELPER-API.txt has no notify/register-change entry point. This widget registers once at load and never changes its surface.

6. **`authorize` arguments omitted.** HELPER-API.txt: “authorize: required when readOnly is false; returns boolean or Promise<boolean>.” It does not say whether `authorize` receives the tool input. This stub calls `authorize(input)` and treats only a strict `true` as consent.

7. **Passthrough “and similar” is undefined.** HELPER-API.txt: “Free-form passthrough names are refused (context, passthrough, prompt, instructions, raw, extra, and similar).” “Similar” is not a closed set. This stub refuses the six named keys (case-insensitive) and does not guess further names.

8. **Attestation `origin` omitted.** The published object includes `origin`, but neither document says whether that is the widget’s `location.origin`, the embedder, or an `exposedTo` entry. Under Node there is no `location`; the stub uses `https://example.com`.

9. **W1 vs `registerTool` name.** CONTRACT.md W1: “Declare your widget identifier only; the host assigns the vendor label.” HELPER-API.txt puts `widgetId` on `registerConformantTool` and `name` as an “unqualified verb.” It does not say whether `widgetId` appears on the object passed to `document.modelContext.registerTool`. This stub does not put `widgetId` on that descriptor.

10. **Optional `untrustedContent` default omitted.** HELPER-API.txt: “untrustedContent: optional boolean.” CONTRACT.md W3: “Mark every tool returning content you did not author with `untrustedContentHint`.” Unspecified whether omitting the flag means false, means unmarked, or is a W3 fail. Both tools here set `untrustedContent: true` because notes can include caller-supplied title/body.

11. **HTTPS-only `exposedTo` vs local files.** HELPER-API.txt: “exposedTo: non-empty array of concrete HTTPS origin strings; no wildcards.” Opening `index.html` as a file or on `http://localhost` cannot satisfy that with a real embed origin. The frozen widget uses `https://example.com` as a synthetic embedder.

12. **Execute result shape omitted.** CONTRACT.md W10 constrains credentials in results but does not specify a result schema or envelope. Tools return plain objects (`{ notes }` / `{ added }`).

### Proposed contract amendments after first run

None of the Phase A gaps produced a fail. Do not amend W4, W7, or H1–H12 evaluation: those not-evaluable results match CONTRACT.md. Remaining proposed amendments (documentation omissions a second clean-room implementer still cannot derive):

1. Name the Node-loadable subject/fixture export a checker will import (file or `{ widgetId, tools, attestation }` is not in CONTRACT.md).
2. Name where the helper publishes the W8 attestation so a checker can read it.
3. Name the widget-side W7 notify channel (HELPER-API.txt is silent; the obligation is in CONTRACT.md).
4. Close the helper `ConformanceRefusal` code set (or say the host list does not apply to the helper).
5. List `registerTool` descriptor fields (`name`, `description`, `inputSchema`, `annotations`, `execute`).
6. State whether `authorize` receives the tool input.
7. Close the passthrough-name set (drop or define “and similar”).
8. Define attestation `origin` (widget `location.origin` vs embedder).
9. Define omitting `untrustedContent` (false vs unmarked).
10. State that execute results have no required schema beyond W10.

CONTRACT.md was not edited.

## Freeze

Widget and subject are frozen at the files listed above. Later checker failures are to be treated as contract defects, not as a license to edit the widget.

## Landed in the Ambient repo (orchestrator copy, unmodified)

Copied the frozen scratch files to `sites/clean-room/` (not deployed) and this report to `docs/clean-room-report.md`. `CONTRACT.md` was not amended. Re-run of the same checker against `sites/clean-room/subject.js` matched the first run: 8 pass, 0 fail, 14 not-evaluable, exit 0.

`npm test` after the copy: 128 pass, 0 fail.
