# SPEC - the green flow: cup, ball, putts, score, then the shots and their lies

Fable, 2026-09-16, at medium (Matt set it: `/effort medium`, "Gonahead").
Written for Opus to build at high (`.claude/agents/opus.md`). Fable reviews
the diff against this file and signs in `docs/DECISIONS_LOG.md`.

His words that bound it, verbatim:

- 2026-09-13: *"Is it possible for me to mark the cup, putt 1, and my score.
  Then the app computes the shot locations from the track and auto fill the
  lies and distances. Then I click on any entries to manually correct.?"*
- 2026-09-15: *"fix the lie card and yes the conformation when in question
  is needed when I am entering the score at the end of the hole. Workflow on
  the green mark the cup or my ball first whatever is easiest. Hole out -
  record the putt length for short putts, double check GPS for long putts,
  enter hole score (once this is entered the app needs to compute the shots
  and ask me questions about the lie. Shot 2 rough or fairway, shot 3 green
  or fairway, etc..."*
- 2026-09-16: *"With the Green flow established at 20ft not 15"* (ruling in
  `docs/DECISIONS_LOG.md`, commit `a778194`).
- Standing, 2026-09-13: on the course he touches cup, putt 1 and score, no
  tee marks (`docs/HANDOFF-native-build.md` Section 3). *"If there is a
  penalty I will log it when it occurs and the score is adjusted after holing
  out on that hole."*

Provenance tags: `[measured]` read from code this session, `[design]` this
spec's decision, `[verify]` Opus confirms during the build.

---

## 0. What this is, and what it is not

**Is:** one sheet on the green that runs his whole hole in his order - mark
the cup and the ball in either order, hole out, the putts (typed under 20 ft,
GPS at 20 ft and over), the score, and then the app proposes the full shots
out of the track and asks him the lie of each. Every piece of it exists today
in `js/ui/screen-play.js` `[measured]`; this job joins them into one path and
applies the 20 ft rule.

**Is not:** a change to the mark burst or the lie card (v25-v27, field-fit),
to the shot ranking in `js/round/track-analysis.js`, to the round record
(`schemaVersion` unmoved, no new keys), to the export, or to the hint strings
whose fit REPORT_2.6 measured. Lies from the course map are NOT in this job:
the course map as app data is its own xhigh spec on his word, and until it
lands every lie is his tap (NOT SURE flags the app's guess, as today). The
"in question" edge band from `docs/HANDOFF-native-build.md` Section 4 item 6
waits for that map.

---

## 1. What exists today `[measured]`

| Piece | Where | State |
|---|---|---|
| MARK CUP burst, `saveCup`, reopens the putt sheet | `screen-play.js` 1096-1147 | done |
| The putt sheet: putt count, feet grid per putt, GPS for putt 1 (ball mark to cup) with its error bar, pin sheet when no cup, SAVE | `openGreenEntry`, 1206-1640 | done |
| A ball mark on the green | only through MARK SHOT n + lie GREEN (the lie card) | the pocket flow has no way to mark the ball |
| The score card (strokes, putts, penalties, first putt grid) | `openHoleCard`, 2716-2810 | done, reached only by END-OF-HOLE ENTRY |
| The shots proposed from the track and the lie asked per shot, NOT SURE, NOT A SHOT, PLAYED TWICE, the cup from the track | `openShotConfirm`, 2823-2990 | done |
| Writing the hole | `applyHoleEntry`, 3008-3060 | done; **drops a marked ball** (`hl.shots = []`, item 4 below) |
| The 20 ft rule | nowhere | this job |
| The capture kind `putt` | `commit` has no branch for it; the burst label "Marking putt" exists (717) | this job |

`holeWindow` (`js/round/round.js` 660-750) already tolerates this hole's own
cup and ball marks: own marks only lower `fromTs` and raise `toTs`, never
narrow the window `[measured]`. `setGreenEntry` already preserves a marked
first putt (`markedFirst`) `[measured]`.

---

## 2. Decisions `[design]` (each overridable by Matt, in his chat)

| # | Decision | Why |
|---|---|---|
| G1 | **The 20 ft rule.** With a GPS first-putt distance (ball mark to cup) of **20 ft or more**, GPS is the value and the sheet shows it with its error bar for him to check; a typed value is optional. **Under 20 ft, or with no GPS distance**, the typed distance is required before the sheet saves. The constant is `TYPED_PUTT_MAX_FT = 20` in one place with his words beside it. | His ruling. Cost table in `docs/HANDOFF-native-build.md` Section 7: an 8 ft error costs 0.17 strokes at 20 ft, 0.34 at 15 ft. |
| G2 | **MARK BALL is a burst of kind `putt`, from inside the sheet, no lie card.** It saves a `green` shot with the mark (or sets the mark on the existing first green shot) and reopens the sheet, the way MARK CUP does. RE-MARK BALL after. | "mark the cup or my ball first whatever is easiest": both are one tap from the same sheet, either order. The lie is known - it is the green. |
| G3 | **After the putts, the score, then the shots - on a hole with no full-shot marks.** SAVE on the sheet goes straight into the score card with putts and the first putt carried in (not asked twice), then FIND MY SHOTS, then the confirm stage, then SAVE HOLE. On a hole that has full-shot marks, SAVE behaves as today: the marks are the shots. | His order: putts, then score, then the questions. The pocket flow is the intended way to play (rev 2); the marked flow stays for the days he marks. |
| G4 | **The hole is written once, at SAVE HOLE, and the ball and cup marks survive it.** `applyHoleEntry` keeps green-lie shots that carry a mark, so the first putt keeps its measured position. | The ball mark is what locates the first putt for GPS (G1) and the hole for every earlier shot; dropping it would silently turn a measured putt into an unmeasured one. |
| G5 | **One tap out at every step.** Leaving the score card or the confirm stage keeps the putts already saved; the hole stays `in_progress` and everything on it is editable later from the hole menu as today. Nothing here blocks NEXT HOLE. | Design rule: no app-driven state may block logging reality; the golfer is the source of truth. |
| G6 | **No new schema.** A GPS-chosen first putt is stored as today (no `distanceFt`; `firstPuttM` measures mark to cup). A typed one goes through `setShotDistance` in feet. `greenEntry` unchanged. | The round rails are proven; provenance already distinguishes typed, GPS and track-inferred. |
| G7 | **The footer does not grow.** ENTER PUTTS ▸ is relabelled **GREEN ▸** (one word fits at 360 px `[verify]`); END-OF-HOLE ENTRY ▸ stays for a hole entered from the next tee or later. The fold tests of v25-v27 stay green untouched. | REPORT_2.6: every footer pixel was fought for. |

---

## 3. The flow, step by step (his hole, phone in the pocket until the green)

1. **Tee to green:** nothing. The track records.
2. **On the green:** GREEN ▸ opens the sheet (or it opens itself after a
   MARK CUP from the footer, as today). The sheet's head row holds two
   buttons: **MARK CUP** / RE-MARK CUP and **MARK BALL** / RE-MARK BALL.
   Either order. Each is the existing 3 s burst; the sheet reopens after it.
   The pocket lock and the hints are unchanged.
3. **Hole out.** In the sheet: putts (segmented 0-4+, default 2, as today).
   Under **Putt 1 - to the hole**:
   - GPS distance available (ball mark and cup): show it as today
     (`N ft · GPS ±E`).
     - **≥ 20 ft:** GPS is selected; the grid is there to override; SAVE is
       enabled. Label under the readout: *"20 ft and over: GPS stands. Tap a
       number only if you know better."*
     - **< 20 ft:** the grid is required; the readout shows the GPS number
       greyed with *"GPS says N ft - under 20 ft, type it"*; SAVE stays
       disabled until a value is typed for putt 1 (`0` putts needs nothing).
   - No GPS distance: the grid is required, as the < 20 ft case; the pin
     sheet control stays where it is for a hole with no cup.
   - Putts 2+ unchanged.
4. **SAVE.** `setGreenEntry` as today (the marked ball preserved). Then:
   - `strokeMarks(hl).length > 0` (he marked shots): done, as today.
   - otherwise the **score card** opens with `putts` and `firstPuttFt`
     carried from the sheet and not shown again: **Strokes** (default
     `max(par, putts + 1)`), **Penalty strokes** (default 0). One line under
     it: *"Score minus putts minus penalties is what the track looks for."*
     FIND MY SHOTS ▸.
5. **The shots.** `proposeHoleShots` on `holeWindow`, the confirm stage as
   today: each shot's card, lie segmented (Tee/Fairway/Rough/Sand/Recovery),
   NOT SURE, NOT A SHOT / PLAYED TWICE; the cup from the track only if no cup
   was marked. **SAVE HOLE** → `applyHoleEntry` (G4) → toast with UNDO as
   today → the footer's next action is NEXT HOLE.
   - No track in the window: the existing "No track for this hole" sheet,
     HAND-ENTER INSTEAD. The putts stay saved.
6. **Corrections later:** the hole menu and EDIT PUTTS as today; re-running
   the flow on a saved hole goes through the same sheets and replaces the
   hole (UNDO stands).

---

## 4. Web-side changes, file by file (surgical; nothing else moves)

1. **`js/ui/screen-play.js`.**
   (a) `const TYPED_PUTT_MAX_FT = 20;` near `CUP_AT_TEE_M` (1094) with his
   words. (b) `beginCapture('putt')`: `commit` gains a `kind === 'putt'`
   branch → `saveBall(hl, reduced)`: the first `green` shot with no mark
   gets `mark` from `reduced` (same shape `addShot` stores), else
   `addShot(hl, { lie: 'green', reduced, source: 'gps', club: 'putter' })`;
   `noteMark('Ball marked here.')`; the poor-accuracy warning as for the
   cup; persist; reopen the sheet (`reopenPuttsAfterCup` pattern, renamed
   `reopenPuttsAfterMark` and used by both). No `learnGreen` call from here
   `[design]`: that accumulator learns from the lie card's marks today and a
   second feeder is a separate decision. (c) `openGreenEntry`: the MARK BALL
   / RE-MARK BALL button beside the cup control (both in one `btn-row` at
   the top of the sheet, above the putt count); the G1 rule in the putt 1
   field and on SAVE's `disabled`; SAVE's handler then calls
   `openScoreCard(hl)` when `strokeMarks(hl).length === 0`. (d)
   `openHoleCard` becomes `openHoleCard(hl, { fromSheet })`: with
   `fromSheet` the putts and first putt fields are hidden and prefilled from
   `hl` (`holePutts`, `puttDistancesFt(hl)[0]`); the existing END-OF-HOLE
   path passes nothing and is unchanged. (e) `applyHoleEntry`: keep
   `hl.shots.filter((s) => s.lie === 'green' && s.mark)` through the rebuild
   (G4); `setGreenEntry` then finds `markedFirst` as it does today. (f) The
   footer button text `ENTER PUTTS ▸` → `GREEN ▸`; `nextStepHint` strings
   untouched.
2. **`js/round/round.js`.** No change unless (e) needs a helper; if so a
   pure `greenMarks(hole)` beside `holePutts`.
3. **`js/data/schema.js`, `js/data/store.js`, `js/round/track-analysis.js`,
   `css/*`, `index.html`:** no change.

---

## 5. What must not change

`js/gps/gps.js`, `js/round/track-analysis.js`, the lie card and its fold
(`paint`, the card-first body order, the `minmax(0,1fr)` grids), the two
hint strings of v27, the mark burst's timing, `schemaVersion`,
`formatVersion`, `REVISION`, `BUILD.id` (the bump is the deploy's, on his
word), the pocket lock, `js/native/*`, `android/*`.

---

## 6. Tests (`/test/`, each proven to fail without its change)

1. **The 20 ft rule, pure.** A helper `firstPuttEntryMode({ gpsFt })` (or
   the sheet's own logic exposed for the test) returns `gps` at 20 and 60,
   `typed` at 19.9, 8 and `null`.
2. **The sheet at 360x728 with a ball mark 30 ft from the cup:** the putt 1
   readout shows the GPS number, SAVE is enabled with nothing typed, and the
   saved hole's first putt has no `distanceFt` and `firstPuttM` equals the
   mark-to-cup distance.
3. **The same sheet at 12 ft:** SAVE is disabled until a value is typed;
   after typing 10, `puttDistancesFt(hl)[0] === 10`.
4. **MARK BALL from the sheet:** the burst of kind `putt` saves one `green`
   shot with a mark and no lie card is shown; a second MARK BALL replaces
   the mark rather than adding a shot.
5. **The score card after SAVE on an unmarked hole** opens with the putts
   and first putt carried in and not shown; with a marked tee shot SAVE
   closes the sheet and no card opens.
6. **SAVE HOLE keeps the ball and the cup:** after `applyHoleEntry` on a hole
   with a ball mark and a cup, the first green shot still carries its mark
   and `hl.cup` is unchanged.
7. **The v25-v27 fold group stays green** as it is (no new assertion; the
   run proves the footer did not grow).

Existing suite: 531 at v27 + shell; all stay green.

---

## 7. What Matt decided, and what is his to decide

- Decided: 20 ft (`a778194`). Cup, putt 1, score is the on-course contract.
- His, before the build if he wants, else Fable's defaults stand: the footer
  label **GREEN ▸** (G7); the score card's default strokes `max(par,
  putts + 1)` (G3).
- Not this job, his word later: lies from the course map (the xhigh spec),
  the auto-lie edge band, `learnGreen` from the ball mark.

---

## 8. Order of work for Opus (one commit per step is fine)

1. `TYPED_PUTT_MAX_FT`, the sheet's putt 1 rule and SAVE gating; tests 1-3.
2. MARK BALL (`putt` capture, `saveBall`, reopen); test 4.
3. SAVE → score card → confirm → SAVE HOLE with the marks kept; tests 5-6;
   footer label; the fold group re-run (test 7).
4. `BUILD.id` is NOT bumped by Opus (Fable bumps at the push, on his word).
   `docs/handoff/REPORT_3.2.md` + PDF (`tools/md2pdf.py`): every number with
   n, the diff list, any departure from this spec and why, and what he does
   differently on the green in five lines.

Return `DONE <hash>` or `BLOCKED <question>`. A spec line that cannot work as
written is a BLOCKED with what was found, not a quiet variation.
