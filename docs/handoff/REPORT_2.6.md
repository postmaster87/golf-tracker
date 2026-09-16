# REPORT 2.6 - The lie card fits the phone (build v26)

Opus, 2026-09-16, spawned by Fable for one job. Tree at `e5f55fb`, clean, at
the spawn. His words on it:

> "If the bottom row is cut off, v25 stays off the course and the numbers come
> back here." (the phone check, `docs/handoff/NEXT_CHAT_2026-09-15.md`)

and this morning, with the photograph of v25 on hole 10 with the lie card up:

> "3. Build it."

## 1. The answer, in plain words

**The bottom row was cut because his phone gives the app a 728 px page, not
the 780 px screen v25 was measured against. v26 gives the lie grid 54 px back
and it now clears the footer by 25 px on that 728 px page.**

Nothing was taken out of the footer. MARK SHOT, ENTER PUTTS, ENTER YARDAGES,
MARK CUP, PENALTY and UNDO are all still there, in the same order. They are
shorter: MARK SHOT 88 -> 80 px and the three below it 60 -> 52 px, the gaps
between them 14 -> 12 px, and the lie card's own padding 6 px tighter. MARK
SHOT is still the biggest control on the screen by 28 px, and nothing is
smaller than 48 px, which is the smallest target Android will call a target.
The 16 px dead zone between PENALTY and UNDO - the pair a wet thumb must never
confuse - is untouched.

**One state is still short of the fold**, Section 6: if a shot is marked while
the hint reads *"On the green: MARK CUP when you walk behind the hole, then
enter the putts."* that sentence wraps to three lines and takes 38 px off the
body, leaving the bottom row 11.5 px short. It needs a shot already marked
GREEN, no cup yet, and MARK SHOT pressed instead of MARK CUP. Under v25 the
same state was 56 px short. The fix is to shorten that sentence and the "Cup
marked" one, and those are his words, so they are his call.

## 2. Why the screen is not the page (n = 1 photograph, read in pixels)

The S26 is 1080 x 2340 at density 480 and `font_scale` 1.0, which is 360 x 780
CSS px - the size REPORT 2.4 passed v25 at, with 24 px to spare. But Android
keeps the top and bottom of that screen for itself. Sampling the photograph
down its left edge (`PIL`, the original 1080 x 2340 file):

| device px | what is there | CSS px |
|---|---|---|
| 0 - 110 | status bar, painted with the `theme-color` `#f2efe4` | 0 - 37 |
| 111 | the hud's surface starts - the top of the page | page y = 0 |
| 291 - 293 | the hud's bottom border | hud is 61 tall |
| 504 - 506 | the hole nav's bottom border | hole nav is 71 |
| 1004 - 1006 | **the footer's border-top** | body bottom = 297.7 |
| 2295 | the gesture bar - the bottom of the page | page = 728 tall |

So the page is `(2295 - 111) / 3 = 728` CSS px. The check that says the reading
is right: the footer measures **430.3 px** on that photograph, against **430.3
px** measured here at 360 px wide under v25. Two independent numbers, one
layout.

728 - 61 hud - 71 hole nav - 430 footer leaves a **167 px body** for a 140 px
lie grid that starts 56 px down: **29 px short**, which is what the photograph
shows - the SAND / RECOVERY / GREEN row cut at about its middle.

REPORT 2.4 called this, exactly: *"There are 24 px to spare at 360 x 780 on the
PC; if your phone's page is more than 24 px shorter, the SAND / RECOVERY /
GREEN row will be cut."* It is 52 px shorter.

The photograph is v25: the card is first in the body with no banner above it,
and the lie label is one line at 13 px - both are v25's doing, and the footer
height matches v25's to a third of a pixel.

## 3. The test that was green while his phone was cut

The fold test added in 2.2 and passed in 2.4 was passing on a layout no phone
has. `.footer` is clamped to `max-height: 78dvh`, and `dvh` is **0** in a
hidden browser pane - the same zero that made `zoneOf` misread the lock zones
in 2.2. Clipped to zero, the footer collapsed to its 19 px of padding, the body
took the other 400 px, and the test read a body bottom of **709 px at 360x728**
where a phone reads 298.

`test/run.js` now restates that clamp from the harness's own page height, and
the numbers it reads match the phone: body bottom **297.72** in the harness
against **297.7** off the photograph.

## 4. Suite

`http://localhost:8123/test/` (`tools/devserver.py 8123`), browser pane
fronted, viewport emulated at 375x812 for runs 2-4.

| run | tree | result |
|---|---|---|
| 1 | v26, no emulation | **516 / 516** |
| 2 | v26, 375x812 | **516 / 516** |
| 3 | mutation: `css/base.css` from `e5f55fb` (v25) under the v26 tests | **515 / 516** - exactly "at 360x728 the whole lie grid is above the footer when the burst ends": *"the lowest lie button ends at 326 px, the body at 298 px (28 px below the fold)"* |
| 4 | v26 restored | **516 / 516** |

516, not 511: the fold and movement tests are now run at three page heights
instead of two screen heights. No test is RED on purpose. "The deliberate
gesture unlocks" passed on every run.

## 5. The numbers, before and after (suite harness, lock strip reserved)

Measured with the previous mark's "marked - UNDO" banner up, which is the case
that moved the grid 78 px before v25. n = 1 run per size per suite run; the
values below repeated to the pixel across runs 1-4.

| page | v25 grid | v25 body bottom | v25 spare | v26 grid | v26 body bottom | **v26 spare** |
|---|---|---|---|---|---|---|
| 375 x 791 | 187.2 - 327.2 | 360.7 | +33.5 | 177.2 - 317.2 | 405.2 | **+88.0** |
| 360 x 759 | 187.2 - 327.2 | 328.7 | +1.5 | 177.2 - 317.2 | 373.2 | **+56.0** |
| 360 x 728 (his phone) | 187.2 - 327.2 | 297.7 | **-29.5** | 177.2 - 317.2 | 342.2 | **+25.0** |

The grid moved **0.0 px** between the running card and the saved card at every
size, under both builds. Every lie label fits its button (0 px spill) and the
rightmost button ends at 257 px with the lock strip starting at 274.

The two heights the job named - 759 and 791 - are a 21 px status bar and no
gesture bar. 728 is what his phone actually gives the app, so that is the size
this is built to; 759 passed under v25 by 1.5 px, which is why it could not be
the bar.

## 6. What was clicked, at 360 x 728 in the real app

`?sim=1`, one tab, Veenker back nine, **hole 10, par 5, 473 yd** - the hole in
his photograph. Auto-lock pushed out, LOCK tab up (`has-lock-tab` on, tab at
x = 284). Tee shot marked, then shots 2, 3, 4 and 5 marked and lied (FAIRWAY,
ROUGH, SAND), each new mark pressed while the previous mark's banner was still
up. n = 3 measured bursts.

| | reading |
|---|---|
| footer | 385.6 px (430.3 under v25) |
| body | 131.3 - 342.4 |
| lie grid | 176.2 - 316.2, running card and saved card identical (moved 0.0 px) |
| spare below the grid | **26.3 px** |
| rightmost lie button | 253.3, lock strip starts at 274 |
| label spill | 0 px |
| hint | "At your ball: MARK SHOT 6.", one line, 18.9 px |

The tee shot's burst has no lie grid at all - the tee lie is known, nothing is
asked - so the two-line tee hint costs nothing.

### The hint is the one thing in that footer whose height is not fixed

At 360 px with the lock strip reserved, measured in the app:

| hint | lines | body bottom | spare under the grid |
|---|---|---|---|
| "At your ball: MARK SHOT 3." | 1 | 342.4 | **+26.3** |
| "Hole 10 is done. Move to hole 11." | 1 | 342.4 | +26.3 (no card in this state) |
| "On the tee: MARK TEE SHOT before you hit." | 2 | 323.6 | +7.4 (no lie grid in this state) |
| "Cup marked. Putt out, then enter the putts and how long the first one was." | 2 | 323.6 | **+7.4** |
| "On the green: MARK CUP when you walk behind the hole, then enter the putts." | 3 | 304.7 | **-11.5** |

## 7. What changed

| file | change |
|---|---|
| `css/base.css` | new `.screen.play` block: footer gap 14 -> 12, footer padding-top 8 -> 6, hint margin-bottom 4 -> 0, footer buttons 60 -> 52 / primary 76 -> 64 / huge 88 -> 80; body padding-top 12 -> 8. Capture card padding 10 -> 8, lie field padding 6/8 -> 4/6, lie label margin 6 -> 4 |
| `js/ui/screen-play.js` | the screen root is `screen play`, so the above is the play screen only |
| `test/run.js` | the harness restates the footer's `78dvh` clamp from its own page height (Section 3); the group runs at 375x791, 360x759 and 360x728 instead of 375x812 and 360x780 |
| `js/data/build.js` | `BUILD.id` v25 -> **v26**, date 2026-09-16 |
| `sw.js` | `gt-shell-v25` -> `gt-shell-v26` |

`REVISION` is untouched - that is his call when a build is about to be played.
Nothing in `js/gps/`, `js/util/geo.js`, `js/data/schema.js` or `js/analysis/`
was touched, and the pocket lock, the marks, the hole windows and round save
are as v25 left them.

## 8. His call

1. **The push.** Not taken. v26 is committed and not pushed.
2. **The two long hints.** "On the green: MARK CUP when you walk behind the
   hole, then enter the putts." wraps to three lines at 360 px and costs the
   bottom row 11.5 px in the one state that can show it with a card up; "Cup
   marked. Putt out, then enter the putts and how long the first one was."
   wraps to two and leaves 7.4 px. Shorter sentences fix it outright; they are
   his words, so nobody else shortens them.
3. **One photograph after the push**, the same one as before: MARK TEE SHOT,
   wait for "Tee shot marked", MARK SHOT 2. All six lies should be clear of the
   footer with about a finger's width of the card's "Captured" line showing
   under them. If any of it is cut, the number to send back is what the page
   height is, and the build stays off the course.