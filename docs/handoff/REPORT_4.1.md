# REPORT 4.1 - shot places: build v31 (Opus `7ad929c`) and Fable's review

2026-09-28. Spec: `docs/SPEC_shot-places.md`. Built by Opus at high from
`af729df`; one run, 14:59 to 15:33 CDT, 31 min and 455k sub-agent tokens by
the harness count (n = 1). Filed by Fable from Opus's hand-back: the harness
refused Opus's own write of this file ("Subagents should return findings as
text, not write report files"). Sections 1 to 7 are Opus's findings; Section
8 is Fable's review.

## 1. What changed

| File | Change |
|---|---|
| `js/round/track-analysis.js` | `proposeHoleShots` rewritten to spec 4.2 and 4.3. Every stop carries `place` (`toHoleYd`, `lie`, `ground`, `onTee`, `onGreen`, `afterGreen`). `places` grouped own / other / off-map, each in time order. Preselection: the sequence with the most falls in distance to the hole, found exactly; dwell breaks ties. The last-stop rule, the green-range rule and the `holedOut` cup are removed. `PLACE_MIN_DWELL_S = 15`. |
| `js/ui/screen-play.js` | `openShotConfirm` rebuilt: fixed tee row, place rows, typed rows (BALL NOT HERE, ADD A SHOT), OTHER PLACES ON THIS HOLE. `applyHoleEntry` writes his tee mark or the map tee, the track places, the typed shots, and never a track cup. `lastMark` carries its own undo, has no 20 s timer and is shown inside the green sheet. SAVE HOLE's UNDO is that banner. The tee nudge is not raised on a course with a map. |
| `js/round/round.js` | `addMapTee` (`source: 'map'`, `method: 'map'`, or no mark). `rebuildCourseLearning` skips a `method: 'map'` tee. |
| `css/base.css` | Row buttons in the shots sheet 48 px tall, 15 px text ("BALL NOT HERE" wrapped to three lines at 360 px before). |
| `tools/detection-scoring.html` | A table comparing the v30 picker (copied verbatim from `af729df`) with the new preselection. |
| `test/run.js`, `test/index.html` | `runShotPlacesTests`: the ten spec tests. Two expectations updated, four tests retired (Section 2). |
| `js/data/build.js`, `sw.js` | v31 in both. `REVISION` untouched. |

## 2. Tests

- At `af729df`: 571/571. The ten new tests against the unchanged modules:
  571/581, the ten failing on their own behaviour. Final: **577/577**.
- Updated: the green flow's row 1 ends "(scorecard)"; its provenance reads
  `map, track, gps, manual`.
- Retired, because spec 4.3 and 5.1 replace the rules they assert: "the tee
  shot and the approach outrank sitting in the cart"; "the stop he holed out
  at is never offered as a full shot"; "the cup is taken from the retrieval,
  not from wherever the window ends"; "green stops come back rather than
  manufacture a shortfall".

## 3. The hole 12 trace (spec 6.1), done before any change

Round `r_b440472a`, recorder `events.csv` and `fixes.csv`, times CDT.

| Time | What happened |
|---|---|
| 11:59:42 | Screen on. |
| 12:00:09 | Hole 12's tee recovered with USE THE TRACK (`inferred: 'track'`). |
| 12:00:30 to 12:00:50 | Cart to the 13th tee. |
| 12:01:27.9 to 12:01:30.9 | Cup burst on hole 12, 4 samples. |
| 12:01:31 | Cup saved; `setCup` stamped `completedAt`; no putts entered. |
| 12:01:51 | Screen off. |

Reproduced on the v30 modules: the recovered tee made hole 12 "started", so
the next-hole arrow does not advance; `promptGreenEntry` opens "Hole 12 -
putts", whose first control is MARK CUP, primary. Tapping it runs a cup burst
on hole 12 from the 13th tee. `CUP_AT_TEE_M` stays silent (it measures from
hole 12's recovered tee). The "Cup marked here. UNDO" banner sat under the
sheet's scrim and the 20 s timer removed it. There is no tap log, so which
tap he made is `[inferred]`, n = 1.

In v31 the UNDO is in the green sheet, stays until the next mark, save or
hole change, and restores the cup and `completedAt`. The prompt's MARK CUP
button is unchanged: the spec does not touch it.

## 4. The spec's verify items

| Item | Answer |
|---|---|
| 3.3 `addShot` with `mark: null` | Accepted; a mark is built only when `reduced` is given. |
| 3.4 readers of `source` / `mark.method` | `lieUnanswered` asks only `'gps'` shots. `holeHasTrackShots` has no caller. The export writes rounds verbatim; import validates neither key. The strokes-gained input reads neither key and uses the position, as for a track shot. `rebuildCourseLearning` did learn any tee with a mark; it now skips `method: 'map'`. |
| 4.4 `distanceEntry` unit 'yards' | Accepted today (`PUTT_UNITS.yards`). A typed 140 yd is stored `distanceFt: 420`, `{ value: 140, unit: 'yards' }`. |
| 6.4 a cup alone never completes a hole | Holds: `isHoleComplete` is `greenEntry || manual`. `setCup` stamps `completedAt`; the cup's UNDO restores it. |

## 5. Scoring, `tools/detection-scoring.html`, the four labelled rounds

A pick counts when it lands within 10 m of his marked full shot. The old
picker takes every full shot from the track; the new rule takes shot 1 from
the map, so the like-for-like column is shots 2+. 2026-09-27 is not used.

| Round | Map | Holes | Old: all full shots | Old: shots 2+ | New: shots 2+ | Map tee within 10 m of his tee mark (median) |
|---|---|---|---|---|---|---|
| FT4 Radcliffe | no | 9 | 10/18 | 6/9 | 2/9 | - |
| FT5 Veenker back 9 | yes | 9 | 15/26 | 10/17 | 9/17 | 5/9 (9.3 m) |
| FT6 Veenker 14-18 | yes | 5 | 16/18 | 12/13 | 10/13 | 2/5 (10.9 m) |
| FT6 Veenker hole 1 | yes | 1 | 2/3 | 1/2 | 1/2 | 1/1 (8 m) |

**At Veenker the new rule scores lower: 20/32 (63%) on shots 2+ against
23/32 (72%) for the old picker (n = 32 shots, 15 holes, 3 rounds).**

| Cause of the 12 misses | Misses |
|---|---|
| The shot's stop reads as on a green polygon ("not onGreen") | 4 |
| The stop starts after he first stood on the green ("not afterGreen") | 3 |
| The stop is on another hole's ground while this hole's pool was full | 3 |
| A stop just outside the tee polygon took a slot | 2 |

Limits: these windows are bounded by his own marks, tighter than a pocketed
hole's window. Radcliffe has no map, so the new rule has no signal there.

## 6. Where the spec was silent (Opus's choices)

1. No-map course: every stop is "other", the preselection falls to dwell
   ties, shot 1 is the card yardage with no position.
2. The tee nudge is not raised on a map course.
3. Map tee accuracy is the box's centre-to-corner reach (17.1 m, hole 1
   gold); the shot list shows "from the map" instead of "poor fix".
4. Lists are in time order; `toHoleYd` orders only the preselection.
5. The falls start from the card yardage, or his tee mark's distance to the
   green centre.
6. A one-full-shot hole opens with just the tee row, even with no track.
7. NOT A SHOT is always offered; PLAYED TWICE beside it while short.
8. UNDO clears on a new mark, the green SAVE, the hand-entry SAVE, SAVE
   HOLE, the footer UNDO and a hole change.
9. A tee recovered from the track is not his mark; ENTER SCORE replaces it
   with the map tee.

## 7. Follow-ups noticed, not fixed

- The green-entry prompt still opens with MARK CUP as its first primary
  button: the hole 12 control.
- The lie row in the shots sheet overflows at 360 px ("Recovery" clipped);
  same call at v30.
- UNDO does not reverse `learnCup` / `learnTee`; the footer UNDO has the same
  gap.
- `roundTotals.gpsShots` counts map and track shots as GPS shots.
- Re-entering a hole saved before v31 keeps its old track cup.
- Edit mode has no map, so ENTER SCORE on a finished round saves shot 1 with
  no position.
- With no box for the tee set (hole 9, hole 16 blue) shot 1 has no position.

## 8. Fable's review (medium), 2026-09-28

| Check | Result |
|---|---|
| Diff against the spec | `track-analysis.js` and `round.js` read line by line; `screen-play.js` read on code lines. Matches Sections 3 to 6. No departure found. |
| Must-not-touch list (spec Section 9) | 9 files changed; none in `android/`, `js/analysis/`, `js/gps/`, `js/util/geo.js`, the data rails, the geometry, `docs/roundDownloads/`. `REVISION` untouched. `BUILD.id` and the cache both v31. |
| Suite | 577/577 at 360x728, Fable's run, n = 1. |
| Commit identity | `rusty9645@gmail.com`. |

**Verdict: built to spec - PASS. The preselection rule in the spec - NOT
GOOD ENOUGH, and that is the spec's fault, not the build's.**

- On the labelled rounds it picks 3 fewer shots than the picker it replaces
  (20/32 against 23/32, n = 32).
- Replayed on the 2026-09-27 track (not labelled, illustration only): hole 14
  offers a stop 377 yd from the green on a 397 yd hole as shot 2, and hole 1
  offers one at 402 yd on a 419 yd hole. Both are stops beside the tee. That
  is the fault he named: *"the proposed tee shots on those holes were
  stupid"*, moved from shot 1 to shot 2.
- What v31 does deliver regardless of the preselection: the tee from the
  scorecard, every stop reachable, no cup from the track, BALL NOT HERE, and
  UNDO that stays.

**Next:** spec revision 4.2 (`docs/SPEC_shot-places.md` Section 11), three
band-aware changes to the pool, built by Opus and scored the same way. v31 is
not installed on his phone.
