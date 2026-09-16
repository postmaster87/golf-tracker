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
---

## 9. v27: the hints

Matt, 2026-09-16, on the residual in Section 8 item 2: **"shorten it and
push."** Built at `193eb00`, tree clean at the spawn.

### The two strings

| | before | after |
|---|---|---|
| on the green | `On the green: MARK CUP when you walk behind the hole, then enter the putts.` | **`On the green: MARK CUP, then putts.`** |
| cup marked | `Cup marked. Putt out, then enter the putts and how long the first one was.` | **`Cup marked. Putt out, then the putts and how long the first was.`** |

Nothing else moved. No CSS was touched — the footer, the card and the lie grid
are as v26 left them; only the sentence above them is shorter.

### What it is worth, measured in the app at 360 x 728

`?sim=1`, one tab, viewport emulated 360 x 728, hole 10 par 5 473 yd — the same
hole and the same page height as Section 6. Footer **385.6 px**, body
131.3 - 342.4, lie grid bottom **316.2**, all identical to Section 6, so the
only variable is the hint. The hint is 246 px wide with the lock strip
reserved; each line is 18.9 px. n = 1 run per string, the four strings swapped
into the same live footer back to back.

| hint | lines | spare under the lie grid |
|---|---|---|
| old, on the green | 3 | **−11.5 px** — the bottom row under the footer |
| **new, on the green** | **1** | **+26.3 px** |
| old, cup marked | 2 | +7.4 px |
| **new, cup marked** | **2** | **+7.4 px** |

So the state that was 11.5 px short now clears by **26.3 px** — the same number
the "At your ball: MARK SHOT 6." state reads in Section 6, which is the best
this layout gives. The rightmost lie button still ends at **253.3 px** against
a strip starting at 274, and label spill is **0**.

**The one-line budget is 246 px, about 35 characters.** Fable's suggested
`On the green: MARK CUP, then the putts.` (39) measures two lines; dropping
"the" is what buys the line. `MARK CUP behind the hole, then putts.` (37) is
also two lines — the capitals are wide — so "walk behind the hole" could not
be kept at any length and is what went.

### Why the "cup marked" hint stayed at two lines

One line is reachable (`Cup marked. Putt out, then the putts.` measures 18.9 px
and +26.3) but only by dropping *how long the first one was*, and that is the
one thing on that screen he has to notice **before** he picks the ball out —
the putts entry asks for the first putt's length after the fact. The job
allowed two lines for this hint because there is no state that shows it with a
lie grid under it; at two lines it costs the same 37.8 px the old one did, so
nothing was given up to keep it. It is shortened from 74 to 64 characters, in
his words.

### The test

`test/run.js`, the fold group. The helper now plays one more move at each of
the three page heights: shot 2's lie answered **GREEN**, then **MARK SHOT 3**
pressed instead of MARK CUP — the one state that puts the "on the green" hint
on screen with a capture card under it — and a new assertion per size holds the
whole lie grid above the body's bottom edge under that hint.

**Proven against the defect first.** With `js/ui/screen-play.js` mutated back
to the two old strings and nothing else changed, the suite reads **518 / 519**,
failing exactly one test:

> at 360x728 the longest hint still leaves the whole lie grid above the footer
> — under "On the green: MARK CUP when you walk behind the hole, then enter the
> putts." the lowest lie button ends at 317 px, the body at 304 px (13 px below
> the fold)

375x791 and 360x759 stay green under the old strings (the hint is 2 lines at
375 px and the 759 page has 18.2 px to give), which is why 728 is the size the
group is held to.

### Suite

`http://localhost:8123/test/` (`tools/devserver.py 8123`), browser pane
fronted.

| run | tree | viewport | result |
|---|---|---|---|
| 1 | v26 at `193eb00`, before the change | 360x728 | **516 / 516** |
| 2 | v27 | 360x728 | **519 / 519** |
| 3 | mutation: the two old strings back in `screen-play.js` | 360x728 | **518 / 519** — the new test at 360x728, and only it |
| 4 | v27 restored | 360x728 | **519 / 519** |
| 5 | v27 | 375x812 | **519 / 519** |

519, not 516: the new assertion runs at each of the group's three page heights.
No test is RED on purpose.

### What changed

| file | change |
|---|---|
| `js/ui/screen-play.js` | `nextStepHint()`: the two hint strings above, and a comment saying why the "on the green" one has to stay one line |
| `test/run.js` | the fold group plays GREEN then MARK SHOT and asserts the lie grid is above the fold under the longest hint, at all three page heights |
| `js/data/build.js` | `BUILD.id` v26 -> **v27**, date 2026-09-16 |
| `sw.js` | `gt-shell-v26` -> `gt-shell-v27` |

`REVISION` is untouched. Nothing in `js/gps/`, `js/util/geo.js`,
`js/data/schema.js` or `js/analysis/` was touched, and no CSS was touched.

### His call

1. **The push.** Not taken — v27 is committed and not pushed.
2. **The one photograph** from Section 8 item 3 still stands, and it is now
   worth one more tap: after MARK SHOT 2, answer the lie **GREEN** and press
   MARK SHOT 3. The hint should read *"On the green: MARK CUP, then putts."* on
   one line with all six lies clear of the footer.
