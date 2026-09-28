# SPEC - the Hole Overview page: the map, the photo, and the numbers for the hole

Fable, 2026-09-28, at xhigh (Matt set it: "effort is up"; `get_session self`
read `xhigh`). Revised the same day with his rulings on every number
(Section 2), at xhigh (his words: "effort is xhigh again"; `get_session self`
read `xhigh`). Written for Opus to build at xhigh
(`.claude/agents/opus-xhigh.md`). Fable reviews the diff against this file,
part by part, at xhigh, and signs in `docs/DECISIONS_LOG.md`.

**Status:** his words, 2026-09-28: *"Make all these edits in the spec and wrap
this session up. I will build everything in a new one"*. The session that
wrote this built nothing and made no repo writes. Section 13 is for the
session that builds.

**Revision 2, 2026-09-28, the building session ("Latest build setup"), at
xhigh (his words: "effort is up"; `get_session self` read `xhigh`):** the
three readings of ruling 16 and the deploy line are answered by him
(Section 2, rulings 17 to 20). Two of the three readings were wrong. Changed:
Page 1, Section 2, 6.3, 6.6 test 10, Section 8, Section 13.

## Page 1 - what you get

**What you get.** One control on the play screen, `MAP`, opens a page for the
hole you are on. The page shows the aerial photo of the hole with the map
drawn over it, and one table of numbers in two columns: **TEE** (from the tee
box you are playing) and **YOU** (from where you stand, live GPS). `PLAY`
in the same spot takes you back. Nothing about the round changes when you go
there or come back.

| On the page | What it reads |
|---|---|
| Green | front, center, back |
| Bunkers | to reach it, and to carry it |
| Water | the creek where a hole crosses it (holes 7, 11, 15, 16): to reach it, and to carry it. Ponds get no number |
| Creek carry off the tee | always on the page on holes 15 and 16, blue and gold together; on hole 16 the crossing short of the green |
| Layups | the numbers you type in on the phone, kept on the phone and in the export |
| Picture | the photo, the hole's shapes, a numbered marker on every bunker and creek crossing, your position |

**What is decided.** Every type of number on the page and how it is computed
is your ruling (Section 2). The three readings of your words that were
Fable's are answered by you (rulings 17 to 19).

**Nothing is built, pushed or installed by this document.** The session
"Yesterday's round review" had a writer in the working tree when this was
filed (the pin sheet, `docs/SPEC_hole-position.md`, builds v33 and v34, from
`1692724`). On your word this build waits for that session to finish. The
install is on your word.

His words that bound it, verbatim, 2026-09-28:

- *"There is another session running in this repo so do not touch it with out
  talking to the other session first. I want to integrate the map in to the
  app and have a "hole Overview" page I can toggle to. It should have approach
  distance (front center and back), lay up distances that I will add in
  later, bunker numbers (carry ideally), distance to the water and carry
  distance over water."*
- *"you are building it that is why I started this wait for that session to
  finish and effort is up"*
- *"remember that book is old. the course map I approved holds above it"*
- *"I want you to prompt on each type of number you are putting in the spec
  and how they should be computed"*
- *"add the carry number for the creek off 15 tees and the carry number for
  the creek on 16 should always be displayed on that hole as well. Make all
  these edits in the spec and wrap this session up. I will build everything
  in a new one"*

Standing, from the course map: *"The OSM map is correct I looked it over"*
(2026-09-13); *"yes to 10 based off OSM"* (sand from OSM's bunkers);
*"yes to 9 I already confirmed that with you. 12 is a single long tee box.
Golds towards the center blues at the back"* (2026-09-15).

Provenance tags: `[measured]` read from code or data this session, `[design]`
this spec's decision, `[verify]` Opus confirms during the build. Every
number carries its n.

Design rules that bind every line (repo CLAUDE.md Section 3): the golfer is
the source of truth about where he is, the app only suggests; measured and
inferred are never silently mixed; propose and confirm, never detect and
fill; nothing is guessed into course data.

---

## 0. What this is, and what it is not

**Is:** six parts, built and committed in this order, the suite green after
each:

- **Part A** - the numbers: new pure functions in the course-geometry engine.
- **Part B** - the pictures: 18 photo crops and the frame that places a
  position on them.
- **Part C** - his course notes: where layups are stored. A storage schema.
- **Part D** - the page, the `MAP` control, and the page from the home screen.
- **Part E** - hole 9's blue and gold tee boxes go into the map data.
- **Part F** - build id, offline list, the phone app's asset copy, the APK.

Order with the other job: one writer in the working tree at a time
(Section 8).

**Is not:** any change to `js/gps/*` (the GPS precision pipeline is
field-validated), to `js/analysis/*` (strokes gained), to
`js/round/track-analysis.js`, to `js/data/trackstore.js`, to the round
record's keys, `SCHEMA_VERSION` or `migrate()`, to the lock, to the recorder
or any Kotlin, to `REVISION`, to any stored round. It does not change
`toGreen`, `lieAt` or `nearestHole`. In `js/ui/screen-play.js` it adds the
hook in Section 6.2 and nothing else. No network: photos and data ship in the
APK. Nothing is taken from the yardage book (Section 12).

---

## 1. What exists today `[measured]`

| Piece | Where | State |
|---|---|---|
| The map | `js/data/geometry/veenker.js` (210,888 bytes) | 43 tee, 30 fairway, 27 bunker, 26 green, 3 water polygons; 18 hole lines of 2 to 5 points |
| The water | same | 2 ponds (37 m and 66 m across) and Ioway Creek as one polygon of 1,744 points, 6.9 km by 7.3 km |
| The engine | `js/round/course-geometry.js` | `courseGeometry`, `lieAt`, `toGreen`, `nearestHole` |
| Green on the play screen | `paintGreen`, `screen-play.js` 426-459 at `9e1a548` | `GREEN 152 - F 143 - B 160 - +/-3 yd`, from `toGreen` |
| The tee for a tee set | `mapTeeBox`, `screen-play.js` 165-173 | first box that carries the hole and the set; null on hole 9 and for white and red |
| The photo | `docs/course-map/veenker/basemap.png` | USDA NAIP 2025, 4200 x 3311 px, 16,350,678 bytes, 0.27 m per px east-west and 0.37 north-south |
| Storage | `js/data/store.js`, `schema.js` | `gt:app` and `gt:round:<id>` in localStorage; the export carries `app`, `rounds`, `tracks` |
| The phone app's files | `android/tracker/app/build.gradle.kts` 47-61 | copies `index.html`, the manifest, the icon, `css/`, `js/` (not `js/dev/`) |

Measured on the map this session, Fable's scratch prototype (Python, the same
plane maths as `js/util/geo.js`), n = 18 holes:

| Finding | Number |
|---|---|
| Holes whose line crosses the creek | 4: hole 7 (359 to 397 yd down the line), 11 (71 to 99), 15 (279 to 297), 16 (19 to 38 and 407 to 432) |
| How much the creek crossing moves with your line | hole 7, 300 yd down the hole: reach 59 on the line, 35 from 30 m left, 84 from 30 m right |
| Ponds beside a hole line | hole 3 (1.5 m from the line), hole 5 (2.8 m and 13.7 m), hole 2 (30 m from the green) |
| Bunker size, longest dimension | 7 to 28 m, n = 27 |
| Tee box reach (center to farthest corner) | 3.8 to 24.4 m, n = 25 boxes the TEE column measures from; the box holes 11 and 18 share is 23.6 m |
| Photo crops, 18 holes at 0.30 m per px, the frame rule of Section 4.1 | 1,432,152 bytes as WebP quality 80; every frame inside the photo, hole 5's after sliding 3 m |
| The map's labels of which hole a bunker belongs to | wrong: not used by this job (Section 10, follow-up 1) |

---

## 2. His rulings

All answered 2026-09-28, in the chat that wrote this spec. The answer column
is his choice as he made it; where he typed words, they are quoted.

| # | Item | His answer | Where it lands |
|---|---|---|---|
| 1 | Measured from | Both: tee and live GPS | 6.3, two columns |
| 2 | Page content | Aerial photo + numbers | Section 4, 6.3 |
| 3 | Layups, how entered | Entered on the phone | Section 5, 6.4 |
| 4 | Green, from where he stands | On your line: a straight line from him to the center of the green on the map; front is where that line enters the green, back is where it leaves; the same numbers as the play screen's GREEN line | 3.7, `toGreen` |
| 5 | Numbers from the tee | Map, from the tee box: a straight line on the map from the center of the tee box for his tee set | 3.5, 3.7 |
| 6 | Bunkers | Nearest / farthest point: reach is the nearest edge, carry is the farthest point, straight line, no aim line assumed | 3.7 |
| 7 | Creek crossings | Your line to the target: a straight line from where he stands to the next point of the hole (the corner, or the green center) | 3.6, 3.7 |
| 8 | Ponds | *"ignore"*; asked which he meant: No numbers for ponds | 3.4 |
| 9 | The creek beside a hole | No number | 3.4 |
| 10 | Layups, measured from | Both, you pick per number | 3.8, 6.4 |
| 11 | Which bunkers | Greenside to one hole | 3.4 |
| 12 | Hole 9 tees | Yes, add them | Section 7 |
| 13 | Accuracy | In the column header; numbers are whole yards | 6.3 |
| 14 | The page from the home screen | Yes | 6.7 |
| 15 | The yardage book | *"remember that book is old. the course map I approved holds above it"* | Section 12 |
| 16 | Creek carry off the tee | *"add the carry number for the creek off 15 tees and the carry number for the creek on 16 should always be displayed on that hole as well."* | 6.3 |

Answered 2026-09-28 in the building session's chat, each the option he
picked from a prompt that showed the example values:

| # | Item | His answer | Where it lands |
|---|---|---|---|
| 17 | Creek carry line, which tees ("off 15 tees") | Blue and gold together: both every time, whatever tee the round is on. Hole 15 reads `CREEK CARRY BLUE 255 - GOLD 223` | 6.3 |
| 18 | Creek carry line, where ("always be displayed on that hole") | Hole Overview page only: fixed under the top bar of the page on holes 15 and 16. The play screen is unchanged | 6.3 |
| 19 | Hole 16, which crossing ("the creek on 16") | Short of the green only: the crossing short of the green, measured from the tee. Blue 477, gold 415 | 6.3 |
| 20 | This session's job and the deploy | Build Hole Overview + deploy: the push and the phone install of everything on main (v31 to v35) are the building session's, each on his word | Section 8 |

The first draft's readings of 17 and 19 (the round's tee set only; both of
hole 16's crossings) were Fable's and were wrong. They are not built.

---

## 3. Part A - the numbers (Fable-owned code, built by Opus from this section)

New pure functions. No DOM, no storage. Positions are `{ lat, lon,
accuracyM? }`. Distances in the local tangent plane (`enuOffset`), never
haversine. Yards are `Math.round(toYards(m))`, as `toGreen` does.

**One ruler (his rulings 4 to 7): every number on the page is the
straight-line distance from the origin named at the top of its column to a
point on the map.** The TEE column is the YOU column computed from the tee
box center. The two columns run the same functions.

### 3.1 `js/util/polygon.js`, additions

- `projectOnPolyline(pt, line)` returns `{ distanceM, sM, leg, side }`: the
  nearest point of an open polyline, its distance from `pt`, its position
  along the line from the first vertex, the index of the END vertex of the
  leg it is on (1-based), and `side` +1 when `pt` is left of that leg's
  direction, -1 right, 0 on it.
- `segmentRingCrossings(a, b, ring)` returns `[{ tM, point }]`, ascending:
  where the segment `a -> b` crosses the ring. Built on
  `rayRingIntersections`, cut at the segment's length.
- `ringGapM(ringA, ringB)`: the smallest distance between two rings'
  boundaries; 0 when a vertex of either is inside the other.
- `ringSpanM(ring)`: the diagonal of the ring's east/north bounding box.

### 3.2 `js/round/course-geometry.js`, additions

Constants, all `[design]`, each with its evidence:

| Constant | Value | Evidence |
|---|---|---|
| `COMPACT_SPAN_M` | 150 | tells a pond from the creek: ponds 37 and 66 m, the creek 6.9 km (n = 3 water polygons) |
| `GREENSIDE_M` | 30 | see 3.4 |
| `BESIDE_LINE_M` | 35 | see 3.4 |
| `CORNER_M` | 30 | hole 3's line has a vertex 18 m after its start |
| `CROSSING_MATCH_M` | 80 | hole 16's two crossings are 369 yd apart; hole 7's moves 25 yd at 30 m off the line |

### 3.3 `holePath(geometry, holeNumber)`

The hole's `line`, with its last point replaced by the centroid of the
hole's green (the same center `toGreen` measures to). Null for no geometry or
an unknown hole.

### 3.4 `holeFeatures(geometry, holeNumber)`

The bunkers and creek crossings that get a number on this hole. Fixed per hole: it does
not depend on where he stands, so a marker on the picture never changes its
name while he walks. Cached per geometry and hole.

A polygon is **compact** when `ringSpanM(ring) <= COMPACT_SPAN_M`.

| Kind | Rule |
|---|---|
| Bunker, greenside | `ringGapM` to the green of any of the 18 holes is `<= GREENSIDE_M`: numbered on the ONE hole whose green is nearest (tie: the lower hole number), and on no other |
| Bunker, not greenside | numbered on every hole whose `holePath` passes within `BESIDE_LINE_M` of any vertex of its ring |
| Compact water (a pond) | NOT a feature on any hole: no name, no marker, no number (his ruling 8). It is drawn on the picture. No hole path crosses a pond `[measured]`, n = 18 holes, 2 ponds |
| Water that is not compact (the creek) | one feature for each place the `holePath` crosses it: an entry point and an exit point. Where it runs beside a hole without crossing, nothing (his ruling 9) |

Why the greenside rule: without it the bunkers at the 13th and 16th greens
are numbered on hole 2 at 38 to 52 yd from its tee, and the same at the tees
of holes 4, 5 and 12 `[measured]`, n = 7 such pairs.

Each feature:

```js
{ name: 'B1' | 'W1' | ...,   // B1.. and W1.., by ascending sM; ties by String(id)
  id, kind: 'bunker' | 'water',
  mode: 'beside' | 'cross',  // a bunker is 'beside', a creek crossing is 'cross'
  side: 'L' | 'R' | 'C',     // of the hole path at the feature; 'C' for a crossing
  sM, sMinM, sMaxM,          // down the hole path: its center, nearest and farthest vertex
  at: { lat, lon },          // where its marker is drawn (see below)
  entry: { lat, lon },       // crossings only: where the HOLE PATH enters the water
  exit: { lat, lon } }       // crossings only: where the HOLE PATH leaves it
```

`at` is the ring's centroid; for a crossing it is midway between `entry` and
`exit`.

Expected result, all 18 holes: Section 11, Table 1 (25 bunker rows, 5 creek
crossings, n = 30).

### 3.5 `teeOrigin(geometry, holeNumber, teeSet)`

| Case | Returns |
|---|---|
| One or more tee polygons carry the hole and the set | the centroid of the one whose centroid is farthest from the green's centroid; `accuracyM` = the distance from that centroid to its farthest vertex, rounded to 0.1; `source: 'map'`; `id` |
| None, and a `points` entry of kind `tee` carries the hole and the set | that point; `accuracyM: null`; `source: 'markup'`; `id` |
| Neither | `null` |

"Farthest from the green" is his hole 10 ruling (`veenker_confirmed_corrections.json`:
*"farther of the two blue boxes (560)"*). Hole 10 blue is the only hole and set
with two boxes `[measured]`, n = 1.

### 3.6 `playPath(geometry, holeNumber, origin)`

His line of play from `origin`. With `H = holePath` and `p =
projectOnPolyline(origin, H)`: `k = p.leg`; when `k` is not the last vertex
and `origin` is within `CORNER_M` of `H[k]`, `k = k + 1`. Returns `{ path:
[origin, H[k], ..., H[last]], originS: p.sM }`.

### 3.7 `holeNumbers(geometry, holeNumber, origin)`

Returns `null` for no geometry, unknown hole, or no `origin`. Otherwise:

```js
{ hole, originS,
  green: toGreen(geometry, holeNumber, origin),      // the same object the play screen's line reads
  features: [ { name, kind, mode, side,
                reachM, carryM, reachYd, carryYd,
                inside: boolean,                     // origin is inside the polygon
                behind: boolean,                     // feature.sMaxM < originS
                ownLine: true | false | null } ] }   // crossings only; null for 'beside'
```

| Mode | reach | carry |
|---|---|---|
| `beside` (bunker) | 0 when inside, else `distanceToRing(origin, ring)`: the nearest edge | the distance from `origin` to the farthest vertex of the ring |
| `cross` (the creek) | the distance from `origin` to where HIS line of play enters the water | the distance from `origin` to where it leaves |

The crossing on his own line: take `playPath(...).path`, collect
`segmentRingCrossings` leg by leg; when `origin` is inside the ring drop the
first; pair the rest in order as (entry, exit). The first pair whose
midpoint, projected on the hole path, lies between `sMinM - CROSSING_MATCH_M`
and `sMaxM + CROSSING_MATCH_M` is this feature's: `ownLine: true`. When no
pair matches, reach and carry are measured to the feature's own `entry` and
`exit` (the hole path's crossing) and `ownLine: false`; the page marks that
row.

Why his own line and not the hole's: the creek crosses at an angle. On hole 7
the same carry is 74, 97 or 116 yd from 30 m left, on the line, and 30 m
right `[measured]`, n = 3 positions.

### 3.8 `layupPoint(geometry, holeNumber, layup, tee)`

| `layup.ref` | The point |
|---|---|
| `'green'` | on the hole path, searching back from the green: the first point whose straight-line distance to the green's centroid is `layup.yards` |
| `'tee'` | on `playPath(geometry, holeNumber, tee).path`, searching forward from the tee: the first point whose straight-line distance from `tee` is `layup.yards` |

Returns `{ lat, lon }`, or `null` when no point of the path is at that
distance, or when `ref` is `'tee'` and `tee` is null. Nothing about the point
is stored; it is derived on read from the number he typed.

### 3.9 Part A tests - `test/run.js`, new group `'hole overview (numbers)'`

One focused test per behaviour, sized like the `'course geometry'` group.
Positions come from the data (centroids, path points, offsets built with
`offsetPoint`). Expected yardages are Fable's prototype, an independent
implementation; tolerance 1 yd.

| # | Behaviour | Test |
|---|---|---|
| 1 | The tee for a set | hole 10 blue is box 1065741882; hole 16 blue is `hole16-back-blue`, `source: 'markup'`, `accuracyM: null`; hole 1 white is `null`; holes 11 and 18 blue return the same box |
| 2 | What is numbered | `holeFeatures` for all 18 holes gives the names, kinds and sides of Section 11 Table 1 |
| 3 | A greenside bunker has one hole | bunker 1065746512 is on hole 13 and not hole 2; 1065741609 is on hole 16 and not holes 2 or 4 |
| 4 | A bunker's numbers, and no pond | hole 3 from the blue tee: B1 278 / 293; `holeFeatures` has no `water` on holes 2, 3 and 5 |
| 5 | Crossing from the tee | hole 7 blue W1 360 / 398; hole 11 blue W1 63 / 90; hole 15 blue W1 244 / 255 and gold 211 / 223; hole 16 blue W1 80 / 99 and W2 457 / 477, gold W1 17 / 35 and W2 394 / 415 |
| 6 | His own line | hole 7, 300 yd down the path: W1 59 / 97 on it, 35 / 74 from 30 m left, 84 / 116 from 30 m right; `ownLine: true` all three |
| 7 | Behind, and inside | from hole 7's green centroid W1 is `behind`; from a bunker's centroid `reachM === 0` and `inside` |
| 8 | Layup points | hole 7 `green` 100: a point on the path, 100 yd from the green centroid; `tee` 250 from the blue tee: 250 yd from it; hole 8 `green` 400: `null`; `tee` with no tee: `null` |
| 9 | The green is one function | `holeNumbers(...).green` deep-equals `toGreen(...)` for the same origin |
| 10 | No map | every function above returns `null` or `[]` for `courseGeometry(RADCLIFFE)` |

---

## 4. Part B - the pictures

### 4.1 Generator: `tools/course-geometry/build_hole_images.py`

Python 3 with Pillow (12.3.0 is installed `[measured]`). Reads
`docs/course-map/veenker/basemap.png`, `basemap_true_extent.json` (the TRUE
extent, README trap 2) and the generated `js/data/geometry/veenker.js`.
Writes 18 images and one module. Re-runnable.

The frame of hole n `[design]`:

| Item | Rule |
|---|---|
| Up | the direction from the hole line's first point to the green's centroid: tee at the bottom, green at the top |
| What must be inside | the hole line; the green; the hole's tee boxes and tee points; every vertex of a fairway, bunker or compact water polygon that lies within 60 m of the hole line |
| Margin | 25 m on all four sides |
| Shape | width at least 0.50 of height; widen equally both sides when narrower |
| The photo's edge | when a corner of the frame would fall outside the photo, the frame slides sideways, 1 m at a time, until all four corners are inside |
| Scale | 0.30 m per px, square |
| File | `img/veenker/hole-NN.webp`, WebP quality 80 |

Expected `[measured]` on the prototype, n = 18: widths 518 to 1,046 px,
heights 779 to 2,092 px, 24,188 to 164,292 bytes each, 1,432,152 bytes
total; one frame slides (hole 5, 3 m). The generator prints the table and
the total. A frame that cannot be brought inside the photo, or that loses
any of "what must be inside" by sliding, is a failure, exit non-zero.

### 4.2 The module: `js/data/geometry/veenker-frames.js`, generated

```js
export const VEENKER_FRAMES = {
  courseId: 'veenker',
  source: { photo: 'USDA NAIP 2025, Iowa Geographic Map Server (public domain)',
            generator: 'tools/course-geometry/build_hole_images.py',
            inputsSha256: { basemap: '...', extent: '...', geometry: '...' } },
  holes: [ { number: 7, file: 'img/veenker/hole-07.webp',
             widthPx: 1046, heightPx: 2092, mPerPx: 0.3,
             origin: { lat, lon },            // the hole line's first point
             up: { east, north },             // unit vector
             u0M, v0M,                        // the frame's lower-left corner, metres along up and along right
             bytes, sha256,
             control: [ { name: 'lineStart', lat, lon, x, y },
                        { name: 'greenCentre', lat, lon, x, y } ] }, ... 18 ],
};
```

### 4.3 In the engine

- `courseFrames(course)`: `VEENKER_FRAMES` when `course?.geometry ===
  'veenker'`, else null.
- `framePx(frame, pos)` returns `{ x, y }` in image pixels, y down:
  `o = enuOffset(frame.origin, pos)`; `u = o.east * up.east + o.north *
  up.north`; `v = o.east * up.north - o.north * up.east`; `x = (v - v0M) /
  mPerPx`; `y = heightPx - (u - u0M) / mPerPx`.

### 4.4 Part B tests - group `'hole overview (pictures)'`

| # | Behaviour | Test |
|---|---|---|
| 1 | The frame places a position | every `control` point projects within 1.0 px of its recorded `x, y`, n = 36 |
| 2 | Everything numbered is in the picture | for all 18 holes every feature's `at`, the green centroid and the blue and gold `teeOrigin` land inside the image |
| 3 | The files are what the module says | each of the 18 images loads, and its natural width and height equal `widthPx` and `heightPx` |

---

## 5. Part C - his course notes: where layups live (storage schema, Fable-owned)

Named "course notes" so that nothing here is taken for the yardage book.

### 5.1 The record

One localStorage key per course: **`gt:course:<courseId>`**.

```js
{ schemaVersion: 1,                 // COURSE_NOTES_VERSION; the round and app SCHEMA_VERSION does not move
  courseId: 'veenker',
  layups: [ { id: 'l_<uuid>',
              hole: 7,                        // course hole number
              ref: 'green' | 'tee',           // what the number is measured from
              yards: 100,                     // integer, exactly as he typed it
              teeSet: null | 'blue' | ...,    // the tee set, when ref is 'tee'; null when 'green'
              label: null | 'short of creek', // his words, 24 characters at most
              createdAt, updatedAt } ],       // ISO
  updatedAt }
```

Why its own key and not inside `gt:app` `[design]`: `loadApp` returns a fresh
`newAppState()` when `gt:app` cannot be read, and `boot()` saves it straight
away through `setTheme` `[measured]` (`store.js` 72-74, `app.js` 78 and
386). Settings come back as defaults and the course model is rebuilt from the
rounds; typed layups would be gone. A key that is written only when he edits
a layup is not in that path.

Design rule 1 of the data model holds: what is stored is what he typed. No
position, no derived distance.

### 5.2 `js/data/schema.js`, additions only

`COURSE_NOTES_VERSION = 1`; `newCourseNotes(courseId)`; `newLayup({ hole, ref,
yards, teeSet, label })`; `migrateCourseNotes(payload)` (v1 is the floor, a no-op with the
same shape as `migrate`). `newLayup` returns `null` for: `yards` not an
integer from 1 to 700; `ref` not `'green'` or `'tee'`; `ref: 'tee'` with no
`teeSet`; `hole` not an integer from 1 to 18. It trims `label` and stores an
empty one as `null`. It stores `teeSet: null` when `ref` is `'green'`.

`SCHEMA_VERSION`, `newAppState`, `newRound`, `newHole`, `newShot`, `migrate`:
untouched.

### 5.3 `js/data/store.js`, additions

| Function | Behaviour |
|---|---|
| `courseNotesKey(courseId)` | `'gt:course:' + courseId` |
| `loadCourseNotes(courseId)` | the stored notes through `migrateCourseNotes`; with no key, `newCourseNotes(courseId)` and NOTHING is written |
| a damaged value | when the key holds text that does not parse: the text is copied to `gt:course:<courseId>:bad:<Date.now()>`, the storage-error listeners are told, and empty notes are returned with `recoveredFrom` naming that key. The damaged text is never deleted |
| `saveCourseNotes(notes)` | sets `updatedAt`, writes through `writeRaw`; returns false and tells the listeners on a full quota, as every other write does |
| `allCourseNotesIds()` | the course ids that have a notes key (not the `:bad:` copies) |

### 5.4 Export and import

| Path | Change |
|---|---|
| `buildExport` | adds a sibling `courseNotes: { <courseId>: notes }` for every notes key. `formatVersion` stays 1. `rounds` and `app` are byte for byte what they were, so a round's `hole.pinSheet` (`docs/SPEC_hole-position.md`) rides through untouched |
| `importExport`, merge | for each course's notes in the file: a layup whose `id` is not on the phone is added; one that is already there is left as it is on the phone. Nothing is removed. The report gains `layupsAdded` |
| `importExport`, replace | each course's notes in the file replace the phone's for that course. A course with no notes in the file keeps the phone's |
| A file from before this build | has no `courseNotes` key: imports exactly as today |
| The boot-failure rescue in `index.html` | already writes every `gt:` key `[measured]`; unchanged |

### 5.5 Part C tests - group `'course notes (layups)'`

| # | Behaviour | Test |
|---|---|---|
| 1 | What is stored is what he typed | `newLayup` with 100, `green`: `yards === 100`, `teeSet === null`; the five rejections in 5.2 return `null` |
| 2 | Round trip | `saveCourseNotes` then `loadCourseNotes` deep-equal; `loadCourseNotes` with no key writes nothing (key count unchanged) |
| 3 | Damaged notes are kept | the key set to `{bad`: `loadCourseNotes` returns empty notes with `recoveredFrom`; that key holds `{bad` |
| 4 | The export carries the notes | `buildExport(...).courseNotes.veenker` equals the notes; `rounds` is identical to an export taken before the notes existed |
| 5 | Import, merge | a file layup not on the phone is added; one with the same `id` and different `yards` leaves the phone's number |
| 6 | Import, replace; and an old file | the file's notes replace; a file with no `courseNotes` leaves the phone's notes alone |
| 7 | The round rails did not move | `SCHEMA_VERSION === 1`; a round saved before and after a layup edit is byte-identical |
| 8 | A full quota is loud | `saveCourseNotes` under a throwing `setItem` returns false and the listener fires |

---

## 6. Part D - the page (Opus's UI, to these rules)

### 6.1 The component: `js/ui/hole-overview.js`

`holeOverview({ course, geometry, frames, teeSet, holes, holeNumber, getFix,
onClose })` returns `{ el, tick, close }`. `getFix` returns the current fix
or null (the play screen passes `() => ctx.gps.current`, which is null when
the last fix is older than 4 s `[measured]`). It reads and writes his course
notes through `loadCourseNotes` and `saveCourseNotes`. It writes nothing else.

### 6.2 The hook in `js/ui/screen-play.js` - the whole of it

| Item | Rule |
|---|---|
| The control | one button, `MAP`, a fourth control at the right end of the hole navigation row |
| When it exists | a live round on a course with a map and frames. Not in edit mode: the hook tests `editing` itself, because `docs/SPEC_hole-position.md` Section 6.4 gives edit mode a map. Never created for Radcliffe |
| What it does | appends the page over the play screen, inside the play screen's own element. The play screen is NOT rebuilt: no `ctx.go`, no `render()` |
| Going back | `PLAY` on the page, in the same place on the screen as `MAP` |
| The heartbeat | the play screen's `tick()` calls the page's `tick()` while it is open |
| The round | opening and closing change nothing in the round and save nothing |

Why inside the play screen and not a screen of its own: `ctx.go` rebuilds the
play screen, and the capture in progress, the lie still being asked for, and
the UNDO banner are in memory `[measured]` (`screen-play.js` 202-232). A page
he goes to on every shot must not cost him those.

### 6.3 What the page shows

| Block | Content |
|---|---|
| Top bar, fixed | previous hole, `HOLE 7 - PAR 5`, next hole, `PLAY`; under it the tee and the card: `BLUE - CARD 590` |
| Creek carry off the tee, fixed, holes 15 and 16 only | see "The creek carry off the tee" below |
| Picture | the hole's photo; over it the outlines of the green, bunkers, water (creek and ponds) and fairways, the hole path, a marker with its name on every feature, `T` at the tee origin, a tick with its yards at every layup point, and his position with its accuracy ring. A pond has an outline and no marker. Position outside the picture: an arrow at the edge toward it |
| Table | two number columns, TEE and YOU. Rows: GREEN F, C, B; then each feature down the hole (`B1 L`, `W1`), `reach / carry`; then each layup |
| Layups | `+ LAYUP`; each row opens its own edit sheet |

Column rules:

| State | TEE column | YOU column |
|---|---|---|
| Header | `BLUE TEE +/-11 yd` (the box reach); `BLUE TEE (your mark)` for a markup point | `YOU +/-3 yd` (the fix's own accuracy) |
| No tee on the map for the set | one line: `no BLUE tee box on the map` | - |
| No fix | - | one line: `no fix`; every number a dash |
| Feature behind him | - | `behind` |
| He is inside it | - | `IN IT` |
| A crossing not on his own line (`ownLine: false`) | marked `hole line` | marked `hole line` |
| Layup, `ref: 'green'` | distance from the tee origin to the layup point | distance from him to the layup point; the row is labelled with what it leaves: `100 out` |
| Layup, `ref: 'tee'` | the number he typed | distance from him to the layup point; shown only when the page's tee set is the layup's `teeSet` |

**The creek carry off the tee (his rulings 16 to 19).** On holes 15 and 16
one line sits directly under the top bar of the Hole Overview page and stays
there: it does not scroll, it is there with no fix, it is there when he is
past the creek, and it is there when the picture fills the screen. It is
never replaced by `behind`. It is not on the play screen (ruling 18).

The line carries blue and gold together, every time, whatever tee set the
page is on (ruling 17):

| Hole | Crossing | The line |
|---|---|---|
| 15 | `W1`, the only one | `CREEK CARRY BLUE 255 - GOLD 223` |
| 16 | `W2`, short of the green (ruling 19) | `CREEK CARRY BLUE 477 (your mark) - GOLD 415` |

Each number is the TEE column's carry for that crossing from that set's tee:
`holeNumbers(geometry, hole, teeOrigin(geometry, hole, set))` for `set` in
`'blue'`, `'gold'`, the `carryYd` of the named `cross` feature. Expected
values above are Fable's prototype `[measured]`, n = 4 tee origins. Hole 16
blue measures from his markup point (`teeOrigin(...).source === 'markup'`),
and the line says so: `(your mark)`. A set with no tee on the map reads a
dash in its place: `BLUE -`. Hole 16's crossing in front of the tee (`W1`,
blue 99, gold 35) is NOT on the line. The table is unchanged by rulings 17
to 19: every crossing, `W1` and `W2` on hole 16, keeps its row and its TEE
and YOU numbers for the page's tee set.

Which holes carry the line and which crossing each reads is a list in the
page's code, `{ 15: 'W1', 16: 'W2' }`, with his words beside it; it is not
derived. Fit `[design]`: 16 px or more; when it does not fit 360 px on one
line it breaks after the blue number, it does not shrink and does not scroll
sideways.

The hole shown `[design]`: the page opens on the play screen's current hole.
The two arrows look at other holes and change only what the page shows, never
`round.currentHoleIndex`.

The picture `[design]`: a tap on it fills the screen with it; a tap again
returns. Filled, each marker carries the YOU numbers (the TEE numbers with no
fix). There is no pinch: `index.html` turns page zoom off on purpose
`[measured]`.

When the photo does not load: the outlines are drawn on a plain ground, same
markers, same numbers. The map is the data; the photo is a backdrop.

### 6.4 Layup entry

`+ LAYUP` opens a sheet: the number (yards, numeric keypad), `LEAVES TO THE
GREEN` or `FROM THE TEE`, a label (optional), `SAVE`. A number `newLayup`
rejects is said in one line and nothing is saved. A `green` layup longer than
the hole (`layupPoint` null) is saved and shown without a point on the
picture, its YOU and TEE cells a dash. A row's sheet has the same fields and
`DELETE`; delete asks once (`confirmSheet`) and then offers `RESTORE` in the
toast, the way UNDO does today.

No single touch adds, changes or removes a layup: every change is a typed
number and `SAVE`, or `DELETE` and its confirmation.

### 6.5 Fit and reach, at his page size 360 x 728

| Rule | Number |
|---|---|
| Horizontal scroll | none |
| YOU green center | 40 px, the play screen's size |
| Every other YOU number | 24 px or more |
| TEE numbers | 18 px or more |
| Tap targets | 48 px or more, 8 px or more between them |
| The top bar | stays while the rest scrolls |
| The play screen | every existing fold, lie-card and green-line test stays green with the fourth control in the row |

Default layout, Opus may change it inside the rules above:

```
+----------------------------------------+
| < 6 |  HOLE 7 - PAR 5  | 8 > |  PLAY   |
| BLUE - CARD 590                        |
+-------------------+--------------------+
|                   | YOU  +/-3 yd       |
|   photo           | GREEN   264        |
|   markers         | F 250    B 279     |
|   T  B1  W1  o    | W1   59 / 97       |
|                   |--------------------|
|   (tap: fills     | BLUE TEE +/-11 yd  |
|    the screen)    | GREEN 547/562/577  |
|                   | W1   360 / 398     |
+-------------------+--------------------+
| LAYUPS                      [+ LAYUP]  |
| 100 out       YOU 164      TEE 462     |
+----------------------------------------+
```

### 6.6 Part D tests - group `'hole overview (page)'`

Mounted the way `'distance to green (play screen)'` mounts (`test/run.js`
5791-5876 at `9e1a548`), with the shipped stylesheet at 360 x 728.

| # | Behaviour | Test |
|---|---|---|
| 1 | `MAP` is always there | present on a fresh hole, after a mark, with a lie pending, on a completed hole; absent on Radcliffe and in edit mode |
| 2 | One green | with a held fix, the page's YOU green numbers equal the play screen's green line |
| 3 | No fix | YOU reads `no fix`; TEE still has its numbers |
| 4 | Going there costs nothing | with a lie pending and an UNDO banner up: open, close; both are still there; `currentHoleIndex` unchanged; `persistRound` not called |
| 5 | Looking is not moving | the page's next-hole arrow changes the hole shown; `currentHoleIndex` unchanged |
| 6 | Layups through the sheets | add, edit, delete, restore: his course notes change; the round's JSON is byte-identical before and after |
| 7 | Fit | the rules of 6.5 on hole 11 (4 features) with 2 layups, on hole 16 (3 features and the creek line), and on hole 1 (none) |
| 8 | No photo | the image request fails: outlines and markers are drawn, numbers unchanged |
| 9 | One tap back | with the page open, `PLAY` returns to the play screen on the same hole |
| 10 | The creek carry off the tee stays | hole 15 reads blue 255 and gold 223, hole 16 reads blue 477 with `(your mark)` and gold 415, and neither 99 nor 35 is on hole 16's line; the line is the same on a blue round, a gold round and a white round; the play screen has no such line; it is present with no fix, with a fix on the green, with the table scrolled to its end and with the picture filling the screen; hole 7 and hole 11 have no such line |
| 11 | A pond has no number | hole 3 and hole 5: the table has no water row and the picture has no `W` marker |

### 6.7 The page from the home screen (his ruling 14: Yes)

A `COURSE MAP` button on the home screen for a course with a map; a screen
`map` in `js/app.js` that mounts the same component with `getFix: () => null`,
holes 1 to 18, a tee-set selector starting at `teeByCourse[courseId]`, and
`PLAY` replaced by `HOME`. GPS is not started, so there is no YOU column.
`sw.js` `SHELL` gains any new module this adds. One test: the screen mounts
with no round, shows the TEE column and, on hole 15, the creek line; a layup
typed there is in his course notes.

---

## 7. Part E - hole 9's tee boxes in the map data (his ruling 12: Yes, add them)

Today no box on hole 9 carries a set `[measured]`, so hole 9 has no TEE
column for any tee set.

| Step | What |
|---|---|
| Input | `docs/course-map/veenker/veenker_confirmed_corrections.json`, `hole9` gains `blue_tee_osm_id: 1065750754` and `gold_tee_osm_id: 199289144` |
| Authority | `docs/course-map/veenker/README.md`, Confirmed facts: *"The back box is blue (537 yd along the hole line) and the next box gold (491 yd): his "yes to 9", 2026-09-15"*; the ids are `docs/handoff/REPORT_1.1.md` line 126 |
| Generator | `build_veenker.py` rule (2) gives those two boxes their set. The third hole 9 box, 1065727838, stays with no set |
| Expected diff in `veenker.js` | the `sets` of those two polygons and `source.inputsSha256.corrections`. Anything else: `BLOCKED` |
| Test | `teeOrigin(G, 9, 'blue').id === 1065750754`, gold 199289144; from the blue box the green reads 496 / 513 / 530 and B1 472 / 480, B2 493 / 511; from the gold box 457 / 473 / 490 and B1 432 / 440, B2 454 / 473 (Fable's prototype, tolerance 1 yd); the existing `'course geometry'` group stays green |
| What else it changes | `mapTeeBox` (shot 1 in end-of-hole entry) starts returning a box on hole 9. That is `docs/SPEC_shot-places.md` 3.3 working as written. The round-review session was told on 2026-09-28 and agreed: *"After your Part E, a map tee on hole 9 gets a position; nothing in D1 depends on it being absent."* |

---

## 8. Part F - build, commit, APK

- **Base:** the hash at which main is clean AND the session "Yesterday's
  round review" has said it has no writer running. Its revision 4.2 is in
  (`77f89df`, v32); its pin sheet job (`docs/SPEC_hole-position.md`, Part A
  v33 then Part B v34) had a writer in the tree from `1692724` when this was
  filed. It hands over with one document in `docs/handoff/` and a message
  that main is clean. Opus does not start before that.
- **The deploy.** Relayed by that session, his words in its chat,
  2026-09-28: *"okay you will not deploy this on my phone. When you are done
  hand it off to the other repo and it will fold this into the map feature
  build and deploy it."* Confirmed by him in the building session's chat,
  2026-09-28 (ruling 20): the push and the phone install of everything on
  main (v31 to v34 and this build) are the building session's, each on his
  word. Opus neither pushes nor installs.
- **Files both jobs write:** `js/ui/screen-play.js`, `js/data/schema.js`,
  `test/run.js`, `test/index.html`, `sw.js`, `js/data/build.js`. That job
  does not write `js/round/course-geometry.js`, `js/util/polygon.js`,
  `js/data/store.js`, the map data or the generator `[measured]` (its
  Section 10); this job does not write `js/round/round.js`,
  `js/round/hole-position.js` or `js/analysis/*`.
- **One writer:** `opus-xhigh`, in the background. Fable makes no repo writes
  while it runs.
- Commit after each part, suite green each time, staged by name, never
  `git add -A`. Author `rusty9645@gmail.com`.
- The suite runs at `http://localhost:8123/test/` through `preview_start`
  name `golf-tracker`. Counts before and after are reported with n.
- `BUILD.id` and the `gt-shell-<id>` cache move together, on the LAST
  commit, to the next id free on main at that moment: v35 as things stood on
  2026-09-28 (v33 and v34 are `docs/SPEC_hole-position.md`'s). `REVISION` is
  not bumped.
- `sw.js` `SHELL` gains `./js/ui/hole-overview.js` and
  `./js/data/geometry/veenker-frames.js` (the suite requires every statically
  imported module). The 18 images are NOT in `SHELL`: a failed image would
  fail the whole offline install. On the web build a photo is cached the
  first time it is seen; the phone app has them in the APK.
- `android/tracker/app/build.gradle.kts`, `copyWebAssets`: one line,
  `from(File(repoRoot, "img")) { into("img") }`. No other change under
  `android/`.
- After the last commit: `cd android/tracker && .\gradlew.bat assembleDebug`.
  Report the APK path, size and `versionName`, and that `img/veenker/` is in
  it (18 files). Do not install.
- Return `DONE <hash>` with: parts built, the generator tables, the image
  byte total, suite counts, the APK line, and three screenshots at 360 x 728
  (holes 1, 11 and 16, page open, a held fix). Or `BLOCKED <question>` at the
  first thing this spec does not answer. Never guess a course fact.
- **Must not touch:** everything in Section 0's "Is not"; in
  `screen-play.js` anything but 6.2.

Cost, stated before the spawn: the two xhigh Opus builds on file ran 20 min /
238k tokens (course map Parts A to C) and 126 min / 610k tokens (native
shell), n = 1 each. This job has six parts; no build of this shape is on
file.

---

## 9. Limits, stated

| Limit | Number `[measured]` |
|---|---|
| The TEE column measures from the CENTER of the tee box | the markers can be 3.8 to 24.4 m from it (n = 27 boxes, hole 9's two included); the column header says so |
| Blue and gold read the same where they share a box | holes 1, 4, 11, 12, 13, 14, 18 |
| Straight line from the tee is not the card on a dogleg | hole 15 blue: 338 yd to the green center, card 420; the card is shown beside it |
| A carry over the creek depends on the line | hole 7: 74 to 116 yd across 60 m of width (n = 3) |
| Ponds get no number (his ruling 8) | holes 2, 3 and 5; drawn on the picture |
| The creek beside a hole, not across it, gets no number (his ruling 9) | within 45 m of the line on holes 2, 4, 8, 14, 17 at the tee end; it is drawn on the picture |
| The creek carry off the tee on hole 15 is past the corner | the line of play from the tee box goes to the corner first; the carry is the straight line from the box to where the hole's line leaves the water: blue 255, gold 223 |
| Two mapped bunkers are numbered on no hole | ids 1065730098 and 1065751161, 79 m and 74 m from the nearest hole line |
| White and red tees | no box on the map carries them: no TEE column |
| The YOU column is as good as the fix | its own accuracy is in the header |
| Photo and map are two sources | photo: NAIP 2025; shapes: OSM, which he checked over that photo |

---

## 10. Follow-ups noticed, not in this job

1. **The map's hole labels on bunkers and fairways are wrong.**
   `build_veenker.py`'s `centroid()` works in absolute planar coordinates
   (`rematch.py` line 22) and loses the position: against the true centroid it
   is off by a median 27.7 m and up to 1,310.6 m; 41 of 57 polygons are off by
   more than 10 m `[measured]`. Bunker 1065746149, 11 m from hole 12's line,
   is labelled hole 2. Labels only; `lieAt` does not depend on them and this
   job does not read them.
2. `mapTeeBox` (`screen-play.js`) and `teeOrigin` answer the same question.
   They agree on all 18 holes today (hole 10 blue by list order, n = 1). One
   function should serve both.
3. His markup tips could place blue and gold inside a shared box. His call.
4. The Android back key leaves the app from an open sheet (logged
   2026-09-26, his call). The same is true from this page.
5. When the pin-sheet item (D1 of `docs/SPEC_shot-places.md`) is built, the
   page's green rows can read the pin.

---

## 11. Reference tables (Fable's prototype, n = 18 holes)

### Table 1 - what is numbered on each hole

| Hole | Numbered on the picture, down the hole from tee to green |
|---|---|
| 1 | none |
| 2 | none |
| 3 | B1 bunker right |
| 4 | B1 bunker left; B2 bunker right; B3 bunker left |
| 5 | B1 bunker right |
| 6 | B1 bunker left |
| 7 | W1 creek crossing |
| 8 | B1 bunker left; B2 bunker right |
| 9 | B1 bunker right; B2 bunker right |
| 10 | B1 bunker left; B2 bunker right; B3 bunker left |
| 11 | W1 creek crossing; B1 bunker left; B2 bunker right; B3 bunker right |
| 12 | B1 bunker left; B2 bunker right |
| 13 | B1 bunker right |
| 14 | B1 bunker right |
| 15 | W1 creek crossing; B1 bunker left; B2 bunker right |
| 16 | W1 creek crossing; W2 creek crossing; B1 bunker left |
| 17 | B1 bunker right; B2 bunker right |
| 18 | none |

### Table 2 - the TEE column as the map has it today (yards)

Hole 9 is as it will be after Part E.

| Hole | Tee | Box reach m | Green F / C / B | Card | Reach / carry |
|---|---|---|---|---|---|
| 1 | blue, gold | 17.1 | 409 / 421 / 432 | 435, 419 | none |
| 2 | blue | 11.6 | 328 / 337 / 346 | 334 | none |
| 2 | gold | 18.6 | 275 / 284 / 294 | 283 | none |
| 3 | blue | 11.1 | 297 / 304 / 314 | 333 | B1 278 / 293 |
| 3 | gold | 9.0 | 277 / 284 / 294 | 289 | B1 258 / 273 |
| 4 | blue, gold | 10.0 | 320 / 329 / 337 | 349, 340 | B1 311 / 325; B2 302 / 312; B3 341 / 350 |
| 5 | blue | 7.5 | 381 / 394 / 407 | 402 | B1 369 / 386 |
| 5 | gold | 24.4 | 323 / 336 / 349 | 350 | B1 312 / 329 |
| 6 | blue | 14.8 | 178 / 193 / 210 | 210 | B1 168 / 199 |
| 6 | gold | 9.2 | 139 / 155 / 172 | 185 | B1 129 / 160 |
| 7 | blue | 9.7 | 547 / 562 / 577 | 590 | W1 360 / 398 |
| 7 | gold | 9.6 | 495 / 510 / 525 | 531 | W1 308 / 346 |
| 8 | blue | 7.1 | 154 / 169 / 183 | 181 | B1 140 / 156; B2 150 / 164 |
| 8 | gold | 12.0 | 142 / 159 / 173 | 157 | B1 131 / 147; B2 138 / 152 |
| 9 | blue | 5.8 | 496 / 513 / 530 | 537 | B1 472 / 480; B2 493 / 511 |
| 9 | gold | 15.8 | 457 / 473 / 490 | 495 | B1 432 / 440; B2 454 / 473 |
| 10 | blue | 3.8 | 514 / 529 / 542 | 560 | B1 501 / 521; B2 512 / 527; B3 548 / 556 |
| 10 | gold | 15.8 | 459 / 473 / 486 | 473 | B1 445 / 465; B2 457 / 472; B3 492 / 500 |
| 11 | blue, gold | 23.6 | 132 / 141 / 150 | 155, 134 | W1 63 / 90; B1 131 / 138; B2 146 / 157; B3 154 / 164 |
| 12 | blue, gold | 13.4 | 280 / 291 / 300 | 330, 306 | B1 280 / 292; B2 272 / 296 |
| 13 | blue, gold | 18.8 | 132 / 144 / 156 | 160, 144 | B1 116 / 132 |
| 14 | blue, gold | 13.8 | 380 / 394 / 408 | 416, 397 | B1 373 / 383 |
| 15 | blue | 6.6 | 325 / 338 / 351 | 420 | W1 244 / 255; B1 334 / 342; B2 330 / 341 |
| 15 | gold | 10.0 | 300 / 313 / 326 | 386 | W1 211 / 223; B1 307 / 315; B2 306 / 317 |
| 16 | blue | his mark | 500 / 509 / 519 | 544 | W1 80 / 99; W2 457 / 477; B1 521 / 530 |
| 16 | gold | 13.3 | 438 / 447 / 457 | 485 | W1 17 / 35; W2 394 / 415; B1 460 / 469 |
| 17 | blue | 8.4 | 154 / 176 / 196 | 182 | B1 148 / 164; B2 157 / 175 |
| 17 | gold | 16.2 | 120 / 142 / 162 | 152 | B1 114 / 130; B2 123 / 141 |
| 18 | blue, gold | 23.6 | 509 / 524 / 540 | 534, 521 | none |

---

## 12. The yardage book

His ruling 15: *"remember that book is old. the course map I approved holds
above it"*. Reason: the book is old and the map is the one he checked and
approved. **Nothing in this build is taken from the book**: no number, no aim
point, no layup, no tee yardage.

For the record only `[measured]`, 2026-09-28: Fable read the 23 photos in
`docs/Veenker/` after the first draft. They cover 16 holes; holes 10 and 11
are not among them. The book's bunker and creek numbers sit inside the map's
shapes or within 2.2 yd of them (n = 16 numbers, 10 holes). Its green depths
are within 4.4 yd of the map's (n = 16 holes, median difference 0.0). This is
a check of the map, not a source for the app.

## 13. For the session that builds this

1. **Confirm with him first:** the three readings under Section 2, and the
   deploy line in Section 8. DONE 2026-09-28: rulings 17 to 20.
2. **Where this file came from.** It was written in a session scratchpad and
   never committed. Copies: the project memory folder
   `C:\Users\Administrator\.claude\projects\C--Temp-gitRepos-golf-tracker\memory\hole-overview\`
   (this file, its PDF, and Fable's scratch prototype `geo.py`, `engine2.py`,
   `frames_spec2.py`). Filing it as `docs/SPEC_hole-overview.md` with its PDF
   is the building session's first commit, in a clean tree.
3. **The prototype is not the engine.** It is Python, it still numbers ponds
   (written before his ruling 8), and it exists to give the expected values
   in 3.9, 6.3, Section 7 and Section 11. The review compares Opus's numbers
   with these, tolerance 1 yd.
4. **The other session's module.** `js/round/hole-position.js`
   (`greenFrame`, `pinFromSheet`) lands with v33. This page's green rows stay
   on `toGreen`; a "to the pin" row is follow-up 5, not this build.
5. **Cost.** Writing session, 2026-09-28: "Weekly - Fable" read 85 percent at
   the start and 89 percent before the revision, account-wide with other
   sessions live, n = 1 read each. Effort xhigh for the draft, medium for the
   prompts, xhigh for the revision.

---

## 14. Revision 3 - stage 1 reviewed, and what stage 2 builds (Fable, 2026-09-28, xhigh)

His pick on the build path, 2026-09-28, asked how to build while the v34
writer was in the tree: "Start now, separate copy". So the build ran in two
stages. Stage 1 (Parts A, B, C) was built on branch `hole-overview` from
`6f843ea` and merged onto v34 at `2d51b74`. Stage 2 is Part E, Part D and
Part F, in that order, in the main tree.

### 14.1 Stage 1 verdict: PASS, one correction owed

| Check | Result |
|---|---|
| Engine, schema, store read against Sections 3 to 5 | matches, line by line |
| Table 2, holes 1 to 8 and 10 to 18, blue and gold | Fable's own run of the engine: every box reach, green F / C / B and reach / carry equals the table, largest difference 0 (n = 34 tee rows) |
| Pictures on the photo | Fable drew holes 7 and 16 with the map's outlines through `framePx`: the creek, greens, bunkers and fairways sit on the photo (n = 2, by eye) |
| Suite on the merged tree, 360 x 728 | 626 / 626 (Fable, n = 1); 604 at v34 plus 22 |
| Must-not-touch list | nothing on it changed |

### 14.2 Rulings from the review

| # | Item | Ruling |
|---|---|---|
| R1 | 5.2 and 5.5 test 1 said "five rejections"; 5.2 listed four | Fable's miscount. The fifth is a label over 24 characters after trimming: `newLayup` returns `null`, nothing is cut short. Reason: what is stored is what he typed. The page limits the field to 24 characters, so he cannot type one |
| R2 | A damaged notes key is copied to a new `:bad:<ms>` key on EVERY load (5.3). The page loads the notes each time it opens | Correction C1, stage 2: `loadCourseNotes` writes the copy only when no `gt:course:<courseId>:bad:*` key already holds the same text. Test: two loads of the same damaged text leave one copy |
| R3 | Part E, the input hashes | The generators hash text inputs by their bytes on disk. The main tree holds CRLF copies of two JSON inputs, the repository holds LF, so the recorded hash depended on the checkout. Both generators (`build_veenker.py`, `build_hole_images.py`) hash text inputs (`.json`, `.js`) with CRLF read as LF; the photo is hashed as it is. Part E's expected diff in `veenker.js` is then: the `sets` of boxes 1065750754 and 199289144, `inputsSha256.corrections`, and `inputsSha256.markup_lines` moving from `faa8e10e...` to `6e4f5466...` (the committed file's hash). Provenance only; no course fact moves. Anything else: `BLOCKED` |
| R4 | Imported notes are not validated layup by layup | The page shows only a layup `newLayup` would accept (same five rules) and skips any other without deleting it |
| R5 | Frames: pixel counts rounded up; hole 18 is 2.1 m taller than the prototype because a fairway inner-ring vertex counts | Accepted: 1,433,580 bytes, 18 files (prototype 1,432,152) |
| R6 | The toast for damaged notes says "Could not save to this device." on a read | Part D words it for a read: `Course notes could not be read. A copy was kept.` |

### 14.3 Follow-ups logged, not built

1. `docs/course-map/veenker/check_answers.py` rewrites the corrections file
   from scratch and would drop hole 9's blue and gold ids after Part E.
2. `.gitattributes` has no `*.webp binary`; git detects the images as binary
   on its own today.
3. The suite leaves 7 `gt:` keys per run on a clean test origin (n = 1), from
   groups that were there before this job.
