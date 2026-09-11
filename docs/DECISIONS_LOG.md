# DECISIONS LOG - every decision Fable made alone, and why

Matt, 2026-09-08 night, on accepting the same setup for the chess project:
"I am good with that as long as I can request details or see why you made
the decisions when needed." Newest first. One entry per decision: date, the
decision, the reason, what it changed, the commit, the report. Opus answers
his "why" from here, quoting the entry with its links - never a paraphrase,
never "Fable decided".

## 2026-09-11 - v23: the lie placeholder is not a schema revision (not xhigh)
- **Decision:** a GPS shot saved before its lie, stored `lie: 'fairway',
  lieInferred: true`, is not a data model / storage schema change and does
  not need his "xhigh". Item 2.1 proceeds at high.
- **Why:** the field and the value both already exist (`addTrackShot` has
  written the pair since agenda item 2); `newShot` and `migrate()` are
  untouched; export/import round-trips it as it already does; the SG engine
  never reads `lieInferred`; and across the 8 exports in
  `docs/roundDownloads/` (763 shots) not one shot carries `lieInferred`, so
  no logged round changes meaning under `lieUnanswered`. Caveat on record:
  "not asked yet" is derived from the pair (gps, lieInferred), not stored -
  the first other path to write `lieInferred` on a GPS shot makes this a
  schema item at xhigh.
- **Changed:** nothing. **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-11 - v23: the play screen is bounded to the viewport
- **Decision:** `#app { min-height: 100dvh }` became `height: 100dvh`, and
  the CANCEL SHOT / LIE LATER row under the saved-shot lie panel is pinned
  to one line (`.cap-row`). A global layout rule changed by Fable, under a
  testing verdict, in Opus's territory.
- **Why:** measured on the sim at 375x812 with club tracking on, the lie
  grid moved +60 px (2 to 3 shot rows) and +62 px (3 to 4) at the instant
  the burst ended - since v23 the new "Lie?" row appears then, and the page
  grew past the viewport and pushed the footer down, so SAND landed on TEE,
  RECOVERY on FAIRWAY, GREEN on ROUGH. That is a saved wrong lie on the
  course. Bounding the app is what `.body { overflow-y: auto }` on every
  screen already assumed; the row pin removed a further 22 px from
  "CANCEL SHOT" wrapping next to the lock tab's strip. After: 1 px at
  375x812 and 360x780; Settings, the Round card and the summary still
  scroll inside `.body`.
- **Changed:** `css/base.css`. **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-11 - v23: a shot saved for its lie clears the previous mark's UNDO banner
- **Decision:** `saveLieLater` calls `clearLastMark()`; a test in the
  mark-flow group holds it (proven to fail without the line).
- **Why:** the previous mark's "marked - UNDO" banner lives 20 s, and its
  UNDO takes the newest thing on the hole - which from burst end is the
  just-saved shot. On the sim "Shot 4 marked (Fairway). UNDO" removed shot
  5. The panel is that shot's own statement and CANCEL SHOT is its undo.
- **Changed:** `js/ui/screen-play.js`, `test/run.js`.
  **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-11 - v23: the pending-lie panel does not come back after a reload
- **Decision:** left as built. After a reload the shot reads "Lie?" in the
  list, MARK SHOT n+1 is offered, and the gaps gate asks before the round is
  saved; the panel itself is in-memory only.
- **Why:** a panel that reappeared after a reload would come back on
  whatever hole he had walked on from, in front of the shot he is about to
  mark; the list, the tap-to-edit and the gate already cover the data.
- **Changed:** nothing. **Report:** `docs/handoff/REPORT_2.1.md`.

## 2026-09-10 - Setup: what is Fable's in this repo, and what Opus keeps
- **Decision:** Fable's exclusive territory is the four things his global
  rule already puts at xhigh - the data model and its rails
  (`js/data/schema.js`, `store.js`, `trackstore.js`, `persistence.js`, the
  export format, every migration of logged rounds), the GPS precision
  pipeline (`js/gps/gps.js`, `js/util/geo.js`), and the strokes-gained
  engine (`js/analysis/*`) - plus testing verdicts on risky builds and
  master-level fixes. The shot-detection ranking
  (`js/round/track-analysis.js`) and the hole windows in `js/round/round.js`
  stay Opus's to build, with Fable testing before a field test. The push
  (`git push origin main`, which is the deploy) and the `REVISION` bump
  stay Matt's word, run by Opus.
- **Why:** he asked for "just like we did for Rip" - there the split was
  the brain and the vault, the two things where a wrong decision loses or
  leaks his data. Here those are the round records, the GPS numbers that
  feed them, and the strokes-gained math the app exists to get right; his
  own Section 4 rule already names exactly those four. Track-analysis is
  the live research problem and changes often, so it stays with the
  day-to-day engineer, but it never reaches the course untested.
- **Changed:** `.claude/agents/fable.md`, `.claude/agents/fable-xhigh.md`,
  `docs/handoff/FOR_FABLE.md`, `docs/handoff/FOR_FABLE_LOG.md`,
  `docs/DECISIONS_LOG.md`, `CLAUDE.md` (new, the Opus-side contract).
- **Report:** none - this was the setup session in Matt's own chat with
  Fable. **Commit:** `17dd43f`.
