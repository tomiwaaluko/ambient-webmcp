# U1 viability spike — report

**Ticket:** PRO-5 · **Branch:** `u1-viability-spike` · **Run:** 2026-09-01
**Browser:** Chrome **151.0.7922.174** (Windows 11), user agent `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36`
**Trial:** WebMCP, id `4163014905550602241`, milestones 149–156, expiry 2026-11-17.

Everything below marked **OBSERVED** was run against the four live HTTPS origins and the literal result is quoted. Anything not run says **NOT OBSERVED** and why.

---

## ⚠️ Read this before writing any claim — corrections and narrowings

### 1. `exposedTo` goes in `registerTool`'s **second argument**, not in the tool descriptor

The plan and `CONVENTIONS.md` both describe `exposedTo` as part of the tool shape:

```js
// src/widget/helper.js — CONVENTIONS.md, current text
registerConformantTool({ widgetId, name, description, inputSchema, readOnly, untrustedContent, exposedTo, authorize, execute })
```

That is fine as a *helper* signature, but the helper must not forward `exposedTo` into the descriptor. The platform call is:

```js
await document.modelContext.registerTool(descriptor, { exposedTo: ['https://host-origin'] });
```

Put `exposedTo` inside the descriptor and Chrome drops it as an unrecognised dictionary member — **no error, tool still registers, host sees nothing.** This cost the spike its first full run. Measured directly:

| Call | Result |
|---|---|
| `registerTool({...,  exposedTo:['http://insecure.example']})` | **ACCEPTED** |
| `registerTool({...,  exposedTo:[12345]})` | **ACCEPTED** |
| `registerTool({...,  thisKeyDoesNotExist:['x']})` | **ACCEPTED** |
| `registerTool({...}, { exposedTo:['http://insecure.example'] })` | rejects `SecurityError: Only secure origins are allowed in the exposedTo list.` |
| `registerTool({...}, { exposedTo:['https://ambient-host-…'] })` | resolves |

The second argument is the one that is validated. **PRO-7 must pass it there.**

### 2. `registerTool` returns a **Promise**

`document.modelContext.registerTool(...) instanceof Promise === true`. A registration that is not awaited throws its own rejection away — including the `NotAllowedError` that is the *only* signal a widget gets when the Permissions Policy grant is missing. **Every registration site must await.** This is a silent-failure source the product exists to expose, sitting in the product's own dependency.

### 3. CLAIM NARROWING — Q5: the host's proxies are not the only reachable surface

The agent's **default** surface is host-only: `getTools()` with no argument in the host document returns *only* host-origin tools, never the widget frames'. **But** any script running in the host document can enumerate the page's iframes, read their origins, and call `getTools({ fromOrigins: [...those origins...] })` to get the widgets' **raw, un-namespaced, vendor-authored** tools alongside the host's own. Observed, verbatim below.

So the submission **may** claim:

> The host's governed surface is the coherent, attributable one, and it is what an agent gets by default.

The submission **may not** claim that Ambient's output is the agent's *only* surface, or that the raw widget tools are unreachable. They are reachable, by design of the platform, precisely because Ambient's architecture requires the two conditions that make them reachable (the `allow` grant and `exposedTo` naming the host).

**What remains reachable outside the governed surface, exactly:** for every origin the host allowlists and embeds, that origin's full raw tool list — original names (including colliding unqualified ones), original vendor-authored descriptions, and original annotations — retrievable by one `getTools({fromOrigins})` call from anything running script in the host page. This must be stated in the write-up (R34) and reflected in `CONTRACT.md` (PRO-6).

### 4. Q6 — RESOLVED 2026-09-01: both halves now OBSERVED working

~~Third-party token *matching* is NOT OBSERVED — no third-party token has been minted.~~

**Superseded.** A third-party token was minted for acme (`isThirdParty: true`, verified by decode) and tested. **Both halves now hold: the vendor-distribution claim is proven, not merely plausible.** See Q6 Leg B below for the run.

⚠️ **The first run of that test reported a FALSE NEGATIVE** ("THIRD-PARTY MATCHING FAILED"). The probe's own tool descriptor omitted the required `execute` member, so `registerTool` threw `TypeError: Failed to read the 'execute' property from 'ModelContextTool': Required member is undefined` — a malformed call, not a token failure. The activation evidence in that same run was already positive. Recorded because the failure mode is general: **a malformed WebMCP call and an inactive trial look similar from a distance, and conflating them nearly killed a protected claim.** Any probe that reports on trial status must separate "trial never activated" from "trial activated but my call was wrong."

---

## Q1. Does the three-way AND compose?

**OBSERVED — YES.**

Setup: host embeds acme with `iframe.allow = "tools https://acme-booking-tomiwaalukos-projects.vercel.app"`; acme calls `registerTool(descriptor, { exposedTo: ['https://ambient-host-tomiwaalukos-projects.vercel.app'] })`; host calls `getTools({ fromOrigins: ['https://acme-booking-tomiwaalukos-projects.vercel.app'] })`.

```
Q1_getTools_fromOrigins_acme: [
  "acme_search @ https://acme-booking-tomiwaalukos-projects.vercel.app",
  "host_marker @ https://ambient-host-tomiwaalukos-projects.vercel.app"
]
Q1_getTools_noArg: [
  "host_marker @ https://ambient-host-tomiwaalukos-projects.vercel.app"
]
allowAttr: "tools https://acme-booking-tomiwaalukos-projects.vercel.app"
widgetDiagnostics: { hasModelContext: true, isFramed: true, registered: ["acme_search"], errors: [] }
```

Execution across the origin boundary also works, through `src/shared/adapter.js`:

```
viaAdapter: { ok: true, shape: "json-string",
  result: { content: [ { type: "text", text: "acme:acme_search received query=\"flights to lisbon\"" } ] } }
```

**Supporting facts.**

- `tools` is a real Permissions Policy feature here: `document.featurePolicy.features()` includes `"tools"` (83 features total). On the iframe element, `frame.featurePolicy.allowsFeature('tools', acmeOrigin) === true`.
- Both `allow="tools <origin>"` and the spec's bare `allow="tools"` grant it.
- For a dynamically-created iframe, `allow` must be assigned **before** `src`.
- `fromOrigins` **is additive, not a filter.** The caller's own tools are returned no matter what — `fromOrigins: []`, `fromOrigins: ['https://nope.example']`, and a correct origin all still include the host's own tools. **PRO-8 must partition the result by each descriptor's `.origin`, not assume `fromOrigins` scoped the response.**
- `getTools` validates origins: `getTools({fromOrigins:['acme-booking-…vercel.app']})` (no scheme) throws `SecurityError: Only secure origins are allowed in the fromOrigins list.`
- `fromOrigins` does **not** reach an origin that is not actually embedded. With zero iframes on the page, asking for all three vendor origins returned only `host_marker`. Naming an origin is not enough; a live embedded document is required.

### Tool descriptor shape as returned by `getTools()`

```
{
  name: "acme_search",
  description: "acme capability: acme_search.",   // vendor-authored, verbatim
  title: "",
  inputSchema: "{\"type\":\"object\",\"properties\":{…}}",   // ⚠️ a JSON STRING, not an object
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  origin: "https://acme-booking-tomiwaalukos-projects.vercel.app",
  window: Window                                   // live WindowProxy for the registering frame
}
```

Two notes for PRO-8: `inputSchema` arrives **as a string** and must be `JSON.parse`d before use; `annotations.untrustedContentHint` is the platform's spelling of the plan's `untrustedContent`.

---

## Q2. Does removing each leg fail silently?

**OBSERVED — YES on the host side for all three legs. The silence is real, with one asymmetry.**

Each run: fresh page load, `window.onerror` and `unhandledrejection` listeners installed, console captured.

### Leg 1 removed — no `allow` attribute on the iframe

```
allowAttr: null
hostGetTools_fromOrigins_acme: ["host_marker @ https://ambient-host-tomiwaalukos-projects.vercel.app"]
hostGetTools_threw: null
pageErrorsCaught: []
console: no console messages
widgetDiagnostics.errors: [
  "acme_search -> NotAllowedError: Access to the feature \"tools\" is disallowed by permissions policy."
]
```

**Asymmetric.** The host learns nothing. The *widget* gets a real `NotAllowedError` — but only if it awaits `registerTool`. Note `document.modelContext` is still defined in the frame; it is `registerTool` that rejects.

### Leg 2 removed — widget registers with no `exposedTo`

```
A_hostSees: ["host_marker @ https://ambient-host-tomiwaalukos-projects.vercel.app"]
A_threw: null
pageErrorsCaught: []
A_noExposedTo.widget: { registered: ["acme_search"], errors: [] }
A_widgetOwnView.own: [ { name: "acme_search", origin: "https://acme-booking-…" } ]
```

**Silent on both sides.** The widget registered successfully, sees its own tool, reports no error. The host sees nothing and no error. This is the worst of the three: both parties believe the system is working.

The `exposedTo`-names-the-wrong-origin variant behaves identically:

```
widgetThinksItRegistered: { exposedMode: "wrong", registered: ["acme_search","search"], errors: [] }
hostSees: ["host_marker @ ambient-host"]   hostThrew: null   pageErrors: []
```

### Leg 3 removed — host omits `fromOrigins`

Legs 1 and 2 both correct; only the discovery call varies.

```
LEG3_REMOVED_noArg:            ["host_marker @ ambient-host"]                    threw: null
LEG3_REMOVED_emptyOptions:     ["host_marker @ ambient-host"]                    threw: null
LEG3_REMOVED_emptyFromOrigins: ["host_marker @ ambient-host"]                    threw: null
LEG3_REMOVED_wrongOrigin:      ["host_marker @ ambient-host"]                    threw: null
LEG3_PRESENT_correct:          ["acme_search @ acme-booking", "host_marker @ ambient-host"]
pageErrorsCaught: []
```

**Confirmed: R29 is real.** A missing leg is indistinguishable from a vendor that simply has no tools, from a widget that failed to load, and from a deliberate block — unless something records the cause. That is the gap the inspector fills.

---

## Q3. What input shape does `executeTool` accept?

**OBSERVED — Chrome's docs are right, the spec's WebIDL `object` is wrong on this build. `executeTool` takes a JSON STRING.**

```
raw_jsonString: "{\"content\":[{\"type\":\"text\",\"text\":\"acme:acme_search received query=\\\"raw str\\\"\"}]}"
raw_object:     THREW UnknownError: Failed to parse input arguments
```

Full identity of the failure, so the adapter can recognise it:

```
{ ctor: "DOMException", isDOMException: true, name: "UnknownError",
  code: 0, message: "Failed to parse input arguments" }
```

Both results hold **cross-origin** (against the live acme frame) and same-origin.

### Details that constrain the adapter

- **Signature is `executeTool(toolHandle, inputJsonString)` — 2 arguments, both required.**
  - Passing a name instead of the handle: `TypeError: Failed to execute 'executeTool' on 'ModelContext': The provided value is not of type 'RegisteredTool'.`
  - Omitting the second argument: `TypeError: … 2 arguments required, but only 1 present.`
- **The return value is also a JSON string**, not an object. `typeof result === "string"`; it must be parsed.
- The tool's own `execute(input)` receives a **parsed object** — the string/object split is only at the `executeTool` boundary.
- **The error does not identify the problem.** A malformed JSON string (`'{not json'`) and an empty string both throw the *identical* `UnknownError: Failed to parse input arguments`. The shape therefore cannot be inferred from the error; it has to be tried.
- **Probing is safe on this build.** With an invocation counter inside the tool: after a failed object-form call the counter read `0`; after the successful string-form call it read `1`. The rejected shape fails during argument parsing, **before** `execute()` runs, so trying both shapes cannot fire a side effect twice.

`src/shared/adapter.js` implements `executeToolCompat(tool, input)` on exactly this: try `json-string` first, fall back to `object`, cache the winner (`getInputShape()` returned `"json-string"` after the first successful call), and only ever probe twice on the first call of a document's lifetime. It returns `{ ok:true, result, shape }` or `{ ok:false, code, message }`, matching the `{ok}` convention used by `composeName` and `buildEnvelope`.

**New reason codes introduced by the adapter** — PRO-6 should fold these into the canonical list: `TOOL_HANDLE_INVALID`, `MODEL_CONTEXT_UNAVAILABLE`, `INPUT_SHAPE_UNSUPPORTED`, `RESULT_PARSE_FAILED`.

---

## Q4. Does a cross-origin child's registration fire `toolchange` in the embedder?

**OBSERVED — YES, and it is correctly scoped to what the embedder may see.**

Control, then the real test. (Each registration fires **one** event; the count increments by two only because both `addEventListener('toolchange')` and `ontoolchange` were attached — identical timestamps confirm one dispatch to two handlers.)

```
CONTROL_hostOwnRegistration:        { before: 0, after: 2, fired: true }
MOUNT_initialWidgetRegistration:    { before: 2, after: 4, fired: true }
Q4_crossOriginLateRegistration:     { before: 4, after: 6, fired: true }

lateCmd: { ok: true, name: "acme_late_probe",
           diagnostics.registered: ["acme_search","acme_late_probe"] }
reAggregated: ["acme_late_probe @ acme-booking", "acme_search @ acme-booking",
               "host_marker @ ambient-host"]
```

A cross-origin frame registering a tool **2.5 seconds after** the host's first aggregation pass woke the host's document.

### It does not fire for tools the embedder cannot see

Same setup, but the widget registers with **no** `exposedTo`:

```
nonExposedWidget_firedToolchange: { before: 2, after: 2, fired: false }
nonExposedLate_firedToolchange:   { before: 2, after: 2, fired: false }
hostCanSeeItsTools: ["host_marker @ ambient-host"]
stillInvisible:     ["host_marker"]
```

So `toolchange` is not an information leak: the embedder is woken only when the change affects tools it is actually entitled to discover.

### The event carries no payload

```
{ type: "toolchange", ctor: "Event" }
```

A plain `Event` — no `detail`, no origin, no indication of what changed. **PRO-8 gets "something changed" and must re-aggregate across all allowlisted origins to find out what.** Event-driven re-aggregation is sound and a polling schedule is not required; but because the event names no origin, the re-aggregation pass must be whole-surface, and it should still be debounced — three registrations produced three separate events.

---

## Q5. Does an agent observe the widget's raw tools alongside the host's proxies?

**OBSERVED — the default surface is host-only, but the raw tools are reachable on request. ⚠️ This narrows the claim. See the flag at the top.**

Two vendors mounted: acme exposing to the host, zenith exposing to nobody.

```
A_hostDefaultSurface_noArg: ["host_marker @ ambient-host"]
B_hostAsksAcmeOnly:         ["acme_search @ acme-booking", "host_marker @ ambient-host",
                             "search @ acme-booking"]
C_hostAsksZenithOnly:       ["host_marker @ ambient-host"]
D_hostAsksBoth:             ["acme_search @ acme-booking", "host_marker @ ambient-host",
                             "search @ acme-booking"]
```

- **A** — the host document's default tool list contains only host-origin tools. A WebMCP client that calls `getTools()` plainly does **not** see widget tools.
- **C/D** — containment holds for a non-exposing origin. Zenith's tools stayed invisible even when explicitly requested.

### The reachable path, observed

```
AGENT_couldEnumerateFrameOrigins: ["https://acme-booking-…", "https://zenith-support-…"]
AGENT_rawToolsReachable: ["acme_search @ acme-booking", "host_marker @ ambient-host",
                          "search @ acme-booking",     "search @ zenith-support",
                          "zenith_search @ zenith-support"]
```

Enumerating `document.querySelectorAll('iframe')`, reading each `.src` origin, and passing them to `fromOrigins` returns the widgets' raw tools. And the vendor's text arrives **unmodified** — comparing each returned `description` against the exact string the widget authored:

```
acme_search   textLength 29  hostRewroteIt false
search        textLength 24  hostRewroteIt false   (acme)
search        textLength 26  hostRewroteIt false   (zenith)
zenith_search textLength 33  hostRewroteIt false
```

This is why the envelope (PRO-8/U7) exists — and equally why the envelope cannot be described as *preventing* anything. It governs the host's surface; it does not remove the vendor's text from the platform.

### No upward or sideways leak

The widget frame cannot reach the embedder's tools or a sibling's, even naming the origin directly:

```
E_acmeAsksUpwardForHost   → fromOrigins:["https://ambient-host-…"]
   returned only: acme_search, search   (both @ acme-booking)
F_acmeAsksSidewaysForZenith → fromOrigins:["https://zenith-support-…"]
   returned only: acme_search, search   (both @ acme-booking)
```

A frame gets its own tools plus whatever has been exposed *to it*. Nothing was exposed to acme, so acme saw only itself. **Containment is directional and holds downward.**

### NOT OBSERVED, and it matters

I could not attach a real WebMCP agent client (browser-internal agent, DevTools WebMCP panel, or extension) and enumerate what *it* lists. No such client was available to drive. Everything above is the **page-facing API surface**, which is the same surface a client reads — but whether a specific agent implementation calls `getTools()` plainly or enriches it with discovered frame origins is that implementation's choice, and is not settled here. The claim-narrowing above is written to be true either way.

### Collision, observed (bears on AE1 / R26)

Both vendors registered an unqualified `search`. Both survived:

```
COLLISION_duplicateNameCount: 2
COLLISION_bothRegisteredNoError: ["https://acme-booking-…", "https://zenith-support-…"]
COLLISION_executeEach: [
  { askedOrigin: "https://acme-booking-…",   ok: true, text: "acme:search received query=\"which vendor am i\"" },
  { askedOrigin: "https://zenith-support-…", ok: true, text: "zenith:search received query=\"which vendor am i\"" }
]
```

Cross-document duplicates are fine and route correctly — they are distinguished **only** by `.origin`. Inside a **single** document they are not:

```
sameDocDuplicate_first:  "ACCEPTED"
sameDocDuplicate_second: "InvalidStateError: Duplicate tool name"
afterDuplicate: 1
```

**PRO-8 must namespace before registering proxies**, or the second vendor's `search` proxy dies on `InvalidStateError`. This is the mechanical reason F2 exists, now confirmed.

---

## Q6. Does a third-party origin trial token work from an external JS file inside a cross-origin iframe?

**OBSERVED — YES, both legs.** *(Leg B resolved 2026-09-01, after a third-party token was minted.)*

The question decomposes into two independent legs. Leg A was run first; Leg B was blocked on a token that did not exist yet, and was run once it did.

### Leg A — runtime meta injection from an external JS file: OBSERVED, WORKS

`sites/northwind-checkout/ot-probe.html` carries **no** static origin-trial meta tag. `ot-inject.js`, a classic external script, creates the meta element at runtime.

Top-level:

| `?ot=` | injected | `modelContext` before → after | `trialActive` | `registerToolWorked` |
|---|---|---|---|---|
| `extjs` (own token) | true | `undefined` → `object` | **true** | **true** |
| `none` (control) | false | `undefined` → `undefined` | false | — |
| `foreign` (acme's token) | true | `undefined` → `undefined` | false | — |

Inside a **cross-origin iframe** on the host:

| `?ot=` | `allow` | framed | `trialActive` | `registerToolWorked` |
|---|---|---|---|---|
| `extjs` | granted | true | **true** | **true** |
| `extjs` | omitted | true | **true** | false — `NotAllowedError: Access to the feature "tools" is disallowed by permissions policy.` |
| `none` | granted | true | false | — |

Three things this settles:

1. **A meta element created at runtime by an external JS file activates the trial**, top-level and inside a cross-origin iframe. `modelContextBeforeInject: "undefined"` → `modelContextAfterInject: "object"` in the same synchronous script, with `metaTagsInDom: 1` and `scriptSrc: "https://northwind-checkout-tomiwaalukos-projects.vercel.app/ot-inject.js"`. The `?ot=none` control confirms the page has no other source of the trial.
2. **Trial activation and Permissions Policy are independent gates.** The `extjs` + no-`allow` row has the trial live (`modelContext` present) and `registerTool` still rejecting. Two separate failure modes that must not be conflated in the inspector.
3. **A first-party token cannot substitute for a third-party one.** Acme's token injected on Northwind's page did nothing — `trialActive: false`. Exactly the negative control the vendor-distribution claim needs.

Also confirmed in passing: `ot-probe.html` registers **without** `exposedTo`, and the host saw nothing from it (`hostSeesNorthwind: []`) — Q2 leg 2 reproducing on a third origin.

### Leg B — third-party token *matching*: OBSERVED, WORKS

**Resolved 2026-09-01.** A third-party token was minted for acme and tested. **The vendor-distribution claim holds.**

The WebMCP trial *does* offer third-party matching — the minted token decodes with the claim present, which the four original tokens lack:

```json
{"origin":"https://acme-booking-tomiwaalukos-projects.vercel.app:443","feature":"WebMCP","expiry":1794873600,"isThirdParty":true}
```

**Test rig.** The earlier probe served `ot-inject.js` from Northwind itself — same-origin, so it could not test matching at all, since a third-party token is validated against the origin of the *script that injects it*. The rig was rebuilt:

- `sites/acme-booking/ot-inject-3p.js` — served by **acme**, carries acme's third-party token
- `sites/northwind-checkout/ot-probe-3p.html` — a **Northwind** page with no static token, loading acme's script cross-origin

Run on Chrome 151, production deployment `79e4e59`:

| Field | Value |
|---|---|
| `scriptOrigin` | `https://acme-booking-tomiwaalukos-projects.vercel.app` |
| `documentOrigin` | `https://northwind-checkout-tomiwaalukos-projects.vercel.app` |
| `isActuallyCrossOrigin` | **true** |
| `modelContextBeforeInject` → `After` | `undefined` → **`object`** |
| `trialActive` | **true** |
| `registerToolWorked` | **true** |

**Confound checked and cleared.** Northwind's `index.html` carries its own first-party token, so a positive result on that origin could have been Northwind's token doing the work. The probe page was verified against the **raw server response**, not the DOM: `curl` shows zero live `<meta http-equiv="origin-trial" content=`. The only textual match is the comment explaining its own absence. The activation can only have come from acme's third-party token.

**What this proves.** A vendor's external JS file, carrying the vendor's own third-party token, turns WebMCP on for a *customer's* origin that has registered for nothing. That is Ambient's vendor-distribution argument working as a mechanism rather than as narration — and it is the thing the `foreign` control in Leg A showed a first-party token cannot do.

<details>
<summary>Superseded: why Leg B was originally NOT OBSERVED</summary>

**Reason: no third-party token existed.** All four minted tokens were first-party. Decoding the payloads shows plain first-party claims, e.g. Northwind's:

```json
{"origin":"https://northwind-checkout-tomiwaalukos-projects.vercel.app:443","feature":"WebMCP","expiry":1794873600}
```

No `isThirdParty` claim on any of the four. Minting one requires registering a **new** trial token with the third-party matching option in the Chrome origin trials console — an authenticated form submission on the user's Google account, which is outside what this ticket may do unattended.

Chrome's documentation confirms the mechanism requirement Leg A was built to test:

> "A third-party token must be provided in an external JavaScript file included with a `<script>` element. A third-party token won't work in a meta tag, inline script or HTTP header."

and that the option is per-trial:

> "Some trials provide a *Third-party matching option* on registration."

The WebMCP origin trial announcement does not state whether WebMCP offers it. **Whether the WebMCP trial exposes third-party matching at all is unverified.**

**What this meant for the claim at the time.** Leg A proved the *delivery* half was not a blocker. Leg B — that a vendor's token enables WebMCP on a *customer's* origin — was unproven, and the `foreign` control showed a first-party token would not do it.

</details>

---

## What a human must do

1. ~~**Mint a third-party WebMCP origin trial token.**~~ ✅ **DONE 2026-09-01.** Minted for acme with third-party matching, Leg B re-run, claim proven. See Q6 Leg B above.
2. **Confirm Q5 against a real agent client** if one becomes available — attach the DevTools WebMCP panel or an agent extension to `https://ambient-host-tomiwaalukos-projects.vercel.app/` with two widgets mounted, and record whether its listed tools include the raw `search @ acme-booking` / `search @ zenith-support` entries. The claim-narrowing above is written to hold either way, but a direct observation would let PRO-18 be more precise.

## Handoffs

| Finding | Who needs it |
|---|---|
| `exposedTo` is `registerTool`'s 2nd argument; `registerTool` returns a Promise | **PRO-7** (blocking), `CONVENTIONS.md` |
| `fromOrigins` is additive — partition by `descriptor.origin` | **PRO-8** |
| `inputSchema` arrives as a JSON **string**; annotation is `untrustedContentHint` | **PRO-8**, **PRO-9** |
| Same-document duplicate names throw `InvalidStateError: Duplicate tool name` — namespace before registering | **PRO-8** |
| `toolchange` fires for cross-origin children, scoped, payload-free — re-aggregate whole-surface, debounced, no polling needed | **PRO-8** |
| Q5 narrowing: raw widget tools reachable via `fromOrigins` | **PRO-6**, **PRO-18** |
| New reason codes: `TOOL_HANDLE_INVALID`, `MODEL_CONTEXT_UNAVAILABLE`, `INPUT_SHAPE_UNSUPPORTED`, `RESULT_PARSE_FAILED` | **PRO-6** |
| Trial activation and Permissions Policy are independent failure modes | **PRO-16** (inspector must distinguish them) |
| Q6 Leg B **proven** — third-party token activates WebMCP on a customer origin cross-origin. Vendor-distribution claim holds; PRO-7 ships the third-party token, PRO-18 may state the claim | **PRO-7**, **PRO-18** |
| Third-party token must be served from the **vendor's** origin — a same-origin injector cannot test or deliver matching | **PRO-7** |
| A malformed `registerTool` descriptor (missing `execute`) throws a `TypeError` that reads like an inactive trial — separate the two when reporting status | **PRO-16** |

## Spike artifacts

Disposable — PRO-19 replaces the host side, PRO-14 the vendor pages.

| Path | What |
|---|---|
| `src/shared/adapter.js` | `executeToolCompat(tool, input)` — **keep**, this is a real deliverable |
| `scripts/sync-sites.mjs` | copies `src/shared/*.js` into each `sites/*/vendor/`; `--check` fails a stale deploy — **keep** |
| `src/shared/spike-widget.js` | parameterised spike widget shared by acme and zenith |
| `sites/host/index.html` | spike console, `window.spike` |
| `sites/host/child.html` | same-origin control frame |
| `sites/acme-booking/index.html`, `sites/zenith-support/index.html` | live spike widgets, both registering `search` |
| `sites/northwind-checkout/ot-probe.html`, `ot-inject.js` | Q6 **Leg A** delivery probe (same-origin injector); `index.html` keeps its static token so R35 still holds |
| `sites/acme-booking/ot-inject-3p.js` | Q6 **Leg B** — acme-served injector carrying the third-party token. **Keep**: PRO-7 ships this mechanism |
| `sites/northwind-checkout/ot-probe-3p.html` | Q6 **Leg B** probe — Northwind page, no static token, loads acme's injector cross-origin |

Reproduce any run from the host page's DevTools console — `window.spike` exposes `mount`, `ask`, `snapshot`, `registerHostTool`, `executeToolCompat`, and `results`.
