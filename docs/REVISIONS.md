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

Known false positives are reported rather than suppressed — the walk behind the
hole to read a putt, and sitting in the cart while a partner plays. Suppressing
them would destroy the labelled examples that make this trainable, which is a
stated requirement: *"This needs to be trainable."*

**Not in rev 2, and next in Matt's own order:** end-of-hole entry (agenda item
2) and mislog / forgotten-phone recovery (item 3). The candidate ranking is
built and tested but nothing yet asks Matt to confirm a candidate — that is
item 2, and the agenda is explicitly not to be skipped ahead.
