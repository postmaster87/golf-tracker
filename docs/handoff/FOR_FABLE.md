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
min, 102 tool calls and 278,405 subagent tokens. What share of his 10% any of
them was cannot be seen from here.

1. **2.4** - test build v25 before it is played. Effort high. Waits for his
   pick; whether it runs before 1.1 is his call too.
2. **1.1** - review the Veenker course map before it becomes app data. Effort
   high; review only.

2.3 ran first, at xhigh, and returned DONE `d892a39` (PASS,
`docs/handoff/REPORT_2.3.md`). 2.2 followed on his "make the four changes, then
run 2.2" and returned DONE `0a863a2`: FAIL for the course on one defect, the lie
grid below the fold at burst end (`docs/handoff/REPORT_2.2.md`). v24 stays off
the phone. Both lines are in `FOR_FABLE_LOG.md`.

Spawn 2.4 and 1.1 with `subagent_type: "fable"`, one at a time, `run_in_background: false`. The commit hash for the prompt is
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

### 2.4 Build v25 - the lie grid above the fold, and still when the burst ends (2026-09-15) - READY, WAITS FOR HIS PICK

**His words, verbatim, 2026-09-15:** "fix the lie card and yes the conformation when in question is needed when I am entering the score at the end of the hole. Workflow on the green mark the cup or my ball first whatever is easiest. Hole out - record the putt length for short putts, double check GPS for long putts, enter hole score (once this is entered the app needs to compute the shots and ask me questions about the lie. Shot 2 rough or fairway, shot 3 green or fairway, etc..."

Before that: item 2.2 ran on his "make the four changes, then run 2.2" and
returned FAIL for the course on the lie fold (`docs/handoff/REPORT_2.2.md`);
v24 stays off the phone.

**Decisions he already made:** v24 does not go on the phone; the push waits for
his word; Fable's usage here is capped at 10% a week and he picks each spawn
("let me pick if a usage choice needs made").

**What changed, and the evidence:** `docs/REVISIONS.md`, "The lie grid above
the fold, and still when the burst ends - build v25". Suite 511/511; mutation
509/511, exactly the two new tests failing; measured on the sim at 360x780 and
375x812 (23 px and 55 px below the grid, 0 px of movement).

**Asked of Fable (effort high):**
1. Testing verdict before it is played: the lie card at burst end (Fable's two
   acceptance tests and the new movement test are the bar), and the marks and
   round save as in 2.2, at 375x812 and 360x780.
2. The card now sits above every banner. Check that nothing he needs at burst
   end is hidden by that: the hole-change banner and its BACK control, the
   missing-tee nudge, a poor-fix warning.
3. Anything in v25 that weakens what 2.2 passed: the LOCK tab over every sheet,
   the marks, round save, `zoneOf`.

*(2.2 answered 2026-09-14 and moved to FOR_FABLE_LOG.md)*

*(2.3 answered 2026-09-14 and moved to FOR_FABLE_LOG.md)*

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

*(none - 2.3 and 2.2 moved to FOR_FABLE_LOG.md on 2026-09-14)*
