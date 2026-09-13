# Veenker course map

The course geometry the phone app will use for lies and distances at Veenker
Memorial. Committed on Matt's word, 2026-09-13: *"the map and my data are fine
in the public repo"*.

## What is here

| File | What it is |
|---|---|
| `osm_full.json` | OpenStreetMap golf features inside the Veenker outline (way 44804299) plus a 150 m fringe; Overpass `out meta geom`, pulled 2026-09-13 |
| `basemap.png` | USDA NAIP 2025 photo from ISU's Iowa Geographic Map Server, 4200 x 3311 px |
| `frame.json` | The box that was *requested* for the photo |
| `basemap_true_extent.json` | The box the server *actually returned*. **Always draw with this one.** |
| `veenker-aerial-Matt.png` | Matt's markup on `basemap.png`: black leader = green, blue = blue tee, yellow = gold tee, white = label |
| `markup_lines.json` | Every leader line pulled out of his markup, in pixels: colour, tail (label end), tip |
| `veenker_confirmed_corrections.json` | His confirmed corrections to OSM (hole 8, hole 9 tees, hole 16 back blue tee, hole 10 blue box) |
| `fetch_sources.py` | Re-pulls `osm_full.json`, `basemap.png` and `basemap_true_extent.json`. **Overwrites them.** |
| `extract_markup.py` | His markup -> `markup_lines.json` |
| `rematch.py` | Markup tips -> OSM greens and tees, per-hole table |
| `check_answers.py` | Checks his answers on holes 8, 9 and 16 |
| `render_osm_clean.py` | Draws OSM over the photo (writes `veenker-osm-clean.png`, not committed) |

## Reproduce

```
cd docs/course-map/veenker
python extract_markup.py
python rematch.py
python check_answers.py
```

Expected, re-run from this folder 2026-09-13: 55 leader lines (20 black, 18
blue, 17 yellow), 0 unlabelled; tip-to-feature miss median 0.0 m, 90th
percentile 0.6 m, max 81.2 m. Every miss over 1 m: SHORT GAME 81.2 m and RANGE
11.5 m (areas, not greens), hole 16 blue 48.5 m (the tee box OSM does not
have), hole 12 blue 4.4 m, the hole-8 ("R7") gold 2.4 m. `check_answers.py`
rewrites `veenker_confirmed_corrections.json`; the re-run was byte-identical.

## His words, verbatim

- *"The OSM map is correct I looked it over - your guesses are way off. Clear
  all your stuff on the map and I'll mark it up. Tom has made changes to the
  course for the better and the OSM map is up to date. the yardages should
  still all be correct. ignore the bunkers, the additional blue tee on 17
  across the creek is gone."*
- *"I finished marking up the map it is in the docs>Veenker folder. It should
  be clear but let me know if you have questions"*
- *"1. That is hole 8 my bad. 2. Forgot them yes they are just north of green.
  3. Yes 16 has a tee boxed tucked way in the back between the 16 gold tees
  and 15 green. 2nd hardest tee shot the course"*
- *"yes to 10 based off OSM"* - sand lies come from OSM's mapped bunkers.
- *"The yardages marked up for approaches into the green carries off the tee,
  layup numbers. The book has a few tee numbers wrong and so does our app"* -
  about the old yardage book photographed in `docs/Veenker/` (gitignored).

## Confirmed facts

- OSM is the ground truth for greens, fairways, tees, bunkers and water.
- The right-hand "7 GREEN" and "7 TEES" labels on his markup are **hole 8**
  (OSM's hole-8 line starts on those tees and ends in that green, 0.0 m).
- **Hole 9 tees** are OSM's, just north of the 8 green (the line starts in a
  box about 58 m northeast of it).
- **Hole 16 has a back blue tee OSM does not map**, between the 16 gold tees
  and the 15 green. Its position is his markup tip only - carry it as his
  markup, never as a measured position.
- **Hole 10** has two blue boxes; blue plays the farther one (560 yd).
- **DRIVING RANGE** and **SHORT GAME AREA** belong to no hole.
- Tee yardages for holes 7 and 10 were corrected in `js/data/courses.js`
  (`be82cef`).

## Two traps, both hit on 2026-09-13

1. **Overpass `around`.** `nwr(around.course:150)` measures from the outline
   *way* - the boundary line - so everything deep inside the course is
   silently dropped. It made holes 1, 3, 10, 13, 16 look unmapped. Query the
   area (`map_to_area`).
2. **Square pixels in degrees.** ISU's ArcGIS `exportImage` with
   `imageSR=4326` returned 1146 x 1216 m for a requested 1146 x 903 m frame.
   Overlays drawn with the requested box were off by up to 55-80 m north-south
   at the edges. Read the real extent back with `f=json`.

## Licence

Course features (c) OpenStreetMap contributors, ODbL 1.0
(https://www.openstreetmap.org/copyright). Imagery: USDA NAIP 2025 (public
domain) via the Iowa Geographic Map Server, ISU GIS Support and Research
Facility.
