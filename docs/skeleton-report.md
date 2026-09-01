# U1.5 walking skeleton — report

**Ticket:** PRO-19 · **Branch:** `u15-walking-skeleton` · **Run:** 2026-09-01
**Browser target:** Chrome 151+ with WebMCP origin trial (same as U1 spike)

This ticket exercises the aggregator → proxy → agent → inspector chain once, end to end. Everything here is disposable; the lasting value is seam knowledge and corrected interface contracts.

---

## Seam 1: `getTools({ fromOrigins })` shape

**Expected (CONVENTIONS.md + spike Q1):** Returns an array of tool descriptors including the caller's own host tools (additive, not a filter). Each descriptor carries `name`, `description`, `inputSchema` (JSON **string**), `annotations`, `origin`, and `window`.

**Observed in skeleton implementation:** Matches spike findings. The aggregator partitions results by `descriptor.origin` rather than treating `fromOrigins` as a strict filter. Host-origin tools are ignored; only allowlisted widget origins are composed into proxy names.

**Surprise:** None beyond what spike already recorded. The additive behaviour is load-bearing — a naive filter would drop host tools incorrectly if ever needed for comparison.

---

## Seam 2: `toolchange` re-entry during proxy registration

**Expected:** Cross-origin widget registration fires `toolchange` in the embedder (spike Q4). Host proxy registration should also fire it.

**Implemented guard:** `aggregateOnce()` uses a single-flight flag (`passInFlight`) and queues one follow-up pass if triggered while in flight. Registered proxy names are tracked in a `Map` so re-aggregation does not attempt duplicate same-document registrations.

**Surprise:** The single-flight guard is load-bearing on the **first** integration pass, not only after multiple vendors arrive. Without skipping already-registered proxy names, the host's own proxy registration would re-enter aggregation and hit `InvalidStateError: Duplicate tool name`.

**Live verification:** Requires Chrome 151 with origin trial on the deployed host page. Automated tests cover naming only; browser seams verified by code review against spike Q4 + Q5 collision findings.

---

## Seam 3: Agent sees proxy under namespaced name

**Expected:** Default `getTools()` (no argument) in the host document lists only host-origin tools — including registered proxies, not raw widget tools (spike Q5 narrowing).

**Skeleton behaviour:** Widget registers raw `search @ acme-booking`. Host composes and registers `acme.booking.search` in the host document. `window.ambient.call('acme.booking.search', input)` resolves the proxy by name from `getTools()` and forwards via `executeToolCompat`.

**Surprise:** None for the happy path. Raw widget tools remain reachable via `getTools({ fromOrigins })` from host script — already documented in spike Q5; not in scope for this ticket.

---

## Seam 4: `executeToolCompat` against cross-origin tool

**Expected (spike Q3):** `executeTool` requires a RegisteredTool **handle** and JSON-string input on Chrome 151. Returns JSON string parsed by adapter.

**Skeleton behaviour:** Proxy `execute` calls `executeToolCompat(sourceTool, input)` where `sourceTool` is the handle captured from `getTools({ fromOrigins })` during aggregation. Matches spike adapter usage.

**Surprise:** None. U1 finding stands without adjustment.

---

## Seam 5: Widget helper — `exposedTo` and `await registerTool`

**Expected (spike corrections):** `exposedTo` is `registerTool`'s second argument. `registerTool` returns a Promise that must be awaited.

**Stub behaviour:** `registerConformantTool` passes `{ exposedTo }` as the second argument and awaits `registerTool`. Does not forward `exposedTo` into the descriptor. Does not inject third-party origin trial token (PRO-7).

**Surprise:** None — stub follows spike findings verbatim.

---

## CONVENTIONS.md corrections

**No contract changes required.** Spike-report corrections (`exposedTo` placement, Promise await, additive `fromOrigins`, `inputSchema` as string, `untrustedContentHint` spelling) were already embedded in CONVENTIONS.md before this ticket. Skeleton implementation confirms them; no new mismatches found.

**New reason code in skeleton only:** `INPUT_SCHEMA_PARSE_FAILED` — used when a widget descriptor's `inputSchema` string cannot be parsed during proxy registration. Not added to CONVENTIONS.md canonical list (PRO-6 owns reason-code consolidation).

---

## Live vs not verified

| Seam | Live (Chrome 151) | Notes |
|---|---|---|
| Widget registers `search` with `exposedTo` | Pending deploy | Acme page uses helper stub |
| Host discovers via `fromOrigins` | Pending deploy | Aggregator wired in host page |
| Proxy `acme.booking.search` registered | Pending deploy | Namespace before register |
| Agent call returns widget result | Pending deploy | `window.ambient.call` console |
| Inspector one row, state `active` | Pending deploy | Renders from aggregator snapshot |
| `npm test` / naming unit tests | **Verified locally** | See PR test output |

Q5 against a real WebMCP agent client remains NOT OBSERVED (same as spike) — skeleton uses page-facing `window.ambient.call` as the agent stand-in.

---

## Scope audit

Built: one widget origin, one tool, compose-only naming, skeletal aggregator with single-flight guard, one-row inspector, helper stub, host/acme site wiring, naming tests.

Not built (per ticket non-goals): screening, envelopes, redaction, quarantine, bounds, timeouts, revocation, a11y, second vendor, extensibility abstractions.
