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
| Home screen | Footer line: `rev 2 — Continuous track · not yet played`. |
| Round summary | Data-quality card: `Recorded by rev 2 — Continuous track.` |
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

## rev 2 — Continuous track *(current, not yet played)*

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

## rev 3 — *not started; backlog below*

Everything here came out of field test 3. Nothing is built. **Do not start
without asking Matt what he wants first** — this is a list, not a plan, and it
is in his words, not a prioritisation.

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

### Known bug, unfixed

`tick()` does not fire on the play screen at all, so the accuracy chip beside the
track chip sits frozen on a stale reading. Verified in the simulator: forcing
accuracy 3 → 9 changed nothing on screen. The track chip sidesteps it with its
own interval. **Root cause not found.**

Known false positives are reported rather than suppressed — the walk behind the
hole to read a putt, and sitting in the cart while a partner plays. Suppressing
them would destroy the labelled examples that make this trainable, which is a
stated requirement: *"This needs to be trainable."*

**Not in rev 2, and next in Matt's own order:** end-of-hole entry (agenda item
2) and mislog / forgotten-phone recovery (item 3). The candidate ranking is
built and tested but nothing yet asks Matt to confirm a candidate — that is
item 2, and the agenda is explicitly not to be skipped ahead.
