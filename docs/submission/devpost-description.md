# Ambient — Devpost submission answers

Everything the form asks for, in the order it asks.

- **Part A — Project details** (step 3): the narrative description. Paste the block below the rule.
- **Part B — Additional info** (step 4): field-by-field answers. At the bottom of this file.

Two fields in Part B need a decision from you before you paste. Both are flagged 🟡.

---

# Part A — Project details

> Paste everything below this rule into the project description field.
> The four headings are the four things the rules require the description to
> explain, in the order the rules list them.

---

**Third-party widgets are invisible to AI agents. Ambient makes them visible — governed, attributable, revocable.**

WebMCP lets a page register tools an agent can call. But on a real commercial page, the tools that matter are not the page's own — they belong to the booking widget, the checkout widget, the support widget it embeds. Those live in iframes, and OpenAI's WebMCP documentation states the consequence plainly:

> "The browser doesn't discover tools registered inside iframes, including same-origin and cross-origin iframes."
> "Use JavaScript to register tools in the top-level page."

Registering in the top-level page is easy when you own the widget. Ambient does it for widgets the host page does **not** own.

## Why this use case is a strong fit for WebMCP

WebMCP already supplies the cross-origin plumbing: a `tools` Permissions Policy grant, an `exposedTo` allowlist on the widget side, and `getTools({ fromOrigins })` on the host side. What it does not supply is any way to make the result coherent or safe, and the gaps are load-bearing the moment a page has more than one vendor on it.

The spec defines no naming convention — the official examples mix kebab, snake, and camel case. Across origins there is no deduplication and no rename: two vendors' identically named tools both survive, distinguishable only by `.origin`. `untrustedContentHint` and `readOnlyHint` bind nobody who reads them, so a tool that moves money differs from one that reads a calendar only by a boolean its own author set. And a missing permission returns an empty list with no error at all.

Our demo has that collision for real, not staged: Acme Booking and Zenith Support both register an unqualified tool named `search`.

The cost lands on whoever assembles the page. A host owner embedding three vendors inherits three vendors' naming choices, three vendors' descriptions in their agent's context, three vendors' claims about what mutates, and no way to refuse any of it short of removing the widget. That is a governance problem specific to WebMCP's cross-origin design.

## How it creates a better user experience

For the person using the page, the agent can finally act on what is actually on screen instead of only what the page's own developer thought to expose. Our demo completes one task across two independent companies' widgets and renders a single page-level outcome.

For the person who owns the page, federation becomes legible and reversible. An inspector shows every embedded origin moving through a real lifecycle — `discovering → evaluating → active → degraded → quarantined → revoking → revoked` — with the reason for its state named, not implied, and every refusal carrying a distinct machine-readable code. One click revokes an origin, and revocation withdraws that origin's Permissions Policy grant rather than only dropping the proxy, which would leave the widget still able to register.

That matters because WebMCP's native failure mode is silence: remove any one of the three legs cross-origin federation requires, and the host sees an empty list and no error. We measured that. The inspector exists to fill exactly that silence.

## What people and agents can do together that was difficult or impossible before

An agent can complete a task that spans several independent websites' capabilities on one page, with the host — not the vendors — deciding what reaches it and under what name.

Three things were not previously available together:

- **Provenance the widget cannot forge.** Every federated tool is renamed `vendor.widget.verb`, with the vendor label taken from the host's allowlist entry rather than from the widget. This is not cosmetic: because same-document duplicate names reject with `InvalidStateError`, a hostile widget that claimed a trusted vendor's label would either receive the agent's calls or silently delete the legitimate widget's capability from the surface.
- **Containment a person can watch.** A widget that turns hostile after it loads is caught on the next aggregation pass and its already-registered proxies are withdrawn, with the cause named on screen.
- **Adoption that travels with the embed.** A standalone script served by Acme, carrying Acme's third-party WebMCP origin trial token, was observed activating `document.modelContext` on a Northwind page that carried no token of its own — verified against the raw server response, not the DOM. The vendor ships one script tag, and a page that registered for nothing gets WebMCP from its vendor's script.

## How we implemented WebMCP

A host-side aggregator discovers third-party tools with `getTools({ fromOrigins })`, screens them against a machine-readable rule manifest, renames them into an attributable namespace, rebuilds every agent-visible string into a host-authored envelope naming the contributing origin, and re-registers them as governed proxies on the **top-level** document — each with an `AbortController` signal, which is how a proxy is withdrawn on quarantine or revocation. Widgets register through a helper that puts `exposedTo` in `registerTool`'s second argument and always awaits the call. Execution forwards through `executeTool` with a handle and a JSON string. Re-aggregation is driven by `toolchange`, debounced, with overlapping passes serialized by a generation counter so a pass triggered by the host's own proxy registrations cannot recurse.

Every one of those behaviors was measured on Chrome 151 against four live origins before the code was written, and three findings contradict the public documentation: `exposedTo` is silently dropped if placed in the descriptor, `registerTool` returns a Promise whose rejection is a widget's only Permissions Policy signal, and `fromOrigins` is additive rather than a filter. The literal outputs are quoted in the repository.

The product is the contract: 22 obligations, 10 on widgets and 12 on hosts, each tagged with exactly one evidence class — `mechanical`, `attested`, or `observed`. The checker never reports one class as another, so a vendor's attestation is never presented as a verified fact. An independent implementer, given only the contract and the helper's public API text, built a conformant widget and passed the checker on the first run.

No build step, no dependencies, 183 tests under `node --test`.

**Ambient does not prevent prompt injection, does not do generic false-read-only detection, and cannot cancel an in-flight side effect.** It governs exposure, not the model. The contract says so in those words, and so does the demo page.

---

# Part B — Additional info (step 4)

Field-by-field. ⬜ = your call, nothing to paste. 🟡 = needs a decision first.

---

### Submitter Type ⬜
Your choice — Individual, unless you are entering on behalf of an org.

### Country of residence ⬜
Your choice. Check the eligibility list in the rules first: Brazil, China, Hong Kong, Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria, Venezuela, and the Donetsk/Luhansk regions are excluded.

### If submitting on behalf of an organization ⬜
Leave blank.

### App Status
**New**

Evidence if anyone asks: the first commit in the repository is dated **2026-08-31**, six days after the submission period opened on 2026-08-25. Every line was written inside the window, so the "meaningfully extended" clause does not apply.

### If Existing, explain what you updated
Leave blank — not applicable.

### Live URL

```
https://ambient-host-tomiwaalukos-projects.vercel.app
```

⚠️ Use exactly this hostname. Shorter Vercel aliases for the same project resolve and serve the page, but the origin trial tokens and every widget's `exposedTo` name this hostname, so federation fails silently on an alias and a judge would see an empty surface.

### Testing instructions

```
No credentials required — everything is public.

BROWSER
Google Chrome 149 or newer. The host page and all three vendor origins each
ship their own WebMCP origin trial token, so no flag should be needed. If the
page shows the "WebMCP required" panel instead of the demo, enable
chrome://flags/#enable-webmcp-testing and restart Chrome.

WHAT TO LOOK AT, IN ORDER
1. "Governed tools" — six tools named vendor.widget.verb, each shown beside the
   origin that contributed it. Three of those origins are separate deployments
   the host page does not own.
2. acme.booking.search and zenith.support.search — both vendors registered an
   unqualified tool called "search". The host resolved the collision by
   assigning the vendor label from its own allowlist.
3. "Run cross-vendor trip plan" — one task spanning two independent vendors.
4. Expand "Host-authored envelope" on a result card to see the vendor's text
   rebuilt with its contributing origin attached.
5. "Simulate a widget turning hostile" — the Zenith row moves to Quarantined
   with a named reason and its proxies are withdrawn. Please load the page and
   wait about 60 seconds before clicking this: the host bounds each origin to
   12 surface changes per rolling minute, and page load consumes most of that
   budget, so an immediate click trips the rate bound and the row reads
   "Degraded" instead. Both outcomes are containment and both name a reason.
6. "Revoke tools" on any row — withdraws that origin's tools Permissions Policy
   grant, not just the host-side proxy.

REPO
npm test          → 183 tests, 0 failing, no dependencies, no build step
node src/checker/cli.js --fixture test/fixtures/conformant-widget.js   → exit 0
node src/checker/cli.js --fixture sites/zenith-support/subject-hostile.js → exit 1
```

### URL to your PUBLIC Code Repo

```
https://github.com/tomiwaaluko/ambient-webmcp
```

MIT license file at the repository root, detectable by GitHub and visible in the About sidebar.

### 🟡 Which agent(s) or client(s) did you test your WebMCP tools with?

**This one depends on a test you have not run yet.** Pick whichever version is true when you submit. Do not paste the first version unless you have actually done it.

**If you test in the ChatGPT desktop app's in-app browser and it works** — paste this and adjust the last line to match what you saw:

```
Google Chrome 151 (WebMCP origin trial, and separately with
chrome://flags/#enable-webmcp-testing) against four live HTTPS origins. Every
platform behavior the implementation depends on was measured there before the
code was written, and the literal outputs are quoted in docs/spike-report.md.

Also tested in the ChatGPT desktop app's in-app browser, where the governed
tool surface was discovered and the agent invoked the namespaced proxies
directly.
```

**If you do not run that test, or it does not work** — paste this instead:

```
Google Chrome 151, both via the WebMCP origin trial tokens the pages ship and
via chrome://flags/#enable-webmcp-testing, against four live HTTPS origins.
Every platform behavior the implementation depends on — the tools Permissions
Policy, exposedTo as registerTool's second argument, getTools({fromOrigins}),
executeTool's input shape, and toolchange scoping — was measured directly
before the code was written, and the literal outputs are quoted in
docs/spike-report.md. Three of those findings contradict the public
documentation.

We did not attach a third-party agent client. Ambient's aggregator re-registers
the federated tools on the top-level document, which is the pattern OpenAI's
WebMCP documentation prescribes for tools that would otherwise sit undiscovered
inside iframes, but we are not claiming an agent-client run we did not perform.
```

**Strong recommendation: run the ChatGPT test.** It takes about fifteen minutes, the rules name that browser first as a judging client, and a real agent calling `acme.booking.search` would be the single best clip in your video. If it does not work, the second answer costs you nothing — being precise about what you did and did not verify reads as credibility, not weakness.

### Which AI tools have you leveraged while working on this project?

```
The project was built by several coding agents working in parallel against a
shared conformance contract and a work graph, with one human reviewing and
merging.

- Claude Code (Claude Opus 5) — the cross-origin viability spike, the host
  aggregator, the federation inspector, the README, and the code reviews.
- OpenAI Codex — the honest-outcome and failure-guard fixes on the host demo
  page, each with its own regression tests.
- Cursor — the three vendor widget origins, the demo page, and deployment.
- Grok 4.6, in a deliberately isolated session — the clean-room exercise. It
  was given only CONTRACT.md and the widget helper's public API text, with no
  access to the implementation, and built a conformant widget that passed the
  checker on its first run. The isolation conditions, the result, and twelve
  places where the contract turned out to be underspecified are recorded
  unedited in docs/clean-room-report.md.

Agent-authored commits carry Co-Authored-By trailers, so the split is visible
in git history.
```

### Describe the level of learning you/your team derived from the project ⬜
Your call.

### Did you gain AI value that you can use in your career? ⬜
Your call.

---

## Before you hit Submit

- [ ] GitHub **About** box: website set to the canonical host URL, description filled in, MIT badge visible
- [ ] YouTube video is **Public**, not Unlisted, and under 3:00
- [ ] Part A pasted into Project details
- [ ] The right variant of the agent-testing answer chosen
- [ ] Submitted with margin — not in the final minutes

## After you submit — the freeze

The rules are explicit: do not edit the repo, the video, or the live site after the deadline, and do not take the site offline. Judging runs to **2026-09-21, 17:00 PT**, so all four Vercel projects must stay up and unchanged until then. If you want to keep building, fork to a separate repository.
