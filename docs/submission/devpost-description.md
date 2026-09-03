# Ambient — Devpost written description

> Paste the content below the horizontal rule into the Devpost submission form.
> The four headings are the four things the rules require the description to explain,
> in the order the rules list them.

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

No build step, no dependencies, 174 tests under `node --test`.

**Ambient does not prevent prompt injection, does not do generic false-read-only detection, and cannot cancel an in-flight side effect.** It governs exposure, not the model. The contract says so in those words, and so does the demo page.
