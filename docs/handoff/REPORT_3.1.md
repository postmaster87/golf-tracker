# REPORT 3.1 — The native shell: built, and what the emulator proved (Opus, 2026-09-16)

Job: build `docs/native/SPEC_native-shell.md` at xhigh, his ruling on 2026-09-16:
*"you can run both on x-high and so can Opus for the build. go ahead"*. The job
started on his words the same day: *"Let's start the native app build for the
tracker now. With the Green flow established at 20ft not 15"* — the green flow is
the next job, and nothing here touches putts.

Tree at start: `a778194`, clean. Four commits, one per Section 11 step:

| Step | Commit | What |
|---|---|---|
| 1 | `0edbb28` | `android/tracker/`, the web build inside the APK, no INTERNET, Setup screen, WebView |
| 2 | `168bdfb` | K lifted from the bake-off, the native track store, the whole bridge, Kotlin tests |
| 3 | `704eba7` | The web side, Section 6 file by file, browser tests 1-6 |
| 4 | `ce0e04c` | The emulator smoke found one real bug: the recorder did not stop at FINISH |

42 files, +3,830 / -33. `android/bakeoff/*` is untouched, and so is every file in
Section 7's list: `js/gps/gps.js`, `js/util/geo.js`, `js/round/track-analysis.js`,
`js/round/round.js`, `js/analysis/*`, `sw.js`, the export `formatVersion`,
`schemaVersion`, `REVISION`, and every IndexedDB code path as it runs on Pages.

Provenance tags as the spec uses them: `[measured]` read this session from code,
a file or a device; `[design]` a decision; `[verify]` still owed.

---

## 1. The answer, for him

**The shell exists, it records, and his rounds come across.** One Android app,
`Golf Tracker`, carrying the current screens as its own files, recording the GPS
track natively for the length of a round no matter what the phone is doing, and
reading his logged rounds back byte for byte out of the exports he already has.

**It has not earned a real round yet.** The bar is his: 99% coverage and no gap
over 20 s, across a round-length carry with the screen locked and a music app in
use. That carry has not happened; the emulator proves the plumbing, not the bar.
**v27 on Pages stays the instrument** until Fable scores that carry and says PASS
in his chat.

**One decision is his** and it is small: Section 3 below, the two extra points in
FT7's track.

---

## 2. What is on the phone when this installs

| | |
|---|---|
| App name | **Golf Tracker** (the bake-off apps stay GPS Custom / GPS Transistor) |
| Application id | `com.postmaster87.golftracker` |
| Version | `versionName` **v27**, read out of `js/data/build.js` at build time (D9) `[measured]` |
| versionCode | 2701 (the web build number x 100, plus a shell counter) |
| Toolchain | compileSdk 36, minSdk 30, targetSdk 36, AGP 8.13.2, Kotlin 2.3.21, Gradle 8.13, JDK 17 — the bake-off's, pinned `[measured]` |
| Permissions | eight, and **no INTERNET** `[measured]` |
| Web files in the APK | 30: `index.html`, `manifest.webmanifest`, `icon.svg`, `css/` (2), `js/` (25, `js/dev/` excluded) `[measured]` |
| Not in the APK | `sw.js`, `test/`, `tools/`, `docs/` |
| APK | 8.3 MB debug |

`aapt dump permissions`, the whole list `[measured]` (Section 9 test 14, **PASS**):

```
ACCESS_FINE_LOCATION         FOREGROUND_SERVICE_LOCATION
ACCESS_COARSE_LOCATION       POST_NOTIFICATIONS
ACCESS_BACKGROUND_LOCATION   WAKE_LOCK
FOREGROUND_SERVICE           REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
```

No library merges INTERNET in today (the manifest merger says so), and the
manifest carries a `tools:node="remove"` entry for it so none ever can. That is
what makes *"entirely off of webapps and all local"* provable rather than
asserted.

---

## 3. What Matt must decide

**One thing, and it is two GPS points in a round he ditched.**

FT7's track (`r_1792abc1...`, 2026-09-11, the round he shut the app down on) has
4,585 points in the export. Imported into the shell and read back, it returns
**4,583**. Nothing was lost on the way in: all 4,585 rows are in the phone's
`fixes.csv`. The reader drops 2 of them because spec Section 4 de-duplicates on
the fix's own time, first row wins.

Measured in the source file `[measured]`: **three byte-identical points share the
time 1789165452854** — same latitude, longitude, accuracy, speed and bearing. So
the two dropped are copies of one fix, and no measured position is lost. First
and last times match. This is exactly the shape REPORT_2.3 Section 11 measured in
the field and called an SDK re-emission rather than a new fix.

It is also Section 4 and Section 8 of the spec disagreeing: Section 4 says
de-duplicate, Section 8 says every round's read-back count must equal the
export's. **Built to Section 4**, because it is a decision with evidence behind
it and the alternative is counting one fix three times. The only visible cost:
for that one round `trackSize` reports 4,585 and `readTrack` returns 4,583.

*His call: leave it (recommended), or keep every row and let a repeat count three
times.*

Everything else in this build is decided. `REVISION` is not bumped (D10, and the
wall in `CLAUDE.md` Section 3); `BUILD.id` is not touched; nothing is pushed.

---

## 4. Section 9, test by test

### Browser suite, `/test/` — 531 / 531, all green, n = 3 clean runs at 360x728

519 at v27, plus 12 in one new group, `native shell`. **Each was proven to fail
without its change**: the change was mutated, the suite re-run, the mutation
reverted, the suite re-run green.

| Mutation | Tests that went RED |
|---|---|
| `timestamp: f.ts` becomes `Date.now()`, and the shim installs with no bridge | 3 |
| `clearWatch` tears the delivery hook down | 1 |
| `trackstore.js`'s `bridge()` returns undefined | 4 |
| `persistence.js`: the shell guard and the shell wording removed | 2 |
| `schema.js`: `device.recorder` hardcoded `'web'` | 1 |
| `store.js`: a stripped payload and no `saved` path | 2 |

The 12, by spec item:

1. The shim installs only under a bridge; a native fix reaches `GpsService`
   carrying **its own time** (`Location.time`, the `fix_ms` column), not the
   arrival time — a receive time there would quietly re-base every gap in every
   round.
2. `clearWatch` then `watchPosition` (the revive path) keeps delivering, and
   leaves the native watch count where it started (2 up, 1 down).
3. `readTrack`, `writeTrackChunk`, `trackSize`, `trackedRoundIds` and
   `deleteTrack` route to the bridge and keep their shapes; `writeTrackChunk`
   filters first and hands over only the valid points; the shell writer stores
   nothing itself and reports the recorder's rows instead.
4. Persistence reads PERSISTENT in the shell without asking the browser, and says
   what actually deletes rounds there. The Pages wording is unchanged.
5. `newRound().device.recorder` is `'web'` here and `'native-k'` under a bridge,
   with `schemaVersion` unmoved.
6. The shell export hands the phone the same payload the download path builds
   (`format`, `formatVersion`, `rounds.length`, `trackPoints`), and both export
   buttons write the file once and say where it went.

### Kotlin JVM tests — 10 / 10, n = 1 run

Two files, the bake-off's `CoverageTest.kt` pattern: `TrackFilesTest` (6) and
`RecordingSessionTest` (4). Mutation-checked, so they are not vacuous
`[measured]`:

- de-duplicating **last**-wins instead of first-wins: **2 of 10 fail**
- the cap boundary at `>` instead of `>=`: **1 of 10 fails**

They cover spec items 7-9: the rounding (7/7/1/2/0 dp), speed absent gives four
slots, bearing without speed gives four slots, no accuracy skipped and counted,
`sample=1` skipped, a duplicate fix time first wins, rows out of order sorted, a
cut last row skipped; the import to CSV to read round trip of a 4-, a 5- and a
6-slot point, exactly; and the same-id rule and the 8 h cap on a fake clock.

### Emulator smoke — `golf-bakeoff` AVD, Android 15, 320x640 at 160 dpi

Synthetic GPS at 1 Hz walking north from Veenker's first tee (`adb emu geo fix`,
the bake-off README's recipe). One round, fresh install. **n = 1 each.**

**10. HOME 60 s; recents to Clear all; 60 s; reopen. PASS.**
The process survived the task being removed (the foreground service holds it),
the round came back `in_progress` on the play screen, and the notification never
left — 5 samples across the whole closed interval. Fixes across the closed
interval (from `task_removed` to the kill): **72 fixes in 83.6 s, longest interval
1.882 s, zero over 2 s** `[measured]`.

**11. `kill -9` mid-round; 60 s; reopen. PASS.**
`previous_exit reason=signaled status=9` at 1789571828987, a new process opened
the log 1.16 s later, `resume_on_process_start`, `updates_on`. **The only gap in
the whole round is the 6.044 s spanning the kill**; after it, longest interval
1.714 s, 0 over 2 s `[measured]`.

**12. Finish the round. PASS** (after the fix in Section 5).
`recorder_halt`, `stop`, `log_close`; rows 236 at +6 s and **236 at +21 s**; the
notification gone; the service gone; the committed round id dropped. The export
written to `Download/golf-tracker/` carries **235 points — exactly the 235 data
rows in `fixes.csv`**, 0 cut rows, 0 repeated times, 0 rows without accuracy. The
round record carries `device.recorder: "native-k"`, `schemaVersion 1`,
`revision 4` — none of them moved.

**13. Section 8's acceptance.** Section 6 below.

**14. No INTERNET. PASS.** Section 2 above.

**And `tools/track-coverage.py` reads a shell recorder log as it is**, with no
change to the tool (Section 4's `[verify]`, now measured):

| Source | Span | Fixes | Covered | Gaps > 20 s | Longest gap | Median accuracy | Bar |
|---|---|---|---|---|---|---|---|
| `r_fae282fa...` | 4.5 min | 235 | 4.5 min (100.0%) | 0 | 6 s | 5.0 m | PASS |

It read `recorder: native-k`, the START to STOP window, and named the process
death out of `previous_exit` without being told. The 5.0 m median is the
emulator's synthetic value, not a phone measurement.

---

## 5. The bug the smoke found, and the one departure it forced

**Finishing a round left the recorder running.** 319 rows at FINISH, still
climbing 12 s later, the committed round id still in prefs and the partial wake
lock still held. It would have run to the 8 h cap `[measured]`.

Why: finish and abandon both do the same three things in one tick — set
`round.status`, null `ctx.round`, then call `ctx.stopGps()`
(`js/ui/screen-play.js` lines 2510-2530 and 3344-3364) `[measured]`. So the GPS
loop can never see a `completed` round, and `syncNativeRecorder`'s
`completed`/`abandoned` branch could not fire from any of the three call sites
Section 6 item 2(c) names. The rule was unreachable as written.

**DEPARTURE:** a fourth call site — `stopGps()` in `js/app.js`, which has exactly
two callers and both mean "the round is over". D8 is not weakened: a null
`ctx.round` still stops nothing by itself; the **stored** round is consulted, and
one still `in_progress` is left recording. Re-measured on the fixed build:
recording stops on FINISH, rows frozen, notification cleared, service gone.

It is not covered by the browser suite — `js/app.js` is the app shell and the
harness never imports it (nothing in `test/run.js` does) `[measured]`. Its proof
is the emulator, above, and it is the only behaviour in this build whose only
proof is the emulator.

---

## 6. Section 8: his rounds, moved across

**All nine exports in `docs/roundDownloads/`, imported one at a time through the
app's own "Restore from backup" button on the emulator** — the real path, the
real system file picker, the real confirm sheet — then read back through
`GolfNative.readTrack` in one export written through `GolfNative.saveExport`.

On the phone afterwards: **35 rounds, 16 tracks, 59,655 points**, in an 8.0 MB
file, written in under 13 s `[measured]`.

**14 of the 15 tracks match the source exactly** on count, first `ts` and last
`ts`. The fifteenth is FT7, Section 3 above.

| Round | Export | Read back | first/last ts |
|---|---|---|---|
| `r_18b4b0bb...` (the spec's named round) | 8,579 | **8,579** | 1789420084966 / 1789427249443, both match |
| `r_49183f52...` | 11,393 | 11,393 | match |
| `r_b3514a0b...` | 9,358 | 9,358 | match |
| `r_bfa9018b...` | 7,858 | 7,858 | match |
| `r_bfa9018b...-fixed` | 7,858 | 7,858 | match |
| `r_bd6dc819...` | 5,913 | 5,913 | match |
| `r_1792abc1...` (FT7) | 4,585 | **4,583** | match — Section 3 |
| `r_4770e2b0...` | 2,327 | 2,327 | match |
| `r_de5532ac...` | 959 | 959 | match |
| `r_21c09b75...` | 465 | 465 | match |
| `r_67341063...` | 66 | 66 | match |
| `r_41fdfed4...` | 49 | 49 | match |
| `r_98c6639e...` | 4 | 4 | match |
| `r_79287edb...` | 3 | 3 | match |
| `r_bbd02109...` | 5 | 5 | match |

The spec's other named values, confirmed against the file `[measured]`:
`golf-tracker-20260914-1807.json` has 6 rounds and 20,090 track points, and every
one of those 6 rounds imported at its exact count.

Nine of the fifteen tracks appear in two, three or four of the exports; every
copy agrees with every other copy, so there is one right answer per round and the
phone has it. Point shapes on the phone after the round trip: 4-, 5- and 6-slot,
the same three shapes the exports carry.

An imported track can never be mistaken for a recording: every row carries
`provider = import`, `wall_ms` and `elapsed_rt_ms` are empty because this phone
never received those fixes, `meta.json` says `recorder: "import"`, and
`events.csv` carries one `imported` line with the point count `[measured]`.

**Two of the nine imports needed a harness fix, not an app fix.** The picker's
search box, once the query had been typed into it, carried the same filename
prefix the driving script was matching on, so the script tapped the search box
and then tapped RESTORE on nothing. Both files imported first time once the match
required a `.json` file row. No app code changed for it.

---

## 7. What changed, file by file

**New Android project, `android/tracker/`** — its own Gradle project beside the
frozen bake-off rig.

| File | What it is |
|---|---|
| `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `gradlew*`, `gradle/wrapper/*` | The bake-off's pinned toolchain |
| `app/build.gradle.kts` | `versionName` read out of `js/data/build.js` (D9); the `Sync` task that copies the web build into the APK's assets |
| `app/src/main/AndroidManifest.xml` | Eight permissions, INTERNET removed, portrait, the service |
| `MainActivity.kt` | Setup checklist (lifted), the WebView over `WebViewAssetLoader`, the file chooser, the fix delivery to `window.__golfNativeFix` |
| `GolfNative.kt` | The bridge, Section 5, complete |
| `Recorder.kt`, `RecorderService.kt` | K lifted, plus the three states and the 8 h cap |
| `RecordingSession.kt` | The same-id rule and the cap, pure, so both are provable off the phone |
| `SessionLog.kt`, `Sessions.kt`, `FixCsv.kt`, `LocationFix.kt`, `DeviceState.kt`, `TrackerApp.kt` | Lifted from the bake-off, renamed into the shell's package |
| `TrackFiles.kt` | New, pure: `fixes.csv` to the compact points `trackstore.js` writes, and back |
| `TrackStore.kt` | New: the Android half of `trackstore.js` |
| `Exporter.kt` | The MediaStore copy pattern, lifted |
| `FixBus.kt` | The one hop from the recorder to a resumed screen |
| `app/src/test/.../TrackFilesTest.kt`, `RecordingSessionTest.kt` | Section 9 items 7-9 |
| `res/...` | Icons lifted; the launcher is green, so it can never be mistaken for GPS Custom or GPS Transistor |

**Web side** — every line inert on Pages; the bridge object's presence is the only
signal, read at call time.

| File | What changed |
|---|---|
| `js/native/shim.js` (new) | Native fixes wearing `navigator.geolocation`'s clothes, the way `js/dev/sim.js` proves the seam. `js/gps/gps.js` untouched. |
| `js/app.js` | Loads the shim; skips the service worker; `syncNativeRecorder` follows the round; `startGps`/`stopGps` skip the wake lock and the pocket lock; `stopNativeRecorderIfRoundEnded` (Section 5) |
| `js/data/trackstore.js` | Every public function routes to the bridge when it is there. Every IndexedDB line untouched. |
| `js/data/persistence.js` | PERSISTENT in the shell; a PROTECTED wording that names the right mechanism |
| `js/data/store.js` | The export goes out through the bridge and reports the path |
| `js/data/schema.js` | `round.device.recorder`, additive and optional |
| `js/ui/screen-settings.js` | EXPORT RECORDER LOGS; the saved path in both toasts; the shell storage wording |
| `js/ui/screen-play.js` | The auto-lock control is hidden in the shell |
| `test/run.js`, `test/index.html` | The `native shell` group |
| `.gitignore` | The copied web assets are never committed |

---

## 8. Departures from the spec, and small decisions

1. **A fourth `syncNativeRecorder` call site.** Section 5. The spec's three sites
   cannot see a round end.
2. **The pocket-lock setting is hidden in `js/ui/screen-play.js`, not
   `js/ui/screen-settings.js`.** Section 6 item 7 puts it in Settings; the only
   such control in the app is the "Auto-lock after" field in the play screen's
   round menu (line 2419) `[measured]`. The behaviour is the spec's; the file is
   the one the control is actually in. Confirmed on the emulator: the round menu
   in the shell has no auto-lock row.
3. **FT7's two points.** Section 3. Built to Section 4; his call is named.
4. **Section 6 item 2(d) is delivered by item 3.** The spec asks in one place for
   `syncTrackWriter` to create no IndexedDB writer and for `ctx.trackStats` to
   map `GolfNative.stats()`, and in another for `createTrackWriter` in the shell
   to return exactly that writer. One code path in `trackstore.js` satisfies
   both; `js/app.js` needed no change for it.
5. **"OPEN THE APP ANYWAY" on the Setup screen.** An addition. A checklist that
   will not let him past — because Samsung reset a battery setting, say — would
   block logging a round, which the design rule forbids. A missing grant costs
   track, not shots.
6. **`meta.json`.** `recorder` is `"native-k"` as Section 4 says, so the
   bake-off's prose string moved to `recorder_name`. `Coverage.kt` was not in the
   lift list, so its two constants (`gap_threshold_ms` 20000, `pass_covered_pct`
   99) are literals in `DeviceState`, and the fields stay.
7. **Window insets.** The WebView is inset by the status bar and the gesture bar
   rather than drawn under them, so the page gets exactly the area Chrome gives a
   standalone PWA — the area the v26/v27 fold work was measured against
   (REPORT_2.6: 2340 - 111 - 45, page 728 CSS px). The two bar strips take the
   page's own `theme-color`, re-read on page load and on resume.

---

## 9. What is NOT in this build

- The green flow. That is the next job and its own spec.
- The course map as app data.
- The watchdog restart from REPORT_2.3 Section 13 — *watch, do not change*.
- Any change to the mark pipeline, the round record's meaning, the export's
  `formatVersion`, or `REVISION`.
- A Pages deploy. Nothing was pushed; `BUILD.id` did not move.

---

## 10. Putting it on his phone

**On your phone (Galaxy S26). This is all of it:**

1. Settings then Developer options then **USB debugging: On**.
2. Settings then Security and privacy then **Auto Blocker: Off**.
3. Unlock the phone and plug it into the desktop.
4. Tap **Allow** on *"Allow USB debugging?"*.
5. Leave it unlocked on the desk until Claude says it is done.

**On the PC, Claude runs every one of these. They are here so they can be
checked, not so they can be typed.** `SERIAL` is the phone's serial from
`adb devices` (`RFGL4275NVH`), and it must be the phone's, never an emulator's.

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd C:\Temp\gitRepos\golf-tracker\android\tracker
.\gradlew.bat -p . --no-daemon assembleDebug
adb -s SERIAL install -r app\build\outputs\apk\debug\app-debug.apk
adb -s SERIAL shell pm grant com.postmaster87.golftracker android.permission.ACCESS_FINE_LOCATION
adb -s SERIAL shell pm grant com.postmaster87.golftracker android.permission.ACCESS_COARSE_LOCATION
adb -s SERIAL shell pm grant com.postmaster87.golftracker android.permission.ACCESS_BACKGROUND_LOCATION
adb -s SERIAL shell pm grant com.postmaster87.golftracker android.permission.POST_NOTIFICATIONS
adb -s SERIAL shell dumpsys deviceidle whitelist +com.postmaster87.golftracker
adb -s SERIAL shell cmd appops set com.postmaster87.golftracker RUN_ANY_IN_BACKGROUND allow
adb -s SERIAL shell dumpsys package com.postmaster87.golftracker
```

The last line reads every grant back from the system rather than trusting what
the grant commands printed. `install -r` keeps the app's storage, so a reinstall
never costs a round.

**On your phone again, two things only Samsung can do, and the app cannot read
either of them:**

6. Open **Golf Tracker**. If the checklist appears, every red row has a **FIX**
   button next to it; tap them until the list is clear. When it is clear the app
   goes straight to the round screens on every later launch.
7. Settings then Battery then **Background usage limits**: make sure **Golf
   Tracker is on neither "Sleeping apps" nor "Deep sleeping apps"**. (An app whose
   battery is Unrestricted is not offered for "Never auto sleeping apps" —
   measured on the S26, One UI 8.5, 2026-09-13 — so Unrestricted is the setting,
   and the two exclude each other.)

**Moving your logged rounds across, on your phone, in this order:**

8. In **Chrome**, open golf-tracker, then Settings, then **SEND EXPORT...**, and
   save the file (Drive, or mail it to yourself). **Write down the two numbers in
   the toast: rounds, and track fixes.**
9. In **Golf Tracker** (the new app), Settings, **Restore from backup**, pick
   that file, **RESTORE**.
10. Read the toast back. Rounds added and track fixes must equal step 8's
    numbers. If they do not, stop and say so — nothing has been lost, the export
    is still the copy that survives everything.

**Until the carry is scored, the app is not the instrument.** Play rounds on v27
in Chrome, as now. The shell feeds a real round only after Fable scores a
round-length locked-screen carry against his bar and says PASS in his chat.

---

## 11. Where the evidence lives

- Commits `0edbb28`, `168bdfb`, `704eba7`, `ce0e04c` on `main`, not pushed.
- The emulator round and its recorder logs are on the `golf-bakeoff` AVD
  (`emulator-5556`, left running with the app installed and the nine exports in
  its Download folder, so Fable can re-read any of it). **Nothing was installed on
  his phone, and nothing on the phone was touched.**
- `tools/track-coverage.py` scores the shell's logs as they are; the command is
  `python tools\track-coverage.py FOLDER`, where FOLDER is what was pulled from
  `Download/golf-tracker/logs`.
- Every number in this report was measured this session, on this PC or on that
  emulator, with its n beside it. Nothing here is recalled.

---

## 12. Answered line

2026-09-16 · 3.1 · DONE. The native shell is built to `SPEC_native-shell.md`: `android/tracker/`, the web build inside the APK with no INTERNET (8 permissions, measured), `versionName` v27 read from `js/data/build.js` (D9), K lifted from the bake-off with the three states and the 8 h cap, the native fix log as the dense track (D2), and the whole `GolfNative` bridge. Browser suite 531/531, n = 3 clean runs, 12 new tests each proven to fail without its change; Kotlin JVM 10/10, mutation-checked (2 of 10 and 1 of 10). Emulator smoke on `golf-bakeoff`, n = 1 round: the task closed for 60 s kept 1 Hz (72 fixes in 83.6 s, longest 1.882 s, none over 2 s) with the notification never leaving; `kill -9` resumed in 1.16 s with the only gap in the round being the 6.044 s across the kill; FINISH stops the recorder, clears the notification and drops the flag; `tools/track-coverage.py` reads a shell log unchanged (235 fixes, 100.0%, 0 gaps over 20 s). Section 8 acceptance on all nine real exports through the app's own Restore button: 35 rounds, 16 tracks, 59,655 points read back; 14 of 15 tracks match count, first ts and last ts exactly, including the spec's named `r_18b4b0bb...` at 8,579 / 1789420084966 / 1789427249443. One bug found and fixed on the emulator: FINISH left the recorder running, because the spec's three `syncNativeRecorder` call sites cannot see a round end — a fourth site, `stopGps()`, is the one departure that changes behaviour. Matt's one decision: FT7 reads back 4,583 of 4,585 points, the 2 dropped being byte-identical copies of one fix at 1789165452854 (Section 4's de-duplication); leave it, or count a repeat three times. `REVISION` not bumped, `BUILD.id` not touched, nothing pushed. `docs/handoff/REPORT_3.1.md`.
