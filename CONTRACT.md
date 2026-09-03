# The Ambient contract

WebMCP lets a cross-origin widget register tools and lets the host page collect them, and stops there. The spec has no naming convention, no cross-origin dedup or rename — two vendors' identical names both survive, disambiguation left to the caller — `untrustedContentHint` and `readOnlyHint` bind nobody who reads them, and a missing permission returns an empty list with no error.

Ambient is the other half: what a widget owes the page embedding it, and what a host owes the agent it exposes. Each obligation names the failure it exists to prevent. Read the last section too — it says what this does not do.

**Evidence classes.** Every rule is checkable exactly one way, and the checker never reports one class as another.

| Class | What it means |
|---|---|
| `mechanical` | Verifiable from the registered tool surface alone — names, schema shape, declared hints. |
| `attested` | A semantic property the API cannot reveal. The vendor's word, reported as the vendor's word. |
| `observed` | Visible only by executing the tool against an instrumented widget. |

## What a widget must do to be federated

| # | Obligation | Evidence |
|---|---|---|
| W1 | Declare your widget identifier only; the host assigns the vendor label. A label a widget can assert is one it can forge, capturing or erasing a rival's tool. | `mechanical` |
| W2 | Restrict `exposedTo` to the host origins that actually embed you. A wildcard hands your capability to any page willing to frame you. | `attested` |
| W3 | Mark every tool returning content you did not author with `untrustedContentHint`. Unmarked, another party's text reaches the agent looking like yours. | `attested` |
| W4 | Declare `readOnlyHint` truthfully — anything that mutates state, sends a message, or moves money is mutating. A false read-only claim is a side effect nobody was asked to confirm. | `observed` |
| W5 | Accept only the parameters the tool needs, never a free-form context or passthrough field, which is an open channel into your execution path. | `mechanical` |
| W6 | Describe capability and nothing else; carry no instruction addressed to the agent, because a description is text the model reads, not a caption it ignores. | `mechanical` |
| W7 | Notify your host when your own tool surface changes, so it does not depend on cross-origin event propagation to learn that it did. | `observed` |
| W8 | Supply a machine-readable attestation covering every obligation the registered surface cannot reveal; without one, those obligations are unevaluated rather than passed. | `mechanical` |
| W9 | Confirm with the user and honor the session's existing permissions before any side effect, because the arrival of a tool call is not authorization. | `attested` |
| W10 | Neither accept nor return credentials, secrets, tokens, or payment instrument numbers. A secret in a tool result is a secret in the agent's transcript. | `attested` |

## What a host must do to federate safely

| # | Obligation | Evidence |
|---|---|---|
| H1 | Admit tools only from allowlisted origins and take each vendor label from that entry, never from the widget — origin is the one identifier a widget cannot assert. | `mechanical` |
| H2 | Name every federated tool `vendor.widget.verb`, and refuse a name that collides, exceeds 128 characters, or carries an illegal character rather than truncating it into one that misattributes its own call. | `mechanical` |
| H3 | Rebuild every widget-supplied string an agent will see — descriptions, parameter descriptions, enum values, results — into a host-authored envelope naming the contributing origin; passed through unchanged, vendor text is indistinguishable from yours. | `mechanical` |
| H4 | Detect agent-directed instructions in widget text and quarantine the origin on a match — filtering that lowers exposure, not a guarantee of containment. | `mechanical` |
| H5 | Quarantine by origin and retroactively, withdrawing proxies already registered, and re-evaluate every admitted widget on every pass, because a widget can turn hostile after it loads. | `observed` |
| H6 | Carry a widget's mutating annotation through unchanged and never present it as read-only, since that annotation is the agent's only cue to ask first. | `mechanical` |
| H7 | Federate one instance per vendor and widget identity and refuse the second visibly, naming the limit — dropped silently it is indistinguishable from a widget that failed to load. | `observed` |
| H8 | Revoke by withdrawing the origin's `tools` Permissions Policy grant rather than by dropping the proxy alone, which would leave the widget still able to register. | `observed` |
| H9 | Keep the surface current as widgets register and unregister, and serialize overlapping aggregation passes so a pass triggered by your own proxy registrations cannot recurse. | `observed` |
| H10 | Return a structured failure envelope naming the cause when a proxied tool is unavailable, errors, or exceeds its timeout, and discard a result arriving after timeout or revocation rather than forwarding it. | `observed` |
| H11 | Bound what one origin may consume — tool count, metadata size, result size, concurrent executions, change rate — and name the breached bound, because silent truncation makes an over-budget widget look conformant. | `observed` |
| H12 | Redact credential-, token-, and payment-shaped strings before they reach an envelope or a log, and keep logs in memory for the session alone; a log is a second copy of everything that passed through. | `observed` |

**Every refusal names its cause:** `ORIGIN_NOT_ALLOWLISTED`, `NAME_TOO_LONG`, `NAME_ILLEGAL_CHARS`, `INSTANCE_LIMIT_REACHED`, `INJECTION_PATTERN_MATCH`, `BOUND_EXCEEDED_TOOL_COUNT`, `EXECUTION_TIMEOUT`, `RESULT_AFTER_REVOCATION`, `INPUT_SCHEMA_PARSE_FAILED`, `AGGREGATION_PASS_FAILED`, `TOOL_HANDLE_INVALID`, `MODEL_CONTEXT_UNAVAILABLE`, `INPUT_SHAPE_UNSUPPORTED`, `RESULT_PARSE_FAILED`. A generic failure is indistinguishable from a widget that has no tools.

**Outside the checker.** No tool surface reveals it, so the manifest omits it: the host's governance surface must be keyboard-operable, announce state changes semantically, never signal state by color alone, keep focus predictable when a control disappears, and stay usable at narrow width.

## What Ambient does not prevent

Ambient governs exposure. It does not govern the model.

**Prompt injection.** Provenance labels, delimiters, and pattern detection do not constrain how a model treats text once it is in the agent's context, and an agent-directed instruction the detector misses may still influence the agent. Chrome's own tool-security guidance states that safety inside an LLM cannot be guaranteed and that repeatable injection has succeeded against state-of-the-art models.

**The governed surface is the default one, not the only one.** `getTools()` in the host document returns host-origin tools only. But any script on that page can enumerate the embedded origins and call `getTools({ fromOrigins })` to read each widget's raw tools — original names, vendor-authored descriptions, original annotations, unmodified. The envelope governs what the host publishes; it does not remove the vendor's text from the platform.

**In-flight side effects.** Revocation withdraws the Permissions Policy grant, stopping new registration and new calls. It cannot cancel work already begun: the late result is discarded and the race reported, but the side effect may already have happened.

**False read-only claims in general.** Contradiction between a declared `readOnlyHint` and real behavior is observed only against instrumented widgets whose state the harness can see; for an arbitrary widget, W4 is not evaluable and rests on the attestation W8 requires.

**Authorization.** Ambient carries the mutating annotation and surfaces it; the widget enforces authorization where the state actually changes.

**What it does deliver, and nothing beyond it:** *deterministic provenance* — every agent-visible string is rebuilt by the host and carries the origin that contributed it; *bounded exposure* — only allowlisted origins reach the surface, and quarantine removes one entirely; *risk signaling* — host-authored delimiters and preserved hints mark third-party data as third-party; *defense-in-depth filtering* — known-shape attacks are removed before rebuild.
