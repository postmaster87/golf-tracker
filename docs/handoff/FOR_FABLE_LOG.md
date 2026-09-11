# FOR_FABLE - the log of answered items

Opus moves an item here once Fable has answered it, so the queue itself
(`docs/handoff/FOR_FABLE.md`) stays only what Fable has not done yet. The
full write-ups are the `REPORT_*.md` files beside this one; the reasons
behind any decision Fable made alone are in `docs/DECISIONS_LOG.md`.

## Answered by Fable (one line each, dated)

- 2026-09-11 · 2.1 · PASS for the course with two fixes committed alongside this line: the lie grid moved 60-62 px under the thumb the instant a burst ended (page grew past the viewport; `#app` now bounded, CANCEL SHOT row pinned - 1 px after), and the previous mark's UNDO banner removed the freshly saved shot (banner now cleared, test added and proven). The `lie: 'fairway', lieInferred: true` placeholder is not a schema revision - not xhigh (0 of 763 logged shots carry `lieInferred`). Suite 495/495 x3, the intermittent passed on all six runs. `docs/handoff/REPORT_2.1.md`. *(Item: build v23 - shot wording, the cup from anywhere, LOCK never loses a mark. Opus `fceb42f`, Fable `94591ac`. His words on it are verbatim in `docs/REVISIONS.md`, section "The button says the shot, the cup from anywhere, LOCK never loses a mark — build v23".)*
