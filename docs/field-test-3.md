# Field test 3 — 2026-08-16

Veenker Memorial, front nine, gold tees. Rev 2. Played with Matt's golf buddy,
who is also called Matt.

**The first build that survived a whole round.** Rev 0 and rev 1 were both cut
short; this one was played to the ninth green and exported.

---

## What the instrument did

| | |
|---|---|
| Track | 7,858 fixes over 143.9 min, median gap 1.0 s |
| GPS accuracy | median **3.1 m**, p90 3.8 m, worst 77.6 m |
| Gaps > 20 s | **16**, largest 11 min and 7 min |
| Marks flagged poor | 0 |

**The GPS is validated.** This is the first field evidence the project has ever
had — until now `docs/HANDOFF.md` said "unit-tested, NOT field-validated."

Matt's lasered yardages against the app's mark-to-cup distance:

| Hole | Lasered | GPS | Δ |
|---|---|---|---|
| 1 | 180 | 176.9 | −3.1 |
| 2 | 60 | 51.3 | −8.7 |
| 3 | 110 | 107.2 | −2.8 |
| 4 | 115 | 117.9 | +2.9 |
| 5 | 160 | 163.2 | +3.2 |
| 6 (par 3) | 185 | **185.2** | **+0.2** |

Median disagreement ≈ 3 yards, and the median GPS accuracy is 3.1 m = 3.4 yards.
**The disagreement is entirely explained by GPS noise.** His verdict: *"the
accuracy of the GPS readings and the my lasered numbers agreed. And i mean
agreed!"*

The 16 gaps are the phone's hardware lock suspending the page — he confirmed he
defaulted to it because the app's lock button was not to hand. See the rev 3
backlog in `REVISIONS.md`.

---

## The card

**40 (+4)** · 14 putts · 4 one-putts · **zero three-putts** · 2 penalties
· GIR 2/9 · fairways 2/7 · **scrambling 4/7**

Two greens hit and still +4, because he got up and down four times from seven
and never three-putted. *"My moto is no 3 putts but 1 putt better."*

### Strokes gained vs the derived scratch baseline

| Category | SG |
|---|---|
| Putting | **+0.19** |
| Short game | −0.74 |
| Approach | −1.08 |
| Off the tee | **−3.87** |

**Zero unattributed strokes** after correction.

---

## What this does and does not say about the hypothesis

The app exists to settle one question: is Matt losing more strokes off the tee
(his hypothesis) or on approach (a friend's)?

**One nine does not settle it.** Seven tee shots. Do not report this as a
verdict.

What it does say, and this is the useful part: **both penalty strokes were on
tee shots, and they are the entire gap.** Remove them and off-the-tee is −1.87,
level with approach. His driver, when it finished in play, went 261 / 255 / 236
yards — and with cart-path-only after a very wet week in Ames, those totals are
close to carry.

So the leak is **dispersion, not distance** — two tee shots he never played
again. That is a different practice session from "work on your driver."

The number to watch over the next three or four rounds is **penalty strokes off
the tee**. If it holds, his hypothesis is right and the mechanism is dispersion.
If it goes to zero and driving settles near −1.9, both of them are arguing about
the wrong thing.

---

## Four errors found, and what each one teaches

All four were **attribution** errors — the app hanging data on the wrong object.
None were measurement errors. The hard part worked.

1. **Hole 7: the penalty was on the wrong shot.** He hit a 3-hybrid into the
   creek off the tee, but the penalty landed on shot 2 — the 3 wood from the drop
   zone — because `openPenalty` attaches to whatever shot is last when the button
   is pressed. This took a stroke *off the tee* and charged it to a fairway wood,
   which is precisely the line the whole app is trying to measure across.
2. **Hole 8: the cup was marked on the tee.** Not a GPS failure — 1.8 m accuracy,
   8 samples, quality "good". The timestamps tell it: tee shot at 23:09:19.658,
   cup at **23:09:22.898**. 3.2 seconds later, from the same spot. MARK CUP sits
   directly beneath the shot button in the footer.
3. **Hole 8: the bunker shot was logged as a putter.** It was a sand wedge.
4. **Hole 9: the lost-ball penalty was never recorded.** His score was a stroke
   light all evening.

### Recovering hole 8's cup

Worth writing down because it is the yardage feature paying for itself. The cup
was recovered from two independent constraints: Matt's lasered **158 yards** from
the tee, and the dense track. The point where he stood to pick the ball out reads
**158.2 yd from the tee** and 1.5 ft from his ball mark — matching both the laser
and his account of hitting the bunker shot *"to a foot or 2"*.

**This is what three lasered yardages on a hole buy you**: the pin becomes
solvable from the track alone, so GPS error is measurable without any surveyed
reference — and a corrupted mark is recoverable after the fact.

---

## Missing data flatters the player

`docs/HANDOFF.md` section 5 predicted this as an inference, never confirmed with
Matt. Field test 3 confirms it, and it is measurable:

| | Putting SG |
|---|---|
| With 4 strokes unattributed | +0.52 |
| Hole 9's first putt filled in | +0.26 |
| Hole 4's first putt filled in | **+0.19** |

Every gap that closed took something off his best category. Nothing was added by
closing them. **A third of a stroke of flattery on one nine**, and it all sat in
the category he already believed was a strength.

This is the argument for mandatory stats before a round can be saved, and it is
his own round making it.

---

## What he said about playing it

> "I was playing well. If not for the tracker I would have shot under par! it was
> annoying"

The annoyance was **not** the GPS and not the accuracy. It was:

- **"Mark shot 1"** — *"is the the spot where I am teeing off from or where shot
  one landed? Do you see the confusion this created"*. The same ambiguity field
  test 1 raised. Fixed the same evening by naming the tee shot.
- **The lock screen.** See the rev 3 backlog.
- **Too much on the green** — *"that is a lot of interaction that we need to
  eliminate"*. Fixed the same evening: the green is now a cup mark.

He stopped entering lasered yardages after hole 5. Not diagnosed — ask.
