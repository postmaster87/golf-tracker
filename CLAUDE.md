# CLAUDE.md - golf-tracker (repo rules; the global CLAUDE.md layers under this)

## 1. One chat, two roles - FLIPPED 2026-09-15 (Matt: "Run this on tracker as the initial test")

Matt's words, 2026-09-15, in the scratch session that set global Section 4:
"As I laid it out a week ago you are the manager Opus is the engineer so
why am I talking to the engineer and having it decide what you should do?"
Then, choosing this repo over OV's: "One problem this is reliant on OV and
he has family and obligations that I don't. Run this on tracker as the
initial test. I am going to try and play again this week and it had data
and major decisions to make that are an equally good test." This repo is
the measured trial of Fable-main (global CLAUDE.md Section 4, rule 13). The
09-10 layout ("I can run Opus by default and it hands the critical builds
and decisions off you") is history from this date; the FOR_FABLE log and
the REPORT files record it.

- **Matt talks to ONE chat: Fable's.** Fable is the manager and runs this
  repo's session at its saved default effort, medium. Fable decides,
  reviews, tests, signs, and spawns Opus for the building. For a design or
  review turn that needs more depth Fable asks Matt once, in one line
  naming the item and the class, and Matt sets the effort with `/effort`.
- **Opus is the engineer, reached only as a subagent Fable spawns**
  (`.claude/agents/opus.md`, model opus, effort high; Opus credits have
  headroom, Fable credits are the constraint). Opus builds everything that
  was Opus's on 09-10 - UI, styling, flow, screens, the play screen, the
  shot-detection ranking, the native build, docs, tests, commits - AND
  builds Fable-owned code from Fable's spec: the data model and its rails,
  the GPS precision pipeline, the strokes-gained engine and its benchmarks,
  the export format, a migration of logged rounds. Fable reviews every such
  diff before the next job and signs it in `docs/DECISIONS_LOG.md`.
- **What stays at xhigh, on Matt's word, unchanged:** the spec for a data
  model or storage schema, the GPS precision pipeline, the strokes-gained
  engine, any migration of already-logged rounds, and "9 more holes".
  Fable writes that spec at xhigh after Matt sets it; Opus builds it at
  high. His standing permission, 2026-09-12: "Build extra effort when
  needed is fully permitted". No item goes to xhigh for comfort.
- **The effort setting is his hand, not ours.** Fable's session opens at
  medium (`modelSettings` in the global settings). Global Section 4 rule 3
  names the classes that need high and xhigh; Fable asks once, Matt sets
  it. Opus sub-agents run at high by frontmatter and inherit nothing from
  the session. The `fable-low`, `fable-medium`, `fable` and `fable-xhigh`
  agent files are dormant: Fable does not spawn itself.
- **Cost is measured, not guessed.** Matt reads his usage page before the
  first message of a Fable session and after the last; the number goes in
  the session's last cost note. The ceiling is global Section 4 rule 11:
  15 percent of his weekly usage, Fable, all code sessions (his words,
  2026-09-15: "It should be set to 15% of my weekly usage not monthly
  across all code sessions. If more is needed that is my call to make").
  The priced runs in `docs/handoff/FOR_FABLE.md` (2.1 through 1.1, 17 to
  34 minutes and 194k to 368k sub-agent tokens each, n=5) are the old
  shape's numbers; the trial measures the new one. n is small and every
  cost note says so.

## 2. How Fable calls Opus

For any job that is Opus's to build (Section 1). Fable never builds what
Opus can build from a spec; Fable's own hands go to reviews, test verdicts,
decisions, specs and the documents that are Fable's.

Before the spawn: the tree committed and clean; one line to Matt in the
chat naming the job, the model (opus) and, for Fable-owned code, that a
spec is attached; Matt's words on the job VERBATIM in the prompt where they
exist (a paraphrase is not); the commit hash; every decision already made;
for Fable-owned code, the spec (what, where, the tests that prove it, what
it must not touch).

The call: the Agent tool, `subagent_type: "opus"`, `run_in_background:
true`. Fable keeps working while Opus runs - reading, deciding, writing
documents in its scratchpad, drafting the next spec - and makes NO writes
to the repo until Opus returns. One writing Opus at a time; read-only Opus
agents (research, verification, a detection-scoring run) may run in
parallel with it. If the custom type does not show in the session's agent
list, start a fresh session (they load at start); the fallback for one run
is `subagent_type: "general-purpose"` with `model: "opus"` and the text of
`.claude/agents/opus.md` pasted into the prompt.

Opus returns `DONE <hash>` or `BLOCKED <question>` as the last thing it
writes. Fable reads the diff at that hash (for Fable-owned code: against
the spec, line by line), runs the browser suite when the job touched the
lock, the marks, the track, the hole windows or round save, records the
review in `docs/DECISIONS_LOG.md`, and tells Matt in his chat what changed
and what he must decide, in his words. A BLOCKED costs a re-spawn with the
answer in the prompt; Opus never guesses to avoid one.

`docs/handoff/FOR_FABLE.md` is now Fable's own queue: Fable writes it,
works it in Matt's order, and moves answered items to
`docs/handoff/FOR_FABLE_LOG.md`. Opus does not write it. It is empty on the
flip date; the unqueued items that need his decision or his xhigh (the
native recorder, native storage and the migration of logged rounds, the
course map as app data, "9 more holes") stay where that file lists them.

When Matt asks why something was decided, Fable pulls the entry from
`docs/DECISIONS_LOG.md` and quotes it with the commit and the report.

## 3. Walls that do not move, for either role

- **The push is the deploy.** Pages serves `main`; `git push origin main`
  puts a build on his phone. Only on his word, in his chat, by Fable (since the flip; by Opus before 2026-09-15).
  Nobody says a build is live without a hash-verified fetch of the deployed
  `js/data/build.js`.
- **`REVISION` is bumped when a build is about to be played** - his call,
  never on a code change (`docs/REVISIONS.md`, "How to bump it"). `BUILD.id`
  and the `gt-shell-<id>` cache in `sw.js` move together on every deploy;
  the suite enforces it.
- **Round data and the course map may live in the public repo.** His words,
  2026-09-13: "yes it is public knowledge I golf a lot and where I work. I am a
  State of Iowa employee" and "the map and my data are fine in the public
  repo". Still stage by name and never `git add -A`. `docs/roundDownloads/`
  stays gitignored until he says to commit it; the yardage book photos in
  `docs/Veenker/` stay ignored ("yes git ignore the images").
- **Commits are `rusty9645@gmail.com`**, never the work email. Fable's end
  with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **No coaching.** Claude is a tool in the bag. No swing or game
  diagnosis; never second-guess his self-knowledge of his game.
- **His agenda, in his order.** He stops work that skips ahead. Next: the
  native phone app, his words 2026-09-13: "We need to wrap this session up.
  Get everything to a place I can start a new chat and get you building the
  app." Decisions, open questions and the timeline to his 2026-10-07 surgery
  are in `docs/HANDOFF-native-build.md`. Item 3 (mislogs, the forgotten phone
  in the cart) and "9 more holes" remain unstarted; "9 more holes" is designed
  at xhigh on his word, not before.
- **Every number with n.** Detection numbers come from
  `tools/detection-scoring.html`, benchmark constants from a published
  source or badged derived in `docs/benchmark-verification.md`. Recalled
  numbers have been wrong here twice.
- **The design rules:** the golfer is the source of truth about where he
  is, the app only suggests; measured and inferred are never silently
  mixed; propose and confirm, never detect and fill; nothing is guessed
  into course data; quarantine is a filter, not an act of memory.
- **Stay in this repo.** Look outside, do not touch.

## 4. Catch-up and tooling

- **Newest cold start (2026-09-15): `docs/handoff/NEXT_CHAT_2026-09-15.md`**
  (the phone debug session and where everything stands), then
  `docs/handoff/NEXT_CHAT_2026-09-14.md` and the handoff below.
- **Cold start for the native build: `docs/HANDOFF-native-build.md` first**
  (2026-09-13). The Veenker course map is `docs/course-map/veenker/`.
- Older cold start: `docs/CATCHUP-rev3-rev4.md`, then the rev 4 sections of
  `docs/REVISIONS.md`. The catch-up doc was written at build v19 and lags;
  `git log`, `js/data/build.js` and `js/data/revision.js` are the authority
  for where the build stands.
- Serve with `preview_start` name `golf-tracker` (`tools/devserver.py
  8123`). Never `python -m http.server` - no cache headers, and a run can
  pass against deleted code. `?sim=1` gives synthetic GPS.
- Tests run in the browser at `http://localhost:8123/test/` against the
  shipped modules. The "known intermittent" failure ("the deliberate gesture
  unlocks", pocket-lock group) is closed: Fable confirmed the v24 diagnosis
  on 2026-09-14 (`docs/handoff/REPORT_2.2.md`) - a hidden pane with no
  viewport emulation reports `window.innerHeight` 0, `zoneOf` at
  `window.innerHeight` fails exactly that test every time, `zoneOf` at the
  overlay's height passes it every time. A failure in that test is a real
  failure now. The two lie-card acceptance tests Fable left RED in 2.2
  (label fit, lie grid above the fold) pass from build v25, and so does the
  v25 test that the lie grid does not move when the burst ends: a failure in
  any of them is real too.
- Memory for this repo:
  `C:\Users\Administrator\.claude\projects\C--Temp-gitRepos-golf-tracker\memory\MEMORY.md`.
