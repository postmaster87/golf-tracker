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
import { reduceBurst } from '../js/gps/gps.js';
import { VEENKER, playOrder, holeYards, newCustomCourse } from '../js/data/courses.js';
import {
  createRound,
  addShot,
  setCup,
  undoLast,
  restoreUndo,
  attachPenalty,
  setManualHole,
  setShotClub,
  setShotDistanceFt,
  setShotDistance,
  setGreenEntry,
  puttDistancesFt,
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
  fmtDistance,
} from '../js/round/round.js';
import { newAppState, THEMES } from '../js/data/schema.js';
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
} from '../js/analysis/trends.js';
import { buildExport, importExport, saveRound, saveApp, loadRound, allRoundIds, deleteRound } from '../js/data/store.js';

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
  }
  addShot(round.holes[3], { lie: 'tee', reduced: fakeReduced(TEE) }); // in progress
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

export function getResults() {
  return results;
}
