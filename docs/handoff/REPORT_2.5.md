# REPORT 2.5 - GPS Transistor bakeoff-3: the reopen retest and a locked-and-still reading

Fable, 2026-09-16, in Matt's chat (the first Fable-main session). Tree at
`ab020d2`, clean. His words on it, 2026-09-15: *"fix the reopen bug. I will let
you test after work if I am not in a terrible mood which is very likely the way
this morning is going"*; this morning: *"hold on the build. Let's finish the GPS
test this morning. Tell me what you need"*, then *"Yes lock it and run the 15"*.

Data: `docs/roundDownloads/bakeoff/20260916-075606/golf-bakeoff/T/20260916-073358-T/`
(app log) and `sdk-store-20260916-075557.json` (the SDK's own store), both
gitignored. Scored by `bakeoff.ps1 -Task pull` (Section 9 measure).

## 1. Verdict

**PASS, n = 1 retest.** The reopen bug of 2026-09-15 (app log lost 342 s after a
Close all and reopen, session `20260915-075447-T`) does not reproduce at
bakeoff-3. The app log now matches the SDK store through a Close all, a reopen
and 15 minutes locked.

## 2. What was done, in order

1. `bakeoff.ps1 -Task setup` installed bakeoff-3 over bakeoff-2 (same
   application ids). Every grant read back granted; battery unrestricted;
   RUN_ANY_IN_BACKGROUND allow; both app checklists all OK except the Samsung
   never-sleeping line the app cannot read.
2. `-Task start -Only T`: GPS Transistor alone, session `20260916-073358-T`,
   phone on the desk, plugged in, screen on.
3. From the desktop: recents (`input keyevent 187`), tap **Close all**
   (`com.sec.android.app.launcher:id/clear_all`), relaunch GPS Transistor from
   its launcher intent 3 s later.
4. Status at 5 s and 65 s after the reopen: `fixes.csv` 102 then 162 lines.
5. `input keyevent 26` locked the screen (`mWakefulness=Dozing`); left 15 min.
6. After the 15 min: still Dozing, 1,271 lines. Unlocked on his word;
   `-Task stop -Only T` (HOLD TO STOP, EXPORT ALL), `-Task pull`.

## 3. Numbers

| Source | Span | Fixes | Covered | Gaps > 20 s | Longest gap | Median acc | Bar |
|---|---|---|---|---|---|---|---|
| app log, as scored | 22.8 min | 1,324 | 21.9 min (96.0%) | 1 | 55 s | 3.8 m | FAIL as printed |
| app log, from row 2 | 21.9 min | 1,323 | 21.9 min | 0 | 1.4 s | 3.8 m | PASS |
| SDK store | 21.9 min | 1,319 | 21.9 min (100%) | 0 | 2 s | 3.8 m | PASS |

The scorer's one "gap" is a scoring artifact, not a recorder gap: row 1 of the
app log is the SDK's last-known fix from the previous session, handed over at
start with its own old `fix_ms` (07:33:03, 14.7 m accuracy) and logged at
07:33:58. The session started at 07:33:58. From row 2 on, the largest
interval in 1,323 fixes is 1,448 ms. The SDK store, which has no such row,
scores 100% with a 2 s longest gap on the same window.

The Close all, as the events log recorded it (`events.csv`):

| Wall time | Event |
|---|---|
| 07:35:24.8 | `sdk_headless_event name=terminate` (the task was removed) |
| 07:35:25.0 | `sdk_delivery_route route=headless` |
| 07:35:27.7 | `sdk_listeners subscribed=4;on=resume`, `route=listener` |

Fixes across the terminate-to-resume window: no interval over 1.4 s. The
process kept its pid (17436) through the Close all; the heartbeat counter
`fixes_this_process` did not reset.

Locked 15 min: 363 to 1,271 lines, 908 fixes in about 900 s, 1.0 per second,
screen `Dozing` at both checks (n = 2 checks).

## 4. What this does and does not show

- **Shows:** the task-removed-and-reopened path, the one that produced
  yesterday's 342 s log gap, keeps the app log whole at bakeoff-3 (n = 1).
  Locked and still on a desk, plugged in, GPS Transistor alone holds 1 Hz for
  15 min (n = 1).
- **Does not show:** a path where Android kills the process outright (the pid
  survived today); the bar's locked-screen clause (a round-length carry, screen
  off 90 percent of beats, music, golf-tracker closed - REPORT_2.3 Section 9);
  battery drain (charging).

## 5. Follow-ups, not fixed here

1. **Scorer:** `bakeoff.ps1 -Task pull` scores the app log from its first row,
   which can be a pre-start last-known fix; it printed FAIL on a PASS run. A
   fix is to drop rows whose `fix_ms` precedes `started_wall_ms` in `meta.json`,
   or to score from `wall_ms`. Opus's, one line, not done today (the build is
   on hold on his word).
2. **The locked-screen carry** for the bar is still the open test (NEXT_CHAT
   2026-09-15, Section 3, item 1).
