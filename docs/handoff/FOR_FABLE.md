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

**Fable's usage on this project, his words, 2026-09-14:** "Yes but Fable is
restricted 10% weekly usage on this project so plan accordingly and let me pick
if a usage choice needs made". So before every spawn Opus names the item, its
effort and the cost of the last comparable run, and he picks. The one completed
run to price from is 2.1 (effort high, 2026-09-11): 29.2 min, 138 tool calls,
294,843 tokens reported at return. What share of his 10% that was cannot be
seen from here.

1. **2.2** - test build v24 before it is played (another walking 9 is
   possible this week, weather permitting). Effort high.
2. **2.3** - review the recorder bake-off apps. **xhigh, and only after he
   types "xhigh" in the chat.** The field data is the 2026-09-14 round alone:
   asked whether to wait for a carry, he picked "The round only
   (Recommended)". Before the spawn, Opus renames the apps to his pick, "GPS
   Custom / GPS Transistor", so Fable reviews the build that goes on the phone.
3. **1.1** - review the Veenker course map before it becomes app data. Effort
   high; review only.

Spawn 2.2 and 1.1 with `subagent_type: "fable"` and 2.3 with `"fable-xhigh"`,
one at a time, `run_in_background: false`. The commit hash for the prompt is
`git log -1 --format=%h` at spawn, with `git status` clean. After 2.2 returns
DONE, **the push still waits for his word** in his chat.

**Not queued - needs his decision or his "xhigh" first:** the native recorder
(GPS pipeline), native storage of rounds and tracks and moving his logged
rounds across (schema and migration), turning the course map into app course
data (possibly schema - 1.1 classifies it), and shell vs full native rewrite
(his call). See `docs/HANDOFF-native-build.md`.

## 1. Critical review and requests for what is Fable's (a data model or schema change; the GPS pipeline; the strokes-gained engine or a benchmark; the export format; a migration of logged rounds; a golf/Matt call Opus cannot list)

### 1.1 The Veenker course map - review before it becomes app data (2026-09-13) - READY, RUN THIRD (after 2.3)

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

### 2.3 The recorder bake-off app - review at xhigh before it goes on the course (2026-09-13) - NEEDS HIS "xhigh"

**Spawn with `subagent_type: "fable-xhigh"`, and only after he has typed
"xhigh" in the chat for this item.** He was told, in the option he picked: *For
that Fable review, type "xhigh" in this chat.*

**His words, verbatim, 2026-09-13 (the native-build chat).** He was asked four
questions and picked these options:

> "Native shell (Recommended)"

> "Kotlin vs transistorsoft (Recommended)"

> "Opus builds, Fable reviews (Recommended)" - the option's text as he read
> it: "Opus builds a throwaway test app that only measures coverage and never
> feeds a round. Fable reviews it at xhigh before it goes on the course, and
> gives the pass/fail verdict. The recorder your rounds actually use and its
> storage stay Fable's. For that Fable review, type "xhigh" in this chat."

> "99% coverage, no gap > 20 s (Recommended)" - asked as "What result does a
> recorder need to pass? Same coverage measure as the handoff's Section 9
> table, over a round-length carry with the screen locked and a music app in
> use."

And on installs: "what are you asking. You may install whatever is needed"

**Decisions he already made:** native shell before 2026-10-07; the contenders
are a hand-written Kotlin recorder and transistorsoft's Android SDK in debug
builds; Opus builds the comparison app, Fable reviews it at xhigh and gives the
verdict; the recorder that feeds rounds, and its storage, stay yours; the bar is
99% covered and no gap over 20 s on the Section 9 measure.

**Where it is:** `android/bakeoff/` (start with its `README.md`: the two apps,
T's four changed defaults with the doc quotes, the measure, the files, the gap
diagnosis) and `tools/track-coverage.py`. Opus's decisions and reasons are in
`docs/DECISIONS_LOG.md`, entries marked (Opus), 2026-09-13.

**Evidence (Opus, 2026-09-13):** the README's "Verified on the emulator"
section has every number. In short:
- **Tests:** unit tests 8/8 in each app; `tools/track-coverage.py --self-test`
  14/14. Mutation check: `>` to `>=` in the gap test fails 2 of the 8 Kotlin
  tests and 3 of the Python checks.
- **Section 9:** the tool reproduces all 6 rows from the exports.
- **Emulator:** three smoke runs on Android 15 with synthetic 1 Hz GPS, n = 3
  runs of 4-9 minutes. That proves the plumbing, not the bar: no Samsung, no
  pocket, no round-length carry.
- **Run 1:** found T's headless rule (357 s with no fixes in the app log while
  the SDK store kept filling) and the tool's blind spot for a recorder that
  dies before STOP.
- **Run 2, after both fixes:** K PASS (267 fixes, 0 gaps across background,
  destroyed screens and `kill -9`). T PASS in both its app log (336) and its
  store (333).
- **Run 3:** T's repeated fix times after a kill are not caused by our
  `changePace`. Android's restart backoff took about 57 s on a second kill
  minutes after the first.

**Field evidence (Opus, 2026-09-14):** the first round with both apps. He
walked Veenker 16:07-18:08 with golf-tracker v23 on the same phone. The data
is committed at `docs/bakeoff-data/2026-09-14-veenker-walking/` (README
first), on branch `bakeoff-data-2026-09-14`. His words: "put all this data in
a spot for Fable to pick it up in a new chat under your guidance. Commit and
push it once processed". On the push he picked "Push to a branch
(Recommended)", so `main` is not pushed.

Measured, n = 1 round:

| Recorder | Fixes | Gaps > 20 s | Longest gap | Median accuracy | Bar |
|---|---|---|---|---|---|
| K | 7,237 | 0 | 2 s | 3.1 m | PASS |
| T, app log | 7,256 | 0 | 2 s | 3.1 m | PASS |
| T, SDK store | 7,249 | 0 | 2 s | 3.1 m | PASS |
| golf-tracker's own track | 8,579 | 5 | 384 s | 3.0 m | - |

K and T each kept 235 / 21 / 76 / 383 / 64 fixes inside golf-tracker's five
gaps. The 384 s gap lines up with screen_off 17:41:18 to screen_on 17:47:34.
The screen was on at 95% of heartbeats and music at 0%, so the bar's
locked-screen condition was not met. Phone battery went 90% → 78% over 2.0 h
(the whole phone). T had 10 repeated fix times in its log and 4 in its store,
with no kill.

**His answers on this round, 2026-09-14, verbatim.** The phone: "pocket and
push cart - always near the ball. This is the best data yet". Did a
notification ever disappear: "3 but did not mess with anything and they were
still there at the end so leaning toward 1 as the answer" (3 was "Didn't check",
1 was "No, both stayed"). Problems: picked "Nothing went wrong". K's files
timestamped 20:03: "3 but 1 probably based off that time stamp" (3 was "Don't
remember", 1 was "Yes", exported again). No carry was done. Asked whether this
review should wait for one, he picked "The round only (Recommended)".

**Asked of Fable about this round (with 1-10 below):**
- Reproduce the numbers from the committed files (commands in that README).
- Does this round count toward the verdict, given the screen was on for 95% of
  it?
- What does a fair locked-screen test need?

**Asked of Fable (xhigh on his word):**
1. **K:** fused `PRIORITY_HIGH_ACCURACY`, 1 s, `minUpdateDistance 0`,
   `maxUpdateDelay 0`, `GRANULARITY_FINE`, a `location` foreground service,
   `START_STICKY`, a partial wake lock, resume on process start. Name anything
   that would lose fixes with the screen locked on a Galaxy S26.
2. **T:** is it raw and fair? The four changed defaults are quoted in the
   README. Is anything else in the SDK altering or dropping fixes? Do `ready()`
   on every process start and `changePace(true)` keep it recording through a
   five-minute wait on a tee?
3. **The measure:** `Coverage.kt` against `tools/track-coverage.py` against
   Section 9. The choices to check: fix time rather than receive time, T's
   samples counted, cut rows skipped.
4. **The gap diagnosis:** the heartbeat is a `HandlerThread` timer. Can it stall
   during CPU sleep while the recorder is alive, and so call a live recorder
   dead?
5. **Data integrity:** `SessionLog`'s flush-per-row, 15 s fsync, cut-row
   repair, and the export copy. Is there any path that loses or corrupts a row?
6. **Verdict:** may these two APKs go on his phone for a carry and on the
   course? If not, BLOCKED with what must change.
7. **Classify only:** when the winner becomes the recorder that feeds rounds,
   which of this code is reusable and which must be rebuilt under the data model
   rules? Do not design it.
8. **Repeated fix times:** after a `kill -9`, T re-records fixes whose times it
   already had (run 2: 88 in the log, 93 in its store; run 3: 22 and 21; K: 0).
   Where do they come from? Does the configuration need to change, or only the
   analysis?
9. **`allowIdenticalLocations`:** what does the SDK treat as identical, the same
   fix delivered twice or a new fix at the same coordinates? The check is not in
   the published sources. If it is only the former, `false` is the cleaner
   setting.
10. **Restart backoff:** T came back about 5 s after one kill (run 2) and about
    57 s after a second kill minutes later (run 3). K was not killed twice. Can
    either recorder do anything about Android's backoff, or is it only something
    to watch for in the field?

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

*(none - 2.1 moved to FOR_FABLE_LOG.md on 2026-09-11)*
