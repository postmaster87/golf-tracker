# REPORT 3.2 - The green flow: cup, ball, putts, score, then the shots

Opus, 2026-09-16, spawned by Fable for one job. Tree at `214624a`, clean, at
the spawn. Built from `docs/SPEC_green-flow.md`. His words that bound it:

> "Is it possible for me to mark the cup, putt 1, and my score. Then the app
> computes the shot locations from the track and auto fill the lies and
> distances. Then I click on any entries to manually correct.?" (2026-09-13)

> "Workflow on the green mark the cup or my ball first whatever is easiest.
> Hole out - record the putt length for short putts, double check GPS for long
> putts, enter hole score (once this is entered the app needs to compute the
> shots and ask me questions about the lie. Shot 2 rough or fairway, shot 3
> green or fairway, etc..." (2026-09-15)

> "With the Green flow established at 20ft not 15" (2026-09-16, the ruling in
> `docs/DECISIONS_LOG.md` at `a778194`)

## 1. What he does differently on the green, in five lines

1. **GREEN** in the footer (it said ENTER PUTTS) opens one sheet that is the
   whole green.
2. At the top of it: **MARK CUP** and **MARK BALL**, either order, each a 3 s
   burst that comes straight back to the sheet. No lie is asked for the ball.
3. Putts as before. **Putt 1 at 20 ft and over: the GPS distance stands** and
   SAVE is ready with nothing typed. **Under 20 ft the sheet will not save**
   until he taps the number - it shows what GPS thinks, greyed, and says so.
4. **SAVE goes straight to the score** on a hole he did not mark: strokes and
   penalties only, the putts already in it and not asked twice. Then FIND MY
   SHOTS, the lie of each shot, SAVE HOLE.
5. The ball mark and the cup **survive the hole being written**, so the first
   putt stays a measured putt.

A hole he *did* mark is unchanged: SAVE ends it, because his marks are the
shots.

## 2. What changed

| file | change |
|---|---|
| `js/ui/screen-play.js` | `TYPED_PUTT_MAX_FT = 20` and `firstPuttEntryMode({gpsFt})` exported; the putt-1 field and SAVE gated on them; MARK CUP + MARK BALL head row on the green sheet (the cup control left the putt-1 field); `saveBall` and the `kind === 'putt'` branch in `commit`; `reopenPuttsAfterCup` renamed `reopenPuttsAfterMark` and used by both; `poorMarkWarning('ball')` re-marks in place rather than undoing; SAVE hands an unmarked hole to `openScoreCard`; `openHoleCard(hl, { fromSheet })`; `applyHoleEntry` keeps green shots that carry a mark; the footer's ENTER PUTTS became GREEN |
| `test/run.js` | new group "the green flow (cup, ball, putts, score)" - 9 tests, driven through the real screen, the real sheets and a real 1 Hz pocket track in IndexedDB |
| `test/index.html` | runs the new group |

Nothing else moved. Untouched: `js/gps/`, `js/util/geo.js`, `js/data/schema.js`
(`schemaVersion` and `formatVersion` unmoved - no new keys), `js/analysis/`,
`js/round/track-analysis.js`, `js/round/round.js`, every CSS file, the lie
card and its fold, the v27 hint strings, the mark burst, the pocket lock,
`js/native/*`, `android/*`.

**`BUILD.id` is NOT bumped, and neither is the `gt-shell-<id>` cache in
`sw.js`.** The bump is owed at the push, on his word - the suite enforces that
the two agree, so they move together in that commit. `REVISION` is his call as
always.

## 3. Departures from the spec

| spec line | what was built | why |
|---|---|---|
| 4(a) `TYPED_PUTT_MAX_FT` "near `CUP_AT_TEE_M` (1094)" | at module scope, above `playScreen`, with his words beside it | `CUP_AT_TEE_M` is inside the screen's closure and cannot be exported; spec test 1 holds `firstPuttEntryMode` directly, so both it and the constant are module-level exports. Nothing else about the placement changed. |
| 4(b) "the first `green` shot **with no mark** gets `mark` from `reduced`, else `addShot`" | the first `green` shot, marked or not, takes the mark; only a hole with no green shot at all gets a new one | spec test 4 requires "a second MARK BALL replaces the mark rather than adding a shot", which the literal reading would not do - by then the first green shot has a mark, so it would add a second. The reading both lines support is "the first green shot". |
| 4(b) the mark built in "the same shape `addShot` stores" | literally: `addShot` builds it, and on a re-mark the mark moves onto the existing putt and the spare shot is removed | no record is constructed in the UI layer; the shape is `addShot`'s by construction. |
| G3 the score card's "Penalty strokes (default 0)" | `penaltyStrokes(hl)`, which is 0 in this state | a penalty logged when it occurred (his standing rule) is attached to a shot of this hole, and a hard 0 would throw it away. Same number in the base case. |

Everything else is as written. No test is RED on purpose.

## 4. The suite

`http://localhost:8123/test/` (`tools/devserver.py 8123`, already serving this
tree - confirmed with a curl of a file this job changed), browser pane
fronted, viewport emulated **360 x 728** - his phone's page, REPORT 2.6.

| run | tree | result |
|---|---|---|
| 0 | `214624a`, before any change | **531 / 531** |
| 1 | step 1, the 20 ft rule | 535 / 535 |
| 2 | step 2, MARK BALL | 537 / 537 |
| 3 | step 3, the score card and the marks kept | **540 / 540** |

540 = 531 + 9. The v25-v27 fold group (spec test 7) is green on every run with
no new assertion: the footer did not grow.

### Every new test proven to fail against the defect first

Each mutation is one edit to `js/ui/screen-play.js`, run, then reverted.

| mutation | what it removes | result |
|---|---|---|
| M1 | the threshold: `firstPuttEntryMode` always answers `gps` | 533 / 535 - "a tenth under it is his to type: expected typed, got gps"; "SAVE would have saved a 12 ft putt GPS cannot measure" |
| M2 | his number: the threshold back at 15, which was Opus's recommendation and never his | 533 / 535 - "20ft not 15: expected 20, got 15"; "the sheet never asked for it: 12ft" |
| M3 | the "20 ft and over: GPS stands" line | 534 / 535 - "the sheet never says GPS stands at 20 ft and over" |
| M4 | the MARK BALL button, which is the state before step 2 | 535 / 537 - "the sheet has no way to mark the ball"; "no RE-MARK BALL offered once a ball is marked" |
| M5 | the `kind === 'putt'` branch, so the ball takes the generic shot path | 536 / 537 - "a second putt appeared out of a correction: expected 1, got 2" |
| M6 | G4: the hole write clearing every shot | 539 / 540 - "the hole write dropped the ball mark - the first putt is no longer measured" |
| M7 | SAVE's hand-off to the score card | 538 / 540 - "the sheet after SAVE was null"; "the shots stage was null" |
| M8 | `fromSheet`, so the card asks the putts again | 538 / 540 - "the putts were asked twice" **and "the typed first putt: expected 10, got null"** |

M8 is the field-test-3 failure written down: a first-putt distance asked twice
is a first-putt distance lost, and without it the hole contributes nothing to
strokes gained putting at all.

## 5. What was clicked in the real app, and what it read back

`?sim=1`, one tab, viewport 360 x 728, the dev sim round on Veenker's back
nine. n = 1 pass through the whole flow.

**The footer, hole 10 with 8 shots marked, against REPORT 2.6 Section 6:**

| | REPORT 2.6 (v26/v27) | now |
|---|---|---|
| footer height | 385.6 px | **385.6 px** |
| body bottom | 342.4 px | **342.4 px** |
| hint | "On the green: MARK CUP, then putts." | unchanged, 1 line |

The renamed button reads GREEN, 250 x 53.2 px, **0 px label spill** - G7's
verify, confirmed at 360 px. Every other footer control is where it was:
MARK SHOT 9 at 80 px, ENTER YARDAGES, MARK CUP, PENALTY, UNDO.

**The sheet's head row** on that hole - ball already marked, no cup: MARK CUP
at 129.7 px and RE-MARK BALL at 126.1 px side by side, 0 px spill each, and
SAVE & NEXT HOLE **disabled**: no cup, so no measurement, so the first putt is
his to type.

**The flow, hole 12, par 4, 306 yd, nothing marked:**

| step | what came back |
|---|---|
| GREEN | sheet "Hole 12 - putts", head row MARK CUP / MARK BALL, SAVE disabled |
| MARK BALL, burst ends | banner "Ball marked here.", **no lie card**, the sheet reopened, head row now MARK CUP / RE-MARK BALL |
| MARK CUP, burst ends | banner "Cup marked here.", the sheet reopened, head row RE-MARK CUP / RE-MARK BALL |
| putt 1 readout | 9ft, greyed at opacity 0.45, under "GPS says 9 ft - under 20 ft, type it." - SAVE still disabled |
| tap 8 on the grid | readout 8ft, **SAVE enabled** |
| SAVE | the score card "Hole 12 - how did it go?", with the fields **Strokes** and **Penalty strokes** and nothing else; "2 putts saved. Now the score, and the track finds the shots."; "2 full shots for the track to find."; "Score minus putts minus penalties is what the track looks for."; FIND MY SHOTS |
| FIND MY SHOTS | "Hole 12 - confirm your shots. The track found 2 stops on this hole. These are the 1 most shot-like, oldest first." and the shortfall stated honestly: "1 more stroke than the track found stops... tap PLAYED TWICE on it." |
| PLAYED TWICE, lie Fairway, SAVE HOLE | toast "Hole 12 saved from the track." |

Read back out of the store afterwards:

| seq | lie | source | mark method | distance |
|---|---|---|---|---|
| 1 | tee | track | track | - |
| 2 | fairway | track | track | - |
| 3 | green | **gps** | **burst** | **8 ft** |
| 4 | green | manual | - | - |

The cup is still there, method "burst", accuracy 1.46 m, stamped 60 s before
the green entry - the cup he marked, not one recovered from the track. That is
G4 in the real store: the hole was rebuilt out of the track and the two
measurements he took by hand survived it.

The sim only had two stops on that hole because the round had been sitting on
hole 10, so the shortfall message is the correct behaviour rather than a
defect. The auto-lock fired twice during the scripted pauses - over 10 s
between taps - and the sheet was still exactly where it was underneath it,
which is the designed behaviour; the taps after that were driven on the
elements.

## 6. Follow-ups, not done here

1. `docs/launch-checklist.md` line 52 still reads "Next tee: ENTER PUTTS ->
   count -> paced distances". The button is GREEN now and the sheet does more
   than the putts. One line, not touched by this job.
2. `learnGreen` is deliberately NOT fed by MARK BALL (spec 4(b)), so the course
   model still learns greens only from the lie card's marks. His call, later.
3. Lies from the course map, and the "in question" edge band, wait for the
   course-data spec at xhigh on his word. Every lie is still his tap, and NOT
   SURE still flags the app's guess.

## 7. His call

1. **The push.** Not taken. Three commits, not pushed. `BUILD.id` and the
   `gt-shell-<id>` cache are owed in the push commit.
2. **The footer label GREEN** (G7) and **the score card's default strokes, par
   or the putts plus one, whichever is more** (G3) were Fable's defaults and
   are his to change. On a par 4 with two putts the card opens at 4.
3. **One pass on the phone** when a build ships: on the green, GREEN, MARK
   BALL, MARK CUP, the putts, SAVE, the score, FIND MY SHOTS. The numbers to
   send back if anything is wrong are what the putt 1 readout said and whether
   SAVE was tappable.
