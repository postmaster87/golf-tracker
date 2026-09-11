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

### 2.1 Build v23 - shot wording, the cup from anywhere, LOCK never loses a mark (2026-09-11) - OPEN

**His words, verbatim:**

> "Okay lets add the ability to mark the cup on any screen i had multiple times where my ball is on the fringe of near the green and I have gone behind the hole to read the line and wanted to mark but couldn't. I need the ability to use the app lock screen as soon as marking the cup or a shot but still have it log the shot there was an issue before of me hitting the lock button before a shot was fully logged and it missed. I am not sure that got fix but if not fix it. Then the most confusing thing it says mark tee shot, mark shot 1 landing, mark shot...  It should be Mark Tee shot at the tee location, Mark shot 2 from where I hit shot 2 which is exactly where the last shot finished, then mark shot 3, then mark shot 4. log a 1 putt and I am done with the hole. If there is a penalty I will log it when it occurs and the score is adjusted after holing out on that hole. any questions on these?"

After five questions went back to him:

> "Go ahead build and push it. I need to get ready"

**Decisions he already made:** build it and push it. The five questions were
not answered; the options taken are listed in `docs/REVISIONS.md`, section
"The button says the shot, the cup from anywhere, LOCK never loses a mark —
build v23".

**What changed (Opus):** `js/ui/screen-play.js` (labels, `saveLieLater`,
`paintPendingLie`, `answerLie`, `saveCup` + `CUP_AT_TEE_M`, cup visibility,
gaps-gate routing for kind `lie`), `js/round/round.js` (`addShotLieLater`,
`lieUnanswered`, `setShotLie`, `roundGaps` kind `lie`), `js/app.js` (`canLock`
waits only on `.capture[data-burst="running"]`), build v23 in
`js/data/build.js` + `sw.js`. No file of yours was edited.

**Evidence:** suite 493/493 at `http://localhost:8123/test/` on 2026-09-11 (13
new tests in "marks name the shot, and LOCK never loses one"); the intermittent
"the deliberate gesture unlocks" passed on that run. Mutation check: with the
burst-end save reverted to the old `maybeCommit()`, the LOCK tests fail (result
in the commit message).

**Asked of Fable:**
1. Testing verdict before it is played: the lock, the marks, round save (the
   gaps gate now has a third kind, `lie`). Anything that can lose a mark or
   save a wrong one.
2. Critical review of one data-shape claim. A GPS shot saved before its lie is
   tapped is stored `lie: 'fairway', lieInferred: true` - the pair
   `addTrackShot` already writes for "don't remember". Opus's claim: no new
   field, no new value, so not a data model / schema revision and not xhigh.
   If you judge otherwise, BLOCKED with the reason - it then needs his "xhigh".

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

*(none yet)*
