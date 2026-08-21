# Revisions

Numbering starts at **0**, the way Matt indexes projects at work.

## What a revision is

**A build that goes to the course.** Not a release, not a commit, not a feature.

That boundary is the one worth numbering because this app's whole purpose is a
data question — is Matt losing more strokes off the tee or on approach? When two
rounds disagree, the first thing you need to know is whether the same instrument
recorded them. Field test 2 is the case in point: his verdict on that data was
*"I missed logs so this data is not correct"*, and quarantining a bad round
should be a filter, not an act of memory.

## Where the number lives

| Place | What it does |
|---|---|
| [`js/data/revision.js`](../js/data/revision.js) | **Source of truth.** `REVISION` and the history table. |
| Every round record | `round.revision`, stamped at creation, never rewritten. |
| Round index (`gt:app`) | Carried in the summary, so History can filter without loading rounds. |
| Export JSON | `exportedByRevision` on the file; each round keeps its own. |
| Home screen | Footer line: `rev 3 — Reachable lock… · not yet played`. |
| Round summary | Data-quality card: `Recorded by rev 3 — Reachable lock…` |
| Git | Tag `rev0`, `rev1`, … on the commit that was played. |

`APP_VERSION` in `schema.js` and `version` in `package.json` both read `1.0.0`
and have never been bumped. They are vestigial — **the revision is the number
that means anything**. They are left alone rather than removed because they are
persisted in existing round records and in the one export that exists.

## How to bump it

1. Add the new entry to `REVISION_HISTORY` in `js/data/revision.js` with
   `shipped: null`, and set `REVISION` to it.
2. Play a round on it.
3. Set that entry's `shipped` date and `commit`, then tag it:
   `git tag rev2 <sha>`.

Do not bump twice for the same round of golf, and never reuse a number.

Rounds recorded before rev 2 carry **no** stamp and render as "unstamped". The
app deliberately does not guess which build produced them — see the note in
`migrate()`. The dates below are the boundary if you ever need to attribute one
by hand.

---

## rev 0 — First build

`c39078e` · played **2026-07-26** (field test 1)

GPS shot marking, strokes gained, Broadie benchmarks, trends, offline shell.

**Outcome:** cut short. Ghost touches and screen zoom made it hard to use, and
Matt could not run it long enough to judge the UI — treat field test 1 as a
partial signal.

## rev 1 — Usable on a phone, in a cart

`8fd45af` · played **2026-08-02** (field test 2)

Pocket lock (two taps, his suggestion), zoom killed, orientation locked, free
hole navigation, full post-round editing, optional club tracking, nine palettes,
required-field boxes instead of pre-selected defaults, paces dropped for feet,
cup marked *before* putting, putts sheet opening on the green mark.

**Outcome:** shut down mid-round. *"I shut it down because it was getting in the
way of my play not that it wasn't working but I missed logs so this data is not
correct."* The export from that round is embargoed pending Matt's say-so.

Consequence: logging every shot *during* play is the thing that failed, not the
GPS. That is what rev 2 exists to replace.

## rev 2 — Continuous track

Record position continuously and recover the shots afterwards, instead of
logging each one on the course.

Also carries, added 2026-08-16 before the build was first played:

- **Lasered yardages, entered after each hole.** Hole-level and independent of
  shot records, because nothing is marked during a hole under this model. These
  are ground truth — three on one hole make the pin solvable from the track
  alone, which turns GPS error into something measurable against Matt's laser.
- **A live track indicator.** Counts fixes committed to IndexedDB, not fixes
  seen. The dense write is fire-and-forget, so without this a failed write is
  invisible until the round summary, i.e. until the round is already over.

Not bumped to rev 3: the rule is to bump when a build is about to be played,
and rev 2 had not been played yet. It goes to the course as rev 2.

- **Dense track in IndexedDB** (`js/data/trackstore.js`). Full-rate recording,
  buffered and flushed off the main thread. Not in localStorage, for two
  reasons: ~1.5 MB per round against a ~5 MB origin quota, and — worse — the
  round is a single key, so appending a point at 1 Hz would re-serialise the
  whole round every second for four hours.
- **The rev-1 breadcrumb still runs** at its old 30 s / 25 m cadence, in the
  round record, at ~1% of the size. If IndexedDB is unavailable, rev 2 degrades
  to rev 1 rather than recording nothing.
- **Stop detection** (`js/round/track-analysis.js`). Segments the track into
  stops and moves, then ranks stops by how shot-like they are. Propose and
  confirm, *not* detect — Matt knows his score, so the job is ranking
  candidates, not finding them unsupervised.
- **Revision stamping**, this file, and git tags.

**Played 2026-08-16, field test 3.** Front nine at Veenker, gold tees, with
Matt's golf buddy — also called Matt. Nine holes completed, 7,858 track fixes
over 144 minutes, median GPS accuracy 3.1 m. **The first build that survived a
whole round.** Scored 40 (+4) after correction. See `docs/field-test-3.md`.

Late additions on the day of the round, before it was played: the tee shot
named rather than numbered, the green reduced to a cup mark, the putt grid
reshaped, GPS watch re-arm after a phone lock, the export carrying the dense
track, and the share sheet.

---

## rev 3 — Reachable lock, and the track proposing shots *(current, not yet played)*

Everything here came out of field test 3. Matt picked the order on 2026-08-21:
all of the interaction fixes first, then the GPS work.

### Built so far

- **A floating LOCK tab** (`js/ui/lock.js`). Fixed to the right edge at thumb
  height, present on every screen while a round is live, locking on
  `pointerdown` rather than click so it is as immediate as the hardware button
  it replaces. The rev 1 header glyph is **removed** rather than kept alongside
  it — nine holes were played without anyone finding it, and two controls for
  one action, one of which is known not to work, is worse than one that does.
  The tab reserves its own strip through `body.has-lock-tab` instead of floating
  over the action stack; the first version overlapped MARK SHOT, which would
  have been the same mistake as the cup button in a new place.
- **Auto-lock raised, 15 s to 2 minutes**, with the scale moved to
  30 s / 60 s / 2 m / 5 m / OFF and a one-time migration for installs carrying
  the old value. One setting was failing in both directions at once; the manual
  tab is now the instant path, so this is only the safety net for forgetting it.
- **The cup control is gated on being on the green.** It renders only once a
  ball has been marked with lie `green`, and then below ENTER PUTTS and
  YARDAGES. On the tee there is no cup button to mis-tap, which is what hole 8
  actually needed. The putt sheet's own cup control and the round-menu entry are
  both untouched, so nothing is lost for a hole that gets chipped in.
- **Every mark is stated on screen, with UNDO attached** — "Tee shot marked.",
  "Cup marked here." — for 20 s. This is the answer to UNDO being
  undiscoverable: rather than hoping he finds a control, the control arrives at
  the only moment it is wanted. It doubles as the guard on a mis-tapped mark.
- **Penalties attach to a chosen shot.** The last shot stays the default, but
  the sheet now names the shot it is about and offers a picker, with a dot
  against shots that already carry one. Hole 7 put a tee-shot penalty on a
  fairway wood because the old sheet took whatever was last.
- **A gaps gate before a round can be saved** (`roundGaps` in
  `js/round/round.js`). Reports started-but-unfinished holes and completed holes
  with no first-putt distance; every gap is one tap from the sheet that fixes
  it. Holes never started are deliberately not reported — walking in after nine
  is a decision, not an omission — and there is an explicit override, because a
  round whose data is genuinely gone must still be savable.
- **Backup A: first-putt distance proposed from the dense track**
  (`proposeFirstPutt` in `js/round/track-analysis.js`), offered inside the gaps
  gate. Accepting it stores `distanceEntry.inferred = 'track'` with the
  uncertainty and confidence beside it, so an estimated 8 ft can never be
  mistaken for a paced 8 ft. Read the header on that function before trusting
  the output: `schema.js` is right that GPS cannot measure putting, and this
  exists only because the alternative is deleting those strokes entirely, which
  field test 3 measured at a third of a stroke of flattery.

### Agenda item 2 — end-of-hole entry — BUILT

His order, verbatim: *"lets hone down the tracking and then move to the after
hole entry, and then how we handle a mislog, forgotten phone in the cart,
etc"*. Rev 2 built the ranking and stopped there. Nothing ever asked him to
confirm a candidate, and that confirmation was the whole of item 2.

**The bargain.** He supplies the score, because he knows it and the app does
not. The track supplies the positions, because it recorded them and he cannot.
Neither half works alone, and unsupervised detection was never the plan.

**The flow.** `END-OF-HOLE ENTRY` appears in the footer on any hole with no
marks — which under rev 2 is not a failure state, it is the intended way to
play — and in the round menu always.

1. *How did it go?* Strokes, putts, penalty strokes, first-putt distance. It
   says live how many full shots that leaves for the track to find.
2. *Confirm your shots.* The proposals in time order, each with the evidence
   that earned it — how far the ball went, how long he stood, whether he
   arrived by cart — and a lie. `NOT A SHOT` drops one and pulls in the next
   best candidate the ranking held back. `NOT SURE` takes `defaultLie` and
   flags the shot `lieInferred`, which is his own instruction (*"If I cant
   remember do what you need"*) with the standing caveat that a guess is
   flagged, never folded in silently.

**Three rules about which stops can be shots**, all structural rather than
suppression — the module still surfaces its known false positives, and every
rejected candidate is returned as a labelled negative:

- **The last stop is never a full shot.** A hole ends at the cup. The raw
  ranking loved that stop, because leaving for the next tee is a long departure
  and a long departure is the most shot-like feature there is; on a pocketed
  par 4 it outranked the approach.
- **Stops within putting range of the hole are demoted** — the ball at rest on
  the green scores like a shot and is not one. Adaptive: if excluding them
  would manufacture a shortfall they come back, because geometry cannot
  separate a 60 ft putt from a 20 yard chip, and the count has to keep meaning
  what it means.
- **The cup is anchored on where the ball finished**, not on wherever the
  window ends. The window runs to *now* for an incomplete hole, so entering the
  card at the next tee would otherwise put the cup on the next tee.

**The count is the diagnostic.** More stops than swings is ordinary. Fewer is
stroke and distance: replaying from the same spot puts two strokes in one stop
and is indistinguishable from the pre-shot reset the segmenter deliberately
merges. The track cannot recover that and does not try — the sheet says how
many are missing and offers `PLAYED TWICE` on each stop, which is the recovery
named in `docs/rev2-changes.md`.

**The cup had to come with it.** Confirmed shot positions alone produce
*nothing*: every distance on a hole is measured to the cup, so a hole entered
this way with no cup put all of its strokes straight back in the unattributed
pile — the exact failure this path exists to end. `proposeHoleShots` returns
the retrieval stop as cup evidence and stage 2 offers it, showing its
uncertainty. Verified end to end: a pocketed par 4 that scored 2 unattributed
strokes without it scores **zero** with it, giving off-the-tee, approach and
putting figures from a hole where the phone never came out.

A track cup is deliberately **not** fed to `learnCup`. That accumulator is the
course model other rounds fall back on, and laundering a ±6 m inference into a
reference is the silent mixing design rule 5 forbids.

**Penalties folded in**, as `docs/rev2-changes.md` said they must:

- Two-stroke penalties can be entered at all. Every type was hardcoded `+1`,
  so the general penalty in stroke play was unrecordable.
- `OB / Lost` is now flagged `strokeAndDistance`, and the app says *"play again
  from the same spot"* instead of *"mark your next shot from the drop"*. There
  is no drop — he plays it straight, and MLR E-5 is out.
- The shot picker built earlier this session means a penalty entered after the
  hole no longer lands on a putt.

### Radcliffe Friendly Fairways, for field test 4

On branch `field-test-4-radcliffe`. Two four-man best-ball tournaments on
2026-08-22, 8:00 and 13:30, both on Radcliffe's nine — **four nine-hole rounds
of tracking data**. Best ball, so strokes gained is not the point; the GPS
track is.

Per-hole pars and yardages from the GolfLink scorecard, checked 2026-08-21, and
they reconcile exactly against the totals the course publishes itself: par 36
with two par-3s and two par-5s, white 3,125, red 2,745. Stroke indices are not
published anywhere found and are therefore null, not invented — irrelevant to
best ball in any case. Rating and slope likewise absent.

Three things the second course broke, all of which had been correct only
because Veenker was the only course in the build:

- **The home shortcut was hardcoded to Veenker** — button text, course id and
  tee lookup. The setting said Radcliffe and the button still started Veenker,
  which on a day of four rounds there is four wrong rounds.
- **`playOrder` reordered a single nine.** `startingNine` persists, so arriving
  at a nine-hole course after a back-nine round at Veenker dealt the holes
  5-9 then 1-4 with nothing on screen saying so. Guarded in the course module,
  since the caller cannot be expected to know.
- **A remembered tee that the course does not have.** The picker normalised it;
  opening straight onto a course did not, and starting like that records a tee
  the course lacks while `holeYards` quietly falls back to another one.

**Four rounds, not one.** Thirty-six holes is recorded as four nine-hole rounds
rather than one long one: hole numbers are the key used to find a hole
throughout the app, so looping a nine would put two hole 1s in one round. Each
loop also gets its own dense track, which is the better shape for the thing
being tested.

### The known bug: root cause found, fixed

The backlog carried this as "`tick()` does not fire on the play screen at all …
root cause not found." It fires. The fault was never in `tick()`.

`tick()` was only ever *called* from the GPS subscription in `app.js`, which
runs on the `fix` event. So the accuracy chip repainted when a fix arrived and
at no other time — and when fixes stopped, nothing repainted it and it held its
last reading indefinitely. `gps.current` has already gone null by then
(`staleFixMs`, 4 s) and `tick()` renders "GPS —" if asked. Nothing asked it.

Which makes the display wrong in precisely the situation it exists for. For all
sixteen of field test 3's gaps — the largest eleven minutes — the chip was
showing a healthy accuracy from before the gap. The 2026-08-16 simulator check
that "forcing accuracy 3 → 9 changed nothing" was the same fault seen from the
other side: with the watch already quiet, changing what the next fix would say
changes nothing, because there is no next fix.

**A live indicator cannot be driven only by the event whose absence it is meant
to report.** Both chips now paint on a 2 s heartbeat, which is what the track
chip was already doing for the same reason, one chip early. The chip also
distinguishes "waiting for the first fix" from "no fix for 4 m", which were the
same blank before and mean opposite things.

**The locked screen had the identical bug** and is fixed the same way. It was
the worse of the two: that screen exists so a glance at a pocketed phone answers
"is the GPS still happy?" without unlocking, and a phone pocketed long enough to
be worth checking is exactly the one whose page has been suspended.

### Found while working, not yet acted on

**The auto-lock timer cannot defend the pocket, and never could.**
`noteActivity()` resets the idle timer on any `pointerdown` anywhere in the
document — including the phantom touches a pocket generates. A phone actually
being sat on keeps pushing the timer out and never auto-locks. The two-tap
overlay is the real pocket defence; this timer only ever protected against
putting the phone down. Raising the default to 2 minutes is safe for that
reason, but the timer should probably not be described as a pocket guard.
Deciding what, if anything, to do about it is Matt's call.

### Still open from the backlog

Not started: **agenda item 3** — mislogs and the forgotten phone in the cart,
which is next in his order now that item 2 is built. Also penalty *cause*
tagging (execution versus conditions), club moving to end-of-hole, and the
Firestore sync that would end the download-email-upload workflow.

Stroke-and-distance handling and the lie moving to end-of-hole both landed as
part of item 2 above.

**Already shipped in rev 2, skipped by Matt's instruction on 2026-08-21:** the
1–5 ft putt grid and MARK TEE SHOT naming. He was describing the build he had
played, not the deployed one.

---

## The original field-test-3 backlog, in his words

Kept verbatim. This is the list the work above was drawn from, and it is not a
prioritisation.

### The on-course annoyance, in his words

> "This is the on course annoyance the lock screen! I mark the cup or shot and
> then have to wait to put it in my pocket for the lock screen to go active. I
> would like it to stay on a little longer it times out when I am on the green a
> lot so I am having unlock/lock it multiple times as I am pacing off and reading
> my putt. There needs to be a floating screen lock button that I can hit like my
> phones lock screen which is what I started defaulting to and you could probably
> tell from the GPS data."

Two failures from one setting. `autoLockSec` defaults to 15 s
(`js/data/schema.js`), which is simultaneously **too long** when he wants to
pocket the phone right now, and **too short** while he is working on the green.

**He is right that it shows in the data.** Field test 3's track has 16 gaps over
20 s, the largest 11 minutes and 7 minutes — the hardware lock suspending the
page. He defaulted to the phone's lock button because the app's was not to hand.

What he asked for: a **floating** lock control, always reachable, that locks
instantly the way the hardware button does. A header button is not it — there is
one at `js/ui/screen-play.js`, and he played nine holes without finding it.
Also worth revisiting the auto-lock default once a manual lock is always to hand.

### Also asked for

- **Mandatory stats before a round can be saved.** Verbatim: *"Mandatory stats
  to finish the round. If there is missing data it is best I fill that in before
  saving the round."* Field test 3 finished with 4 of 40 strokes unattributed —
  two holes missing a first-putt distance. Filling them in afterwards moved his
  putting from +0.52 to +0.19, so **the gaps were flattering him**, exactly as
  section 5 of the handoff predicted.
- **Putt grid, 1–5 ft.** *"there needs to be 1-5 feet listed… Jumps for 3 to 6."*
  **Already shipped** in rev 2 on the day of the round — the grid is now every
  foot to 10. He was describing the build he had played, not the deployed one.
  Confirm on his phone rather than rebuilding.
- **Mark shot 1 becomes mark tee shot.** Also **already shipped** in rev 2, same
  day, after the round. Same caveat.

### Carried from the round, not yet agreed with him

- **OB / stroke-and-distance handling.** He was still thinking. Settled so far:
  he plays straight stroke and distance, MLR E-5 is out, and re-teeing means
  pressing MARK TEE SHOT again.
- **Lie, club and distance move to end-of-hole or end-of-round.** *"If I cant
  remember do what you need."* Makes the landing mark one tap. Inferred lies must
  be flagged, not folded in silently.
- **Penalty cause tagging** — execution vs conditions. His argument: a lost ball
  in 10-inch rough on a cart-path-only day after his best drive is the course,
  not his swing. Scoring counts it either way; practice priority should not.
- **The cup control must not sit next to the shot control.** Hole 8's cup was
  marked on the tee, 3.2 s after the tee shot, with a clean 1.8 m fix. One
  thumb-width, and it corrupted the category the app exists to measure.
- **UNDO is undiscoverable.** It exists, small and dim at the bottom edge. He
  asked for one to be built.
- **Backup A** — first-putt distance from the track when none is entered.
  **Backup B** — the track proposing marks he missed. B is agenda item 2 proper.
- **The workflow.** Download, email, upload, per round. *"This is stupid."*
  Firestore sync is `SPEC.md` step 4 and he has not yet chosen a Firebase project.

### Known bug, unfixed *(since diagnosed — see “The known bug” above)*

`tick()` does not fire on the play screen at all, so the accuracy chip beside the
track chip sits frozen on a stale reading. Verified in the simulator: forcing
accuracy 3 → 9 changed nothing on screen. The track chip sidesteps it with its
own interval. **Root cause not found.**

> Kept as written. The diagnosis in it is wrong in an instructive way: `tick()`
> does fire, and the simulator check was reading the symptom from the other
> side. Both are explained above.

Known false positives are reported rather than suppressed — the walk behind the
hole to read a putt, and sitting in the cart while a partner plays. Suppressing
them would destroy the labelled examples that make this trainable, which is a
stated requirement: *"This needs to be trainable."*

**Not in rev 2, and next in Matt's own order:** end-of-hole entry (agenda item
2) and mislog / forgotten-phone recovery (item 3). The candidate ranking is
built and tested but nothing yet asks Matt to confirm a candidate — that is
item 2, and the agenda is explicitly not to be skipped ahead.
