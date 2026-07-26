# Benchmark verification — RESOLVED

**Status: verified against the source.** This file previously asked you to check my numbers against *Every Shot Counts*. That's no longer needed — I found Broadie's own paper, which publishes the benchmark table outright.

**Source:** Mark Broadie, *Assessing Golfer Performance on the PGA TOUR*, Interfaces (this version 8 April 2011). [columbia.edu PDF](https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf). Table 9 and Section 3.3. Estimated from over eight million ShotLink shots, 2003–2010.

The data now lives in [`js/analysis/tour-benchmark.js`](../js/analysis/tour-benchmark.js), read directly off the paper.

---

## What the check found

My recalled numbers were wrong, and wrong in the direction that mattered most:

| | Recalled | Actual (Table 9) | Error |
|---|---:|---:|---:|
| Tee 400 yd | 4.28 | **3.99** | +0.29 |
| Tee 500 yd | 4.80 | **4.41** | +0.39 |
| Rough 200 yd | 3.79 | **3.42** | +0.37 |
| Sand 200 yd | 3.87 | **3.55** | +0.32 |
| Fairway 100 / 200 yd | 2.80 / 3.19 | 2.80 / 3.19 | correct |

Fairway was fine. Long tee shots, rough and sand were all substantially too pessimistic — which would have made recovery from trouble look *easier* than it is and inflated the value of a good drive. That distorts precisely the off-the-tee vs approach comparison the app exists to settle.

The scratch model was wrong too: I'd assumed a 3.0-stroke gap to tour where the calibration below gives about **1.9**.

## Three things the paper settled

**1. The short-game boundary is 100 yards, and that's Broadie's own.** Section 1 defines long game as over 100 yards, short game as under 100 excluding putts. The 30-yard figure I'd noted belongs to the PGA Tour's separate "around the green" statistic. Your spec and the source agree, which means these category totals are directly comparable to Broadie's published population figures — so your friend's ~40% approach claim is testable against his data, not just assertable.

**2. Putting is a model, not a table.** The paper gives a physical one: putting error splits into an angular part and a distance part, with fitted parameters σα = 1.46°, σd = 0.057. This is better than a table because it can be refit to a different skill level from published anchors. Verified — it returns 50.4% one-putts from 8 feet against the paper's stated 50%.

**3. A scratch baseline is derivable.** The paper gives the tour tee regression (2.38 + 0.0041d) and the 90-golfer equivalent (2.79 + 0.0066d). Placing scratch on the line between them and pinning it to the published scratch value of 4.10 from a 400-yard tee gives a skill parameter **s = 0.076**. That same parameter independently implies a 72.5 scoring average — which is what a scratch golfer actually shoots. Two readings agreeing is the reason to trust it.

## What is still modelled rather than published

Flagged in the app with a "derived baseline" note on every SG figure:

- **The scratch baseline itself.** Broadie publishes tour and 90-golfer; scratch is interpolated between them.
- **Full shots and putting are calibrated separately, on purpose.** Applying one constant to both fails a check: it implies a 90-golfer one-putts 65% from 5 feet where the paper says 50%. Putting skill doesn't scale like long-game skill, and forcing one constant across both would tilt exactly the category comparison that matters. Full shots use the skill parameter; putting is refit on its own anchors.
- **The three-putt curve.** The paper's logistic coefficients don't reproduce from the text — substituting the stated values gives negative probabilities. Rather than guess at the intended parameterisation, it's a power law fitted to two stated facts (average is exactly two putts at 33 ft; three-putt probability first exceeds 10% at 40 ft). Good inside 50 feet; overshoots slightly beyond (26% at 60 ft vs ~23% on the paper's figure).

## Acceptance tests

Every published anchor is asserted in the test suite. If a change breaks one, the change is wrong — the right-hand side is a quoted fact.

| Anchor | Paper | Model |
|---|---:|---:|
| Tour one-putt from 8 ft | 50% | 50.4% |
| Tour average putts from 33 ft | 2.00 | 2.0000 |
| Tour 3-putt reaches 10% at | 40 ft | 40 ft |
| 90-golfer one-putt from 5 ft | 50% | 50.0% |
| 90-golfer average putts from 19 ft | 2.00 | 2.0000 |
| Tour tee, 400 yd | 3.99 | 3.990 |
| Scratch tee, 400 yd | ~4.10 | 4.098 |

Fitted angular error comes out at 1.46° tour → 1.53° scratch → 2.69° for a 90-golfer. Nothing forced that ordering; it falls out of the anchors.

---

## One thing to know before reading your first round card

**Strokes gained is measured against distance, not against par.** Broadie's tee benchmark depends only on how far the hole is, so on Veenker's gold tees (6,029 yards) the benchmark expects better than par — a 473-yard par 5 carries an expectation of about 4.4 strokes, because by tour-data standards that is a long par 4.

The practical consequence: **shooting level par at Veenker off the golds will show as roughly −2.5 strokes gained**, and that is correct, not a bug. A scratch golfer would be expected to shoot around 69–70 on a course that short. Judge yourself on the trend and on which category is leaking, not on whether the total is positive.

This also means gold and blue rounds are not directly comparable on total SG. The category *ranking* is far more stable across tee sets than the total.
