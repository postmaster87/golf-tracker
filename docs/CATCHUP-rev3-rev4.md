# Catch-up: revisions 3 and 4

**Written 2026-08-24 for a session starting cold.** Everything needed to hold a
useful conversation about this project is in this file; nothing below requires
reading the repo first, though file paths are given so claims can be checked.

Same standard as `docs/HANDOFF.md`: **every quotation is verbatim** from Matt,
**every number was measured** rather than recalled, and **every inference is
labelled as one**. Where something is unproven it says so.

---

## 1. What the project is

A GPS shot-by-shot golf tracker. Plain ES modules, no build step, no
dependencies, served as static files from GitHub Pages. It runs on Matt's phone
as a PWA and works offline.

It exists to settle **one question**: is Matt losing more strokes off the tee
(his hypothesis) or on approach (a friend's)? Everything else is in service of
that, which is why data provenance is treated as seriously as it is.

**Where it stands right now:** revision 4, build **v19**, 458 tests passing,
deployed at `https://postmaster87.github.io/golf-tracker/`. Deploying is
`git push origin main`; Pages serves the repo root.

**Two numbers, deliberately distinct.** `REVISION` marks *a build that went to
the course* and stays put across many deploys. `BUILD.id` changes every deploy
and matches the service worker's cache name (a test enforces that they agree).
Settings shows both, with a CHECK FOR UPDATE button that fetches the deployed
build id and compares.

---

## 2. How Matt works, and what that means for you

He is an engineer, plays regularly, and is the only user. He is direct, decides
fast, and will tell you when you are wrong — take that at face value rather than
hedging around it.

Things learned the hard way:

- **He stops work that skips ahead.** There is a stated agenda in his own words:
  *"lets hone down the tracking and then move to the after hole entry, and then
  how we handle a mislog, forgotten phone in the cart, etc... after those"*.
  Items 1 and 2 are built; item 3 is not started.
- **Interaction cost is the dominant design constraint.** Field test 2 was
  abandoned mid-round: *"I shut it down because it was getting in the way of my
  play"*. Field test 3: *"I was playing well. If not for the tracker I would
  have shot under par! it was annoying"*.
- **He supplies ground truth.** Lasered yardages, corrections, and narrative
  accounts of what actually happened. Several bugs below were found only because
  he described the sequence precisely.
- He turns model effort up and down and will say when. Analysis of a round's
  track is the expensive part.

### Design rules that keep being load-bearing

1. **Measured and inferred data are never silently mixed.** Anything derived
   carries provenance — `source: 'track'`, `method: 'paces'`, `inferred`,
   `lieInferred` — and the UI says so.
2. **Propose and confirm, never detect and fill.** He knows his score; the app's
   job is ranking candidates, not unsupervised detection.
3. **Nothing is guessed into course data.** A missing rating is null, not a
   plausible number.
4. **Quarantine is a filter, not an act of memory.** Bad data must label itself.

---

## 3. Revision 3 — built, never played

Everything field test 3 asked for. It was superseded by rev 4 before it reached
a course, because field test 4 needed a course rev 3 did not have.

**No round will ever carry `revision: 3`, and that is recorded rather than
tidied away** — a number is never reused or shared by two builds, so a skipped
one is written down. Tagged `rev3` at `f21ca9c` and still recoverable.

Note this departed from the project's own rule (bump when a build is about to be
played, which would have kept it rev 3). Matt chose the new number; the
departure is recorded in `js/data/revision.js` rather than rationalised.

What rev 3 contained, all of which is in rev 4:

- **A floating LOCK tab.** Field test 3 was played start to finish without the
  old header glyph ever being found, and the track showed 16 gaps where he used
  the phone's hardware button instead. The tab hugs the right edge at thumb
  height, on every screen, and locks on `pointerdown`. It **reserves its own
  strip** rather than floating over the action stack — the first version sat on
  top of MARK SHOT, which would have been the cup mistake in a new place.
- **Auto-lock 15 s → 30 s** (via 120; Matt chose 30), with a migration that
  reaches phones already carrying the old value.
- **The cup control is gated on being on the green.** Hole 8 of field test 3 had
  its cup marked *on the tee*, 3.2 s after the tee shot, because MARK CUP sat
  directly beneath MARK TEE SHOT. It now renders only once a ball is marked on
  the green, so on the tee there is no cup button to mis-tap.
- **Every mark states itself with UNDO attached.** UNDO existed all round and he
  never saw it; it now comes to him rather than waiting to be found.
- **Penalties attach to a chosen shot.** Hole 7 charged a tee-shot penalty to a
  fairway wood because the sheet took whatever shot was last.
- **A gaps gate before a round can be saved.** Field test 3 finished with 4 of 40
  strokes unattributed, and filling them in afterwards moved his putting from
  +0.52 to +0.19 — *every* gap that closed took something off his best category.
- **End-of-hole entry (agenda item 2).** Enter the score; the track proposes
  where the shots were played from, with the evidence for each.

---

## 4. Revision 4 — current, played twice

Rev 3 plus a second course, plus everything since.

- **Radcliffe Friendly Fairways** (Radcliffe, IA; 9 holes, par 36, white 3,125 /
  red 2,745). Per-hole pars and yardages reconcile exactly against the totals the
  course publishes. Stroke indices are not published anywhere found and are
  therefore null.
- **Shotgun starts.** The starting hole is a setup control, and it **rotates the
  holes array** rather than moving an index — so "next hole" and "last hole"
  follow the order actually played.
- **Scramble as a quarantine.** Not a third format to analyse: in a scramble the
  swings are real but the ball is not his and the score is the team's, so the
  round is excluded from strokes gained and trends *under every filter*, and the
  summary renders no analysis cards at all.
- **Missing tee shot: live nudge + recovery.** Leaving a tee without marking now
  says so once per hole and offers to back-fill from the track (0.5 m in the
  simulator).
- **The cup, described in paces.** A pin-sheet entry — so many paces on from the
  front edge, so many left or right of centre — read along the line of play.
  Cross-checked against where the track says he picked the ball out, and the
  agreement is shown on screen. Verified against a known cup at 1.0 m.
- **Per-course tees**, because `settings.teeSet` was one global value and Veenker
  also has a white tee, so returning from Radcliffe would have played 5,323 yards
  instead of 6,029 with nothing flagging it.
- **Build number in Settings**, described above.

---

## 5. The field tests

| | date | where | format | track | GPS median |
|---|---|---|---|---|---|
| FT1 | 2026-07-26 | Veenker | stroke play | — | — |
| FT2 | 2026-08-02 | Veenker | stroke play | — | — |
| FT3 | 2026-08-16 | Veenker front 9 | stroke play | 7,858 fixes / 144 min | 3.1 m |
| FT4 | 2026-08-22 | Radcliffe | **scramble** | 11,393 fixes / 181 min | 3.2 m |
| FT5 | 2026-08-23 | Veenker back 9 | stroke play | 9,358 fixes / 129 min | 3.0 m |

**The GPS is settled.** Median accuracy is 3.0–3.2 m across three instrumented
rounds on two courses. Field test 3 checked it against Matt's laser on six
holes: median disagreement ≈ 3 yards, entirely explained by GPS noise. His
verdict: *"the accuracy of the GPS readings and the my lasered numbers agreed.
And i mean agreed!"*

**Track gaps are the remaining instrument problem.** FT4 lost 16.7 min of 181;
FT5 lost 20 min of 129 (15%). Causes are the phone's hardware lock **and
switching apps to change music**. There is no fix available: a web page cannot
hold the receiver while another app is in front, and no web API provides
background location. The app recovers correctly on return, and the round summary
now reports the lost time so the cost is at least visible.

FT5 card: **41 (+5)**, 15 putts, no penalties. Strokes gained off the tee
**−2.92**, short game −1.90, approach −1.55, putting −0.73. FT3 also had off the
tee as the largest leak. *Inference, not a verdict:* two rounds point the same
way, which is not enough to settle his hypothesis.

---

## 6. The open question: can the app tell when he hit a shot?

This is the live problem and the most interesting thing to talk to him about.

**Finding the positions is solved.** In FT5, **23 of 23** true shot positions had
a stop candidate within 10 m, median miss **3.1 m**. In FT4, 18 of 18 within
15 m. The track contains every place he played from.

**Choosing which stops were shots is not.** Measured on both rounds, with hole
windows corrected:

| scoring | FT4 scramble | FT5 stroke play |
|---|---|---|
| **current (shipped)** | 9/18 (50%) | **4/23 (17%)** |
| dwell only | 12/18 (67%) | 15/23 (65%) |
| dwell + departure | **13/18 (72%)** | **15/23 (65%)** |

**The shipped ranking is inverted on stroke play** — real shots score a median
0.2, everything else 0.4. Two measured mechanisms:

- **`departureM` carries no signal when someone rides along.** 22.8 m at real
  shots vs 23.7 m elsewhere in FT5. The feature means "how far the ball went",
  but with a passenger the cart's next stop is *the passenger's ball*, a short
  hop away. It is the most heavily weighted term in the model.
- **Dwell separates but is credited backwards.** 53.4 s at real shots vs 18.4 s
  elsewhere; the model credits 6–45 s, so real shots earn nothing and the noise
  sits inside the credited band.

**Status: not changed, awaiting Matt's call.** He said "let me think on this".
Worth knowing that a dwell finding was raised once before after FT4 and
**withdrawn** — that round's long dwells turned out to be him driving back to
mark tee shots he had forgotten, which is logging behaviour, not shot signature.
The finding above is stronger because FT5 has no drive-backs (the tee nudge
handled them) and the two rounds are different formats, but it is still n=41
shots across 2 rounds.

The honest framing: propose-and-confirm survives a mediocre ranking, since a
wrong proposal costs one tap. Auto-fill would not.

---

## 7. Bugs worth knowing about

Each of these was found from real data, and most were invisible until then.

**The capture panel never updated.** `updateCaptureUI` looked its targets up
with `body.querySelector('.cap-meta')` while the panel is appended to `footer`.
Both lookups returned null, both sat behind `if (bar)` / `if (meta)`, so the
function did nothing — for every capture the app had ever taken. The bar never
moved and the panel read "Capturing…" forever, including long after the burst
finished and the shot was one lie tap from saved. A tee shot hides it entirely
because a tee shot commits itself. Matt: *"multiple times I hit mark shot and it
hung (app said capturing shot) and it did not log it. I had to refresh the app
and then remark the shot."* The track proved the receiver never stopped — 782
fixes, continuous, across the failure. Fixed by handing element references over
instead of looking them up.

**`completedAt` meant "last touched", not "finished".** `setGreenEntry` stamped
`now` on every write, so editing putts after a round rewrote it. Six FT5 holes
carry a `completedAt` *later than the round ended*, hole 11 by 112 minutes.
Hole windows read off it, giving hole 14 a ninety-minute window with 99 stops —
which is what produced the 13% figure before the fix. Windows are bounded by
marks now.

**The course model poisoned itself.** `learnTee`/`learnCup` fold marks into a
running mean that cannot be subtracted. Twenty-two development sessions logged
at a desk left Veenker's learned 1st and 10th tees **23.6 km apart**, which made
the starting-nine check fire on every single round — Matt: *"Veenker Tees are
close enough it asks me every time."* Clustering does not rescue it: the largest
cluster of hole-1 tee marks is a desk. What separates real rounds is whether
they were *played* — real ones finished 5–9 holes over 93–181 minutes, every
polluting one finished one hole or none. Now: only played rounds teach, marks
that contradict the model are refused, and every round end rebuilds.

**A wrong starting hole was silent.** FT4's second nine was set to hole 7 and
actually started on 8, filing every mark under the wrong number. Now checked
against the learned tees, with guards so it stays quiet unless decisive.

**Two vacuous tests**, both caught by deliberately reintroducing the bug. Worth
repeating that habit: a test written for a subtle bug should be *proven* to fail
against it.

---

## 8. What is open

- **The ranking re-tune.** Matt is thinking. Evidence in section 6.
- **Agenda item 3** — mislogs and the forgotten phone in the cart. Next in his
  order now item 2 is built.
- **Track gaps from app-switching.** No web fix; a native wrapper would solve it.
- **Penalty cause tagging** (execution vs conditions) — his idea, unbuilt.
- **Firestore sync.** `SPEC.md` step 4. The current workflow is download, email,
  upload, per round. His verdict on that: *"This is stupid."*
- **A field-test-5 write-up** does not exist yet; FT3 has one at
  `docs/field-test-3.md` as the model.

---

## 9. Where things live

| | |
|---|---|
| `docs/REVISIONS.md` | The ledger. Rev 0–4, what each was, what each field test found. |
| `docs/HANDOFF.md` | Older, still accurate on design rationale and Matt's verbatim words. |
| `docs/field-test-3.md` | The model for a field-test write-up. |
| `js/data/revision.js` | `REVISION`, history, and why rev 3 was skipped. |
| `js/data/build.js` | `BUILD.id`, kept equal to the sw.js cache by a test. |
| `js/round/track-analysis.js` | Stop detection, first-putt recovery, pin-from-paces. |
| `js/round/round.js` | Round logic, course learning, hole windows. |
| `js/ui/screen-play.js` | The play screen. Large; most UI work happens here. |
| `test/run.js` + `test/index.html` | 458 tests, run in the browser at `/test/`. |
| `docs/golf-tracker-*.json` | Exports. `*.corrected.json` has FT5 hole 10 shot 3 fixed. |

**Serving:** `python tools/devserver.py 8123`, then `http://localhost:8123/`.
Not `python -m http.server` — it sends no cache headers and a test run can pass
against code that has already been deleted. That happened once.

**Tests run in a browser**, not Node. Open `/test/index.html`.
