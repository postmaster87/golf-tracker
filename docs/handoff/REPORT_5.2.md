# REPORT 5.2 - D1 corrections and Part B, the PIN SHEET sheet: build v34 (Opus `a7e0b58`) and Fable's review

2026-09-28. Spec: `docs/SPEC_hole-position.md` Sections 9 and 12. Built by
Opus at xhigh from `6f843ea`; one run, 16:44 to 17:12 CDT, 28 min and 426k
sub-agent tokens by the harness count (n = 1). Filed by Fable from Opus's
hand-back. Sections 1 to 6 are Opus's findings; Section 7 is Fable's review at
xhigh.

## 1. What changed

| File | Change |
|---|---|
| `js/round/hole-position.js` | The constant `OFF_HOLE_MARGIN_M = 91.44`. |
| `js/round/round.js` | `shotGeometry`. C3: a `source: 'map'` tee has `lengthM` null in every case; his typed distance still sets `toHoleM`. C8: a distance measured from a mark is refused when it is more than `hole.yards x 0.9144 + 91.44` m; the entry has no distance and carries `offHoleM`; `lengthM` unchanged; no `hole.yards`, no filter. |
| `js/analysis/strokes-gained.js` | `offHoleM` passed through; the reason for a refused shot reads "hole N shot k: the mark is n yd from the hole on a m yd hole, not used". Formula, categories, benchmarks untouched. |
| `js/ui/screen-summary.js` | C4: the third line has two forms; n is the count of scored holes whose first shot read `map-green`. A **PIN SHEET** button under EDIT / ADD HOLES, only with a map. |
| `js/ui/screen-play.js` | `openPinSheet()`; **Pin sheet** in the Round menu after "Mark cup", live and in edit mode, only with a map; `params.pinSheet` opens it; the UNDO banner shows in edit mode for the pin sheet's save; the green sheet's "Where was the pin?" block is gated on no map. Nothing else in the green sheet changed. |
| `css/base.css` | `.pin-sheet`: one-line rows, 48 px fields and buttons, a sticky SAVE, a two-line row when the web lock tab's strip is reserved. |
| `js/data/build.js`, `sw.js` | v34 in both. `REVISION` untouched. |
| `test/run.js`, `test/index.html` | Tests C3, C4, C8 and the seven pin sheet tests; one existing fixture moved to holes 1, 4 and 5 because C8 correctly refuses its 388 yd tee on hole 2 (card 283). |

## 2. The tests

All ten new tests fail against the modules at `6f843ea` (594/604, exactly
these ten).

| Test | What it proved |
|---|---|
| C3 | A map tee with a typed 150 yd: 150 yd, source `yards`, no length. At `6f843ea` the length was 247.8 m. |
| C4 | Scorecard tees only: the "total does not depend on it" sentence. Two track tees and a map tee: "and so does the total on the 2 holes whose tee shot was measured to it". |
| C8 | A tee mark 3,905 yd from the green on a 419 yd hole: no distance, `offHoleM` set, length unchanged, 1 unattributed with the ruled reason, `sources.unknown` 1. The same mark 500 yd out is measured. |
| Pin 1 | Veenker's Round menu opens the sheet, rows in the order played; Radcliffe has no entry; the summary's PIN SHEET opens edit mode with the sheet up. |
| Pin 2 | 12 / L / 5 on hole 1 and SAVE stores exactly `{ onPaces: 12, side: 'L', sidePaces: 5, sideFrom: 'edge', paceFeet: 2.75, enteredAt }` (stride set to 2.75 to prove it comes from his settings). ON 0, 61, 7.5 and side 31 are not accepted. No other hole, cup, shot, green entry or `completedAt` is written. |
| Pin 3 | An empty ON clears the key. |
| Pin 4 | One UNDO restores every hole, live and in edit mode; a hole that had no key has none again. |
| Pin 5 | The read-out warns ("30 on is off the green on the map - check the numbers", "lands 7 yd off the green on the map - check the numbers") and SAVE still stores what he typed. |
| Pin 6 | The green sheet has no "Where was the pin?" on Veenker and has it on Radcliffe; the rest is the same on both. |
| Pin 7 | 360x728: 18 rows, no sideways scroll, every number field at least 44 px, SAVE on screen at both ends of the scroll. |

Suite: 604/604 at 360x728.

## 3. Before and after, every Veenker round in the phone's store

Read only. Cells read `1692724` / v33 / this build; one value means all three
agree.

| Round | Holes | Unattributed | Off tee | Approach | Short game | Putting | Total | C8 refused |
|---|---|---|---|---|---|---|---|---|
| 09-09 21:41 | 1 | 1 | -0.225 | -0.359 | -0.024 | 0.000 | -0.608 | 0 |
| 09-09 22:09 | 5 | 2 | -0.461 | -2.603 | -0.708 | -0.009 | -3.781 | 0 |
| 09-11 | 3 | 4 | +0.064 | -0.950 | -1.405 | +0.627 | -1.664 | 0 |
| 09-14 | 9 | 2 | -1.657 | -1.980 | -1.199 | -0.063 | -4.898 | 0 |
| 09-16 | 9 | 5 | -1.833 | -4.763 | +0.571 | +0.230 | -5.795 | 0 |
| 09-23 | 3 | 2 | +0.977 | 0.000 | 0.000 | -0.504 | +0.473 | 0 |
| 09-26 14:51 (abandoned) | 1 | 0 / 0 / 2 | -1.000 / -1.001 / 0.000 | 0.000 / +8.043 / 0.000 | +0.170 / 0.000 / 0.000 | -0.947 | -1.778 / +6.094 / -0.947 | 2 |
| 09-26 17:48 | 1 | 0 | -0.583 | -2.788 | +1.727 | 0.000 | -1.644 | 0 |
| 09-27 | 8 | 9 / 7 / 7 | -3.700 / -1.750 / -1.750 | +0.331 / +5.122 / +5.122 | +1.936 / -0.598 / -0.598 | +0.678 | -0.755 / +3.452 / +3.452 | 0 |

- C8 refuses 2 shots, both on the abandoned 09-26 14:51 round (3,905 and
  3,906 yd on a 419 yd hole). The +8.043 is gone. n = 9 rounds.
- The store has 0 map tees and 0 pin sheets, so C3 moves nothing stored.
- Only 09-27 shows the green-centre line, in the "total on the 8 holes" form.
- Trends read 09-14 and 09-16 only, both unchanged.

## 4. The sheet at 360x728

| Measure | Native shell, no lock tab | Web, with the lock-tab strip |
|---|---|---|
| ON and side fields | 48 tall x 61.9 wide | 48 tall x 91 wide |
| L / C / R buttons | 41.4 x 48 | 59.3 x 48, on their own line |
| Row height | 60.7 px | 112.7 px |
| Rows above the fold | 6 full | 3 full |
| SAVE | sticky at the foot, always on screen | same |

## 5. Where the spec was silent (Opus's choices)

1. C4 with n = 1 says "hole", singular.
2. A new row defaults to side C, the side field disabled until L or R.
3. The read-out warns when the pin cannot be placed or lands more than 3 m
   off the green: the same line the engine uses.
4. A row he did not change keeps its stored entry, `paceFeet` and
   `enteredAt` included.
5. SAVE with nothing changed writes nothing and shows no banner.
6. The UNDO banner shows in edit mode for the pin sheet only; every other
   edit-mode mark behaves as before.
7. C8 applies on every course that has a card yardage.

## 6. Follow-ups Opus noticed, not fixed

1. An end-of-hole row still prints a distance for a track stop farther than
   the card plus 100 yd, which the engine refuses after SAVE HOLE.
2. The shot list does not say a shot was refused by C8.
3. Edit mode hides every UNDO banner except the pin sheet's.
4. The green sheet still reads the track on a map course, though the pin
   control is hidden there.
5. The pin sheet row does not say when a marked cup on that hole outranks it.
6. The number fields' refusal of "." and "-" is proven from code only; it has
   not been tried on the phone.
7. `test/README.md` has no D1 row.

## 7. Fable's review (xhigh), 2026-09-28

| Check | Result |
|---|---|
| `round.js`, `strokes-gained.js`, `hole-position.js` | Read line by line against Section 12: C3 and C8 as ruled. |
| `screen-summary.js` | Read: C4's two sentences and the condition as ruled. |
| `screen-play.js`, `css/base.css` | The sheet opened and typed into by Fable at 360x728: 18 rows, depth per hole, "7 yd from the centre" on 12 / L / 5 at hole 10, the warning on 30 on at hole 11 (18 deep), SAVE sticky, no sideways scroll (scroll width 360). |
| Must-not-touch list (Section 10) | 10 files changed, none on the list; `schema.js`, `track-analysis.js` and `trends.js` untouched by this build. `REVISION` untouched. v34 in both files. |
| Suite | 604/604 at 360x728, Fable's run, n = 1. |
| The "this build" column of Section 3 | Recomputed by Fable from the phone's store: 9 of 9 rounds equal to 3 decimals; 2 shots refused, both on 09-26 14:51. |
| Commit identity | `rusty9645@gmail.com`. |

**Verdict: PASS.** D1 is built: Part A, its corrections and Part B.

**Not proven, and said so:** the pin sheet has never been typed from a real
tournament sheet against a marked cup; the side numbers are built as paces
from the nearer side edge and he has not confirmed that convention; nothing
in v31 to v34 has run on his phone.

**Not installed, not pushed.** The deploy is handed to the session "Latest
build setup" on his word (`docs/handoff/HANDOFF_2026-09-28_shot-places-and-D1.md`).
