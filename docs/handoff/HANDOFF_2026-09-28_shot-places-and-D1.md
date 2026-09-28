# HANDOFF 2026-09-28 - shot places and D1, builds v31 to v34, to the session "Latest build setup"

From the session "Yesterday's round review" (Fable, golf-tracker main chat).
Written for the session that takes it over. Every claim carries its source.

## 0. His words that make this a handoff, verbatim

- 2026-09-28: *"okay you will not deploy this on my phone. When you are done
  hand it off to the other repo and it will fold this into the map feature
  build and deploy it."*
- 2026-09-28, later: *"give it to the Latest Build Setup session when you are
  done. Hurry it up if you can"*
- 2026-09-28, on who builds the map feature (Hole Overview): *"The correct
  session that is building that feature is the last one that messaged you the
  other was a mistake and it is done"*. That session is "Hole Overview map
  integration", id `local_3ffdc911-37ed-45c6-8c8d-3d2eef7a236b`, same repo.

This session did not push and did not install. The deploy is yours, on his
word in your chat.

## 1. Where everything stands

| Thing | State | Source |
|---|---|---|
| The phone (S26, serial `RFGL4275NVH`) | native Golf Tracker, build v30, rev 6, installed 2026-09-27 08:44 | `adb shell dumpsys package com.postmaster87.golftracker`, read 2026-09-28 |
| `origin/main` | `35b29bd`, build v28, the last web deploy | `git log origin/main -1` |
| Local `main` | the commit that carries this file, on top of `a7e0b58`; build v34; clean; every commit after `d18ec74` (build v30, the phone's build) is this session's, `990ad0a` onward: 11 at `860df05` [measured, `git rev-list --count d18ec74..860df05`], plus the one that corrected this line | `git log -1`, `git status` |
| `REVISION` | 6, untouched by this session | `js/data/revision.js` |
| Suite | 604/604 at 360x728 | Fable's run at `a7e0b58`, n = 1 |

## 2. What was built, in order

| Build | Commit | What | Spec | Report | Fable's verdict |
|---|---|---|---|---|---|
| v31 | `7ad929c` | End-of-hole shots: shot 1 is the tee at the scorecard yardage; every stop on the list; no cup from the track; BALL NOT HERE and ADD A SHOT; UNDO that stays | `docs/SPEC_shot-places.md` Sections 3 to 6 | `docs/handoff/REPORT_4.1.md` | built to spec; the preselection scored 20/32 against 23/32 |
| v32 | `77f89df` | The preselection revised: the tee area, the green's edge, shared ground | `docs/SPEC_shot-places.md` Section 11 | `docs/handoff/REPORT_4.2.md` | PASS; 26/32 on shots 2+ at Veenker, in-sample (n = 32) |
| v33 | `ccae4e3` | D1 Part A: where the hole is - cup, pin sheet, ball on the green, the map's green centre; `hole.pinSheet`; the scorecard tee in the engine; sources on the screens | `docs/SPEC_hole-position.md` Sections 3 to 8 | `docs/handoff/REPORT_5.1.md` | PASS with three corrections |
| v34 | `a7e0b58` | The three corrections (C3, C4, C8) and D1 Part B, the PIN SHEET sheet | `docs/SPEC_hole-position.md` Sections 9 and 12 | `docs/handoff/REPORT_5.2.md` | PASS |

Every decision and its reason: `docs/DECISIONS_LOG.md`, the six entries dated
2026-09-28.

## 3. What he asked for, and where it is

| His words (2026-09-28) | Built as | Build |
|---|---|---|
| "needs to default to the scorecard" | Shot 1 is the map's tee box at the card yardage; the engine reads the card yardage | v31, v33 |
| "the proposed tee shots on those holes were stupid" | The track no longer proposes a tee; a stop within 40 m of the tee is never preselected | v31, v32 |
| "could not find the next shot either" | OTHER PLACES ON THIS HOLE: every stop, tappable | v31 |
| "it is possible to hit something and the ball go backwards" | Closer-to-the-hole orders the preselection only; nothing is removed, nothing blocks SAVE | v31 |
| "here I hit the mark tee shot and could not undo it" | UNDO stays until the next mark, save or hole change, and is inside the green sheet | v31 |
| "it was left in the cart while I was hitting" | BALL NOT HERE: he types the distance and the lie | v31 |
| "map center with the option for me to correct it manually by entering tournament pin sheet numbers" | The engine reads the map's green centre; the PIN SHEET sheet places the pin | v33, v34 |

## 4. Files this work touched, against `7d35028`'s parent line

`js/round/hole-position.js` (new), `js/round/round.js`,
`js/round/track-analysis.js`, `js/analysis/strokes-gained.js`,
`js/analysis/trends.js`, `js/data/schema.js` (one optional key,
`hole.pinSheet`), `js/ui/screen-play.js`, `js/ui/screen-summary.js`,
`css/base.css`, `sw.js`, `js/data/build.js`, `test/run.js`, `test/index.html`,
`tools/detection-scoring.html`, and the docs named above.

Not touched by this session: `android/`, the recorder, the GPS pipeline,
`js/round/course-geometry.js`, `js/util/polygon.js`, `js/data/geometry/`,
`tools/course-geometry/`, the benchmark tables, `js/data/store.js`,
`trackstore.js`, `persistence.js`, `schemaVersion`, `migrate()`, `REVISION`,
any stored round.

## 5. Walls that bind the deploy (repo `CLAUDE.md` Section 3)

1. **The install and any push are on his word, in your chat.** Nothing here
   is his word to you.
2. **Nobody says a build is live or installed without reading it back**: for
   the web, a hash-verified fetch of the deployed `js/data/build.js`; for the
   phone, `adb shell dumpsys package com.postmaster87.golftracker` and the
   app's Settings, Build line.
3. **`REVISION` is his call**, bumped when a build is about to be played,
   never on a code change (`docs/REVISIONS.md`, "How to bump it"). `BUILD.id`
   and the `gt-shell-<id>` cache move together; the suite enforces it.
4. **Commits are `rusty9645@gmail.com`**, staged by name, never `git add -A`.
5. **One writer in the working tree at a time.** The Hole Overview session is
   waiting for a clean tree before its Opus writes.
6. **Phone settings that change his day-to-day use need their own prompt
   first** (global rules, Section 12 item 17).

How the native app is built and installed, already written and used:
`docs/handoff/REPORT_3.1.md` Section 10 (the Gradle build copies the web build
into the APK; `adb install -r` keeps the app's storage). The serial must be
the phone's, never an emulator's.

## 6. What is owed

| # | Owed | By whom |
|---|---|---|
| 1 | The install of the build that carries v31 to v34, on his word | you |
| 2 | His phone check after it: Settings, Build line; ENTER SCORE on one hole (tee row reads the card yardage, OTHER PLACES lists the stops); Round menu, Pin sheet | him |
| 3 | His answer on the pin sheet's side numbers. Built as paces from the nearer side EDGE. If his sheets read from the middle it is one constant: the sheet writes `sideFrom`, and `pinFromSheet` already reads both. He has been told twice and has not answered. | him |
| 4 | The out-of-sample test of the preselection: his next round. The 26/32 is measured on the shots that showed the faults. | him, then whoever reviews the round |
| 5 | `docs/REVISIONS.md` says rev 6 is "not yet played". It was: round `r_b440472a`, 2026-09-27, is stamped revision 6, build v30. The `shipped` date and the next bump are his call. | you, on his word |
| 6 | The map's bunker and fairway hole labels: 17 of 47 wrong (`tools/course-geometry/build_veenker.py`, its centroid). Found by the Hole Overview session, verified here. Greens 18 of 18 right; shot places and D1 do not read the labels; Hole Overview's bunker numbers do. | the Hole Overview session, on his word |
| 7 | The MARK CUP button on the next-hole prompt, the control behind hole 12 on 2026-09-27 (`docs/handoff/REPORT_4.1.md` Section 3). The UNDO now catches it; the button is unchanged. | open |
| 8 | Known and not built: see Section 7 | open |

## 7. Known, and not built

- A stop on the edge of a green can take a shot's slot in the preselection
  (2 wrong of 4, n = 4; `REPORT_4.2.md` Section 5).
- A course with no map: the preselection scores 2/9 against the old picker's
  6/9 at Radcliffe (n = 9).
- The live HUD still reads the green's centre when a pin sheet is entered.
- `firstPuttM` and the green sheet's GPS first putt still read `hole.cup` of
  any method.
- `rebuildCourseLearning` learns a cup of any method, and a cup that is not
  on its green.
- A tee he marked himself reads a straight line to the hole, short of the
  card on a dogleg.
- A drive from a map tee has no length; whether a labelled estimate is wanted
  is his call.
- An end-of-hole row still prints a distance for a track stop farther than
  the card plus 100 yd, which the engine refuses after SAVE HOLE
  (`REPORT_5.2.md` Section 6).
- The shot list does not say when a shot's distance was refused.
- Edit mode hides every UNDO banner except the pin sheet's.
- The pin sheet's number fields have not been typed into on the phone.
- The 2026-09-27 round on the phone is as he logged it: holes 12, 15, 16, 17
  and 4 to 9 incomplete or empty. His word: "I am not worried about yesterdays
  round."

## 8. Where the evidence is

| What | Where |
|---|---|
| The 2026-09-27 round as pulled from the phone | `docs/roundDownloads/native-0927/` (gitignored): `pull.tar`, `app_webview.tar`, `localStorage-20260928.json`, `files/rounds/` |
| His comments on that round, from the PDF's fields | `docs/Round_2026-09-27_shot-distances_comments.pdf` (committed) |
| The recorder on that round | 14,823 fixes, 250.5 min, 0 gaps over 20 s, median accuracy 3.2 m, battery 72 to 45 percent (n = 1); `tools/track-coverage.py` on the round folder |
| The preselection scoring | `tools/detection-scoring.html` |
| Strokes gained before and after, every Veenker round in the phone's store | `docs/handoff/REPORT_5.1.md` Section 4, `REPORT_5.2.md` |

## 9. Cost, this session

| Run | Model, effort | Time | Sub-agent tokens |
|---|---|---|---|
| 4.1, v31 | Opus, high | 31 min | 455k |
| 4.2, v32 | Opus, high | 12 min | 194k |
| 5.1, v33 | Opus, xhigh | 34 min | 486k |
| 5.2, v34 | Opus, xhigh | 28 min | 426k |

n = 1 each. Fable's meter is account-wide and other sessions were live:
Weekly Fable read 82 percent at the first read of the session and 89 percent
at the last read before the 2026-09-28 17:00 Central reset; after the reset, at the end of this session's work, it read 2 percent.
