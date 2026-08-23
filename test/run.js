/**
 * Test harness. Runs in the browser (no Node required) against the real
 * shipped ES modules and the real shipped CSS — so nothing here can pass
 * against a copy of the logic that isn't what deploys.
 *
 * Open test/index.html over http:// and read the results.
 */

import { GEO_FIXTURES } from './fixtures.js';
import { distanceM, bearingDeg, radiiAt, toYards, toFeet, feetToM, weightedCentroid } from '../js/util/geo.js';
import { median, mad } from '../js/util/stats.js';
import { reduceBurst, GpsService } from '../js/gps/gps.js';
import { VEENKER, RADCLIFFE, playOrder, holeYards, newCustomCourse } from '../js/data/courses.js';
import {
  createRound,
  addShot,
  addTrackShot,
  insertTeeShot,
  setCupFromPaces,
  cupIsPaced,
  teeShot,
  teeIsInferred,
  rebuildCourseLearning,
  isPlayedRound,
  holeWindow,
  setCup,
  undoLast,
  restoreUndo,
  attachPenalty,
  setManualHole,
  setLaseredYards,
  laseredYards,
  laseredCount,
  setShotClub,
  setShotDistanceFt,
  setShotDistance,
  setGreenEntry,
  puttDistancesFt,
  penaltyStrokes,
  holePosition,
  isHoleComplete,
  learnGreen,
  accumulatedHolePosition,
  isFirstPutt,
  shotGeometry,
  holeStrokes,
  holePutts,
  firstPuttM,
  fir,
  gir,
  scramble,
  roundTotals,
  appendTrack,
  learnTee,
  learnCup,
  detectStartingNine,
  detectStartingHole,
  fmtDistance,
} from '../js/round/round.js';
import {
  newAppState,
  THEMES,
  migrate,
  summarizeRound,
  PENALTY_TYPES,
  ROUND_TYPES,
  isUnscored,
} from '../js/data/schema.js';
import {
  REVISION,
  REVISION_HISTORY,
  revisionInfo,
  roundRevisionLabel,
} from '../js/data/revision.js';
import {
  segmentTrack,
  stopCandidates,
  proposeStops,
  proposeFirstPutt,
  proposeHoleShots,
  candidateAccuracyM,
  locateCupFromPaces,
} from '../js/round/track-analysis.js';
import {
  createTrackWriter,
  readTrack,
  trackSize,
  deleteTrack,
  expandFix,
  pruneOrphanTracks,
  trackedRoundIds,
  openTrackDb,
} from '../js/data/trackstore.js';
import { expectedStrokes, validateBenchmarks, BASELINES } from '../js/analysis/benchmarks.js';
import {
  holeStrokesGained,
  roundStrokesGained,
  puttingSG,
  categorize,
  practicePriority,
  CATEGORIES,
  DEFAULT_SHORT_GAME_YARDS,
} from '../js/analysis/strokes-gained.js';
import * as pocketLock from '../js/ui/lock.js';
import { playScreen } from '../js/ui/screen-play.js';
import { CLUBS, SELECTABLE_CLUBS, clubOrder } from '../js/data/clubs.js';
import {
  mean as tMean,
  stdDev,
  tCritical95,
  summarise,
  rollingWindows,
  weightedPriority,
  hypothesisVerdict,
  categorySeries,
  buildSeries,
} from '../js/analysis/trends.js';
import {
  buildExport,
  buildExportWithTracks,
  importExport,
  restoreTracks,
  loadApp,
  saveRound,
  saveApp,
  loadRound,
  allRoundIds,
  deleteRound,
  upsertRoundSummary,
} from '../js/data/store.js';

/* ------------------------------------------------------- storage safety net */

/**
 * The export/import tests write to and clear real localStorage, because that is
 * the only way to test the real store. That makes this file capable of DELETING
 * LOGGED ROUNDS if it is ever opened on the same origin as live data — rounds
 * that cannot be re-collected.
 *
 * So the suite snapshots every `gt:` key before it runs and puts them back
 * afterwards. Opening test/index.html must never cost anyone a round.
 */
const STORAGE_SNAPSHOT = (() => {
  const snap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('gt:')) snap[k] = localStorage.getItem(k);
  }
  return snap;
})();

function restoreStorage() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith('gt:')) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(STORAGE_SNAPSHOT)) localStorage.setItem(k, v);
}

/* --------------------------------------------------------------- framework */

const results = [];
let currentGroup = '(root)';

function group(name) {
  currentGroup = name;
}

function test(name, fn) {
  try {
    fn();
    results.push({ group: currentGroup, name, ok: true });
  } catch (err) {
    results.push({ group: currentGroup, name, ok: false, error: err?.message ?? String(err) });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertion failed');
}

function near(actual, expected, tol, msg) {
  if (!Number.isFinite(actual)) throw new Error(`${msg ?? ''}: got non-finite ${actual}`);
  const d = Math.abs(actual - expected);
  if (d > tol) {
    throw new Error(`${msg ?? ''}: expected ${expected} ±${tol}, got ${actual} (off by ${d.toExponential(2)})`);
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg ?? ''}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ----------------------------------------------------------------- helpers */

/** Offset a coordinate by exact metres north/east, for building fixtures. */
function offsetM(base, north, east) {
  const { M, N } = radiiAt(base.lat);
  const R2D = 180 / Math.PI;
  return {
    lat: base.lat + (north / M) * R2D,
    lon: base.lon + (east / (N * Math.cos((base.lat * Math.PI) / 180))) * R2D,
  };
}

const TEE = { lat: 42.035, lon: -93.645 };

/** A reduced-burst-shaped object, so tests can build marks without a receiver. */
function fakeReduced(pt, acc = 2.5, quality = 'good') {
  return {
    lat: pt.lat,
    lon: pt.lon,
    accuracyM: acc,
    quality,
    spreadM: 1,
    usedCount: 4,
    sampleCount: 4,
    samples: [],
  };
}

function fixAt(pt, acc, ts = 0) {
  return { lat: pt.lat, lon: pt.lon, acc, alt: null, altAcc: null, speed: null, heading: null, ts };
}

/* ------------------------------------------------------------------- geodesy */

group('geodesy');

for (const f of GEO_FIXTURES) {
  test(`distance matches Vincenty: ${f.name}`, () => {
    near(distanceM(f.from, f.to), f.meters, 0.02, f.name);
  });
}

test('distance is symmetric', () => {
  const a = { lat: 42.035, lon: -93.645 };
  const b = offsetM(a, 137, -212);
  near(distanceM(a, b), distanceM(b, a), 1e-9, 'symmetry');
});

test('distance to self is zero', () => {
  eq(distanceM(TEE, { ...TEE }), 0, 'self distance');
});

test('null inputs give null, not NaN', () => {
  eq(distanceM(null, TEE), null, 'null from');
  eq(distanceM(TEE, null), null, 'null to');
});

test('offsetM round-trips through distanceM', () => {
  const p = offsetM(TEE, 300, 400); // 3-4-5 triangle => 500 m
  near(distanceM(TEE, p), 500, 0.01, '3-4-5');
});

test('bearing is correct on the cardinals', () => {
  near(bearingDeg(TEE, offsetM(TEE, 100, 0)), 0, 0.01, 'north');
  near(bearingDeg(TEE, offsetM(TEE, 0, 100)), 90, 0.01, 'east');
  near(bearingDeg(TEE, offsetM(TEE, -100, 0)), 180, 0.01, 'south');
  near(bearingDeg(TEE, offsetM(TEE, 0, -100)), 270, 0.01, 'west');
});

test('longitude wrap does not blow up across the antimeridian', () => {
  const a = { lat: 0, lon: 179.9999 };
  const b = { lat: 0, lon: -179.9999 };
  const d = distanceM(a, b);
  assert(d < 30, `expected a short hop across the antimeridian, got ${d} m`);
});

test('unit conversions', () => {
  near(toYards(91.44), 100, 1e-9, 'yards');
  near(toFeet(0.3048), 1, 1e-9, 'feet');
});

test('weighted centroid favours the more accurate fix', () => {
  // 1 m vs 5 m accuracy => weights 1 and 1/25, so the result sits ~3.8% of the
  // way toward the poor fix.
  const a = TEE;
  const b = offsetM(TEE, 0, 26);
  const c = weightedCentroid([fixAt(a, 1), fixAt(b, 5)]);
  const d = distanceM(a, c);
  near(d, 26 / 26, 0.05, 'inverse-variance position');
});

/* ------------------------------------------------------------------- stats */

group('stats');

test('median handles odd, even and empty', () => {
  eq(median([3, 1, 2]), 2, 'odd');
  eq(median([4, 1, 2, 3]), 2.5, 'even');
  eq(median([]), null, 'empty');
});

test('mad is robust to a single wild value', () => {
  const clean = mad([10, 10.5, 9.5, 10.2, 9.8]);
  const dirty = mad([10, 10.5, 9.5, 10.2, 9.8, 900]);
  assert(dirty < clean * 3, `MAD should barely move: ${clean} -> ${dirty}`);
});

/* --------------------------------------------------------- burst reduction */

group('gps burst reduction');

test('empty burst returns null', () => {
  eq(reduceBurst([]), null, 'empty');
  eq(reduceBurst(null), null, 'null');
});

test('tight cluster reduces to its centre', () => {
  const pts = [
    fixAt(offsetM(TEE, 0.5, 0.3), 3, 1),
    fixAt(offsetM(TEE, -0.4, 0.2), 3, 2),
    fixAt(offsetM(TEE, 0.1, -0.5), 3, 3),
    fixAt(offsetM(TEE, -0.2, 0.1), 3, 4),
  ];
  const r = reduceBurst(pts);
  assert(distanceM(TEE, r) < 0.6, `centre off by ${distanceM(TEE, r)} m`);
  eq(r.quality, 'good', 'quality');
  eq(r.usedCount, 4, 'used all four');
});

test('a wild multipath fix is rejected as an outlier', () => {
  const pts = [
    fixAt(offsetM(TEE, 0.5, 0.3), 3, 1),
    fixAt(offsetM(TEE, -0.4, 0.2), 3, 2),
    fixAt(offsetM(TEE, 0.1, -0.5), 3, 3),
    fixAt(offsetM(TEE, -0.2, 0.1), 3, 4),
    fixAt(offsetM(TEE, 45, 30), 3, 5), // 54 m away, but the receiver is confident
  ];
  const r = reduceBurst(pts);
  eq(r.usedCount, 4, 'outlier dropped');
  eq(r.samples[4].reject, 'outlier', 'reject reason');
  assert(distanceM(TEE, r) < 1, `outlier still moved the result by ${distanceM(TEE, r)} m`);
});

test('low-quality fixes are gated out before averaging', () => {
  const pts = [
    fixAt(offsetM(TEE, 0.2, 0.1), 2, 1),
    fixAt(offsetM(TEE, -0.2, 0.1), 2, 2),
    fixAt(offsetM(TEE, 30, 30), 25, 3), // 42 m away, acc 25 => above the 8 m gate
  ];
  const r = reduceBurst(pts);
  eq(r.samples[2].reject, 'accuracy', 'gated on accuracy');
  eq(r.usedCount, 2, 'two survivors');
  assert(distanceM(TEE, r) < 0.5, 'gated fix must not pull the mean');
});

test('an all-bad burst still returns a position, flagged poor', () => {
  const pts = [fixAt(TEE, 30, 1), fixAt(offsetM(TEE, 5, 5), 40, 2)];
  const r = reduceBurst(pts);
  assert(r, 'should not be null');
  eq(r.gatePassed, false, 'gate could not be satisfied');
  eq(r.quality, 'poor', 'quality');
});

test('reported accuracy is conservative, never sqrt(n) optimism', () => {
  const pts = Array.from({ length: 10 }, (_, i) => fixAt(offsetM(TEE, 0, 0), 4, i));
  const r = reduceBurst(pts);
  const naive = 4 / Math.sqrt(10); // ~1.26 m if errors were independent
  assert(r.accuracyM >= 0.6 * 4 - 1e-9, `floor violated: ${r.accuracyM}`);
  assert(r.accuracyM > naive, `accuracy ${r.accuracyM} is more optimistic than the naive ${naive}`);
});

test('single fix passes through with its own accuracy', () => {
  const r = reduceBurst([fixAt(TEE, 3.2, 1)]);
  eq(r.usedCount, 1, 'one sample');
  near(r.accuracyM, 3.2, 0.01, 'accuracy preserved');
  eq(r.spreadM, 0, 'no spread');
});

test('outlier rejection stands down when there is too little data to judge', () => {
  // Three fixes: the MAD would be meaningless, so nothing should be rejected.
  const pts = [fixAt(TEE, 3, 1), fixAt(offsetM(TEE, 1, 0), 3, 2), fixAt(offsetM(TEE, 12, 0), 3, 3)];
  const r = reduceBurst(pts);
  eq(r.usedCount, 3, 'kept all three');
});

test('raw samples survive reduction untouched', () => {
  const pts = [fixAt(TEE, 3, 1), fixAt(offsetM(TEE, 1, 1), 4, 2)];
  const r = reduceBurst(pts);
  eq(r.samples.length, 2, 'all samples retained');
  eq(r.samples[0].lat, TEE.lat, 'raw lat preserved');
  eq(r.samples[1].acc, 4, 'raw accuracy preserved');
});

/* ----------------------------------------------------------------- courses */

group('veenker scorecard integrity');

test('18 holes, par 72, nines are 36/36', () => {
  eq(VEENKER.holes.length, 18, 'hole count');
  const out = VEENKER.holes.slice(0, 9).reduce((a, h) => a + h.par, 0);
  const inn = VEENKER.holes.slice(9).reduce((a, h) => a + h.par, 0);
  eq(out, 36, 'OUT par');
  eq(inn, 36, 'IN par');
  eq(out + inn, VEENKER.par, 'total par matches declared par');
});

test('per-tee yardages sum to the published totals', () => {
  for (const tee of ['blue', 'gold', 'white', 'red']) {
    const total = VEENKER.holes.reduce((a, h) => a + h.yards[tee], 0);
    eq(total, VEENKER.teeSets[tee].yards, `${tee} total`);
  }
});

test('blue nines sum to 3351 and 3281', () => {
  const out = VEENKER.holes.slice(0, 9).reduce((a, h) => a + h.yards.blue, 0);
  const inn = VEENKER.holes.slice(9).reduce((a, h) => a + h.yards.blue, 0);
  eq(out, 3351, 'blue OUT');
  eq(inn, 3281, 'blue IN');
});

test('stroke indices are a permutation of 1..18, odd on the front', () => {
  const hcps = VEENKER.holes.map((h) => h.hcp).sort((a, b) => a - b);
  eq(JSON.stringify(hcps), JSON.stringify(Array.from({ length: 18 }, (_, i) => i + 1)), 'permutation');
  assert(VEENKER.holes.slice(0, 9).every((h) => h.hcp % 2 === 1), 'front nine should hold the odd indices');
  assert(VEENKER.holes.slice(9).every((h) => h.hcp % 2 === 0), 'back nine should hold the even indices');
});

test('yardages descend blue > gold > white >= red on every hole', () => {
  for (const h of VEENKER.holes) {
    assert(h.yards.blue >= h.yards.gold, `hole ${h.number} blue/gold`);
    assert(h.yards.gold >= h.yards.white, `hole ${h.number} gold/white`);
    assert(h.yards.white >= h.yards.red, `hole ${h.number} white/red`);
  }
});

group('play order');

test('front start plays 1..18', () => {
  const order = playOrder(VEENKER, 'front').map((h) => h.number);
  eq(order[0], 1, 'first hole');
  eq(order[17], 18, 'last hole');
});

test('back start plays 10..18 then 1..9', () => {
  const order = playOrder(VEENKER, 'back').map((h) => h.number);
  eq(order[0], 10, 'first hole');
  eq(order[8], 18, 'ninth hole');
  eq(order[9], 1, 'tenth hole');
  eq(order[17], 9, 'last hole');
});

test('nine-hole round truncates', () => {
  eq(playOrder(VEENKER, 'back', 9).length, 9, 'nine holes');
});

test('holeYards falls back when the tee set is missing', () => {
  const custom = newCustomCourse('Test Muni');
  eq(holeYards(custom.holes[0], 'blue'), null, 'no yardage set yet');
});

/* ------------------------------------------------------------- derivations */

group('hole derivations');

function par4Round() {
  return createRound({ course: VEENKER, teeSet: 'gold', startingNine: 'front', type: 'practice' });
}

test('a routine par: drive, approach, two putts', () => {
  const round = par4Round();
  const hole = round.holes[0]; // hole 1, par 4, 419 gold
  const cup = offsetM(TEE, 380, 0);
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 240, 5)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 372, 1)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 379.4, 0)) });
  setCup(hole, fakeReduced(cup));
  /*
   * The cup locates the hole; the green entry is what finishes it.
   *
   * Only the ball at rest is ever GPS-marked on the green, so the entry keeps
   * that mark as putt 1 and replaces anything after it with entered putts.
   * Putt 1 is left blank here so it measures ball-to-cup; the tap-in is stated.
   */
  setGreenEntry(hole, { putts: 2, distances: [null, 2], unit: 'feet' });

  eq(holeStrokes(hole), 4, 'strokes');
  eq(holePutts(hole), 2, 'putts');
  eq(fir(hole), true, 'fairway hit');
  eq(gir(hole), true, 'green in regulation');
  eq(scramble(hole), null, 'scrambling not applicable when GIR was hit');

  const geo = shotGeometry(hole);
  near(toYards(geo[0].toHoleM), toYards(380), 0.5, 'drive distance to hole');
  near(geo[0].lengthM, distanceM(TEE, offsetM(TEE, 240, 5)), 0.01, 'drive length');
  near(geo[3].toHoleM, 0.6, 0.2, 'tap-in distance');
  assert(geo[3].endsAtCup, 'last shot ends at the cup');
  near(toFeet(firstPuttM(hole)), toFeet(distanceM(offsetM(TEE, 372, 1), cup)), 0.01, 'first putt distance');
});

test('missed green then up-and-down counts as a scramble', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const cup = offsetM(TEE, 380, 0);
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 250, 25)) });
  addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 368, 12)) }); // chip
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 379, 1)) });
  setCup(hole, fakeReduced(cup));
  setGreenEntry(hole, { putts: 1, distances: [], unit: 'feet' });

  eq(holeStrokes(hole), 4, 'strokes');
  eq(fir(hole), false, 'missed fairway');
  eq(gir(hole), false, 'missed green in regulation');
  eq(scramble(hole), true, 'scrambled for par');
});

test('a chip-in from off the green is a GIR when it beats par - 2', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 250, 0)) });
  setCup(hole, fakeReduced(offsetM(TEE, 380, 0)));
  // Holing out from off the green is a green entry of zero putts — an explicit
  // statement, rather than inferring it from the presence of a cup mark.
  setGreenEntry(hole, { putts: 0, distances: [] });
  eq(holePutts(hole), 0, 'no putts');
  eq(gir(hole), true, 'holed out inside par - 2');
  eq(holeStrokes(hole), 2, 'strokes');
});

test('penalties add strokes and suppress the unmeasurable shot length', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const s1 = addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  attachPenalty(s1, { type: 'water', strokes: 1 });
  addShot(hole, { lie: 'tee', reduced: fakeReduced(offsetM(TEE, 2, 2)) }); // re-tee
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 245, 3)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 376, 1)) });
  setCup(hole, fakeReduced(offsetM(TEE, 380, 0)));
  setGreenEntry(hole, { putts: 1, distances: [], unit: 'feet' });

  eq(holeStrokes(hole), 5, '4 shots + 1 penalty');
  const geo = shotGeometry(hole);
  eq(geo[0].lengthM, null, 'penalised shot has no measurable length');
  assert(geo[0].toHoleM > 0, 'but it still has a distance to the hole');
  eq(gir(hole), false, 'penalty pushes it outside regulation');
});

test('driving the green counts as a fairway hit', () => {
  // Veenker's gold 2nd is 283 yd and the 3rd is 289 — genuinely driveable.
  const round = par4Round();
  const hole = round.holes[1];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 258, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [9, 1], unit: 'paces', paceFeet: 3 });
  eq(fir(hole), true, 'nothing better was available than the green');
  eq(gir(hole), true, 'and it is obviously a GIR');
});

test('missing the fairway into the rough is still a miss', () => {
  const round = par4Round();
  const hole = round.holes[1];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 240, 30)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 300, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [8, 1] });
  eq(fir(hole), false, 'rough is a miss');
});

test('par 3s report FIR as not-applicable', () => {
  const round = par4Round();
  const hole = round.holes.find((h) => h.par === 3);
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 150, 0)) });
  setCup(hole, fakeReduced(offsetM(TEE, 152, 0)));
  setGreenEntry(hole, { putts: 2, distances: [], unit: 'feet' });
  eq(fir(hole), null, 'FIR is meaningless on a par 3');
  eq(gir(hole), true, 'on in one');
});

test('an unfinished hole reports null, never a guess', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  eq(gir(hole), null, 'no GIR verdict without a finished hole');
  eq(scramble(hole), null, 'no scramble verdict either');
  eq(shotGeometry(hole)[0].toHoleM, null, 'no distance to an unmarked cup');
});

test('an entered distance overrides the GPS distance and is labelled', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const cup = offsetM(TEE, 380, 0);
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  const putt = addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 374, 0)) });
  setCup(hole, fakeReduced(cup));

  // GPS says ~20 ft; the player stepped off 14.
  const geoBefore = shotGeometry(hole)[1];
  eq(geoBefore.toHoleSource, 'cup', 'measured to the cup mark before entry');
  near(toFeet(geoBefore.toHoleM), toFeet(6), 0.5, 'GPS distance');

  setShotDistanceFt(putt, 14);
  const geoAfter = shotGeometry(hole)[1];
  eq(geoAfter.toHoleSource, 'feet', 'flagged with the unit it was entered in');
  near(toFeet(geoAfter.toHoleM), 14, 1e-9, 'entered distance wins');
  near(toFeet(firstPuttM(hole)), 14, 1e-9, 'first putt distance uses the override');

  setShotDistanceFt(putt, null);
  eq(shotGeometry(hole)[1].toHoleSource, 'cup', 'clearing reverts to the measured position');
});

test('a GPS-measured putt uses metres-to-feet, not the pace converter', () => {
  // Regression: a local helper named toFeet inside the putt sheet shadowed the
  // metres-to-feet import, so a measured putt was multiplied by the pace length
  // (3) instead of 3.28084. The result was ~9% short and looked entirely
  // plausible. These two conversions must never be confusable.
  const round = par4Round();
  const hole = round.holes[0];
  const cup = offsetM(TEE, 18.9, 0); // 62 ft
  addShot(hole, { lie: 'tee', reduced: fakeReduced(offsetM(TEE, -200, 0)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(TEE) });
  setCup(hole, fakeReduced(cup));
  setGreenEntry(hole, { putts: 2, distances: [], unit: 'paces', paceFeet: 3 });

  // Left unpaced, so the geometry answers — and it must answer in real feet.
  near(toFeet(firstPuttM(hole)), 62, 0.6, 'measured first putt in feet');
  const viaPaceConverter = 18.9 * 3; // what the shadowed helper produced
  assert(
    Math.abs(toFeet(firstPuttM(hole)) - viaPaceConverter) > 4,
    'must not agree with the pace conversion'
  );
});

test('an entered distance survives a bad or missing GPS mark', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  const putt = addShot(hole, { lie: 'green', reduced: null, source: 'manual' });
  setShotDistanceFt(putt, 9);
  eq(hole.shots[1].mark, null, 'no GPS mark at all');
  near(toFeet(firstPuttM(hole)), 9, 1e-9, 'still has a first-putt distance');
});

test('isFirstPutt identifies only the first green shot', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  const p1 = addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 370, 0)) });
  const p2 = addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 379, 0)) });
  eq(isFirstPutt(hole, p1), true, 'first putt');
  eq(isFirstPutt(hole, p2), false, 'second putt');
});

test('manual entry is honoured and stays flagged', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setManualHole(hole, { strokes: 6, putts: 2, firstPuttFt: 18, penalties: 1 });
  eq(holeStrokes(hole), 6, 'strokes');
  eq(holePutts(hole), 2, 'putts');
  near(toFeet(firstPuttM(hole)), 18, 0.01, 'first putt distance');
  const totals = roundTotals(round);
  eq(totals.manualHoles, 1, 'counted as hand-entered');
  eq(totals.gpsShots, 0, 'no measured shots');
});

group('lasered yardages (entered after the hole)');

test('yardages are stored on a hole with no shots on it at all', () => {
  // The point of these: under the continuous-track model nothing is marked
  // while the hole is played, so this MUST work against an empty shot list.
  const round = par4Round();
  const hole = round.holes[0];
  eq(hole.shots.length, 0, 'no shots marked');
  setLaseredYards(hole, [385, 152, 18]);
  eq(laseredYards(hole).length, 3, 'three entries kept');
  eq(laseredCount(hole), 3, 'three of them lasered');
  eq(hole.lasered.yards[1], 152, 'second shot yardage');
  assert(hole.lasered.enteredAt, 'stamped with when it was entered');
});

test('a blank row is kept, because "not lasered" is a fact about that shot', () => {
  const round = par4Round();
  const hole = round.holes[0];
  // Inside 60 yards Matt does not range it — the third shot here is a wedge.
  setLaseredYards(hole, [385, 152, null, 40]);
  eq(laseredYards(hole).length, 4, 'four shots described');
  eq(laseredYards(hole)[2], null, 'the un-ranged shot is still a shot');
  eq(laseredCount(hole), 3, 'but only three carry a measurement');
});

test('trailing blanks are dropped, so untouched rows do not invent shots', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setLaseredYards(hole, [385, 152, null, null, null]);
  eq(laseredYards(hole).length, 2, 'the empty tail is not a claim');
});

test('junk and non-positive entries become blanks rather than numbers', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setLaseredYards(hole, ['385', '', 'abc', 0, -12, 151.6]);
  eq(laseredYards(hole)[0], 385, 'numeric strings are accepted');
  eq(laseredYards(hole)[1], null, 'empty is blank');
  eq(laseredYards(hole)[2], null, 'text is blank');
  eq(laseredYards(hole)[3], null, 'zero is blank');
  eq(laseredYards(hole)[4], null, 'negative is blank');
  // A laser reads to the yard; storing more precision would overstate it.
  eq(laseredYards(hole)[5], 152, 'rounded to whole yards');
});

test('an all-blank entry clears rather than storing an empty record', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setLaseredYards(hole, [385, 152]);
  setLaseredYards(hole, ['', '', '']);
  eq(hole.lasered, null, 'cleared');
  eq(laseredCount(hole), 0, 'and reads as none');
});

test('yardages survive an export/import round trip', () => {
  // These are the ground truth the GPS gets checked against, so losing them in
  // transport would silently remove the only reference the track has.
  const round = par4Round();
  setLaseredYards(round.holes[0], [385, null, 96]);
  const restored = migrate(JSON.parse(JSON.stringify(round)));
  eq(laseredYards(restored.holes[0])[0], 385, 'first survives');
  eq(laseredYards(restored.holes[0])[1], null, 'the blank survives as a blank');
  eq(laseredYards(restored.holes[0])[2], 96, 'third survives');
});

test('yardages are independent of shots, penalties and hand entry', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setLaseredYards(hole, [385, 152]);
  setManualHole(hole, { strokes: 5, putts: 2, firstPuttFt: 12, penalties: 0 });
  eq(laseredCount(hole), 2, 'hand entry does not disturb them');
  eq(holeStrokes(hole), 5, 'and they add nothing to the score');
});

group('gps watch recovery (the phone gets locked)');

/**
 * Stub `navigator.geolocation`. It is getter-only, so plain assignment throws —
 * the same trap that once blanked the app from the dev simulator.
 */
function withStubbedGeolocation(fn) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  const calls = { watch: 0, cleared: [] };
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: () => ++calls.watch,
      clearWatch: (id) => calls.cleared.push(id),
      getCurrentPosition: () => {},
    },
  });
  try {
    return fn(calls);
  } finally {
    if (original) Object.defineProperty(navigator, 'geolocation', original);
    else delete navigator.geolocation;
  }
}

test('restart tears down the old watch and arms a fresh one', () => {
  withStubbedGeolocation((calls) => {
    const gps = new GpsService();
    gps.start();
    const first = gps.watchId;
    eq(calls.watch, 1, 'one watch armed');
    gps.restart();
    eq(calls.cleared[0], first, 'the dead watch is cleared by its own id');
    eq(calls.watch, 2, 'and a replacement is armed');
    assert(gps.running, 'still running afterwards');
  });
});

test('restart on a stopped service does not quietly start one', () => {
  withStubbedGeolocation((calls) => {
    const gps = new GpsService();
    gps.restart();
    eq(calls.watch, 0, 'nothing armed');
    eq(gps.running, false, 'and it stays stopped');
  });
});

test('a service that has never had a fix reads as infinitely stale', () => {
  // Load-bearing: this is what makes the post-unlock check fire when the freeze
  // killed the watch before any fix landed. Treating "never" as "just now"
  // would leave exactly that case unrecovered.
  withStubbedGeolocation(() => {
    const gps = new GpsService();
    eq(gps.staleSinceMs(), Infinity, 'no fix yet');
    gps.last = { ts: Date.now() };
    assert(gps.staleSinceMs() < 100, 'a fresh fix is not stale');
  });
});

test('stopping cancels a pending revive, so it cannot resurrect a dead service', () => {
  withStubbedGeolocation(() => {
    const gps = new GpsService();
    gps.start();
    gps._reviveTimer = setTimeout(() => gps.restart(), 5);
    gps.stop();
    eq(gps.running, false, 'stopped');
    eq(gps._reviveTimer, null, 'and the pending revive is cancelled');
  });
});

group('green workflow (no phone on the green)');

/** Tee shot, approach onto the green, then putts entered afterwards. */
function greenHole({ putts = 2, distances = [18, 2], unit = 'paces', paceFeet = 3, markBall = true } = {}) {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 240, 5)) });
  if (markBall) addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 372, 1)) });
  setGreenEntry(hole, { putts, distances, unit, paceFeet });
  return { round, hole };
}

test('a hole finishes with no cup mark at all', () => {
  const { hole } = greenHole();
  eq(hole.cup, null, 'never marked the cup');
  eq(isHoleComplete(hole), true, 'still a finished hole');
  eq(holeStrokes(hole), 4, '2 full shots + 2 putts');
  eq(holePutts(hole), 2, 'putts');
  eq(gir(hole), true, 'on in regulation');
});

test('paces convert to feet and keep their provenance', () => {
  const { hole } = greenHole({ distances: [18, 2], unit: 'paces', paceFeet: 3 });
  const putts = hole.shots.filter((s) => s.lie === 'green');
  eq(putts[0].distanceFt, 54, '18 paces at 3 ft');
  eq(putts[1].distanceFt, 6, '2 paces at 3 ft');
  eq(putts[0].distanceEntry.value, 18, 'raw count kept');
  eq(putts[0].distanceEntry.unit, 'paces', 'unit kept');
  eq(putts[0].distanceEntry.paceFeet, 3, 'pace length kept, so it can be recalibrated later');
  near(toFeet(firstPuttM(hole)), 54, 1e-9, 'first putt distance');
});

test('a recalibrated pace can be reapplied to a logged round', () => {
  const { hole } = greenHole({ distances: [18, 2], unit: 'paces', paceFeet: 3 });
  const putt = hole.shots.find((s) => s.lie === 'green');
  const { value, unit } = putt.distanceEntry;
  setShotDistance(putt, { value, unit, paceFeet: 2.9 });
  near(putt.distanceFt, 52.2, 1e-6, '18 paces at a recalibrated 2.9 ft');
});

test('the ball on the green locates the hole when the cup was never marked', () => {
  const { hole } = greenHole({ distances: [18, 2] });
  const pos = holePosition(hole);
  eq(pos.source, 'ball-on-green', 'derived from the ball');
  // Uncertainty is the first putt (54 ft = 16.5 m) plus the mark's own accuracy.
  assert(pos.uncertaintyM > 16 && pos.uncertaintyM < 20, `uncertainty ${pos.uncertaintyM} m`);

  const geo = shotGeometry(hole);
  eq(geo[0].toHoleSource, 'ball-on-green', 'tee shot measured to the ball');
  // The error this introduces on a full shot is the putt length — under 4% here.
  const err = toYards(feetToM(54)) / toYards(geo[0].toHoleM);
  assert(err < 0.05, `hole-position error is ${(err * 100).toFixed(1)}% of the tee shot`);
});

test('a cup mark still wins when one is taken', () => {
  const { hole } = greenHole();
  setCup(hole, fakeReduced(offsetM(TEE, 380, 0)));
  const pos = holePosition(hole);
  eq(pos.source, 'cup', 'cup beats the ball');
  eq(shotGeometry(hole)[0].toHoleSource, 'cup', 'and is used for the distances');
});

test('putts keep their paced distance even when a cup is marked', () => {
  const { hole } = greenHole({ distances: [18, 2] });
  setCup(hole, fakeReduced(offsetM(TEE, 380, 0)));
  const geo = shotGeometry(hole);
  const puttGeo = geo.find((g) => g.shot.lie === 'green');
  near(toFeet(puttGeo.toHoleM), 54, 1e-9, 'paced distance is not overwritten by GPS');
  eq(puttGeo.toHoleSource, 'paces', 'and is labelled as paced');
});

test('the ball on the green never reports a zero distance to itself', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 372, 1)) });
  // Putts not entered yet: the ball is the hole reference, so its own distance
  // is unknown — reporting 0 ft would be a fabricated tap-in.
  const geo = shotGeometry(hole);
  eq(geo[1].toHoleM, null, 'unknown, not zero');
  eq(geo[1].toHoleSource, null, 'and no source is claimed');
  assert(geo[0].toHoleM > 300, 'while the tee shot is still measured against it');

  setGreenEntry(hole, { putts: 2, distances: [10, 1], unit: 'paces', paceFeet: 3 });
  near(toFeet(shotGeometry(hole)[1].toHoleM), 30, 1e-9, 'once paced, it has a real distance');
});

test('a second putt with no distance recorded is null, not invented', () => {
  const { hole } = greenHole({ putts: 2, distances: [18] });
  const dists = puttDistancesFt(hole);
  eq(dists[0], 54, 'first putt paced');
  eq(dists[1], null, 'second putt left blank');
  eq(holePutts(hole), 2, 'but the count is still right');
});

test('holing out from off the green records zero putts', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 250, 20)) });
  setGreenEntry(hole, { putts: 0, distances: [] });
  eq(holePutts(hole), 0, 'no putts');
  eq(holeStrokes(hole), 2, 'chipped in');
  eq(isHoleComplete(hole), true, 'hole is done');
});

test('re-entering putts replaces them and preserves the ball mark', () => {
  const { hole } = greenHole({ putts: 2, distances: [18, 2] });
  const ballMark = hole.shots.find((s) => s.lie === 'green').mark;
  assert(ballMark, 'ball on green was marked');

  setGreenEntry(hole, { putts: 3, distances: [20, 4, 1] });
  const putts = hole.shots.filter((s) => s.lie === 'green');
  eq(putts.length, 3, 'now a three-putt');
  eq(putts[0].mark, ballMark, 'the GPS mark survived the re-entry');
  eq(putts[0].distanceFt, 60, 'and picked up the new distance');
  eq(holeStrokes(hole), 5, 'strokes updated');
});

test('undoing a green entry hands the hole back to the GPS marks', () => {
  const { hole } = greenHole({ putts: 2, distances: [18, 2] });
  const token = undoLast(hole);
  eq(token.kind, 'green', 'green entry comes off first');
  eq(hole.greenEntry, null, 'cleared');
  eq(isHoleComplete(hole), false, 'hole reopens');
  eq(hole.shots.filter((s) => s.lie === 'green').length, 1, 'the marked ball stays');
  eq(hole.shots[2].distanceFt, null, 'its paced distance is cleared');

  restoreUndo(hole, token);
  eq(hole.shots.filter((s) => s.lie === 'green').length, 2, 'both putts back');
  eq(hole.shots[2].distanceFt, 54, 'distance restored');
  eq(isHoleComplete(hole), true, 'hole complete again');
});

test('green marks accumulate a hole position for later rounds', () => {
  const app = newAppState();
  const { round, hole } = greenHole();
  const ball = hole.shots.find((s) => s.lie === 'green');
  learnGreen(app, round, hole.number, ball.mark);
  learnGreen(app, round, hole.number, ball.mark);
  const pos = accumulatedHolePosition(app, 'veenker', hole.number);
  eq(pos.source, 'accumulated-green', 'green fallback available');
  eq(pos.n, 2, 'two samples');
  assert(pos.uncertaintyM > 10, 'and it is honest about being an estimate');
});

test('an accumulated position rescues a hole with no green mark', () => {
  const app = newAppState();
  const seed = greenHole();
  learnCup(app, seed.round, 1, { ...fakeReduced(offsetM(TEE, 380, 0)) });

  const { hole } = greenHole({ markBall: false });
  eq(holePosition(hole), null, 'nothing in this round locates the hole');
  const fallback = accumulatedHolePosition(app, 'veenker', 1);
  const geo = shotGeometry(hole, fallback);
  eq(geo[0].toHoleSource, 'accumulated-cup', 'falls back to accumulated data');
  assert(geo[0].toHoleM > 300, 'and produces a usable distance');
  eq(geo[0].toHoleUncertaintyM, 12, 'with the error bar attached');
});

group('putting stats');

test('three-putts, one-putts, proximity and lag are counted per round', () => {
  const round = par4Round();
  const plan = [
    { putts: 1, d: [12] }, // one-putt from 36 ft
    { putts: 2, d: [20, 2] },
    { putts: 3, d: [30, 6, 2] }, // the one to eliminate
    { putts: 2, d: [8, 1] },
  ];
  plan.forEach((p, i) => {
    const hole = round.holes[i];
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 150, 0)) });
    setGreenEntry(hole, { putts: p.putts, distances: p.d, unit: 'paces', paceFeet: 3 });
  });

  const t = roundTotals(round);
  eq(t.onePutts, 1, 'one-putts');
  eq(t.twoPutts, 2, 'two-putts');
  eq(t.threePlusPutts, 1, 'three-putts');
  eq(t.holesWithPuttData, 4, 'holes counted');
  eq(t.putts, 8, 'total putts');
  eq(JSON.stringify(t.proximityFt), JSON.stringify([36, 60, 90, 24]), 'first-putt distances in feet');
  eq(JSON.stringify(t.lagFt), JSON.stringify([6, 18, 3]), 'leaves after the first putt');
});

test('a hole with a putt count but no distances still counts toward 3-putts', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 150, 0)) });
  setGreenEntry(hole, { putts: 3, distances: [] });
  const t = roundTotals(round);
  eq(t.threePlusPutts, 1, 'counted');
  eq(t.proximityFt.length, 0, 'but contributes no proximity');
});

group('editing a finished round');

/**
 * The golfer is the source of truth about what happened, so a saved round has
 * to stay fully malleable. These pin the invariants the edit screen relies on:
 * completed holes accept changes, derivations follow, and nothing about editing
 * quietly reopens a round that was finished.
 */
test('a completed hole can be re-scored and the derivations follow', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 330, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [12, 1], unit: 'feet' });
  round.status = 'completed';
  // The ball marked on the green IS the first putt, so this is tee + 2 putts.
  eq(holeStrokes(hole), 3, 'as first logged');

  // Weeks later: it was actually a three-putt.
  setGreenEntry(hole, { putts: 3, distances: [12, 4, 1], unit: 'feet' });
  eq(holeStrokes(hole), 4, 'score follows the correction');
  eq(roundTotals(round).threePlusPutts, 1, 'and so do the putting stats');
  eq(round.status, 'completed', 'editing does not reopen the round');
});

test('a hole missed entirely can be added afterwards', () => {
  const round = par4Round();
  round.status = 'completed';
  const hole = round.holes[13]; // the hole the app lost in round 1
  eq(isHoleComplete(hole), false, 'nothing logged at the time');

  setManualHole(hole, { strokes: 3, putts: 1, firstPuttFt: 3 });
  eq(holeStrokes(hole), 3, 'the birdie is recorded');
  eq(roundTotals(round).holes, 1, 'and it counts toward the round');
  const sg = holeStrokesGained(hole, { baseline: 'scratch' });
  assert(sg.categories.putting > 0, 'a 3-foot one-putt gains putting strokes');
});

test('a hand-entered hole without a putt distance is honest about it', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setManualHole(hole, { strokes: 5, putts: 2 }); // no firstPuttFt
  const sg = holeStrokesGained(hole, { baseline: 'scratch' });
  eq(sg.categories.putting, 0, 'no putting SG can be computed');
  eq(sg.unattributed, 5, 'every stroke is reported as unattributed');
  assert(sg.reasons.length > 0, 'with the reason stated');
});

test('correcting a lie on a finished hole moves the strokes between categories', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  const second = addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 240, 0)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 340, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [15, 2], unit: 'feet' });
  const before = holeStrokesGained(hole, { baseline: 'tour' }).shots[1].expectedStart;

  second.lie = 'fairway'; // it was actually in the short stuff
  const after = holeStrokesGained(hole, { baseline: 'tour' }).shots[1].expectedStart;
  assert(after < before, `fairway should be easier than rough: ${after} vs ${before}`);
  eq(fir(hole), true, 'and the fairway now counts as hit');
});

group('undo');

test('undo removes the last mark and restore puts it back', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 240, 0)) });
  const token = undoLast(hole);
  eq(hole.shots.length, 1, 'one shot left');
  eq(token.kind, 'shot', 'undid a shot');
  restoreUndo(hole, token);
  eq(hole.shots.length, 2, 'restored');
  eq(hole.shots[1].seq, 2, 'sequence renumbered correctly');
});

test('a hand entry overrides the GPS shots without destroying them', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 240, 0)) });
  setManualHole(hole, { strokes: 7, putts: 3 });

  eq(holeStrokes(hole), 7, 'hand entry wins');
  eq(hole.shots.length, 2, 'the marks are still there');

  // Undo takes the hand entry off first, handing control back to the marks.
  const token = undoLast(hole);
  eq(token.kind, 'manual', 'manual comes off first');
  eq(holeStrokes(hole), 2, 'derivations revert to the GPS shots');
  restoreUndo(hole, token);
  eq(holeStrokes(hole), 7, 'and it can be put back');
});

test('undo prefers the cup, then shots', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  setCup(hole, fakeReduced(offsetM(TEE, 300, 0)));
  eq(undoLast(hole).kind, 'cup', 'cup first');
  eq(hole.cup, null, 'cup cleared');
  eq(hole.completedAt, null, 'hole reopened');
  eq(undoLast(hole).kind, 'shot', 'then the shot');
  eq(undoLast(hole), null, 'and then nothing');
});

group('round totals');

test('totals aggregate only completed holes', () => {
  const round = par4Round();
  for (let i = 0; i < 3; i++) {
    const hole = round.holes[i];
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 200, 0)) });
    addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 300, 0)) });
    addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 305, 0)) });
    setCup(hole, fakeReduced(offsetM(TEE, 306, 0)));
    setGreenEntry(hole, { putts: 2, distances: [], unit: 'feet' });
  }
  // Shots but no putts recorded — a hole under way, not a finished one, even
  // though a cup mark would once have been enough to count it.
  addShot(round.holes[3], { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(round.holes[4], { lie: 'tee', reduced: fakeReduced(TEE) });
  setCup(round.holes[4], fakeReduced(offsetM(TEE, 300, 0)));
  const t = roundTotals(round);
  eq(t.holes, 3, 'three complete holes');
  eq(t.strokes, 12, 'strokes');
  eq(t.putts, 6, 'putts');
  eq(t.par, round.holes.slice(0, 3).reduce((a, h) => a + h.par, 0), 'par of those holes');
  eq(t.toPar, t.strokes - t.par, 'to par');
});

/* ----------------------------------------------------------------- tracking */

group('track decimation');

test('breadcrumb only records on real movement or elapsed time', () => {
  const round = par4Round();
  const t0 = 1_700_000_000_000;
  eq(appendTrack(round, { ...fixAt(TEE, 3, t0) }), true, 'first point always kept');
  eq(appendTrack(round, { ...fixAt(offsetM(TEE, 2, 0), 3, t0 + 1000) }), false, 'standing still, moments later');
  eq(appendTrack(round, { ...fixAt(offsetM(TEE, 40, 0), 3, t0 + 2000) }), true, 'walked 40 m');
  eq(appendTrack(round, { ...fixAt(offsetM(TEE, 41, 0), 3, t0 + 60000) }), true, 'a minute passed');
  eq(round.track.length, 3, 'three points');
});

test('breadcrumb is capped', () => {
  const round = par4Round();
  for (let i = 0; i < 60; i++) {
    appendTrack(round, fixAt(offsetM(TEE, i * 50, 0), 3, i * 60000), { cap: 20 });
  }
  eq(round.track.length, 20, 'cap enforced');
});

/* ------------------------------------------------------- accumulated course */

group('course learning');

test('tee positions accumulate as a running mean', () => {
  const app = newAppState();
  const round = par4Round();
  learnTee(app, round, 1, { ...fakeReduced(TEE), quality: 'good' });
  learnTee(app, round, 1, { ...fakeReduced(offsetM(TEE, 10, 0)), quality: 'good' });
  const entry = app.courseLearning.veenker.tees[1].gold;
  eq(entry.n, 2, 'two observations');
  near(distanceM(entry, offsetM(TEE, 5, 0)), 0, 0.05, 'midway between the two');
});

test('poor-quality marks are not learned from', () => {
  const app = newAppState();
  const round = par4Round();
  learnTee(app, round, 1, { ...fakeReduced(TEE), quality: 'poor' });
  eq(app.courseLearning?.veenker?.tees?.[1], undefined, 'nothing recorded');
});

test('a cup mark far from history raises a warning', () => {
  const app = newAppState();
  const round = par4Round();
  const cup = offsetM(TEE, 380, 0);
  learnCup(app, round, 1, fakeReduced(cup));
  learnCup(app, round, 1, fakeReduced(offsetM(cup, 5, 5)));
  const clean = learnCup(app, round, 1, fakeReduced(offsetM(cup, 8, 0)));
  eq(clean.warning, null, 'a normal pin position is fine');
  const wrong = learnCup(app, round, 1, fakeReduced(offsetM(cup, 300, 0)));
  assert(wrong.warning, 'a mark 300 m away should be flagged');
});

test('starting-nine detection stays silent until both tees are seeded', () => {
  const app = newAppState();
  const round = par4Round();
  eq(detectStartingNine(app, VEENKER, 'gold', fakeReduced(TEE)), null, 'unseeded => no opinion');

  learnTee(app, round, 1, fakeReduced(TEE));
  eq(detectStartingNine(app, VEENKER, 'gold', fakeReduced(TEE)), null, 'still needs hole 10');

  const tenth = offsetM(TEE, 600, 400);
  learnTee(app, { ...round }, 10, fakeReduced(tenth));
  const verdict = detectStartingNine(app, VEENKER, 'gold', fakeReduced(offsetM(tenth, 5, 5)));
  eq(verdict.nine, 'back', 'stood on the 10th tee');
  const verdict2 = detectStartingNine(app, VEENKER, 'gold', fakeReduced(offsetM(TEE, 3, 3)));
  eq(verdict2.nine, 'front', 'stood on the 1st tee');
});

test('starting-nine detection abstains when the tees are too close to call', () => {
  const app = newAppState();
  const round = par4Round();
  learnTee(app, round, 1, fakeReduced(TEE));
  learnTee(app, round, 10, fakeReduced(offsetM(TEE, 30, 0)));
  const mid = offsetM(TEE, 15, 0);
  eq(detectStartingNine(app, VEENKER, 'gold', fakeReduced(mid)), null, 'ambiguous => no opinion');
});

/* ------------------------------------------------------------- persistence */

group('storage footprint');

test('coordinates are stored at 1 cm precision, not double-precision noise', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced({ lat: 42.03512345678901, lon: -93.64512345678901 }) });
  const m = hole.shots[0].mark;
  eq(String(m.lat).split('.')[1].length <= 7, true, `lat kept ${m.lat}`);
  eq(String(m.lon).split('.')[1].length <= 7, true, `lon kept ${m.lon}`);
  // 7 dp is 1.1 cm — orders of magnitude finer than any receiver.
  near(m.lat, 42.0351235, 1e-7, 'latitude preserved to 1 cm');
});

test('a mark stays small enough for a season of rounds', () => {
  const round = par4Round();
  const hole = round.holes[0];
  // A realistic 3 s burst: five fixes, one of them rejected.
  const samples = [
    fixAt(offsetM(TEE, 0.4, 0.2), 3.1234567, 1),
    fixAt(offsetM(TEE, -0.3, 0.1), 2.9876543, 2),
    fixAt(offsetM(TEE, 0.2, -0.4), 3.4, 3),
    fixAt(offsetM(TEE, -0.1, 0.3), 2.8, 4),
    fixAt(offsetM(TEE, 40, 20), 3.0, 5),
  ];
  addShot(hole, { lie: 'tee', reduced: reduceBurst(samples) });
  const bytes = JSON.stringify(hole.shots[0].mark).length;
  assert(bytes < 500, `a 5-fix mark serialises to ${bytes} bytes; budget is 500`);
  // ~90 marks a round, ~5 MB of localStorage: this has to leave real headroom.
  const perRound = (bytes * 90) / 1024;
  assert(perRound < 60, `projected ${Math.round(perRound)} KB/round exceeds the 60 KB budget`);
});

test('rejected fixes are still recoverable from the compacted mark', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const samples = [
    fixAt(offsetM(TEE, 0.4, 0.2), 3, 1),
    fixAt(offsetM(TEE, -0.3, 0.1), 3, 2),
    fixAt(offsetM(TEE, 0.2, -0.4), 3, 3),
    fixAt(offsetM(TEE, -0.1, 0.3), 3, 4),
    fixAt(offsetM(TEE, 40, 20), 3, 5),
  ];
  addShot(hole, { lie: 'tee', reduced: reduceBurst(samples) });
  const stored = JSON.parse(JSON.stringify(hole.shots[0].mark));
  eq(stored.samples.length, 5, 'every raw fix survives');
  eq(stored.samples.filter((s) => s.reject).length, 1, 'the rejection is recorded');
  eq(stored.samples[4].reject, 'outlier', 'and says why');
  eq(stored.samples[0].used, undefined, 'the common case is not written out');
});

group('export / import');

test('export then import into a clean store round-trips every round', () => {
  for (const id of allRoundIds()) deleteRound(id);
  const app = newAppState();
  const round = par4Round();
  addShot(round.holes[0], { lie: 'tee', reduced: fakeReduced(TEE) });
  setCup(round.holes[0], fakeReduced(offsetM(TEE, 300, 0)));
  saveRound(round);
  saveApp(app);

  const payload = buildExport(app);
  eq(payload.rounds.length, 1, 'one round exported');
  eq(payload.format, 'golf-tracker-export', 'format tag');

  for (const id of allRoundIds()) deleteRound(id);
  eq(allRoundIds().length, 0, 'store cleared');

  const report = importExport(JSON.parse(JSON.stringify(payload)), 'replace');
  eq(report.added, 1, 'one round restored');
  const restored = loadRound(round.id);
  eq(restored.holes[0].shots.length, 1, 'shot survived');
  near(restored.holes[0].cup.lat, round.holes[0].cup.lat, 1e-12, 'cup coordinate survived');
  near(
    distanceM(restored.holes[0].shots[0].mark, restored.holes[0].cup),
    300,
    0.01,
    'distances recompute identically after a round-trip'
  );
});

test('merge import does not duplicate rounds already present', () => {
  const app = newAppState();
  const payload = buildExport(app);
  const report = importExport(JSON.parse(JSON.stringify(payload)), 'merge');
  eq(report.added, 0, 'nothing new');
  assert(report.skipped >= 1, 'existing round skipped');
});

test('a foreign file is rejected', () => {
  let threw = false;
  try {
    importExport({ format: 'something-else' });
  } catch {
    threw = true;
  }
  assert(threw, 'should refuse to import an unknown format');
});

test('the suite puts any pre-existing rounds back', () => {
  restoreStorage();
  const expected = Object.keys(STORAGE_SNAPSHOT).filter((k) => k.startsWith('gt:round:')).length;
  eq(allRoundIds().length, expected, 'every round that existed before the run is back');
  for (const [k, v] of Object.entries(STORAGE_SNAPSHOT)) {
    eq(localStorage.getItem(k), v, `${k} restored byte-for-byte`);
  }
});

/* ---------------------------------------------------------------- formatting */

group('formatting');

test('distances use the unit a golfer would say out loud', () => {
  eq(fmtDistance(200 * 0.9144), '200 yd', 'a full shot');
  eq(fmtDistance(30 * 0.9144), '30 yd', 'a pitch is 30 yards, not 90 feet');
  eq(fmtDistance(3.048), '10 ft', 'short enough that feet read better');
  eq(fmtDistance(20 * 0.3048, { asFeet: true }), '20 ft', 'putts are always feet');
  eq(fmtDistance(60 * 0.3048, { asFeet: true }), '60 ft', 'even a long lag');
  eq(fmtDistance(null), '—', 'unknown');
});

/* ------------------------------------------------------- strokes gained */

group('benchmark tables (vs the published paper)');

test('every published anchor in the paper is reproduced', () => {
  const problems = validateBenchmarks();
  eq(problems.length, 0, `validation failures:\n  ${problems.join('\n  ')}`);
});

test('Table 9 is transcribed exactly at its landmarks', () => {
  const B = { baseline: 'tour' };
  near(expectedStrokes('tee', 100, B), 2.92, 1e-9, 'tee 100');
  near(expectedStrokes('tee', 400, B), 3.99, 1e-9, 'tee 400');
  near(expectedStrokes('tee', 600, B), 4.82, 1e-9, 'tee 600');
  near(expectedStrokes('fairway', 10, B), 2.18, 1e-9, 'fairway 10');
  near(expectedStrokes('fairway', 200, B), 3.19, 1e-9, 'fairway 200');
  near(expectedStrokes('rough', 200, B), 3.42, 1e-9, 'rough 200');
  near(expectedStrokes('sand', 100, B), 3.23, 1e-9, 'sand 100');
  near(expectedStrokes('recovery', 100, B), 3.8, 1e-9, 'recovery 100');
});

test('interpolation lands midway between table rows', () => {
  // fairway 140 = 2.91, 160 = 2.98, so 150 should be 2.945
  near(expectedStrokes('fairway', 150, { baseline: 'tour' }), 2.945, 1e-9, 'fairway 150');
});

test('a tee shot inside 100 yards falls back to the fairway table', () => {
  // Table 9's tee column starts at 100 yards; a 90-yard par 3 is not a drive.
  near(
    expectedStrokes('tee', 90, { baseline: 'tour' }),
    expectedStrokes('fairway', 90, { baseline: 'tour' }),
    1e-9,
    'short par 3'
  );
});

test('unknown distances return null rather than a guess', () => {
  eq(expectedStrokes('fairway', null, { baseline: 'tour' }), null, 'null distance');
  eq(expectedStrokes('fairway', NaN, { baseline: 'tour' }), null, 'NaN distance');
  eq(expectedStrokes('nonsense', 100, { baseline: 'tour' }), null, 'unknown lie');
});

test('skill ordering holds everywhere: tour beats scratch beats a 90-golfer', () => {
  for (const [lie, d] of [['fairway', 150], ['rough', 200], ['sand', 40], ['tee', 400], ['green', 20]]) {
    const tour = expectedStrokes(lie, d, { baseline: 'tour' });
    const scratch = expectedStrokes(lie, d, { baseline: 'scratch' });
    const am = expectedStrokes(lie, d, { baseline: 'golfer90' });
    assert(tour < scratch, `${lie} ${d}: scratch (${scratch}) should trail tour (${tour})`);
    assert(scratch < am, `${lie} ${d}: 90-golfer (${am}) should trail scratch (${scratch})`);
  }
});

test('the scratch gap is the calibrated ~1.9 strokes, not the 3.0 originally guessed', () => {
  // Summing (E - 1) over eighteen tee shots on a par 72 is ~54, and the gap is
  // k times that. The wrong guess would have shown up as ~3.
  const gap = BASELINES.scratch.k * 54;
  assert(gap > 1.7 && gap < 2.2, `implied 18-hole scratch-vs-tour gap is ${gap.toFixed(2)}`);
});

group('strokes gained');

test('SG is expected-start minus expected-end minus the stroke', () => {
  // Worked by hand off Table 9: fairway 150 yd = 2.945 for tour. Hit it to
  // 20 feet, where the tour benchmark is expectedPutts(20).
  const start = expectedStrokes('fairway', 150, { baseline: 'tour' });
  const end = expectedStrokes('green', 20, { baseline: 'tour' });
  const expected = start - end - 1;

  const round = par4Round();
  const hole = round.holes[0];
  const cup = offsetM(TEE, 137.16, 0); // 150 yards
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 131.06, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [20], unit: 'feet' });
  setCup(hole, fakeReduced(cup));

  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  const approach = sg.shots.find((s) => s.lie === 'fairway');
  near(approach.sg, expected, 0.02, 'approach SG matches the hand calculation');
});

test("the paper's own worked example reproduces", () => {
  // Broadie, Section 2: a par 3 where the benchmark from the tee is 3.2. The
  // tee shot finishes 16 feet away, where the benchmark is 1.8, so the tee shot
  // gains 3.2 - 1.8 - 1 = +0.4. The birdie putt misses to a tap-in (1.0), for
  // 1.8 - 1.0 - 1 = -0.2. The tap-in gains exactly zero.
  near(3.2 - 1.8 - 1, 0.4, 1e-9, 'tee shot in the example');
  near(1.8 - 1.0 - 1, -0.2, 1e-9, 'missed birdie putt');
  near(1.0 - 0 - 1, 0, 1e-9, 'tap-in gains nothing');
  // And the app agrees the tour benchmark from 16 feet is about 1.8.
  near(expectedStrokes('green', 16, { baseline: 'tour' }), 1.8, 0.05, '16-foot putt benchmark');
});

test('SG over a hole telescopes to benchmark-minus-strokes', () => {
  // Broadie's additivity property (equation 2): the shots' SG must sum to
  // J(start) - n, whatever happened in between.
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 200, 20)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 330, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [15, 2], unit: 'feet' });
  setCup(hole, fakeReduced(offsetM(TEE, 335, 0)));

  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  const total = CATEGORIES.reduce((a, c) => a + sg.categories[c], 0);
  const teeShot = sg.shots[0];
  const expected = teeShot.expectedStart - holeStrokes(hole);
  eq(sg.unattributed, 0, 'every stroke was attributed');
  near(total, expected, 0.02, 'strokes gained telescopes');
});

test('categories follow Broadie: par-3 tee shots are approach, not driving', () => {
  eq(categorize('tee', 400, 4, true), 'off_tee', 'par 4 drive');
  eq(categorize('tee', 500, 5, true), 'off_tee', 'par 5 drive');
  eq(categorize('tee', 165, 3, true), 'approach', 'par 3 tee shot');
  eq(categorize('fairway', 150, 4, false), 'approach', 'full approach');
  eq(categorize('rough', 60, 4, false), 'short_game', 'inside 100 yards');
  eq(categorize('sand', 30, 4, false), 'short_game', 'greenside bunker');
  eq(categorize('green', 20, 4, false), 'putting', 'a putt');
});

test('the short-game boundary is Broadie\'s own 100 yards', () => {
  eq(DEFAULT_SHORT_GAME_YARDS, 100, 'matches the paper and the spec');
  eq(categorize('fairway', 99.9, 4, false), 'short_game', 'just inside');
  eq(categorize('fairway', 100, 4, false), 'approach', 'just outside');
});

test('putting SG needs only the first-putt distance and the count', () => {
  // This is what makes the green workflow viable: no intermediate putt is
  // required for the category total to be exact.
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'green', reduced: fakeReduced(TEE) });
  setGreenEntry(hole, { putts: 2, distances: [30], unit: 'feet' }); // second putt unpaced

  const expected = expectedStrokes('green', 30, { baseline: 'tour' }) - 2;
  near(puttingSG(hole, { baseline: 'tour' }), expected, 1e-9, 'exact despite the gap');

  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  near(sg.categories.putting, expected, 1e-9, 'and it reaches the category total');
  eq(sg.unattributed, 0, 'nothing is lost');
});

test('a one-putt from distance gains, a three-putt loses', () => {
  const make = (putts, first) => {
    const round = par4Round();
    const hole = round.holes[0];
    addShot(hole, { lie: 'green', reduced: fakeReduced(TEE) });
    setGreenEntry(hole, { putts, distances: [first], unit: 'feet' });
    return puttingSG(hole, { baseline: 'scratch' });
  };
  assert(make(1, 25) > 0.5, 'holing a 25-footer is a big gain');
  assert(Math.abs(make(2, 25)) < 0.15, 'two-putting from 25 ft is roughly par for the course');
  assert(make(3, 25) < -0.8, 'three-putting from 25 ft is a large loss');
  // Matt's motto, quantified: the 3-putt costs more than the 1-putt gains.
  assert(Math.abs(make(3, 25)) > Math.abs(make(1, 25)), 'avoiding a 3-putt beats making a 1-putt');
});

test('holing out without putting is zero putting SG, and the gain goes to the shot', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 200, 0)) });
  setCup(hole, fakeReduced(offsetM(TEE, 340, 0))); // holed from ~153 yards
  setGreenEntry(hole, { putts: 0, distances: [] });

  eq(puttingSG(hole, { baseline: 'tour' }), 0, 'no putts, no putting SG');
  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  eq(sg.counts.putting, 0, 'no putts counted');
  // Holing a 153-yard approach is worth roughly the whole benchmark minus one.
  assert(sg.categories.approach > 1.5, `expected a large approach gain, got ${sg.categories.approach}`);
});

test('a chip-in with nothing marking the hole is unattributed, not invented', () => {
  // No cup mark and no ball ever resting on the green, so there is no reference
  // point for any distance on this hole. Refusing to guess is the whole point.
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 210, 15)) });
  setGreenEntry(hole, { putts: 0, distances: [] });

  eq(holePosition(hole), null, 'nothing locates the hole');
  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  eq(sg.unattributed, 2, 'both shots reported as unattributed');
  eq(sg.categories.off_tee, 0, 'and nothing was booked to a category');
  assert(sg.reasons.length >= 2, 'with a reason for each');
});

test('a penalty is charged to the shot that caused it', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const s1 = addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  attachPenalty(s1, { type: 'water', strokes: 1 });
  addShot(hole, { lie: 'tee', reduced: fakeReduced(offsetM(TEE, 2, 2)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 330, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [12, 1], unit: 'feet' });
  setCup(hole, fakeReduced(offsetM(TEE, 335, 0)));

  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  const drive = sg.shots[0];
  eq(drive.penalty, 1, 'penalty recorded on the shot');
  assert(drive.sg < -1, `a penalised drive should cost more than a stroke, got ${drive.sg}`);
});

test('shots with unknown positions are counted, never silently dropped', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  addShot(hole, { lie: 'fairway', reduced: null, source: 'manual' }); // GPS lost
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 330, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [10, 1], unit: 'feet' });

  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  assert(sg.unattributed > 0, 'the unmeasured shot is reported');
  assert(sg.reasons.length > 0, 'and the reason is given');
});

test('a hand-entered hole still yields putting SG if a distance was written down', () => {
  const round = par4Round();
  const hole = round.holes[0];
  setManualHole(hole, { strokes: 5, putts: 2, firstPuttFt: 24 });
  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  const expected = expectedStrokes('green', 24, { baseline: 'tour' }) - 2;
  near(sg.categories.putting, expected, 1e-9, 'putting recovered from the hand entry');
  eq(sg.unattributed, 3, 'the three full shots have no positions and say so');
});

test('practice priority ranks by total strokes lost, worst first', () => {
  const sg = {
    totals: { off_tee: -1.2, approach: -3.4, short_game: 0.5, putting: -0.3 },
    counts: { off_tee: 14, approach: 13, short_game: 6, putting: 30 },
  };
  const ranked = practicePriority(sg);
  eq(ranked[0].category, 'approach', 'biggest leak first');
  eq(ranked[3].category, 'short_game', 'the only gain comes last');
  near(ranked[0].perShot, -3.4 / 13, 1e-9, 'per-shot comes along for diagnosis');
});

test('a round aggregates its holes and reports what it could not attribute', () => {
  const round = par4Round();
  for (let i = 0; i < 3; i++) {
    const hole = round.holes[i];
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 230, 0)) });
    addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 350, 0)) });
    setGreenEntry(hole, { putts: 2, distances: [18, 2], unit: 'feet' });
    setCup(hole, fakeReduced(offsetM(TEE, 355, 0)));
  }
  const sg = roundStrokesGained(round, { baseline: 'scratch' });
  eq(sg.holesScored, 3, 'three holes');
  eq(sg.unattributed, 0, 'all attributed');
  eq(sg.counts.off_tee, 3, 'three drives');
  eq(sg.counts.putting, 6, 'six putts');
  near(sg.total, CATEGORIES.reduce((a, c) => a + sg.totals[c], 0), 1e-9, 'total is the sum of parts');
  eq(sg.baseline, 'scratch', 'baseline recorded');
  eq(sg.provenance.verified, false, 'and flagged as a derived baseline');
});

/* ------------------------------------------------------------------ trends */

group('clubs');

test('the bag is Matt\'s, in order, longest to shortest', () => {
  const ids = SELECTABLE_CLUBS.map((c) => c.id);
  eq(
    ids.join(','),
    'driver,3w,3h,4i,5i,6i,7i,8i,9i,pw,gw,sw,lw',
    'driver, 3W, 3H, 4-PW, GW, SW, LW'
  );
  eq(CLUBS.length, 14, 'plus the putter');
  assert(!ids.includes('putter'), 'the putter is never offered for selection');
});

test('a putt is assigned the putter without being asked', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const shot = addShot(hole, { lie: 'green', reduced: fakeReduced(TEE) });
  eq(shot.club, 'putter', 'assigned automatically');
  // And the ones created by the green entry too.
  setGreenEntry(hole, { putts: 2, distances: [10, 1], unit: 'feet' });
  eq(hole.shots.filter((s) => s.club === 'putter').length, 2, 'both putts');
});

test('club is recorded on a full shot and can be changed or cleared later', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const drive = addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE), club: 'driver' });
  eq(drive.club, 'driver', 'recorded at capture');

  setShotClub(drive, '3w');
  eq(drive.club, '3w', 'changed after the fact');
  setShotClub(drive, null);
  eq(drive.club, null, 'and cleared');
});

test('a shot with no club stays null rather than defaulting to something', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const shot = addShot(hole, { lie: 'fairway', reduced: fakeReduced(TEE) });
  eq(shot.club, null, 'unknown is not a club');
});

test('strokes gained carries the club and the measured shot length', () => {
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE), club: 'driver' });
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 228.6, 0)), club: '7i' }); // 250 yd
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 320, 0)) });
  setGreenEntry(hole, { putts: 2, distances: [15, 2], unit: 'feet' });

  const sg = holeStrokesGained(hole, { baseline: 'tour' });
  eq(sg.shots[0].club, 'driver', 'club travels through to the analysis');
  near(sg.shots[0].lengthYards, 250, 0.5, 'and so does how far it actually went');
  eq(sg.shots[2].club, 'putter', 'putts included');
});

group('trend statistics');

/** A fake series: `per18` values straight in, newest first. */
const fakeSeries = (rows) =>
  rows.map((r, i) => ({
    id: `r${i}`,
    date: new Date(2026, 0, 100 - i).toISOString(),
    per18: { off_tee: r[0], approach: r[1], short_game: r[2], putting: r[3] },
    total18: r.reduce((a, b) => a + b, 0),
    holesScored: 18,
    simulated: false,
  }));

test('mean and sample standard deviation', () => {
  near(tMean([2, 4, 6]), 4, 1e-9, 'mean');
  near(stdDev([2, 4, 6]), 2, 1e-9, 'sd uses n-1');
  eq(stdDev([5]), null, 'sd is undefined for one point');
  eq(tMean([]), null, 'no mean without data');
});

test('the confidence interval uses t, not 1.96, at small n', () => {
  // At n = 6 the normal approximation understates the interval by ~25%, which
  // is exactly where this app lives for its first season.
  eq(tCritical95(5), 2.571, 'df 5');
  eq(tCritical95(1), 12.706, 'df 1 is enormous, as it should be');
  eq(tCritical95(100), 1.96, 'large samples converge to normal');
  const s = summarise([1, 2, 3, 4, 5, 6]);
  eq(s.n, 6, 'n');
  near(s.mean, 3.5, 1e-9, 'mean');
  assert(s.ci > 1.96 * s.se - 1e-9, 'interval is at least the normal one');
});

test('rolling windows report the n they actually have', () => {
  const series = fakeSeries([
    [-1, -2, 0, 0], [-1, -2, 0, 0], [-1, -2, 0, 0], [-1, -2, 0, 0], [-1, -2, 0, 0], [-1, -2, 0, 0],
  ]);
  const w = rollingWindows(series);
  eq(w[5].rounds, 5, 'five available');
  eq(w[5].complete, true, 'window filled');
  eq(w[20].rounds, 6, 'only six rounds exist');
  eq(w[20].complete, false, 'and it says so');
  near(w[5].categories.approach.mean, -2, 1e-9, 'window mean');
});

test('practice priority ranks worst first and weights recent rounds', () => {
  // Approach was bad early and has been fixed; off the tee is steadily bad.
  // Raw means rank approach worse (-2.0 vs -1.5); recency should flip that,
  // because the approach damage is all in the three oldest rounds.
  const series = fakeSeries([
    [-1.5, 0, 0, 0], [-1.5, 0, 0, 0], [-1.5, 0, 0, 0],
    [-1.5, -4, 0, 0], [-1.5, -4, 0, 0], [-1.5, -4, 0, 0],
  ]);
  const ranked = weightedPriority(series, { halfLifeRounds: 2 });
  eq(ranked[0].category, 'off_tee', 'recent weighting surfaces the current leak');
  // The unweighted mean would have ranked approach worse, so the weighting did
  // real work rather than being decorative.
  const rawApproach = ranked.find((r) => r.category === 'approach');
  assert(rawApproach.mean < -1.5, `unweighted approach mean is ${rawApproach.mean}`);
  assert(rawApproach.weighted > rawApproach.mean, 'recency pulls the old damage down');
});

group('the open question');

test('a verdict is refused until the gap clears the confidence interval', () => {
  // Noisy and level: off the tee and approach trade blows round to round.
  const series = fakeSeries([
    [-2, -1, 0, 0], [-0.5, -2.5, 0, 0], [-2.5, -0.5, 0, 0], [-1, -2, 0, 0], [-2, -1, 0, 0],
  ]);
  const v = hypothesisVerdict(series);
  eq(v.verdict, 'undecided', 'must not call it');
  assert(v.roundsNeeded > series.length, `should ask for more rounds, said ${v.roundsNeeded}`);
});

test('a verdict is given once the gap is consistent', () => {
  // Off the tee is worse by about a stroke every single round.
  const series = fakeSeries([
    [-2.1, -1.0, 0, 0], [-2.0, -1.1, 0, 0], [-2.2, -0.9, 0, 0],
    [-1.9, -1.0, 0, 0], [-2.1, -1.1, 0, 0], [-2.0, -1.0, 0, 0],
  ]);
  const v = hypothesisVerdict(series);
  eq(v.verdict, 'separated', 'consistent gap should resolve');
  eq(v.worse, 'off_tee', 'and name the right culprit');
  assert(v.meanDiff < 0, 'off the tee is the more negative');
});

test('the verdict identifies approach when approach is the leak', () => {
  const series = fakeSeries([
    [-0.5, -2.5, 0, 0], [-0.4, -2.6, 0, 0], [-0.6, -2.4, 0, 0],
    [-0.5, -2.5, 0, 0], [-0.4, -2.5, 0, 0], [-0.6, -2.6, 0, 0],
  ]);
  const v = hypothesisVerdict(series);
  eq(v.verdict, 'separated', 'resolves');
  eq(v.worse, 'approach', 'friend would be right in this world');
});

test('one round yields no verdict at all, not a coin flip', () => {
  const v = hypothesisVerdict(fakeSeries([[-3, 0, 0, 0]]));
  eq(v.verdict, 'undecided', 'undecided');
  eq(v.ci, null, 'no interval from a single round');
  eq(hypothesisVerdict([]).n, 0, 'empty series is handled');
});

test('pairing is what makes this answerable — it cancels round-level noise', () => {
  // Every round shifted by a large common amount (weather, say). The paired
  // difference is unchanged, so the verdict should survive noise that would
  // swamp either category on its own.
  const clean = [[-2.1, -1.0], [-2.0, -1.1], [-2.2, -0.9], [-1.9, -1.0], [-2.1, -1.1], [-2.0, -1.0]];
  const shifts = [3, -4, 2, -3, 4, -2];
  const noisy = clean.map(([a, b], i) => [a + shifts[i], b + shifts[i], 0, 0]);

  const vClean = hypothesisVerdict(fakeSeries(clean.map(([a, b]) => [a, b, 0, 0])));
  const vNoisy = hypothesisVerdict(fakeSeries(noisy));
  eq(vNoisy.verdict, 'separated', 'still resolves through the noise');
  near(vNoisy.meanDiff, vClean.meanDiff, 1e-9, 'the difference is untouched by the common shift');
});

test('categorySeries runs oldest to newest for plotting', () => {
  const series = fakeSeries([[-1, 0, 0, 0], [-2, 0, 0, 0], [-3, 0, 0, 0]]);
  const pts = categorySeries(series, 'off_tee');
  eq(pts[0].value, -3, 'oldest first');
  eq(pts[2].value, -1, 'newest last');
});

/* -------------------------------------------------------------- pocket lock */

/**
 * These are regression tests for a field failure, not hypotheticals. Round 1
 * became unloggable because a phone in a back pocket, sat on, generated real
 * touch events that advanced a hole. Each case below is a property of being
 * sat on: sustained pressure, several contacts at once, smeared movement.
 */
group('pocket lock');

/**
 * `holdMs` defaults to zero, firing down and up in the same tick.
 *
 * That is not laziness — a browser throttles timers in a backgrounded tab, so
 * an awaited "60ms" hold can really take a second, and the gesture would be
 * rejected as a press for reasons that have nothing to do with the code under
 * test. Firing synchronously makes tap duration independent of scheduling.
 * Cases that need a genuine long press pass holdMs explicitly, and throttling
 * only pushes those further past the limit.
 */
const lockTap = async (y, { id = 1, holdMs = 0, dx = 0 } = {}) => {
  const ov = document.querySelector('.lock-screen');
  const fire = (type, cx) =>
    ov.dispatchEvent(
      new PointerEvent(type, { clientX: cx, clientY: y, pointerId: id, bubbles: true, cancelable: true })
    );
  fire('pointerdown', 100);
  if (holdMs) await new Promise((r) => setTimeout(r, holdMs));
  fire('pointerup', 100 + dx);
};

const TOP = () => window.innerHeight * 0.2;
const BOTTOM = () => window.innerHeight * 0.8;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runLockTests() {
  group('pocket lock');

  // These tests drive real pointer events through real timers, and a browser
  // throttles timers in a backgrounded tab — which would stretch the pause
  // between two taps past the window and fail the one case that must succeed.
  // Widening the window here tests the LOGIC (crisp taps, opposite halves, no
  // simultaneous contacts) without making the result depend on how the tab
  // happens to be scheduled. The rejection cases below are unaffected: every
  // one of them fails harder, not softer, as timers stretch.
  const realWindow = pocketLock.TIMING.tapWindowMs;
  pocketLock.configure({ timing: { tapWindowMs: 60000 } });

  await (async () => {
    try {
      pocketLock.lock();
      test('locking shows an overlay carrying hole and GPS status', () => {
        const ov = document.querySelector('.lock-screen');
        assert(ov, 'overlay present');
        assert(ov.querySelector('.lock-hole'), 'hole shown');
        assert(ov.querySelector('.lock-acc'), 'accuracy shown');
        eq(pocketLock.isLocked(), true, 'reports locked');
      });

      // Sustained pressure IS a long press — this is why a hold gesture was
      // rejected for this app.
      await lockTap(TOP(), { holdMs: 900 });
      await lockTap(BOTTOM(), { holdMs: 900 });
      test('sitting on the phone (sustained pressure) does not unlock', () => {
        eq(pocketLock.isLocked(), true, 'still locked');
      });

      const ov = document.querySelector('.lock-screen');
      const fire = (type, x, y, id) =>
        ov.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, cancelable: true }));
      fire('pointerdown', 100, TOP(), 1);
      fire('pointerdown', 200, BOTTOM(), 2);
      await pause(60);
      fire('pointerup', 100, TOP(), 1);
      fire('pointerup', 200, BOTTOM(), 2);
      test('simultaneous contacts do not unlock', () => {
        eq(pocketLock.isLocked(), true, 'still locked');
      });

      await lockTap(TOP());
      await pause(80);
      await lockTap(window.innerHeight * 0.25);
      test('two taps in the same half do not unlock', () => {
        eq(pocketLock.isLocked(), true, 'still locked');
      });

      // Narrow the window right down for this one, so the assertion holds no
      // matter how the tab is scheduled — throttling can only stretch the gap
      // further past the limit, never under it.
      pocketLock.configure({ timing: { tapWindowMs: 40 } });
      await lockTap(TOP());
      await pause(250);
      await lockTap(BOTTOM());
      test('the two taps must fall inside the time window', () => {
        eq(pocketLock.isLocked(), true, 'still locked');
      });
      pocketLock.configure({ timing: { tapWindowMs: 60000 } });

      await lockTap(TOP(), { dx: 90 });
      await pause(80);
      await lockTap(BOTTOM());
      test('a smeared contact is not a tap', () => {
        eq(pocketLock.isLocked(), true, 'still locked');
      });

      await lockTap(TOP());
      await pause(120);
      await lockTap(BOTTOM());
      test('the deliberate gesture unlocks', () => {
        eq(pocketLock.isLocked(), false, 'unlocked');
        eq(document.querySelector('.lock-screen'), null, 'overlay removed');
      });
    } finally {
      if (pocketLock.isLocked()) pocketLock.unlock();
      pocketLock.disable();
      pocketLock.configure({ timing: { tapWindowMs: realWindow } });
    }
  })();

  test('the shipped unlock window is the real one, not a test value', () => {
    eq(pocketLock.TIMING.tapWindowMs, 1200, 'restored after the suite');
    eq(pocketLock.TIMING.tapMaxMs, 350, 'tap ceiling untouched');
  });
}

/* ------------------------------------------------------------ theme contrast */

group('theme contrast (WCAG)');

function srgbToLinear(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return (
    0.2126 * srgbToLinear(parseInt(full.slice(0, 2), 16)) +
    0.7152 * srgbToLinear(parseInt(full.slice(2, 4), 16)) +
    0.0722 * srgbToLinear(parseInt(full.slice(4, 6), 16))
  );
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const CONTRAST_PAIRS = [
  ['ink', 'bg', 7, 'primary text on page'],
  ['ink', 'surface', 7, 'primary text on card'],
  ['ink', 'surface-2', 7, 'primary text on inset'],
  ['ink-2', 'bg', 7, 'secondary text on page'],
  ['ink-2', 'surface', 7, 'secondary text on card'],
  ['ink-3', 'bg', 4.5, 'faint label on page'],
  ['ink-3', 'surface', 4.5, 'faint label on card'],
  ['accent-ink', 'accent', 7, 'text on primary button'],
  ['accent', 'bg', 4.5, 'accent on page'],
  ['accent', 'surface', 4.5, 'accent on card'],
  ['ink', 'accent-soft', 7, 'text on selected chip'],
  ['good', 'bg', 4.5, 'good GPS indicator'],
  ['good', 'surface', 4.5, 'good GPS indicator on card'],
  ['warn', 'bg', 4.5, 'warning text'],
  ['warn', 'surface', 4.5, 'warning text on card'],
  ['bad', 'bg', 4.5, 'error text'],
  ['bad', 'surface', 4.5, 'error text on card'],
  ['line', 'bg', 1.3, 'hairline visible on page'],
];

export async function runContrastTests() {
  group('theme contrast (WCAG)');
  const css = await fetch('../css/themes.css').then((r) => r.text());
  const themes = {};
  const blockRe = /(?::root,\s*)?\[data-theme='([a-z]+)'\]\s*\{([^}]*)\}/g;
  let m;
  while ((m = blockRe.exec(css))) {
    const vars = {};
    for (const line of m[2].split(';')) {
      const kv = line.match(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/);
      if (kv) vars[kv[1]] = kv[2];
    }
    themes[m[1]] = vars;
  }
  const names = Object.keys(themes);
  test('every palette offered in the picker is actually defined in CSS', () => {
    // Guards the failure where a theme is added to one list but not the other,
    // which would show a picker entry that silently does nothing.
    for (const t of THEMES) assert(names.includes(t), `${t} is in THEMES but missing from themes.css`);
    for (const t of names) assert(THEMES.includes(t), `${t} is in themes.css but missing from THEMES`);
  });
  for (const name of names) {
    const t = themes[name];
    for (const [fg, bg, min, label] of CONTRAST_PAIRS) {
      test(`${name}: ${label}`, () => {
        assert(t[fg] && t[bg], `missing --${fg} or --${bg}`);
        const ratio = contrast(t[fg], t[bg]);
        assert(ratio >= min, `${ratio.toFixed(2)}:1 is below the ${min}:1 requirement`);
      });
    }
  }
}

/* ---------------------------------------------------------------- revision */

group('build revision');

test('the running revision has an entry in the history', () => {
  const info = revisionInfo(REVISION);
  assert(info, `no REVISION_HISTORY entry for rev ${REVISION}`);
  eq(info.rev, REVISION, 'entry matches');
});

test('revisions are unique and start at 0 with no gaps', () => {
  const revs = REVISION_HISTORY.map((r) => r.rev);
  eq(new Set(revs).size, revs.length, 'no duplicate revision numbers');
  eq(Math.min(...revs), 0, 'numbering starts at 0');
  const sorted = [...revs].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) eq(sorted[i], i, `contiguous at index ${i}`);
});

test('a new round is stamped with the current revision', () => {
  const round = par4Round();
  eq(round.revision, REVISION, 'stamped at creation');
});

test('migrate never invents a revision for a legacy round', () => {
  // The exact failure this guards: defaulting the stamp would relabel field
  // test 1 and 2 data as having come from a build that did not exist yet.
  const legacy = { schemaVersion: 1, id: 'r_old', holes: [], track: [] };
  const out = migrate(legacy);
  eq('revision' in out && out.revision != null, false, 'no revision fabricated');
  eq(roundRevisionLabel(out).includes('unstamped'), true, 'renders as unstamped');
});

test('the round index carries the revision, null for legacy rounds', () => {
  eq(summarizeRound(par4Round()).revision, REVISION, 'stamped round');
  eq(summarizeRound({ id: 'x', holes: [] }).revision, null, 'legacy round is null, not undefined');
});

/* ---------------------------------------------------------- track analysis */

group('track analysis');

/**
 * Synthesise a 1 Hz track from legs — stand somewhere, or travel to somewhere
 * at a speed. Jitter is deterministic (fixed-seed LCG) because a stop detector
 * tested against Math.random() passes and fails on different days, and this
 * suite has already been burned once by non-determinism.
 */
function synthTrack(legs, { startTs = 1_700_000_000_000, acc = 5, jitterM = 0 } = {}) {
  let ts = startTs;
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff - 0.5;
  };
  const pts = [];
  const push = (pt, speed) => {
    const p = jitterM ? offsetM(pt, rnd() * jitterM * 2, rnd() * jitterM * 2) : pt;
    pts.push([Number(p.lat.toFixed(7)), Number(p.lon.toFixed(7)), acc, ts, speed]);
    ts += 1000;
  };
  const lerp = (a, b, f) => ({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });

  let at = legs[0].stand ?? legs[0].to;
  for (const leg of legs) {
    if (leg.stand) {
      for (let i = 0; i < leg.seconds; i++) push(leg.stand, 0);
      at = leg.stand;
    } else if (leg.to) {
      const secs = Math.max(1, Math.round(distanceM(at, leg.to) / leg.speed));
      for (let i = 1; i <= secs; i++) push(lerp(at, leg.to, i / secs), leg.speed);
      at = leg.to;
    } else if (leg.gapSeconds) {
      ts += leg.gapSeconds * 1000; // receiver dropout: time passes, no fixes
    }
  }
  return pts;
}

const BALL_1 = offsetM(TEE, 210, 12);
const BALL_2 = offsetM(TEE, 330, 20);

test('a stand becomes a stop and a cart leg becomes a move', () => {
  const pts = synthTrack([
    { stand: TEE, seconds: 12 },
    { to: BALL_1, speed: 5 },
    { stand: BALL_1, seconds: 10 },
  ]);
  const segs = segmentTrack(pts);
  const stops = segs.filter((s) => s.kind === 'stop');
  eq(stops.length, 2, 'two stops');
  near(distanceM(stops[0], TEE), 0, 3, 'first stop is at the tee');
  near(distanceM(stops[1], BALL_1), 0, 3, 'second stop is at the ball');
  assert(
    segs.some((s) => s.kind === 'move' && s.speed > 3),
    'the drive between them reads as movement'
  );
});

test('standing still with GPS jitter stays ONE stop', () => {
  // The failure this guards is silent and fatal to ranking: a stop that
  // fragments into four short ones has four scores, all of them low.
  const pts = synthTrack([{ stand: TEE, seconds: 20 }], { jitterM: 6, acc: 6 });
  const stops = segmentTrack(pts).filter((s) => s.kind === 'stop');
  eq(stops.length, 1, 'one stop, not several');
});

test('a receiver dropout is not a dwell', () => {
  const pts = synthTrack([
    { stand: TEE, seconds: 4 },
    { gapSeconds: 180 },
    { stand: TEE, seconds: 4 },
  ]);
  const stops = segmentTrack(pts).filter((s) => s.kind === 'stop');
  eq(stops.length, 0, 'three minutes of missing fixes is not three minutes of standing');
});

test('fixes worse than the accuracy gate are dropped', () => {
  const good = synthTrack([{ stand: TEE, seconds: 10 }], { acc: 5 });
  const junk = synthTrack([{ stand: offsetM(TEE, 400, 0), seconds: 10 }], { acc: 60 });
  const stops = segmentTrack([...good, ...junk].sort((a, b) => a[3] - b[3]));
  eq(stops.filter((s) => s.kind === 'stop').length, 1, 'only the accurate cluster survives');
});

test('a shot outranks a walk behind the hole', () => {
  const green = offsetM(TEE, 430, 30);
  const behind = offsetM(green, 22, 0); // far enough to resolve past GPS scatter
  const pts = synthTrack([
    { stand: TEE, seconds: 12 },
    { to: BALL_1, speed: 5 },
    { stand: BALL_1, seconds: 10 },
    { to: green, speed: 5 },
    { stand: green, seconds: 10 },
    { to: behind, speed: 1.2 },
    { stand: behind, seconds: 12 },
    { to: green, speed: 1.2 },
    { stand: green, seconds: 10 },
  ]);
  const cands = stopCandidates(pts);
  const behindStop = cands.find((c) => distanceM(c, behind) < 15);
  const teeStop = cands.find((c) => distanceM(c, TEE) < 15);
  assert(behindStop, 'the walk behind the hole is still reported, not suppressed');
  assert(teeStop, 'the tee shot is reported');
  assert(
    teeStop.score > behindStop.score,
    `tee shot (${teeStop.score}) should outrank reading the putt (${behindStop.score})`
  );
  assert(
    behindStop.departureM < 40,
    `a putt read departs a few metres, got ${behindStop.departureM}`
  );
});

test('candidates explain themselves', () => {
  const pts = synthTrack([
    { stand: TEE, seconds: 12 },
    { to: BALL_1, speed: 5 },
    { stand: BALL_1, seconds: 10 },
  ]);
  const [first] = stopCandidates(pts);
  assert(Array.isArray(first.reasons) && first.reasons.length, 'reasons are populated');
  assert(first.score >= 0 && first.score <= 1, 'score is normalised');
  eq(first.speedSource, 'device', 'device speed used when present');
});

test('proposeStops returns the requested count in TIME order', () => {
  const pts = synthTrack([
    { stand: TEE, seconds: 12 },
    { to: BALL_1, speed: 5 },
    { stand: BALL_1, seconds: 10 },
    { to: BALL_2, speed: 5 },
    { stand: BALL_2, seconds: 10 },
  ]);
  const proposed = proposeStops(pts, { count: 2 });
  eq(proposed.length, 2, 'two proposed');
  assert(proposed[0].startTs < proposed[1].startTs, 'ordered by time, not by score');
});

test('proposeStops honours a time window', () => {
  const pts = synthTrack([
    { stand: TEE, seconds: 12 },
    { to: BALL_1, speed: 5 },
    { stand: BALL_1, seconds: 10 },
  ]);
  const all = stopCandidates(pts);
  const late = proposeStops(pts, { fromTs: all[1].startTs });
  eq(late.length, 1, 'only the stop inside the window');
});

test('an empty or unusable track yields no candidates rather than throwing', () => {
  eq(stopCandidates([]).length, 0, 'empty');
  eq(stopCandidates(null).length, 0, 'null');
  eq(stopCandidates([[NaN, NaN, 5, 1]]).length, 0, 'garbage fixes filtered');
});

/**
 * The offline shell must list every module the app actually loads.
 *
 * This is not hypothetical: js/ui/lock.js was imported by app.js but absent
 * from the service worker's SHELL, so a mid-round refresh out of signal — the
 * exact scenario the offline cache exists for — would have failed to boot.
 * A missing entry is invisible until the one moment it matters.
 *
 * Rather than trust a hand-maintained list, this walks the real import graph
 * from the entry point and checks the cache list covers it.
 */
export async function runShellTests() {
  group('offline shell');

  const base = new URL('../', import.meta.url);
  const swText = await fetch(new URL('sw.js', base)).then((r) => r.text());
  const shell = [...swText.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);

  // Walk the static import graph from the entry point.
  const seen = new Set();
  const queue = ['js/app.js'];
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    let src;
    try {
      src = await fetch(new URL(path, base)).then((r) => (r.ok ? r.text() : ''));
    } catch {
      src = '';
    }
    for (const m of src.matchAll(/from\s+'([^']+\.js)'/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      queue.push(new URL(spec, new URL(path, base)).pathname.replace(/^.*?\/(js\/)/, '$1'));
    }
  }

  test('the service worker caches every module the app statically imports', () => {
    const missing = [...seen].filter((p) => !shell.includes(p));
    eq(missing.join(', ') || '(none)', '(none)', 'modules absent from the offline shell');
  });

  test('every file the service worker lists actually exists', async () => {
    // Guards the reverse failure: a typo or a renamed file leaves the install
    // step calling addAll on a 404, which rejects and silently disables the
    // whole offline cache.
    eq(shell.length > 10, true, `parsed ${shell.length} shell entries`);
  });

  for (const path of shell) {
    if (!/\.(js|css|html|svg|webmanifest)$/.test(path)) continue;
    const res = await fetch(new URL(path, base)).then((r) => r.status).catch(() => 0);
    test(`shell entry resolves: ${path}`, () => {
      eq(res, 200, `expected 200, got ${res}`);
    });
  }
}

/**
 * Dense track storage, against the REAL IndexedDB.
 *
 * Async, so it follows the same shape as the shell tests: do the I/O first,
 * then assert synchronously on what came back. Mocking IndexedDB here would
 * test the mock — and the failure modes that matter (a transaction that aborts,
 * a buffer lost when the page hides) live in the real implementation.
 */
export async function runTrackStoreTests() {
  group('dense track store');

  const db = await openTrackDb();
  if (!db) {
    test('IndexedDB is available', () => {
      throw new Error(
        'IndexedDB unavailable in this browser/profile — dense tracking would fall back to the ' +
          'decimated breadcrumb. Not a code failure, but this suite proved nothing.'
      );
    });
    return;
  }

  const ID_A = 'r_test_track_a';
  const ID_B = 'r_test_track_b';
  await deleteTrack(ID_A);
  await deleteTrack(ID_B);

  // A short ride: enough points to cross MAX_BUFFER and force a mid-run flush.
  const writer = createTrackWriter(ID_A, { flushMs: 50, maxBuffer: 10 });
  const t0 = 1_700_000_000_000;
  for (let i = 0; i < 25; i++) {
    writer.push({ lat: 42.035 + i * 1e-5, lon: -93.645, acc: 4.25, ts: t0 + i * 1000, speed: 4.5 });
  }
  await writer.close();

  const read = await readTrack(ID_A);
  const size = await trackSize(ID_A);

  test('every buffered fix survives a close', () => {
    eq(read.length, 25, 'all 25 fixes written');
    eq(size, 25, 'trackSize agrees without materialising points');
  });

  test('points come back in time order across chunk boundaries', () => {
    for (let i = 1; i < read.length; i++) {
      assert(read[i][3] >= read[i - 1][3], `out of order at ${i}`);
    }
    eq(read[0][3], t0, 'first timestamp preserved');
    eq(read[24][3], t0 + 24000, 'last timestamp preserved');
  });

  test('a fix round-trips through storage with its speed intact', () => {
    const f = expandFix(read[0]);
    near(f.lat, 42.035, 1e-6, 'lat');
    near(f.lon, -93.645, 1e-6, 'lon');
    near(f.acc, 4.3, 0.06, 'accuracy kept to 0.1 m');
    near(f.speed, 4.5, 0.01, 'device speed kept — the stop detector needs it');
    eq(f.heading, null, 'absent heading stays null rather than being invented');
  });

  test('a fix with no coordinates is refused, not stored as garbage', () => {
    const w = createTrackWriter('r_test_reject', { flushMs: 10_000, maxBuffer: 1000 });
    eq(w.push({ lat: NaN, lon: -93.6, acc: 4, ts: t0 }), false, 'NaN rejected');
    eq(w.push(null), false, 'null rejected');
    eq(w.stats().inBuffer, 0, 'nothing buffered');
  });

  // Deletion and orphan pruning.
  const writerB = createTrackWriter(ID_B, { flushMs: 50, maxBuffer: 5 });
  for (let i = 0; i < 8; i++) {
    writerB.push({ lat: 42.04, lon: -93.65, acc: 5, ts: t0 + i * 1000 });
  }
  await writerB.close();

  const deleted = await deleteTrack(ID_A);
  const afterDelete = await trackSize(ID_A);
  const bSurvives = await trackSize(ID_B);

  test('deleting one round leaves the others alone', () => {
    eq(deleted, true, 'delete reported success');
    eq(afterDelete, 0, 'target track gone');
    eq(bSurvives, 8, 'the other round is untouched');
  });

  /*
   * Prune with a live set that spares everything except ID_B.
   *
   * NOT `pruneOrphanTracks([])`, which by its own contract would delete every
   * track in the browser profile — including real rounds if this suite is ever
   * opened on Matt's phone, which it will be.
   */
  const storedBefore = await trackedRoundIds();
  const live = storedBefore.filter((id) => id !== ID_B);
  const pruned = await pruneOrphanTracks(live);
  const bAfterPrune = await trackSize(ID_B);
  const survivorCount = (await trackedRoundIds()).length;

  test('orphan pruning removes tracks whose round is gone, and only those', () => {
    eq(pruned, 1, 'exactly one orphan removed');
    eq(bAfterPrune, 0, 'orphaned track cleaned up');
    eq(survivorCount, live.length, 'every live track survived');
  });

  await deleteTrack('r_test_reject');
}

/**
 * The export carrying the dense track, against the real IndexedDB.
 *
 * Same shape as the track-store tests: all the I/O first, then assert
 * synchronously. `test()` does not await, so an async test function reports
 * success the instant it yields and its failure escapes as an unhandled
 * rejection — which is exactly how this got written wrong the first time.
 *
 * Round ids are fixed and namespaced rather than taken from `par4Round()`, and
 * localStorage is left alone apart from those ids. An earlier draft cleared
 * every round to get a clean slate and broke a later test that depended on one
 * being there.
 */
export async function runExportTrackTests() {
  group('export carries the dense track');

  const ID = 'r_export_track_test';
  const ID_SKIP = 'r_export_skip_test';
  await deleteTrack(ID);
  await deleteTrack(ID_SKIP);
  deleteRound(ID);
  deleteRound(ID_SKIP);

  const round = par4Round();
  round.id = ID;
  saveRound(round);
  const app = loadApp();

  const writer = createTrackWriter(ID, { flushMs: 40, maxBuffer: 3 });
  const t0 = Date.now();
  for (let i = 0; i < 7; i++) {
    writer.push({ lat: 42.03 + i * 1e-5, lon: -93.64, acc: 4, ts: t0 + i * 1000, speed: 1.2 });
  }
  await writer.close();

  const payload = await buildExportWithTracks(app);
  const mine = payload.tracks?.[ID] ?? [];
  // Survives serialisation — this is what actually leaves the phone.
  const wire = JSON.parse(JSON.stringify(payload));

  test('the dense track rides along in the export, under its round id', () => {
    // The failure this guards: buildExport reads localStorage only, so the
    // export carried every round record and none of the tracks — the most
    // expensive data in the app, silently missing from its own backup.
    eq(mine.length, 7, 'every fix exported');
    eq(mine[0][3], t0, 'oldest first');
    eq(mine[6][3], t0 + 6000, 'through to the newest');
    assert(payload.trackPoints >= 7, 'and counted in the summary total');
  });

  test('the track survives JSON serialisation intact', () => {
    eq(wire.tracks[ID].length, 7, 'still seven after a round trip through JSON');
    eq(wire.tracks[ID][3][3], t0 + 3000, 'timestamps unchanged');
  });

  await deleteTrack(ID);
  const emptied = await readTrack(ID);
  const restored = await restoreTracks(wire, [ID]);
  const back = await readTrack(ID);

  test('a restore puts the track back', () => {
    eq(emptied.length, 0, 'cleared first, so this proves a write');
    eq(restored.points, 7, 'every fix restored');
    eq(back.length, 7, 'and readable again');
    eq(back[0][3], t0, 'in time order');
  });

  // A track for a round the restore did NOT add must not be written: merge
  // keeps the copy already on the device, and writing anyway would append a
  // second copy of every point to a track that is already complete.
  const skipWire = {
    format: 'golf-tracker-export',
    formatVersion: 1,
    app,
    rounds: [],
    tracks: { [ID_SKIP]: [[42.03, -93.64, 4, t0, 0]] },
  };
  const skipped = await restoreTracks(skipWire, []);
  const skipStored = await trackSize(ID_SKIP);

  test('a track is not restored for a round that was skipped', () => {
    eq(skipped.points, 0, 'nothing written');
    eq(skipStored, 0, 'and nothing landed in the store');
  });

  // formatVersion 1 files predate tracks and have no `tracks` key at all.
  const legacy = await restoreTracks(
    { format: 'golf-tracker-export', formatVersion: 1, app, rounds: [] },
    []
  );

  test('an export from before tracks existed restores without complaint', () => {
    eq(legacy.points, 0, 'nothing to restore');
    eq(legacy.rounds, 0, 'and nothing claimed');
  });

  await deleteTrack(ID);
  await deleteTrack(ID_SKIP);
  deleteRound(ID);
  deleteRound(ID_SKIP);
}


/* ------------------------------------------------------ radcliffe (9 hole) */

group('Radcliffe Friendly Fairways');

test('the scorecard reconciles against the published totals', () => {
  // The only real check available on course data: the per-hole numbers came
  // from a scorecard site, the totals came from the course itself, and they
  // have to agree. Veenker is held to the same bar.
  eq(
    RADCLIFFE.holes.reduce((a, x) => a + x.par, 0),
    36,
    'par'
  );
  eq(
    RADCLIFFE.holes.reduce((a, x) => a + x.yards.white, 0),
    RADCLIFFE.teeSets.white.yards,
    'white yardage'
  );
  eq(
    RADCLIFFE.holes.reduce((a, x) => a + x.yards.red, 0),
    RADCLIFFE.teeSets.red.yards,
    'red yardage'
  );
});

test('it has the two par-3s and two par-5s the course says it has', () => {
  const count = (p) => RADCLIFFE.holes.filter((x) => x.par === p).length;
  eq(count(3), 2, 'par 3s');
  eq(count(5), 2, 'par 5s');
  eq(RADCLIFFE.holes.length, 9, 'holes');
});

test('stroke indices are absent rather than invented', () => {
  // Not published anywhere found. A plausible-looking index would be a lie in
  // the one file whose header forbids exactly that.
  assert(
    RADCLIFFE.holes.every((x) => x.hcp == null),
    'a stroke index was guessed'
  );
});

test('a nine-hole course ignores a remembered back-nine start', () => {
  // `startingNine` persists across rounds, so arriving here after a back-nine
  // round at Veenker would otherwise deal 5-9 then 1-4 silently.
  const front = playOrder(RADCLIFFE, 'front', 18).map((x) => x.number);
  const back = playOrder(RADCLIFFE, 'back', 18).map((x) => x.number);
  eq(front.join(','), '1,2,3,4,5,6,7,8,9', 'front start');
  eq(back.join(','), '1,2,3,4,5,6,7,8,9', 'back start must not reorder a single nine');
});

test('an 18-hole request on a nine-hole course produces nine holes', () => {
  // Four separate nine-hole rounds is how 36 holes is recorded here, and the
  // hole-count control is hidden for this course, so 18 is what a stale
  // setting would carry in.
  const round = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'practice',
    holeCount: 18,
  });
  eq(round.holes.length, 9, 'holes dealt');
  eq(round.coursePar, 36, 'round par');
  eq(round.holes[0].par, 5, 'hole 1 is the par 5');
  eq(round.holes[0].yards, 520, 'hole 1 white yardage');
});

test('Veenker still alternates its nines', () => {
  // The guard above is scoped by hole count, so the eighteen-hole behaviour it
  // sits in front of has to be untouched.
  eq(playOrder(VEENKER, 'back', 18)[0].number, 10, 'back start still starts at 10');
  eq(playOrder(VEENKER, 'front', 18)[0].number, 1, 'front start still starts at 1');
  eq(playOrder(VEENKER, 'front', 9).length, 9, 'nine at an eighteen-hole course');
});

/* ------------------------------------- missing tee shots and course learning */

group('a tee shot can be put back');

test('a recovered tee goes in FIRST and renumbers the hole', () => {
  // Appending it would make the drive the last stroke played — the same class
  // of error as a penalty landing on the wrong shot.
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 240, 0)) });
  addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 370, 0)) });
  insertTeeShot(hole, { reduced: fakeReduced(TEE) });
  eq(hole.shots.map((s) => s.lie).join(','), 'tee,fairway,green', 'order');
  eq(hole.shots.map((s) => s.seq).join(','), '1,2,3', 'renumbered');
});

test('a recovered tee never passes for one he stood on', () => {
  const round = par4Round();
  const shot = insertTeeShot(round.holes[0], { reduced: fakeReduced(TEE) });
  eq(shot.source, 'track', 'shot provenance');
  eq(shot.mark.method, 'track', 'mark provenance');
  eq(shot.inferred, 'track', 'and it says so outright');
  eq(teeIsInferred(round.holes[0]), true, 'the hole knows');
});

test('a marked tee is not flagged as inferred', () => {
  const round = par4Round();
  addShot(round.holes[0], { lie: 'tee', reduced: fakeReduced(TEE) });
  eq(teeIsInferred(round.holes[0]), false, 'a real mark carries no flag');
  assert(teeShot(round.holes[0]), 'and is found as the tee shot');
});

/* ------------------------------------------------ the cup, described in paces */

group('the tee is remembered per course');

test('a fresh install has no per-course tees yet', () => {
  const app = newAppState();
  eq(Object.keys(app.settings.teeByCourse).length, 0, 'nothing played yet');
  eq(app.settings.teeSet, 'gold', 'the global fallback still exists');
});

test('the migration seeds it from what he last played at each course', () => {
  // The install that matters is the one carrying "white" from Radcliffe with a
  // Veenker round about to start. Veenker HAS a white tee, so nothing else
  // catches it and the round would quietly go off 5,323 yards.
  const payload = {
    schemaVersion: 1,
    settings: { teeSet: 'white' },
    rounds: [
      { id: 'a', courseId: 'veenker', teeSet: 'blue', startedAt: '2026-07-27T12:00:00.000Z' },
      { id: 'b', courseId: 'veenker', teeSet: 'gold', startedAt: '2026-08-16T21:26:35.153Z' },
      { id: 'c', courseId: 'radcliffe', teeSet: 'white', startedAt: '2026-08-22T13:19:07.695Z' },
    ],
  };
  const out = migrate(payload);
  eq(out.settings.teeByCourse.veenker, 'gold', 'the most recent Veenker round, not the oldest');
  eq(out.settings.teeByCourse.radcliffe, 'white', 'and Radcliffe keeps white');
});

test('the seeding runs once and does not fight a later choice', () => {
  const once = migrate({ schemaVersion: 1, settings: { teeSet: 'white' }, rounds: [
    { id: 'a', courseId: 'veenker', teeSet: 'gold', startedAt: '2026-08-16T21:26:35.153Z' },
  ] });
  once.settings.teeByCourse.veenker = 'blue';
  eq(migrate(once).settings.teeByCourse.veenker, 'blue', 'a later choice survives');
});

test('a course never played falls back to the global tee', () => {
  const out = migrate({ schemaVersion: 1, settings: { teeSet: 'gold' }, rounds: [] });
  eq(out.settings.teeByCourse.radcliffe, undefined, 'nothing known about it');
  eq(out.settings.teeSet, 'gold', 'so the old global answers');
});


group('a pin sheet locates the cup');

/**
 * A green walked the way he walks one, with a KNOWN pin.
 *
 * The approach is played from due south, so the line of play runs north and
 * "paces on" is northward, "right" is east. He arrives at the front, goes to
 * his ball, walks behind the hole to read it, then stands at the cup to pick
 * the ball out. The pin sits `onM` north of the front edge and `sideM` east of
 * the green's centre line — which is what the test then asks the code to
 * recover from paces alone.
 */
function walkedGreen({ onM = 6, sideM = 3, startTs = 1_700_000_000_000 } = {}) {
  const approach = offsetM(TEE, 0, 0);
  const front = offsetM(TEE, 150, 0); // front edge of the green
  const cup = offsetM(front, onM, sideM);
  const pts = [];
  let ts = startTs;
  const jitter = [0.5, -0.4, 0.3, -0.5, 0.2, 0.4, -0.3, 0.1];
  let j = 0;
  const push = (pt, n) => {
    for (let i = 0; i < n; i++) {
      const k = jitter[j++ % jitter.length];
      const p = offsetM(pt, k, jitter[(j + 2) % jitter.length]);
      pts.push({ lat: p.lat, lon: p.lon, acc: 3.2, ts });
      ts += 1000;
    }
  };
  // Walk on at the front, centre-ish, then around the green.
  push(offsetM(front, 0.5, 0), 10); // arriving, front edge
  push(offsetM(front, 4, -5), 14); // his ball, left of centre
  push(offsetM(front, 11, 3), 12); // behind the hole, reading
  push(cup, 26); // standing at the cup, picking the ball out
  // Away to the next tee.
  for (let i = 1; i <= 40; i++) push(offsetM(front, 6 + i * 4, 0), 1);
  return { points: pts, approach, front, cup, startTs, endTs: ts };
}

const g = walkedGreen({ onM: 6, sideM: 3 });
const PACE_FT = 3;
const toPaces = (m) => Math.round(m / (PACE_FT * 0.3048));

test('paces on and right of centre land on the real cup', () => {
  const found = locateCupFromPaces(g.points, {
    approach: g.approach,
    anchor: g.cup,
    onPaces: toPaces(6),
    sidePaces: toPaces(3),
    paceFeet: PACE_FT,
    fromTs: g.startTs,
    toTs: g.endTs,
  });
  assert(found, 'expected a placement');
  // Pace rounding alone is worth a metre or so; the front edge is estimated
  // from where he walked, not surveyed.
  near(distanceM(found, g.cup), 0, 6, 'placed cup vs the real one');
});

test('it reports agreement with where he picked the ball out', () => {
  const found = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup,
    onPaces: toPaces(6), sidePaces: toPaces(3), paceFeet: PACE_FT,
    fromTs: g.startTs, toTs: g.endTs,
  });
  assert(found.fromTrack, 'expected an independent estimate from the track');
  assert(found.agreementM != null, 'expected an agreement figure');
  eq(found.confidence, 'good', `two sources should agree here (${found.agreementM} m apart)`);
});

test('left of centre goes the other way', () => {
  // The sign convention is load-bearing: getting it backwards puts the pin as
  // far wrong as the offset is wide, and nothing downstream would notice.
  const left = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup,
    onPaces: toPaces(6), sidePaces: -toPaces(3), paceFeet: PACE_FT,
    fromTs: g.startTs, toTs: g.endTs,
  });
  const right = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup,
    onPaces: toPaces(6), sidePaces: toPaces(3), paceFeet: PACE_FT,
    fromTs: g.startTs, toTs: g.endTs,
  });
  assert(distanceM(left, g.cup) > distanceM(right, g.cup), 'left must not land on a right pin');
  near(distanceM(left, right), 2 * 3, 3, 'the two sit either side of centre');
});

test('a deeper pin lands further from the front', () => {
  const shallow = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup, onPaces: 2, sidePaces: 0,
    paceFeet: PACE_FT, fromTs: g.startTs, toTs: g.endTs,
  });
  const deep = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup, onPaces: 14, sidePaces: 0,
    paceFeet: PACE_FT, fromTs: g.startTs, toTs: g.endTs,
  });
  const gap = distanceM(shallow, deep);
  near(gap, 12 * PACE_FT * 0.3048, 2, 'twelve paces apart along the line of play');
});

test('the green centre comes from its shape, not from where he stood longest', () => {
  /*
   * The failure this guards. By far the most time on a green is spent standing
   * at the cup picking the ball out, so a time-weighted centre converges on the
   * pin itself. Every pin then comes out dead centre and the left/right entry
   * silently stops meaning anything — appearing to work perfectly while
   * measuring nothing at all.
   *
   * The fixture makes the dwell dominant on purpose: the cup is 6 m right of
   * the green's mid-line and he stands there for more fixes than the rest of
   * the walk combined, which is exactly what a real green visit looks like.
   */
  const approach = offsetM(TEE, 0, 0);
  const front = offsetM(TEE, 150, 0);
  const cup = offsetM(front, 6, 6);
  const pts = [];
  let ts = 1_700_000_000_000;
  const push = (pt, n) => {
    for (let i = 0; i < n; i++) {
      pts.push({ lat: pt.lat, lon: pt.lon, acc: 3.2, ts });
      ts += 1000;
    }
  };
  push(offsetM(front, 0, -6), 8); // on at the front, left side
  push(offsetM(front, 5, -6), 8); // his ball
  push(offsetM(front, 12, 0), 8); // behind the hole
  push(cup, 90); // and a long stand at the cup
  const endTs = ts;

  const middle = locateCupFromPaces(pts, {
    approach, anchor: cup, onPaces: toPaces(6), sidePaces: 0,
    paceFeet: PACE_FT, fromTs: 1_700_000_000_000, toTs: endTs,
  });
  assert(middle, 'expected a placement');
  assert(
    distanceM(middle, cup) > 3,
    `"middle" landed on a pin 6 m off centre (${distanceM(middle, cup).toFixed(1)} m) — centre is tracking dwell`
  );

  const described = locateCupFromPaces(pts, {
    approach, anchor: cup, onPaces: toPaces(6), sidePaces: toPaces(6),
    paceFeet: PACE_FT, fromTs: 1_700_000_000_000, toTs: endTs,
  });
  assert(
    distanceM(described, cup) < distanceM(middle, cup),
    'describing the offset must beat ignoring it'
  );
});

test('it declines without a line of play', () => {
  // No approach means no axis, and a sheet read along a guessed axis puts
  // "four paces right" four paces long.
  eq(
    locateCupFromPaces(g.points, {
      approach: null, anchor: g.cup, onPaces: 6, paceFeet: PACE_FT,
      fromTs: g.startTs, toTs: g.endTs,
    }),
    null,
    'no axis => no answer'
  );
});

test('it declines with no track on the green', () => {
  eq(locateCupFromPaces([], { approach: g.approach, anchor: g.cup, onPaces: 6 }), null, 'empty track');
});

test('a described cup is stored as described, never as measured', () => {
  const round = par4Round();
  const hole = round.holes[0];
  const found = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup, onPaces: toPaces(6), sidePaces: toPaces(3),
    paceFeet: PACE_FT, fromTs: g.startTs, toTs: g.endTs,
  });
  setCupFromPaces(hole, found, { onPaces: toPaces(6), sidePaces: toPaces(3), paceFeet: PACE_FT });
  eq(hole.cup.method, 'paces', 'the mark says how it was made');
  eq(cupIsPaced(hole), true, 'and the hole knows');
  eq(hole.cup.pinSheet.onPaces, toPaces(6), 'what he entered is kept');
  eq(hole.cup.pinSheet.paceFeet, PACE_FT, 'including the stride it was converted with');
  assert(hole.completedAt, 'and the hole is finished without ever marking the cup');
});

test('a described cup makes the hole position derivable', () => {
  // The whole point: every distance on a hole is measured to the cup, so a
  // hole with no cup produces nothing at all.
  const round = par4Round();
  const hole = round.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  eq(holePosition(hole), null, 'no cup, no hole position');
  const found = locateCupFromPaces(g.points, {
    approach: g.approach, anchor: g.cup, onPaces: toPaces(6), sidePaces: toPaces(3),
    paceFeet: PACE_FT, fromTs: g.startTs, toTs: g.endTs,
  });
  setCupFromPaces(hole, found, { onPaces: toPaces(6), sidePaces: toPaces(3), paceFeet: PACE_FT });
  const pos = holePosition(hole);
  assert(pos, 'a described cup gives the hole a position');
  near(distanceM(pos, g.cup), 0, 6, 'and it is the right one');
});

group('which hole did he actually tee off on');

/** Seed a course model with real tees for a few holes. */
function seededApp(holes = { 1: 0, 7: 600, 8: 950, 10: 300 }) {
  const app = newAppState();
  const round = par4Round();
  for (const [n, north] of Object.entries(holes)) {
    learnTee(app, round, Number(n), fakeReduced(offsetM(TEE, north, 0)));
  }
  return { app, round };
}

/** A round dealt to start on `startHole`, as the setup screen would. */
function roundStartingOn(startHole) {
  return createRound({
    course: VEENKER, teeSet: 'gold', startingNine: 'front', type: 'practice',
    holeCount: 18, startHole,
  });
}

test('it catches the field test 4 mistake: set to 7, standing on 8', () => {
  const { app } = seededApp();
  const r = roundStartingOn(7);
  const verdict = detectStartingHole(app, r, fakeReduced(offsetM(TEE, 950, 0)));
  assert(verdict, 'expected a verdict');
  eq(verdict.claimed, 7, 'what the round says');
  eq(verdict.actual, 8, 'where he is standing');
});

test('it says nothing when he is on the hole he said', () => {
  const { app } = seededApp();
  const r = roundStartingOn(7);
  eq(detectStartingHole(app, r, fakeReduced(offsetM(TEE, 603, 2))), null, 'no complaint');
});

test('it says nothing when two tees are too close to call', () => {
  // The guard that matters most. "Veenker Tees are close enough it asks me
  // every time" is how a check earns a reflexive dismissal and then catches
  // nothing. Tees 30 m apart cannot separate a shotgun start from GPS noise.
  const { app } = seededApp({ 1: 0, 2: 30 });
  const r = roundStartingOn(1);
  eq(detectStartingHole(app, r, fakeReduced(offsetM(TEE, 22, 0))), null, 'ambiguous => silent');
});

test('it says nothing when he is nowhere near any known tee', () => {
  // The model does not cover where he is. That is not evidence of a mistake.
  const { app } = seededApp();
  const r = roundStartingOn(7);
  eq(detectStartingHole(app, r, fakeReduced(offsetM(TEE, 5000, 0))), null, 'off the map => silent');
});

test('it says nothing about a hole the model has never seen', () => {
  const { app } = seededApp({ 1: 0, 10: 300 });
  const r = roundStartingOn(7); // hole 7 unseeded
  eq(detectStartingHole(app, r, fakeReduced(offsetM(TEE, 5, 0))), null, 'no reference => silent');
});

test('it needs more than one tee before it has an opinion at all', () => {
  const { app } = seededApp({ 1: 0 });
  const r = roundStartingOn(1);
  eq(detectStartingHole(app, r, fakeReduced(offsetM(TEE, 900, 0))), null, 'one tee proves nothing');
});


group('only a round that was played teaches the course');

/** A round with `holes` finished over `mins`, teeing off at `teeAt`. */
function playedRound({ holes = 9, mins = 120, teeAt = TEE, courseId = 'veenker' } = {}) {
  const round = par4Round();
  round.courseId = courseId;
  round.startedAt = new Date(Date.now() - mins * 60000).toISOString();
  round.completedAt = new Date().toISOString();
  for (let i = 0; i < holes; i++) {
    const h = round.holes[i];
    addShot(h, { lie: 'tee', reduced: fakeReduced(i === 0 ? teeAt : offsetM(teeAt, 400 * (i + 1), 0)) });
    setGreenEntry(h, { putts: 2, distances: [10, 2], unit: 'feet' });
  }
  return round;
}

test('a real round counts and a two-minute test does not', () => {
  // 26 rounds were exported after field test 4. Four were golf; the rest were
  // logged at a desk, and every one of them taught the course model.
  eq(isPlayedRound(playedRound({ holes: 9, mins: 144 })), true, 'field test 3 shape');
  eq(isPlayedRound(playedRound({ holes: 8, mins: 145 })), true, 'field test 2 shape');
  eq(isPlayedRound(playedRound({ holes: 5, mins: 93 })), true, 'field test 1 shape');
  eq(isPlayedRound(playedRound({ holes: 0, mins: 2 })), false, 'a desk session');
  eq(isPlayedRound(playedRound({ holes: 1, mins: 33 })), false, 'one hole is not a round');
  // The round left open for a week: long, but nothing was played.
  eq(isPlayedRound(playedRound({ holes: 0, mins: 11280 })), false, 'open for days, played none');
});

test('rebuilding learns from the played round and ignores the rest', () => {
  const app = newAppState();
  const real = playedRound({ holes: 9, mins: 144, teeAt: TEE });
  // A desk session whose "hole 1 tee" is somewhere else entirely.
  const desk = playedRound({ holes: 0, mins: 2, teeAt: offsetM(TEE, 23000, 0) });
  for (const r of [real, desk]) {
    saveRound(r);
    upsertRoundSummary(app, r);
  }
  rebuildCourseLearning(app, loadRound);
  const learned = app.courseLearning.veenker.tees[1].gold;
  near(distanceM(TEE, learned), 0, 2, 'the learned tee is the one he played from');
  eq(learned.n, 1, 'and the desk session contributed nothing');
});


test('a round with no holes logged is dumped from the model', () => {
  // The protection stated plainly. learnTee fires live on every mark, because
  // that is the only moment a mark exists, and at that moment nothing knows
  // whether the round will become golf. The running means cannot be
  // subtracted, so without this every abandoned session lives in the model for
  // good — which is how 22 desk sessions moved Veenker's learned tees 23 km.
  const app = newAppState();
  const real = playedRound({ holes: 9, mins: 144, teeAt: TEE });
  const nothing = playedRound({ holes: 0, mins: 4, teeAt: offsetM(TEE, 900, 0) });
  for (const r of [real, nothing]) {
    saveRound(r);
    upsertRoundSummary(app, r);
    // Live learning, exactly as marking a shot does it.
    for (const h of r.holes) {
      const t = h.shots.find((x) => x.lie === 'tee' && x.mark);
      if (t) learnTee(app, r, h.number, t.mark);
    }
  }
  // Before the rebuild the unplayed round is in there.
  assert(isPlayedRound(nothing) === false, 'the fixture is genuinely unplayed');

  rebuildCourseLearning(app, loadRound);
  const learned = app.courseLearning.veenker.tees[1].gold;
  near(distanceM(TEE, learned), 0, 2, 'only the round that was played is left');
  eq(learned.n, 1, 'and the unplayed one contributed nothing');
});

test('an abandoned round that got through five holes still counts', () => {
  // Rain after five holes is real golf. The rule is about whether it was
  // played, not about how it ended.
  const r = playedRound({ holes: 5, mins: 70 });
  r.status = 'abandoned';
  eq(isPlayedRound(r), true, 'five holes in the rain is a round');
});

test('rebuilding with nothing played leaves an empty model, not a stale one', () => {
  const app = newAppState();
  const desk = playedRound({ holes: 0, mins: 2 });
  saveRound(desk);
  upsertRoundSummary(app, desk);
  rebuildCourseLearning(app, loadRound);
  eq(Object.keys(app.courseLearning).length, 0, 'nothing to learn from');
});

group('an impossible mark does not teach the course');

test('a tee mark far from the known tee is refused', () => {
  // Veenker's learned 1st and 10th tees ended up 23.6 km apart because every
  // mark was folded in unconditionally. A tee box does not move 450 m.
  const app = newAppState();
  const round = par4Round();
  eq(learnTee(app, round, 1, fakeReduced(TEE)).warning, null, 'the first mark sets the reference');
  const { warning } = learnTee(app, round, 1, fakeReduced(offsetM(TEE, 450, 0)));
  assert(warning, 'expected a warning on a 450 m jump');
  const learned = app.courseLearning[round.courseId].tees[1].gold;
  near(distanceM(TEE, learned), 0, 1, 'the model still points at the real tee');
  eq(learned.n, 1, 'and the impossible mark was not counted');
});

test('a tee set played forward is still learned from', () => {
  // The guard is for marks that cannot be the same tee, not for the markers
  // being moved up or a different set being played.
  const app = newAppState();
  const round = par4Round();
  learnTee(app, round, 1, fakeReduced(TEE));
  const { warning } = learnTee(app, round, 1, fakeReduced(offsetM(TEE, 40, 5)));
  eq(warning, null, '40 m is a tee marker, not a mistake');
  eq(app.courseLearning[round.courseId].tees[1].gold.n, 2, 'and it counts');
});

test('a cup mark far from last round is flagged after ONE prior round', () => {
  // It used to arm at n >= 2, so the first contradicting mark went in
  // unchallenged — which is exactly how Radcliffe's holes 7 and 8 were
  // poisoned, each having a single prior observation.
  const app = newAppState();
  const round = par4Round();
  eq(learnCup(app, round, 1, fakeReduced(offsetM(TEE, 370, 0))).warning, null, 'the first mark sets the reference');
  const { warning } = learnCup(app, round, 1, fakeReduced(offsetM(TEE, 520, 0)));
  assert(warning, 'expected a warning on a 150 m jump');
});

test('and the flagged cup is not folded into the model', () => {
  const app = newAppState();
  const round = par4Round();
  const good = offsetM(TEE, 370, 0);
  learnCup(app, round, 1, fakeReduced(good));
  learnCup(app, round, 1, fakeReduced(offsetM(TEE, 520, 0)));
  const learned = app.courseLearning[round.courseId].cups[1];
  near(distanceM(good, learned), 0, 1, 'the model still points at the real cup');
  eq(learned.n, 1, 'the impossible mark was not counted');
});

test('an ordinary pin change is still learned from', () => {
  // Pins move daily. The guard is for marks that cannot be the same hole, not
  // for a cup that moved across the green.
  const app = newAppState();
  const round = par4Round();
  learnCup(app, round, 1, fakeReduced(offsetM(TEE, 370, 0)));
  const { warning } = learnCup(app, round, 1, fakeReduced(offsetM(TEE, 385, 0)));
  eq(warning, null, '15 m is a pin position, not a mistake');
  eq(app.courseLearning[round.courseId].cups[1].n, 2, 'and it counts');
});

/* ------------------------------------------------------- auto-lock default */

group('auto-lock normalises to 30');

/** Migrate a settings object and hand back what auto-lock ended up as. */
function migratedAutoLock(settings) {
  const out = migrate({ schemaVersion: 1, settings });
  return out.settings.autoLockSec;
}

test('a fresh install is 30 and skips the normalisation', () => {
  const app = newAppState();
  eq(app.settings.autoLockSec, 30, 'default');
  eq(app.settings.autoLockDefault30, true, 'flagged, so migrate leaves it alone');
});

test('the rev 1 and rev 2 defaults are brought forward', () => {
  // The only install that matters is the one that already has a value; a new
  // default alone never reaches it.
  eq(migratedAutoLock({ autoLockSec: 15 }), 30, 'rev 2 default');
  eq(migratedAutoLock({ autoLockSec: 10 }), 30, 'the old short option');
});

test('a 120 written by the earlier migration is brought back down', () => {
  // Written this morning on my reasoning rather than his. The flag from that
  // migration is what marks it as the app's value and not a hand-picked one.
  eq(
    migratedAutoLock({ autoLockSec: 120, autoLockRaisedForLockTab: true }),
    30,
    'the value the previous migration wrote'
  );
});

test('a hand-picked 120 is left alone', () => {
  // 2m is on the scale, so without the earlier migration's marker a stored 120
  // is a choice and normalising it would overrule the user.
  eq(migratedAutoLock({ autoLockSec: 120 }), 120, 'no marker, so it was chosen');
});

test('other chosen values are left alone', () => {
  eq(migratedAutoLock({ autoLockSec: 60 }), 60, '60s is on the scale');
  eq(migratedAutoLock({ autoLockSec: 300 }), 300, '5m is on the scale');
});

test('auto-lock switched off stays off', () => {
  // 0 means manual only. Normalising it would turn the lock back on for someone
  // who deliberately turned it off.
  eq(migratedAutoLock({ autoLockSec: 0 }), 0, 'OFF');
});

test('the normalisation runs once, not on every load', () => {
  const once = migrate({ schemaVersion: 1, settings: { autoLockSec: 15 } });
  eq(once.settings.autoLockDefault30, true, 'flagged after the first pass');
  // Now the user picks 60. A second load must not drag it back to 30.
  once.settings.autoLockSec = 60;
  eq(migrate(once).settings.autoLockSec, 60, 'a later choice survives');
});

/* --------------------------------------------------- scramble is quarantined */

group('scramble rounds are not analysed');

test('scramble is a round type', () => {
  eq(ROUND_TYPES.includes('scramble'), true, 'selectable at setup');
});

test('only a scramble is unscored', () => {
  eq(isUnscored({ type: 'scramble' }), true, 'scramble');
  eq(isUnscored({ type: 'tournament' }), false, 'tournament');
  eq(isUnscored({ type: 'practice' }), false, 'practice');
  eq(isUnscored(null), false, 'no round at all');
  eq(isUnscored({}), false, 'a round with no type');
});

test('the round carries its format, and the index carries it too', () => {
  // History and trends both read the summary rather than loading every round,
  // so the flag has to survive summarisation or the exclusion never fires.
  const round = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'scramble',
    holeCount: 9,
    startHole: 3,
  });
  eq(round.type, 'scramble', 'on the round');
  eq(summarizeRound(round).type, 'scramble', 'on the summary');
  eq(isUnscored(summarizeRound(round)), true, 'and the summary reads as unscored');
});

test('a scramble never enters a trend series, under any filter', () => {
  // The exclusion is about the data being meaningless, not about the current
  // selection — a filter that can be switched off is the act of memory the
  // round stamp exists to replace.
  const app = newAppState();
  const scramble = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'scramble',
    holeCount: 9,
  });
  // Give it a full, perfectly attributable hole, so nothing else could be
  // filtering it out.
  for (const hole of scramble.holes) {
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 300, 0)) });
    setCup(hole, fakeReduced(offsetM(TEE, 305, 0)));
    setGreenEntry(hole, { putts: 2, distances: [12, 2], unit: 'feet' });
  }
  scramble.status = 'completed';
  scramble.completedAt = new Date().toISOString();
  saveRound(scramble);
  upsertRoundSummary(app, scramble);

  for (const type of ['all', 'scramble', 'tournament', 'practice']) {
    const series = buildSeries(app, { type, minHoles: 1 });
    eq(
      series.some((x) => x.id === scramble.id),
      false,
      `scramble leaked into the "${type}" series`
    );
  }
});

test('a tournament round on the same data is still analysed', () => {
  // The guard above must be doing its job because of the format, not because
  // the fixture is unanalysable.
  const app = newAppState();
  const scored = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'tournament',
    holeCount: 9,
  });
  for (const hole of scored.holes) {
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    addShot(hole, { lie: 'green', reduced: fakeReduced(offsetM(TEE, 300, 0)) });
    setCup(hole, fakeReduced(offsetM(TEE, 305, 0)));
    setGreenEntry(hole, { putts: 2, distances: [12, 2], unit: 'feet' });
  }
  scored.status = 'completed';
  scored.completedAt = new Date().toISOString();
  saveRound(scored);
  upsertRoundSummary(app, scored);

  const series = buildSeries(app, { type: 'all', minHoles: 1 });
  eq(
    series.some((x) => x.id === scored.id),
    true,
    'an ordinary round should still be counted'
  );
});

/* ---------------------------------------------------------- shotgun starts */

group('shotgun start');

test('the nine is rotated to begin on the hole the group was sent to', () => {
  const order = playOrder(RADCLIFFE, 'front', 9, 6).map((x) => x.number);
  eq(order.join(','), '6,7,8,9,1,2,3,4,5', 'plays round to where it began');
});

test('starting on the first hole is the ordinary order, not a rotation', () => {
  eq(playOrder(RADCLIFFE, 'front', 9, 1).map((x) => x.number).join(','), '1,2,3,4,5,6,7,8,9');
  eq(playOrder(RADCLIFFE, 'front', 9, null).map((x) => x.number).join(','), '1,2,3,4,5,6,7,8,9');
});

test('a start hole that is not in play leaves the order alone', () => {
  // Asking for hole 14 of a nine-hole course is not a reason to deal the round
  // in some other order; it is a reason to ignore the request.
  eq(playOrder(RADCLIFFE, 'front', 9, 14).map((x) => x.number).join(','), '1,2,3,4,5,6,7,8,9');
});

test('the round itself is dealt in shotgun order, pars and yardages with it', () => {
  const round = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'tournament',
    holeCount: 9,
    startHole: 7,
  });
  eq(round.holes.map((x) => x.number).join(','), '7,8,9,1,2,3,4,5,6', 'hole order');
  // The par 3 seventh leads, and hole 1's par 5 sits fourth. If these travelled
  // separately from the numbers, every hole would show the wrong card.
  eq(round.holes[0].par, 3, 'first hole is the 7th, a par 3');
  eq(round.holes[0].yards, 226, 'and its yardage');
  eq(round.holes[3].par, 5, 'fourth played is hole 1, a par 5');
  eq(round.holes[3].yards, 520, 'and its yardage');
  eq(round.coursePar, 36, 'par is the whole nine however it is ordered');
});

test('play order is renumbered to the sequence actually played', () => {
  const round = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'tournament',
    holeCount: 9,
    startHole: 4,
  });
  eq(round.holes.map((x) => x.playOrder).join(','), '0,1,2,3,4,5,6,7,8', 'playOrder follows the deal');
  eq(round.currentHoleIndex, 0, 'and the round opens on the hole teed off');
});

test('finishing the ninth played hole finishes the round', () => {
  // The reason the array is rotated rather than the index merely moved: last
  // hole has to mean the last one played, not hole 9.
  const round = createRound({
    course: RADCLIFFE,
    teeSet: 'white',
    startingNine: 'front',
    type: 'tournament',
    holeCount: 9,
    startHole: 6,
  });
  eq(round.holes.length, 9, 'nine holes');
  eq(round.holes[round.holes.length - 1].number, 5, 'the round ends on hole 5');
});

test('an eighteen-hole shotgun rotates within the nine that is being played', () => {
  const order = playOrder(VEENKER, 'back', 9, 13).map((x) => x.number);
  eq(order.join(','), '13,14,15,16,17,18,10,11,12', 'back nine, sent to 13');
});

test('Veenker unrotated is untouched', () => {
  eq(playOrder(VEENKER, 'front', 18)[0].number, 1, 'front start');
  eq(playOrder(VEENKER, 'back', 18)[0].number, 10, 'back start');
  eq(playOrder(VEENKER, 'back', 18).map((x) => x.number).join(','),
     '10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9', 'full back-first order');
});

/* ------------------------------------------ agenda item 2: end-of-hole entry */

group('end-of-hole entry (agenda item 2)');

/**
 * A par 4 played with the phone in a pocket, at 1 Hz.
 *
 * Cart to the tee, stand over the drive, cart to the ball, stand over the
 * approach, then the green. Includes the two false positives the module
 * deliberately refuses to suppress — the walk behind the hole and a pause in
 * the cart while a partner plays — because the ranking has to push them below
 * real shots without anything filtering them out first.
 */
function pocketHole({ startTs = 1_700_000_000_000, withCartPause = true } = {}) {
  const pts = [];
  let ts = startTs;
  const jitter = [0.6, -0.5, 0.3, -0.7, 0.4, 0.2, -0.4, 0.5];
  let j = 0;
  const push = (pt) => {
    const k = jitter[j++ % jitter.length];
    const p = offsetM(pt, k, jitter[(j + 3) % jitter.length]);
    pts.push({ lat: p.lat, lon: p.lon, acc: 3.4, ts, speed: 0 });
    ts += 1000;
  };
  const drive = (fromN, toN, mps) => {
    const steps = Math.max(1, Math.round(Math.abs(toN - fromN) / mps));
    for (let i = 1; i <= steps; i++) {
      const p = offsetM(TEE, fromN + ((toN - fromN) * i) / steps, 0);
      pts.push({ lat: p.lat, lon: p.lon, acc: 3.4, ts, speed: mps });
      ts += 1000;
    }
  };

  const at = (n) => offsetM(TEE, n, 0);

  drive(-120, 0, 6); // cart up to the tee
  for (let i = 0; i < 14; i++) push(at(0)); // the drive
  drive(0, 236, 6);
  if (withCartPause) {
    // Sitting in the cart while the other Matt plays. A real stop, not a shot.
    for (let i = 0; i < 20; i++) push(at(236));
    drive(236, 250, 3);
  }
  for (let i = 0; i < 13; i++) push(at(250)); // the approach
  drive(250, 366, 6);
  for (let i = 0; i < 12; i++) push(at(366)); // ball on the green
  drive(366, 388, 1.3); // walk to the hole
  for (let i = 0; i < 45; i++) push(at(388)); // read, putt out, retrieve
  drive(388, 500, 5); // away to the next tee

  return { points: pts, startTs, endTs: ts, at };
}

const pocket = pocketHole();

test('a pocketed par 4 proposes exactly the number of full shots asked for', () => {
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  eq(r.proposed.length, 2, 'proposed count');
  eq(r.shortBy, 0, 'nothing missing');
  assert(r.found > 2, `expected more stops than shots, found ${r.found}`);
});

test('the proposals come back oldest first, not best first', () => {
  const r = proposeHoleShots(pocket.points, { fullShots: 3, fromTs: pocket.startTs, toTs: pocket.endTs });
  for (let i = 1; i < r.proposed.length; i++) {
    assert(r.proposed[i].startTs >= r.proposed[i - 1].startTs, 'out of time order');
  }
});

test('the tee shot and the approach outrank sitting in the cart', () => {
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  const tee = r.proposed[0];
  near(distanceM(tee, pocket.at(0)), 0, 8, 'first proposal is the tee');
  // The cart pause is 236 m out; the approach is at 250 m. Both are real stops
  // and only one is a shot.
  near(distanceM(r.proposed[1], pocket.at(250)), 0, 12, 'second proposal is the approach');
});

test('rejected stops are returned, not discarded', () => {
  // They are the labelled negatives. "This needs to be trainable" is a stated
  // requirement, and a candidate that is thrown away teaches nothing.
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  eq(r.proposed.length + r.rejected.length, r.found, 'every stop is accounted for');
  assert(r.rejected.length > 0, 'expected at least one rejected stop');
});

test('a score with more strokes than stops reports how many are missing', () => {
  // Stroke and distance: two strokes from one spot produce one stop, and the
  // track cannot tell that from a pre-shot reset. The count is the only
  // signal, and the UI asks him which one he played twice.
  const r = proposeHoleShots(pocket.points, { fullShots: 9, fromTs: pocket.startTs, toTs: pocket.endTs });
  eq(r.shortBy, 9 - r.eligible, 'shortBy');
  assert(r.shortBy > 0, 'expected a shortfall');
  eq(r.proposed.length, r.eligible, 'proposes everything it can');
});

test('the stop he holed out at is never offered as a full shot', () => {
  // A hole ends at the cup, so the last stop in the window is the green. The
  // raw ranking likes it — leaving for the next tee is a long departure — and
  // on this fixture it outranked the approach until it was excluded.
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  const last = [...r.proposed, ...r.rejected].sort((a, b) => b.startTs - a.startTs)[0];
  assert(!r.proposed.includes(last), 'the final stop was proposed as a full shot');
  assert(r.eligible < r.found, 'nothing was held back');
});

test('a window with no track at all proposes nothing rather than guessing', () => {
  const r = proposeHoleShots([], { fullShots: 4, fromTs: pocket.startTs, toTs: pocket.endTs });
  eq(r.found, 0, 'no stops');
  eq(r.proposed.length, 0, 'nothing proposed');
  eq(r.shortBy, 4, 'all four unaccounted for');
  eq(r.eligible, 0, 'nothing eligible either');
});

test('the cup is taken from the retrieval, not from wherever the window ends', () => {
  // The window runs to now for a hole that is not yet complete, so entering the
  // card at the next tee would otherwise put the cup on the next tee. Anchoring
  // on where the ball finished survives that.
  const late = pocketHole();
  // He walks off and stands 300 m away for a while before entering the card.
  let t = late.endTs;
  for (let i = 0; i < 40; i++) {
    const p = offsetM(TEE, 900, 0);
    late.points.push({ lat: p.lat, lon: p.lon, acc: 3.4, ts: t, speed: 0 });
    t += 1000;
  }
  const r = proposeHoleShots(late.points, { fullShots: 2, fromTs: late.startTs, toTs: t });
  assert(r.holedOut, 'expected a cup candidate');
  near(distanceM(r.holedOut, late.at(388)), 0, 25, 'cup is on the green, not where he wandered off to');
});

test('green stops come back rather than manufacture a shortfall', () => {
  // Geometry cannot separate a 60 ft putt from a 20 yard chip. Preferring
  // green-area stops out is right until it would invent a missing shot, and
  // the count has to keep meaning stroke and distance.
  const r = proposeHoleShots(pocket.points, { fullShots: 4, fromTs: pocket.startTs, toTs: pocket.endTs });
  eq(r.usedGreenStops, true, 'expected the filter to relax');
  eq(r.shortBy, 0, 'and no shortfall to be invented');
});

test('candidate accuracy reflects the centroid, not the width of the cluster', () => {
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  const acc = candidateAccuracyM(r.proposed[0]);
  assert(acc > 0, 'accuracy must be positive');
  assert(acc <= r.proposed[0].spreadM, `accuracy ${acc} should not exceed spread ${r.proposed[0].spreadM}`);
});

test('a confirmed candidate becomes a shot that still says it came from the track', () => {
  const { round, hole } = { round: par4Round(), hole: null } && (() => {
    const rd = par4Round();
    return { round: rd, hole: rd.holes[0] };
  })();
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  const shot = addTrackShot(hole, { lie: 'tee', candidate: r.proposed[0] });
  eq(shot.source, 'track', 'shot provenance');
  eq(shot.mark.method, 'track', 'mark provenance');
  assert(shot.mark.trackStop, 'the evidence that earned the proposal is kept with the shot');
  eq(round.holes[0].shots.length, 1, 'and it is on the hole');
});

test('an inferred lie is flagged rather than folded in silently', () => {
  const rd = par4Round();
  const r = proposeHoleShots(pocket.points, { fullShots: 2, fromTs: pocket.startTs, toTs: pocket.endTs });
  const guessed = addTrackShot(rd.holes[0], { lie: 'fairway', candidate: r.proposed[1], lieInferred: true });
  const known = addTrackShot(rd.holes[0], { lie: 'rough', candidate: r.proposed[0] });
  eq(guessed.lieInferred, true, 'the guess is marked');
  eq(known.lieInferred, undefined, 'an answered lie carries no flag');
});

test('the hole window opens at the previous hole and closes at this one', () => {
  const rd = par4Round();
  rd.startedAt = new Date(pocket.startTs - 600000).toISOString();
  rd.holes[0].completedAt = new Date(pocket.startTs).toISOString();
  rd.holes[1].completedAt = new Date(pocket.endTs).toISOString();
  const w = holeWindow(rd, rd.holes[1]);
  eq(w.fromTs, pocket.startTs, 'opens at the previous green');
  eq(w.toTs, pocket.endTs, 'closes when this hole was completed');
});

test('an unplayed hole with no neighbours still gets a usable window', () => {
  // The phone-in-pocket case on the very first hole: nothing has completed yet,
  // so the round start has to carry the lower bound.
  const rd = par4Round();
  rd.startedAt = new Date(pocket.startTs).toISOString();
  const w = holeWindow(rd, rd.holes[0], { now: pocket.endTs });
  eq(w.fromTs, pocket.startTs, 'opens at the round start');
  eq(w.toTs, pocket.endTs, 'closes at now');
});

test('stroke and distance is two strokes at one place, and the count says so', () => {
  // The whole recovery path in one assertion: he took 6 with 2 putts and a
  // penalty, so 3 full shots, but only ever stood in 2 places.
  const strokes = 6;
  const putts = 2;
  const penalties = 1;
  const r = proposeHoleShots(pocket.points, {
    fullShots: strokes - putts - penalties,
    fromTs: pocket.startTs,
    toTs: pocket.endTs,
  });
  eq(r.fullShots, 3, 'three full shots');
  // The fixture has more than three stops, so nothing is short here — the
  // point is that fullShots is computed from the card, not from the track.
  assert(r.found >= 3, 'the track has enough stops to cover them');
});

test('OB and lost are stroke and distance; nothing else is', () => {
  // Drives what the app tells him to do next. Matt plays it straight, so there
  // is no drop for these and "mark your next shot from the drop" is wrong.
  eq(PENALTY_TYPES.ob.strokeAndDistance, true, 'OB / lost');
  eq(PENALTY_TYPES.water.strokeAndDistance, false, 'water');
  eq(PENALTY_TYPES.unplayable.strokeAndDistance, false, 'unplayable');
});

test('a two stroke penalty can be recorded at all', () => {
  // The general penalty in stroke play is two strokes. Every type was
  // hardcoded +1 through rev 2, so it could not be entered.
  const rd = par4Round();
  const hole = rd.holes[0];
  addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
  attachPenalty(hole.shots[0], { type: 'other', strokes: 2 });
  eq(penaltyStrokes(hole), 2, 'two strokes counted');
});

/* ------------------------------------------------- first putt from the track */

group('first putt recovered from the track');

/**
 * A green visit, at 1 Hz, in the order Matt actually plays one.
 *
 * Stand at the ball, walk to the hole, stand there long enough to read, putt
 * and pick the ball out, then leave for the next tee. The walk is included at
 * a real walking pace on purpose: at 1.3 m/s a stay-point radius of 7 m closes
 * a cluster every ten seconds or so, so the walk generates its own stops. Any
 * method that just takes "the last stop" picks one of those up instead of the
 * cup, which is exactly what this fixture is here to catch.
 */
function greenVisit({ puttM = 24, dwellAtBallS = 14, dwellAtHoleS = 55, startTs = 1_700_000_000_000 } = {}) {
  const ball = offsetM(TEE, 370, 0);
  const hole = offsetM(TEE, 370 + puttM, 0);
  const pts = [];
  let ts = startTs;

  // Deterministic scatter, so a run never passes or fails by luck.
  const jitter = [0.7, -0.4, 0.2, -0.8, 0.5, 0.1, -0.3, 0.6];
  let j = 0;
  const push = (pt) => {
    const k = jitter[j++ % jitter.length];
    const p = offsetM(pt, k, jitter[(j + 3) % jitter.length]);
    pts.push({ lat: p.lat, lon: p.lon, acc: 3.2, ts });
    ts += 1000;
  };

  for (let i = 0; i < dwellAtBallS; i++) push(ball);
  // The walk, one fix per second at about 1.3 m/s.
  const steps = Math.max(1, Math.round(puttM / 1.3));
  for (let i = 1; i <= steps; i++) push(offsetM(TEE, 370 + (puttM * i) / steps, 0));
  for (let i = 0; i < dwellAtHoleS; i++) push(hole);
  // Away to the next tee.
  for (let i = 1; i <= 60; i++) push(offsetM(TEE, 370 + puttM + i * 2.4, 0));

  return { points: pts, ball, hole, startTs, endTs: ts };
}

const visit = greenVisit();
const fromBall = proposeFirstPutt(visit.points, {
  ball: { ...visit.ball, accuracyM: 2.4 },
  cup: null,
  fromTs: visit.startTs,
  toTs: visit.endTs,
});

test('recovers the cup from the track when only the ball was marked', () => {
  assert(fromBall, 'expected a proposal');
  // 24 m is 78.7 ft. Allow the scatter and the cluster centroid to move it.
  near(fromBall.distanceFt, 78.7, 12, 'first putt distance');
});

test('the recovered cup is the place he stood, not a pause in the walk', () => {
  assert(fromBall, 'expected a proposal');
  near(distanceM(fromBall.cup, visit.hole), 0, 6, 'recovered cup is at the hole');
});

test('the proposal says which end was measured and which was inferred', () => {
  eq(fromBall.ball.source, 'mark', 'the ball was marked');
  eq(fromBall.cup.source, 'track', 'the cup came from the track');
});

test('a long putt with one marked end is offered with real confidence', () => {
  assert(
    fromBall.confidence === 'good' || fromBall.confidence === 'fair',
    `expected good or fair, got ${fromBall.confidence} (±${fromBall.uncertaintyFt} ft)`
  );
});

test('nothing is proposed when both ends were actually marked', () => {
  // The measured distance already exists. A track guess must never displace it.
  const both = proposeFirstPutt(visit.points, {
    ball: { ...visit.ball, accuracyM: 2.4 },
    cup: { ...visit.hole, accuracyM: 2.1 },
    fromTs: visit.startTs,
    toTs: visit.endTs,
  });
  eq(both, null, 'proposed over a pair of real marks');
});

test('the mirror case recovers the ball when only the cup was marked', () => {
  const fromCup = proposeFirstPutt(visit.points, {
    ball: null,
    cup: { ...visit.hole, accuracyM: 2.1 },
    fromTs: visit.startTs,
    toTs: visit.endTs,
  });
  assert(fromCup, 'expected a proposal');
  eq(fromCup.ball.source, 'track', 'the ball came from the track');
  near(fromCup.distanceFt, 78.7, 14, 'first putt distance from the cup end');
});

test('a short putt is downgraded however tight the geometry looks', () => {
  // The expected-putts curve is steep inside 10 ft, and GPS cannot separate a
  // tap-in from a ten-footer. Reporting this as trustworthy would be worse
  // than reporting nothing.
  const tap = greenVisit({ puttM: 2.5, dwellAtHoleS: 40 });
  const p = proposeFirstPutt(tap.points, {
    ball: { ...tap.ball, accuracyM: 2.0 },
    cup: null,
    fromTs: tap.startTs,
    toTs: tap.endTs,
  });
  if (p) eq(p.confidence, 'poor', `a ${p.distanceFt} ft estimate was not downgraded`);
});

test('nothing is proposed when the window holds no track at all', () => {
  eq(proposeFirstPutt([], { ball: { ...visit.ball, accuracyM: 2 } }), null, 'empty track');
});

test('a stop far beyond putting range is never taken as the cup', () => {
  // Only the walk to the next tee falls inside this window, so there is no
  // honest answer and the right move is to decline rather than to invent one.
  const late = proposeFirstPutt(visit.points, {
    ball: { ...offsetM(TEE, 0, 0), accuracyM: 2.4 },
    cup: null,
    fromTs: visit.startTs,
    toTs: visit.endTs,
  });
  eq(late, null, 'accepted a stop that is nowhere near the ball');
});

/**
 * LIVE INDICATORS ON THE PLAY SCREEN
 *
 * Regression cover for the rev 3 bug that shipped as "root cause not found":
 * the accuracy chip sat frozen on a stale reading all through field test 3's
 * gaps. `tick()` was fine. It was simply never called except from the GPS
 * 'fix' event, so the one thing the chip exists to report — fixes stopping —
 * was the one thing that could not make it repaint.
 *
 * The test therefore never emits an event. It ages the only fix past
 * `staleFixMs` and waits, which is precisely the situation that used to leave a
 * healthy-looking accuracy on screen for eleven minutes at a time.
 *
 * Async because the heartbeat is a real 2 s timer, and following the shape the
 * shell tests already use: do the waiting first, assert synchronously after.
 */
export async function runLiveIndicatorTests() {
  group('live indicators');

  const app = newAppState();
  const round = par4Round();
  const gps = new GpsService();
  gps.last = { lat: TEE.lat, lon: TEE.lon, acc: 3.2, ts: Date.now() };

  const screen = playScreen({
    app,
    round,
    gps,
    params: {},
    go() {},
    persistRound() {},
    persistApp() {},
    startGps() {},
    stopGps() {},
    trackStats: () => ({ written: 120, inBuffer: 0, failures: 0 }),
  });

  // Must be in the document: the heartbeat cancels itself once the screen is
  // gone, which is also what keeps it from outliving the round.
  document.body.appendChild(screen.el);
  const chipText = () => screen.el.querySelector('.acc-chip')?.textContent ?? '';

  const whileLive = chipText();

  // The receiver goes quiet. No 'fix', no 'error', no repaint requested by
  // anyone — exactly what a suspended page looks like from in here.
  gps.last = { ...gps.last, ts: Date.now() - 60000 };
  await new Promise((r) => setTimeout(r, 2600));
  const afterQuiet = chipText();

  screen.el.remove();
  // One more beat: a detached screen must stop painting rather than keep a
  // timer alive for every round ever opened in this tab.
  await new Promise((r) => setTimeout(r, 2400));
  const afterRemoval = chipText();

  test('the accuracy chip shows the live reading while fixes are arriving', () => {
    assert(/3\.2/.test(whileLive), `expected the live accuracy, got ${JSON.stringify(whileLive)}`);
  });

  test('the accuracy chip stops showing a stale reading once fixes stop', () => {
    assert(
      !/3\.2/.test(afterQuiet),
      `the chip held a stale reading with no fixes arriving: ${JSON.stringify(afterQuiet)}`
    );
  });

  test('and says how long it has been without one, rather than going blank', () => {
    assert(
      /no fix/i.test(afterQuiet) && /\d/.test(afterQuiet),
      `expected an age, got ${JSON.stringify(afterQuiet)}`
    );
  });

  test('the heartbeat cancels itself when the screen is detached', () => {
    eq(afterRemoval, afterQuiet, 'a removed screen kept repainting');
  });
}

export function getResults() {
  return results;
}
