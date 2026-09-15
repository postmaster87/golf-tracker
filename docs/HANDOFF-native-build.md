# Handoff - the native phone build (start here)

Written 2026-09-13 by Opus (Claude Code) at the end of a long session, for the
new chat that will build the app. Matt: *"We need to wrap this session up. Get
everything to a place I can start a new chat and get you building the app."*

The repo is the authority; this file points into it. Every quote is verbatim.
Every number was measured this session, with its n.

---

## 1. Where the tree stands

- **His phone runs build v23** (`0ba7721`, pushed and hash-verified on
  2026-09-11).
- **On `main`, NOT pushed:** `84da7f4` build v24 (the capture and lie card
  move into the body so the footer never changes; the LOCK tab is 76x168 and
  sits above sheets; `zoneOf` measures the overlay), `9ece308` hold note,
  `9836602` gitignore `docs/Veenker/`, `be82cef` Veenker holes 7 and 10
  yardages, and the wrap-up commit that adds this file.
- **The push is the deploy** (Pages serves `main`) and runs only on his word.
- `REVISION` is still 4. `BUILD.id` is v24.
- **Suite:** 501/501, "all green", at `http://localhost:8123/test/`, re-run at
  `be82cef` during this wrap-up (the commits since touch docs only).
- **Fable's queue** (`docs/handoff/FOR_FABLE.md`) has a run order for the
  night of 2026-09-14, when his Fable usage resets: item 2.2 (test v24), then
  item 1.1 (review the course map).

## 2. What he wants, in his words

- *"My ideal vision for this is a way to mark the tee shots and cup, add the
  other information post round - lies, penalties, known distances, putts,
  etc... A few things I could probably log between holes but this is all
  dependent on the tracker working."*
- *"I don't like marking up a card between shots or holes hence all this
  effort. Recalling data from after a round is dicey since it depends on my
  memory and recalling it right away not days later. The whole point is
  unbiased data which I can't honestly give."*
- *"Okay we are closer than I thought. Marking the cup must happen that I
  accept. Marking putt 1 and possibly entering the distance might need to
  happen. I have the GPS spot on for putt distances and way off. If we can fix
  the green interface I think it is acceptable. Is it possible for me to mark
  the cup, putt 1, and my score. Then the app computes the shot locations from
  the track and auto fill the lies and distances. Then I click on any entries
  to manually correct.? Last thing this should be a native app on my phone"*
- *"I really would like this entirely off of webapps and all local."*
- *"The real motivation is what you stumbled on and it is 2 fold: allowing the
  GPS to run in the background and mark the track regardless of what I am
  doing on the phone and 2 eliminating the phone but not with a watch -
  remember my background."*
- *"I do not have time for the clicker that is an offseason project that does
  not need course data to test how well it works. this gives me plenty of time
  to fine tune the PCB, build and enclosure, and maybe look at GPS too. The
  next few weeks are all phone."*
- *"I am fixing my hip on October 7th so we have now until then for real
  data."*

## 3. Decided

| Decision | His words |
|---|---|
| A native Android app on his phone | *"Last thing this should be a native app on my phone"* |
| All local, off web apps | *"I really would like this entirely off of webapps and all local."* |
| Installs are fine; pick what performs best | *"Installs are not off the table you misread I can install whatever is needed. I want the option that works and performs the best"* |
| Compare recorders before committing to one | *"I like the let's compare idea. Keep that in mind while we keep brainstorming this."* |
| The phone is the source; the BLE clicker is his offseason hardware project | *"it is a supplement to the phone. That should remain the source for now."* / *"The next few weeks are all phone."* |
| On the course he touches cup, putt 1 and score - no tee marks | the cup/putt 1/score quote above, then *"yes to 6"* |
| Sand lies from OSM's mapped bunkers | *"yes to 10 based off OSM"* |
| The repo stays public; his round data and the course map are fine in it | *"it can stay public this is not sensitive data"* / *"yes it is public knowledge I golf a lot and where I work. I am a State of Iowa employee"* / *"the map and my data are fine in the public repo"* |
| The Veenker course map is OSM plus his markup | see `docs/course-map/veenker/README.md` |
| Veenker holes 7 and 10 tee yardages | confirmed hole by hole, committed `be82cef` |
| Veenker hole 9: OSM's back box is blue (537 yd along the line), the next box gold (491 yd). Hole 12: one mapped box, golds toward the center, blues at the back | *"yes to 9 I already confirmed that with you. 12 is a single long tee box. Golds towards the center blues at the back - like I said the map is correct."*, 2026-09-15, answering Fable's 1.1 (`docs/handoff/REPORT_1.1.md`) |
| Cell coverage at Veenker is fine | *"Not my network connection is actually fine on Veenker - not had issues there."* |
| The global "no native builds" rule is gone | *"I don't remember this rule but remove it. I have had you build multiple native apps in code."* |
| **Native shell** for the build played before 2026-10-07: the current screens inside a Kotlin app with their files on the phone, plus a native background recorder. A fully native UI waits for the offseason | Picked *"Native shell (Recommended)"*, 2026-09-13, native-build chat |
| **Bake-off contenders:** a hand-written Kotlin recorder against transistorsoft's Android SDK (`tslocationmanager`), both debug builds, no Node | Picked *"Kotlin vs transistorsoft (Recommended)"*, 2026-09-13 |
| **Opus builds the bake-off app** (it measures coverage and never feeds a round). Fable reviews it at xhigh before it goes on the course and gives the pass/fail verdict. The recorder that feeds rounds, and its storage, stay Fable's | Picked *"Opus builds, Fable reviews (Recommended)"*, 2026-09-13 |
| **Pass bar:** 99% coverage and no gap over 20 s, on the Section 9 measure, across a round-length carry with the screen locked and a music app in use | Picked *"99% coverage, no gap > 20 s (Recommended)"*, 2026-09-13 |
| Installs for the build | *"You may install whatever is needed"*, 2026-09-13 |
| The 2026-09-14 walking round's data is committed for Fable: `docs/bakeoff-data/2026-09-14-veenker-walking/`. It is pushed to branch `bakeoff-data-2026-09-14`, not `main`, so v24 does not deploy before Fable's test | *"put all this data in a spot for Fable to pick it up in a new chat under your guidance. Commit and push it once processed"*, then picked *"Push to a branch (Recommended)"* |
| Test app names: Bake-off K becomes GPS Custom, Bake-off T becomes GPS Transistor | Picked *"GPS Custom / GPS Transistor"*, 2026-09-14 |
| Fable's run order: 2.2, then 2.3, then 1.1 | Picked *"2.2 → 2.3 → 1.1 (Recommended)"*, 2026-09-14 |
| Fable's 2.3 reviews the 2026-09-14 round, with no carry | Picked *"The round only (Recommended)"*, 2026-09-14 |
| Lies in question are confirmed at the end of the hole, when he enters the score; the app computes the shots and asks about each lie in question | *"fix the lie card and yes the conformation when in question is needed when I am entering the score at the end of the hole. Workflow on the green mark the cup or my ball first whatever is easiest. Hole out - record the putt length for short putts, double check GPS for long putts, enter hole score (once this is entered the app needs to compute the shots and ask me questions about the lie. Shot 2 rough or fairway, shot 3 green or fairway, etc..."*, 2026-09-15 |
| Fable's usage here is capped at 10% a week, and he picks whenever usage has to be chosen | *"Yes but Fable is restricted 10% weekly usage on this project so plan accordingly and let me pick if a usage choice needs made"*, 2026-09-14 |

## 4. Still open - his call

Recommendations below are Opus's, not his.

1. ~~Native shell or full native rewrite~~ - **decided 2026-09-13**, Section 3.
2. ~~Recorder bake-off contenders and pass bar~~ - **decided 2026-09-13**,
   Section 3. The bar he picked is 20 s, not the 60 s first recommended here:
   the median stand at a real shot is 62.9 s, so a 60 s gap can hide one.
   Under the Section 9 measure, no gap over 20 s means 100% covered, so the
   gap clause is the one that decides.
3. **Typed first-putt distance threshold:** 15 ft (*recommendation*) or 20 ft.
4. **Retire the in-app pocket lock** once the recorder is native, and use the
   phone's power button (*recommendation*: yes).
5. **Penalties logged when they occur.** His earlier words: *"If there is a
   penalty I will log it when it occurs and the score is adjusted after holing
   out on that hole."* Confirm it still holds.
6. ~~**Auto-lie edge rule**~~ - **decided 2026-09-15**, Section 3: a lie in
   question is confirmed when he enters the score at the end of the hole. The
   4 m band is still Opus's recommendation for what "in question" means; he
   has not set a number. Evidence behind it, 2026-09-14 round (n = 5 lies he
   gave): the course map matched all 5, and two sat within 4 m of an edge
   (0.6 m and 3.0 m).
7. **Push v24** after Fable's 2.2 verdict - he may walk 9 on Tuesday
   2026-09-15: *"I might get 9 in walking tuesday morning weather pending"*.
   **Answered 2026-09-14:** *"Yes but Fable is restricted 10% weekly usage on
   this project so plan accordingly and let me pick if a usage choice needs
   made"*. The push still waits for his go at the moment it runs.
8. **Commit `docs/roundDownloads/`?** Public is fine by his word, but he has
   not said to commit it; it stays gitignored until he does.
9. The field test 7 export still in his Downloads - he said *"Ditch all the
   data. It was a failed field test."*; deleting that copy was asked, not
   answered.

## 5. Timeline

- **Surgery: Wednesday 2026-10-07.** Golf season ends there.
- **Rounds available:** possibly Tuesday 2026-09-15 (walking 9), weekends
  19-20 and 26-27 September and 3-4 October, and, in his words, *"more than
  just the weekend"*.
- **Order of work Opus proposed:** recorder bake-off harness -> bake-off on
  the next rounds -> the green flow -> real data before 2026-10-07.
- **2026-09-13, native-build chat:** the bake-off harness is built and
  smoke-tested on the emulator (`android/bakeoff/`, README first). Next:
  Fable's item 2.3 at xhigh (it needs his "xhigh" in the chat first), then a
  carry, then rounds.
- **2026-09-14:** the apps were set up on his S26 (`bakeoff.ps1 setup`) and ran
  through the first walking round at Veenker. Both passed (0 gaps in 2 h, n = 1
  round), while golf-tracker's web track had 5 gaps, the longest 384 s. The
  screen was on 95% of the time, so the locked-screen condition is still
  untested. Data: `docs/bakeoff-data/2026-09-14-veenker-walking/`. Next:
  his "xhigh", then Fable's queue 2.2, 2.3, 1.1.
- **2026-09-14, next chat:** his answers are in
  `docs/handoff/NEXT_CHAT_2026-09-14.md`, Section 5. The card (39) reconciles
  with golf-tracker's 30 records hole by hole. Rounds this week, his words:
  *"another walking 9 or 2 is possible and this weekend all weather
  dependent"*. Fable's usage here is capped at 10% a week, and he picks each
  spawn. Order: 2.2, rename the apps, 2.3 (his "xhigh"), 1.1.

## 6. Architecture notes

- **Background location is native-only.** A web page receives GPS only while
  it is the foreground page. The track must be recorded and stored natively,
  and the app reads it when it comes forward. That is the GPS pipeline and a
  storage schema: **Fable's, and xhigh on his word.**
- **Toolchain on this PC** (checked 2026-09-13): OpenJDK 17.0.20; Android SDK
  at `%LOCALAPPDATA%\Android\Sdk`; Android Studio; `adb` (WinGet
  platform-tools). Node/npm not installed (needed only for Capacitor).
  transistorsoft also ships a plain Android SDK (`com.transistorsoft:tslocationmanager`
  4.5.1 on Maven Central, published 2026-09-04), so neither bake-off contender
  needs Node. Added for the bake-off on 2026-09-13: SDK Platform 36, Gradle
  8.13, and the `golf-bakeoff` emulator (Android 35 image).
- **His phone:** Samsung Galaxy S26 (camera EXIF on 2026-09-13).
  Samsung's aggressive app sleeping is the known risk to a background recorder.
- **Recorder candidates**, re-read from their own README and API docs on
  2026-09-13:
  - *transistorsoft capacitor-background-geolocation* - "fully functional in
    `DEBUG` builds"; "A license is required for `RELEASE` builds"; records
    into "the SDK's SQLite database"; "it tracks aggressively while the
    device is moving and pauses location services when stationary", and its
    heartbeat "Fires at each [heartbeatInterval] while the device is in the
    stationary state" with the last known fix, not a fresh one.
    `changePace(true)` forces tracking on. Continuous 1 Hz while he stands
    over a shot must be forced and proven in the bake-off.
  - *capacitor-community/background-geolocation* - MIT; "a notification must
    be shown to continue receiving location updates in the background";
    locations go to a JavaScript callback (nothing stored natively); set
    `android.useLegacyBridge` to `true`, which "prevents location updates
    halting after 5 minutes in the background".
- **Why standing still matters:** dwell is the whole shot signal. Median dwell
  at real shots 62.9 s vs 19.0 s at other stops, across 444 stops on 24 holes
  and four rounds (`docs/REVISIONS.md`, v22); FT7, before it was ditched,
  142.5 s vs 20 s.

## 7. The on-course flow (phone only)

- **Tee to green:** nothing. Phone in the pocket.
- **At the green:** MARK CUP, MARK PUTT 1, a typed distance only when the putt
  is short (threshold open), and the score. Putts = score minus confirmed full
  shots.
- **His workflow, 2026-09-15, verbatim:** "fix the lie card and yes the conformation when in question is needed when I am entering the score at the end of the hole. Workflow on the green mark the cup or my ball first whatever is easiest. Hole out - record the putt length for short putts, double check GPS for long putts, enter hole score (once this is entered the app needs to compute the shots and ask me questions about the lie. Shot 2 rough or fairway, shot 3 green or fairway, etc..." The typed-putt
  threshold (Section 4, item 3) is still open.
- **The app:** proposes where each shot was played from out of the track's
  stops (it knows how many from the score), fills distances from the track and
  the cup, fills lies from the course map, flags edge cases, and he taps
  anything wrong. The gaps gate still guards the save.

Why the putt number is only asked for when short - a GPS putt distance can be
several feet off, and what an error costs depends on length. The 8 ft example
from the brainstorm, computed 2026-09-13 with the shipped
`expectedStrokes('green', ft, { baseline: 'scratch' })` in
`js/analysis/benchmarks.js` (the scratch baseline is derived, badged
unverified there):

| First putt | Expected putts | Cost if it was really 8 ft shorter |
|---|---|---|
| 10 ft | 1.63 | 0.62 strokes |
| 15 ft | 1.79 | 0.34 |
| 20 ft | 1.88 | 0.17 |
| 30 ft | 1.98 | 0.08 |
| 60 ft | 2.27 | 0.09 |

And why lies matter more than distance precision: at 150 yd a wrong lie
(rough vs fairway) costs 0.254 strokes; a 6 yd distance error costs 0.022.

## 8. The Veenker course map

Everything is in `docs/course-map/veenker/` - start with its README. In short:
OSM has all 18 hole lines, 26 greens, 30 fairways, 43 tee boxes, 27 bunkers
(counts pulled 2026-09-13); Matt's markup matched it 55/55 with a median miss
of 0.0 m; the corrections are hole 8 labels, hole 9 tees, hole 16's unmapped
back blue tee, hole 10's two blue boxes. Two traps (Overpass `around`, square
pixels in degrees) are documented there and cost most of an afternoon.

## 9. Evidence worth keeping

**Track coverage across every field test** - the constraint the native
recorder exists to fix:

| Round | Span | Fixes | Covered | Gaps > 20 s | Longest gap | Median accuracy |
|---|---|---|---|---|---|---|
| FT3 Veenker front 9, 16 Aug | 144 min | 7,858 | 105 min (73%) | 16 | 11.2 min | 3.1 m |
| FT4 Radcliffe 9, 22 Aug | 181 min | 11,393 | 164 min (91%) | 9 | 5.6 min | 3.2 m |
| FT4 second nine, 22 Aug | 33 min | 2,327 | 33 min (100%) | 0 | - | 3.6 m |
| FT5 Veenker back 9, 23 Aug | 129 min | 9,358 | 109 min (84%) | 7 | 6.5 min | 3.0 m |
| FT6 Veenker hole 1, 9 Sep | 28 min | 959 | 14 min (51%) | 3 | 11.2 min | 3.8 m |
| FT6 Veenker 14-18, 9 Sep | 75 min | 5,913 | 72 min (96%) | 4 | 1.6 min | 3.0 m |
| FT7 Veenker 1-5, 11 Sep | 141 min | 4,585 | 62 min (44%) | 6 | 65.6 min | 3.1 m |

FT7's 65.6 min gap is him shutting the app down: *"I shut the app down and
started playing golf and much better I must say."*

**Can the track find the shots?** From `tools/detection-scoring.html`:

| Round | Marks | Position in track | Ranking picks |
|---|---|---|---|
| FT4 Radcliffe | 27 | 25/27 (93%) | 16/27 (59%) |
| FT5 Veenker back 9 | 35 | 35/35 (100%) | 26/35 (74%) |
| FT6 Veenker 14-18 | 23 | 23/23 (100%) | 21/23 (91%) |
| FT6 Veenker hole 1 | 4 | 4/4 (100%) | 3/4 (75%) |
| overall | 89 | 87/89 (98%) | 66/89 (74%) |

(Before it was ditched, FT7 scored 11/11 and 10/11, making 76/100 with it - but
3 of its 11 marks were catch-up logs, and the row was reverted out of the tool
on his word. The ranking line matches `docs/REVISIONS.md`, v22.)

## 10. What happened this session, briefly

- v23 went to the phone 50 minutes before field test 7 (2026-09-11). FT7
  failed: the lie panel took over the footer so MARK SHOT vanished, and the
  LOCK tab was unreachable over the putt sheet. His words: *"it just got in the
  way of my golf"*.
- v24 fixes both, plus the "known intermittent" pocket-lock test, which was
  never intermittent: `window.innerHeight` is 0 in a hidden preview pane, so
  the unlock zones disappeared. Built, tested, committed, not pushed.
- A brainstorm settled the direction in section 3.
- The Veenker course map was reconciled with his markup, and holes 7 and 10
  yardages were corrected.

## 11. Rules that bound the build

- His global CLAUDE.md, the repo `CLAUDE.md`, and `.claude/agents/fable.md`.
- **xhigh on his word before starting:** a data model or storage schema, the
  GPS precision pipeline, the strokes-gained engine, any migration of logged
  rounds. The native recorder and native storage are all of those.
- **Fable owns** the data model and rails, the GPS pipeline, the SG engine,
  testing verdicts on risky builds. Opus builds everything else and queues the
  rest in `docs/handoff/FOR_FABLE.md`.
- The push is the deploy, on his word. Stage by name, never `git add -A`.
- Every number with its n. Propose and confirm, never detect and fill.
  Measured and inferred never silently mixed. Nothing guessed into course
  data. No coaching.
- Documents he reads are PDFs (this file has a PDF beside it).
- Stay in this repo.
