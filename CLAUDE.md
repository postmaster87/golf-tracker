# CLAUDE.md - golf-tracker (repo rules; the global CLAUDE.md layers under this)

## 1. One chat, two roles (Matt, 2026-09-10)

His words: "Okay Fable just like we did for Rip I want to set a subagent up
for you so that I can run Opus by default and it hands the critical builds
and decisions off you."

- **Matt talks to ONE chat: Opus's.** Opus is the engineer and runs the
  project day to day: UI, styling, flow, screens, the play screen, the
  shot-detection ranking, docs, tests, commits, and the push on his word.
- **Fable is the manager, reached only as a subagent Opus spawns**
  (`.claude/agents/`: `fable-low.md`, `fable-medium.md`, `fable.md` at high,
  `fable-xhigh.md` - the ladder below). Fable owns the data model
  and every migration of logged rounds, the GPS precision pipeline, the
  strokes-gained engine and its benchmarks, and the storage and export
  rails; tests risky builds before they go to the course; makes
  master-level fixes. Opus RUNS those modules and never edits them - a need
  in any of them goes to `docs/handoff/FOR_FABLE.md` with the evidence, and
  Fable builds it.
- **The effort ladder** (global CLAUDE.md Section 4, rule 3, revised
  2026-09-15). A spawn runs at the lowest effort its item class needs, and
  Opus names the item, the class and the effort in its one-line cost note
  before the spawn:
  - **low** (`fable-low`): a readback, recording a ruling already made,
    moving answered lines to the log, re-running a named check - the browser
    suite - and reporting the counts.
  - **medium** (`fable-medium`): a small well-specified fix, a decision
    between options already laid out, checking a finished diff or build.
  - **high** (`fable`): real design, a rule reading, a test verdict on a
    risky build, a master-level fix.
  - **xhigh** (`fable-xhigh`): a data model or storage schema, the GPS
    precision pipeline, the strokes-gained engine, any migration of logged
    rounds.

  For an xhigh-class item Opus asks him once, in one line naming the item
  and the class, and he sets the effort; his standing permission for those
  classes is 2026-09-12: "Build extra effort when needed is fully
  permitted". No item goes to xhigh for comfort. A run that finds its item
  needs more does the part that does not, returns naming the part that does,
  and Opus re-spawns at that effort. Fable's ceiling is 15 percent of his
  weekly usage across all code sessions, his words 2026-09-15: "It should be
  set to 15% of my weekly usage not monthly across all code sessions. If
  more is needed that is my call to make."
- **Who writes Fable-owned code** (global CLAUDE.md Section 4, rule 4).
  Fable specs, Opus writes, Fable reviews the diff and signs - here that is
  the data model, the GPS precision pipeline and the strokes-gained engine.
  The review is itself a FOR_FABLE item, at the effort its class needs.
  Migrations of already-logged rounds and any change to the GPS pipeline
  stay xhigh on his word, unchanged.

## 2. How Opus calls Fable

Only for an item in `docs/handoff/FOR_FABLE.md` of the three kinds:
critical review and requests for what is Fable's; testing of a risky build
(a build about to be played; anything touching the lock, the marks, the
track, the hole windows or round save); master-level fixes (failed twice,
cannot reproduce, touches a design rule).

Before the spawn: the tree committed and clean; the item complete in
FOR_FABLE.md with Matt's words on it VERBATIM (never a paraphrase), the
evidence, and any decision he already made; one line to Matt in the chat
naming the item and the expected cost.

The call: the Agent tool, `subagent_type` from the ladder in Section 1
(`fable-low`, `fable-medium`, `fable`, `fable-xhigh`),
`run_in_background: false`. The prompt repeats the item number, his words
verbatim, the commit hash and his decisions. Opus waits and makes NO writes
to the repo until Fable returns - sequential by construction, one writer at
a time. `subagent_type: "fable-xhigh"` only when he said "xhigh" for that
item. If the custom types do not show in the session's agent list, start a
fresh session (they load at start); the fallback for one run is
`subagent_type: "general-purpose"` with `model: "fable"` and the text of
`.claude/agents/fable.md` pasted into the prompt.

Fable returns `DONE <hash>` or `BLOCKED <question>` as the last thing it
writes. Opus relays it to Matt VERBATIM in the chat, moves the Answered
line to `docs/handoff/FOR_FABLE_LOG.md`, and carries on. A BLOCKED costs a
re-spawn with the answer in the prompt; Fable never guesses to avoid one.

When Matt asks why something was decided, Opus pulls the entry from
`docs/DECISIONS_LOG.md` and quotes it with the commit and the report -
never "Fable decided".

## 3. Walls that do not move, for either role

- **The push is the deploy.** Pages serves `main`; `git push origin main`
  puts a build on his phone. Only on his word, in his chat, by Opus.
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

- **Newest cold start (2026-09-14): `docs/handoff/NEXT_CHAT_2026-09-14.md`**,
  then the handoff below.
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
