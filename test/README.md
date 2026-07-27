# Tests

Open `test/index.html` over `http://` (not `file://` — ES modules need a real origin):

```bash
python -m http.server 8123
```

then `http://localhost:8123/test/`. Green summary bar means everything passed; failures are listed with the assertion that broke.

The harness runs in the browser on purpose. There is no build step and no Node dependency, and it imports the **real shipped modules** and fetches the **real shipped CSS**, so nothing here can pass against a copy of the logic that isn't what deploys.

## Ground truth

`fixtures.js` holds distances computed with a **Vincenty inverse solution** on the WGS-84 ellipsoid — an iterative geodesic algorithm that shares no code or approach with the local tangent-plane projection the app uses. Agreement between the two is a real check rather than a restatement of the implementation. The app matches to within 2 cm from a 3 m putt out to 1.2 km.

To regenerate them, run a Vincenty implementation over the coordinate pairs in `fixtures.js` and paste the results back. The tolerance in `run.js` is 2 cm; if a change pushes past that, the projection has genuinely lost precision.

## What is covered

| Group | What it pins down |
|---|---|
| geodesy | distances vs Vincenty, symmetry, bearings, antimeridian wrap, unit conversion |
| stats | median, MAD robustness |
| gps burst reduction | multipath rejection, the accuracy gate, conservative error estimates, small-n behaviour, raw samples surviving |
| veenker scorecard | par and yardage sums, stroke indices, tee ordering |
| play order | front/back starts, nine-hole rounds |
| hole derivations | scores, putts, FIR/GIR/scrambling, penalties, entered distances, unfinished holes returning null |
| green workflow | finishing a hole with no cup mark, pace→feet conversion and provenance, pace recalibration, hole-position tiers, re-entry preserving the ball mark, zero-putt chip-ins |
| putting stats | 3-putt / 1-putt counts, proximity and lag medians, counts without distances |
| benchmark tables | every anchor Broadie states in the paper, Table 9 transcription, interpolation, skill ordering |
| strokes gained | the SG identity by hand, the paper's worked example, additivity, categorisation, penalties, unattributed shots, practice priority |
| trend statistics | sample sd, t-based intervals at small n, rolling windows reporting their real n, recency weighting doing real work |
| the open question | refusing a verdict until the gap clears its interval, naming the right culprit once it does, and pairing surviving a large common per-round shift |
| clubs | the bag and its order, putts auto-assigned the putter, club surviving into the analysis alongside measured shot length |
| pocket lock | replays of the round-1 field failure — sustained pressure, simultaneous contacts, same-half taps, a stale window and a smeared contact all fail to unlock |
| offline shell | walks the real import graph from `js/app.js` and asserts the service worker caches every module it finds, plus that every listed file resolves |
| undo | ordering, restore, renumbering |
| track decimation | movement/time thresholds, cap |
| course learning | running means, poor marks excluded, cup sanity check, starting-nine detection abstaining |
| storage footprint | coordinate precision, bytes per mark, per-round projection |
| export / import | round-trip fidelity, merge de-duplication, foreign files rejected |
| theme contrast | 18 colour pairs on each of the four palettes, against WCAG AA/AAA |

## Adding a test

```js
group('my area');

test('what should be true', () => {
  eq(actual, expected, 'message');       // strict equality
  near(actual, expected, tol, 'message'); // floating point
  assert(condition, 'message');
});
```

Helpers: `offsetM(base, north, east)` builds a coordinate an exact number of metres away, `fakeReduced(point, acc)` fakes a committed mark, and `fixAt(point, acc, ts)` fakes a raw GPS fix.
