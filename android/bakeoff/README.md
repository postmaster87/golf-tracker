# Recorder bake-off: K vs T

Two small Android apps that do one thing: record GPS for as long as a session
runs, with the phone locked in a pocket, and measure how much of the track they
kept. They exist to pick the recorder the native golf-tracker will use. **They
never feed a round.**

Why a native recorder at all, in Matt's words (`docs/HANDOFF-native-build.md`,
Section 2): *"The real motivation is what you stumbled on and it is 2 fold:
allowing the GPS to run in the background and mark the track regardless of what
I am doing on the phone and 2 eliminating the phone but not with a watch -
remember my background."*

## What he decided, 2026-09-13

| Decision | His pick |
|---|---|
| Native shell for the build before 2026-10-07 | "Native shell (Recommended)" |
| Contenders | "Kotlin vs transistorsoft (Recommended)" |
| Who builds | "Opus builds, Fable reviews (Recommended)": Opus builds this app. Fable reviews it at xhigh before it goes on the course and gives the pass/fail verdict. The recorder that feeds rounds, and its storage, stay Fable's |
| Pass bar | "99% coverage, no gap > 20 s (Recommended)" |
| Installs | "You may install whatever is needed" |
| Phone work | "Code you are going to do all the work. I plug in my phone, enable USB debugging and turn off the blocker get that all ready" |

## Putting it on the phone

**On your phone (Galaxy S26). This is all of it:**

1. Settings → Developer options → **USB debugging → On**.
2. Settings → Security and privacy → **Auto Blocker → Off**.
3. Unlock the phone and plug it into the desktop.
4. Tap **Allow** on *"Allow USB debugging?"*.
5. Leave it unlocked on the desk until Claude says it is done.

**Claude runs everything else from the desktop** with `bakeoff.ps1`. Every task
was tested on the emulator before it touched the phone:

| Task | What it does on the phone |
|---|---|
| `devices` | Finds the phone and reads its model, Android version and One UI build |
| `setup` | Installs both apps and grants precise location, location all the time, notifications, and physical activity (T only). Puts both on the Doze whitelist and allows background running. Then reads every grant back from the system, opens each app, and reads the app's own checklist |
| `samsung` | Opens Settings → Battery → Background usage limits → Never auto sleeping apps, and adds both apps. If a menu label on the S26 reads differently, it stops with a screenshot and the labels it saw, without tapping anything it was not sent to |
| `start` | Taps START in both apps |
| `status` | Reports whether both are recording, whether their foreground services are running, and how many fixes each has |
| `stop` | Holds HOLD TO STOP, then taps EXPORT, in both apps |
| `pull` | Copies `Download/golf-bakeoff` into `docs/roundDownloads/bakeoff/<time>/` (gitignored) and scores it |

**A carry:** with the phone plugged in, Claude runs `start`. Unplug it, lock it,
and pocket it, using the phone as normal for a round's length. Then plug it
back in, unlocked, and Claude runs `stop` and `pull`.

## The two apps

| | **Bake-off K** (teal icon) | **Bake-off T** (orange icon) |
|---|---|---|
| Application id | `com.postmaster87.golfbakeoff.k` | `com.postmaster87.golfbakeoff.t` |
| Recorder | Hand-written Kotlin: fused location, high accuracy, 1 s interval, no distance filter, in a location foreground service holding a partial wake lock | transistorsoft `tslocationmanager` 4.5.1, debug build |
| Source | `app/src/handwritten/` | `app/src/transistor/` |

Everything else is shared code in `app/src/main/`: the screen, the files, the
heartbeat, the measure, the export, and `LocationFix.kt`, the single path from
an Android `Location` to a row. Both apps show a notification while recording.

**Two apps, not one app with two recorders.** Each gets its own process,
foreground service, notification and battery state. In one app, whichever
recorder held a foreground service would keep the other one alive, and the
comparison would measure nothing. Carried together on the same round, both face
the same phone, pocket and sky.

### T: four defaults changed, and nothing else

Each default is changed because transistorsoft's own docs or source say it is
wrong for this job:

| Default | Why it is wrong here | Set to |
|---|---|---|
| The location filter: an accuracy gate (`trackingAccuracyThreshold`, 100 m) and a policy that can reject outliers, with Kalman on | In the 4.5.1 source (`LocationFilter.evaluate`), an accepted fix keeps its coordinates, but whole fixes get rejected: any worse than the gate (`accuracyThreshold > 0 && accuracyCurrent > accuracyThreshold`), and under `Conservative`, implied-speed and outlier fixes. Kalman smooths the distance between fixes, not the positions. The [web docs](https://docs.transistorsoft.com/kotlin/LocationFilterConfig/) name `Conservative` as the default; the 4.5.1 source's own table names `Adjust`. A rejected fix is a hole in the track | `PassThrough`, `trackingAccuracyThreshold = 0` ("PassThrough does not disable trackingAccuracyThreshold"), `useKalman = false` |
| Stop detection on | GPS turns off once he stands still ([philosophy](https://docs.transistorsoft.com/help/philosophy/)), which is exactly when he plays a shot | `activity.disableStopDetection = true` ("Location services will never turn OFF", `ActivityConfig`), then `changePace(true)` |
| `allowIdenticalLocations = false` | "By default, the Android plugin will ignore a received location when it is identical to the previous location." The docs' own example of an identical location is one fix delivered twice. Whether a new fix at the same coordinates also counts is not stated, and the check is not in the published sources. `true` is the setting that cannot drop a stand | `true`. The cost: repeats of a fix time are kept, and the tool counts and shows them (see run 2) |
| `distanceFilter = 10` m, fastest interval unset | Samples on distance, not time, and "If not configured, the default fastest interval is 30000 ms" | `distanceFilter = 0`, `locationUpdateInterval = 1000`, `fastestLocationUpdateInterval = 1000` |

Debug builds are "fully functional… without a License Key" (licence Section 3.5,
[licence](https://docs.transistorsoft.com/license/)). If T wins, whether to buy a
licence for his own rounds is his call.

### T: two integration rules any app on T needs

These are not tuning. They come from the SDK's `EventManager` in the 4.5.1
source, and the emulator smoke test found them the hard way (run 1, below):

1. **While headless (no live screen), the SDK delivers only to a class named
   `<application id>.BackgroundGeolocationHeadlessTask`, never to in-app
   listeners** (`EventManager.deliver`). Fixed:
   `app/src/transistor/.../t/BackgroundGeolocationHeadlessTask.kt`.
2. **Back on a screen, delivery is buffered until `ready()` is called again**
   (`EventManager.isDeliverable`, "headless -> foreground … MUST buffer until
   the client calls ready() again"). Fixed: `ready()` runs on every `onResume`.

Both routes write through one `recordSdkLocation`. The event log records
`sdk_delivery_route` (`listener` or `headless`) each time the route changes. On
restore, `changePace(true)` is called only if the SDK did not come back moving
by itself.

## The measure and the bar

Coverage is the measure behind the table in `docs/HANDOFF-native-build.md`,
Section 9:

- **span**: last fix time minus first fix time, with fix times sorted
- **covered**: the sum of fix-to-fix intervals of 20 s or less
- **gap**: an interval over 20 s; the longest gap is the largest interval
- **median accuracy**: over every fix that carries one

That definition is not recalled. `tools/track-coverage.py` reproduces all six
Section 9 rows from the exports in `docs/roundDownloads/` (run 2026-09-13):

| Round | Span | Fixes | Covered | Gaps > 20 s | Longest gap | Median accuracy |
|---|---|---|---|---|---|---|
| FT3 Veenker front 9 | 143.9 min | 7,858 | 105.0 min (73.0%) | 16 | 11.2 min | 3.1 m |
| FT4 Radcliffe 9 | 180.6 min | 11,393 | 163.9 min (90.8%) | 9 | 5.6 min | 3.2 m |
| FT4 second nine | 33.2 min | 2,327 | 33.2 min (100.0%) | 0 | 5 s | 3.6 m |
| FT5 Veenker back 9 | 129.2 min | 9,358 | 109.1 min (84.5%) | 7 | 6.5 min | 3.0 m |
| FT6 Veenker hole 1 | 27.7 min | 959 | 14.2 min (51.2%) | 3 | 11.2 min | 3.8 m |
| FT6 Veenker 14-18 | 75.3 min | 5,913 | 72.0 min (95.5%) | 4 | 1.6 min | 3.0 m |

**The bar:** at least 99% covered and no gap over 20 s, over a round-length
carry with the screen locked and a music app in use. Under this measure a track
with no gap over 20 s is 100% covered, so **the gap clause decides**. One 21 s
dropout fails a recorder.

**START and STOP count.** A recorder that dies before STOP leaves no fixes
after it, which the first-to-last measure cannot see; run 1's T log scored as a
clean 3.0 min session. So for a session, a first fix more than 20 s after
START, or a last fix more than 20 s before STOP (or before the last event, if
there is no STOP yet), is an **edge gap**. The gap rule itself is unchanged.
Web exports are still scored first fix to last.

**T is scored twice:** from its app log, and from its own SQLite store (the
`sdk-store-*.json` that EXPORT writes), over the same START-to-STOP window. A
production app on T would read the store. The app log shows whether our
integration received what the SDK recorded.

**Repeated fix times** are 0 s intervals. They cannot change coverage, but they
inflate the fix count, so the tool prints how many there are.

The phone (`Coverage.kt`) and the PC (`tools/track-coverage.py`) implement the
core measure separately and are held to one hand-worked fixture,
`app/src/test/resources/coverage-fixture.csv` with `.expected.properties`. The
fixture includes an interval of exactly 20 s, a 20.001 s gap, a repeated time,
rows out of order, and two broken rows. **Mutation-checked:** changing `>` to
`>=` in the gap test fails 2 of the 8 Kotlin tests and 3 of the Python checks.
The PC tool's self-test (14 checks) also covers the edge gaps. **The PC tool
gives the verdict.** The phone's numbers are a glance on the course.

## What a session records

A session runs from one START to one STOP. It is kept in the app's private
storage, and EXPORT copies it to `Download/golf-bakeoff/<K|T>/<session>/`.

- **`meta.json`**: recorder, app version, device, Android version, start time,
  the thresholds, and the phone's state at START.
- **`fixes.csv`**: one row per fix the recorder handed over. Columns are
  `wall_ms, fix_ms, elapsed_rt_ms, lat, lon, acc_m, alt_m, vacc_m, speed_mps,
  bearing_deg, provider, mock, moving, sample, event`. An absent value is an
  empty cell, never a zero. A fix with no time of its own is not written, and
  the event log records it instead. `moving`, `sample` and `event` are T's SDK
  flags. T's intermediate samples are kept and marked; `--exclude-samples`
  rescores without them.
- **`events.csv`**: `wall_ms, elapsed_rt_ms, kind, detail`.
  - `hb`, every 5 s: whether the recorder reports itself running, time since
    the last fix, and the phone's state (screen on, Doze, battery saver,
    unrestricted, background-restricted, standby bucket, heat, battery,
    charging, music playing, location on).
  - `previous_exit`: Android's own reason the previous process died (low
    memory, freezer, signaled, swiped, crash…).
  - `screen_off` / `screen_on` / `unlocked` / `doze_changed` /
    `battery_saver_changed`.
  - The recorder's own events: `updates_on`, `availability`,
    `foreground_start_failed`, `sticky_restart`, `resume_on_process_start`,
    `sdk_started`, `sdk_restored`, `sdk_delivery_route`, `sdk_motionchange`,
    `sdk_ready_on_resume`, and others.
- **`summary.txt`**, written at export.
- T only: **`sdk-store-<time>.json`**, the SDK's own SQLite record, one level
  up from the sessions.

**A gap is described, never explained by a guess.** For every gap, including
edge gaps, the PC tool reads the heartbeats inside it:

| Heartbeats in the gap | The tool says |
|---|---|
| `recorder=1` all the way through | *recorder reported running throughout; no fixes reached the log* |
| None at all | *the app was not running* |
| Some, but none from a running recorder for more than 15 s | *recorder not reported running for up to N s* |

It then lists every other event within 5 s of the gap: location turned off, a
process death, Doze, a delivery-route change. Those events are the evidence for
why no fix arrived; the heartbeat alone cannot say.

**Write posture.** Each row is flushed to the OS as it is written, so a killed
process loses nothing it had handed over, and fsync runs every 15 s. A process
killed mid-row leaves a cut row. The next process ends that line before
appending, and the reader counts the cut row as skipped instead of reading a
wild timestamp.

**An active session resumes.** If the process comes back without its recorder,
both apps restart it, because the session says he is recording. The gap stays
in the file, and the event log says why.

## Verified on the emulator, 2026-09-13

**What this is, and what it is not.** An Android 15 emulator (`golf-bakeoff`,
Google APIs x86_64), with synthetic GPS fed one fix a second along a walk from
Veenker's first tee (`adb emu geo fix`). Sessions ran 4 to 9 minutes. **n = 3
runs on one emulator.** It proves the plumbing, not the bar: no Samsung app
sleeping, no pocket, no sky, no round-length carry. The 5.0 m median accuracy
is the emulator's synthetic value, not a phone measurement.

- **Unit tests:** 8/8 in each app (the same 8 tests compiled into both).
- **PC tool self-test:** 14/14.
- **Mutation check:** as above.

| Run | What was done | K | T |
|---|---|---|---|
| 1 (build 2) | START both; 60 s screen off with Doze forced; 35 s location off; `kill -9` both | Kept recording in forced Doze (+55 rows in 61 s). Location off: a 41 s gap, described as "recorder reported running throughout; no fixes reached the log", with `availability available=false` beside it. After the kill, back within about 1 s (`previous_exit reason=signaled`, `resume_on_process_start`, `updates_on`) | Same through Doze and location off (40 s gap). After the kill, the SDK restored `enabled=true moving=true` and its own store kept filling (392 to 412 rows in 20 s), but the app log got nothing for 357 s. logcat said 530 times "Attempted to post headless event location but there are no listeners". That is the headless rule. Scored FAIL (2 gaps) once START/STOP edges count |
| 2 (build 3: headless task, `ready()` on resume) | START both, HOME, 40 s; both screens destroyed with processes alive ("Don't keep activities"), 40 s; `kill -9` both, 60 s; reopen; STOP; EXPORT | **PASS:** 4.8 min session, 267 fixes, 0 gaps, longest 6 s. Back 1.3 s after the kill | **PASS** from the app log: 336 fixes, 0 gaps, longest 6 s. **PASS** from the SDK store: 333 fixes. Delivery went `listener`, then `headless` 6.9 s after the kill, then `listener` again after reopen; 0 "no listeners" warnings |
| 3 (build 4: `changePace` only if not restored moving) | T only: START, HOME, 25 s; `kill -9`; 60 s; STOP | - | The restart took about 57 s this time (`previous_exit` 17:24:58, restore 17:25:55), against about 5 s in run 2: Android's restart backoff for a second kill minutes after the first. Repeated fix times still appeared after the restart (22 in the log, 21 in the store) without our `changePace`, so they come from the SDK or the provider |

**Repeated fix times:** run 2 had 88 in T's log and 93 in its store, all after
the kill; K had 0. Coverage is unchanged, and the fix count is inflated by that
many.

**The desktop script, `bakeoff.ps1`: n = 1 pass on the emulator, without root
(as on a phone), with both apps uninstalled first.**

- `devices` found the emulator.
- `setup` installed both apps and read every grant back as granted. It
  confirmed the Doze whitelist and background running, and read both apps'
  checklists as OK except the Samsung row.
- `start` began both sessions.
- `status` showed both recording with foreground services running, at 54 and
  52 lines after 40 s.
- `stop` held HOLD TO STOP and tapped EXPORT in both.
- `pull` scored K PASS (63 fixes), and T PASS with 88 fixes in its log and 84
  in its store.
- `samsung` stopped as it should: "Not a Samsung phone". Its menu path is
  untested until the S26.

The pull also caught a scoring bug. An old session was scored against a newer
store export that did not contain it, which showed a false FAIL. The tool now
scores each session against the export holding the most of its rows. When no
export has any, it says so and does not score one.

**What only the phone can answer:** Samsung's app sleeping, a round-length
carry, the sky at Veenker, and whether Android's restart backoff ever bites when
no one is killing the app on purpose.

## Build and test

```powershell
.\bakeoff.ps1 test      # JVM unit tests of the measure, both apps
.\bakeoff.ps1 build     # both debug APKs
python ..\..\tools\track-coverage.py --self-test
```

Toolchain:

- compileSdk 36, which transistorsoft's setup page requires.
- Android Gradle plugin 8.13.2, which supports API 36.1 and needs Gradle 8.13.
- Kotlin 2.3.21, whose compatibility table covers AGP 8.13.
- Gradle 8.13, checked against its published SHA-256.
- minSdk 30, for Android's process exit reasons.
