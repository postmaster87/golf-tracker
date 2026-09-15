# REPORT 1.1 — The Veenker course map, reviewed before it becomes app data (Fable, 2026-09-15)

Item: `docs/handoff/FOR_FABLE.md` 1.1. Tree reviewed: `ab1e58d` (clean, one
commit ahead of the pushed `a12570a` / build v25). Effort high. Review only:
`js/data/courses.js`, the schema and the app are untouched. His words on it,
verbatim, in order:

> "Okay you have the course data now I don't want a public map. What else do we need to nail do for the phone build?"

> "The OSM map is correct I looked it over - your guesses are way off. Clear all your stuff on the map and I'll mark it up. Tom has made changes to the course for the better and the OSM map is up to date. the yardages should still all be correct. ignore the bunkers, the additional blue tee on 17 across the creek is gone."

> "I finished marking up the map it is in the docs>Veenker folder. It should be clear but let me know if you have questions"

> "1. That is hole 8 my bad. 2. Forgot them yes they are just north of green. 3. Yes 16 has a tee boxed tucked way in the back between the 16 gold tees and 15 green. 2nd hardest tee shot the course"

> "yes to 10 based off OSM"

> "the map and my data are fine in the public repo"

And since the item was written, 2026-09-15: "yes the conformation when in
question is needed when I am entering the score at the end of the hole".

## The answer, in plain words

**The map holds up. Every hole 1-18 has exactly one green, and the method that
matched your markup to OSM has no error of the kind the two traps were.** The
three scripts reproduce byte for byte (55 leader lines, 20 black / 18 blue /
17 yellow, 0 unlabelled; miss median 0.0 m, 90th percentile 0.6 m, max 81.2 m
- n = 55). OSM has not changed since the pull: the same 191 elements, same
versions, same geometry (mirror state 2026-07-24; newest golf edit at Veenker
2026-02-23).

Four things you should know before it becomes app data:

1. **Hole 9 has no blue or gold mark from you** (your "Forgot them"). The two
   boxes at the start of OSM's hole-9 line measure 537 yd and 491 yd to the
   green along the line, against the card's 537 / 495, so the small back box
   is blue and the next one gold - **by yardage, not by your word (n = 1 each).
   Say yes or no.**
2. **Holes 11 and 18 share one mapped tee box** (OSM drew one 517 m2 polygon
   over both). Your 11 and 18 blue and gold tips all land in it, and both hole
   lines start in it. So "inside a tee box" can never tell 11's tee from 18's;
   the hole has to come from the round's play order.
3. **Hole 12's blue tee is not in a mapped box.** Your blue tip is 4.4 m past
   the back edge of the only box on 12 (which holds your gold tip, 8 m in).
   Either the blue markers are at the back of that box or there is a second
   box OSM does not have. **Which?** Until you say, 12 blue is carried the same
   way as 16's back blue: as your mark, not as a surveyed box.
4. **Turning this into app course data is a data model change - xhigh, on your
   word.** Not because reading polygons is hard (it is mechanical) but because
   a lie or a tee the app fills from the map needs a source the shot record
   cannot express today (`source` is `'gps' | 'manual'`, the lie carries only
   a yes/no `lieInferred`), every logged round is read through that shape, and
   the map itself is two kinds of truth (OSM polygons and your marked points)
   that the rule says are never mixed silently. Nothing was designed here.

The hole-16 back blue tee is answered in Section 4: it is carried as a
**point with its source, an uncertainty and n = 1** - never as a polygon,
never with an OSM id, never folded into the learned tee positions - and any
tee or lie the app takes from it is inferred and goes to your end-of-hole
confirmation.

The 17 yardage question in Opus's note bears on the map only this far: OSM
has no separate box that could be the gone cross-creek blue tee, so there is
nothing to strip. The hole-2 blue box sits 190 yd from the 17 green across the
creek (n = 1), which is the number the printed card shows; the numbers in
`courses.js` are your call and were not touched.

## 1. Reproduction

Run from `docs/course-map/veenker/` on `ab1e58d` (Python 3, numpy, PIL; scipy
is not installed here, so `extract_markup.py` ran its own flood-fill path):

| Script | Output | README says |
|---|---|---|
| `extract_markup.py` | changed px 56,605 (black 13,361 / white 8,792 / yellow 14,545 / blue 13,538); leader lines black 20, blue 18, yellow 17 | 55 lines, 20 / 18 / 17 |
| `rematch.py` | 55 matched, 0 unlabelled; miss median 0.0 m, 90th pct 0.6 m, max 81.2 m; largest: SHORT GAME 81.2, 16 blue 48.5, RANGE 11.5, 12 blue 4.4, R7 gold 2.4, R7 blue 0.6 | same five over 1 m |
| `check_answers.py` | hole 8: line ends 0.0 m from the green he marked, starts 0.0 m from the tees; hole 9: three boxes 0.0 / 24.0 / 49.7 m from the line start, 58 m NE / 57 m N / 103 m N of the 8 green; hole 16 blue mark 48 m from the 16 gold box, 66 m from the 15 green edge, 41% along, 28 m off | same |

`markup_lines.json` and `veenker_confirmed_corrections.json` were rewritten by
the run and `git status` stayed clean: byte-identical (n = 2 files).

**OSM freshness.** The same Overpass query, run into the scratchpad against
the kumi.systems mirror: 191 elements vs 191 committed, 0 added, 0 gone, 0
version changes, 0 geometry changes. The mirror's data state was 2026-07-24
(the committed pull's was 2026-05-31); the main `overpass-api.de` instance
returned 504 once and was not retried (usage). Newest golf edit at Veenker in
either copy: 2026-02-23. Edits after 2026-07-24, if any, are not visible from
here.

## 2. The method, checked for a third trap

| Check | Result |
|---|---|
| **Tip vs tail** (the end nearer white ink is the tail) | Every leader is unambiguous: tail-to-text at most 17 px, tip-to-text at least 46 px, and the smallest margin between the two ends is 39 px (n = 55). Leaders are straight (perpendicular spread 5 px = the stroke width, worst of 55), so the PCA end-finding is sound. The 3 px tail-to-label lookup in `rematch.py` keys every line (0 unlabelled). |
| **Colour classes** | His Paint colours are exact: black (0,0,0) 13,361 px, blue (63,72,204) 13,537 px + 1 stray, yellow (255,242,0) 14,545 px. The four class masks are disjoint (0 overlapping px). The 6,369 changed px in no class are 1,600 blobs; the 7 of 40 px or more are all 8-11 x 11-13 px grey blobs (mean RGB about 155/170/170) at label positions - antialiased text edges, not strokes. Components dropped by the filters: black 0, yellow 0, blue 2 specks under 40 px (largest 26 px). Nothing he drew was missed. |
| **True-extent pixel mapping** | The returned extent is square in degrees (deg/px x = deg/px y to 6 decimals), matches the requested frame E-W to 0.000 m and overshoots N-S by 156.5 m at each image edge (1146 x 1216 m returned for 1146 x 903 m requested). One pixel = 0.273 m E-W x 0.367 m N-S. Because the image is EPSG:4326, the linear pixel-to-lat/lon map is exact, and all three scripts use the true extent (`render_osm_clean.py` reads `frame.json` only for width/height). Had `frame.json` been used the N-S error would be 156 m at the image edge - the README's 55-80 m was at the course features, which sit inboard. Consistent. |
| **Multipolygons** | Greens (26), tees (43) and bunkers (27) are all simple closed ways: 0 unclosed, 0 null nodes, 0 duplicate ids. So multipolygon handling never touched the markup match. Fairways: 9 ways + 21 relations (1 outer, 1-5 inners each), 1 rough relation, and Ioway Creek (11 outer ways). `join_rings` closes every one: 22 of 22 fairway/rough relations, and the creek's 11 ways join into 1 closed ring of 1,744 nodes. |
| **Flat-earth constants** | `rematch.py` uses 111,320 m/deg for both axes (times cos lat for longitude). At 42.04 N the ellipsoid gives 111,074 and 82,801: +0.22% / -0.15%, about 1.2 yd on the 561 yd hole 7. Fine for matching a tip to a polygon; **not** for app distances, which stay on `js/util/geo.js` (within 2 cm of the Vincenty fixtures). |
| **Caution for Opus's check page** (not this item) | `docs/bakeoff-data/2026-09-14-veenker-walking/detection-check.html` line 105 takes relation `outer` members only. 21 of the 30 fairways are relations with inner rings (the cut-outs), so a point inside a cut-out reads as fairway as well as whatever the cut-out is. Did not affect the 5 of 5 lie matches reported; it will matter the first time a bunker inside a fairway relation is tested. |

## 3. Every hole: one green, and which boxes belong to it

Method (mine, independent of `rematch.py`): the OSM hole line's end point must
fall inside exactly one green; a tee box belongs to a hole when it holds one
of his blue/gold tips or the hole line's start, with the box's yardage to the
green along the OSM hole line as a check against the card. Ids are OSM way
ids; "shared" means his blue and gold tips are in the same box.

**Greens: 18 of 18 hole lines end inside exactly one green, 18 distinct
greens** (second-nearest green 40-193 m away on every hole). The 8 greens
on no hole are the practice greens: 7 sit 89-292 m from the hole-9 line
(his RANGE and SHORT GAME labels are areas, 11.5 m and 81.2 m from the
nearest of them) and one (1065734272, 566 m2) is 37 m from the hole-10 line.

| Hole | Green | Blue box | Gold box | Other mapped boxes on the hole (no mark from him) |
|---|---|---|---|---|
| 1 | 1065734274 | 199287763 (shared) | same box | - |
| 2 | 1065747072 | 199288719 | 199288724 | - |
| 3 | 1065747079 | 199288713 | 1065730087 | 199288714 (63 m2, 18 m beside the blue box, 318 yd - unidentified); 1065747075 (214 yd; card white 208) |
| 4 | 1065748054 | 199418749 (shared) | same box | 199418748 (303 yd; nearest card number red 330 - unidentified) |
| 5 | 1065748628 | 199288946 | 199288945 | - |
| 6 | 1065750019 | 199288711 | 199288712 | - |
| 7 | 1065750026 | 199289115 | 1065750020 | 1065750021 (466 yd; card red 475) |
| 8 | 1065750750 | 199418750 (his R7 blue tip 0.6 m from it) | 1065750025 (his R7 gold tip 2.4 m outside it; 154 yd along the line, card gold 157) | 1065750024 (115 yd; card red 123) |
| 9 | 1065750757 | **1065750754 by yardage only** (46 m2, holds the line start, 537 yd = card 537) | **199289144 by yardage only** (233 m2, 491 yd, card 495) | 1065750756 (426 yd; card red 432); 1065727838 (852 m2, 451 yd; card white 437) |
| 10 | 1065745443 | 1065741882 (28 m2, farther, 529 yd straight) and 199288419 (72 m2, 515 yd); blue plays the farther one, his word | 199288418 | - |
| 11 | 1065732287 | 199288462 (shared, **and shared with hole 18**) | same box | - |
| 12 | 199288630 | **none mapped**: his tip 4.4 m past the back of 199289118 | 199289118 (his tip 8 m into a 21 m box) | - |
| 13 | 1065746513 | 199289114 (shared) | same box | - |
| 14 | 1065741619 | 199288068 (shared) | same box | - |
| 15 | 1065741616 | 199288280 | 199288279 | 199288281 (336 yd; card red 344) |
| 16 | 1065741610 | **none mapped**: his markup point, 48 m from the gold box | 199288326 | 1065741613 (37 m2) and 1065741612 (35 m2), 355-356 yd; card red 368 |
| 17 | 1065737271 | 1065732297 | 1065732298 | 199287853 (183 m2; 410 yd to the **18** green, card 18 white 412 / red 407 - likely 18's forward tee) |
| 18 | 1065741881 | 199288462 (the hole-11 box) | same box | see 17 |

So: **every hole has a blue and a gold box attributable to it except 12 blue
and 16 blue (unmapped, his marks) and hole 9 (unmarked by him, attributed by
yardage).** The forward-tee identities in the last column are card-yardage
matches at n = 1 each and are not to be written into course data without his
word - "nothing is guessed into course data".

**Unassigned boxes (18 of 43):** the four driving-range boxes (1065751160,
1065751159, 1065751168, 1065751167: 728-2,105 m2, 119-251 m off the hole-9
line) and the fourteen unmarked boxes in the last column. Boxes holding one of
his tips: 25. His 35 tee tips (18 blue, 17 gold): 32 inside a box, 3 outside
(16 blue 48.5 m, 12 blue 4.4 m, R7 gold 2.4 m).

**The 17 note.** No OSM tee box is explainable only as the gone cross-creek
blue tee. The one box that the creek separates from the 17 blue box at a par-3
distance is hole 2's blue box, 190 yd from the 17 green (2 water-edge
crossings; n = 1). The map needs nothing removed; `courses.js` hole 17 (blue
182 / gold 152) is his call.

## 4. How the hole-16 back blue tee is carried

It is a point he drew, not a polygon anyone surveyed. Under "measured and
inferred are never silently mixed" it is carried as:

- **A point record with its provenance on it**, the way learned positions
  already carry `source` / `uncertaintyM` / `n` (`accumulatedHolePosition`,
  `js/round/round.js` 1135-1142): lat/lon from his tip through the true
  extent, `source: 'markup'` (his blue leader tip on the NAIP 2025 photo,
  2026-09-13, pixel (521, 1038)), his words verbatim, `n: 1`, and a stated
  uncertainty with its basis. The basis: his 52 tips on features OSM maps
  (n = 52) landed inside the feature 50 times and at most 4.4 m outside; one
  pixel is 0.27 x 0.37 m. His aim and the photo-to-OSM registration cannot be
  separated at that n, so **5 m is a stated radius, not a measured accuracy**,
  and the record says so.
- **Never as a `golf=tee` polygon, never with an OSM id, never in
  `courseLearning.tees`** - that map is a running mean of good GPS tee marks
  (`learnTee`, `method: 'burst'`); a drawn point averaged into it would be
  exactly the silent mix the rule forbids.
- **On the course it can only suggest.** "In the 16 blue box" is a distance
  test against the point within its radius, never a polygon hit; a tee or a
  lie the app takes from it carries `lieInferred` / its source, so it lands in
  his end-of-hole confirmation ("yes the conformation when in question is
  needed when I am entering the score at the end of the hole").
- **A measured position outranks it and sits beside it.** The first
  good-quality tee mark on 16 blue is a second record with `source` measured;
  the markup point is not overwritten and not averaged with it.
- **Yardage stays the card's 544.** The straight line from the point to the
  16 green centroid is 510 yd (the gold box gives 450 vs card 485); those are
  attribution checks, not yardages.

The same carry applies to **12 blue** (his tip, 4.4 m outside the mapped box)
until he answers Section 3's question, and to **hole 9's blue/gold split** if
he confirms it by word (source: his word, dated) rather than a survey. And for
**11/18**, the hole a tee belongs to comes from the round's play order, never
from the shared polygon.

## 5. Classification: data model / schema change - xhigh on his word

**Yes.** Three reasons, each sufficient:

1. **The shot record cannot say where a lie came from.** `newShot` has
   `source: 'gps' | 'manual'` and a boolean `lieInferred`
   (`js/data/schema.js` 279-285; `js/round/round.js` 101-125). A lie filled
   from the map is a third source (map vs track vs his answer) with a
   confidence behind it, and every logged round is read through that shape -
   so the migration clause applies.
2. **Course data gains a new kind of record.** `courses.js` today is scorecard
   numbers (par, hcp, yards per tee set). Geometry with per-feature provenance
   (OSM way id + version + timestamp for polygons; his markup for points; his
   word for the 9 split and the 11/18 identity), plus the practice areas that
   belong to no hole, is a data model whether it lives in code, in storage or
   in the native app's files.
3. **`courseLearning` is measured only** and must stay that way (Section 4);
   the map needs a home beside it, and the rank between them (measured over
   map over markup) is a rule of the model, not of a screen.

Reading OSM into a JSON asset is mechanical and is not the schema question.
Nothing is designed here; it is one item, spawned as `fable-xhigh`, after he
types "xhigh".

## Decisions made alone (also in `docs/DECISIONS_LOG.md`)

1. Attribution by OSM hole-line start/end plus his tips, with card yardage
   along the line as the check, rather than the rematch table alone - the
   table cannot see a shared box or an unmarked hole.
2. Hole 9's blue/gold split and the forward-tee identities are reported as
   yardage inferences at n = 1 and put to him, not written as facts.
3. 12 blue is treated like 16 blue (a markup point) until he answers.
4. `overpass-api.de` not retried after one 504 (his 10% cap); the mirror's
   2026-07-24 state is stated with its limit.
5. The detection-check inner-ring caution is reported, not fixed - Opus's
   page and out of scope.
6. No file in `docs/course-map/veenker/` changed; nothing in `js/`.

## For Matt to decide

1. Hole 9: is the small back box (537 yd) blue and the next box (491 yd)
   gold? Yes / no.
2. Hole 12: are the blue markers at the back of the one mapped box, or is
   there a second box behind it?
3. "xhigh" before the map becomes app course data (Section 5).

Nothing in this report was tested on the phone or in the app; it is a review
of files.
