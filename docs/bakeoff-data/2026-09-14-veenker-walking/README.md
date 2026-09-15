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
