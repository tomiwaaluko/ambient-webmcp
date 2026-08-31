# Agent entry point

Read this first. It is deliberately short — it routes you, it does not repeat the detail.

**Project:** Ambient, a WebMCP Challenge submission. **Hard deadline: 2026-09-03, 13:00 PDT.**
Several agents across several harnesses are building this in parallel over three days.

## Read these, in this order

| # | Document | Why |
|---|---|---|
| 1 | **`CONVENTIONS.md`** | Module style, reason codes, and the **cross-module interface signatures** other tickets are building against. Not optional — a wrong signature breaks another agent's work. |
| 2 | **`docs/ORCHESTRATION.md`** | The work graph: what blocks what, **who else is editing which files right now**, checkpoints, and cut triggers. |
| 3 | **Your ticket** in [Linear](https://linear.app/projects-and-hackathons/project/ambient-webmcp-b0715c844823) | Goal, requirements, test scenarios, definition of done, non-goals. |
| 4 | **`docs/plans/2026-08-31-001-feat-ambient-webmcp-tool-federation-plan.md`** | The authority on *what* to build. **Scan headings — do not read it end to end.** Read the Goal Capsule, then your unit and its cited R-IDs. |

**Also check whether `docs/spike-report.md` and `docs/skeleton-report.md` exist.** If they do, read them before writing code — they carry corrections to assumptions everything above was written under.

## Non-negotiable, regardless of what any ticket says

1. **No build step. No dependencies. No framework extraction.** Hand-authored ES modules served as static files; tests use `node --test`. The product's central claim is that a plain page becomes agent-operable by pasting script tags — a bundler in the consumer's path contradicts it. If you think you need a package, you have misunderstood the constraint.
2. **Never overclaim.** Ambient does **not** prevent prompt injection, does **not** do generic false-read-only detection, and **cannot** cancel an in-flight side effect. This binds identifiers and comments, not just prose. Do not name something `sanitize`, `prevent`, or `secure` when the mechanism is filtering or labeling.
3. **Never fail silently.** Every refusal carries a distinct reason code. Never truncate silently.
4. **The plan wins.** If your ticket contradicts the plan, surface it — do not guess, and do not resolve it by editing the plan.
5. **Do not merge your own PR.** Self-review your diff line by line, run `node --test test/`, paste the output into the PR description. No CI exists as of 2026-08-31; if one has been added it must be green first.
6. **Stay in your lane.** `docs/ORCHESTRATION.md` has a file-ownership table. Editing a path another ticket owns causes a merge conflict you will not see coming.

## One exception: the clean-room ticket

**If you are working PRO-17 (clean-room portability), you should not be in this repository at all.** That ticket measures whether `CONTRACT.md` is sufficient on its own. Work in a scratch directory outside this repo with only `CONTRACT.md` and the widget helper's public docs. Reading this file, the plan, or any `src/` code invalidates the result.
