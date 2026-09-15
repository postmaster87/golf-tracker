# FOR_FABLE - the only way work reaches Fable (Matt, 2026-09-10)

Opus is the only writer. Fable is a subagent Opus spawns per item
(`.claude/agents/fable.md`; `fable-xhigh.md` only on Matt's "xhigh"), one
item per spawn, and Opus makes no writes to the repo until Fable returns.
Empty queue = Fable is not needed. The rule is the repo's `CLAUDE.md`.
Answered items move to `docs/handoff/FOR_FABLE_LOG.md`; their write-ups are
the `REPORT_*.md` files beside this one.

An item carries: Matt's words on it VERBATIM, the evidence (file:line, the
numbers with n, what was tried), and any decision he already made. The
spawn prompt repeats the item number, his words and the commit hash.

## RUN ORDER - set 2026-09-14

His words, 2026-09-13: "Opus you are on your own here. Anything you want Fable
to check make a file for it to run tomorrow night when credits reset". And:
"Next to know is I am out of Fable Usage until tomorrow night".

On 2026-09-14 two orders were written down: this file had 2.2, 1.1, 2.3, and
`docs/handoff/NEXT_CHAT_2026-09-14.md` had 2.2, 2.3, 1.1. Asked which, he
picked "2.2 → 2.3 → 1.1 (Recommended)".

**Then, the same night, 2.3 moved first.** He stopped the 2.2 spawn and wrote:
"let Fable analyze the data then we can talk about the round after it, All and
all it was pleasant". Asked which job Fable does first, he picked "2.3: the two
test apps" (the option said the v24 test waits), and then typed: "x-high your
are good to go".

**Fable's usage on this project, his words, 2026-09-14:** "Yes but Fable is
restricted 10% weekly usage on this project so plan accordingly and let me pick
if a usage choice needs made". So before every spawn Opus names the item, its
effort and the cost of the last comparable run, and he picks. Completed runs to
price from: 2.1 (effort high, 2026-09-11) took 29.2 min, 138 tool calls and
294,843 tokens reported at return; 2.3 (xhigh, 2026-09-14) took 33.4 min, 81
tool calls and 368,352 subagent tokens; 2.2 (effort high, 2026-09-14) took 33.8
min, 102 tool calls and 278,405 subagent tokens; 2.4 (effort high, 2026-09-15) took 17.4 min, 47 tool
calls and 193,922 subagent tokens. What share of his 10% any of
them was cannot be seen from here.

1. **1.1** - review the Veenker course map before it becomes app data. Effort
   high; review only.

2.3 ran first, at xhigh, and returned DONE `d892a39` (PASS,
`docs/handoff/REPORT_2.3.md`). 2.2 followed on his "make the four changes, then
run 2.2" and returned DONE `0a863a2`: FAIL for the course on one defect, the lie
grid below the fold at burst end (`docs/handoff/REPORT_2.2.md`). v24 stays off
the phone. Both lines are in `FOR_FABLE_LOG.md`. 2.4 (test build v25) ran on
his "Yes, run 2.4" and returned DONE `cb3ee9b`: PASS for the course
(`docs/handoff/REPORT_2.4.md`); its line is in the log too.

Spawn 1.1 with `subagent_type: "fable"`, one at a time, `run_in_background: false`. The commit hash for the prompt is
`git log -1 --format=%h` at spawn, with `git status` clean. A re-test of a
reworked v24 is a new item, priced for him first, and **the push still waits
for his word** in his chat.

**Not queued - needs his decision or his "xhigh" first:** the native recorder
(GPS pipeline), native storage of rounds and tracks and moving his logged
rounds across (schema and migration), turning the course map into app course
data (possibly schema - 1.1 classifies it), and shell vs full native rewrite
(his call). See `docs/HANDOFF-native-build.md`.

## 1. Critical review and requests for what is Fable's (a data model or schema change; the GPS pipeline; the strokes-gained engine or a benchmark; the export format; a migration of logged rounds; a golf/Matt call Opus cannot list)

### 1.1 The Veenker course map - review before it becomes app data (2026-09-13) - READY, RUN SECOND (after 2.2)

**His words, verbatim, in order:**

> "Okay you have the course data now I don't want a public map. What else do we need to nail do for the phone build?"

> "The OSM map is correct I looked it over - your guesses are way off. Clear all your stuff on the map and I'll mark it up. Tom has made changes to the course for the better and the OSM map is up to date. the yardages should still all be correct. ignore the bunkers, the additional blue tee on 17 across the creek is gone."

> "I finished marking up the map it is in the docs>Veenker folder. It should be clear but let me know if you have questions"

> "1. That is hole 8 my bad. 2. Forgot them yes they are just north of green. 3. Yes 16 has a tee boxed tucked way in the back between the 16 gold tees and 15 green. 2nd hardest tee shot the course"

> "yes to 10 based off OSM"

> "the map and my data are fine in the public repo"

("I don't want a public map" was about adding his missing tee box to
OpenStreetMap; the repo question was settled by the last quote.)

**Decisions he already made:** OSM is the ground truth for Veenker; his
markup's corrections (hole 8 labels, hole 9 tees, hole 16 back blue tee, hole
10's two blue boxes with blue playing the farther one); sand lies come from
OSM's bunkers; the map is fine in the public repo.

**Where it is:** `docs/course-map/veenker/` - README, `osm_full.json`,
`basemap.png`, `basemap_true_extent.json`, his markup
`veenker-aerial-Matt.png`, `markup_lines.json`,
`veenker_confirmed_corrections.json`, and the scripts that produced them.

**Evidence (Opus, 2026-09-13):** OSM inside the outline has 18 hole lines, 26
greens, 30 fairways, 43 tee boxes, 27 bunkers. His markup: 55 leader lines, all
labelled; tip-to-feature miss median 0.0 m, 90th percentile 0.6 m; every
miss over 1 m: SHORT GAME 81.2 m and RANGE 11.5 m (areas, not greens), hole 16
blue 48.5 m (the box OSM lacks), hole 12 blue 4.4 m, hole-8 ("R7") gold 2.4 m -
re-run from the committed folder at wrap-up. Hole 8: OSM's line starts on the
tees and ends in the green he marked (0.0 m). Two traps found and fixed on the way - Overpass `around`
dropping the course interior, and ISU `exportImage` returning a 1216 m tall
photo for a 903 m request (square pixels in degrees). Both are in the README.

**Asked of Fable (review only - do not change `js/data/courses.js` or any schema):**
1. Reproduce: `python extract_markup.py`, `python rematch.py`,
   `python check_answers.py` in that folder. Do not run `fetch_sources.py`
   over the committed files; fetch into your scratchpad if you want to check
   OSM has not changed.
2. Check the method for any error of the kind the two traps were: the
   tip-versus-tail rule, the colour classes, the true-extent pixel mapping,
   the multipolygon handling.
3. Check every hole 1-18 has exactly one green, at least one blue and one gold
   tee box attributable to it, and say which boxes are unassigned.
4. Say how the hole-16 back blue tee (a markup point, not a surveyed box)
   must be carried when it becomes course data, under the rule that measured
   and inferred are never silently mixed.
5. Classify only: is turning this into app course data a data model / schema
   change (xhigh on his word)? Do not design it.

## 2. Testing of a risky build (a build about to be played; anything touching the lock, the marks, the track, the hole windows or round save)

*(2.4 answered 2026-09-15 and moved to FOR_FABLE_LOG.md)*

*(2.2 answered 2026-09-14 and moved to FOR_FABLE_LOG.md)*

*(2.3 answered 2026-09-14 and moved to FOR_FABLE_LOG.md)*

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

- 2026-09-15 · 1.1 · **The map holds up; three things go to him; app course data is xhigh on his word.** Reproduced byte for byte on `ab1e58d` (55 leader lines, 20 black / 18 blue / 17 yellow, 0 unlabelled; miss median 0.0 m, 90th pct 0.6 m, max 81.2 m; n = 55; the two rewritten JSON files identical). OSM unchanged since the pull: 191 of 191 elements, 0 added / gone / re-versioned / moved (mirror state 2026-07-24, newest Veenker golf edit 2026-02-23; `overpass-api.de` 504'd once, not retried). No third trap: tip/tail margin at least 39 px (tail-to-text at most 17, tip-to-text at least 46), his Paint colours exact and the classes disjoint, nothing he drew dropped (2 blue specks under 40 px), the returned extent square in degrees and used by all three scripts (156.5 m N-S at the image edge if `frame.json` were used), greens/tees/bunkers all simple closed ways so multipolygons never touched the match, all 22 fairway/rough relations and the creek's 11 ways close. 18 of 18 hole lines end inside exactly one green (18 distinct; 8 practice greens on no hole). Tees: every hole has a blue and a gold box attributable to it except 12 blue (his tip 4.4 m past the back of the only box) and 16 blue (unmapped, his mark), and hole 9 has no mark from him ("Forgot them") - the two boxes at the line start measure 537 / 491 yd along the line vs card 537 / 495, blue and gold by yardage only (n = 1 each). Holes 11 and 18 share one 517 m2 box (both hole lines start in it, all four of his tips land in it): the hole comes from play order, never the polygon. 18 of 43 boxes unassigned: 4 range boxes and 14 unmarked forward/other boxes, identified by card yardage at n = 1 each and not to be written into course data without his word. The 16 back blue tee is carried as a point with `source`, a stated 5 m radius (50 of 52 tips inside the feature, worst 4.4 m; not a measured accuracy) and n = 1, never a polygon or an OSM id, never in `courseLearning.tees`; anything taken from it is inferred and confirmed at the end of the hole; a measured tee mark outranks it and sits beside it; yardage stays the card's 544. Same carry for 12 blue until he answers. Classification: a data model / schema change, xhigh on his word - the shot record's `source` is `'gps' | 'manual'` with a boolean `lieInferred`, a map-filled lie is a third source read through every logged round, and the map is a new record kind with per-feature provenance beside a measured-only `courseLearning`. On the 17 note: no OSM box exists that is only the gone cross-creek tee (hole 2's blue box is 190 yd from the 17 green across the creek, n = 1); yardages are his call, `courses.js` untouched. Caution for Opus: `detection-check.html` line 105 reads relation outers only; 21 of 30 fairways have inner rings. For him: hole 9 blue/gold yes or no; hole 12 blue at the back of the mapped box or its own box; "xhigh" before the map becomes app data. `docs/handoff/REPORT_1.1.md` (+ PDF). *(Item: the Veenker course map. Tree `ab1e58d`, Fable this commit.)*
