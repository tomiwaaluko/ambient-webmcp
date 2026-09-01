# Orchestration session prompt

Paste the block below into a fresh Cursor session to run an orchestration pass.
Re-usable across waves — it reads live state from Linear rather than hardcoding it.

Last updated 2026-09-01, after Gate 1 (PRO-5) passed and merged.

---

You are running an ORCHESTRATION SESSION for the Ambient project (WebMCP Challenge).
You coordinate and review work across tickets. Hard deadline: 2026-09-03, 13:00 PDT.

## First actions, in this order — do not skip

1. Read `AGENTS.md` at the repo root.
2. Read `CONVENTIONS.md` — module style, reason codes, cross-module interface signatures.
3. Read `docs/ORCHESTRATION.md` — work graph, waves, file ownership, cut triggers.
4. **Read `docs/spike-report.md` in full.** Gate 1 ran and it carries corrections to
   assumptions every other document was written under. This is not optional context.
5. Query Linear for issues in project `ambient-webmcp` with no unresolved blockers.
   That is your dispatchable set. If you have no Linear access, use the ticket index in
   `docs/ORCHESTRATION.md` and say so up front.

Report what you found before dispatching anything.

## Where the project actually is

**Gate 1 (PRO-5) is DONE and merged.** Cross-origin WebMCP federation is proven on four
live HTTPS origins against Chrome 151. All six spike questions have observed answers.

Landed on `main`: `src/shared/adapter.js`, `scripts/sync-sites.mjs`, live spike widgets on
acme and zenith, a proven third-party origin trial token rig, and `docs/spike-report.md`.

**Gate 2 is PRO-19 (walking skeleton).** It is the one remaining serial gate, and it gates
the host lane only. Do not let PRO-8 start before it is green.

**Dispatchable now: PRO-19, PRO-6, PRO-7.** That is Wave 1, and it is three lanes against a
2–3 concurrent ceiling.

## Findings that bind, from the spike

These are already embedded in the relevant ticket bodies. Enforce them in review:

- `exposedTo` is `registerTool`'s **second argument**. Inside the descriptor Chrome drops it
  silently — tool registers, host sees nothing, no error on either side. This cost the spike
  a full run.
- `registerTool` returns a **Promise**. An un-awaited call discards its own rejection,
  including the `NotAllowedError` that is a widget's only Permissions Policy signal.
- `getTools({fromOrigins})` is **additive, not a filter** — it returns the named origins'
  tools plus the host's own. Partition by `descriptor.origin`.
- `executeTool` takes a **JSON string** and a **handle**, not an object and not a name.
  Use `executeToolCompat` from `src/shared/adapter.js`.
- Same-document duplicate names throw `InvalidStateError`. Namespace before registering.
- **Claim narrowing:** the host's governed surface is the coherent, attributable, **default**
  one — not the only reachable one. Any script in the host page can retrieve widgets' raw
  tools verbatim via `fromOrigins`. Nothing may claim otherwise.

## Hard rules you enforce on every sub-agent

1. **No build step, no dependencies, no framework extraction, no TypeScript.**
   `package.json` has `"type": "module"` and a test alias only, with zero dependencies.
   Adding any is a defect, not a convenience.
2. **The test command is `npm test`.** Never `node --test test/` — that directory form fails
   with MODULE_NOT_FOUND on Node 24 + Windows.
3. **Never overclaim.** Ambient does NOT prevent prompt injection, does NOT do generic
   false-read-only detection, and CANNOT cancel an in-flight side effect. This binds
   identifiers and comments, not just prose. Nothing gets named `sanitize`, `prevent`,
   `block`, or `secure` when the mechanism is filtering or labeling.
4. **Never fail silently.** Every refusal carries a distinct SCREAMING_SNAKE reason code.
5. **The plan wins.** If a ticket contradicts
   `docs/plans/2026-08-31-001-feat-ambient-webmcp-tool-federation-plan.md`, surface the
   conflict. Do not guess, and do not resolve it by editing the plan.
6. **Stay in lane.** `docs/ORCHESTRATION.md` has a file-ownership table.

## Harness constraints — violating these destroys a measurement

- **PRO-17 (clean-room) is pinned to Codex 5.6 Terra.** Fresh session, scratch directory
  OUTSIDE this repo, given only `CONTRACT.md` and the widget helper's public docs.
- **Therefore PRO-6 and PRO-7 must NOT run on Codex.** Claude or Cursor only. If Codex
  authors the contract PRO-17 is measured against, the isolation guarantee is void.

## Concurrency

Three lanes are permitted; **2–3 concurrent agents is the practical ceiling**, because one
human supervisor reviewing output is the real bottleneck. If you want a fourth, the cut
ladder should have fired instead — say so rather than scaling up.

## Merging

You may review, but **do not merge to `main` without explicit confirmation from the user.**
Sub-agents never merge their own PRs. Rebase on current `main` before review. PRO-8 should
arrive as 2–4 stacked PRs by phase, merged in phase order.

## When you dispatch a ticket, give the sub-agent

- The ticket body verbatim — it carries its own reading list and its own spike-findings block
- The model/effort tier named in that ticket; dispatch by tier, not uniformly
- An instruction to self-review its diff line by line and paste `npm test` output into the PR

## What I want back from you

1. The dispatchable set, and what is blocked behind what.
2. Your recommended next action, with reasoning — not a menu of options.
3. Any checkpoint in `docs/ORCHESTRATION.md` that has passed without its condition met, and
   which cut you think that should trigger.
4. Anything in the docs or tickets that contradicts something else you read.

Start with steps 1–5. Do not dispatch anything until you have reported and I have confirmed.
