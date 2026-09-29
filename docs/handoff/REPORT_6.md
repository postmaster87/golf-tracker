# REPORT 6 - the Hole Overview page, builds v35 and v36

Fable, 2026-09-29, session "Latest build setup", at xhigh. Spec:
`docs/SPEC_hole-overview.md` (revision 4). Three Opus jobs (6.1, 6.2, 6.3) and
Fable's review of each. Nothing here is pushed or installed.

The harness refused a report file from a sub-agent on all three jobs
("Subagents should return findings as text, not write report files"). Opus
returned its reports as text in the chat; this file is Fable's, written from
those returns and from Fable's own checks. Where a number is Opus's and Fable
did not re-measure it, the row says so.

## 1. What he asked for, and where it is

| His words (2026-09-28) | Built as | Build |
|---|---|---|
| "a "hole Overview" page I can toggle to" | `MAP` at the right end of the hole navigation row; `PLAY` in the same spot goes back. `COURSE MAP` on the home screen | v35 |
| "approach distance (front center and back)" | GREEN F / C / B, in a YOU column (live GPS) and a TEE column (the tee box for the tee set) | v35 |
| "lay up distances that I will add in later" | `+ LAYUP`: yards, LEAVES TO THE GREEN or FROM THE TEE, a label. Kept on the phone and in the export | v35 |
| "bunker numbers (carry ideally)" | each bunker: reach (nearest edge) / carry (farthest point) | v35 |
| "distance to the water and carry distance over water" | each creek crossing on holes 7, 11, 15, 16: reach / carry on his own line. Ponds: no number (his ruling 8) | v35 |
| "add the carry number for the creek off 15 tees and the carry number for the creek on 16 should always be displayed" | fixed line under the top bar: hole 15 `CREEK CARRY BLUE 255 · GOLD 223`, hole 16 `CREEK CARRY BLUE 477 (your mark) · GOLD 415` (his rulings 17 to 19) | v35 |

## 2. Commits, in order

| Job | Commit | What | Opus | Fable's verdict |
|---|---|---|---|---|
| spec | `1273d84` | the spec filed, revision 2 | - | - |
| 6.1 | `4f32556` | Part A, the numbers | xhigh | PASS |
| 6.1 | `fd382e0` | Part B, the 18 pictures and their frames | xhigh | PASS |
| 6.1 | `7105e97` | Part C, his course notes (layup storage) | xhigh | PASS, correction C1 owed |
| merge | `2d51b74` | stage 1 onto build v34 | Fable | suite 626 / 626 |
| log | `c2fb502` | review rulings R1 to R6, spec Section 14 | Fable | - |
| 6.2 | `e7da1e6` | Part E, hole 9's blue and gold tee boxes | xhigh | PASS |
| 6.2 | `6cd2598` | C1, a damaged notes key is copied once | xhigh | PASS |
| 6.2 | `d6a74a3` | Part D, the page | xhigh | PASS, corrections C2 and C3 owed |
| 6.2 | `8f64b94` | build v35 | xhigh | PASS |
| 6.3 | `1d52cd8` | C2, one green on the screen | high | PASS |
| 6.3 | `2659bcb` | C3, the YOU column beside the picture | high | PASS |
| 6.3 | `2bd29b5` | build v36 | high | PASS |

## 3. Suite, 360 x 728

| Tree | Count | Whose run |
|---|---|---|
| v33, `1273d84` | 594 / 594 | Opus, n = 1 |
| stage 1 merged onto v34, `2d51b74` | 626 / 626 | Fable, n = 1 |
| Part E | 627 / 627 | Opus, n = 1 |
| C1 test before the fix | 627 / 628, the new test RED | Opus, n = 1 |
| C1 | 628 / 628 | Opus, n = 1 |
| Part D | 641 / 641 | Opus, n = 2 |
| v35, `8f64b94` | 641 / 641 | Fable, n = 1; Opus, n = 2 |
| C2 | 644 / 644 | Opus, n = 1 |
| C3 test before the fix | 644 / 645, RED on hole 16 row B1 ("B1 ends at 739.8") | Opus, n = 1 |
| v36, `2bd29b5` | 645 / 645 | Fable, n = 1; Opus, n = 1 |

No test is left RED.

## 4. The numbers against Fable's prototype

| Check | Result | Whose |
|---|---|---|
| Table 1, what is numbered, 18 holes | exact: 25 bunkers, 5 creek crossings (n = 30) | Opus |
| Table 2, holes 1 to 8 and 10 to 18, blue and gold: box reach, green F / C / B, reach / carry | every value equal, largest difference 0 (n = 34 tee rows) | Fable's own run of the engine |
| Hole 9 after Part E: blue 496 / 513 / 530, B1 472 / 480, B2 493 / 511; gold 457 / 473 / 490, B1 432 / 440, B2 454 / 473 | equal (n = 2 tee origins) | Opus |
| The rendered page, simulated GPS: hole 16 blue, hole 11 blue, hole 1 blue TEE columns | equal to Table 2 (n = 3 holes) | Fable |
| Hole 7, 300 yd down the hole, on the line and 30 m either side: W1 59 / 97, 35 / 74, 84 / 116 | equal, `ownLine` true (n = 3) | Opus, in the suite |

## 5. The pictures (Part B)

Pillow 12.3.0, libwebp 1.6.0, WebP quality 80, 0.30 m per px. 18 files in
`img/veenker/`, 1,433,580 bytes (prototype 1,432,152). Widths 518 to 1,046
px, heights 779 to 2,092 px. One frame slides (hole 5, 3 m). A re-run is
byte-identical. Fable drew holes 7 and 16 with the map's outlines through
`framePx`: creek, greens, bunkers and fairways sit on the photo (n = 2, by
eye).

## 6. Part E, the generator

`veenker.js` changed on 4 lines: `sets` of box 1065750754 (`blue`) and
199289144 (`gold`); `inputsSha256.corrections` `a7d42e0b...` to
`d92c92b2...`; `inputsSha256.markup_lines` `faa8e10e...` to `6e4f5466...`
(ruling R3: the generators hash text inputs with CRLF read as LF). Read by
Fable in the diff. The 18 images came out byte-identical.

## 7. Fable's review of v35, and the corrections in v36

| # | Seen at 360 x 728, simulated GPS, round on hole 16 | Correction, built in v36 |
|---|---|---|
| C2 | Page on HOLE 11 read YOU `GREEN 140`; the play screen's line above it read `GREEN 321` with hole 16's par and card. Page on HOLE 1: `GREEN 152` under `GREEN 209` (n = 2 holes) | While the page shows a hole the round is not on, the play screen's GREEN line and par-and-card title are hidden and keep their space; the sub line ends `ROUND IS ON HOLE 16`. `screen-play.js` unchanged |
| C3 | With the LOCK tab's column reserved the YOU column fell under the picture; on hole 16 its last row ended at 739.8, below the 728 fold | With the column reserved the YOU column sits beside the picture (picture 96 px, YOU 144 px). Last YOU row bottom: hole 11 423.3, hole 15 441.2, hole 16 429.8 (Opus, n = 1 each) |

**C3 does not change his phone.** The native app never turns the LOCK tab on
(`js/app.js` 160: `if (shell()) return;` before `pocketLock.enable()`; his
word, 2026-09-16, the power button is the lock). On the phone the page has
the side-by-side layout in v35 and v36 alike. Measured by Fable with the
strip's class removed, hole 16: picture [12, 259, 150, 300], YOU column
[172, 259, 176, 161], YOU row bottoms 319 to 421, TEE column [172, 431, 176,
103], layups from 573 (n = 1). C3 matters on the web build only.

## 8. The APK, v36

| Item | Value | Whose |
|---|---|---|
| Path | `android/tracker/app/build/outputs/apk/debug/app-debug.apk` | - |
| Size, written | 9,958,707 bytes, 2026-09-29 06:17:21 | Fable |
| sha256 | `ac74fd72fedd3fef706ff11f7dcad5f058d570c1f3caeb2c66ddad3e98c55186` | Fable |
| Version | `versionName` v36, `versionCode` 3601 | Fable, `output-metadata.json` |
| `assets/js/data/build.js` | `id: 'v36'`, `date: '2026-09-29'` | Fable |
| Web files inside against the repo at `2bd29b5` | 38 text files (js, css, index.html) equal by sha256 with CRLF read as LF; 18 pictures equal byte for byte; no `js/dev/` | Fable |

Not installed. `adb devices` on 2026-09-29 listed `emulator-5554` only; the
phone was not attached.

## 9. Readings Opus made, accepted by Fable

1. Separators are the app's own: `·` and `±`, as the play screen's GREEN line.
2. The creek line breaks after the blue number and its `(your mark)`.
3. A tee layup shows on every tee set as `150 from BLUE`; it gets a point and
   a YOU number only on its own tee set.
4. The page opens from the hole navigation row down; the HUD stays above it
   (with C2 when looking at another hole).
5. On the green the YOU row reads `ON THE GREEN`, as the play screen does.
6. RESTORE after a delete reads his notes from storage, so it works after
   PLAY.
7. The fifth layup rejection is a label over 24 characters (ruling R1).

## 10. Not proven, and said so

- Nothing here has run on his phone. The page has not been used on the course.
- The YOU column was checked on simulated GPS only.
- The layup sheet was exercised by Opus and the suite; Fable did not type a
  layup by hand.
- The pictures were checked by eye on 2 of 18 holes by Fable, 3 by Opus.

## 11. Follow-ups logged, not built

1. Hole 11's three greenside bunker markers overlap on the small picture;
   they are clear with the picture filled.
2. The Round menu stays reachable while the page is open and acts on the play
   screen under it.
3. The Android back key leaves the app from the page (logged 2026-09-26, his
   call).
4. `js/app.js`'s storage-error toast says "Could not save to this device."
   for a failed read; the page has its own words for his notes (R6), the
   export does not.
5. `docs/course-map/veenker/check_answers.py` rewrites the corrections file
   from scratch and would drop hole 9's blue and gold ids.
6. `mapTeeBox` (`screen-play.js`) and `teeOrigin` answer the same question;
   one function should serve both.
7. A "to the pin" row on the page, from the pin sheet (spec follow-up 5).
8. On the web build the pocket lock comes up after about 10 s without a touch
   while the page is open, and the play screen's GREEN line does not repaint
   while locked. Not on the phone: the native app has no pocket lock.

## 12. Cost

| Run | Model, effort | Time | Sub-agent tokens |
|---|---|---|---|
| 6.1, Parts A, B, C | Opus, xhigh | 37 min | 408k |
| 6.2, Parts E, C1, D, F | Opus, xhigh | cut by a network error, resumed; time of the first leg not recorded | 583k |
| 6.3, C2, C3, v36 | Opus, high | 16 min | 208k |

n = 1 each. Weekly Fable, account-wide with other sessions live: 92 percent
at the session's first read and 93 percent 3 minutes before the 2026-09-28
17:00 Central reset; 4 percent at 05:51 on 2026-09-29. Effort xhigh from the
first message to this sign-off.
