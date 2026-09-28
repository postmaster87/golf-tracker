# SPEC - D1: where the hole is - the map's green centre, corrected by his pin sheet

Fable, 2026-09-28, at xhigh (Matt: "build D1"; `get_session self` read
`xhigh` before a line of this was written). An xhigh class: the strokes-gained
engine's input and the data model. Two builds from this one file:

| Part | What | Who builds | Build |
|---|---|---|---|
| A | The engine's hole position, the data model key, the derived numbers, what the screens say about the source | Opus at xhigh (`.claude/agents/opus-xhigh.md`) | v33 |
| B | The PIN SHEET sheet he types the numbers into | Opus at high (`.claude/agents/opus.md`), after Fable has signed Part A | v34 |

Fable reviews each diff against this file at xhigh and signs in
`docs/DECISIONS_LOG.md`.

His words that bound it, verbatim:

- 2026-09-28, the ruling: *"D1. map center with the option for me to correct
  it manually by entering tournament pin sheet numbers. Build in whatever
  order I dont fucking care you ask so many questions"*
- 2026-09-28, his item 3, answered "yes": distance to the hole uses the map's
  green, never a cup taken from the track.
- 2026-09-28, his item 1, answered *"yes that is what I meant"*: shot 1 is
  the tee box at the card yardage. His comment on hole 14: *"needs to default
  to the scorecard"*.
- 2026-09-26, quoted in `js/ui/screen-play.js` `shotRowHeading`: *"center of
  the green and I can enter pin sheet distances in manually later"* and
  *"Numbers are always measured with distance to hole not the last shot or
  any other garbage."*
- After field test 4, quoted in `js/round/track-analysis.js`: *"enter a rough
  number of paces the cup was located on the green like a tournament pin
  sheet does."*
- 2026-09-28: *"I am not worried about yesterdays round."* No stored round is
  rewritten by this job.

Provenance tags: `[measured]` read from code or data this session,
`[design]` this spec's decision, `[verify]` Opus confirms during the build.

**One reading this spec makes, stated so he can correct it:** a tournament
pin sheet gives two numbers - paces ON from the front edge, and paces from
the nearer SIDE EDGE, left or right. The entry stores which convention it was
typed in (`sideFrom`), so if his sheets read from the middle instead, the
change is one constant and no stored number is reinterpreted.

---

## 0. What this is, and what it is not

**Is:** the answer to "where is the hole" for every distance the app shows
and every distance the strokes-gained engine looks up, on a course that has a
map. No marked cup: the centre of the map's green. His pin sheet numbers:
the pin placed on the map's green from them. A position that cannot be the
hole (a cup taken from the track; a mark that is not on the hole's own green)
is not used, and the screen says so. Shot 1 from the map reads the scorecard
yardage in the engine, as it already does on the row.

**Is not:** a change to the benchmark tables or the baseline
(`js/analysis/benchmarks.js`, `tour-benchmark.js`), the category rules, the
strokes-gained formula, the export format, `schemaVersion` or `migrate()`,
any stored round, the course learning model (`learnTee`, `learnCup`,
`learnGreen`, `rebuildCourseLearning`, `accumulatedHolePosition`), the live
HUD, the recorder, the GPS pipeline, the shot-places preselection (v32), or
the course map and its generator. A course with no map behaves exactly as it
does at `7d35028`.

---

## 1. What exists today `[measured]`, at `7d35028`

| Piece | Where | What it does |
|---|---|---|
| Where the hole is | `holePosition(hole, fallback)`, `js/round/round.js` 447-469 | Tier 1 `hole.cup` of ANY method, source `cup`. Tier 2 the ball marked on the green, source `ball-on-green`. Tier 3 `fallback`, which every caller fills with `accumulatedHolePosition`. |
| Per-shot distances | `shotGeometry(hole, fallbackPos)`, `round.js` 471-498 | A typed distance (`distanceFt`) wins; else the shot's mark to the hole position; else null. `lengthM` is the mark to the next mark, or to `hole.cup`. |
| The engine | `js/analysis/strokes-gained.js`: `holeStates` 78, `holeStrokesGained` 103, `roundStrokesGained` 228 | Looks up E(lie, distance). A shot with no distance is `unattributed`. Takes `fallbackFor(hole)` from the caller. |
| The callers | `js/analysis/trends.js` 56-58 and 285-287; `js/ui/screen-summary.js` 197-199, 350; `js/ui/screen-play.js` 820 | All pass `accumulatedHolePosition(app, courseId, hole.number)`. None passes the map. |
| The map's green | `toGreen(geometry, holeNumber, pos)`, `js/round/course-geometry.js` 129-168 | Front, centre and back from a position. Used by the HUD and the end-of-hole rows, not by the engine. |
| The old paced pin | `locateCupFromPaces`, `track-analysis.js` 861-981; the "Where was the pin?" control, `screen-play.js` 1891-1977; `setCupFromPaces`, `round.js` 235 | Paces on from the front edge and paces left or right of the MIDDLE, placed from where he walked on the track; needs a marked approach shot. Stored as `hole.cup` with `method: 'paces'` and `cup.pinSheet`. |
| The map tee (v32) | `addMapTee`, `round.js` 181 | Shot 1 with `source: 'map'`, `mark.method: 'map'` at the box centre, or no mark. The engine reads the position like any other mark: straight line from the box centre to the hole position. |
| Edit mode | `screen-play.js` 275 | `geometry` is null in edit mode, so a finished round has no map for the end-of-hole entry or the rows. |
| The benchmark's distance | `js/analysis/tour-benchmark.js`, Table 9 note | "Distance to the hole in YARDS, measured along the fairway (dogleg distance from the tee), not straight line." |
| A new optional key | `js/data/schema.js`, `device.recorder` | Precedent: "Additive and optional: `schemaVersion` does not move and `migrate()` does not change". Export writes rounds verbatim; `importExport` saves `migrate(round)` and validates no hole key. |

## 2. What the data says `[measured]`

### 2.1 The cups on his phone against the map

All 16 Veenker rounds in the phone's store as pulled 2026-09-28
(`docs/roundDownloads/native-0927/localStorage-20260928.json`).

| Cups | n | On or within 5 yd of their own green | Distance to the map's green centre |
|---|---|---|---|
| Marked with a burst | 35 | 31 | of the 31: median 5.5 yd, largest 17.3 yd |
| Taken from the track (all 2026-09-27) | 8 | 1 | median 32.8 yd, largest 400.7 yd |

The 4 burst cups that are not on their green: 7.7 yd outside (2026-09-11
hole 3), 93 yd outside (2026-09-27 hole 12, the accidental mark), 3,895 yd
outside (2026-09-26 hole 1) and 3,983 yd outside (2026-09-16 hole 10). The
engine uses every one of them today.

### 2.2 The greens on the map

18 holes. Every hole's line ends inside its own green, 0.1 to 4.1 yd from the
centre. Depth along the line of play 17.5 to 42.4 yd (hole 11, hole 17). The
farthest edge from the centre is 11.1 to 22.5 yd away. The last segment of
the hole line is 11 to 280 yd long; on holes 3, 9, 17 and 10 it is 11, 18, 24
and 31 yd, too short to give a direction (hole 9: 12.7 degrees between the
last segment and the line to the centre).

### 2.3 What a wrong distance costs, from the engine's own scratch table

Change in expected strokes for a 5 yd error in the distance to the hole:

| Lie | 15 yd | 30 yd | 50 yd | 80 yd | 120 yd | 160 yd | 200 yd |
|---|---|---|---|---|---|---|---|
| Fairway | 0.114 | 0.052 | 0.026 | 0.013 | 0.014 | 0.022 | 0.031 |
| Rough | 0.130 | 0.049 | 0.034 | 0.016 | 0.017 | 0.021 | 0.028 |

From the tee, a 10 yd error is 0.010 to 0.067 strokes (150 to 500 yd).

### 2.4 What follows

- The green centre is within a median 5.5 yd of where the cup was (n = 31).
  That is a small error on an approach and a large one on a chip.
- On a hole whose tee reads the scorecard and whose first putt he typed, the
  strokes gained from tee to green ADD UP to the same total wherever the hole
  is taken from: the middle distances cancel in the sum. Only the split
  between off the tee, approach and short game moves. Section 7 test 9 proves
  it.
- 3 of 35 burst cups are nowhere near a green. A hole position has to be
  checked against the map before it is used.

---

## 3. Where the hole is `[design]`

### 3.1 The order, on a course with a map

The first of these that exists and passes 3.2:

| Tier | Position | `source` | `uncertaintyM` |
|---|---|---|---|
| 1 | The cup he marked: `hole.cup`, any method except `track` | `cup` | `hole.cup.accuracyM`, as today |
| 2 | His pin sheet placed on the map's green (Section 4) | `pin-sheet` | 4 |
| 3 | The ball he marked on the green, as today | `ball-on-green` | the first putt plus the mark's accuracy, as today |
| 4 | The centre of the map's green | `map-green` | half the green's depth along the line of play (4.1) |

The accumulated position from earlier rounds is not reached on a course with
a map: tier 4 always exists.

### 3.2 A position that cannot be the hole is not used

- **A cup taken from the track** (`hole.cup.method === 'track'`) is never
  used on a course with a map. His item 3.
- **A cup or a ball mark more than 15 m from the hole's own green** (outside
  the green's ring by more than `HOLE_ON_GREEN_M = 15`) is not used. The next
  tier is.
- **A pin sheet that lands more than 3 m outside the green's ring**, or that
  cannot be placed (4.2), is not used. Tier 3 or 4 is.
- Nothing is deleted or rewritten. The mark stays on the hole, the pin sheet
  stays as he typed it. This is a filter at read time.
- Every position passed over is returned in `skipped`, one entry each:
  `{ what: 'cup' | 'ball' | 'pin-sheet', why: 'from-track' | 'off-green' |
  'not-placed', offM }` (`offM` null when it does not apply). The screens show
  it (Section 6).
- A hole the map has no green for is treated as a hole on a course with no
  map (3.3).

### 3.3 A course with no map

Exactly today's order and today's numbers: `hole.cup` of any method, the ball
on the green, the accumulated position. No filter, no pin sheet.

### 3.4 The module

A new file, `js/round/hole-position.js`. It imports from
`js/round/course-geometry.js`, `js/util/polygon.js` and `js/util/geo.js` and
from nothing else; `js/round/course-geometry.js` is READ, not written
(another session is adding to it).

| Export | Returns |
|---|---|
| `HOLE_ON_GREEN_M = 15`, `PIN_OFF_GREEN_M = 3`, `PIN_SHEET_UNCERTAINTY_M = 4`, `APPROACH_BACK_M = 137.16` | constants |
| `greenFrame(geometry, holeNumber)` | `{ centre, front, depthM, bearingDeg, ring, greenId }` or null |
| `pinFromSheet(geometry, holeNumber, pinSheet)` | `{ placed: true, lat, lon, offGreenM, fromCentreM }` or `{ placed: false, why }` or null with no map or no entry |
| `offOwnGreenM(geometry, holeNumber, pos)` | metres outside the green's ring, 0 inside; null with no map |
| `resolveHolePosition(hole, { geometry = null, accumulated = null })` | `{ lat, lon, source, uncertaintyM, skipped: [] }`, or null |

`holePosition` and `shotGeometry` in `round.js` take the same second argument,
`{ geometry, accumulated }`, and `holePosition` returns what
`resolveHolePosition` returns. `roundStrokesGained`'s option `fallbackFor` is
renamed `contextFor` and returns that object per hole. A helper in
`round.js`, `holeContextFor(app, round)`, builds it:
`(hole) => ({ geometry: courseGeometry(getCourse(app, round.courseId)),
accumulated: accumulatedHolePosition(app, round.courseId, hole.number) })`.
All five call sites in Section 1 use it. `[verify]` no import cycle.

---

## 4. The pin sheet on the map `[design]`

### 4.1 The green's frame

1. **The approach point A**: the point on the hole's `line` that is 150 yd
   (`APPROACH_BACK_M`) back from the line's end, measured along the line; the
   line's start when the line is shorter than that. Reason: Section 2.2, the
   last segment alone is too short on four holes.
2. **The centre C**: `ringCentroid` of the green's ring, the same centre
   `toGreen` uses.
3. **The line of play**: the bearing from A to C.
4. **The front edge F**: the first crossing of the ray A to C with the green's
   ring (`rayRingIntersections`). **The depth**: last crossing minus first.
5. `uncertaintyM` of tier 4 is `depthM / 2`.

### 4.2 Placing the pin

The entry is `{ onPaces, side, sidePaces, sideFrom, paceFeet }` (Section 5).
One pace is `paceFeet x 0.3048` m.

1. The point on the line of play `onPaces` from F, toward C.
2. Through that point, the line across the green at right angles. Its
   crossings with the ring give the left edge and the right edge there. Right
   is to the right of a player facing from A to C.
3. `sideFrom: 'edge'`: `side: 'L'` is `sidePaces` in from the left edge,
   `side: 'R'` is `sidePaces` in from the right edge, `side: 'C'` is halfway
   between the two edges.
4. `sideFrom: 'centre'`: `sidePaces` from the line of play, right for `'R'`,
   left for `'L'`, on it for `'C'`. Supported by the function; the sheet in
   Part B writes `'edge'`.
5. `placed: false` when the point in step 1 is not inside the ring, or either
   edge in step 2 has no crossing. `why` says which.
6. `offGreenM` is how far the placed pin is outside the ring (0 inside);
   `fromCentreM` is its distance from C.

---

## 5. The data model `[design]`

One new optional key on a hole, additive, by the `device.recorder`
precedent: `schemaVersion` does not move, `migrate()` does not change, a
round logged before it simply has no key.

```
hole.pinSheet = null | {
  onPaces:   integer >= 0,          // paces on from the front edge
  side:      'L' | 'R' | 'C',
  sidePaces: integer >= 0 | null,   // null when side is 'C'
  sideFrom:  'edge' | 'centre',
  paceFeet:  number,                // his stride when he typed it
  enteredAt: ISO string
}
```

- `newHole` in `js/data/schema.js` gets `pinSheet: null` and the comment.
  That is the only change to `schema.js`.
- What is stored is what he typed. No latitude or longitude is stored: the
  pin is placed from the map when it is read, so a corrected map moves the pin
  with the green.
- `hole.cup` keeps meaning what it means today: a position he marked, or the
  old paced construction. Nothing in this job writes `hole.cup`.
- A reader that finds `hole.pinSheet` undefined treats it as null.
- `setPinSheet(hole, entry)` and `clearPinSheet(hole)` in `round.js`. They do
  not touch `shots`, `cup`, `greenEntry` or `completedAt`. `holeWindow` does
  not read `pinSheet`.
- The export and the import are not changed: the key rides inside the round.
  `[verify]` a round with `pinSheet` survives `buildExport` then
  `importExport` with the key intact.

---

## 6. The numbers that depend on it `[design]`

### 6.1 Shot 1 from the map reads the scorecard in the engine

In `shotGeometry`, a shot with `source === 'map'` and `lie === 'tee'`:

- `toHoleM` is `hole.yards x 0.9144`; `toHoleSource` is `'scorecard'`;
  `toHoleUncertaintyM` is null. With no `hole.yards`, null.
- `lengthM` is null. A drive length needs his own mark at both ends; the box
  centre is not his mark. The "Tee shots (measured)" card therefore does not
  count it.

Reason: the row already reads "(scorecard)", and the benchmark's tee distance
is the hole's length along the fairway, not a straight line (Section 1).
A tee he marked himself is unchanged.

### 6.2 The end of the last shot

In `shotGeometry`, `end` for a shot with no next mark is the resolved
position only when its source is `cup`; otherwise null. A cup that 3.2 passes
over does not measure a shot's length.

### 6.3 What the engine returns

- Every shot in `holeStrokesGained(...).shots` already carries
  `distanceSource`; it now also carries `distanceUncertaintyYd`.
- `roundStrokesGained` adds `sources`: for the shots that are not putts, how
  many took their distance from each source (`scorecard`, `cup`, `pin-sheet`,
  `ball-on-green`, `map-green`, `yards` and the other typed units,
  `accumulated-cup`, `accumulated-green`), and `unknown` for a shot with no
  distance.
- `roundStrokesGained` adds `positionNotes`: the `skipped` entries of every
  hole scored, one per hole and reason.
- The formula, the categories, the putting identity and `unattributed` are
  not changed.

### 6.4 What the screens say

| Screen | Change |
|---|---|
| Strokes gained card, `screen-summary.js` | Under the total, one line from `sources`, every count with its source: for example "Distance to the hole: 9 tees from the scorecard, 14 shots to the centre of the map's green, 3 to your pin sheet, 2 you typed." Then one line per reason in `positionNotes`, holes listed: for example "Holes 1, 10, 12: the marked cup is not on that hole's green on the map, so the map's green was used." Then, when any shot used `map-green`: "The centre of the green is a median 5.5 yd from where the cup was (n = 31 cups marked at Veenker). The total does not depend on it; the split between approach and short game does." The numbers in that last line are constants from Section 2.1 with a comment naming this spec. |
| Data quality card, `screen-summary.js` 441-462 | "Hole position" counts holes by the resolved source, all of 3.1's sources. The sentence about the accumulated positions shows only on a course with no map. |
| Shot list, `screen-play.js` 820-861 | The second line of a shot reads `scorecard` for a map tee, `pin sheet` for `pin-sheet`, `green centre, est. +/-n yd` for `map-green`. The `accumulated` wording stays for a course with no map. |
| End-of-hole rows, `shotRowHeading` | The distance is to the resolved position: no suffix for `cup`, "(pin sheet)" for `pin-sheet`, "(ball on the green)" for `ball-on-green`, "(green centre)" for `map-green`. The number on the row is the number the engine uses. |
| Edit mode, `screen-play.js` 275 | The map is available to the end-of-hole entry, the rows and the shot list in edit mode. The live HUD stays off in edit mode, as today. |

---

## 7. Part A - tests that prove it

In the browser suite (`/test/`), one focused test per behaviour, sized like
the neighbouring strokes-gained and geometry tests.

| # | Behaviour | Test |
|---|---|---|
| 1 | No cup on a map course | a Veenker hole, track shots, no cup: every off-green shot has a distance, `distanceSource` is `map-green`, the distance equals `toGreen(...).centreM` |
| 2 | A marked cup wins | a burst cup 6 yd from the centre: source `cup`, distances to the cup |
| 3 | A cup from the track is not used | `cup.method: 'track'` inside the green: source `map-green`, one `skipped` entry |
| 4 | A cup off the green is not used | a burst cup 93 yd outside: source `map-green`, one `skipped` entry; the same cup 10 m outside: source `cup` |
| 5 | The pin sheet places the pin | hole 1, `{ onPaces: 12, side: 'L', sidePaces: 5, sideFrom: 'edge', paceFeet: 3 }`: the pin is 12 yd from F along the line and 5 yd inside the left edge, within 0.2 m; source `pin-sheet` |
| 6 | `side: 'C'` and `sideFrom: 'centre'` | C is halfway between the edges; centre R 4 is 4 yd right of the line |
| 7 | A pin sheet that cannot be the hole | `onPaces` 5 more than the depth in paces: `placed: false` or off the green, source falls to `map-green`, one `skipped` entry |
| 8 | The map tee reads the scorecard | a `source: 'map'` tee on hole 15 (386 yd): `toHoleM` is 386 yd, source `scorecard`, `lengthM` null; a `source: 'gps'` tee is unchanged |
| 9 | The total does not move with the pin | one hole, map tee, two track shots, first putt typed: the sum of the three off-green strokes gained is equal to 1e-9 with no pin sheet, with a pin at the front and with a pin at the back; the approach and short game values differ |
| 10 | No map, no change | a Radcliffe hole with a track cup and an accumulated position: `holePosition` and the strokes gained are identical to the values the same round gives at `7d35028` (fixture values written into the test) |
| 11 | The key is optional and survives the export | a hole with no `pinSheet` key resolves like `pinSheet: null`; a round with one survives `buildExport` and `importExport` unchanged |
| 12 | The frame | hole 9's line of play is the bearing from the point 150 yd back along its line to the centre, not its 18 yd last segment; hole 11 (a 152 yd line) uses the line's start |
| 13 | The sources are counted | `roundStrokesGained(...).sources` adds up to the number of shots that are not putts; `positionNotes` carries test 4's hole |

## 8. Part A - evidence in the report

1. **Before and after, every Veenker round in the phone's store**
   (`docs/roundDownloads/native-0927/localStorage-20260928.json`, read only):
   holes scored, strokes unattributed, the four category totals and the total,
   at `7d35028` and at the new build, with the `sources` counts. One row per
   round that scores at least one hole. No round is written.
2. **The round trip, n = 31**: for each burst cup on or within 5 yd of its
   green (Section 2.1), the pin sheet numbers that describe it (whole paces,
   `paceFeet` 3, from the edge), placed back with `pinFromSheet`, and the
   distance from the placed pin to the cup: median and largest. This checks
   the arithmetic, not the course: it is not a field test of a real pin sheet.
3. **The frame, 18 holes**: bearing, depth and front-to-centre per hole.
4. Suite counts. Time and tokens.

## 9. Part B - the PIN SHEET sheet `[design]`

Built after Fable has signed Part A.

1. **Where:** the Round menu (the three-line button) gets **Pin sheet**, in a
   live round and in edit mode. The round summary gets **PIN SHEET** under
   EDIT / ADD HOLES; it opens the round in edit mode with the sheet up. Only
   on a course with a map.
2. **The sheet:** one row per hole of the round, in the order played. Each
   row: the hole number; the green's depth from the map in paces ("25 deep");
   ON, a number field; L / C / R; the side number, a number field, disabled
   on C. One line at the top: "Paces on from the front edge, then paces from
   the left or right edge. Your stride is set to n ft."
3. **The read-out** under a row once ON has a number: "n yd from the centre"
   when it places on the green; "lands n yd off the green on the map - check
   the numbers" or the `why` of `placed: false`, in the warning colour, when
   it does not. He can save either way: what he typed is what is stored.
4. **SAVE** writes `hole.pinSheet` for every row with an ON number
   (`sideFrom: 'edge'`, `paceFeet` from his settings) and clears it on a row
   whose ON is empty. One UNDO, through the banner that stays (v31), puts
   every hole's pin sheet back as it was.
5. **Limits:** ON 0 to 60, side 0 to 30, whole numbers. Anything else is not
   accepted by the field.
6. **The old control:** on a course with a map the green sheet's "Where was
   the pin?" section is not shown; the PIN SHEET sheet is the one place. On a
   course with no map it is unchanged. Nothing else in the green sheet moves.
7. **Fit:** every row and SAVE reachable at 360x728, no sideways scroll, the
   number fields at least 44 px tall.

Tests, one each: the menu and the summary open the sheet on Veenker and not
on Radcliffe; typing 12 / L / 5 on hole 1 and SAVE stores exactly Section 5's
object; an empty ON clears the key; UNDO restores; the read-out warns on a
pin off the green and SAVE still stores it; the green sheet has no "Where was
the pin?" on Veenker and has it on Radcliffe; the fit at 360x728.

## 10. What Opus must not touch

`android/`, the recorder, the GPS pipeline (`js/gps/gps.js`,
`js/util/geo.js`), `js/util/polygon.js`, `js/round/course-geometry.js`,
`js/data/geometry/`, `tools/course-geometry/`, `js/analysis/benchmarks.js`,
`js/analysis/tour-benchmark.js`, the category rules and the formula in
`strokes-gained.js`, `js/data/store.js`, `trackstore.js`, `persistence.js`,
`schemaVersion` and `migrate()`, the course learning functions,
`proposeHoleShots` and its constants, the green sheet's putt entry, any stored
round, `docs/roundDownloads/`, `REVISION`, the push. `BUILD.id` and the
`gt-shell-<id>` cache move together.

## 11. Known, and not in this job

- The live HUD still reads the green's centre when a pin sheet is entered.
- `firstPuttM` and the green sheet's GPS first putt still read `hole.cup` of
  any method.
- `rebuildCourseLearning` learns a cup of any method, and a cup that is not on
  its green.
- A tee he marked himself reads a straight line to the hole, short of the
  card on a dogleg (hole 15: 19.5 percent, `[measured]` 2026-09-26).
- A drive from a map tee has no length. Whether an estimate from the tee box,
  labelled as one, is wanted is his call.
- The benchmark table's scratch-versus-Tour question
  (`docs/benchmark-verification.md`) is untouched.
