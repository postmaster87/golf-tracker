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

## RUN ORDER - the night of 2026-09-14, when his Fable usage resets

His words, 2026-09-13: "Opus you are on your own here. Anything you want Fable
to check make a file for it to run tomorrow night when credits reset". And:
"Next to know is I am out of Fable Usage until tomorrow night".

1. **2.2** - test build v24 before it is played (he may walk 9 on Tuesday
   2026-09-15). Effort high.
2. **1.1** - review the Veenker course map before it becomes app data. Effort
   high; review only.

Spawn each with `subagent_type: "fable"`, one at a time, `run_in_background:
false`. The commit hash for the prompt is `git log -1 --format=%h` at spawn,
with `git status` clean. After 2.2 returns DONE, **the push still waits for his
word** in his chat.

**Not queued - needs his decision or his "xhigh" first:** the native recorder
(GPS pipeline), native storage of rounds and tracks and moving his logged
rounds across (schema and migration), turning the course map into app course
data (possibly schema - 1.1 classifies it), and shell vs full native rewrite
(his call). See `docs/HANDOFF-native-build.md`.

## 1. Critical review and requests for what is Fable's (a data model or schema change; the GPS pipeline; the strokes-gained engine or a benchmark; the export format; a migration of logged rounds; a golf/Matt call Opus cannot list)

### 1.1 The Veenker course map - review before it becomes app data (2026-09-13) - READY, RUN AFTER 2.2

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

### 2.2 Build v24 - the footer stops moving, the lock is reachable everywhere (2026-09-13) - READY, RUN FIRST

**Released for the night of 2026-09-14.** Held earlier on his word ("Stage what
Fable needs but hold it up for now. I want to brainstorm ideas before going
further."), then: "Opus you are on your own here. Anything you want Fable to
check make a file for it to run tomorrow night when credits reset". v24 is
committed at `84da7f4` (with `9836602` and `be82cef` after it) and NOT pushed,
so his phone still runs v23. He may play a walking 9 on Tuesday 2026-09-15:
"I might get 9 in walking tuesday morning weather pending". A DONE verdict does
not push; the push is his word.

**His words, verbatim:**

> "Go ahead and I'll take your recommendations. We need the lock button bigger and available at all times"

The recommendations he took: the action stack never disappears; an unanswered
lie becomes a card in the body rather than a takeover of the footer; the body
scrolls to the top when that card appears.

**Field test 7 produced it**, in his words:

> "I hit a tree off the tee on hole 1 and thought I had marked the shot but I think you made selecting a lie required so I couldn't figure out why I couldn't mark my 3rd shot at the ball on 1 so I ended up deleting the shot marking twice"

> "Then I had to mess with marking the shot and the cup, trying to lock the phone because you cant lock it on the putting screen"

**What changed (Opus):** `js/ui/screen-play.js` (capture and lie move to the
body as `captureCard` / `pendingLieCard`, `paintActions` always runs, MARK SHOT
and MARK CUP inert only during a running burst, lie grid above club grid),
`css/base.css` (`.body > .capture` card, lock tab 76x168 at z-index 70,
`has-lock-tab` reserves the strip on `.sheet` too, `.cap-row` re-scoped),
`js/ui/lock.js` (`zoneOf` measures the overlay, not `window.innerHeight`),
build v24 in `js/data/build.js` + `sw.js`, tests in `test/run.js` +
`test/index.html`. No file of yours was edited.

**Added to v24 afterwards, 2026-09-13:** Veenker tee yardages corrected in
`js/data/courses.js` on Matt's approval - hole 7 blue 570 -> 590 and gold
513 -> 531 (midpoint of a 513-550 gold box, his choice), hole 10 blue
540 -> 560; totals blue 6672, gold 6047. New rounds only: rounds copy yardages
at creation and strokes gained does not read scorecard yardage.

**Evidence:** 501/501 at `http://localhost:8123/test/`, three runs, with the
browser pane HIDDEN. Six new tests (2 in the mark-flow group, 4 in "the lock tab
is reachable everywhere"). Mutation check: restoring the footer takeover fails
exactly the two new action-stack tests. On the simulator at 375x812: during a
burst the card is in the body and MARK SHOT is present and disabled; after it,
the lie box is fully visible (top 267, bottom 407 of an 812 px viewport) with
MARK SHOT 4 live below; on an open sheet the content ends at x=277 and the tab
starts at x=299.

**Also in here, and worth your eye:** the "known intermittent" pocket-lock test
is diagnosed and fixed. `zoneOf` used `window.innerHeight`, which is 0 in a
hidden pane, so the dead band covered the screen and the unlock gesture could
not be performed. It was never intermittent - it tracked whether anyone was
looking at the pane. Reports from here on should stop carrying that caveat.

**Asked of Fable:**
1. Testing verdict before it is played: the lock (now above sheets - check that
   nothing tappable hides under the tab on EVERY sheet, not just the two I
   measured), the marks, and round save.
2. Critical review of the `zoneOf` change, since it touches the pocket-lock
   gesture that guards against the phone being sat on. The dead band, the zone
   split and every rejection path are unchanged; only the height source moved.
   If you judge it weakens the guard, BLOCKED with the reason.

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

*(none - 2.1 moved to FOR_FABLE_LOG.md on 2026-09-11)*
