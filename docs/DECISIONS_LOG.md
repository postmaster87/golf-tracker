# DECISIONS LOG - every decision Fable made alone, and why

Matt, 2026-09-08 night, on accepting the same setup for the chess project:
"I am good with that as long as I can request details or see why you made
the decisions when needed." Newest first. One entry per decision: date, the
decision, the reason, what it changed, the commit, the report. Opus answers
his "why" from here, quoting the entry with its links - never a paraphrase,
never "Fable decided".

Opus's solo decisions are logged here too, marked (Opus).

## 2026-09-15 - Item 1.1: the Veenker course map reviewed; it holds, three things go to Matt, app course data is xhigh
- **Decision:** the map holds up for app data. The three scripts reproduce
  byte for byte (55 lines, 20/18/17, 0 unlabelled, miss median 0.0 m, 90th
  0.6 m, max 81.2 m, n = 55); OSM unchanged since the pull (191 of 191
  elements, 0 changes, mirror state 2026-07-24); no third trap in the method
  (tip/tail margin at least 39 px, classes disjoint, extent square in degrees
  and used everywhere, all 22 fairway/rough relations and the creek close).
  18 of 18 hole lines end in exactly one green; every hole has a blue and a
  gold box except 12 blue and 16 blue (unmapped, his marks) and hole 9
  (unmarked by him). Turning it into app course data is a data model change:
  xhigh on his word.
- **Made alone:** (1) attribution by OSM hole-line start/end plus his tips
  with card yardage along the line as the check, not the rematch table alone
  (the table cannot see a shared box or an unmarked hole - it found 11 and 18
  sharing one 517 m2 box); (2) hole 9's blue/gold split (537 / 491 yd vs card
  537 / 495) and the forward-tee identities reported as yardage inferences at
  n = 1 and put to him, never written as facts - "nothing is guessed into
  course data"; (3) 12 blue carried like 16 blue (a markup point, his tip 4.4 m
  outside the only box) until he answers; (4) the 16 back blue tee carried as
  a point with `source`, a stated 5 m radius (basis: 50 of 52 tips inside the
  feature, worst 4.4 m; not a measured accuracy) and n = 1, never a polygon,
  never in `courseLearning.tees`, anything taken from it inferred and confirmed
  at the end of the hole; (5) `overpass-api.de` not retried after one 504 (his
  10% cap); (6) the detection-check page's outer-only relation read (21 of 30
  fairways have inner rings) reported as a caution, not fixed - Opus's page;
  (7) nothing changed in `docs/course-map/veenker/` or `js/`.
- **Changed:** `docs/handoff/REPORT_1.1.md` (+ PDF), this entry, the Answered
  line in `docs/handoff/FOR_FABLE.md`, Fable's memory. **Report:**
  `docs/handoff/REPORT_1.1.md`.

## 2026-09-15 - Item 2.4: v25 PASSES for the course; the poor-fix warning behind the card accepted
- **Decision:** verdict PASS. At burst end the six lies are above the fold at
  both sizes (360x780: grid 186-326, body bottom 350, 24 px spare; 375x812:
  187-327 vs 382, 55 px), 0.0 px of movement with the previous mark's banner
  up (n = 1 run per size), 0 px label spill, rightmost button 257 / 272 against
  strips 274 / 289. Marks (n = 9 + 1 re-mark + 1 cup) and the round save
  (n = 1) as tapped. Suite 511/511 twice; mutation (v24 `screen-play.js` under
  v25 CSS) 509/511, exactly the two movement tests. v25 may go on the phone on
  his go; the push is Opus's.
- **Made alone:** (1) PASS with the poor-fix warning behind the card - at
  burst end it is 344 px below the fold and surfaces the instant a lie is
  tapped, with RE-MARK at 207-251; `markWarning` has no timer so nothing is
  lost, RE-MARK works from there (undo, re-burst, lie asked again), and a
  banner above the card is what moved the grid 78 px in v24; whether he wants
  it before the lie tap is offered as a preference, not decided; (2) the
  arrow-during-a-burst case (BACK 357 px below the running card; the shot then
  saves on the hole being viewed) not held against v25 - `goToHole` has never
  touched a running capture, a 3 s window, his item 3 by name; (3) the tee
  nudge reasoned from the code (it cannot coexist with a card: `checkTeeNudge`
  returns during a capture, a pending card needs a tee shot, the nudge needs
  none), not driven on a static sim; (4) Opus's live sim round continued on
  holes 2-4 and finished, rather than a fresh round; (5) no code or CSS
  changed, no `BUILD.id` bump; (6) `idleMs` 600 s in the sim page for the
  measurements; (7) one mutation run (the new movement test), not the
  column-pin one - the four strip tests cover that property.
- **Changed:** `docs/handoff/REPORT_2.4.md` (+ PDF), this entry, the Answered
  line in `docs/handoff/FOR_FABLE.md`, Fable's memory. **Report:**
  `docs/handoff/REPORT_2.4.md`.

## 2026-09-15 - build v25: the lie field first, the card above the banners, a one-line label, Settings one per row (Opus)
- **Decision:** his words, "fix the lie card", after Opus's recommendation in
  the chat to move the lie grid to the top of the card and trim the box around
  it (`docs/handoff/REPORT_2.2.md`, Section 7). Made: the lie field first in
  both cards; the card first in the body, above every banner; a one-line label;
  a slimmer box; the card's column pinned; Settings "Show scoring and
  distances" one option per row; build v25.
- **Why these, and not the other levers in Section 7:**
  - The lie buttons stay 66 px tall and 8 px apart. Section 7 also offered
    56 px buttons; the room came from above the grid instead, so the target
    size and the dead zone a wet thumb relies on are unchanged.
  - The club grid stays below the lie. It never sat above the grid, so putting
    it behind a toggle would not have raised the lie.
  - The card above the banners is the only order in which nothing above the
    grid can change at burst end: the banners run on their own clocks.
  - The label keeps what the tap does - "save" while capturing, "finish" once
    saved - shortened to one line at 360 px.
  - Settings one per row rather than shorter labels: TOURNAMENT is the mode's
    name, and one per row changes no text.
  - The strip tests hide scrollbars in their own injected style, not in the
    app: the phone already draws overlay scrollbars; only the desktop runner
    differed.
- **Changed:** `js/ui/screen-play.js`, `css/base.css`, `js/ui/screen-settings.js`,
  `test/run.js`, `js/data/build.js`, `sw.js`, `CLAUDE.md`,
  `.claude/agents/fable.md`, `docs/REVISIONS.md`, `docs/handoff/FOR_FABLE.md`.
  **Report:** `docs/REVISIONS.md`, build v25.

## 2026-09-14 - Item 2.2: v24 FAILS for the course on the lie fold; the lock strip fixed here; zoneOf approved
- **Decision:** verdict FAIL, on one defect only - at burst end the lie grid
  is below `.body`'s bottom edge (360 x 780: row 1 by 39 px, row 2 entirely;
  375 x 812: row 2 by 46 px). The lock, the marks, the round save and the
  `zoneOf` change all pass. v24 stays off the phone.
- **Made alone:** (1) fixed the card growing into the LOCK strip in
  `css/base.css` (`minmax(0, 1fr)` columns, card padding 12 -> 6 px, lie
  labels 16 -> 14 px) - a design-rule violation on the course path with one
  answer, so no BLOCKED for it; (2) three lie columns kept rather than two -
  two would drop the third row 74 px lower on a card already below the fold;
  (3) the fold left to Opus (his screen; what is on it at burst end is a
  course call for Matt through Opus's chat) with two layout-agnostic
  acceptance tests committed RED on purpose; (4) the Settings "Show scoring
  and distances" seg, 32 px under the tab when scrolled level, named for
  Opus and not fixed (same cause, off the course path); (5) no `BUILD.id`
  bump - v24 has never been deployed; (6) `idleMs` raised to 600 s in the sim
  page for the measurements after the 30 s auto-lock fired under scripted
  clicks; (7) the "known intermittent" caveat dropped from `CLAUDE.md` and
  `.claude/agents/fable.md` - diagnosis confirmed (hidden pane, no viewport
  emulation: `window.innerHeight` 0; with an emulation set it reports the
  emulated height, which is why the failure came and went across sessions).
- **Why FAIL and not a fix:** the card and the constant footer do not both
  fit in the 184 px the body has at 360 x 780; something on his course screen
  has to give (grid first in the card, the club grid behind a toggle, smaller
  lie buttons, the boxed field's padding) and that is a design choice, not a
  master-level fix.
- **Checked:** suite 501/501 x3 baseline (pane hidden, `innerHeight` 0);
  mutation `zoneOf` -> `window.innerHeight` fails exactly "the deliberate
  gesture unlocks" (500/501); strip tests 4/4 fail with the fix stashed out at
  both widths; final tree 505/509 x3 with the four RED named. 11 sheet kinds
  + 3 confirm sheets at 375 x 812 and 8 at 360 x 780: 22 px clearance, 0
  under the tab. 1 sim round: 5 shots, cup under LOCK, gaps gate, finish,
  `status completed`, key present after reload.
- **Changed:** `css/base.css`, `test/run.js`, `test/index.html`, `CLAUDE.md`,
  `.claude/agents/fable.md`, `docs/handoff/FOR_FABLE.md` (Answered line),
  this file. **Report:** `docs/handoff/REPORT_2.2.md` (+ PDF).

## 2026-09-14 - Fable's four small changes from 2.3, made (Opus)
- **Decision:** his words, "make the four changes, then run 2.2". The four
  changes `docs/handoff/REPORT_2.3.md` recommends (Sections 4, 7, 8 and 11) are
  in:
  1. **Gap wording** (`tools/track-coverage.py`, `diagnose_gap`). The tool no
     longer prints "the app was not running" from missing heartbeats. Unless a
     `recorder=1` beat came at least every 15 s, it describes the gap: no
     heartbeat, or `recorder=0` at N of M beats; the longest beat spacing on
     `elapsed_rt_ms`; and whether the process died.
  2. **Light Doze** (`DeviceState.snapshot`): `light_doze` from
     `PowerManager.isDeviceLightIdleMode`, read on API 33 and up, `?` below.
  3. **Repeats split** (the tool): the same fix handed over again (identical
     `fix_ms`, `elapsed_rt_ms`, latitude and longitude; in T's store, which
     keeps no elapsed time, identical time, latitude and longitude), apart from
     different fixes that share a time. The Fixes column and the measure are
     unchanged.
  4. **`meta.json` synced** (`Sessions.begin`) before START returns.
- **Why these choices:**
  - A death is read only from what a new process writes. `log_open` with
    `reason=process_start` comes only from `BakeoffApp.onCreate`; a second open
    in the same process is `log_reopen` (`SessionLog.open`). `previous_exit`
    carries Android's exit time. `fixes_this_process` starts again from 0 in a
    new process, so a count still climbing across the gap, with neither record,
    is reported as the same process. All three are already in every log, so no
    app change was needed to tell a late beat from a death.
  - `isDeviceLightIdleMode` is `since="33"` in the SDK's
    `platforms/android-36/data/api-versions.xml`; the apps' minSdk is 30.
- **Checked:**
  - Self-test 22/22: the 14 checks from before, the repeats split, and seven
    gap cases (running; no beats, with the wall clock stepped 20 s; a new
    process; late beats; `recorder=0`; an exit record alone; a `log_open` that
    is not a process start).
  - Mutation, 6 of 6 caught: the same-process test reversed (3 checks fail);
    the old "not running" wording (1); identical rows keyed on time alone (1);
    spacing on the wall clock (1); the exit record ignored (1); any `log_open`
    taken as a new process (1).
  - Re-running the 2026-09-14 round changes only the repeats lines: T's log
    has 10 repeats, all the same fix; its store 4, all the same fix; K 0. The
    golf-tracker export output is identical to the committed file.
  - Unit tests 8/8 in each app; both APKs build.
- **Not checked:** the two app changes have not run on a device. The only
  emulator attached, `emulator-5554`, belongs to another session and was left
  alone. The APKs now differ from the `645355a` build Fable passed by these two
  changes.
- **Changed:** `tools/track-coverage.py`, `DeviceState.kt`, `Sessions.kt`,
  `SessionLog.kt` (comment), `android/bakeoff/README.md`,
  `docs/bakeoff-data/2026-09-14-veenker-walking/README.md` (and its PDF).
  **Report:** this entry.

## 2026-09-14 - 2.3: the round counts as the on-course pass, not as the bar's locked-screen clause; the fair test has thresholds
- **Decision:** the 2026-09-14 round is evidence that both apps run on the
  course (PASS to carry and to play), and is not evidence for the clause in
  his bar, "over a round-length carry with the screen locked and a music app
  in use". A carry counts as that test only when the heartbeats show
  `screen_on=0` at 90% or more of beats and `music=1` at 50% or more, over
  2.0 h or more, walking, unplugged, with golf-tracker closed. Two carries:
  both apps together, then GPS Transistor alone.
- **Why:** the screen was off at 76 of 1,445 beats (5.3%) and music at 0, so
  the clause is his words and was not met. golf-tracker's screen-on and its
  own location request kept the receiver hot for both apps. GPS Custom holds
  a partial wake lock for its whole session, which keeps the CPU on for every
  app on the phone, and the transistorsoft 4.5.1 binary acquires no wake lock
  of its own (`android/os/PowerManager` referenced only by its
  `DeviceSettings` class, 642 classes searched), so T has never run on its
  own power path. The thresholds are mine; he can move them.
- **Changed:** nothing in code. **Report:** `docs/handoff/REPORT_2.3.md`,
  Sections 5 and 9. **Commit:** the commit carrying this entry.

## 2026-09-14 - 2.3: no code changed in the review run
- **Decision:** the four small changes the review found are recommended to
  Opus, not made by Fable: `tools/track-coverage.py` `diagnose_gap` must not
  print "the app was not running" from heartbeat absence alone and should
  report beat spacing in `elapsed_rt_ms`; `DeviceState.snapshot` should add
  light Doze (`isDeviceLightIdleMode`, API 33+); the tool should count SDK
  re-emissions (same `fix_ms`, `elapsed_rt_ms`, lat, lon) apart from repeated
  times; `Sessions.begin` should fsync `meta.json`.
- **Why:** none bears on the verdict (the heartbeat can only run late when
  the CPU sleeps, which K's wake lock prevents in every run so far; the round
  had 0 stalls, max beat spacing 6,587 ms); three of the four are Opus's
  files; his words on usage, 2026-09-14: "Fable is restricted 10% weekly usage
  on this project so plan accordingly". The first two are wanted before a
  T-alone carry, where a sleeping CPU is possible.
- **Changed:** nothing. **Report:** `docs/handoff/REPORT_2.3.md`, Sections 4,
  7, 8, 11.

## 2026-09-14 - 2.3: `allowIdenticalLocations` stays `true`
- **Decision:** T keeps `allowIdenticalLocations = true`.
- **Why:** read from the 4.5.1 AAR with `javap`: the comparison that exists,
  `TSLocationManager.e(Location)`, calls a fix identical when time, latitude
  and longitude match, OR when latitude, longitude, speed and bearing match
  regardless of time; and nothing in the binary calls it or reads
  `GeoState.allowIdenticalLocations` outside the Kotlin config wrapper, so
  the flag is inert in this version. If a later SDK wires it back, the second
  branch drops a new fix at the same spot: 149 of 7,236 consecutive fixes in
  K's raw stream (2.06%) matched on all four, and those are stands. A
  re-emission is a row the tool can count; a dropped stand is a hole. The
  round's repeats (10 log rows at 4 fix times) are all SDK re-emissions on its
  own state events, byte-identical to K's fix at that time.
- **Changed:** nothing. **Report:** `docs/handoff/REPORT_2.3.md`, Sections 11
  and 12.

## 2026-09-14 - the test apps renamed before Fable's 2.3, with a version bump (Opus)
- **Decision:** Bake-off K is now GPS Custom and Bake-off T is GPS Transistor,
  his pick: "GPS Custom / GPS Transistor". Only the names changed:
  - the app labels
  - the notification titles
  - `bakeoff.ps1`'s messages and its Samsung-list check

  The application ids (`.k`, `.t`) and the K/T tags in files and folders stay.
  The build went from `bakeoff-1` (versionCode 1) to `bakeoff-2` (versionCode 2).
  The rename was committed before 2.3 was spawned.
- **Why:**
  - Fable reviews at a commit hash. Renaming after the review would put a build
    on the phone that Fable had not reviewed.
  - The application ids stay, so the reinstall updates the apps in place. After
    it, `setup` reads every grant back.
  - The version bump makes `meta.json`'s `app_version` (`BuildConfig.VERSION_NAME`,
    `DeviceState.kt:49`) tell a session recorded by the renamed build from one
    recorded before it.
  - `samsung` found the apps on Samsung's lists by the literal prefix
    "Bake-off". It now matches the names from one table and sets a flag, so a
    later rename cannot quietly turn the check off. That path is untested on a
    Samsung: on the emulator the task stops at "Not a Samsung phone".
- **Changed:** `android/bakeoff/app/build.gradle.kts`, `RecorderService.kt`,
  `Recorder.kt`, `android/bakeoff/bakeoff.ps1`, `android/bakeoff/README.md`,
  `docs/bakeoff-field-card.md`, `docs/bakeoff-test-week.md` (and their PDFs).
  **Report:** this entry.

## 2026-09-13 - bake-off on the S26: Unrestricted battery, not Samsung's never-sleeping list (Opus)
- **Decision:** both apps stay Unrestricted. That is Android's battery
  optimization exemption, which `setup` sets and each app's checklist reads.
  `bakeoff.ps1 samsung` changes nothing. It only checks that neither app is on
  Samsung's Sleeping or Deep sleeping lists.
- **Why:** measured on his S26 (SM-S942U, Android 16, One UI 8.5) on
  2026-09-13.
  - With both apps Unrestricted, Samsung's "Never auto sleeping apps" picker
    listed every other app, from Ad It Up to Weather, but not the two Bake-off
    apps.
  - With Bake-off K switched to Optimized, the picker offered it, and it was
    added ("Newly added").
  - Switched back to Unrestricted, K was removed from that list by Samsung.

  So an app gets one setting or the other, not both. Unrestricted is the
  exemption the apps can read. Android also lists it as a case where a
  foreground service may start from the background, which K's restart after a
  kill needs. That Samsung's app sleeping treats Unrestricted as covering
  never-sleeping is inferred from the two settings excluding each other; it is
  not documented. The carry is what tests it. Afterwards, neither app was on
  the Never auto sleeping, Sleeping or Deep sleeping lists, and both were
  still on the Doze whitelist.
- **Changed:** `android/bakeoff/bakeoff.ps1` (the `samsung` task),
  `android/bakeoff/README.md`. **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: Claude drives the phone from the desktop; a store export is scored only against sessions it holds (Opus)
- **Decision:** `bakeoff.ps1` does every phone step over adb:
  - install both apps, grant permissions and read every grant back
  - put both on the Doze whitelist and allow `RUN_ANY_IN_BACKGROUND`
  - read each app's own checklist through uiautomator
  - add both to Samsung's never-sleeping list by driving Settings
  - START, STOP and EXPORT, then pull and score

  A screen step whose label is not on screen stops the task with a
  screenshot, and nothing further is tapped. `track-coverage.py` scores a T
  session against the store export holding the most of its rows. When no
  export has any, it reports that and does not score one.
- **Why:** his words, 2026-09-13: "we have been through this numerous times
  Code you are going to do all the work. I plug in my phone, enable USB
  debugging and turn off the blocker get that all ready". The script's
  emulator pass then pulled an old session beside a store export made after a
  reinstall. The old rule (always the newest export) scored that session a
  false FAIL.
- **Changed:** `android/bakeoff/bakeoff.ps1`, `tools/track-coverage.py`,
  `android/bakeoff/README.md`. **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: two apps, not one app with two recorders (Opus)
- **Decision:** the bake-off is one Gradle project with two product flavors,
  `handwritten` (Bake-off K, `...golfbakeoff.k`) and `transistor` (Bake-off T,
  `...golfbakeoff.t`), installed side by side.
- **Why:** each recorder needs its own process, foreground service,
  notification and battery state. In one app, whichever recorder held a
  foreground service would keep the other one's process alive, and a
  survival test would measure nothing. Carried together, both face the same
  phone, pocket and sky on the same round.
- **Changed:** `android/bakeoff/app/build.gradle.kts`.
  **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: K takes fused location and holds a wake lock; T gets no extra help (Opus)
- **Decision:** K uses the fused provider (`PRIORITY_HIGH_ACCURACY`, 1 s, no
  distance filter) inside a location foreground service holding a partial wake
  lock. T gets no wake lock or other help from our code.
- **Why:** fused is what Chrome handed the web app, and the web app's accuracy
  (median 3.0-3.2 m, FT3-FT6) is the field-validated number; both apps pin
  play-services-location 21.3.0, the version transistorsoft 4.5.1 pins. The
  comparison is each recorder at its best: K is ours to harden, T is the SDK as
  shipped plus the four defaults its own docs say are wrong for golf.
- **Changed:** `app/src/handwritten/.../RecorderService.kt`.
  **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: T runs with four defaults changed and nothing else (Opus)
- **Decision:** `filter.policy = PassThrough`, `useKalman = false`,
  `trackingAccuracyThreshold = 0`; `disableStopDetection = true` plus
  `changePace(true)`; `allowIdenticalLocations = true`; `distanceFilter = 0`
  with `locationUpdateInterval = 1000`.
- **Why:** read in the 4.5.1 source, not only the web docs. `LocationFilter.evaluate`
  keeps an accepted fix's coordinates but rejects whole fixes: worse than the
  100 m accuracy gate, or (under `Conservative`) an implied-speed or outlier
  fix. Kalman smooths the distance between fixes, not positions. The web docs
  call `Conservative` the default; the source's table says `Adjust`. The
  config source also says "Location services will never turn OFF" only with
  `disableStopDetection` (otherwise GPS stops when he stands still: the shot),
  and "By default, the Android plugin will ignore a received location when it
  is identical to the previous location". The docs' own example of an
  identical location is one fix delivered twice; whether a new fix at the same
  coordinates also counts is not stated and the check is not in the published
  sources, so `true` is the setting that cannot drop a stand. A dropped fix is
  a hole in the track, and dwell is the whole shot signal (62.9 s median at
  real shots, n = 444 stops, `docs/REVISIONS.md` v22). The cost, seen on the
  emulator: after a `kill -9`, T keeps repeats of fix times it already had
  (run 2: 88 in the log, 93 in its store; run 3: 22 and 21). They are 0 s
  intervals, so coverage is unchanged; the tool counts and prints them.
  `changePace(true)` on restore is now called only if the SDK did not come
  back moving; run 3 showed the repeats do not come from that call.
- **Changed:** `app/src/transistor/.../Recorder.kt`.
  **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: an active session resumes after a process restart (Opus)
- **Decision:** if the process comes back while a session is active and the
  recorder is not running, both apps restart the recorder and log
  `resume_on_process_start`.
- **Why:** the golfer is the source of truth. He pressed START and has not
  pressed STOP, so he is recording. The gap stays in the file, unfilled, and
  `previous_exit` records Android's reason for the death.
- **Changed:** both `Recorder.kt`. **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: the measure is Section 9's, on fix time, samples counted, cut rows skipped (Opus)
- **Decision:** coverage is computed on the fix's own time (the web app's
  `ts`), over every fix the recorder delivered (T's SDK samples included and
  marked; `--exclude-samples` rescores without them). A row without exactly
  the header's columns and a whole `fix_ms` is counted as skipped, never read.
  The PC tool gives the verdict; the phone's number is a convenience.
- **Why:** the definition had to be the handoff's, not a recalled one.
  `tools/track-coverage.py` reproduces all 6 Section 9 rows from the exports.
  The phone and the PC implement it separately, and both are held to one
  hand-worked fixture. A process killed mid-row must not become a wild
  timestamp.
- **Changed:** `Coverage.kt`, `tools/track-coverage.py`, the fixture.
  **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: T gets the SDK's headless task and ready() on every resume; T is also scored from its own store (Opus)
- **Decision:** add `com.postmaster87.golfbakeoff.t.BackgroundGeolocationHeadlessTask`
  (an EventBus `@Subscribe` on `HeadlessEvent`), call `ready()` in every
  `onResume`, route both delivery paths through one `recordSdkLocation`, and
  log `sdk_delivery_route` whenever the route changes. `tools/track-coverage.py`
  scores T twice: the app log, and the SDK's exported SQLite store over the
  same START-to-STOP window.
- **Why:** the emulator smoke test (run 1) found it. After `kill -9`, T's own
  database kept filling at 1 Hz (392 to 412 rows in 20 s), while the app log
  got nothing for 357 s. logcat showed 530 "Attempted to post headless event
  location but there are no listeners". In the 4.5.1 source,
  `EventManager.deliver` routes events only to the headless task while no
  screen is alive, and `isDeliverable` holds foreground events until `ready()`
  is called again after leaving headless. Those are rules for any app built on
  T, not recorder failures. Scoring only our listener would have failed T for
  our own integration gap.
- **Changed:** `app/src/transistor/.../Recorder.kt`,
  `app/src/transistor/.../t/BackgroundGeolocationHeadlessTask.kt`,
  `app/build.gradle.kts` (EventBus compileOnly), `MainActivity.kt`,
  `tools/track-coverage.py`. **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off: a session is measured START to STOP, so a recorder that dies is a gap (Opus)
- **Decision:** for a bake-off session, a first fix more than 20 s after START,
  or a last fix more than 20 s before STOP (or before the last event, if there
  is no STOP), counts as a gap: an "edge gap". The Section 9 measure between
  fixes is unchanged, and web exports are still scored first fix to last.
- **Why:** run 1 T's log stopped at the kill, and the first-to-last measure
  scored it a clean 3.0 min session. A recorder that dies and never comes back
  leaves no fixes to form a gap, which is exactly the failure the bake-off
  exists to catch. The gap rule is still "no fix for over 20 s"; only the
  interval's ends moved to START and STOP.
- **Changed:** `tools/track-coverage.py` (self-test 14/14, with five edge
  checks). **Report:** `android/bakeoff/README.md`.

## 2026-09-13 - bake-off toolchain: compileSdk 36, AGP 8.13.2, Kotlin 2.3.21, Gradle 8.13 (Opus)
- **Decision:** a newer toolchain than his other native apps (AGP 8.6.1,
  Kotlin 2.0.20, Gradle 8.9, compileSdk 35), pinned, never "+".
- **Why:** transistorsoft's Kotlin setup page requires compileSdk 36. AGP 8.10
  is the first release with API 36 support (8.9 stops at 35), AGP 8.13 needs
  Gradle 8.13, and Kotlin 2.3.20-2.3.21 is the line whose compatibility table
  covers AGP 8.13. Gradle's download is checked against its published SHA-256.
  His other apps are untouched.
- **Changed:** `android/bakeoff/build.gradle.kts`, `app/build.gradle.kts`,
  `gradle/wrapper/gradle-wrapper.properties`.

## 2026-09-11 - v23: the lie placeholder is not a schema revision (not xhigh)
- **Decision:** a GPS shot saved before its lie, stored `lie: 'fairway',
  lieInferred: true`, is not a data model / storage schema change and does
  not need his "xhigh". Item 2.1 proceeds at high.
- **Why:** the field and the value both already exist (`addTrackShot` has
  written the pair since agenda item 2); `newShot` and `migrate()` are
  untouched; export/import round-trips it as it already does; the SG engine
  never reads `lieInferred`; and across the 8 exports in
  `docs/roundDownloads/` (763 shots) not one shot carries `lieInferred`, so
  no logged round changes meaning under `lieUnanswered`. Caveat on record:
  "not asked yet" is derived from the pair (gps, lieInferred), not stored -
  the first other path to write `lieInferred` on a GPS shot makes this a
  schema item at xhigh.
- **Changed:** nothing. **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-11 - v23: the play screen is bounded to the viewport
- **Decision:** `#app { min-height: 100dvh }` became `height: 100dvh`, and
  the CANCEL SHOT / LIE LATER row under the saved-shot lie panel is pinned
  to one line (`.cap-row`). A global layout rule changed by Fable, under a
  testing verdict, in Opus's territory.
- **Why:** measured on the sim at 375x812 with club tracking on, the lie
  grid moved +60 px (2 to 3 shot rows) and +62 px (3 to 4) at the instant
  the burst ended - since v23 the new "Lie?" row appears then, and the page
  grew past the viewport and pushed the footer down, so SAND landed on TEE,
  RECOVERY on FAIRWAY, GREEN on ROUGH. That is a saved wrong lie on the
  course. Bounding the app is what `.body { overflow-y: auto }` on every
  screen already assumed; the row pin removed a further 22 px from
  "CANCEL SHOT" wrapping next to the lock tab's strip. After: 1 px at
  375x812 and 360x780; Settings, the Round card and the summary still
  scroll inside `.body`.
- **Changed:** `css/base.css`. **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-11 - v23: a shot saved for its lie clears the previous mark's UNDO banner
- **Decision:** `saveLieLater` calls `clearLastMark()`; a test in the
  mark-flow group holds it (proven to fail without the line).
- **Why:** the previous mark's "marked - UNDO" banner lives 20 s, and its
  UNDO takes the newest thing on the hole - which from burst end is the
  just-saved shot. On the sim "Shot 4 marked (Fairway). UNDO" removed shot
  5. The panel is that shot's own statement and CANCEL SHOT is its undo.
- **Changed:** `js/ui/screen-play.js`, `test/run.js`.
  **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-11 - v23: the pending-lie panel does not come back after a reload
- **Decision:** left as built. After a reload the shot reads "Lie?" in the
  list, MARK SHOT n+1 is offered, and the gaps gate asks before the round is
  saved; the panel itself is in-memory only.
- **Why:** a panel that reappeared after a reload would come back on
  whatever hole he had walked on from, in front of the shot he is about to
  mark; the list, the tap-to-edit and the gate already cover the data.
- **Changed:** nothing. **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-10 - Setup: what is Fable's in this repo, and what Opus keeps
- **Decision:** Fable's exclusive territory is the four things his global
  rule already puts at xhigh - the data model and its rails
  (`js/data/schema.js`, `store.js`, `trackstore.js`, `persistence.js`, the
  export format, every migration of logged rounds), the GPS precision
  pipeline (`js/gps/gps.js`, `js/util/geo.js`), and the strokes-gained
  engine (`js/analysis/*`) - plus testing verdicts on risky builds and
  master-level fixes. The shot-detection ranking
  (`js/round/track-analysis.js`) and the hole windows in `js/round/round.js`
  stay Opus's to build, with Fable testing before a field test. The push
  (`git push origin main`, which is the deploy) and the `REVISION` bump
  stay Matt's word, run by Opus.
- **Why:** he asked for "just like we did for Rip" - there the split was
  the brain and the vault, the two things where a wrong decision loses or
  leaks his data. Here those are the round records, the GPS numbers that
  feed them, and the strokes-gained math the app exists to get right; his
  own Section 4 rule already names exactly those four. Track-analysis is
  the live research problem and changes often, so it stays with the
  day-to-day engineer, but it never reaches the course untested.
- **Changed:** `.claude/agents/fable.md`, `.claude/agents/fable-xhigh.md`,
  `docs/handoff/FOR_FABLE.md`, `docs/handoff/FOR_FABLE_LOG.md`,
  `docs/DECISIONS_LOG.md`, `CLAUDE.md` (new, the Opus-side contract).
- **Report:** none - this was the setup session in Matt's own chat with
  Fable. **Commit:** `17dd43f`.
