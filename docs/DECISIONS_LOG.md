# DECISIONS LOG - every decision Fable made alone, and why

Matt, 2026-09-08 night, on accepting the same setup for the chess project:
"I am good with that as long as I can request details or see why you made
the decisions when needed." Newest first. One entry per decision: date, the
decision, the reason, what it changed, the commit, the report. Opus answers
his "why" from here, quoting the entry with its links - never a paraphrase,
never "Fable decided".

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
