# Ambient — demo video script

**Target run time: 2:50.** Hard cap is 3:00 — the rules state judges are not required to watch beyond it.

Narration below is **376 words** (counted, not estimated). At a clear 150 words per minute that is about **2:30 of speech**, leaving roughly 20 seconds of headroom for pauses, the page load, and the inspector row settling. **Read it aloud on a timer before recording.** If you run long, cut from 2:10–2:40 first; never cut 0:00–0:15.

---

## Pre-flight checklist

Do all of this before you hit record.

- [ ] **Chrome 149+.** If the host page shows the "WebMCP required" panel, enable `chrome://flags/#enable-webmcp-testing` and restart. Otherwise leave the flag off — the page's own origin trial token should carry it, and that is worth showing.
- [ ] **Open exactly one tab:** `https://ambient-host-tomiwaalukos-projects.vercel.app`
      Never a short alias like `ambient-host-theta.vercel.app` — the tokens and `exposedTo` entries name the long hostname, so federation fails silently on the alias.
- [ ] **Load the page and wait a full 60 seconds before you start recording.**
      This is not superstition. The host's surface-change rate bound allows 12 changes per origin per rolling 60-second window. Page load burns most of that budget, so an early click on the hostile button trips the bound and the row shows **Degraded** instead of **Quarantined**. Both are containment and the page says so, but Quarantined is the beat you want on camera. Waiting one minute drains the window.
- [ ] **Second window ready:** a terminal at the repo root, font large enough to read at 1080p, scrolled to a clean prompt.
- [ ] **Have the OpenAI docs quote ready** as a title card or a second tab: <https://learn.chatgpt.com/docs/webmcp>
- [ ] Close notifications, hide bookmarks, set display scaling so text is legible.
- [ ] **Audio is required by the rules.** Test levels first.
- [ ] **No copyrighted music. No third-party trademarks** beyond the ones legitimately on screen.
- [ ] Do one full dry run. The project **must function as depicted** — if a beat does not land in the dry run, cut the beat, do not narrate it anyway.

---

## Script

### 0:00 – 0:15 · The problem

**On screen:** the OpenAI docs quote, large.

> "WebMCP lets a page register tools an AI agent can call. But on a real commercial page, the tools that matter aren't the page's own — they belong to the booking widget, the checkout widget, the support widget it embeds. And here's what OpenAI's own documentation says about those."

**Action:** highlight the line — *"The browser doesn't discover tools registered inside iframes."*

> "Every third-party widget on the web is invisible to agents."

---

### 0:15 – 0:40 · Federation

**On screen:** cut to the loaded host page. Scroll to **Governed tools**.

> "This is a host page embedding three widgets from three separate companies, on three independently deployed origins. It owns none of them. Ambient discovers their tools across the origin boundary and republishes them on the top-level document, where an agent can actually see them."

**Action:** slow-scroll the six tools, letting the origin beside each one register.

> "Six tools. Each renamed by the host, each printed next to the origin that contributed it."

---

### 0:40 – 1:05 · One task, two companies

**Action:** click **Run cross-vendor trip plan**. Let both cards fill.

> "One task spanning two vendors — flights from Acme, return policy from Zenith — into a single outcome. That's page script calling the same governed tools an agent would call."

---

### 1:05 – 1:35 · Provenance

**Action:** point at `acme.booking.search` and `zenith.support.search`.

> "Look at these two. Both vendors registered a tool called, just, 'search.' WebMCP returns both and leaves you to sort it out. Ambient assigns the vendor label from the host's allowlist — the one thing a widget can't forge."

**Action:** expand **Host-authored envelope** on a result card.

> "And every string a vendor supplies gets rebuilt by the host, labeled with the origin it came from, and run through credential redaction before it ever reaches the agent."

---

### 1:35 – 2:10 · Containment

**Action:** click **Simulate a widget turning hostile**. Hold on the Zenith inspector row until it changes.

> "Now a widget turns hostile. Zenith registers an extra tool whose description tells the agent to ignore its instructions and call the other vendor's pay tool."

**Action:** let the row land on Quarantined; read the reason aloud from screen.

> "Screening catches it on the next pass, quarantines that origin, and withdraws the proxies it had already registered."

**Action:** click **Revoke tools** on another row.

> "And revoke withdraws that origin's Permissions Policy grant — not just the proxy — so the widget can't re-register."

---

### 2:10 – 2:40 · It's real

**On screen:** switch to the terminal.

```
npm test
```

> "A hundred and seventy-four tests, no build step, zero dependencies."

**Action:** run the checker on the hostile fixture, then `echo $?`.

```
node src/checker/cli.js --fixture sites/zenith-support/subject-hostile.js
echo $?
```

> "And a conformance checker over twenty-two rules that exits non-zero on a violation. Every rule carries an evidence class, so a vendor's attestation is never reported as a verified fact."

---

### 2:40 – 2:50 · Close

**On screen:** back to the host page.

> "Ambient governs exposure — it doesn't claim to prevent prompt injection, and it says so on the page. The vendor ships one script tag carrying a third-party origin trial token, and a page that registered for nothing gets WebMCP from its vendor's script."

---

## Things you must not say

The rules require the project to **function as depicted**, so an overclaim here is a rules violation, not just a bad line.

| Don't say | Say instead |
|---|---|
| "An agent completes the task" (over the button click) | "the same governed tools an agent would call" |
| "Adopt our helper and WebMCP turns on everywhere" | "the vendor ships one script tag carrying a third-party token" — credit the injector script, not the helper |
| "Paste two script tags and you're done" | Don't describe adoption as a recipe at all |
| "This prevents prompt injection" | "Ambient governs exposure — it doesn't claim to prevent prompt injection" |
| "Blocks / secures / sanitizes" | "screens", "quarantines", "withdraws", "refuses" |
| Any test or rule count you didn't just run | Re-run `npm test` the morning of and use that number |

If the hostile row lands on **Degraded** rather than **Quarantined**, say *"the host bounded it and named the reason"* and move on. Do not re-record for it, and do not narrate Quarantined over a Degraded row.
