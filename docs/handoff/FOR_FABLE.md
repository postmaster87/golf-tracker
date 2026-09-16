# FOR_FABLE - Fable's own queue since the flip (Matt, 2026-09-15: "Run this on tracker as the initial test")

Since 2026-09-15 Fable runs this repo's chat and spawns Opus (`.claude/agents/opus.md`)
for the building; this file is Fable's queue, written by Fable, worked in Matt's order,
one item at a time. Opus does not write it. Answered items move to
`docs/handoff/FOR_FABLE_LOG.md`; their write-ups are the `REPORT_*.md` files beside this
one. The rule is the repo's `CLAUDE.md` Sections 1-2. Everything below is the file as
Opus left it on the flip date; its "spawn" and "10% weekly" language is history (the
ceiling is now 15 percent of weekly usage across all code sessions, global Section 4
rule 11; there is no Fable spawn any more).

---

*(Header as it stood before the flip, kept for the record:)* Opus is the only writer. Fable is a subagent Opus spawns per item
(`.claude/agents/fable.md`; `fable-xhigh.md` only on Matt's "xhigh"), one
item per spawn, and Opus makes no writes to the repo until Fable returns.
Empty queue = Fable is not needed.

An item carries: Matt's words on it VERBATIM, the evidence (file:line, the
numbers with n, what was tried), and any decision he already made. The
spawn prompt repeats the item number, his words and the commit hash.

## RUN ORDER - set 2026-09-14

His words, 2026-09-13: "Opus you are on your own here. Anything you want Fable
to check make a file for it to run tomorrow night when credits reset". And:
"Next to know is I am out of Fable Usage until tomorrow night".

On 2026-09-14 two orders were written down: this file had 2.2, 1.1, 2.3, and
`docs/handoff/NEXT_CHAT_2026-09-14.md` had 2.2, 2.3, 1.1. Asked which, he
picked "2.2 → 2.3 → 1.1 (Recommended)".

**Then, the same night, 2.3 moved first.** He stopped the 2.2 spawn and wrote:
"let Fable analyze the data then we can talk about the round after it, All and
all it was pleasant". Asked which job Fable does first, he picked "2.3: the two
test apps" (the option said the v24 test waits), and then typed: "x-high your
are good to go".

**Fable's usage on this project, his words, 2026-09-14:** "Yes but Fable is
restricted 10% weekly usage on this project so plan accordingly and let me pick
if a usage choice needs made". So before every spawn Opus names the item, its
effort and the cost of the last comparable run, and he picks. Completed runs to
price from: 2.1 (effort high, 2026-09-11) took 29.2 min, 138 tool calls and
294,843 tokens reported at return; 2.3 (xhigh, 2026-09-14) took 33.4 min, 81
tool calls and 368,352 subagent tokens; 2.2 (effort high, 2026-09-14) took 33.8
min, 102 tool calls and 278,405 subagent tokens; 2.4 (effort high, 2026-09-15) took 17.4 min, 47 tool
calls and 193,922 subagent tokens; 1.1 (effort high, 2026-09-15) took 22.4 min, 45
tool calls and 231,994 subagent tokens. What share of his 10% any of
them was cannot be seen from here.

*(empty: every queued item is answered; the lines are in `FOR_FABLE_LOG.md`)*

2.3 ran first, at xhigh, and returned DONE `d892a39` (PASS,
`docs/handoff/REPORT_2.3.md`). 2.2 followed on his "make the four changes, then
run 2.2" and returned DONE `0a863a2`: FAIL for the course on one defect, the lie
grid below the fold at burst end (`docs/handoff/REPORT_2.2.md`). v24 stays off
the phone. Both lines are in `FOR_FABLE_LOG.md`. 2.4 (test build v25) ran on
his "Yes, run 2.4" and returned DONE `cb3ee9b`: PASS for the course
(`docs/handoff/REPORT_2.4.md`); its line is in the log too. 1.1 (the course
map) ran last, on his "Have Fable finish", and returned DONE `3ec6844`
(`docs/handoff/REPORT_1.1.md`).

Spawn with `subagent_type: "fable"` (`"fable-xhigh"` only on his xhigh), one at a time, `run_in_background: false`. The commit hash for the prompt is
`git log -1 --format=%h` at spawn, with `git status` clean. A re-test of a
reworked v24 is a new item, priced for him first, and **the push still waits
for his word** in his chat.

**Not queued - needs his decision or his "xhigh" first:** the native recorder
(GPS pipeline), native storage of rounds and tracks and moving his logged
rounds across (schema and migration), turning the course map into app course
data (1.1 classified it a data model / schema change, 2026-09-15: xhigh on
his word), and shell vs full native rewrite (decided 2026-09-13: native shell). See `docs/HANDOFF-native-build.md`.

## 1. Critical review and requests for what is Fable's (a data model or schema change; the GPS pipeline; the strokes-gained engine or a benchmark; the export format; a migration of logged rounds; a golf/Matt call Opus cannot list)

*(1.1 answered 2026-09-15 and moved to FOR_FABLE_LOG.md)*

## 2. Testing of a risky build (a build about to be played; anything touching the lock, the marks, the track, the hole windows or round save)

*(2.4 answered 2026-09-15 and moved to FOR_FABLE_LOG.md)*

*(2.2 answered 2026-09-14 and moved to FOR_FABLE_LOG.md)*

*(2.3 answered 2026-09-14 and moved to FOR_FABLE_LOG.md)*

## 3. Master-level fixes (failed twice, cannot reproduce, touches a design rule)

*(empty)*

## Answered by Fable (one line each, dated; Opus moves them to the log)

*(none - 2.3, 2.2, 2.4 and 1.1 moved to FOR_FABLE_LOG.md)*
