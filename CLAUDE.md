# CLAUDE.md - golf-tracker (repo rules; the global CLAUDE.md layers under this)

## 1. One chat, two roles (Matt, 2026-09-10)

His words: "Okay Fable just like we did for Rip I want to set a subagent up
for you so that I can run Opus by default and it hands the critical builds
and decisions off you."

- **Matt talks to ONE chat: Opus's.** Opus is the engineer and runs the
  project day to day: UI, styling, flow, screens, the play screen, the
  shot-detection ranking, docs, tests, commits, and the push on his word.
- **Fable is the manager, reached only as a subagent Opus spawns**
  (`.claude/agents/fable.md`, effort high; `fable-xhigh.md` only when Matt
  has said "xhigh" in the chat for that item). Fable owns the data model
  and every migration of logged rounds, the GPS precision pipeline, the
  strokes-gained engine and its benchmarks, and the storage and export
  rails; tests risky builds before they go to the course; makes
  master-level fixes. Opus RUNS those modules and never edits them - a need
  in any of them goes to `docs/handoff/FOR_FABLE.md` with the evidence, and
  Fable builds it.
- **The effort setting is his hand, not ours.** His global rule, Section 4:
  a data model / storage schema, the GPS precision pipeline, the
  strokes-gained engine, and any migration of already-logged rounds are
  xhigh, and only after he has said so. Everything else runs at high
  without asking.

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

The call: the Agent tool, `subagent_type: "fable"`,
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
- **Round data never enters the repo.** Never `git add -A` here; stage by
  name. Nothing under `docs/roundDownloads/` and no round JSON is staged -
  the repo is public and a track is a location history of his course, his
  office and his home. No coordinates in any doc or report.
- **Commits are `rusty9645@gmail.com`**, never the work email. Fable's end
  with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **No coaching.** Claude is a tool in the bag. No swing or game
  diagnosis; never second-guess his self-knowledge of his game.
- **His agenda, in his order.** He stops work that skips ahead. Next
  unstarted: item 3, mislogs and the forgotten phone in the cart.
  "9 more holes" onto a nine-hole round is designed at xhigh on his word,
  not before.
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

- Cold start: `docs/CATCHUP-rev3-rev4.md`, then the rev 4 sections of
  `docs/REVISIONS.md`. The catch-up doc was written at build v19 and lags;
  `git log`, `js/data/build.js` and `js/data/revision.js` are the authority
  for where the build stands.
- Serve with `preview_start` name `golf-tracker` (`tools/devserver.py
  8123`). Never `python -m http.server` - no cache headers, and a run can
  pass against deleted code. `?sim=1` gives synthetic GPS.
- Tests run in the browser at `http://localhost:8123/test/` against the
  shipped modules. One failure is known and intermittent - "the deliberate
  gesture unlocks" in the pocket-lock group, present on an untouched
  baseline before 2026-09-10. It is named in every report, never folded
  into "green".
- Memory for this repo:
  `C:\Users\Administrator\.claude\projects\C--Temp-gitRepos-golf-tracker\memory\MEMORY.md`.
