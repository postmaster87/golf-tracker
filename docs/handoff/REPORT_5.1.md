# REPORT 5.1 - D1 Part A: where the hole is - build v33 (Opus `ccae4e3`) and Fable's review

2026-09-28. Spec: `docs/SPEC_hole-position.md` Sections 3 to 8. Built by Opus
at xhigh from `1692724`; one run, 16:03 to 16:35 CDT, 34 min and 486k
sub-agent tokens by the harness count (n = 1). Filed by Fable from Opus's
hand-back. Sections 1 to 7 are Opus's findings; Section 8 is Fable's review at
xhigh.

## 1. What changed

| File | Change |
|---|---|
| `js/round/hole-position.js` (new) | `HOLE_ON_GREEN_M` 15, `PIN_OFF_GREEN_M` 3, `PIN_SHEET_UNCERTAINTY_M` 4, `APPROACH_BACK_M` 137.16; `greenFrame`, `pinFromSheet`, `offOwnGreenM`, `resolveHolePosition`. Map order: cup (not track), pin sheet, ball on the green, green centre, with the filters and `skipped`. No map, or no green for the hole: the v32 order. Imports only `geo.js` and `polygon.js`. |
| `js/round/round.js` | `holePosition(hole, context)` returns what `resolveHolePosition` returns. New `holeContextFor`, `setPinSheet`, `clearPinSheet`. `shotGeometry`: a map tee reads `hole.yards`, source `scorecard`, `lengthM` null; a shot with no next mark ends at the hole only when the source is `cup`. |
| `js/analysis/strokes-gained.js` | `context` replaces `fallbackPos`; `contextFor` replaces `fallbackFor`; every shot carries `distanceUncertaintyYd`; the round result adds `sources` and `positionNotes`. Formula, categories and benchmarks untouched. |
| `js/analysis/trends.js` | Both call sites use `holeContextFor`. |
| `js/data/schema.js` | `newHole` gets `pinSheet: null` and its comment. Nothing else. |
| `js/ui/screen-summary.js` | The sources line, one line per position passed over, the 5.5 yd (n = 31) line; the drive card and the data quality card read the resolved position. |
| `js/ui/screen-play.js` | `shotRowHeading(row, i, { pin, yards })` with the source suffix; the shot list's second line; the map available in edit mode, the HUD still off there. |
| `sw.js`, `js/data/build.js` | v33; `hole-position.js` in the shell list. `REVISION` untouched. |
| `test/run.js` | The 13 tests; 6 existing tests updated, none retired. |

## 2. The spec's verify items

| Item | Answer |
|---|---|
| 3.4 no import cycle | 34 modules, 0 cycles. |
| 5 a round with `pinSheet` survives export then import | Yes, byte-identical, and resolves to the same pin (test 11). |

## 3. The 13 tests

All 13 fail against the modules at `1692724` (a throw-away harness, deleted).
Test 10 is a regression guard for a course with no map, its values computed
at `1692724`.

| # | What it proved |
|---|---|
| 1 | No cup: 3 off-green shots, all `map-green`, each equal to `toGreen().centreM` within 1e-9 yd |
| 2 | A cup 6 yd from the centre wins; `skipped` empty |
| 3 | A cup from the track on the green is not used; one `cup / from-track` entry; the stored cup is still there |
| 4 | A cup 85 m off its green is not used; the same cup 5 to 15 m off is used |
| 5 | 12 on, L 5, from the edge, 3 ft: 12 paces from the front along the line and 5 in from the left edge, within 0.2 m |
| 6 | C is halfway between the edges (0.05 m); centre R 4 is 4 paces right of the line |
| 7 | A pin sheet 5 paces deeper than the green falls to `map-green`, one `pin-sheet` entry, his numbers kept |
| 8 | Map tee on hole 15: 386 yd, `scorecard`, no length; a GPS tee unchanged |
| 9 | Map tee, two track shots, putt typed: the off-green sum is equal to 1e-9 with no pin, a front pin and a back pin; approach and short game each differ by more than 1e-3 |
| 10 | Radcliffe: positions to 1e-12, strokes gained to 1e-9, equal to `1692724` |
| 11 | A missing key resolves like null; `newHole` gives null; the export round trip |
| 12 | Hole 9's frame matches a hand construction to 0.01 m; see Section 6 item 1 |
| 13 | `sources` adds up to the 9 shots that are not putts; `positionNotes` names hole 1 |

Suite: 594/594 at 360x728 (580 before, plus 13, plus 1 offline-shell test for
the new module).

## 4. Before and after, every Veenker round in the phone's store

Read only; nothing written. 16 rounds, 9 score at least one hole. Scratch
baseline. "Before" is `1692724`.

| Round | Holes | Unattributed | Off tee | Approach | Short game | Putting | Total | Sources |
|---|---|---|---|---|---|---|---|---|
| 09-09 21:41 | 1 | 1 | -0.225 | -0.359 | -0.024 | 0.000 | -0.608 | cup 3, same |
| 09-09 22:09 | 5 | 2 | -0.461 | -2.603 | -0.708 | -0.009 | -3.781 | cup 17, same |
| 09-11 | 3 | 4 | +0.064 | -0.950 | -1.405 | +0.627 | -1.664 | cup 8, same |
| 09-14 | 9 | 2 | -1.657 | -1.980 | -1.199 | -0.063 | -4.898 | cup 23, same |
| 09-16 | 9 | 5 | -1.833 | -4.763 | +0.571 | +0.230 | -5.795 | cup 26, unknown 2, same |
| 09-23 | 3 | 2 | +0.977 | 0.000 | 0.000 | -0.504 | +0.473 | cup 2, same |
| 09-26 14:51 (abandoned) | 1 | 0 | -1.000 to -1.001 | 0.000 to +8.043 | +0.170 to 0.000 | -0.947 | -1.778 to +6.094 | cup 2 to map-green 2 |
| 09-26 17:48 | 1 | 0 | -0.583 | -2.788 | +1.727 | 0.000 | -1.644 | cup 6, same |
| 09-27 | 8 | 9 to 7 | -3.700 to -1.750 | +0.331 to +5.122 | +1.936 to -0.598 | +0.678 | -0.755 to +3.452 | cup 14, unknown 2 to map-green 16 |

- 7 of 9 rounds are unchanged to 3 decimals: every cup in them is a burst cup
  within 15 m of its green.
- 09-26 14:51: every mark on this abandoned round is about 3,894 yd from hole
  1's green. Both the before and the after numbers are meaningless.
- 09-27: the v30 track picks, now measured to the right hole. His word on
  that round: "I am not worried about yesterdays round."
- Trends take completed rounds of 9 or more holes: 09-14 and 09-16 only, both
  unchanged.

## 5. The round trip and the frame

- 31 burst cups on their green, each described in whole paces from the
  nearer edge and placed back: median 0.36 m, largest 0.50 m from the cup
  (n = 31). Rounding to whole paces allows up to 0.65 m. This checks the
  arithmetic, not a real pin sheet.
- The frame, 18 holes: A is 150 yd back along the line on all 18. Depth 17.5
  yd (hole 11) to 42.0 yd (hole 17); half depth, the error bar on the green
  centre, 8.8 to 21.0 yd.

## 6. Where the spec was wrong or silent

1. **Test 12's example was wrong.** Hole 11's line is 152.3 yd, longer than
   150, so A is 2.1 m from its start, not at it. No Veenker line is shorter
   than 150 yd. Opus built Section 4.1 as written and proved the short-line
   branch on a trimmed copy.
2. **6.1 has no map condition**, so a `source: 'map'` tee on a course with no
   map reads the card instead of being unattributed.
3. A distance he typed on a map tee still beats the scorecard.
4. The shot list's second line replaces the shot's length for the scorecard,
   the pin sheet and the green centre: both together ran off the row at
   360 px.
5. `positionNotes` entries carry `hole` and `used`; `greenFrame` returns
   `approach`.
6. ON 0 sits exactly on the front edge and may not place.

## 7. Follow-ups Opus noticed, not fixed

- A shot mark nowhere near its hole gives a lookup far off the table
  (09-26 14:51: +8.043 on one shot).
- `endsAtCup` still reads `hole.cup` of any method; no caller uses it.
- `test/README.md` has no D1 row.

## 8. Fable's review (xhigh), 2026-09-28

| Check | Result |
|---|---|
| `hole-position.js`, `round.js`, `strokes-gained.js`, `trends.js`, `schema.js` | Read line by line against Sections 3 to 6. |
| `screen-summary.js`, `screen-play.js` | Read on code lines. |
| Must-not-touch list (Section 10) | 10 files changed, none on the list. `REVISION` untouched. v33 in both files. |
| Suite | 594/594 at 360x728, Fable's run, n = 1. |
| The pin arithmetic, independently | Fable's own construction (sampling at 0.01 m) against `pinFromSheet` on holes 1, 17, 9, 11 and 3: 0.002 to 0.011 m apart (n = 5). |
| The "after" column of Section 4 | Recomputed by Fable from the phone's store with the built modules: all 9 rounds equal to 3 decimals. The "before" column is Opus's measurement. |
| The strokes gained card on screen | Rendered at 360 px for the 2026-09-27 round: the lines fit, no sideways scroll. |
| Commit identity | `rusty9645@gmail.com`. |

**Verdict: PASS against the spec, with three corrections owed before it goes
anywhere (spec Section 12).**

| # | Correction | Why |
|---|---|---|
| C3 | A map tee has no `lengthM` even when he typed its distance. | `shotGeometry` takes the typed branch first and measures a length from the box centre. 6.1 says a map tee has no length. |
| C4 | The card's sentence "The total does not depend on it" shows only when no hole's first shot was measured to the green centre. | On the 2026-09-27 round the tees are track picks measured to the green centre, so the total there does depend on it. The sentence was false on the first round it was shown for. Fable's spec wrote it without the condition. |
| C8 | A shot mark farther from the hole than the card yardage plus 100 yd is not on the hole and gives no distance. | Opus's follow-up 1. The engine "refuses to guess a distance"; a lookup 3,905 yd out is a guess. |

Rulings on Opus's three calls: test 12's example is corrected in the spec
(C1); 6.1 stands on every course, because the scorecard exists on every
course (C2); follow-up 1 is built as C8.

**Not installed, not pushed.** By his word the deploy belongs to the Hole
Overview session.
