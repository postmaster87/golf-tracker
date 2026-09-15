# REPORT 2.2 — Testing verdict on build v24 before it is played (Fable, 2026-09-14)

Item: `docs/handoff/FOR_FABLE.md` 2.2. Tree tested: `0971d7b` (clean, 19
commits ahead of the phone's `0ba7721` / v23). Effort high. His words on it:

> "Go ahead and I'll take your recommendations. We need the lock button bigger
> and available at all times"

> "I hit a tree off the tee on hole 1 and thought I had marked the shot but I
> think you made selecting a lie required so I couldn't figure out why I
> couldn't mark my 3rd shot at the ball on 1 so I ended up deleting the shot
> marking twice"

> "Then I had to mess with marking the shot and the cup, trying to lock the
> phone because you cant lock it on the putting screen"

## The answer, in plain words

**Do not put v24 on the phone yet. Keep playing v23.**

The lock is right: the LOCK tab is on screen over every sheet, including the
putting sheet, nothing tappable sits under it on any sheet, and the change to
the unlock gesture does not weaken the pocket guard. The marks and the round
save are right: every shot, the cup and the finished round landed in storage
exactly as tapped, locked or not.

What is wrong is the lie question. In v24 it moved from the footer into a card
at the top of the screen, above the action buttons that never change. On a
phone the size of yours (360 x 780) that card does not fit: at the moment a
shot is saved, the first row of lies (TEE / FAIRWAY / ROUGH) is 39 px below the
bottom of the scrolling area and the second row (SAND / RECOVERY / GREEN) is
off screen entirely. You would have to scroll to answer the lie - the same
"required thing I cannot find" that cost you two deleted marks on hole 1.
In v23 the lie panel was always fully on screen.

I fixed one thing myself: the card was also 30 px too wide (its grids grew
past the body), so the club chips "5" and "PW" sat under the LOCK tab at 375
px and the whole right-hand column at 360 px - a thumb going for a lie or a
club would have locked the phone. That is committed with four tests. The fit
above the fold is Opus's screen to rework; two tests that say exactly what
must be true are left RED in the suite as the bar, with the numbers below.

## Verdict

**FAIL for the course, on one defect: the lie grid is below the fold at burst
end at a phone's height.** Everything else asked passes:

| asked | result |
|---|---|
| lock tab above every sheet, nothing tappable under it | PASS - 11 sheet kinds + 3 confirm sheets at 375 x 812 and 8 at 360 x 780, 22 px clearance on every one, 0 buttons under the tab |
| the marks | PASS - tee, shots 2-5, cup under LOCK; all in localStorage as tapped |
| round save | PASS - gaps gate, finish confirm, status `completed`, 5 shots + cup intact, key present after a page load |
| `zoneOf` review | PASS - does not weaken the guard (Section 5) |
| "known intermittent" diagnosis | CONFIRMED (Section 4) - the caveat is dropped from `CLAUDE.md` and `.claude/agents/fable.md` |
| nothing tappable under the tab on the play screen | FAILED in v24 as delivered, FIXED here (Section 6) |
| lie grid on screen at burst end | FAILED, open for Opus (Section 7) |

## 1. What was read

`git show 84da7f4` in full (`js/ui/lock.js`, `css/base.css`,
`js/ui/screen-play.js`, `sw.js`, `js/data/build.js`, `test/run.js`,
`test/index.html`, the v24 section of `docs/REVISIONS.md`);
`git diff --stat 84da7f4..0971d7b -- js css sw.js test index.html` = only
`js/data/courses.js` (the hole 7/10 yardages) and the matching test - nothing
else in the web app moved after v24. `js/ui/lock.js` at HEAD in full;
`js/ui/dom.js` (`sheet`, `confirmSheet`, `toast`); the thirteen `sheet(`
callers in `js/ui/screen-play.js` and `js/ui/screen-history.js`; the sheet,
scrim, lock-tab, lock-screen and toast rules in `css/base.css`; `js/app.js`
lines 151-193 (`idleMs`, `canLock`, activity wiring).

## 2. Suite (`http://localhost:8123/test/`, `tools/devserver.py 8123`)

Browser pane HIDDEN for every run (`document.visibilityState` "hidden").

| run | tree | result |
|---|---|---|
| 1, 2, 3 | `0971d7b` untouched, no viewport emulation (`window.innerHeight` 0) | **501 / 501** each; "the deliberate gesture unlocks" passed all three |
| 4 | mutation: `zoneOf` back to `window.innerHeight`, no emulation | **500 / 501** - exactly "the deliberate gesture unlocks": `unlocked: expected false, got true` |
| 5 | new strip tests, CSS fix NOT applied (375 only; the 360 case had a harness fault, fixed) | **501 / 505** - all four strip tests fail: `"CANCEL" ends at 306 px, strip starts at 289` |
| 6 | strip tests + CSS fix | **505 / 505** |
| 7 | strip tests, CSS fix stashed out again (proof at both widths) | **501 / 505** - `"CANCEL" ends at 307 px, strip starts at 289` (375) and `... starts at 274` (360) |
| 8, 9, 10 | final tree (this commit) | **505 / 509** each - the four RED are the acceptance tests of Section 7, named below |

The four RED on the final tree, on purpose (the label numbers move by 1 px
between runs with the emulated size):

- `at 375 px every label in the lie card fits its button` - "RECOVERY" is 5-6 px wider than its button
- `at 375x812 the whole lie grid is above the footer when the burst ends` - lowest lie button ends at 428 px, the body at 382 px (46 px below the fold)
- `at 360 px every label in the lie card fits its button` - "RECOVERY" is 10-11 px wider than its button
- `at 360x780 the whole lie grid is above the footer when the burst ends` - lowest lie button ends at 428 px, the body at 350 px (78 px below the fold)

"The deliberate gesture unlocks" passed on all nine non-mutation runs.

## 3. What was clicked and read back (`?sim=1`, one tab)

375 x 812 unless stated; club tracking on (the default). Scripted clicks on
the real buttons, DOM and localStorage read back after each step. Every sheet
was measured with the round live and unlocked: the tab's rect, every
`button / input / select / [role=button] / .seg-btn / .list-row` in the sheet,
the right-most one level with the tab, any element whose rect intersects the
tab's, and `elementFromPoint` across the tab's face on an 8 px lattice.

**Sheets at 375 x 812 (n = 11 kinds + 3 confirm sheets):** Hole 1 - putts (75
tappables), Hole 1 - yardages (8), Penalty (9), Shot 2 editor (21), Go to hole
(19), Round menu (13), Hole 1 - hand entry (9), Hole 1 - how did it go? (28),
Hole 1 - confirm your shots (4), Missing data (3), plus the confirm sheets
Abandon round? (2), Finish round? (2) and Cup at the tee? (2). Every one:
`padding-right` 98 px, right-most button ends at x = 277, tab starts at
x = 299, **22 px clearance, 0 under the tab**. `elementFromPoint` on the tab's
face: 208 of 210 lattice points hit the tab; the 2 misses are the rounded
corners at (301, 389) and (301, 549) and land on `.footer`, which is not
tappable. Not opened: Starting hole (needs learned tees to fire; same `.sheet`
rule, so the same padding) and the history sheet (no round is live there, so
there is no tab). The Shot 2 editor offers no distance button off a par 3, so
the distance sheet was not reached (it is a `sheet()` like the rest).

**Sheets at 360 x 780 (n = 8):** putts, yardages, Penalty, Go to hole, Round,
hand entry, how did it go?, Shot 2 editor - right-most button at x = 262, tab
at x = 284, 22 px clearance, 0 under.

**Toast:** fixed at the bottom, 730-798 px, right edge 363; tab ends at 555.
No overlap at any height a phone has; `z-index` 60 under the tab's 70.

**Settings screen mid-round (the tab is on every screen):** the "Show scoring
and distances" segmented control (NEVER / TOURNAMENT / ALWAYS) is 236 px wide
in a 250 px field, but its columns are content-sized: "ALWAYS" ends at
x = 331, and scrolled level with the tab it is **32 px under it**. Same root
cause as Section 6, pre-dates v24 (the v23 strip was 16 px narrower, so it
was under by 16 then). Off the course path; handed to Opus, not fixed - it is
his screen and the fix is a layout choice (`columns` on `segmented`, or a
shorter label).

**Marks.** MARK TEE SHOT (card `data-burst="running"` in the body, footer
"MARK TEE SHOT [disabled]", the other five buttons live) -> "Tee shot marked.",
stored `seq 1, lie tee, method burst`. MARK SHOT 2 -> card `done` in the body
with lie grid, club grid, CANCEL SHOT / LIE LATER; footer "MARK SHOT 3"
enabled; stored `seq 2, lie fairway, lieInferred true`; ROUGH -> `lie rough`,
no `lieInferred`, card gone. Shots 3-5 the same way (GREEN on shot 4 opened
the putts sheet on its own, as coded). MARK CUP with LOCK at 0.4 s: burst
ended under the overlay; the sim is static, so "Cup at the tee?" was waiting
under the lock (`.scrim` z 50, `.lock-screen` z 200), `cup` not yet stored;
unlock -> MARK CUP HERE -> `cup.method burst, 5 fixes used`, footer
"RE-MARK CUP", putts sheet reopened.

**Auto-lock.** It fired on its own 30 s into the first session: scripted
`.click()` calls are not pointer activity, so the idle timer ran out with the
sheets open - the app doing what it is meant to. (A script click passes
through the overlay; a finger cannot.) For the rest of the measurements
`idleMs` was raised to 600 s through `configure()`, in the page only.

**Round save.** Round menu -> Finish round -> "Missing data: 2 things are
missing ... Hole 1: lie for shot 3 not chosen / Hole 1: no putts entered"
(both true: LIE LATER on shot 3, and my script hit the putts sheet's GPS
button instead of SAVE) -> SAVE WITH GAPS ANYWAY -> "Finish round? 17 holes
were never started" -> FINISH -> summary. localStorage: `status completed`,
`completedAt` set, `activeRoundId null`, `revision 4`, `simulated true`,
hole 1: 5 shots with their lies as tapped, `cup` present. The lock disabled
itself and the tab left with it (`has-lock-tab` off). On the next page load
the round's key was still there (64 `gt:round:` keys in this dev browser).
n = 1 round, 1 hole, 5 shots, 1 cup.

## 4. The "known intermittent" - confirmed, and why it looked intermittent

With the pane hidden and no viewport emulation on the tab, the test page
reports `window.innerHeight` **0** (read directly, three runs). With `zoneOf`
measuring `window.innerHeight` the "top" test is `y < 0` - never true - so
every tap reads as "bottom" and step 1 can never be taken: "the deliberate
gesture unlocks" fails every time (run 4, the mutation). With `zoneOf`
measuring the overlay it passes every time (runs 1-3, 6, 8-10). Deterministic
both ways, n = 10 runs.

The extra piece Opus did not have: **with a viewport emulation set on the tab
(375 x 812, 360 x 780), a hidden pane reports the emulated height**, not 0
(read on runs 5-10). So the old test passed whenever the session had an
emulated size on the tab and failed whenever it did not - which is why it
came and went between sessions and reports. Caveat dropped from `CLAUDE.md`
Section 4 and `.claude/agents/fable.md`.

## 5. `zoneOf` - critical review

The whole code change in `js/ui/lock.js` is one line (`git show 84da7f4 --
js/ui/lock.js`):

```
const h = el.getBoundingClientRect().height || window.innerHeight;
```

- **Same number in production.** `.lock-screen` is `position: fixed; inset: 0`
  (`css/base.css`), so its height IS the viewport the tap's `clientY` is
  measured in. When the two ever differ (browser chrome, an on-screen
  keyboard), the overlay is the honest one: the taps are read off it.
- **Fallback is the old behaviour.** `|| window.innerHeight` only when the
  overlay measures 0, which is exactly what pre-v24 used.
- **Dead band, split, rejections untouched.** `TIMING.deadBand` 0.14, top is
  `y < h * 0.43`, bottom is `y > h * 0.57`; one contact at a time, tap <= 350 ms
  and <= 24 px, top then bottom, both inside 1200 ms, every rejection resets to
  step 1 - all read in the function at HEAD, none in the diff.
- **Failure directions.** If `h` were ever smaller than the screen the bottom
  zone grows, but the first tap must still be a crisp single contact in the top
  43% - no single contact unlocks. If `h` were larger, the bottom zone shrinks
  or leaves the screen and unlocking gets harder, never easier. The one nit:
  `y` is not offset by the overlay's `top`; correct because `inset: 0` pins it
  to 0, and worth a line if the overlay ever moves.

**Verdict: it does not weaken the pocket guard.** Approved.

## 6. Defect 1 - the card grew into the lock strip (fixed here)

The lie card is a grid inside `.body`, whose `padding-right` reserves the tab's
strip (`12 + 86 = 98 px`), so the body's content ends at x = 277 (375) /
262 (360) and the tab starts at 299 / 284. But a grid column is
`minmax(auto, 1fr)`: labels wider than their share widen the column and the
card grew to its contents - **x = 307 at both widths**.

| width | v24 as delivered | after the fix |
|---|---|---|
| 375 x 812 | card right 307; lie grid right 292; club chips "5" and "PW" right 305 = **6 px under the tab**; `elementFromPoint` there returns the tab | card right 277; right-most button 271 (CANCEL / LIE LATER); 0 under |
| 360 x 780 | card right 307 vs tab at 284 = **23 px under**: GREEN, LIE LATER, CANCEL and the right club column | card right 262; right-most button 255; 0 under |

The tab is on top (z 70), so the consequence was an accidental LOCK on a lie or
club tap - the shot is saved by then, so a lock and an unlock, not data. Still
the rule the tab sits above the sheets on.

**Fix** (`css/base.css`, the `.body > .capture` block): `min-width: 0;
max-width: 100%` on the card, `repeat(3, minmax(0, 1fr))` on the lie grid,
`repeat(5, minmax(0, 1fr))` on the club grid, card side padding 12 -> 6 px,
lie labels 16 -> 14 px with no tracking, club chips `padding-inline: 2px`. The
columns are pinned by construction now, whatever the labels measure. Three
lie columns kept (two would put RECOVERY and GREEN in a third row, 74 px
lower).

**Tests** (`test/run.js`, group "the capture card stays out of the lock
strip", 4 of its 8): the real play screen mounted at 375 x 812 and 360 x 780
with the real CSS, driven to the running card and the pending-lie card, every
button's right edge <= width - gutter, and nothing past the card's own edge.
Proven to bite: 4 / 4 fail with the fix stashed out (run 7).

## 7. Defect 2 - the lie grid is below the fold at burst end (open, Opus)

`.body` is the only scroller; the footer is a constant 430 px at 375 x 812
and 465 px at 360 x 780 (hint + MARK SHOT 88 + three 60 px buttons + the
PENALTY / UNDO row + gaps). Above it: hud 61 + hole nav 70. So the body's
visible box is 131-382 (251 px) at 375 x 812 and 131-315 (184 px) at 360 x
780. The card, top to bottom: head 156-198 (two lines now that the card is
its true width), bar 206-216, the boxed required field from 224 with its label,
then the lie grid **288-428** (two rows of 66), then the club grid to 653, then
CANCEL SHOT / LIE LATER to 710.

| size | lie row 1 | lie row 2 (SAND / RECOVERY / GREEN) |
|---|---|---|
| 375 x 812, v24 as delivered | fully visible | 26 px below the fold (40 of 66 visible) |
| 375 x 812, after Section 6 | fully visible | 46 px below the fold |
| 360 x 780 | **39 px below the fold** (27 of 66 visible) | **entirely off screen** |

Opus's "the lie box is fully visible (top 267, bottom 407 of an 812 px
viewport)" measured against the viewport, not the body's bottom edge (382).
In v23 the lie panel took the footer over and was always fully on screen;
v24 trades that for a footer that never changes, which he asked for - but the
two do not both fit in 184 px, and RECOVERY does not fit a 64 px column at
any readable size either (the field box's 12 px padding and 3 px border and
the card's padding take 36 px of the row).

This is his screen and what is on it at burst end is a course call, so it is
not fixed here. The bar is in the suite, layout-agnostic: every label fits its
button, and the lowest lie button ends above `.body`'s bottom edge at burst
end, at 375 x 812 and 360 x 780, club tracking on. Things that would move the
numbers, for Opus to weigh: the lie grid first in the card with the head and
bar under it (about 66 px); the required-field box's padding (24 px of width,
30 px of height); the club grid behind a single CLUB toggle (202 px of
height, and it is optional); lie buttons 66 -> 56 px (20 px). The 30 px of
body padding and the 465 px footer are the rest of the budget.

## 8. Decisions made alone

1. **Fixed the strip overflow in `css/base.css` myself.** It is a design-rule
   violation on the course path (a lie tap locking the phone), the fix is
   pinning grid columns, and a BLOCKED for it would have cost a spawn for a
   question with one answer. Logged.
2. **Three lie columns at 14 px, not two at 16 px.** Two columns fit the
   labels but put the third row 74 px lower on a card that is already below
   the fold. Both fail the fold; three columns fail it less.
3. **Left the fold to Opus and committed its acceptance tests RED.** What he
   sees at burst end on the course is his call through Opus's chat, not
   mine; a test proven to fail against the defect is the standard here, and
   "fully visible" was claimed once already by reading the wrong edge.
4. **Did not fix the Settings segmented control** (32 px under the tab when
   scrolled level). Same cause, off the course path, a label/columns choice
   in Opus's screen. Named for him.
5. **No `BUILD.id` bump.** v24 has never been deployed; this CSS rides in it.
   The bump to v25 belongs with Opus's rework, when a build is actually about
   to ship.
6. **Raised `idleMs` to 600 s in the sim page for the measurements** after the
   30 s auto-lock fired under scripted clicks. Page-local, nothing stored.
7. **Dropped the intermittent caveat** from `CLAUDE.md` and
   `.claude/agents/fable.md`, as the item and my standing instructions say to
   once confirmed; replaced with the RED-on-purpose rule for the two fold
   tests.

## 9. For Matt to decide

Nothing on this item. v24 stays off the phone; the walking 9 this week goes
with v23 unless Opus's rework clears the two RED tests and it is tested again.
