# SPEC - end-of-hole shots: the tee from the map, places instead of longest stops

Fable, 2026-09-28, at high (Matt set it: "effort is high"; `get_session self`
read `high`). Written for Opus to build at high (`.claude/agents/opus.md`).
Fable reviews the diff against this file and signs in `docs/DECISIONS_LOG.md`.
Opus is not spawned until Matt has answered Section 8 and said go.

His words that bound it, verbatim, all 2026-09-28 unless dated:

- From his comments on the 2026-09-27 round
  (`docs/Round_2026-09-27_shot-distances_comments.pdf`, read from the PDF
  fields):
  - hole 12: *"here I hit the mark tee shot and could not undo it"*
  - hole 13: *"the mark was wrong it was 133 i think to the pin"*
  - hole 14: *"Could not find the tee shot - needs to default to the
    scorecard could not find the next shot either."*
  - hole 15: *"again could not find tee shot"*; hole 18: *"tried using it
    again same issue"*; hole 1: *"sAME"*
- *"the proposed tee shots on those holes were stupid. most we a distance
  from the hole that was less then the 2nd shot"*
- Answering Fable's four items and adding a fifth: *"1. yes that is what I
  meant, 2. most of the time but it is possible to hit something and the
  ball go backwards so be careful with that, 3. yes, 4. yes 5. How can we
  leverage the map when making shot choices - it will not always be the
  longest stop that is the actual shot. many times in golf you are waiting"*
  The four items he answered were: (1) shot 1 is always the tee box at the
  card yardage, no tee shot proposal; (2) every later shot closer to the hole
  than the one before; (3) distance to the hole uses the map's green, never a
  cup taken from the track; (4) undo on every mark.
- Correcting Fable's claim that a wait and a shot are the same place: *"not
  true. When it is 100 degrees out and I am waiting you better believe it is
  in the shade."*
- On the phone: *"It was with most of the time. it was cart path only so a
  few times it was left in the cart while I was hitting that happened for the
  2nd shot on 15"*
- On scope: *"I am not worried about yesterdays round."* Nothing in this job
  edits the stored 2026-09-27 round.
- 2026-09-26, the row form, standing: *"Numbers are always measured with
  distance to hole not the last shot or any other garbage."*

Provenance tags: `[measured]` read from code or data this session,
`[design]` this spec's decision, `[verify]` Opus confirms during the build.

---

## 0. What this is, and what it is not

**Is:** a rework of the second stage of END-OF-HOLE ENTRY (`openShotConfirm`
in `js/ui/screen-play.js`) and of how `proposeHoleShots` in
`js/round/track-analysis.js` chooses what to offer. Shot 1 stops coming from
the track. The rest are offered as places on the hole, described by the map,
and he can reach every one of them.

**Is not:** a change to the recorder, the GPS precision pipeline, the stop
segmenter (`segmentTrack`, `stopCandidates`), the round record's shape
(`schemaVersion` unmoved, no new keys), the strokes-gained engine, the export,
the green sheet, the mark burst or the lie card. It does not edit any stored
round.

**The one piece held back for his word (Section 8, D1):** what the
strokes-gained engine is given as the hole position when no cup was marked.
That is the strokes-gained engine and the data model, an xhigh class, and is
not built under this spec.

---

## 1. What exists today `[measured]`

| Piece | Where | What it does |
|---|---|---|
| The picker | `proposeHoleShots`, `track-analysis.js` 658-761 | Takes every stop in the hole's time window, drops the last stop and stops within putting range of it, sorts the rest by `score`, keeps the top `fullShots`, returns them in time order. `score` is dwell only (`dwellS / (dwellS + DWELL_HALF_S)`, line 305). The map is not consulted. |
| The rows | `openShotConfirm`, `screen-play.js` 3183-3356 | One row per proposed stop. Row 1 is forced to lie `tee`. The other stops are not shown. NOT A SHOT removes a row and pulls in the next stop by score, one at a time. |
| The row heading | `shotRowHeading`, `screen-play.js` 135-147 | Distance from the stop to the marked cup; with no cup, to the map's green centre, marked "(green centre)". |
| The cup from the track | `openShotConfirm` 3207-3208, `applyHoleEntry` 3389-3400 | Offered as "Where the hole was", preset to USE IT, stored as `cup.method = 'track'`. |
| The hole's window | `holeWindow`, `round.js` 660-736 | Bounded by the marks and `completedAt` of the holes either side. A track shot's `mark.ts` is the time the hole was saved, not the time of the stop. |
| Map lie on a row | `mapLieRow`, `screen-play.js` 107-121 | Preselects the lie from the map, flagged `lieInferred`. |
| The map | `js/data/geometry/veenker.js` | 43 tee, 30 fairway, 27 bunker, 26 green, 3 water polygons. No cart paths. |
| Undo of a mark | `noteMark` / `lastMark`, `screen-play.js` 185-194, 605, 694-704, 1110 | A "marked, UNDO" banner that lives 20 s. |

## 2. What the 2026-09-27 round showed `[measured]`, n = 1 round, 10 holes

Replayed in the browser against the shipped modules with the recorder's
`fixes.csv` (14,823 fixes).

| Finding | Number |
|---|---|
| Stops in the hole windows | 170 over 10 holes; 8 to 34 per hole for 1 to 3 shots wanted |
| Hole 18's window | 34 stops; from 12:52 to 13:18 they sit on hole 16 and 17 ground |
| Hole 18 as offered | 375 yd, then 414 yd, then 223 yd to the green centre |
| Hole 15 tee as offered | 299 yd to the green centre, 58 yd from the tee box, card 386 |
| Cup from the track, distance to its own green centre | 6, 19, 27, 31, 40, 123, 199, 400 yd (n = 8) |
| Tee stop on hole 13 | 19 yd from the tee box polygon, read by the map as rough |
| Picks he replaced by hand | shot 2 on holes 1 and 3 |

Two facts from him that the track cannot see: he waits in the shade, away
from the ball; on a cart-path-only day the phone is sometimes in the cart
while he hits (hole 15 shot 2).

---

## 3. Shot 1 is the tee, from the map `[design]`

His item 1, answered "yes that is what I meant".

1. `proposeHoleShots` no longer proposes a tee shot. It is asked for
   `fullShots - 1` places.
2. Row 1 of the sheet is fixed: **"Shot 1 - Lie = Tee Box, Distance to the
   hole = n yd (scorecard)"**, where n is `hl.yards`, the card yardage for
   the round's tee set. It has no NOT A SHOT and no lie buttons.
3. Position stored with shot 1: the centre of the tee box polygon the map
   assigns to this hole and the round's tee set. Where the map assigns no box
   for that set, shot 1 is stored with no mark `[verify]` that `addShot`
   accepts a tee shot with `mark: null`, as the manual putts do.
4. Provenance, inside the existing keys: `source: 'map'` on the shot and
   `method: 'map'` on the mark. No new keys. `[verify]` every reader of
   `source` and `mark.method` (`holeHasTrackShots`, the export, the
   strokes-gained input, `learnTee`) treats an unknown value as not measured.
   `learnTee` is NOT called for a map tee: teaching the course model from the
   map is mixing a reference into itself.
5. A hole where he DID mark the tee with MARK TEE SHOT keeps his mark. The
   map tee is only for a hole with no tee mark.
6. `insertTeeShot` ("Tee shot recovered from the track") is retired from the
   play screen for a course that has a map; it stays for a course without one.

## 4. The rest are places on the hole `[design]`

### 4.1 Every stop is reachable

The sheet shows the preselected rows (4.3) and, under them, **OTHER PLACES ON
THIS HOLE**: every other stop in the window, each one tappable into the shot
list. NOT A SHOT stays, and now returns the row to that list instead of
pulling the next stop by score. Nothing in the window is ever hidden from
him. This is the fix for "could not find the next shot either".

### 4.2 What the map says about each stop

For every stop in the window, computed once when the sheet opens:

| Field | From | Use |
|---|---|---|
| `toHoleYd` | `toGreen(geometry, hole, pos).centreYd` | the row's distance; the sort key |
| `lie` | `lieAt(geometry, pos)` | the row's lie, flagged inferred, as today |
| `ground` | `nearestHole(geometry, pos, { maxM: 500 })` | `own` when the nearest hole is this one; `other` otherwise |
| `onTee`, `onGreen` | `lieAt(...).lie` of `tee` / `green` | kept out of the preselection |
| `afterGreen` | the stop starts after the first stop inside this hole's own green polygon | kept out of the preselection |

The list is in two groups, in this order: **on this hole** (`ground: own`),
then **off this hole** (`ground: other`), each in time order. A ball on the
next fairway over is in the second group and is one tap away. Off-map stops
(`lie: null`) are listed last in the second group.

### 4.3 The preselection

Preselected places are the app's suggestion and nothing more; every row can
be swapped. The rule, in order:

1. Pool: stops with `ground: own`, not `onTee`, not `onGreen`, not
   `afterGreen`, dwell 15 s or more.
2. If the pool holds fewer than `fullShots - 1`, add `ground: other` stops
   that pass the same tests. If it is still short, the sheet opens with the
   rows it has and the existing shortfall banner.
3. From the pool choose `fullShots - 1` stops, in time order, that maximise
   the number of steps where `toHoleYd` falls; ties broken by total dwell.
4. **His item 2 as he qualified it:** "closer than the shot before" is used
   in step 3 only. It never removes a place from the list and never blocks
   SAVE. A sequence he builds where a shot is farther from the hole than the
   one before it saves without a warning.

Dwell is a tie-break and nothing else. A long stop in the shade is a long
stop; it earns no preference.

### 4.4 The ball was not where the phone was

Each shot row carries **BALL NOT HERE**. It turns the row into a typed row:
he enters the distance to the hole in yards and picks the lie. Stored as the
existing manual shot shape: `source: 'manual'`, `mark: null`,
`distanceEntry: { value, unit: 'yards' }`. `[verify]` the unit is accepted by
`distanceEntry` today; if it is not, BLOCKED with the question - no new key
and no new unit is added on Opus's judgement.

**ADD A SHOT** at the foot of the list adds a typed row the same way, for a
shot with no stop at all.

### 4.5 The row

Unchanged from his 2026-09-26 form: **"Shot n - Lie = X, Distance to the
hole = n yd"**. Track and map rows read the map's green centre and say so
("(green centre)") unless he marked the cup, in which case they read the
marked cup. A typed row reads "(entered)". No dwell, no time, no next-stop
distance on any row.

## 5. The hole position `[design]`

His item 3, answered "yes".

1. The "Where the hole was" card and the track's cup offer are removed from
   the sheet. `applyHoleEntry` no longer writes a `method: 'track'` cup.
2. A cup he marked with MARK CUP is a measurement and is used as today.
3. With no marked cup, every distance ON SCREEN is to the map's green centre.
   What is stored and what the strokes-gained engine receives for such a
   hole is decision D1 (Section 8); until he rules, `hl.cup` stays `null` on
   such a hole, exactly as it does today when he taps LEAVE IT OUT.

## 6. Undo `[design]`

His item 4, answered "yes"; his hole 12 comment.

1. `[verify]` first: reproduce hole 12. On 2026-09-27 a cup burst was stored
   on hole 12 at 12:01:27, 21 yd from the hole 13 tee box, and hole 12 closed
   at 12:01:31 with one shot. Opus traces which control he can reach from the
   play screen on the next tee that starts a cup burst on the previous hole,
   and reports it before changing it.
2. Every mark (tee, shot, ball, cup) and every SAVE HOLE has an UNDO that is
   on the play screen until the next mark, the next save or a hole change -
   not for 20 s. It is reachable with the green sheet open.
3. UNDO of a cup mark also undoes what the cup mark caused: the hole is not
   left completed by a mark that was taken back.
4. A cup mark alone never completes a hole `[verify]` against the green flow
   spec (`docs/SPEC_green-flow.md`); if the two conflict, BLOCKED.

## 7. Tests that prove it

In the browser suite (`/test/`), sized like the neighbouring end-of-hole
tests. One focused test per behaviour:

| # | Behaviour | Test |
|---|---|---|
| 1 | Shot 1 is the map tee | hole with no tee mark, `fullShots` 3: row 1 reads Tee Box and the card yardage with "(scorecard)"; two places are proposed, not three |
| 2 | His tee mark wins | hole with a MARK TEE SHOT mark: shot 1 is his mark, `source` unchanged |
| 3 | Map tee provenance | saved shot 1 has `source: 'map'`, `mark.method: 'map'`; `learnTee` not called |
| 4 | Every stop reachable | a window of 12 stops, 2 wanted: 2 rows and 10 entries under OTHER PLACES; tapping one adds it |
| 5 | Ground grouping | stops on another hole's ground are in the second group, not dropped |
| 6 | Preselection ignores dwell except on ties | a 500 s stop on the next tee's ground and a 40 s stop on this hole's fairway: the 40 s stop is preselected |
| 7 | Backwards is allowed | a built sequence 150 yd then 170 yd saves; no warning |
| 8 | BALL NOT HERE | typed 140 yd, rough: stored `source: 'manual'`, `mark: null`, row reads "(entered)" |
| 9 | No track cup | after SAVE HOLE with no marked cup, `hl.cup` is `null`; the sheet has no "Where the hole was" card |
| 10 | Undo persists | mark the cup, wait 30 s of test clock, UNDO is still there and restores the hole |

**Scoring before it ships.** The new preselection and the old picker are both
run through `tools/detection-scoring.html` on the labelled rounds already in
`docs/roundDownloads/`. Opus reports both accuracies with n. If the new rule
scores lower than the old one on those rounds, that is reported as a finding,
not tuned away. The 2026-09-27 round is not a labelled round and is not used
to score.

## 8. Decisions that are his

| # | Decision | Why it is his |
|---|---|---|
| D1 | With no marked cup, what does the strokes-gained engine get as the hole position: nothing (the hole produces no strokes gained, as today with LEAVE IT OUT), or the map's green centre stored with its own provenance? | The strokes-gained engine and the data model. xhigh class; Fable specs it at xhigh on his word, separately. |
| D2 | Order of the two builds: this spec first and D1 after, or D1 first. | His agenda, his order. |

## 9. What Opus must not touch

`android/`, the recorder, `segmentTrack` and `stopCandidates`, the GPS
precision pipeline, `js/analysis/` (the strokes-gained engine and its
benchmarks), the round record's keys and `schemaVersion`, the export format,
the green sheet's putt entry, any stored round, `REVISION`, and the push.
`BUILD.id` and the `gt-shell-<id>` cache move together as on every build.

## 10. Follow-ups noticed, not in this job

- `holeWindow`'s comment says a mark "carries the timestamp of the moment it
  was taken"; a track shot's `mark.ts` is the save time `[measured]`. The
  window still held on 2026-09-27; reported, not changed.
- The map has no cart paths. The session "Golf cart path data fixes" owns
  that data.
- Tee box polygons miss real tee positions by up to 19 yd (hole 13, n = 1).
- Holes 16 and 17 on 2026-09-27 have no entry while the track was on their
  ground. Hole-from-position (course geometry Part D) is not built and still
  owes a margin ruling.
