# Bake-off field data: Veenker, walking round, 2026-09-14

His words: *"put all this data in a spot for Fable to pick it up in a new chat
under your guidance. Commit and push it once processed"*.

On the push, he was told that pushing `main` would put golf-tracker v24 on his
phone before Fable's test, and he picked **"Push to a branch (Recommended)"**.
This folder is on branch `bakeoff-data-2026-09-14`. `main` is not pushed, and
his phone stays on golf-tracker v23.

## What is here

| File | What it is |
|---|---|
| `golf-bakeoff/K/20260914-160716-K/` | The Bake-off K session: `fixes.csv`, `events.csv`, `meta.json`, `summary.txt` |
| `golf-bakeoff/T/20260914-160724-T/` | The Bake-off T session: same four files |
| `golf-bakeoff/T/sdk-store-20260914-180811.json` | T's own SQLite store, exported at 18:08:11 |
| `golf-tracker-20260914-1807.json` | golf-tracker's export from the same phone at 18:07. It is the app's whole store; today's round is `r_18b4b0bb` |
| `score-bakeoff.txt` | `tools/track-coverage.py` run on `golf-bakeoff/` |
| `score-golf-tracker-export.txt` | `tools/track-coverage.py` run on the golf-tracker export (every track in it) |
| `web-gaps-vs-native.txt` | Output of `compare-web-gaps.py` (next row) |
| `compare-web-gaps.py` | Lists each golf-tracker gap on today's round, with the K and T fixes and phone events in the same window |
| `scorecard-2026-09-14.jpg` | His paper scorecard, sent in chat on 2026-09-14. Holes 10-18: 5, 3, 5, 3, 5, 4, 4, 5, 5 = 39 (par 36). Strokes only; no putts or penalties are written on it |

**Provenance.**

- **Phone:** his Galaxy S26 (SM-S942U, Android 16, `ro.build.version.oneui=80500`).
- **Apps:** built from commit `44531f3`, installed by `bakeoff.ps1 setup` on
  2026-09-13. App code has not changed since.
- **The round:** he started both apps by hand at 16:07, stopped and exported
  both by hand at 18:07-18:08 (`docs/bakeoff-field-card.md`), and played it
  in golf-tracker v23 on the same phone.
- **The copy:** the files were copied byte for byte from the phone's
  `Download` folder with `adb pull`, on his "Yes, copy them".
- **One oddity:** K's exported files are timestamped 20:03 on the phone, but
  their contents end at K's STOP (18:07:54). Asked whether he exported K again
  around then, he answered "3 but 1 probably based off that time stamp" (3 was
  "Don't remember", 1 was "Yes"). A second export is likely; it is not
  confirmed.
- **Git:** the golf-tracker export is force-added by name, because
  `.gitignore` still carries the old `golf-tracker-*.json` guard. His words
  above are the say-so to commit it.

## Results, measured: n = 1 round, 1 phone, 2 hours

| Recorder | Window | Fixes | Covered | Gaps > 20 s | Longest gap | Median accuracy | Bar |
|---|---|---|---|---|---|---|---|
| Bake-off K | START 16:07:16 → STOP 18:07:54 (120.6 min) | 7,237 | 120.6 min (100.0%) | 0 | 2 s | 3.1 m | **PASS** |
| Bake-off T, app log | START 16:07:24 → STOP 18:08:09 (120.8 min) | 7,256 | 120.7 min (100.0%) | 0 | 2 s | 3.1 m | **PASS** |
| Bake-off T, SDK store | same window | 7,249 | 120.7 min (100.0%) | 0 | 2 s | 3.1 m | **PASS** |
| golf-tracker (web app in Chrome, not a contender) | its track, 16:08:04 → 18:07:29 (119.4 min) | 8,579 | 106.4 min (89.1%) | 5 | 384 s | 3.0 m | - |

The bar is his pick: "99% coverage, no gap > 20 s", with START and STOP
counting as the ends of a bake-off session (see `android/bakeoff/README.md`).
golf-tracker is scored first fix to last, as in the handoff's Section 9 table.

### golf-tracker's five gaps, against the native recorders

| golf-tracker gap | Length | K fixes inside | T fixes inside | Phone events within 60 s (K's log) |
|---|---|---|---|---|
| 16:58:27 → 17:02:23 | 236 s | 235 | 235 | none |
| 17:09:51 → 17:10:12 | 21 s | 21 | 21 | none |
| 17:21:18 → 17:22:35 | 77 s | 76 | 76 | none |
| 17:41:17 → 17:47:41 | 384 s | 383 | 383 | screen_off 17:41:18, screen_on 17:47:34 |
| 17:49:31 → 17:50:35 | 64 s | 64 | 64 | none |

Both native recorders kept one fix a second through every gap golf-tracker had.
The longest gap lines up with the screen being off, from 17:41:18 to 17:47:34.
The other four have no screen event near them, so these logs do not show what
stopped golf-tracker's fixes.

### Conditions, from the heartbeats (every 5 s)

- **Screen:** on at 1,369 of K's 1,445 beats (95%). T's log shows 1,371 of
  1,447.
- **Doze, battery saver, charging, music:** music was playing at 0 beats.
  Doze, battery saver and charging were all off at every beat.
- **Standby, heat, battery setting:** standby bucket 5, thermal status 0, and
  Unrestricted, at every beat.
- **Recorder not running:** 1 beat in each app. Neither log has a gap in its
  fixes.
- **Phone battery:** 90% → 78% over 2.0 h. That is the whole phone (both
  Bake-off apps, golf-tracker, and anything else), not one app's share.
- **T's repeated fix times:** 10 in its log and 4 in its store, with no kill
  this time. K had 0.
- **K's `availability` event:** `available=false`, then `true`, both at START
  (16:07:16).

### What this round did and did not test

It tested 2 hours of a real walking round, with both recorders running beside
golf-tracker on the same phone: no gaps in either.

It did not test:

- **The locked-screen condition of the bar.** The screen was on 95% of the
  time; the only screen-off stretch was 6 minutes.
- **Music.** None was playing.
- **A process kill, or Samsung app sleeping.**

It is also **one round**.

## His answers, 2026-09-14 (the next chat)

| Question | His answer, verbatim |
|---|---|
| Marking | "I marked the first few holes and then quit marking to test the tracker on all apps. I think I marked the cup on every hole and the scorecard I provided is correct" |
| The phone during play | "pocket and push cart - always near the ball. This is the best data yet" |
| Did a test app's notification ever disappear? | "3 but did not mess with anything and they were still there at the end so leaning toward 1 as the answer" (3 was "Didn't check", 1 was "No, both stayed") |
| Problems | Picked "Nothing went wrong" |
| Penalties | Picked "No penalties" |
| Hole 11 | Picked "Only 1 putt", which read: "Tee shot, chip from the rough, one putt. The second putt record is the extra one." |
| Hole 12 | Picked "Ball on the green", which read: "It marked where the ball lay for putt 1 and got saved as a full shot. Tee, second shot, chip, 2 putts." |

## His scorecard against golf-tracker's records

Round `r_18b4b0bb`. golf-tracker counts a hole's strokes as its shot records
plus penalty strokes (`holeStrokes`, `js/round/round.js:580-584`), and a putt is
a shot record with lie `green`. The export file is unchanged: the corrections
below are his answers, written down here, not edits to the data.

Measured: every one of the 9 holes has a cup mark (burst, quality good,
accuracy 1.8-2.27 m). No hole has a penalty.

| Hole | Par | Card | Records | Putts | Full shots | Marked by hand | Tee from track | Why the records differ |
|---|---|---|---|---|---|---|---|---|
| 10 | 5 | 5 | 5 | 2 | 3 | 3 | - | they match |
| 11 | 3 | 3 | 4 | 1 (2 entered) | 2 | 2 | - | his answer: one putt |
| 12 | 4 | 5 | 6 | 2 | 3 | 3 | - | his answer: the 4th mark was putt 1's ball |
| 13 | 3 | 3 | 2 | 2 | 1 | 0 | - | 1 full shot not marked |
| 14 | 4 | 5 | 2 | 2 | 3 | 0 | - | 3 full shots not marked |
| 15 | 4 | 4 | 2 | 2 | 2 | 0 | - | 2 full shots not marked |
| 16 | 5 | 4 | 2 | 1 | 3 | 0 | 1 | 2 full shots not marked |
| 17 | 3 | 5 | 3 | 2 | 3 | 0 | 1 | 2 full shots not marked |
| 18 | 5 | 5 | 4 | 2 | 3 | 2 | - | 1 full shot not marked |
| **Total** | 36 | **39** | **30** | **16** | **23** | **10** | **2** | |

- **Putts** are the counts he entered in golf-tracker, with hole 11 corrected
  by his answer. [measured, as entered]
- **Full shots** are the card minus putts, so they rest on those entries.
  [inferred]
- **Tee from track:** on holes 16 and 17 the tee shot was inserted from the
  track in the app, not marked on the tee.

**Holes 11 and 12, measured** (the distance from each mark to that hole's cup
mark):

- **Hole 11:** tee 133.0 yd; rough 44.0 ft, 41 s before the cup mark; green
  10.4 ft, 10 s before, with its putt typed as 1 ft; then a second putt record
  entered by hand at 16:33:03.
- **Hole 12:** tee 294.1 yd; rough 138.4 yd; rough 57.2 ft, 14 s before the cup
  mark; then a 4th mark 37.1 ft from the cup, 9 s after the cup mark, stored
  with `lie: 'fairway', lieInferred: true`. The putts (24 ft, 3 ft) were typed
  at 18:07:10, at the end of the round.

**What hole 12 shows about golf-tracker v23**, read from the code:
`setGreenEntry` (`js/round/round.js:513-527`) keeps a marked shot as putt 1
only when its lie is `green`. Putt 1's ball mark had been stored with an
inferred fairway lie, so it stayed a full shot and both typed putts were added
as new records: 6 records for 5 strokes. It bears on the green flow planned for
the native app (`docs/HANDOFF-native-build.md`, Section 7: mark cup, mark putt
1, score). Nothing is queued for it.

## Shot detection, checked against his answers and the course map (2026-09-15)

He asked, 2026-09-15: "correct. Did you find all the shots on 13-17. That was
my intent to test the tracker". His answers, verbatim, in order:

> "15. 1st stop was the shot from 176 put to 5 yards. 2nd stop was we unloading everything at 16 tee and a short break 14. 2nd was 151 with a tree directly in front on me that I had to hook it around, 3rd from 29 that was my worse chip of the day, 17. yes was a shit show"

> "15. was fairway, 14, rough, and 17 2 rough shots"

> "i had to let someone play through on 12 tee so you should see a long break there"

> "14 was a chip from the right side of the fairway - correct!"

On 17, his "yes" confirmed a tee shot from about 138 yd and shots from about
40 and 23 yd.

**Reproduce:** serve the repo (`python tools/devserver.py 8123`) and open
`/docs/bakeoff-data/2026-09-14-veenker-walking/detection-check.html`. It runs
the shipped `js/round/track-analysis.js` on golf-tracker's track and on GPS
Custom's (Bake-off K on the day), against the answers above and
`docs/course-map/veenker/osm_full.json`. It only reads. A pick counts as right
within 10 m of the shot's stand, the same match `tools/detection-scoring.html`
uses against marks.

**Results, n = 1 round:**

| | golf-tracker's track | GPS Custom's track |
|---|---|---|
| Holes 13-17: full shots with a stand of 20 s or more (n = 12) | 9 (hole 17's three fall in its screen-off gap) | 12 |
| Picked right, with the window the app would have used on the course | 6 | 5 |
| Picked right, with the window from cup mark to cup mark | 6 | 7 |
| Holes 10-12 and 18: hand-marked full shots with a stop within 10 m (n = 10) | 9 | 9 |
| ... and selected by the ranking | 5 | 5 |

Of the 12 full shots on 13-17, 10 positions are known (a stand inside a mapped
tee box, or his word) and 2 are inferred: hole 16's stands at 252 and 103 yd,
the only long stands between its tee and green.

**Why picks went wrong**, each visible in the page:

- **The previous green.** He marks the cup, then putts, so the putting stand
  falls into the next hole's window. It was picked as a shot on 14, 16 and 17.
- **A long stand that is not a shot beats a real one on dwell.** The cart break
  at 16's tee (145 s) was picked on 15 with every track and window.
- **Walking with a push cart** breaks into 10-15 s stops; one was picked on 17.
- **Chips near the green are ranked down** while enough other stops remain:
  17's shots from 40 and 23 yd.
- **A window that closes when he types the putts at the next tee** makes "the
  last stop is the green" point at that tee: on 13, GPS Custom's putting stand
  was picked as the tee shot.

**The course map:** all five tee stands on 13-17 and all four hand-marked tees
(10, 11, 12, 18) are inside mapped tee boxes. The two tees the app inserted
from its own track are not: 16's by 18.7 m (the cart spot) and 17's by 6.8 m
(a walking pause). His five lies all match the map (n = 5); two sit within 4 m
of a fairway edge (0.6 m and 3.0 m).

**12's tee:** one GPS Custom stand of 542 s (16:33:29-16:42:31) ends at the tee
mark (16:42:34), centred 12.1 m from it and outside the tee box. The
play-through wait and the tee shot are one stand, which is why 12's tee was the
one hand mark with no stop within 10 m.

## For Fable

This is field evidence for item 2.3 in `docs/handoff/FOR_FABLE.md`, reviewed at
xhigh on his word. To reproduce it, from the repo root:

```
python tools/track-coverage.py docs/bakeoff-data/2026-09-14-veenker-walking/golf-bakeoff
python tools/track-coverage.py docs/bakeoff-data/2026-09-14-veenker-walking/golf-tracker-20260914-1807.json
python docs/bakeoff-data/2026-09-14-veenker-walking/compare-web-gaps.py
```

Item 2.3 carries the questions this round adds.

**The tool changed after this folder was committed:** the four small changes
Fable recommended in `docs/handoff/REPORT_2.3.md`, made on his word "make the
four changes, then run 2.2". Re-run, the first command now splits the repeated
fix times: T's 10 in its log and 4 in its store are all the same fix handed over
again, and none is a different fix at the same time. Every other line of
`score-bakeoff.txt` is unchanged, and the second command's output is identical
to `score-golf-tracker-export.txt` (both diffed 2026-09-14).
