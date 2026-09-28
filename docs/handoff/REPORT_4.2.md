# REPORT 4.2 - shot places revision 4.2: build v32 (Opus `77f89df`) and Fable's review

2026-09-28. Spec: `docs/SPEC_shot-places.md` Section 11. Built by Opus at
high from `9e1a548`; one run, 15:34 to 15:45 CDT, 12 min and 194k sub-agent
tokens by the harness count (n = 1). Filed by Fable from Opus's hand-back.
Sections 1 to 6 are Opus's findings; Section 7 is Fable's review.

## 1. What changed

| File | Change |
|---|---|
| `js/round/track-analysis.js` | New `teePos` option on `proposeHoleShots`. R1: `place.nearTee` for a stop within `TEE_AREA_M` = 40 m of `teePos`; it fails the pool test; no `teePos`, no rule. R2: `onGreen` is `lieAt` green AND not `inQuestion`; `afterGreen` starts at the first stop inside this hole's own green, not `inQuestion`, dwell 15 s or more. R3: `ground` is `own` when `nearestHole` returns this hole, or returns it as `runnerUp` with `marginM` <= `SHARED_GROUND_M` = 30. No other constant changed. Every stop is still returned in `places`. |
| `js/ui/screen-play.js` | The call in `openHoleEntry` passes `teePos`: his tee mark, else the map box centre, else null. |
| `test/run.js` | Tests 11 to 13, one per rule. |
| `tools/detection-scoring.html` | Three columns (v30 picker, v31, 4.2) and a "4.2 misses, by cause" table. |
| `js/data/build.js`, `sw.js` | v32 in both. `REVISION` untouched. |

## 2. Tests

- Against v31 first: 577/580, tests 11, 12 and 13 failing on their own
  behaviour. Final: **580/580**, none left red on purpose.
- Test 11 (R1): a stop 20 m from the box centre is not preselected and is in
  the list. Test 12 (R2): a stop 2 m inside hole 1's green edge at 5.0 m
  accuracy is in the pool. Test 13 (R3): a stop between holes 1 and 14,
  nearest hole 14, hole 1 runner-up at a 10.2 m margin, is `own`.

## 3. Scoring, the four labelled rounds, shots 2+

A pick counts within 10 m of his marked full shot. Shot 1 is placed from the
map box at the card yardage in the v31 and 4.2 columns. 2026-09-27 not used.

| Round | Map | Holes | v30 picker | v31 | 4.2 |
|---|---|---|---|---|---|
| FT4 Radcliffe | no | 9 | 6/9 | 2/9 | 2/9 |
| FT5 Veenker back 9 | yes | 9 | 10/17 | 9/17 | 12/17 |
| FT6 Veenker 14-18 | yes | 5 | 12/13 | 10/13 | 13/13 |
| FT6 Veenker hole 1 | yes | 1 | 1/2 | 1/2 | 1/2 |

**At Veenker: v30 23/32 (72%), v31 20/32 (63%), 4.2 26/32 (81%). n = 32
shots, 15 holes, 3 rounds. IN-SAMPLE: these are the 32 shots that showed the
faults 4.2 was written against.** Radcliffe has no map: 2/9 against the old
picker's 6/9.

## 4. The 4.2 misses by cause

| Cause | Veenker | Radcliffe |
|---|---|---|
| In the pool; the fall-maximising sequence chose other stops | 4 (FT5) | 5 |
| Read as on the green, not in question | 1 (FT5) | - |
| Starts after the first sure green stop | 1 (FT6 hole 1) | - |
| Stood under 15 s | - | 2 |
| **Total** | **6** | **7** |

Across the 15 Veenker windows R1 marked 49 stops `nearTee` and R3 put 53
stops on this hole's ground that the nearest hole assigns elsewhere. All are
still in the list.

## 5. What R2 lets into the pool (a finding, not tuned)

4 of the 32 preselections at Veenker sit inside a green polygon and read as
in question. 2 are his marked shots (FT6 holes 16 and 17, 3.4 m and 3.8 m
away). 2 are green stops that took a slot (FT5 holes 12 and 17). n = 4.

## 6. Where the spec was silent (Opus's choices)

1. `teePos` is his tee mark, else the box centre, else null.
2. "Within 40 m" is `<=` 40; "30 m or less" is `<=` 30.
3. `place.nearTee` is a field on the in-memory candidate only, never stored.
4. The R3 test uses hole 14 beside hole 1: hole 2 is never nearest with hole
   1 as runner-up within 500 m of hole 1's green (5 m grid).

## 7. Fable's review (medium), 2026-09-28

| Check | Result |
|---|---|
| Diff against Section 11 | 6 files; the three rules and the one call site, as written. No other constant changed. |
| Must-not-touch list | Nothing on it changed; `course-geometry.js` untouched. `REVISION` untouched. v32 in both files. |
| Suite | 580/580 at 360x728, Fable's run, n = 1. |
| Commit identity | `rusty9645@gmail.com`. |
| 2026-09-27 replay (illustration, not a labelled round) | The stop beside the tee is no longer offered as shot 2 on holes 14 and 1. Hole 1 now offers 13:47, 132 yd, fairway: the stop he picked by hand. Hole 3 offers a stop 18 yd from the green centre where he picked 82 yd by hand; hole 14 offers 31 yd where the stored pick was 130 yd. n = 7 holes with a shot after the tee. |

**Verdict: PASS for his phone.** The score is in-sample and is not proof the
rule generalises; his next round is the out-of-sample test. Two weaknesses
are known and unfixed: a stop on the green's edge can take a slot (Section
5), and a course with no map scores below the old picker (2/9 against 6/9,
n = 9).

**Owed:** install on his word; D1 at xhigh on his word; the MARK CUP button
on the next-hole prompt (REPORT 4.1 Section 7).
