# REPORT 2.4 — Testing verdict on build v25 before it is played (Fable, 2026-09-15)

Item: `docs/handoff/FOR_FABLE.md` 2.4. Tree tested: `028993e` (clean, 22
commits ahead of the phone's `0ba7721` / v23). Effort high. His words on it:

> "fix the lie card and yes the conformation when in question is needed when I
> am entering the score at the end of the hole. Workflow on the green mark the
> cup or my ball first whatever is easiest. Hole out - record the putt length
> for short putts, double check GPS for long putts, enter hole score (once this
> is entered the app needs to compute the shots and ask me questions about the
> lie. Shot 2 rough or fairway, shot 3 green or fairway, etc..."

Only "fix the lie card" is in v25; the end-of-hole workflow is in
`docs/HANDOFF-native-build.md` for the native build and was not tested here.

## The answer, in plain words

**v25 passes. It can go on the phone for the walking 9, on your go.** The push
is yours, in Opus's chat.

The thing v24 got wrong is fixed: the moment a shot saves, all six lies (TEE /
FAIRWAY / ROUGH / SAND / RECOVERY / GREEN) are on screen without a scroll at
both phone sizes, every label fits its button, and the grid does not move at
all when the burst ends - measured with the previous mark's banner up, which is
what moved it 78 px before. The marks, the cup and the round save land in
storage exactly as tapped, the LOCK tab still sits above every sheet with
nothing under it, and the lock code is untouched by v25.

Two things to know, neither a defect:

1. **At 360 x 780 the six lies are what you see; the rest of the card is below
   the fold.** The "Captured · 4/4 fixes · ±5 ft" line starts 6 px above the
   body's bottom edge, and the club chips, CANCEL SHOT and LIE LATER need a
   scroll. Neither escape is needed: the footer's UNDO is CANCEL SHOT, and
   walking on and tapping MARK SHOT is LIE LATER. At 375 x 812 the fixes line
   is readable.
2. **A poor-fix warning shows AFTER the lie tap, not before.** The card sits
   above every banner now, so at burst end the "marked with poor accuracy -
   RE-MARK" banner is behind the card, 344 px below the fold. It surfaces the
   instant you tap a lie (or LIE LATER), stays until acted on, and RE-MARK
   works: it removes the poor mark, re-captures, and asks the lie again. Cost
   of seeing it late: one extra lie tap. The shot list row also says "poor
   fix". If you would rather see it before the lie tap, say so - it is a
   layout choice, not a bug.

**One check on the phone before you play** (the PC cannot measure your S26's
font or the page height Chrome gives it): open v25, MARK TEE SHOT, wait for
"Tee shot marked", then MARK SHOT 2. All six lie buttons should be fully on
screen above the action buttons without scrolling. There are 24 px to spare
at 360 x 780 on the PC; if your phone's page is more than 24 px shorter, the
SAND / RECOVERY / GREEN row will be cut. If it is, tell Opus the numbers and
v25 stays off the course.

## Verdict

**PASS for the course.**

| asked | result |
|---|---|
| lie card at burst end, 375x812 | PASS - grid 187-327, body bottom 382 (55 px spare), moved 0 px with the previous mark's banner up, 0 px label spill, rightmost button 272 vs strip 289 (n = 1 run) |
| lie card at burst end, 360x780 | PASS - grid 186-326, body bottom 350 (24 px spare), moved 0 px with the banner up, 0 px spill, rightmost 257 vs strip 274 (n = 1 run) |
| the marks | PASS - tee, shots 2-4 on holes 2 and 3, a poor mark and its RE-MARK, the cup; all in localStorage as tapped (n = 9 marks + 1 re-mark + 1 cup) |
| round save | PASS - gaps gate (5 items, all true), finish confirm, `status completed`, `activeRoundId null`, hole 3's 4 shots + cup intact, key present after a page load |
| banners hidden by the card | the hole-change banner and BACK: visible and first (155-199) in the one realistic case; the tee nudge: cannot coexist with a card by construction; the poor-fix warning: hidden until the lie tap, then first with RE-MARK at 207-251 (Section 4) |
| LOCK tab over every sheet | PASS - `js/ui/lock.js`, `js/ui/dom.js` and the sheet CSS are byte-identical to what 2.2 measured; spot-checked 5 sheets, 0 tappables under the tab |
| `zoneOf` | untouched since 2.2's review |
| suite | 511 / 511 twice; mutation 509 / 511, exactly the two movement tests |

## 1. What was read

`git diff 0a863a2..028993e` in full: `js/ui/screen-play.js` (the card first in
`paint()`, the lie field first in `captureCard()` and `pendingLieCard()`),
`css/base.css` (only the `.body > .capture` block: card padding 10/4, the
card's own column pinned `minmax(0, 1fr)`, `.field-required` 2 px / 6-2-8,
`.req-label` 13 px one line, lie labels 14 px at -0.02em),
`js/ui/screen-settings.js` (`{ columns: 1 }`), `test/run.js` (the movement
test; scrollbars hidden in the group's injected style), `js/data/build.js`,
`sw.js`, `CLAUDE.md`, `.claude/agents/fable.md`, the docs. Nothing else in
`js/` changed: `js/ui/lock.js`, `js/ui/dom.js`, `js/gps/*`, `js/data/*` are as
2.2 left them. Also read at HEAD: `paint()` lines 371-520 (banner order),
`saveLieLater`, `poorMarkWarning`, `goToHole`, `checkTeeNudge`,
`pendingLieShot`, `openHoleJump`, `js/dev/sim.js` (`__sim.setAccuracy`),
`js/gps/gps.js` lines 60-80 (the accuracy gate's fallback).

## 2. Suite (`http://localhost:8123/test/`, `tools/devserver.py 8123`)

Browser pane hidden for every run.

| run | tree | viewport | result |
|---|---|---|---|
| 1 | `028993e` | none (`window.innerHeight` 0) | **511 / 511** |
| 2 | mutation: `js/ui/screen-play.js` from `0a863a2` (v24 order) under the v25 CSS | none | **509 / 511** - exactly "at 375x812 the lie grid does not move when the burst ends" and "at 360x780 ...": "the lie grid moved -57 px when the burst ended" (both) |
| 3 | `028993e` restored (`git status` clean) | 375x812 emulated | **511 / 511** |

"The deliberate gesture unlocks" passed on runs 1 and 3. No test is RED on
purpose in this tree: the two acceptance tests from 2.2 (label fit, lie grid
above the fold) pass, and the new movement test is proven to bite (run 2).

## 3. What was clicked and read back (`?sim=1`, one tab)

Scripted clicks on the real buttons, rects and localStorage read back after
each step. `idleMs` raised to 600 s in the page (script clicks are not pointer
activity). Opus's live simulated round (hole 1, 12 shots) was continued on
holes 2-4 and then finished. Club tracking on (the default).

**360 x 780, hole 2.** Body 131-350 (219 px), footer from 350, LOCK tab
284-360 x 368-536. MARK TEE SHOT -> "Tee shot marked. UNDO" banner at 143-211.
MARK SHOT 2 with that banner up:

| | running card | saved-shot card |
|---|---|---|
| card | 143-683, right 262 | 143-682, right 262 |
| label | "Tap a lie to save", 162-180, one line | "Tap a lie to finish", one line |
| lie grid (6 buttons) | **186.2 - 326.2** | **186.2 - 326.2** (moved 0.0 px) |
| widest label spill | 0 px | 0 px |
| rightmost button | CANCEL at 257 (strip at 274) | LIE LATER at 257 |
| fixes line (`.cap-head`) | 344-386 | 344-386 |
| club grid | 438-614 | 438-614 |
| CANCEL SHOT / LIE LATER row | 622-671 | 622-671 |
| next thing in the body | tee banner at 695 | shot list at 694 |
| page taller than viewport | no (780 = 780) | no |

ROUGH -> stored `seq 2, lie rough, method burst, quality good, 4/4 fixes`,
card gone, "Shot 2 marked (Rough). UNDO" at 143-211.

**375 x 812, hole 3.** Body 132-382 (250 px), tab 299-375 x 387-555. MARK
SHOT 4 with "Shot 3 marked (Fairway). UNDO" up: grid **187.2 - 327.2** in both
cards (moved 0.0 px), spill 0, rightmost 272 (strip at 289), fixes line
345-387 ("Captured · 4/4 fixes · ±5 ft"), club grid and the cancel row below
the fold (623-672). ROUGH -> `seq 4, lie rough, burst, good`.

**Marks stored, all as tapped (n = 9 shots + 1 cup):** hole 2 `1:tee, 2:rough,
3:fairway`; hole 3 `1:tee, 2:rough, 3:fairway, 4:rough`, `cup.method burst,
5 fixes used` (via "Cup at the tee?" -> MARK CUP HERE, the sim being static);
hole 1 untouched (12 shots, two `lieInferred` from Opus's run).

**Round save (375 x 812):** the round menu -> Finish round -> "Missing data: 5
things are missing" (hole 1 lies for shots 2 and 4, no putts on holes 1-3 -
all true) -> SAVE WITH GAPS ANYWAY -> "Finish round? 15 holes were never
started" -> FINISH -> Round summary. localStorage: `status completed`,
`completedAt` set, `activeRoundId null`, `revision 4`, `simulated true`, every
shot and the cup as above. The lock disabled itself (`has-lock-tab` off).
After a page load the round's key is still there with hole 3's 4 shots and
cup. n = 1 round.

**LOCK tab over sheets (spot check; the sheet code is unchanged):** at 360,
"Hole 3 - putts" 75 tappables, 0 under the tab, `padding-right` 98 px, tab
z 70; at 375, "Cup at the tee?" (2), "Round" (13, rightmost level with the tab
277 vs tab 299), "Missing data" (7, 277), "Finish round?" (2): 0 under the tab
on each. n = 5 sheets.

**Settings mid-round at 360 (named in 2.2):** "Show scoring and distances" is
three rows, each 27-247 (tab at 284, 37 px clear); nothing on the Settings
screen (every button, input, select) ends past 284; page 780 = viewport.

## 4. What the card hides (question 2)

The card is first in the body and runs to 682-685 px at both sizes, so
everything after it - every banner, the tally, the shot list - is below the
fold while a card is up. What that means for each banner he might need at
burst end:

- **Hole-change banner and BACK.** The card is per hole (`pendingLieShot` and
  the capture are drawn on the hole being viewed), so the realistic case is
  the arrow tapped with a lie pending: from hole 3 with shot 2's lie pending,
  the "2" arrow -> hole 2 shows "Moved to hole 2. BACK TO 3" first, BACK at
  155-199, no card; BACK -> hole 3 with the same pending card at 186-326 and
  the shot still `2:fairway?` (lie asked again). ROUGH -> `2:rough`. The
  pending lie survives the round trip. The one case where the card covers the
  banner is an arrow tapped DURING a 3 s burst: on the new hole the running
  card is first and BACK is at 707-751, 357 px below the fold, and when the
  burst ends the shot saves on the hole being viewed (hole 2, `4:fairway?`,
  hole 3 unchanged). That is pre-existing - `goToHole` has never touched a
  running capture, in v24 or v23 - and is his item 3 (mislogs, phantom
  touches), not v25. CANCEL SHOT removed it; both holes intact.
- **Missing-tee nudge.** Cannot share the screen with a card: `checkTeeNudge`
  returns while a capture runs; a pending-lie card needs a marked shot after
  the tee, and the nudge needs no tee shot on the hole. Reasoned from the code
  at HEAD, not measured (the sim is static). The only way to make both is
  UNDO on the tee while shot 2's lie is pending - not tested.
- **Poor-fix warning.** Measured with `__sim.setAccuracy(10)` (gate 8 m) on
  shot 3, hole 2: at burst end the card is up and the "poor accuracy -
  RE-MARK" banner is at 694-865, 344 px below the fold. FAIRWAY -> the card
  goes, the banner is second (221-392, RE-MARK at 207-251, above the fold at
  350) under "Shot 3 marked (Fairway)", the shot list row says "poor fix",
  stored `quality poor, ±5.8 m`. RE-MARK (accuracy back to 3 m) -> the shot
  removed, a new burst, the pending card again -> FAIRWAY -> `3:fairway, good,
  5/5 fixes`. `markWarning` has no timer, so nothing is lost; it is seen one
  tap later than in v24, and in v24 its arrival was what moved the grid.

## 5. Anything in v25 that weakens what 2.2 passed (question 3)

- **The LOCK tab over every sheet:** `js/ui/lock.js`, `js/ui/dom.js`, the
  `.sheet` / `.scrim` / `.lock-tab` / `.lock-screen` CSS - not in the diff.
  The 2.2 numbers (11 sheet kinds + 3 confirms, 22 px clearance) stand; five
  re-measured above.
- **The marks and the round save:** `js/round/*`, `js/data/*`, `js/gps/*` not
  in the diff; re-driven above, all as tapped.
- **`zoneOf`:** not in the diff.
- **The strip (2.2's Section 6):** the card's own column is pinned now as
  well as the lie and club grids; rightmost buttons 257 / 272 against strips
  274 / 289. Opus's mutation note (the v24 label under v25 styles took CANCEL
  SHOT into the strip before the column was pinned) was not re-run; the pin
  is in the CSS and the four strip tests pass.
- **The label held to one line with `overflow: hidden`:** at 360 the label
  is 21-253 for "Tap a lie to finish" - 13 px, nowhere near clipping. A
  longer label in a future build would be clipped silently; the suite does not
  check that. Noted, not a defect.

## 6. Decisions made alone

1. **Verdict PASS with the poor-fix warning behind the card.** The warning
   is not lost (no timer), RE-MARK works from where it lands, and the
   alternative - a banner above the card - is exactly what moved the grid
   78 px in v24. Whether he wants the warning before the lie tap is his
   preference; it is offered in the answer, not decided.
2. **The arrow-during-a-burst mislog is not held against v25.** Pre-existing
   (`goToHole` never touched a capture), a 3 s window, and his item 3 by name.
   Named here with the numbers so it is on record.
3. **The tee nudge was reasoned from the code, not driven.** It needs walking
   past 35% of the hole with no tee shot, and the pending card needs a tee
   shot; the sim is static. One-line proof in Section 4.
4. **Continued Opus's live simulated round rather than starting a new one**
   (holes 2-4 unused; the card is first in the body so the shot count above
   it is irrelevant), then finished it for the save test. Sim rounds are
   stamped `simulated: true`.
5. **No code or CSS changed.** Nothing failed; nothing to fix. No `BUILD.id`
   bump (v25 is correct and matches `gt-shell-v25`).
6. **`idleMs` raised to 600 s in the sim page for the measurements**, as in
   2.2. Page-local, nothing stored.
7. **Mutation re-run once, not Opus's second one.** The movement test is the
   new test; it is proven to bite. The column-pin mutation is a CSS property
   whose absence the four existing strip tests would catch.

## 7. For Matt to decide

Nothing on this item beyond the push. One preference, not blocking: whether a
poor-fix warning should show before the lie tap (it shows right after it now).