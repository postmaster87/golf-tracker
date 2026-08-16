# Rev 2 — what changed, and what it is for

**Status:** live at <https://postmaster87.github.io/golf-tracker/> at commit
`038b9fb`. 357/357 tests. Played for the first time at field test 3,
**2026-08-16, 16:00, nine holes.**

Rev 1 was shut down mid-round. Matt's verdict was not that it was broken:

> "I shut it down because it was getting in the way of my play not that it
> wasn't working but I missed logs so this data is not correct."

So rev 2 is not a feature release. It is one idea — **stop logging shots during
play** — plus the minimum needed to find out whether that idea survives contact
with a real round.

---

## The one change that matters

**Record continuously, enter a minimum after each hole, derive the rest later.**

The phone rides in a pocket. Nothing is tapped while a hole is being played.
Position is recorded the whole time, and the shots get recovered afterwards from
the track instead of being logged on the course.

Matt's own statement of what he wanted:

> "What I would like is the ability to track me do all the work after the round
> but have me log needed data at the end of the hole."

---

## What was built

### Continuous track, in IndexedDB

Dense position recording for the whole round. It does **not** live in
localStorage, and the reason is not size.

The round is one localStorage key, so appending a track point rewrites the
entire round — every mark, every raw sample. At the old 30-second cadence that
is free. At 1 Hz it is a synchronous `JSON.stringify` of a growing megabyte on
the main thread, every second, for four hours, on a phone in a pocket in the
sun. No storage-quota answer fixes that.

So the dense track is append-only in IndexedDB: async, off the main thread,
buffered, flushed every 15 seconds or 30 fixes, and flushed again the moment the
page is hidden. **The rev-1 breadcrumb still runs unchanged underneath**, so
losing IndexedDB costs analysis quality, not the round.

### Stop detection that proposes rather than decides

The track is turned into *ranked candidate stops*, not classified shots. Matt
knows his score, so the job is ranking, not unsupervised detection — a bad
ranking costs taps, a bad classifier costs data.

Known false positives are **reported, not suppressed** — the walk behind the
hole, sitting in the cart while a partner plays. Suppressing them would destroy
the labelled examples that make the thing trainable, which was a stated
requirement:

> "I have a very specific routine and I think over time you will figure it out.
> This needs to be trainable."

### Lasered yardages, entered after the hole

Distance to the pin before each shot, typed in once the hole is done.
Hole-level and independent of shot records — which is the point, because nothing
is marked during a hole under this model, so it has to work with an empty shot
list.

A blank row is preserved, not dropped: *"this shot happened and was not ranged"*
is a different claim from *"this shot did not happen"*, and inside 60 yards it is
the normal one.

> "I laser every distance unless it is under 60 yards. from there it is all feel
> so I will need my phone there."

**These are ground truth.** Three on one hole make the pin position solvable
from the track alone, which turns GPS error into something measurable against a
laser without any surveyed reference. They also survive every gap in the track,
which no other data on the hole does.

### A live track indicator

A chip in the play-screen header counting fixes **committed to IndexedDB** — not
fixes seen. Buffering cannot fail, so counting buffered fixes would read as
healthy during exactly the failure this exists to catch.

Without it, a failed write was invisible until the round summary, i.e. until the
round was already over. That is the difference between a recoverable problem and
four wasted hours — on the second round in a row that would have come home
unusable.

It runs on its own interval rather than on the screen's `tick()`, for the reason
in Known Problems below.

### GPS watch recovery after a lock

`gps.js` previously had no visibility handling at all: the watch was armed once
and never looked at again. Android freezing the page can stop delivery while
`watchId` stays set — so `running` stays true, `start()` short-circuits on its
own guard, and the app looks healthy while recording nothing.

On unlock it now waits 3 seconds and re-arms only if fixes have actually
stopped. A watch that woke up on its own is left alone, since a needless restart
costs a receiver cold start.

The gap while the phone is locked is unavoidable. Failing to resume afterwards
was not.

### Revision numbering

Starting at 0, matching how Matt numbers projects at work. **A revision is a
build that went to the course** — not a release, not a commit.

That is the boundary worth numbering because this app answers a data question:
when two rounds disagree, the first thing you need is whether the same
instrument recorded them. Field test 2 is the case in point — a whole round that
has to be quarantined, and until now that meant remembering a date rather than
applying a filter.

Every round is stamped at creation and never restamped. Legacy rounds are
deliberately **not** migrated: defaulting the stamp would relabel field-test data
as coming from a build that did not exist when it was recorded.

---

## Known problems — carried into the round on purpose

1. **`tick()` does not fire on the play screen at all.** The accuracy chip is
   sitting frozen on a stale reading. Verified in the simulator: forcing
   accuracy from 3 to 9 changed nothing on screen. **Not fixed.** The track chip
   sidesteps it with its own timer; the underlying bug is the top thing to look
   at next. Ignore the accuracy number until then.

2. **GPS watch recovery is not verified end-to-end.** Unit tests cover the
   restart and the staleness rule, but a real Android freeze could not be faked
   in the simulator without breaking its own watch, so "it did not recover" and
   "the harness broke" were indistinguishable. Shipped because it is strictly
   additive — if it never fires, behaviour is exactly what it was before.

3. **Rev 2 changed after it was numbered.** Yardage entry and the track chip were
   added on 2026-08-16, before the build was first played. Not bumped to rev 3,
   because the rule is to bump when a build is about to be played and rev 2 had
   never been played. Its ledger entry was updated instead.

---

## Not built — and deliberately not

**Agenda item 2, end-of-hole entry.** Rev 2 produces ranked candidate stops but
nothing yet asks Matt to confirm any of them. That confirmation *is* item 2, and
twenty minutes of untested entry UI shipped to a golf course is how field test 2
ended.

Matt's order, which is not to be skipped ahead:

> "lets hone down the tracking and then move to the after hole entry, and then
> how we handle a mislog, forgotten phone in the cart, etc... after those"

**Penalty strokes** fold into item 2. Established 2026-08-16, unbuilt:

- Every penalty type is hardcoded `+1`. The general penalty in stroke play is
  two strokes, and there is no way to enter one at all.
- The penalty always attaches to the *last* shot, so entering one after the hole
  charges it to a putt. Deferred entry needs a shot picker.
- The toast says "mark your next shot from the drop" for every type. There is no
  drop for lost/OB — it is stroke and distance.
- **Matt plays straight stroke and distance for lost/OB**, so Model Local Rule
  E-5 is out and will not be built.
- Stroke and distance is invisible in the track: replaying from the same spot
  produces **one stop where two strokes happened**, and it is indistinguishable
  from his pre-shot reset, which the code deliberately merges. The recovery is
  the count mismatch at end-of-hole entry — score says 6, track yields 5 stops,
  so ask which one was replayed.

**Firestore sync + Google Sign-In** (`SPEC.md` step 4) has not been started.

---

## Still owed by Matt

1. **"What worked"** from field test 2. Never given. The app's strengths are
   therefore genuinely unknown, and the whole redesign has been steered by what
   failed with no counterweight.
2. **Permission to open the embargoed export**
   `~/Downloads/golf-tracker-20260802-2034.json`.
