# FOR_FABLE - the only way work reaches Fable (Matt, 2026-09-10)

Opus is the only writer. Fable is a subagent Opus spawns per item
(`.claude/agents/fable.md`; `fable-xhigh.md` only on Matt's "xhigh"), one
item per spawn, and Opus makes no writes to the repo until Fable returns.
Empty queue = Fable is not needed. The rule is the repo's `CLAUDE.md`.
Answered items move to `docs/handoff/FOR_FABLE_LOG.md`; their write-ups are
the `REPORT_*.md` files beside this one.

An item carries: Matt's words on it VERBATIM, the evidence (file:line, the
numbers with n, what was tried), and any decision he already made. The
spawn prompt repeats the item number, his words and the commit hash.

## 1. Critical review and requests for what is Fable's (a data model or schema change; the GPS pipeline; the strokes-gained engine or a benchmark; the export format; a migration of logged rounds; a golf/Matt call Opus cannot list)

*(empty)*

## 2. Testing of a risky build (a build about to be played; anything touching the lock, the marks, the track, the hole windows or round save)

### 2.2 Build v24 - the footer stops moving, the lock is reachable everywhere (2026-09-13) - OPEN

**His words, verbatim:**

> "Go ahead and I'll take your recommendations. We need the lock button bigger and available at all times"

The recommendations he took: the action stack never disappears; an unanswered
lie becomes a card in the body rather than a takeover of the footer; the body
scrolls to the top when that card appears.

**Field test 7 produced it**, in his words:

> "I hit a tree off the tee on hole 1 and thought I had marked the shot but I think you made selecting a lie required so I couldn't figure out why I couldn't mark my 3rd shot at the ball on 1 so I ended up deleting the shot marking twice"

> "Then I had to mess with marking the shot and the cup, trying to lock the phone because you cant lock it on the putting screen"

**What changed (Opus):** `js/ui/screen-play.js` (capture and lie move to the
body as `captureCard` / `pendingLieCard`, `paintActions` always runs, MARK SHOT
and MARK CUP inert only during a running burst, lie grid above club grid),
`css/base.css` (`.body > .capture` card, lock tab 76x168 at z-index 70,
`has-lock-tab` reserves the strip on `.sheet` too, `.cap-row` re-scoped),
`js/ui/lock.js` (`zoneOf` measures the overlay, not `window.innerHeight`),
build v24 in `js/data/build.js` + `sw.js`, tests in `test/run.js` +
`test/index.html`. No file of yours was edited.

**Evidence:** 501/501 at `http://localhost:8123/test/`, three runs, with the
browser pane HIDDEN. Six new tests (2 in the mark-flow group, 4 in "the lock tab
is reachable everywhere"). Mutation check: restoring the footer takeover fails
exactly the two new action-stack tests. On the simulator at 375x812: during a
burst the card is in the body and MARK SHOT is present and disabled; after it,
the lie box is fully visible (top 267, bottom 407 of an 812 px viewport) with
MARK SHOT 4 live below; on an open sheet the content ends at x=277 and the tab
starts at x=299.

**Also in here, and worth your eye:** the "known intermittent" pocket-lock test
is diagnosed and fixed. `zoneOf` used `window.innerHeight`, which is 0 in a
hidden pane, so the dead band covered the screen and the unlock gesture could
not be performed. It was never intermittent - it tracked whether anyone was
looking at the pane. Reports from here on should stop carrying that caveat.

**Asked of Fable:**
1. Testing verdict before it is played: the lock (now above sheets - check that
   nothing tappable hides under the tab on EVERY sheet, not just the two I
   measured), the marks, and round save.
2. Critical review of the `zoneOf` change, since it touches the pocket-lock
   gesture that guards against the phone being sat on. The dead band, the zone
   split and every rejection path are unchanged; only the height source moved.
   If you judge it weakens the guard, BLOCKED with the reason.

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

*(none - 2.1 moved to FOR_FABLE_LOG.md on 2026-09-11)*
