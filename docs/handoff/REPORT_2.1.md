# REPORT 2.1 — Testing verdict on build v23 before it is played (Fable, 2026-09-11)

Item: `docs/handoff/FOR_FABLE.md` 2.1. Tree tested: `fceb42f` (clean, not
pushed). Effort high — Matt has not said "xhigh" for this item. His words are
in the item; the two that drove this test:

> "I need the ability to use the app lock screen as soon as marking the cup or
> a shot but still have it log the shot there was an issue before of me hitting
> the lock button before a shot was fully logged and it missed."

> "Go ahead build and push it. I need to get ready"

## Verdict

**PASS for the course, with two fixes committed in this commit.** Nothing in
v23 as delivered could lose a mark: the shot is in localStorage the instant its
burst ends, lie or no lie, locked or not. Two things could save a *wrong* one or
take back the wrong one, both found on the sim and both fixed here:

1. **The lie grid moved under the thumb at the moment the burst ended.** The
   exact hazard Opus designed the pending-lie panel to avoid, arriving from a
   different direction — not the panel, the shot list above it.
2. **The previous mark's "marked · UNDO" banner removed the freshly saved
   shot** while naming the shot before it.

The data-shape claim is reviewed below: not a schema revision, not xhigh.

## What was read

`git show fceb42f` in full (`js/round/round.js`, `js/ui/screen-play.js`,
`js/app.js`, `test/run.js`, `docs/REVISIONS.md` v23 section);
`js/data/schema.js` (`newShot`, `migrate`); `js/data/store.js`;
`js/ui/lock.js`; `css/base.css` layout rules; the eight export files under
`docs/roundDownloads/` (counts only, no coordinates read out).

## Suite (`http://localhost:8123/test/`, dev server `tools/devserver.py 8123`)

| run | tree | result |
|---|---|---|
| 1 | `fceb42f` untouched | **493 / 493** |
| 2 | burst-end save reverted to `maybeCommit()` (mutation) | **490 / 493** — exactly "LOCK straight after MARK SHOT still saves the shot", "it is saved without a lie, flagged, and the gaps gate asks for it", "once the burst is over the auto-lock is no longer held off". Opus's mutation claim reproduced. |
| 3 | new UNDO-banner test, fix NOT applied | **494 / 495** — the new test fails: `expected null, got "Shot 3 marked (Fairway)."` Proven to bite. |
| 4, 5, 6 | all fixes applied | **495 / 495** |

The known intermittent, "the deliberate gesture unlocks" (pocket-lock group),
**passed on all six runs**. Six passes are not evidence it is fixed.

## What was clicked and read back (`?sim=1`)

Viewport 375x812 unless stated; club tracking on (the default, and the taller
footer). Driven from the page with scripted clicks on the real buttons, reading
the DOM and localStorage back after each step.

**Gaps gate, kind `lie`.** Round menu → Finish round. Sheet read back:
"2 things are missing … Hole 1: lie for shot 2 not chosen ▸ / Hole 1: no putts
entered ▸ / SAVE WITH GAPS ANYWAY". Tapped the lie gap → shot editor "Shot 2"
opened on hole 1 → Rough. Shot list read "2 Rough"; gate no longer lists it.

**LOCK during the burst (his case).** MARK SHOT 3 → `pocketLock.lock()` at
0.3 s → burst ended under the overlay. Read back while still locked: shot list
"3 Lie?", panel head "Shot 3 saved · Captured · 4/4 fixes · ±6 ft", no
`.capture[data-burst="running"]`, `hl.shots.length` 3. Unlock → the panel is
there. **localStorage** read straight after a burst end, before any lie:
the new shot present as `lie: 'fairway', lieInferred: true, source: 'gps'`;
read again 32 s later (past the 30 s breadcrumb save): still present, 9
stored = 9 on screen.

**Hole change with a lie pending.** Jump to hole 2: no panel, no MARK CUP (no
shots), "MARK TEE SHOT". Jump back to 1: the panel returns for the same shot
("Shot 5 saved"). CANCEL SHOT → "Shot 5 removed.", list back to 4. LIE LATER →
actions with "MARK SHOT n+1", the shot stays "Lie?".

**Cup at the tee, under the lock.** Hole 2: MARK TEE SHOT, then MARK CUP from
the same spot, locked at 0.2 s. Burst ended: the confirm sheet "Cup at the
tee? That fix is 2 yd from where you teed off." was in the DOM under the
overlay (`.scrim` z 50, `.lock-screen` z 200). Unlock → Close → toast "Cup
not marked.", footer still "MARK CUP". Again → MARK CUP HERE → "RE-MARK CUP",
banner "Cup marked here.", hint "Cup marked. Putt out…". The putt sheet's MARK
CUP is enabled with no ball on the green (button list read back).

**Reload with an unanswered lie.** The pending panel does not return (it is
in-memory); the list reads "2 Lie?", the footer offers MARK SHOT 3, the gate
asks at the end. Left as is — see decisions.

**Cup control on the tee.** After the tee shot the footer is MARK SHOT 2 ·
ENTER PUTTS · ENTER YARDAGES · MARK CUP · PENALTY/UNDO — three controls between
the shot button and the cup, plus the 30 yd question.

## Defect 1 — the lie grid moved at burst end (fixed)

Measured on `fceb42f`, 375x812, club tracking on, lie-button rects during the
burst vs. the instant after it ended:

| transition | TEE top during → after | shift |
|---|---|---|
| shot list 2 → 3 rows (MARK SHOT 3) | 583 → 643 | **+60 px** |
| 3 → 4 rows (MARK SHOT 4) | 643 → 705 | **+62 px** |

Columns unchanged, so a thumb already descending on SAND landed on TEE,
RECOVERY on FAIRWAY, GREEN on ROUGH (52 of 66 px of overlap). At 4 rows the
CANCEL SHOT / LIE LATER row sat at y 874 on an 812 px viewport — off screen.
Cause: `#app { min-height: 100dvh }` let the page grow past the viewport once
the shot list plus the panel outran it, so the new "Lie?" row — which since v23
appears the instant the burst ends — pushed the whole footer down. Before v23
the row only appeared after the lie tap, so the shift was harmless. Every
screen already assumes the opposite (`.body { overflow-y: auto }`).

Fix: `#app { height: 100dvh }` (`css/base.css`), so `.body` absorbs its own
growth and the footer stays anchored. Re-measured: body-driven shift 0 px.
That exposed a second, smaller one: with the lock tab's strip on (unlocked —
the normal case), "CANCEL SHOT" wrapped to two lines, the row was 73 px
against CANCEL's 50, and the grid rose **22 px** (583 → 561). Fixed with
`.footer .cap-row .btn { white-space: nowrap; … }` on that row.

After both: lie-button shift at burst end **1 px** at 375x812 and **1 px** at
360x780 (n = 3 transitions measured after the fix, 2 viewports; the row
buttons no longer overflow at either width). `document.scrollHeight ==
innerHeight` on the play screen, Settings (4,244 px of content scrolls inside
`.body`), the Round card (2,326 px) and the summary. No screen lost its
scroll.

## Defect 2 — the stale UNDO banner (fixed)

Sequence on the sim: tap FAIRWAY for shot 4 → banner "Shot 4 marked
(Fairway). UNDO" (20 s life) → MARK SHOT 5 → burst ends, shot 5 saved and its
panel up, the banner still reads "Shot 4 marked (Fairway). UNDO". Tapped UNDO:
toast "Removed last shot." and the list read 1–4 — **shot 5 was removed under
shot 4's label.** Recoverable by RESTORE for 5 s, mislabelled regardless. Before
v23 the shot was not saved until the lie tap, so that banner's UNDO really did
take shot 4.

Fix: `clearLastMark()` in `saveLieLater` (`js/ui/screen-play.js`). The panel
is the saved shot's own statement and CANCEL SHOT is its undo. Test added in
the mark-flow group ("a shot saved for its lie clears the previous mark's UNDO
banner", plus "CANCEL SHOT takes back only the shot it is under"); the first
was run without the fix and failed on the exact banner text (run 3 above).

## The data-shape claim (asked, item 2)

**Not a schema revision; not xhigh.** Verified:

- `lieInferred` is a field `addTrackShot` has written since agenda item 2
  (`js/round/round.js:782`); `'fairway'` is an enumerated lie. `newShot` and
  `migrate()` are untouched; there is no version step to write.
- Export/import carries the whole round object, so the pair round-trips as it
  already does for a track shot.
- The strokes-gained engine (`js/analysis/*`) never reads `lieInferred`; a
  placeholder is scored as fairway, exactly as a "don't remember" track shot
  already is.
- **Logged data cannot be misread by `lieUnanswered`:** across the 8 export
  files in `docs/roundDownloads/`, 763 shots, **0** carry `lieInferred` on a
  `gps` shot and **0** on a `track` shot (the "don't remember" path has never
  been used). Nothing he has logged changes meaning.

One caveat, recorded so it is not rediscovered: `lieUnanswered` derives
"not asked yet" from the pair (`source: 'gps'`, `lieInferred`). That meaning
is not stored; it holds only while no other path writes `lieInferred` on a GPS
shot. The day one does (a "not sure" in the shot editor, say), this becomes a
schema item and goes to xhigh.

## Noted, not changed (outside the item, or pre-existing)

- `fir()` (`js/round/round.js:609`) counts a `'fairway'` placeholder as a
  fairway hit; `gir()` does not care. Pre-existing for "don't remember"; v23
  makes the placeholder reachable by SAVE WITH GAPS ANYWAY, which the gate
  names first. Opus's call whether FIR should read `lieInferred` as null.
- The summary screen does not badge `lieInferred` (pre-existing).
- **Two app tabs on one origin overwrite each other's round.** Opus's hidden
  `?sim=1` tab (tab-3) was still live; its breadcrumb writer
  (`js/app.js:236`, every ~30 s) rewrote the round with its own in-memory
  copy and erased my saves until it was closed. On the phone there is one
  WebAPK instance, so this is a dev hazard, but it is the first thing to
  suspect if a sim save "vanishes".
- Changing hole during the 3 s burst saves the mark on the hole arrived at
  (`commit` and `saveLieLater` both read `hole()` at burst end). Pre-existing
  since rev 0, 3 s window, not touched.
- The lock overlay's accuracy in metres — already queued by Opus.

## Decisions made alone (also in `docs/DECISIONS_LOG.md`)

1. Not xhigh — reasons above.
2. Bounded `#app` to the viewport: a global layout rule changed under a testing
   verdict, because the shift is a save-a-wrong-lie hazard that arrives with
   v23 and the fix restores what every screen already assumed.
3. Cleared the previous mark's banner when a shot is saved for its lie.
4. Reload does not restore the pending-lie panel: left as is. "Lie?" in the
   list, the gate at the end, and MARK SHOT n+1 on offer are enough; a panel
   that reappeared after a reload could come back on a hole he had walked on
   from.

## Files in this commit

`css/base.css`, `js/ui/screen-play.js`, `test/run.js`,
`docs/handoff/REPORT_2.1.md`, `docs/DECISIONS_LOG.md`,
`docs/handoff/FOR_FABLE.md` (Answered line only), `docs/REVISIONS.md` (one
paragraph under the v23 section). `BUILD.id` stays v23 — it has not been
deployed, so the shell cache name has nothing to move away from.
