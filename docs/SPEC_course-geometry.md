# SPEC - the Veenker course map inside the app: distance to the green, the lie from position, the hole from position

Fable, 2026-09-26, at xhigh (Matt set it: `/effort xhigh`, "it is up"; ruling
2026-09-16: xhigh classes run at xhigh end to end). Written for Opus to build
at xhigh (`.claude/agents/opus-xhigh.md`). Fable reviews the diff against this
file, part by part, and signs in `docs/DECISIONS_LOG.md`.

His words that bound it, verbatim:

- 2026-09-26: *"I want to add the Veenker Map into the app to test on the
  course. We have about 2 hours to get it done"* and, asked what the map does
  in today's test (live distance to green / lie from position / hole from
  position): *"all 3 but focus on 1 and 2"*.
- 2026-09-13: *"The OSM map is correct I looked it over - your guesses are way
  off."* and *"yes to 10 based off OSM"* (sand lies come from OSM's mapped
  bunkers).
- 2026-09-15: *"yes to 9 I already confirmed that with you. 12 is a single
  long tee box. Golds towards the center blues at the back - like I said the
  map is correct."*
- 2026-09-13, on hole 16: *"Yes 16 has a tee boxed tucked way in the back
  between the 16 gold tees and 15 green."*

Provenance tags: `[measured]` read from code or data this session, `[design]`
this spec's decision, `[verify]` Opus confirms during the build.

Design rules that bind every line (repo CLAUDE.md Section 3): the golfer is
the source of truth about where he is, the app only suggests; measured and
inferred are never silently mixed; propose and confirm, never detect and
fill; nothing is guessed into course data.

---

## 0. What this is, and what it is not

**Is:** the OSM geometry in `docs/course-map/veenker/osm_full.json`, with his
confirmed corrections, generated into a static ES module the app ships; a
small geometry engine over it; and three uses on the play screen, built and
committed in this order so the deadline cuts from the bottom:

- **Part A** - the data module and the engine, with tests. No UI.
- **Part B** - live distance to the green on the play screen.
- **Part C** - the lie proposed from position, at the end-of-hole shot rows
  and as a hint inside the lie card.
- **Part D** - the hole suggested from position, as a banner.

**Is not:** any change to `js/gps/*` (the GPS precision pipeline is
field-validated - do not touch it), to `js/round/track-analysis.js`, to the
round schema in `js/data/schema.js`, to storage (`store.js`, `trackstore.js`,
`persistence.js`), to the strokes-gained engine, to the lock, or to Radcliffe.
No round data is written by anything in this spec except a lie he confirms,
which already writes today. No network: the data ships in the APK.

Deadline rule `[design]`: about two hours from 15:15 Central for build,
review, APK rebuild and install together. Commit at the end of every part
with the suite green. If Part C or D cannot be finished with the suite green,
stop, leave it unbuilt, and return `DONE <hash>` naming what was not built.
A half-built part is never committed.

---

## 1. The data: `js/data/geometry/veenker.js`, generated

### 1.1 Generator

`tools/course-geometry/build_veenker.py` (Python 3, standard library only;
the map tooling in `docs/course-map/veenker/*.py` is Python). Reads:

- `docs/course-map/veenker/osm_full.json` `[measured]`: 18 `golf=hole` ways
  (tags `ref` 1..18, `par`, `handicap`, `name`; 2 to 5 points each), 26
  `golf=green` ways, 43 `golf=tee` ways, 27 `golf=bunker` ways, 9
  `golf=fairway` ways plus 21 `golf=fairway` multipolygon relations, 2
  `golf=lateral_water_hazard` ways plus the Ioway Creek `natural=water`
  relation, 1 `golf=rough` relation. Every way carries `geometry`
  (`[{lat, lon}]`). **Greens, tees and bunkers carry no hole `ref`**
  `[measured]`; 13 of the 30 fairways do.
- `docs/course-map/veenker/veenker_confirmed_corrections.json` `[measured]`:
  hole 8 green and tee ids, hole 9 tee ids, hole 16 back blue tee point
  (`source: "his blue leader tip; box not in OSM"`), hole 10 rule.
- `docs/course-map/veenker/markup_lines.json` + `basemap_true_extent.json`
  `[measured]`: his tee-colour tips in pixels (blue = blue tee, yellow = gold
  tee), converted with the TRUE extent (README trap 2). Reuse the pixel to
  lat/lon and tip-to-polygon matching from `rematch.py`; do not re-derive it.

Writes `js/data/geometry/veenker.js` exporting `VEENKER_GEOMETRY`:

```js
export const VEENKER_GEOMETRY = {
  courseId: 'veenker',
  source: { osmPulled: '2026-09-13', generator: 'tools/course-geometry/build_veenker.py',
            inputsSha256: { osm_full: '...', corrections: '...', markup_lines: '...' },
            licence: 'Course features (c) OpenStreetMap contributors, ODbL 1.0' },
  holes: [ { number: 1, par: 4, hcp: 7, osmName: 'The Meadow', osmId: <way id>,
             line: [{lat, lon}, ...],           // the golf=hole way, tee to green
             greenId: <way id>,                 // the green in `polygons`
             teeIds: [<way id>, ...],           // tee boxes in `polygons`
             fairwayIds: [<id>, ...], bunkerIds: [<id>, ...] }, ... 18 ],
  polygons: [ { id: <osm id>, kind: 'green'|'tee'|'fairway'|'bunker'|'water',
                holes: [<number>, ...],          // [] when unassigned
                sets: ['blue'|'gold'],           // tees only, from his markup; [] when no tip
                ring: [{lat, lon}, ...] }, ... ],  // closed ring, first == last, 7 decimals
  points: [ { id: 'hole16-back-blue', kind: 'tee', holes: [16], sets: ['blue'],
              lat: 42.04048322501589, lon: -93.65605876967625,
              source: 'markup' } ],            // his leader tip, never a measured position
};
```

Multipolygon relations become one polygon per `outer` member ring (join
`outer` ways that share endpoints into closed rings; a relation whose outers
do not close is reported by the generator and skipped, never patched).
`inner` rings are carried as `holes` on the polygon only if any exist
`[verify]`; if none exist in the data, omit the field and say so.

### 1.2 Assignment rules `[design]` - all from geometry, nothing typed in

- **Green of hole n:** the green polygon that contains the LAST point of hole
  n's line; if none contains it, the nearest green within 30 m; else the
  generator fails loudly for that hole. Expected 18/18 contained `[verify]`
  (README: hole 8's line "ends in that green, 0.0 m").
- **Tees of hole n:** every tee polygon whose ring is within 60 m of the FIRST
  point of hole n's line. One box may serve two holes: 11 and 18 share one
  `[measured]` (README), so `holes: [11, 18]` on that polygon. Hole 9's
  three ids from the corrections file must be among hole 9's tees, and hole
  8's ids among hole 8's `[verify]`; if the rule does not produce them, the
  generator fails - do not special-case the ids in.
- **Tee sets:** a tee polygon gets `'blue'` for every blue tip inside it or
  within 5 m of its ring, `'gold'` for every yellow tip likewise. Hole 12's
  single box gets both `[verify]`. Hole 16's blue tip matches no polygon
  (48.5 m off, README) and becomes the `points` entry above, taken from the
  corrections file, not re-derived.
- **Fairways and bunkers of hole n:** by `ref` where the fairway has one;
  otherwise the hole whose line passes nearest the polygon's centroid, if
  within 80 m; else `holes: []`. Assignment here only labels; the lie engine
  does not depend on it.
- **Water:** the two lateral hazard ways and the creek relation's outer
  rings, `kind: 'water'`, `holes: []`.
- The rough relation is NOT used for lies (Section 2.2 defines rough).

### 1.3 Size and checks

Coordinates rounded to 7 decimals (1.1 cm). Expect roughly 150 to 250 KB of
JS `[verify]`; report the byte count. The generator prints a per-hole table
(hole, green id, tee ids with sets, fairway count, bunker count) and exits
non-zero on any failure above. The module is committed; the generator is
re-runnable and byte-stable on the same inputs (run it twice, diff empty).

`courses.js` gains one field on `VEENKER` only: `geometry: 'veenker'`
(a key, not the data - `courses.js` stays small). A loader in the engine maps
the key to the module. Radcliffe and custom courses have no key and every
engine call returns null for them.

---

## 2. The engine: `js/round/course-geometry.js` (+ `js/util/polygon.js`)

Fable-owned code, built by Opus from this section. Pure functions, no DOM, no
storage. All positions are `{ lat, lon, accuracyM? }`. Distances computed in
the local tangent plane via `enuOffset` from `js/util/geo.js` `[measured]`
(the same plane every distance in the app uses); never haversine.

### 2.1 `js/util/polygon.js`

- `pointInRing(pt, ring)` - even-odd ray cast on ENU offsets from `pt`.
- `distanceToRing(pt, ring)` - min distance from `pt` to the ring's edges,
  metres, 0 when on an edge (NOT 0 when inside; callers combine with
  `pointInRing`).
- `distanceToPolyline(pt, line)` - min distance to the segments, metres.
- `ringCentroid(ring)` - area-weighted centroid in ENU then back via
  `offsetPoint`; for a degenerate ring, the vertex mean.
- `rayRingIntersections(from, towards, ring)` - distances along the ray
  `from -> towards` where it crosses the ring, ascending, metres.

### 2.2 `lieAt(geometry, pos, { bandM } = {})`

Returns `null` when `geometry` is null or `pos` is null. Otherwise:

```js
{ lie: 'green'|'sand'|'tee'|'fairway'|'rough'|null,
  water: boolean,                  // inside a water polygon
  feature: { kind, id, holes } | null,   // the polygon that decided it
  edgeM: number|null,              // distance to that polygon's edge (inside) or to the nearest polygon (rough)
  inQuestion: boolean,             // edgeM <= band
  alternatives: ['fairway', ...],  // the lies within the band, nearest first, without `lie`
  source: 'map' }
```

Priority when a point is inside more than one polygon `[design]`: green,
sand, tee, fairway (a bunker drawn over a fairway is sand; a green ring
overlapping a fairway is green). Water sets `water: true` and does not set
`lie` on its own (a ball in the water is a penalty, not a lie he plays from;
`PENALTY_TYPES` in `schema.js` already covers it and this spec does not
touch that flow).

**Rough** `[design]`: inside no polygon AND within 80 m of the nearest
polygon or hole line of the course. `feature` is the nearest polygon,
`edgeM` the distance to it. **Beyond 80 m from everything: `lie: null`** -
the honest answer is "off the map", never rough.

**Band** `[design]`: `bandM = max(4, pos.accuracyM ?? 0)`. The 4 m floor is
Opus's 2026-09-14 recommendation recorded in `docs/HANDOFF-native-build.md`
Section 4 item 6 (n = 5 lies, all matched, two within 4 m of an edge); he
has not set a number, so it is a default, not a rule. `inQuestion` is true
when `edgeM <= bandM`, and `alternatives` lists the lies of every polygon
within `bandM` of `pos` (plus `'rough'` when the point is inside a polygon
and within the band of its edge).

### 2.3 `toGreen(geometry, holeNumber, pos)`

Returns `null` for no geometry, unknown hole, or no `pos`. Otherwise, with
`G` = the hole's green ring and `C` = its centroid:

- `centreM` = distance `pos -> C`.
- `frontM`, `backM` = the first and last of `rayRingIntersections(pos, C, G)`.
  When `pos` is inside `G`: `frontM = 0`, `backM` = the far crossing.
  When the ray misses (concave ring, pos beside the green): `frontM` =
  `distanceToRing`, `backM` = the max distance from `pos` to any vertex.
- Yards: `frontYd`, `centreYd`, `backYd` = `Math.round(toYards(m))`.
- `uncertaintyYd` = `Math.round(toYards(pos.accuracyM))` when known, else
  null. This is the GPS's own number passed through, not an estimate.
- `greenId`.

Invariant: `frontM <= centreM <= backM` in every test.

### 2.4 `nearestHole(geometry, pos, { maxM = 60 } = {})`

Scores every hole by `min(distanceToPolyline(pos, line), distance to its tee
polygons and points (0 when inside), distance to its green (0 when inside))`.
Returns `null` when the best is farther than `maxM`. Otherwise:

```js
{ hole, distanceM, runnerUp: { hole, distanceM } | null, marginM, onTee: boolean, onGreen: boolean }
```

A shared tee box (11/18) yields `marginM` 0 between those two holes; the UI
in Part D treats `marginM < decisiveM` as "not decisive" and stays quiet.

### 2.5 Loader

`courseGeometry(course)` returns `VEENKER_GEOMETRY` when
`course?.geometry === 'veenker'`, else null. Static import; there is no
build step in this app `[measured]` and the APK copies all of `js/`
`[measured]` `android/tracker/app/build.gradle.kts` lines 47-61.

---

## 3. Part A tests - `test/run.js`, new group `'course geometry'`

One focused test per behaviour, sized like the neighbouring groups. Test
positions come FROM the data (centroids, line endpoints, offsets built with
`offsetPoint`), never typed coordinates.

1. Data integrity: 18 holes, each with a `greenId` present in `polygons`
   and at least one tee; hole 8 tees include 199418750 and 1065750025 and
   its green is 1065750750; hole 9 tees include 1065750754, 199289144,
   1065727838; hole 12 has a tee with both sets; holes 11 and 18 share a tee
   id; `points` has `hole16-back-blue` with `source: 'markup'`.
2. Every ring is closed (first equals last) and every hole line's last point
   is inside its green.
3. `pointInRing`: a green's centroid is inside it; the centroid offset 200 m
   north is not.
4. `lieAt`: hole 1's green centroid -> `green`; a bunker centroid -> `sand`
   with `feature.kind === 'bunker'`; hole 1's blue tee centroid -> `tee`; a
   fairway centroid -> `fairway`; a point 30 m off hole 7's line inside no
   polygon -> `rough` with `edgeM` set; a point 5 km away -> `lie: null`.
5. `lieAt` band: a point 2 m inside a green's edge with `accuracyM: 3` is
   `inQuestion` with `'rough'` or the adjacent polygon's lie in
   `alternatives`; the same green's centroid is not in question.
6. `toGreen` from each hole's first tee centroid, 18 holes: `front <= centre
   <= back`, `back - front` between 10 and 60 m, and `centreYd` within 12
   percent of the scorecard's blue yardage from `VEENKER.holes` (a hole
   line is straight tee to green and a dogleg's card yardage is not; report
   the largest deviation and its hole in the test name or a console line -
   n = 18, say so). If a hole misses 12 percent, do not widen the band:
   report it and keep the test red for Fable to rule on.
7. `toGreen` inside the green: `frontM === 0`.
8. `nearestHole` at every hole's green centroid returns that hole with
   `onGreen: true` (18/18); at the 11/18 tee centroid returns one of them with
   `marginM === 0`.
9. `courseGeometry(RADCLIFFE) === null` and every engine call returns null
   for it.

---

## 4. Part B - distance to the green on the play screen (Opus's UI)

`js/ui/screen-play.js` `[measured]`: `paint()` at line 403 sets `hudMeta` to
`Par 4 · 435 yd · HCP 7`; `tick()` runs on GPS events; `ctx.gps.current` is
the last fix or null when older than `staleFixMs` (4000 ms) `[measured]`.

- A second HUD line `hudGreen`, rendered whenever the round's course has
  geometry, from the first paint of the round to the last. Constant height;
  content changes, layout never does (the lie grid must not move; memory
  `project-play-screen-footer-anchor`). Radcliffe: the element is not
  created at all.
- Content on a fix: `GREEN 152 · F 143 · B 160 · ±3 yd`. Centre first and
  largest (that is the number he plays), front and back after it. No fix:
  `GREEN — · no fix`. On the green (`frontM === 0`): `ON THE GREEN · C 12 ·
  B 24 yd`.
- Updates in `tick()` at most every 1000 ms; no update while the pocket lock
  is engaged (nothing paints under the lock today; keep it so).
- Follows the CURRENT hole view (`hole()`), never a detected hole: he may be
  viewing hole 14 from the 15th tee and that is his call.
- Test, group `'distance to green (play screen)'`: mount the play screen on
  a Veenker round with a fake `ctx.gps` whose `current` is hole 1's tee
  centroid, and assert the line reads the `toGreen` numbers for hole 1; set
  `current` to null and assert `no fix`; mount on Radcliffe and assert no
  element. Follow the mounting pattern of the existing play-screen tests
  `[verify]`.

---

## 5. Part C - the lie proposed from position (Opus's UI)

Two places, both already asking him the lie today `[measured]`:

**C1. End-of-hole shot rows** (`screen-play.js` around lines 3052-3249: rows
`{ candidate, lie, lieInferred }`, `addTrackShot(hl, { lie, candidate,
lieInferred })`). For each row whose candidate has a position, call
`lieAt(geometry, candidatePos)`; when it returns a lie, preselect that lie
in the row's segmented control with `lieInferred: true`, and when
`inQuestion` is true add a one-line note under the control: `map: rough,
3 m from the fairway - check`. Row 0 stays `tee`. The lie is only written
when he confirms the rows, exactly as today; `lieInferred` already flows into
the shot `[measured]` and is not redefined. Never preselect when `lieAt`
returns `lie: null` or `water: true`.

**C2. The lie card after a mark burst** (around line 1255, `chosenLie`):
inside the card - never outside it, never in the footer - one muted line:
`map says: fairway` (or `map says: fairway, edge - could be rough` when in
question). It does NOT preselect a lie; the card is his tap, propose and
confirm.

Test, group `'lie from the map (end of hole)'`: build rows from candidates at
a fairway centroid and a bunker centroid and assert the preselected lies and
`lieInferred: true`; a candidate 5 km away leaves `lie: null`.

---

## 6. Part D - the hole suggested from position (Opus's UI)

A banner, not a state change (design principle; the auto-advance banner
already exists `[measured]`, reuse its component and dismissal pattern).

- In `tick()`, when not capturing, not editing, round in progress, and a
  current fix exists: `n = nearestHole(geometry, fix, { maxM: 40 })`. Show
  the banner when `n` is non-null, `n.hole !== hole().number`, `n.marginM >=
  60`, and (`n.onTee || n.onGreen`). Text: `You look to be on hole 5 (on its
  tee). GO TO 5` with one tap to `goToHole(5)` (the existing free navigation)
  and a dismiss. Asked once per `(current hole, suggested hole)` pair per
  round; dismissing it stays dismissed for that pair.
- `checkStartingHole` (line 1877) is unchanged; the learned-tee model stays
  as it is. This banner is additive.
- Test, group `'hole from the map (banner)'`: fix at hole 5's tee centroid
  while viewing hole 4 -> banner names 5; fix at the 11/18 tee while viewing
  1 -> no banner (margin 0); dismiss then same fix -> no banner.

---

## 7. Build, commit, APK

- Base: `c838d79` (the tree is clean there; the other session's ENTER SCORE
  job is committed and it makes no writes until Fable says so).
- Commit after each part, suite green each time, staged by name, never
  `git add -A`. Commit messages in the repo's voice. Author
  `rusty9645@gmail.com`; Opus's commits end with its own Co-Authored-By.
- The browser suite runs at `http://localhost:8123/test/` via `preview_start`
  name `golf-tracker` (never `python -m http.server`). Report the counts
  before and after (546/546 at `c838d79` per the other session, n = 1 run).
- `BUILD.id` in `js/data/build.js` and the `gt-shell-<id>` cache in `sw.js`
  move together to `v29`, date `2026-09-26`, on the LAST commit of the job
  (the suite enforces the pair). `REVISION` is not bumped - his call.
- After the last commit: `cd android/tracker && .\gradlew.bat assembleDebug`
  (the toolchain is installed; the previous APK was built here at
  `c838d79`). Report the APK path, size and `versionName`. Do not install:
  the install is on his word, done by Fable.
- Return `DONE <hash>` with: the parts built, the per-hole generator table,
  the test-6 largest deviation (hole and percent), suite counts, APK path.
  Or `BLOCKED <question>` at the first thing this spec does not answer;
  never guess a course fact.
