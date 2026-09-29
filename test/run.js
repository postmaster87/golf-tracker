/**
 * Test harness. Runs in the browser (no Node required) against the real
 * shipped ES modules and the real shipped CSS — so nothing here can pass
 * against a copy of the logic that isn't what deploys.
 *
 * Open test/index.html over http:// and read the results.
 */

import { GEO_FIXTURES } from './fixtures.js';
import { distanceM, bearingDeg, radiiAt, toYards, toFeet, feetToM, weightedCentroid, enuOffset, offsetPoint } from '../js/util/geo.js';
import { pointInRing, distanceToPolyline, distanceToRing, ringCentroid, rayRingIntersections } from '../js/util/polygon.js';
import { courseGeometry, lieAt, toGreen, nearestHole } from '../js/round/course-geometry.js';
import { greenFrame, pinFromSheet, offOwnGreenM, HOLE_ON_GREEN_M, APPROACH_BACK_M } from '../js/round/hole-position.js';
import { median, mad } from '../js/util/stats.js';
import { reduceBurst, GpsService } from '../js/gps/gps.js';
import { VEENKER, RADCLIFFE, playOrder, holeYards, newCustomCourse } from '../js/data/courses.js';
import { BUILD, buildLabel } from '../js/data/build.js';
import {
  createRound,
  addShot,
  addTrackShot,
  addShotLieLater,
  setShotLie,
  lieUnanswered,
  roundGaps,
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
  holeContextFor,
  setPinSheet,
  addMapTee,
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
  newRound,
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
  revisionLabel,
  isWorkingRevision,
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
  DWELL_HALF_S,
} from '../js/round/track-analysis.js';
import {
  createTrackWriter,
  readTrack,
  trackSize,
  deleteTrack,
  expandFix,
  pruneOrphanTracks,
  trackedRoundIds,
  writeTrackChunk,
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
import { sheet, closeSheet } from '../js/ui/dom.js';
import { playScreen, firstPuttEntryMode, TYPED_PUTT_MAX_FT, mapLieRow, shotRowHeading } from '../js/ui/screen-play.js';
import { settingsScreen } from '../js/ui/screen-settings.js';
import { summaryScreen } from '../js/ui/screen-summary.js';
import { homeScreen } from '../js/ui/screen-home.js';
import {
  PERSISTENT,
  BEST_EFFORT,
  UNKNOWN,
  checkPersistence,
  requestPersistence,
  ensurePersistence,
  persistenceLabel,
} from '../js/data/persistence.js';
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
  downloadExport,
  shareExport,
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
// The Hole Overview (docs/SPEC_hole-overview.md), stage 1.
import { holePath, holeFeatures, teeOrigin, playPath, holeNumbers, layupPoint } from '../js/round/course-geometry.js';
import { courseFrames, framePx } from '../js/round/course-geometry.js';
import { SCHEMA_VERSION, newCourseNotes, newLayup } from '../js/data/schema.js';
import { courseNotesKey, loadCourseNotes, saveCourseNotes, allCourseNotesIds, onStorageError } from '../js/data/store.js';
// The Hole Overview (docs/SPEC_hole-overview.md), stage 2: the page.
import { holeOverview, mapScreen } from '../js/ui/hole-overview.js';

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

// Holes 7 and 10 corrected by Matt, 2026-09-13 (+20 blue each). The front nine
// now matches the course yardage book's printed OUT of 3371.
test('blue nines sum to 3371 and 3301', () => {
  const out = VEENKER.holes.slice(0, 9).reduce((a, h) => a + h.yards.blue, 0);
  const inn = VEENKER.holes.slice(9).reduce((a, h) => a + h.yards.blue, 0);
  eq(out, 3371, 'blue OUT');
  eq(inn, 3301, 'blue IN');
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
  // No course map passed: the order a course without one reads (D1, 3.3).
  const geo = shotGeometry(hole, { accumulated: fallback });
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
  // Three par 4s whose card is within 100 yd of this 388 yd layout: on hole 2
  // (283 yd) a tee 388 yd out is not on the hole (docs/SPEC_hole-position.md
  // Section 12, C8).
  for (const i of [0, 3, 4]) {
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

/*
 * Zones come off the overlay, matching what `zoneOf` measures. A hidden test
 * pane reports `window.innerHeight: 0`, which used to collapse every zone into
 * the dead band and fail "the deliberate gesture unlocks" — the long-standing
 * "intermittent" in this group. The overlay is given an explicit height below
 * so the geometry is the same whether or not anyone is looking at the pane.
 */
const zoneH = () => {
  const ov = document.querySelector('.lock-screen');
  const h = ov?.getBoundingClientRect().height || window.innerHeight;
  return h;
};
const TOP = () => zoneH() * 0.2;
const BOTTOM = () => zoneH() * 0.8;
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
      // A real height, so the zones exist even when the pane is hidden and the
      // viewport measures zero. In production `inset: 0` supplies this.
      document.querySelector('.lock-screen').style.height = '800px';
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
      await lockTap(zoneH() * 0.25);
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

/*
 * THE REVISION LIVES IN SETTINGS, AND NOWHERE ELSE.
 *
 * Matt, 2026-09-17, reading the bottom of the rev 5 home screen on his phone:
 * "get it out of there and put it in the settings screen". Both halves are
 * asserted together on purpose — deleting the home footer is only correct if
 * the whole line it carried, "not yet played" marker included, survived
 * somewhere he can still find it.
 */
const revScreenCtx = () => ({
  app: newAppState(),
  round: null,
  gps: { current: null, running: false, error: null, fixCount: 0, staleSinceMs: () => null },
  params: {},
  go() {},
  persistApp() {},
  persistRound() {},
  startGps() {},
  stopGps() {},
  trackStats: () => null,
});

test('the home screen shows no revision line', () => {
  const text = homeScreen(revScreenCtx()).el.textContent;
  assert(!text.includes(revisionLabel()), `"${revisionLabel()}" is still on the home screen`);
  assert(!/not yet played/.test(text), 'the "not yet played" marker is still on the home screen');
});

test('the Settings build line carries the revision and its marker', () => {
  const el = settingsScreen(revScreenCtx()).el;
  const line = [...el.querySelectorAll('p')].map((p) => p.textContent).find((t) => t.startsWith('Build '));
  assert(line, 'no Build line on the settings screen at all');
  assert(line.includes(revisionLabel()), `no ${revisionLabel()} in ${JSON.stringify(line)}`);
  assert(line.includes(revisionInfo()?.title ?? ''), `no revision title in ${JSON.stringify(line)}`);
  eq(
    line.includes('· not yet played'),
    isWorkingRevision(),
    `the marker disagrees with isWorkingRevision() in ${JSON.stringify(line)}`
  );
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

test('a long stand outranks a brief stop that happens to depart a long way', () => {
  /*
   * This test used to be "a shot outranks a walk behind the hole", and it
   * passed by giving the tee a long `departureM` and the putt-read a short one
   * while standing 12 s at each. That was testing the old model back at itself:
   * measured on four real rounds, departure does not separate shots from
   * anything (20.5 m vs 23.7 m), and dwell does (62.9 s vs 19.0 s).
   *
   * So the fixture is now built to FAIL if departure ever votes again. The
   * companion stop — the cart you walked back to, the partner's ball — is
   * short-dwell and departs a long way. The real shot is long-dwell and departs
   * barely at all, because the next stop after it is that companion. Under the
   * old scoring the companion wins outright.
   */
  const companion = offsetM(TEE, 25, 0);
  const pts = synthTrack([
    { stand: TEE, seconds: 70 },        // over the ball, then marking it
    { to: companion, speed: 1.3 },      // walk back to the cart, 25 m
    { stand: companion, seconds: 12 },  // brief: sit down, drive off
    { to: BALL_1, speed: 5 },           // the cart covers a long way
    { stand: BALL_1, seconds: 60 },
  ]);
  const cands = stopCandidates(pts);
  const shot = cands.find((c) => distanceM(c, TEE) < 15);
  const cart = cands.find((c) => distanceM(c, companion) < 15);
  assert(shot && cart, 'both stops are reported, neither suppressed');
  assert(
    cart.departureM > shot.departureM,
    `fixture is wrong: the companion must depart further (${cart.departureM} vs ${shot.departureM})`
  );
  assert(
    shot.score > cart.score,
    `the long stand (${shot.score}) must outrank the brief one (${cart.score}) despite departing less`
  );
});

test('the score is exactly the dwell ordering, with no ties at the top', () => {
  // Capping dwell measurably costs accuracy by tying the longest stops
  // together — precisely the ones most likely to be shots. Monotonic for ever.
  const long = { dwellMs: 240000 };
  const longer = { dwellMs: 600000 };
  const f = (c) => c.dwellMs / 1000 / (c.dwellMs / 1000 + DWELL_HALF_S);
  assert(f(longer) > f(long), 'a ten-minute stand must still outrank a four-minute one');
  assert(f(longer) < 1, 'the score stays bounded so it can be read as a confidence');
  near(45 / (45 + DWELL_HALF_S), 0.5, 1e-9, 'the half-point is where the summary threshold sits');
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

  /*
   * The visible build number and the shell cache name must not drift.
   *
   * They are bumped by hand in two files, and a mismatch is silent and nasty:
   * Settings would report a build the phone is not actually caching, which is
   * precisely the question the number exists to answer.
   */
  test('the build number matches the shell cache name', () => {
    const cache = swText.match(/gt-shell-(v\d+)/)?.[1] ?? null;
    eq(cache, BUILD.id, 'sw.js cache version vs BUILD.id in js/data/build.js');
  });

  test('the build carries a plausible date', () => {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(BUILD.date), `BUILD.date should be ISO, got ${BUILD.date}`);
    assert(buildLabel().includes(BUILD.id), 'the label names the build');
  });

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

/* ------------------------------------------------------ course geometry (map) */

group('course geometry');

{
  // docs/SPEC_course-geometry.md Section 3. Every position here is built FROM
  // the generated data (centroids, line points, offsets), never typed in.
  const G = courseGeometry(VEENKER);
  const poly = (id) => G?.polygons.find((p) => p.id === id) ?? null;
  const holeG = (n) => G?.holes.find((h) => h.number === n) ?? null;
  const inPoly = (pt, p) => pointInRing(pt, p.ring) && !(p.inner ?? []).some((r) => pointInRing(pt, r));

  test('the data: 18 holes, greens and tees present, his corrections produced by the rules', () => {
    assert(G, 'Veenker has no geometry');
    eq(G.holes.length, 18, 'holes');
    for (const h of G.holes) {
      assert(poly(h.greenId)?.kind === 'green', `hole ${h.number}: green ${h.greenId} not in polygons`);
      assert(h.teeIds.length >= 1 && h.teeIds.every((id) => poly(id)?.kind === 'tee'), `hole ${h.number}: tees`);
    }
    const h8 = holeG(8);
    const h9 = holeG(9);
    for (const id of [199418750, 1065750025]) assert(h8.teeIds.includes(id), `hole 8 tee ${id}`);
    eq(h8.greenId, 1065750750, 'hole 8 green');
    for (const id of [1065750754, 199289144, 1065727838]) assert(h9.teeIds.includes(id), `hole 9 tee ${id}`);
    assert(
      holeG(12).teeIds.some((id) => poly(id).sets.includes('blue') && poly(id).sets.includes('gold')),
      'hole 12 has no tee with both sets',
    );
    assert(holeG(11).teeIds.some((id) => holeG(18).teeIds.includes(id)), '11 and 18 share no tee');
    const box = poly(199288462);
    eq(JSON.stringify(box.holes), '[11,18]', '11/18 box holes');
    eq(JSON.stringify(box.sets), '["blue","gold"]', '11/18 box sets');
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    assert(same(holeG(3).teeIds, [199288713, 1065730087, 199288714]), `hole 3 tees ${JSON.stringify(holeG(3).teeIds)}`);
    assert(same(holeG(6).teeIds, [199288711, 199288712]), `hole 6 tees ${JSON.stringify(holeG(6).teeIds)}`);
    const p16 = G.points.find((p) => p.id === 'hole16-back-blue');
    assert(p16 && p16.source === 'markup', 'hole16-back-blue point missing or not markup');
  });

  test('every ring is closed and every hole line ends inside its green', () => {
    for (const p of G.polygons) {
      for (const r of [p.ring, ...(p.inner ?? [])]) {
        const a = r[0];
        const b = r[r.length - 1];
        assert(a.lat === b.lat && a.lon === b.lon, `polygon ${p.id} ring not closed`);
      }
    }
    for (const h of G.holes) {
      assert(pointInRing(h.line[h.line.length - 1], poly(h.greenId).ring), `hole ${h.number}: line end not in green`);
    }
  });

  test('pointInRing: a green holds its centroid, and not 200 m north of it', () => {
    const ring = poly(holeG(1).greenId).ring;
    const c = ringCentroid(ring);
    assert(pointInRing(c, ring), 'centroid not inside');
    assert(!pointInRing(offsetPoint(c, { north: 200 }), ring), '200 m north is inside');
  });

  test('lieAt: green, sand, tee, fairway, rough, and off the map', () => {
    eq(lieAt(G, ringCentroid(poly(holeG(1).greenId).ring)).lie, 'green', 'hole 1 green centroid');
    const bunker = G.polygons.find((p) => p.kind === 'bunker' && inPoly(ringCentroid(p.ring), p));
    const sand = lieAt(G, ringCentroid(bunker.ring));
    eq(sand.lie, 'sand', 'bunker centroid');
    eq(sand.feature?.kind, 'bunker', 'feature kind');
    const blueTee = holeG(1).teeIds.map(poly).find((t) => t.sets.includes('blue'));
    eq(lieAt(G, ringCentroid(blueTee.ring)).lie, 'tee', 'hole 1 blue tee centroid');
    const others = G.polygons.filter((p) => p.kind === 'green' || p.kind === 'bunker' || p.kind === 'tee');
    const fw = G.polygons.find((p) => {
      if (p.kind !== 'fairway') return false;
      const c = ringCentroid(p.ring);
      return inPoly(c, p) && !others.some((o) => inPoly(c, o));
    });
    eq(lieAt(G, ringCentroid(fw.ring)).lie, 'fairway', `fairway ${fw.id} centroid`);
    // 30 m square off hole 7's line, at the first place along it inside no polygon.
    const line = holeG(7).line;
    let rough = null;
    for (let i = 1; i < line.length && !rough; i++) {
      const a = line[i - 1];
      const d = enuOffset(a, line[i]);
      const len = Math.hypot(d.east, d.north);
      for (const f of [0.5, 0.25, 0.75]) {
        for (const side of [1, -1]) {
          const pt = offsetPoint(a, {
            north: f * d.north + (side * -d.east * 30) / len,
            east: f * d.east + (side * d.north * 30) / len,
          });
          if (!rough && !G.polygons.some((p) => inPoly(pt, p))) rough = pt;
        }
      }
    }
    assert(rough, 'no point 30 m off hole 7 that is inside no polygon');
    near(distanceToPolyline(rough, line), 30, 0.5, 'the point is 30 m off the line');
    const r = lieAt(G, rough);
    eq(r.lie, 'rough', '30 m off hole 7');
    assert(Number.isFinite(r.edgeM), 'rough without edgeM');
    const far = offsetPoint(ringCentroid(poly(holeG(1).greenId).ring), { north: 5000 });
    eq(lieAt(G, far).lie, null, '5 km away');
  });

  test('lieAt band: 2 m inside a green edge with a 3 m fix is in question; the centroid is not', () => {
    const ring = poly(holeG(1).greenId).ring;
    const c = ringCentroid(ring);
    const edge = rayRingIntersections(c, offsetPoint(c, { north: 100 }), ring)[0];
    const pt = { ...offsetPoint(c, { north: edge - 2 }), accuracyM: 3 };
    const r = lieAt(G, pt);
    eq(r.lie, 'green', 'still green');
    assert(r.inQuestion, `not in question (edgeM ${r.edgeM})`);
    assert(
      r.alternatives.includes('rough') || r.alternatives.length >= 1,
      `no alternatives: ${JSON.stringify(r.alternatives)}`,
    );
    assert(!lieAt(G, { ...c, accuracyM: 3 }).inQuestion, 'centroid in question');
  });

  // Test 6a: from the box each hole's line starts on (teeIds[0]), n = 18.
  // Fable's ruling on Section 3 item 6: the straight tee-to-green distance
  // was the wrong ruler; the card measures along the line of play (6b).
  test("toGreen from each hole's first tee: front <= centre <= back, 10-60 m deep (n = 18)", () => {
    eq(G.holes.length, 18, 'holes');
    for (const h of G.holes) {
      const tg = toGreen(G, h.number, ringCentroid(poly(h.teeIds[0]).ring));
      assert(tg.frontM <= tg.centreM && tg.centreM <= tg.backM, `hole ${h.number}: order ${tg.frontM}/${tg.centreM}/${tg.backM}`);
      const depth = tg.backM - tg.frontM;
      assert(depth >= 10 && depth <= 60, `hole ${h.number}: depth ${depth.toFixed(1)} m`);
    }
  });

  // Test 6b: the OSM hole line follows the line of play, as the card does.
  // Card set from the line's first box: blue if it carries blue, else gold.
  const t6b = (G?.holes ?? []).map((h) => {
    let lenM = 0;
    for (let i = 1; i < h.line.length; i++) lenM += distanceM(h.line[i - 1], h.line[i]);
    const sets = poly(h.teeIds[0])?.sets ?? [];
    const set = sets.includes('blue') ? 'blue' : sets.includes('gold') ? 'gold' : 'blue';
    const card = VEENKER.holes[h.number - 1].yards[set];
    const yd = toYards(lenM);
    return { n: h.number, yd, set, card, dev: (yd - card) / card };
  });
  const worst = t6b.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a), t6b[0] ?? { n: '-', dev: NaN });
  const worstTxt = `hole ${worst.n} ${(worst.dev * 100).toFixed(1)}%`;
  console.log(`[course geometry] hole line vs card, n = 18: largest deviation ${worstTxt}`);
  test(`the hole line's length is within 8% of the card for its first box's set (n = 18; largest ${worstTxt})`, () => {
    eq(t6b.length, 18, 'holes');
    const bad = t6b
      .filter((r) => !(Math.abs(r.dev) <= 0.08))
      .map((r) => `hole ${r.n}: ${r.yd.toFixed(0)} vs ${r.set} card ${r.card} (${(r.dev * 100).toFixed(1)}%)`);
    assert(!bad.length, `outside 8%: ${bad.join('; ')}`);
  });

  test('toGreen standing on the green: front is 0', () => {
    const tg = toGreen(G, 1, ringCentroid(poly(holeG(1).greenId).ring));
    eq(tg.frontM, 0, 'frontM');
    assert(tg.centreM <= tg.backM, 'centre beyond back');
  });

  test('nearestHole: each green centroid names its hole (18/18); the 11/18 box is not decisive', () => {
    for (const h of G.holes) {
      const r = nearestHole(G, ringCentroid(poly(h.greenId).ring));
      assert(r && r.hole === h.number && r.onGreen, `hole ${h.number}: got ${JSON.stringify(r)}`);
    }
    const shared = holeG(11).teeIds.find((id) => holeG(18).teeIds.includes(id));
    const r = nearestHole(G, ringCentroid(poly(shared).ring));
    assert(r && (r.hole === 11 || r.hole === 18), `shared box: ${JSON.stringify(r)}`);
    eq(r.marginM, 0, 'marginM');
  });

  test('Radcliffe has no map and every engine call says null', () => {
    const R = courseGeometry(RADCLIFFE);
    eq(R, null, 'courseGeometry(RADCLIFFE)');
    const pt = ringCentroid(poly(holeG(1).greenId).ring);
    eq(lieAt(R, pt), null, 'lieAt');
    eq(toGreen(R, 1, pt), null, 'toGreen');
    eq(nearestHole(R, pt), null, 'nearestHole');
  });
}

/* ------------------------------------ the Hole Overview (docs/SPEC_hole-overview.md) */

group('hole overview (numbers)');

{
  // Section 3.9. Positions come from the data (centroids, path points, offsets);
  // expected yardages are Fable's prototype, an independent implementation,
  // tolerance 1 yd.
  const G = courseGeometry(VEENKER);
  const poly = (id) => G.polygons.find((p) => p.id === id);
  const feature = (rows, name) => rows.find((f) => f.name === name);
  const yd = (rows, name, reach, carry, msg) => {
    const f = feature(rows, name);
    assert(f, `${msg}: no ${name}`);
    near(f.reachYd, reach, 1, `${msg} ${name} reach`);
    near(f.carryYd, carry, 1, `${msg} ${name} carry`);
    return f;
  };
  const fromTee = (n, set) => holeNumbers(G, n, teeOrigin(G, n, set)).features;
  /** `sM` metres down hole `n`'s path, `leftM` metres to its left (negative: right). */
  const down = (n, sM, leftM = 0) => {
    const H = holePath(G, n);
    let acc = 0;
    for (let i = 1; i < H.length; i++) {
      const d = enuOffset(H[i - 1], H[i]);
      const L = Math.hypot(d.east, d.north);
      if (sM <= acc + L) {
        const p = offsetPoint(H[i - 1], { east: (d.east * (sM - acc)) / L, north: (d.north * (sM - acc)) / L });
        return offsetPoint(p, { east: (-d.north / L) * leftM, north: (d.east / L) * leftM });
      }
      acc += L;
    }
    return null;
  };

  test('the tee for a set: the farther box, his markup point, none, a shared box', () => {
    eq(teeOrigin(G, 10, 'blue').id, 1065741882, 'hole 10 blue: the farther of the two blue boxes');
    const t16 = teeOrigin(G, 16, 'blue');
    eq(t16.id, 'hole16-back-blue', 'hole 16 blue');
    eq(t16.source, 'markup', 'hole 16 blue source');
    eq(t16.accuracyM, null, 'hole 16 blue accuracyM');
    eq(teeOrigin(G, 10, 'blue').source, 'map', 'a box is the map');
    eq(teeOrigin(G, 1, 'white'), null, 'hole 1 white');
    eq(teeOrigin(G, 11, 'blue').id, teeOrigin(G, 18, 'blue').id, 'holes 11 and 18 blue');
  });

  test('what is numbered: Table 1, all 18 holes (25 bunkers, 5 creek crossings, n = 30)', () => {
    const TABLE_1 = {
      3: 'B1 bunker R',
      4: 'B1 bunker L; B2 bunker R; B3 bunker L',
      5: 'B1 bunker R',
      6: 'B1 bunker L',
      7: 'W1 creek C',
      8: 'B1 bunker L; B2 bunker R',
      9: 'B1 bunker R; B2 bunker R',
      10: 'B1 bunker L; B2 bunker R; B3 bunker L',
      11: 'W1 creek C; B1 bunker L; B2 bunker R; B3 bunker R',
      12: 'B1 bunker L; B2 bunker R',
      13: 'B1 bunker R',
      14: 'B1 bunker R',
      15: 'W1 creek C; B1 bunker L; B2 bunker R',
      16: 'W1 creek C; W2 creek C; B1 bunker L',
      17: 'B1 bunker R; B2 bunker R',
    };
    let n = 0;
    for (let h = 1; h <= 18; h++) {
      const fs = holeFeatures(G, h);
      n += fs.length;
      const got = fs.map((f) => `${f.name} ${f.kind === 'bunker' ? 'bunker' : f.mode === 'cross' ? 'creek' : f.kind} ${f.side}`);
      eq(got.join('; '), TABLE_1[h] ?? '', `hole ${h}`);
    }
    eq(n, 30, 'rows');
  });

  test('a greenside bunker is numbered on one hole: its green', () => {
    const on = (id, h) => holeFeatures(G, h).some((f) => f.id === id);
    assert(on(1065746512, 13) && !on(1065746512, 2), 'bunker 1065746512: hole 13 and not hole 2');
    assert(on(1065741609, 16) && !on(1065741609, 2) && !on(1065741609, 4), 'bunker 1065741609: hole 16, not 2 or 4');
  });

  test("a bunker's reach and carry; a pond gets no number", () => {
    yd(fromTee(3, 'blue'), 'B1', 278, 293, 'hole 3 blue');
    for (const h of [2, 3, 5]) eq(holeFeatures(G, h).filter((f) => f.kind === 'water').length, 0, `hole ${h} water`);
  });

  test('the creek from the tee: holes 7, 11, 15 and 16', () => {
    yd(fromTee(7, 'blue'), 'W1', 360, 398, 'hole 7 blue');
    yd(fromTee(11, 'blue'), 'W1', 63, 90, 'hole 11 blue');
    yd(fromTee(15, 'blue'), 'W1', 244, 255, 'hole 15 blue');
    yd(fromTee(15, 'gold'), 'W1', 211, 223, 'hole 15 gold');
    yd(fromTee(16, 'blue'), 'W1', 80, 99, 'hole 16 blue');
    yd(fromTee(16, 'blue'), 'W2', 457, 477, 'hole 16 blue');
    yd(fromTee(16, 'gold'), 'W1', 17, 35, 'hole 16 gold');
    yd(fromTee(16, 'gold'), 'W2', 394, 415, 'hole 16 gold');
  });

  test('the creek on his own line: hole 7, 300 yd down, on the line and 30 m either side', () => {
    const s = 300 * 0.9144;
    for (const [leftM, reach, carry] of [[0, 59, 97], [30, 35, 74], [-30, 84, 116]]) {
      const w = yd(holeNumbers(G, 7, down(7, s, leftM)).features, 'W1', reach, carry, `${leftM} m left`);
      eq(w.ownLine, true, `${leftM} m left: ownLine`);
    }
  });

  test('behind him, and standing in it', () => {
    const H7 = holePath(G, 7);
    eq(feature(holeNumbers(G, 7, H7[H7.length - 1]).features, 'W1').behind, true, 'hole 7 green centroid: W1 behind');
    const b = poly(1065747078); // hole 3's B1
    const c = ringCentroid(b.ring);
    assert(pointInRing(c, b.ring), 'fixture: the centroid is inside the bunker');
    const f = holeNumbers(G, 3, c).features.find((x) => x.name === 'B1');
    eq(f.reachM, 0, 'reachM');
    eq(f.inside, true, 'inside');
  });

  test('layup points: from the green, from the tee, none that far, no tee', () => {
    const H7 = holePath(G, 7);
    const C7 = H7[H7.length - 1];
    const g = layupPoint(G, 7, { ref: 'green', yards: 100 }, null);
    near(distanceToPolyline(g, H7), 0, 0.05, 'green 100 is on the path, m');
    near(toYards(distanceM(g, C7)), 100, 0.1, 'green 100 from the green centroid, yd');
    const tee = teeOrigin(G, 7, 'blue');
    const t = layupPoint(G, 7, { ref: 'tee', yards: 250 }, tee);
    near(distanceToPolyline(t, playPath(G, 7, tee).path), 0, 0.05, 'tee 250 is on his line, m');
    near(toYards(distanceM(t, tee)), 250, 0.1, 'tee 250 from the blue tee, yd');
    eq(layupPoint(G, 8, { ref: 'green', yards: 400 }, null), null, 'hole 8 green 400');
    eq(layupPoint(G, 7, { ref: 'tee', yards: 250 }, null), null, 'tee with no tee');
  });

  test("the page's green is the play screen's: holeNumbers(...).green deep-equals toGreen", () => {
    const H7 = holePath(G, 7);
    for (const o of [teeOrigin(G, 7, 'blue'), { ...down(7, 300 * 0.9144, 12), accuracyM: 3.2 }, H7[H7.length - 1]]) {
      eq(JSON.stringify(holeNumbers(G, 7, o).green), JSON.stringify(toGreen(G, 7, o)), `from ${JSON.stringify(o)}`);
    }
  });

  test('Radcliffe has no map: every function says null or []', () => {
    const R = courseGeometry(RADCLIFFE);
    const pt = teeOrigin(G, 7, 'blue');
    eq(holePath(R, 1), null, 'holePath');
    eq(JSON.stringify(holeFeatures(R, 1)), '[]', 'holeFeatures');
    eq(teeOrigin(R, 1, 'blue'), null, 'teeOrigin');
    eq(playPath(R, 1, pt), null, 'playPath');
    eq(holeNumbers(R, 1, pt), null, 'holeNumbers');
    eq(layupPoint(R, 1, { ref: 'green', yards: 100 }, pt), null, 'layupPoint');
  });

  // Section 7 (Part E): his "yes to 9", 2026-09-15 - the back box blue, the next gold.
  test("hole 9's tees: blue 1065750754 and gold 199289144, and their numbers", () => {
    eq(teeOrigin(G, 9, 'blue').id, 1065750754, 'hole 9 blue');
    eq(teeOrigin(G, 9, 'gold').id, 199289144, 'hole 9 gold');
    for (const [set, green, b1, b2] of [
      ['blue', [496, 513, 530], [472, 480], [493, 511]],
      ['gold', [457, 473, 490], [432, 440], [454, 473]],
    ]) {
      const n = holeNumbers(G, 9, teeOrigin(G, 9, set));
      near(n.green.frontYd, green[0], 1, `${set} green front`);
      near(n.green.centreYd, green[1], 1, `${set} green centre`);
      near(n.green.backYd, green[2], 1, `${set} green back`);
      yd(n.features, 'B1', b1[0], b1[1], `hole 9 ${set}`);
      yd(n.features, 'B2', b2[0], b2[1], `hole 9 ${set}`);
    }
  });
}

/**
 * The hole pictures (docs/SPEC_hole-overview.md 4.4). Async for the image
 * loads, in the shell tests' shape: the I/O first, then assert synchronously.
 */
export async function runHoleOverviewPictureTests() {
  group('hole overview (pictures)');

  const G = courseGeometry(VEENKER);
  const F = courseFrames(VEENKER);
  const frames = F?.holes ?? [];
  const base = new URL('../', import.meta.url);
  const loaded = await Promise.all(
    frames.map(
      (fr) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ fr, ok: true, w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ fr, ok: false });
          img.src = new URL(fr.file, base).href;
        }),
    ),
  );
  const inImage = (fr, pos) => {
    const p = framePx(fr, pos);
    return p.x >= 0 && p.x <= fr.widthPx && p.y >= 0 && p.y <= fr.heightPx;
  };

  test('the frame places a position: every control point within 1.0 px of its recorded x, y (n = 36)', () => {
    eq(frames.length, 18, 'frames');
    let n = 0;
    for (const fr of frames) {
      for (const c of fr.control) {
        const p = framePx(fr, c);
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        assert(d <= 1.0, `hole ${fr.number} ${c.name}: ${d.toFixed(3)} px`);
        n++;
      }
    }
    eq(n, 36, 'control points');
  });

  test('everything numbered is in the picture: features, the green centre, the blue and gold tees', () => {
    eq(frames.length, 18, 'frames');
    for (const fr of frames) {
      const H = holePath(G, fr.number);
      const pts = [['green centre', H[H.length - 1]], ...holeFeatures(G, fr.number).map((f) => [f.name, f.at])];
      for (const set of ['blue', 'gold']) {
        const t = teeOrigin(G, fr.number, set);
        // Every hole has both since Part E put hole 9's on the map: none is skipped.
        assert(t, `hole ${fr.number}: no ${set} tee`);
        pts.push([`${set} tee`, t]);
      }
      for (const [what, pos] of pts) assert(inImage(fr, pos), `hole ${fr.number}: ${what} is outside the picture`);
    }
  });

  test('the files are what the module says: 18 images load at their recorded size', () => {
    eq(loaded.length, 18, 'images');
    for (const r of loaded) {
      assert(r.ok, `${r.fr.file} did not load`);
      eq(`${r.w} x ${r.h}`, `${r.fr.widthPx} x ${r.fr.heightPx}`, r.fr.file);
    }
  });
}

group('course notes (layups)');

{
  // docs/SPEC_hole-overview.md 5.5. These write real localStorage, so the group
  // takes every gt: key first and puts them all back, byte for byte, at its end.
  const snap = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('gt:')) snap[k] = localStorage.getItem(k);
  }
  const clearNotes = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('gt:course:')) localStorage.removeItem(k);
    }
  };
  const layup = (o = {}) => newLayup({ hole: 7, ref: 'green', yards: 100, ...o });
  const ids = (notes) => JSON.stringify(notes.layups.map((l) => l.id));
  clearNotes();

  test('what is stored is what he typed; the five rejections return null', () => {
    const l = newLayup({ hole: 7, ref: 'green', yards: 100, teeSet: 'blue', label: '  short of creek ' });
    eq(l.yards, 100, 'yards');
    eq(l.teeSet, null, 'teeSet for a green layup');
    eq(l.label, 'short of creek', 'label trimmed');
    assert(/^l_/.test(l.id), `id ${l.id}`);
    eq(layup({ label: '   ' }).label, null, 'an empty label is null');
    eq(newLayup({ hole: 7, ref: 'tee', yards: 250, teeSet: 'blue' }).teeSet, 'blue', 'a tee layup keeps its set');
    for (const y of [0, 701, 100.5]) eq(layup({ yards: y }), null, `yards ${y}`);
    eq(layup({ ref: 'pin' }), null, 'ref pin');
    eq(layup({ ref: 'tee' }), null, 'tee with no teeSet');
    for (const h of [0, 19, 7.5]) eq(layup({ hole: h }), null, `hole ${h}`);
    eq(layup({ label: 'x'.repeat(25) }), null, 'a label over 24 characters');
    eq(layup({ label: 'x'.repeat(24) }).label.length, 24, 'a label of 24');
  });

  test('round trip; loading with no key writes nothing', () => {
    clearNotes();
    const before = localStorage.length;
    const notes = loadCourseNotes('veenker');
    eq(localStorage.length, before, 'key count after a load with no key');
    eq(`${notes.courseId} ${notes.layups.length}`, 'veenker 0', 'fresh notes');
    notes.layups.push(layup({ label: 'short of creek' }), layup({ ref: 'tee', yards: 250, teeSet: 'blue' }));
    assert(saveCourseNotes(notes), 'saved');
    eq(JSON.stringify(loadCourseNotes('veenker')), JSON.stringify(notes), 'loaded deep-equals saved');
  });

  test('damaged notes are kept, never deleted', () => {
    clearNotes();
    localStorage.setItem(courseNotesKey('veenker'), '{bad');
    let told = 0;
    const off = onStorageError(() => told++);
    const notes = loadCourseNotes('veenker');
    off();
    eq(notes.layups.length, 0, 'empty notes');
    assert(notes.recoveredFrom?.startsWith('gt:course:veenker:bad:'), `recoveredFrom ${notes.recoveredFrom}`);
    eq(localStorage.getItem(notes.recoveredFrom), '{bad', 'the copy');
    eq(localStorage.getItem(courseNotesKey('veenker')), '{bad', 'the key');
    eq(told, 1, 'listeners told');
    eq(allCourseNotesIds().join(','), 'veenker', 'a :bad: copy is not a course');
  });

  test('a damaged notes key is copied once: the same text again makes no second copy (C1)', () => {
    clearNotes();
    const copies = () => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('gt:course:veenker:bad:')) out.push(k);
      }
      return out.sort();
    };
    // A second apart, as two openings of the page would be: the copy key is
    // named by the clock, so the same clock reading would hide a second copy.
    const realNow = Date.now;
    let t = realNow();
    Date.now = () => (t += 1000);
    let first;
    let second;
    let other;
    try {
      localStorage.setItem(courseNotesKey('veenker'), '{bad');
      first = loadCourseNotes('veenker');
      second = loadCourseNotes('veenker');
      eq(copies().length, 1, 'copies after two loads of the same text');
      localStorage.setItem(courseNotesKey('veenker'), '{worse');
      other = loadCourseNotes('veenker');
    } finally {
      Date.now = realNow;
    }
    eq(second.recoveredFrom, first.recoveredFrom, 'the second load names the one copy');
    const all = copies();
    eq(all.length, 2, 'copies after a different damaged text');
    assert(other.recoveredFrom !== first.recoveredFrom, 'the different text has its own copy');
    eq(localStorage.getItem(other.recoveredFrom), '{worse', 'its copy holds its text');
    eq(localStorage.getItem(first.recoveredFrom), '{bad', 'the first copy is untouched');
  });

  test('the export carries the notes, and rounds do not move', () => {
    clearNotes();
    saveRound(par4Round());
    const app = loadApp();
    const before = buildExport(app);
    const notes = loadCourseNotes('veenker');
    notes.layups.push(layup());
    saveCourseNotes(notes);
    const after = buildExport(app);
    eq(JSON.stringify(after.courseNotes.veenker), JSON.stringify(notes), 'courseNotes.veenker');
    assert(after.rounds.length >= 1, 'a round to compare');
    eq(JSON.stringify(after.rounds), JSON.stringify(before.rounds), 'rounds');
    eq(JSON.stringify(after.app), JSON.stringify(before.app), 'app');
    eq(after.formatVersion, 1, 'formatVersion');
  });

  test('import, merge: a layup not on the phone is added; one that is keeps the phone\'s number', () => {
    clearNotes();
    const mine = loadCourseNotes('veenker');
    const kept = layup({ yards: 100 });
    mine.layups.push(kept);
    saveCourseNotes(mine);
    const file = buildExport(loadApp());
    const fresh = layup({ yards: 150 });
    file.courseNotes.veenker.layups = [{ ...kept, yards: 120 }, fresh];
    const report = importExport(JSON.parse(JSON.stringify(file)), 'merge');
    const got = loadCourseNotes('veenker').layups;
    eq(report.layupsAdded, 1, 'layupsAdded');
    eq(got.find((l) => l.id === kept.id)?.yards, 100, "the phone's number");
    eq(got.find((l) => l.id === fresh.id)?.yards, 150, 'the new layup');
    eq(got.length, 2, 'nothing removed, nothing doubled');
  });

  test("import, replace: the file's notes replace; a file with none leaves the phone's alone", () => {
    clearNotes();
    const mine = loadCourseNotes('veenker');
    mine.layups.push(layup({ yards: 100 }));
    saveCourseNotes(mine);
    const file = buildExport(loadApp());
    const theirs = layup({ yards: 175 });
    file.courseNotes.veenker.layups = [theirs];
    importExport(JSON.parse(JSON.stringify(file)), 'replace');
    eq(ids(loadCourseNotes('veenker')), JSON.stringify([theirs.id]), 'replaced by the file');
    const old = buildExport(loadApp());
    delete old.courseNotes;
    for (const mode of ['replace', 'merge']) {
      importExport(JSON.parse(JSON.stringify(old)), mode);
      eq(ids(loadCourseNotes('veenker')), JSON.stringify([theirs.id]), `an old file, ${mode}`);
    }
  });

  test('the round rails did not move: SCHEMA_VERSION 1, a round byte-identical across a layup edit', () => {
    eq(SCHEMA_VERSION, 1, 'SCHEMA_VERSION');
    const round = par4Round();
    saveRound(round);
    const key = `gt:round:${round.id}`;
    const r1 = localStorage.getItem(key);
    const a1 = localStorage.getItem('gt:app');
    const notes = loadCourseNotes('veenker');
    notes.layups.push(layup({ yards: 90 }));
    assert(saveCourseNotes(notes), 'layup saved');
    eq(localStorage.getItem(key), r1, 'the round, after the edit');
    eq(localStorage.getItem('gt:app'), a1, 'gt:app, after the edit');
    saveRound(round);
    eq(localStorage.getItem(key), r1, 'the round, saved again after the edit');
  });

  test('a full quota is loud: saveCourseNotes returns false and the listener fires', () => {
    const realSetItem = Storage.prototype.setItem;
    let told = 0;
    const off = onStorageError(() => told++);
    let ok;
    Storage.prototype.setItem = function () {
      throw new DOMException('full', 'QuotaExceededError');
    };
    try {
      ok = saveCourseNotes(newCourseNotes('veenker'));
    } finally {
      Storage.prototype.setItem = realSetItem;
      off();
    }
    eq(ok, false, 'saveCourseNotes');
    eq(told, 1, 'listener');
  });

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith('gt:')) localStorage.removeItem(k);
  }
  for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
}

group('lie from the map (end of hole)');

{
  // docs/SPEC_course-geometry.md Part C1: the end-of-hole rows.
  const G = courseGeometry(VEENKER);
  const inPoly = (pt, p) => pointInRing(pt, p.ring) && !(p.inner ?? []).some((r) => pointInRing(pt, r));
  const others = G.polygons.filter((p) => p.kind === 'green' || p.kind === 'bunker' || p.kind === 'tee');
  const fw = G.polygons.find((p) => {
    if (p.kind !== 'fairway') return false;
    const c = ringCentroid(p.ring);
    return inPoly(c, p) && !others.some((o) => o !== p && inPoly(c, o));
  });
  const bunker = G.polygons.find((p) => p.kind === 'bunker' && inPoly(ringCentroid(p.ring), p));
  const stop = (pt) => ({ lat: pt.lat, lon: pt.lon, spreadM: 1.5, dwellMs: 40000, startTs: 0 });
  const row = (pt) => mapLieRow(G, { candidate: stop(pt), lie: null, lieInferred: false });

  test('a stop in a fairway and a stop in a bunker come preselected and flagged inferred', () => {
    const a = row(ringCentroid(fw.ring));
    eq(a.lie, 'fairway', 'fairway stop');
    eq(a.lieInferred, true, 'fairway lieInferred');
    const b = row(ringCentroid(bunker.ring));
    eq(b.lie, 'sand', 'bunker stop');
    eq(b.lieInferred, true, 'bunker lieInferred');
  });

  test('a stop 5 km off the map is left for him, and the tee row stays tee', () => {
    const far = row(offsetPoint(ringCentroid(fw.ring), { north: 5000 }));
    eq(far.lie, null, 'far lie');
    eq(far.lieInferred, false, 'far lieInferred');
    const tee = mapLieRow(G, { candidate: stop(ringCentroid(fw.ring)), lie: 'tee', lieInferred: false });
    eq(tee.lie, 'tee', 'tee row');
    eq(tee.lieInferred, false, 'tee row lieInferred');
  });
}

group('end-of-hole row reads shot, lie, distance to the hole');

{
  // Matt, 2026-09-26: "Shot 1 - Lie = Tee Box, Distance to the hole = n ...
  // Numbers are always measured with distance to hole".
  const G = courseGeometry(VEENKER);
  const hole10 = G.holes.find((x) => x.number === 10);
  const greenC = ringCentroid(G.polygons.find((p) => p.id === hole10.greenId).ring);
  const pos = offsetPoint(greenC, { north: 250 });
  const stop = { ...pos, spreadM: 1.5, dwellMs: 75000, departureM: 20, arrivalSpeed: 1, startTs: 0 };
  const cup = offsetPoint(greenC, { east: 8 });
  const cupYd = Math.round(toYards(distanceM(pos, cup)));
  const centreYd = Math.round(toYards(distanceM(pos, greenC)));
  // The row measures to the hole the engine resolves (docs/SPEC_hole-position.md 6.4).
  const cupPin = { ...cup, source: 'cup' };
  const centrePin = holePosition({ number: 10, shots: [], cup: null }, { geometry: G });

  test('with a marked cup: Shot 1 - Lie = Tee Box, Distance to the hole = <to the cup> yd', () => {
    const t = shotRowHeading({ candidate: stop, lie: 'tee' }, 0, { pin: cupPin });
    eq(t, `Shot 1 - Lie = Tee Box, Distance to the hole = ${cupYd} yd`, 'heading');
  });

  test('no cup: distance to the green centre, and it says so', () => {
    const t = shotRowHeading({ candidate: stop, lie: 'fairway' }, 1, { pin: centrePin });
    eq(t, `Shot 2 - Lie = Fairway, Distance to the hole = ${centreYd} yd (green centre)`, 'heading');
  });

  test('no cup and no course map: not known, never a guess', () => {
    const t = shotRowHeading({ candidate: stop, lie: null }, 2, { pin: null });
    eq(t, 'Shot 3 - Lie = ?, Distance to the hole = not known', 'heading');
  });

  test('PLAYED TWICE (same candidate) carries the same distance as the row it copies', () => {
    const a = shotRowHeading({ candidate: stop, lie: 'rough' }, 1, { pin: cupPin });
    const b = shotRowHeading({ candidate: stop, lie: null, replayed: true }, 2, { pin: cupPin });
    eq(b.split(', ')[1], a.split(', ')[1], 'distance part');
  });
}

group('where the hole is (D1)');

{
  /*
   * docs/SPEC_hole-position.md Section 7. Matt, 2026-09-28: "D1. map center
   * with the option for me to correct it manually by entering tournament pin
   * sheet numbers." Veenker's real course map; every position is built from
   * the generated data, and the frame (A, C, F) is rebuilt here by hand rather
   * than read back from the module under test.
   */
  const G = courseGeometry(VEENKER);
  const ctx = { geometry: G };
  const poly = (id) => G.polygons.find((p) => p.id === id);
  const holeG = (n) => G.holes.find((x) => x.number === n);
  const ringOf = (n) => poly(holeG(n).greenId).ring;
  const centreOf = (n) => ringCentroid(ringOf(n));
  const teeBoxOf = (n) => ringCentroid(poly(holeG(n).teeIds[0]).ring);
  const YD = 0.9144;
  const PACE = 3 * 0.3048; // his 3 ft stride: one pace is one yard
  const move = (from, deg, m) => {
    const r = (deg * Math.PI) / 180;
    return offsetPoint(from, { north: m * Math.cos(r), east: m * Math.sin(r) });
  };
  const toward = (from, to, m) => move(from, bearingDeg(from, to), m);
  const backAlong = (line, m) => {
    let left = m;
    for (let i = line.length - 1; i > 0; i--) {
      const seg = distanceM(line[i], line[i - 1]);
      if (seg >= left) return toward(line[i], line[i - 1], left);
      left -= seg;
    }
    return line[0];
  };
  const byHand = (n, geometry = G) => {
    const h = geometry.holes.find((x) => x.number === n);
    const ring = poly(h.greenId).ring;
    const C = ringCentroid(ring);
    const A = backAlong(h.line, 137.16);
    const xs = rayRingIntersections(A, C, ring);
    return { ring, C, A, F: toward(A, C, xs[0]), depthM: xs[xs.length - 1] - xs[0], bearing: bearingDeg(A, C) };
  };
  /** Metres to the first edge crossing from `pt` on bearing `deg`. */
  const edgeFrom = (pt, deg, ring) => rayRingIntersections(pt, move(pt, deg, 10), ring)[0];
  /** Along the line of play from F, and to the right of it, in metres. */
  const inFrame = (f, pt) => {
    const e = enuOffset(f.F, pt);
    const r = (f.bearing * Math.PI) / 180;
    return { along: e.east * Math.sin(r) + e.north * Math.cos(r), right: e.east * Math.cos(r) - e.north * Math.sin(r) };
  };
  const stopAt = (pt) => ({ lat: pt.lat, lon: pt.lon, spreadM: 2, n: 30, startTs: 0, endTs: 30000, dwellMs: 30000, departureM: 10, arrivalSpeed: 1, score: 0.8 });
  const holeOf = (round, n) => round.holes.find((x) => x.number === n);
  /** Hole n of a Veenker gold round off the track: tee box, 150 yd and 30 yd from the green centre, two putts typed. */
  const trackHole = (round, n, { tee = 'track' } = {}) => {
    const hole = holeOf(round, n);
    const C = centreOf(n);
    const box = teeBoxOf(n);
    if (tee === 'map') addMapTee(hole, { lat: box.lat, lon: box.lon, accuracyM: 10 });
    else addTrackShot(hole, { lie: 'tee', candidate: stopAt(box) });
    addTrackShot(hole, { lie: 'fairway', candidate: stopAt(toward(C, box, 150 * YD)) });
    addTrackShot(hole, { lie: 'rough', candidate: stopAt(toward(C, box, 30 * YD)) });
    setGreenEntry(hole, { putts: 2, distances: [15, 3], unit: 'feet' });
    return hole;
  };
  const offGreenSG = (hole, context) =>
    holeStrokesGained(hole, { baseline: 'scratch', context }).shots.filter((s) => s.category !== 'putting');
  /** A burst cup `m` metres behind hole n's green, straight back from the tee. */
  const cupBehind = (n, m) => {
    const C = centreOf(n);
    const back = bearingDeg(teeBoxOf(n), C);
    return move(C, back, edgeFrom(C, back, ringOf(n)) + m);
  };

  test('1. no cup on a map course: every off-green shot is measured to the map green centre', () => {
    const hole = trackHole(par4Round(), 1);
    const sg = holeStrokesGained(hole, { baseline: 'scratch', context: ctx });
    const off = sg.shots.filter((s) => s.category !== 'putting');
    eq(off.length, 3, 'off-green shots');
    for (const s of off) {
      assert(s.distance != null, `shot ${s.seq} has no distance`);
      eq(s.distanceSource, 'map-green', `shot ${s.seq} source`);
      near(s.distance, toYards(toGreen(G, 1, s.shot.mark).centreM), 1e-9, `shot ${s.seq} distance, yd`);
    }
    eq(sg.unattributed, 0, 'unattributed');
  });

  test('2. a cup he marked 6 yd from the centre wins, and every distance is to it', () => {
    const hole = trackHole(par4Round(), 1);
    setCup(hole, fakeReduced(toward(centreOf(1), teeBoxOf(1), 6 * YD)));
    const pos = holePosition(hole, ctx);
    eq(pos.source, 'cup', 'source');
    eq(pos.skipped.length, 0, 'skipped');
    for (const g of shotGeometry(hole, ctx).filter((x) => x.shot.lie !== 'green')) {
      eq(g.toHoleSource, 'cup', `shot ${g.shot.seq} source`);
      near(g.toHoleM, distanceM(g.shot.mark, hole.cup), 1e-9, `shot ${g.shot.seq} to the cup`);
    }
  });

  test('3. a cup taken from the track is not used, and is not deleted', () => {
    const hole = trackHole(par4Round(), 1);
    setCup(hole, fakeReduced(toward(centreOf(1), teeBoxOf(1), 3)));
    hole.cup.method = 'track';
    eq(offOwnGreenM(G, 1, hole.cup), 0, 'fixture: the track cup is on the green');
    const pos = holePosition(hole, ctx);
    eq(pos.source, 'map-green', 'source');
    eq(JSON.stringify(pos.skipped), JSON.stringify([{ what: 'cup', why: 'from-track', offM: null }]), 'skipped');
    eq(hole.cup.method, 'track', 'the stored cup');
  });

  test('4. a cup 93 yd off its green is not used; the same cup 10 m off is', () => {
    const far = trackHole(par4Round(), 1);
    setCup(far, fakeReduced(cupBehind(1, 93 * YD)));
    const offFar = offOwnGreenM(G, 1, far.cup);
    assert(offFar > 80, `fixture: the far cup is ${offFar} m off the green`);
    const p = holePosition(far, ctx);
    eq(p.source, 'map-green', 'far cup: source');
    eq(p.skipped.length, 1, 'far cup: skipped');
    eq(`${p.skipped[0].what}/${p.skipped[0].why}`, 'cup/off-green', 'far cup: what/why');
    near(p.skipped[0].offM, offFar, 1e-9, 'far cup: offM');

    const nearHole = trackHole(par4Round(), 1);
    setCup(nearHole, fakeReduced(cupBehind(1, 10)));
    const offNear = offOwnGreenM(G, 1, nearHole.cup);
    assert(offNear > 5 && offNear <= HOLE_ON_GREEN_M, `fixture: the near cup is ${offNear} m off the green`);
    eq(holePosition(nearHole, ctx).source, 'cup', '10 m off: source');
  });

  const entry = { onPaces: 12, side: 'L', sidePaces: 5, sideFrom: 'edge', paceFeet: 3 };

  test('5. the pin sheet places the pin: 12 on, 5 from the left edge, within 0.2 m', () => {
    const f = byHand(1);
    const pin = pinFromSheet(G, 1, entry);
    assert(pin?.placed, `not placed: ${JSON.stringify(pin)}`);
    near(inFrame(f, pin).along, 12 * PACE, 0.2, 'metres on from the front edge');
    near(edgeFrom(pin, f.bearing - 90, f.ring), 5 * PACE, 0.2, 'metres in from the left edge');
    const hole = trackHole(par4Round(), 1);
    setPinSheet(hole, entry);
    const pos = holePosition(hole, ctx);
    eq(pos.source, 'pin-sheet', 'source');
    near(distanceM(pos, pin), 0, 1e-9, 'the hole is the placed pin');
    eq(pos.uncertaintyM, 4, 'uncertaintyM');
  });

  test("6. side C is halfway between the edges; centre R 4 is 4 yd right of the line", () => {
    const f = byHand(1);
    const mid = pinFromSheet(G, 1, { onPaces: 12, side: 'C', sidePaces: null, sideFrom: 'edge', paceFeet: 3 });
    assert(mid?.placed, `C not placed: ${JSON.stringify(mid)}`);
    near(edgeFrom(mid, f.bearing - 90, f.ring), edgeFrom(mid, f.bearing + 90, f.ring), 0.05, 'left edge vs right edge, m');
    const r4 = pinFromSheet(G, 1, { onPaces: 12, side: 'R', sidePaces: 4, sideFrom: 'centre', paceFeet: 3 });
    assert(r4?.placed, `centre R 4 not placed: ${JSON.stringify(r4)}`);
    near(inFrame(f, r4).right, 4 * PACE, 0.2, 'metres right of the line of play');
    near(inFrame(f, r4).along, 12 * PACE, 0.2, 'metres on from the front edge');
  });

  test('7. a pin sheet deeper than the green is not the hole: the map green is', () => {
    const f = byHand(1);
    const deep = { onPaces: Math.ceil(f.depthM / PACE) + 5, side: 'C', sidePaces: null, sideFrom: 'edge', paceFeet: 3 };
    const pin = pinFromSheet(G, 1, deep);
    assert(!pin.placed || pin.offGreenM > 3, `placed on the green: ${JSON.stringify(pin)}`);
    const hole = trackHole(par4Round(), 1);
    setPinSheet(hole, deep);
    const pos = holePosition(hole, ctx);
    eq(pos.source, 'map-green', 'source');
    eq(pos.skipped.length, 1, 'skipped');
    eq(pos.skipped[0].what, 'pin-sheet', 'what');
    assert(['not-placed', 'off-green'].includes(pos.skipped[0].why), `why ${pos.skipped[0].why}`);
    eq(hole.pinSheet.onPaces, deep.onPaces, 'what he typed is kept');
  });

  test('8. the map tee reads the scorecard, 386 yd on hole 15; a GPS tee is unchanged', () => {
    const hole = trackHole(par4Round(), 15, { tee: 'map' });
    eq(hole.yards, 386, 'fixture: hole 15 gold');
    const g0 = shotGeometry(hole, ctx)[0];
    near(g0.toHoleM, 386 * YD, 1e-9, 'toHoleM');
    eq(g0.toHoleSource, 'scorecard', 'toHoleSource');
    eq(g0.lengthM, null, 'lengthM');
    const s0 = holeStrokesGained(hole, { baseline: 'scratch', context: ctx }).shots[0];
    near(s0.distance, 386, 1e-9, 'engine distance, yd');
    eq(s0.distanceSource, 'scorecard', 'engine source');

    const gps = holeOf(par4Round(), 15);
    addShot(gps, { lie: 'tee', reduced: fakeReduced(teeBoxOf(15)) });
    addTrackShot(gps, { lie: 'fairway', candidate: stopAt(toward(centreOf(15), teeBoxOf(15), 150 * YD)) });
    setGreenEntry(gps, { putts: 2, distances: [15, 3], unit: 'feet' });
    const [t, next] = shotGeometry(gps, ctx);
    eq(t.toHoleSource, 'map-green', 'GPS tee: source');
    near(t.toHoleM, distanceM(t.shot.mark, holePosition(gps, ctx)), 1e-9, 'GPS tee: a straight line to the hole');
    near(t.lengthM, distanceM(t.shot.mark, next.shot.mark), 1e-9, 'GPS tee: its length');
  });

  test('9. the total does not move with the pin; the approach / short game split does', () => {
    const depthPaces = Math.floor(byHand(1).depthM / PACE);
    const runs = [null, 2, depthPaces - 2].map((on) => {
      const hole = trackHole(par4Round(), 1, { tee: 'map' });
      if (on != null) setPinSheet(hole, { onPaces: on, side: 'C', sidePaces: null, sideFrom: 'edge', paceFeet: 3 });
      const shots = offGreenSG(hole, ctx);
      const by = (c) => shots.filter((s) => s.category === c).reduce((a, s) => a + s.sg, 0);
      return {
        source: holePosition(hole, ctx).source,
        sum: shots.reduce((a, s) => a + s.sg, 0),
        unattributed: holeStrokesGained(hole, { baseline: 'scratch', context: ctx }).unattributed,
        approach: by('approach'),
        short: by('short_game'),
        cats: shots.map((s) => s.category).join(','),
      };
    });
    eq(runs.map((r) => r.source).join(','), 'map-green,pin-sheet,pin-sheet', 'fixture: sources');
    eq(runs.map((r) => r.cats).join(' | '), Array(3).fill('off_tee,approach,short_game').join(' | '), 'fixture: categories');
    for (const r of runs) eq(r.unattributed, 0, 'unattributed');
    near(runs[1].sum, runs[0].sum, 1e-9, 'front pin vs no pin sheet');
    near(runs[2].sum, runs[0].sum, 1e-9, 'back pin vs no pin sheet');
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
      assert(Math.abs(runs[a].approach - runs[b].approach) > 1e-3, `approach ${a} vs ${b}: ${runs[a].approach} / ${runs[b].approach}`);
      assert(Math.abs(runs[a].short - runs[b].short) > 1e-3, `short game ${a} vs ${b}: ${runs[a].short} / ${runs[b].short}`);
    }
  });

  test('10. no map, no change: a Radcliffe round reads as it did at 7d35028', () => {
    // Fixture values computed with the modules at 1692724 (code identical to
    // 7d35028): hole 1 has a cup taken from the track, hole 2 no cup and a
    // position learned from an earlier round.
    const round = createRound({ course: RADCLIFFE, teeSet: 'white', startingNine: 'front', type: 'practice' });
    const app = newAppState();
    const TEE2 = offsetM(TEE, 600, 0);
    learnCup(app, round, 1, fakeReduced(offsetM(TEE, 468, 4)));
    learnCup(app, round, 2, fakeReduced(offsetM(TEE2, 146, -5)));
    const h1 = round.holes[0];
    addShot(h1, { lie: 'tee', reduced: fakeReduced(TEE) });
    addTrackShot(h1, { lie: 'fairway', candidate: stopAt(offsetM(TEE, 255, 8)) });
    addShot(h1, { lie: 'rough', reduced: fakeReduced(offsetM(TEE, 430, -12)) });
    setCup(h1, fakeReduced(offsetM(TEE, 474, 2)));
    h1.cup.method = 'track';
    setGreenEntry(h1, { putts: 2, distances: [22, 3], unit: 'feet' });
    const h2 = round.holes[1];
    addShot(h2, { lie: 'tee', reduced: fakeReduced(TEE2) });
    addShot(h2, { lie: 'rough', reduced: fakeReduced(offsetM(TEE2, 140, 9)) });
    setGreenEntry(h2, { putts: 1, distances: [7], unit: 'feet' });

    const contextFor = holeContextFor(app, round);
    eq(contextFor(h1).geometry, null, 'fixture: Radcliffe has no map');
    const p1 = holePosition(h1, contextFor(h1));
    const p2 = holePosition(h2, contextFor(h2));
    eq(`${p1.source} ${p1.uncertaintyM}`, 'cup 2.5', 'hole 1 source, uncertainty');
    near(p1.lat, 42.0392674, 1e-12, 'hole 1 lat');
    near(p1.lon, -93.6449758, 1e-12, 'hole 1 lon');
    eq(`${p2.source} ${p2.uncertaintyM}`, 'accumulated-cup 12', 'hole 2 source, uncertainty');
    near(p2.lat, 42.04171624420468, 1e-12, 'hole 2 lat');
    near(p2.lon, -93.64506038768938, 1e-12, 'hole 2 lon');

    const sg = roundStrokesGained(round, { baseline: 'scratch', contextFor });
    const want = { off_tee: 0.12109391634218936, approach: -0.9032674289477258, short_game: 0.14962175868949523, putting: 0.35043748422317544 };
    for (const [c, v] of Object.entries(want)) near(sg.totals[c], v, 1e-9, c);
    near(sg.total, -0.2821142696928658, 1e-9, 'total');
    eq(sg.unattributed, 0, 'unattributed');
    const perShot = [
      [0.12109391634218936, -0.4039637454692002, 0.03480340652889935, -0.1481548135969626, 0.052713649645235394],
      [-0.4993036834785256, 0.11481835216059588, 0.4458786481749022],
    ];
    const lengths = [[279.0125520665183, 192.62455925116925, 50.49281915472295, null, null], [153.41947590196838, null, null]];
    sg.holes.forEach((hs, i) => {
      eq(hs.shots.length, perShot[i].length, `hole ${hs.number} shots`);
      hs.shots.forEach((s, j) => {
        near(s.sg, perShot[i][j], 1e-9, `hole ${hs.number} shot ${j + 1} SG`);
        if (lengths[i][j] == null) eq(s.lengthYards, null, `hole ${hs.number} shot ${j + 1} length`);
        else near(s.lengthYards, lengths[i][j], 1e-9, `hole ${hs.number} shot ${j + 1} length`);
      });
    });
  });

  test('11. pinSheet is optional, and a round carrying one survives export and import', () => {
    const round = par4Round();
    eq(round.holes[0].pinSheet, null, 'newHole gives pinSheet: null');
    const withNull = trackHole(round, 1);
    const noKey = trackHole(par4Round(), 1);
    delete noKey.pinSheet;
    eq(JSON.stringify(holePosition(noKey, ctx)), JSON.stringify(holePosition(withNull, ctx)), 'no key resolves like null');

    setPinSheet(withNull, entry);
    const before = JSON.stringify(withNull.pinSheet);
    try {
      for (const id of allRoundIds()) deleteRound(id);
      saveRound(round);
      saveApp(newAppState());
      const payload = JSON.parse(JSON.stringify(buildExport(newAppState())));
      for (const id of allRoundIds()) deleteRound(id);
      const report = importExport(payload, 'replace');
      eq(report.added, 1, 'rounds restored');
      const back = loadRound(round.id).holes[0];
      eq(JSON.stringify(back.pinSheet), before, 'the pin sheet as he typed it');
      const a = holePosition(withNull, ctx);
      const b = holePosition(back, ctx);
      eq(b.source, 'pin-sheet', 'source after the round trip');
      near(distanceM(a, b), 0, 1e-9, 'the same pin after the round trip');
    } finally {
      restoreStorage();
    }
  });

  test("12. the frame: A is 150 yd back along the hole's line, not the last segment's direction", () => {
    // Hole 9: an 18 yd last segment, too short to give a direction.
    const line9 = holeG(9).line;
    near(toYards(distanceM(line9[line9.length - 2], line9[line9.length - 1])), 17.9, 0.5, 'fixture: hole 9 last segment, yd');
    const f9 = greenFrame(G, 9);
    const h9 = byHand(9);
    near(distanceM(f9.approach, h9.A), 0, 0.01, 'hole 9: A, m');
    near(f9.bearingDeg, h9.bearing, 1e-6, 'hole 9: the line of play is A to C');
    // A frame taken from the last segment would run from its start to C.
    const fromLastSeg = bearingDeg(line9[line9.length - 2], centreOf(9));
    const turn = Math.abs(((f9.bearingDeg - fromLastSeg + 540) % 360) - 180);
    assert(turn > 5, `hole 9: the line of play is within ${turn.toFixed(1)} deg of the last segment's`);
    near(f9.depthM, h9.depthM, 0.01, 'hole 9: depth, m');

    // Hole 11: a one-segment 152 yd line, so A sits 150 yd back along it -
    // 2 m from its start (spec 4.1 step 1; see the hand-back to Fable).
    const line11 = holeG(11).line;
    const len11 = distanceM(line11[0], line11[line11.length - 1]);
    near(toYards(len11), 152.3, 0.2, 'fixture: hole 11 line, yd');
    const f11 = greenFrame(G, 11);
    near(distanceM(f11.approach, line11[0]), len11 - APPROACH_BACK_M, 0.01, 'hole 11: A from the line start, m');
    // A line shorter than 150 yd uses its start: hole 11's line with its first 10 m cut off.
    const start = toward(line11[0], line11[1], 10);
    const Gshort = { ...G, holes: G.holes.map((x) => (x.number === 11 ? { ...x, line: [start, ...line11.slice(1)] } : x)) };
    near(distanceM(greenFrame(Gshort, 11).approach, start), 0, 1e-6, 'a 141 yd line: A is its start');
  });

  test('13. the engine counts every distance by source, and names the cup it passed over', () => {
    const round = par4Round();
    const h1 = trackHole(round, 1);
    setCup(h1, fakeReduced(cupBehind(1, 93 * YD))); // test 4's cup
    trackHole(round, 2);
    const h3 = holeOf(round, 3);
    const box3 = teeBoxOf(3);
    addMapTee(h3, { lat: box3.lat, lon: box3.lon, accuracyM: 10 });
    setShotDistance(addShot(h3, { lie: 'fairway', reduced: null, source: 'manual' }), { value: 120, unit: 'yards' });
    addTrackShot(h3, { lie: 'rough', candidate: stopAt(toward(centreOf(3), box3, 25 * YD)) });
    setGreenEntry(h3, { putts: 2, distances: [12, 2], unit: 'feet' });
    setPinSheet(h3, { onPaces: 6, side: 'C', sidePaces: null, sideFrom: 'edge', paceFeet: 3 });

    const sg = roundStrokesGained(round, { baseline: 'scratch', contextFor: holeContextFor(newAppState(), round) });
    const notPutts = sg.holes.reduce((a, hs) => a + hs.shots.filter((s) => s.category !== 'putting').length, 0);
    eq(notPutts, 9, 'fixture: shots that are not putts');
    eq(Object.values(sg.sources).reduce((a, b) => a + b, 0), notPutts, `sources ${JSON.stringify(sg.sources)}`);
    eq(
      JSON.stringify(sg.sources),
      JSON.stringify({ 'map-green': 6, scorecard: 1, yards: 1, 'pin-sheet': 1 }),
      'sources'
    );
    eq(sg.positionNotes.length, 1, `positionNotes ${JSON.stringify(sg.positionNotes)}`);
    const n = sg.positionNotes[0];
    eq(`${n.hole} ${n.what} ${n.why} ${n.used}`, '1 cup off-green map-green', 'the note');
    near(n.offM, offOwnGreenM(G, 1, h1.cup), 1e-9, 'offM');
  });

  /* ---- Section 12: the corrections after Fable's review of Part A ---- */

  test('C3. a map tee with a typed 150 yd: toHoleM 150 yd, lengthM null', () => {
    const hole = trackHole(par4Round(), 1, { tee: 'map' });
    setShotDistance(hole.shots[0], { value: 150, unit: 'yards' });
    const [g0] = shotGeometry(hole, ctx);
    eq(`${g0.shot.source} ${g0.shot.lie}`, 'map tee', 'fixture: shot 1');
    near(g0.toHoleM, 150 * YD, 1e-9, 'toHoleM');
    eq(g0.toHoleSource, 'yards', 'toHoleSource');
    eq(g0.lengthM, null, 'lengthM');
    eq(holeStrokesGained(hole, { baseline: 'scratch', context: ctx }).shots[0].lengthYards, null, 'engine lengthYards');
  });

  test('C4. the line under the total says when the total depends on the green centre', () => {
    const median = 'The centre of the green is a median 5.5 yd from where the cup was (n = 31 cups marked at Veenker).';
    const lineOn = (round) => {
      const screen = summaryScreen({ app: newAppState(), round, params: { roundId: round.id }, go() {} });
      return [...screen.el.querySelectorAll('.note')].map((p) => p.textContent).filter((t) => t.startsWith('The centre of the green'));
    };
    // Every tee from the scorecard; the shots after them to the green centre.
    const tees = par4Round();
    trackHole(tees, 1, { tee: 'map' });
    trackHole(tees, 2, { tee: 'map' });
    // Two tees taken from the track, so measured to the green centre, and one from the map.
    const track = par4Round();
    trackHole(track, 1);
    trackHole(track, 2);
    trackHole(track, 3, { tee: 'map' });
    eq(
      JSON.stringify(lineOn(tees)),
      JSON.stringify([`${median} The total does not depend on it; the split between approach and short game does.`]),
      'no tee to the green centre'
    );
    eq(
      JSON.stringify(lineOn(track)),
      JSON.stringify([
        `${median} The split between approach and short game depends on it, and so does the total on the 2 holes whose tee shot was measured to it.`,
      ]),
      'two tees to the green centre'
    );
  });

  test('C8. a mark 3,905 yd from the green on a 419 yd hole gives no distance; 500 yd out is measured', () => {
    /** Hole 1 with a GPS tee mark `yd` from the green centre, straight back from the box, then test 1's track shots. */
    const played = (yd) => {
      const round = par4Round();
      const hole = holeOf(round, 1);
      const C = centreOf(1);
      addShot(hole, { lie: 'tee', reduced: fakeReduced(move(C, bearingDeg(C, teeBoxOf(1)), yd * YD)) });
      addTrackShot(hole, { lie: 'fairway', candidate: stopAt(toward(C, teeBoxOf(1), 150 * YD)) });
      addTrackShot(hole, { lie: 'rough', candidate: stopAt(toward(C, teeBoxOf(1), 30 * YD)) });
      setGreenEntry(hole, { putts: 2, distances: [15, 3], unit: 'feet' });
      return { round, hole };
    };

    const far = played(3905);
    eq(far.hole.yards, 419, 'fixture: hole 1 gold');
    eq(holePosition(far.hole, ctx).source, 'map-green', 'fixture: the hole is the green centre');
    const [g0, g1] = shotGeometry(far.hole, ctx);
    eq(g0.toHoleM, null, 'toHoleM');
    eq(g0.toHoleSource, null, 'toHoleSource');
    eq(g0.toHoleUncertaintyM, null, 'toHoleUncertaintyM');
    near(toYards(distanceM(g0.shot.mark, holePosition(far.hole, ctx))), 3905, 0.1, 'fixture: the mark to the green centre, yd');
    near(g0.offHoleM, distanceM(g0.shot.mark, holePosition(far.hole, ctx)), 1e-9, 'offHoleM: the distance refused');
    near(g0.lengthM, distanceM(g0.shot.mark, g1.shot.mark), 1e-9, 'lengthM unchanged');
    const sg = holeStrokesGained(far.hole, { baseline: 'scratch', context: ctx });
    eq(sg.unattributed, 1, 'unattributed');
    eq(
      JSON.stringify(sg.reasons),
      JSON.stringify(['hole 1 shot 1: the mark is 3905 yd from the hole on a 419 yd hole, not used']),
      'reasons'
    );
    eq(roundStrokesGained(far.round, { baseline: 'scratch', contextFor: () => ctx }).sources.unknown, 1, 'sources: unknown');

    const out = played(500);
    const [n0] = shotGeometry(out.hole, ctx);
    near(toYards(n0.toHoleM), 500, 0.1, '500 yd out: toHoleM, yd');
    eq(n0.toHoleSource, 'map-green', '500 yd out: source');
    eq(n0.offHoleM, null, '500 yd out: offHoleM');
    eq(holeStrokesGained(out.hole, { baseline: 'scratch', context: ctx }).unattributed, 0, '500 yd out: unattributed');
  });
}

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

  /*
   * DWELLS ARE THE MEASURED ONES, not the ones this fixture was born with.
   *
   * It originally stood 14 s at the tee, 13 s at the approach and 20 s in the
   * cart — a cart pause LONGER than either shot. That was written to make the
   * old departure-led score look right, and it encodes the opposite of what the
   * track says: across 444 stops on four real rounds, a stop carrying a
   * confirmed mark dwells a median 62.9 s against 19.0 s for one that does not.
   * A fixture that contradicts the instrument is not a test, it is a decoy.
   */
  drive(-120, 0, 6); // cart up to the tee
  for (let i = 0; i < 65; i++) push(at(0)); // the drive
  drive(0, 236, 6);
  if (withCartPause) {
    // Sitting in the cart while the other Matt plays. A real stop, not a shot.
    for (let i = 0; i < 20; i++) push(at(236));
    drive(236, 250, 3);
  }
  for (let i = 0; i < 60; i++) push(at(250)); // the approach
  drive(250, 366, 6);
  for (let i = 0; i < 55; i++) push(at(366)); // ball on the green
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

test('a long wait in the cart still outranks a shot — the known cost of dwell-only', () => {
  /*
   * NOT a passing grade. This records a weakness so it is not rediscovered as
   * news, and so the next feature has something to beat.
   *
   * Dwell is the only thing measured that separates shots from non-shots, but
   * it cannot separate a shot from sitting still for a long time. On a scramble
   * — three other people hitting, long waits in the cart — the same ranking
   * that gets 91% on a normal round gets 59%. That gap is this.
   *
   * Propose-and-confirm is why this is survivable: a wrong proposal costs one
   * tap. It would be fatal to auto-fill.
   */
  const long = pocketHole();
  // Replace the 20 s cart pause with a two-minute one: three players away.
  const r = proposeHoleShots(long.points, { fullShots: 2, fromTs: long.startTs, toTs: long.endTs });
  const teeFirst = distanceM(r.proposed[0], long.at(0)) < 12;
  assert(teeFirst, 'the tee shot is still found at a 20 s cart pause');

  const cands = stopCandidates(long.points);
  const cart = cands.find((c) => distanceM(c, long.at(236)) < 12);
  const tee = cands.find((c) => distanceM(c, long.at(0)) < 12);
  assert(cart && tee, 'both stops exist');
  assert(
    tee.score > cart.score,
    `a 65 s shot (${tee.score}) should beat a 20 s wait (${cart.score})`
  );
  // And the honest half: make the wait longer than the shot and the model loses.
  const fakeLongWait = { dwellMs: 130000 };
  const realShot = { dwellMs: 65000 };
  const f = (c) => c.dwellMs / 1000 / (c.dwellMs / 1000 + DWELL_HALF_S);
  assert(
    f(fakeLongWait) > f(realShot),
    'documented weakness: dwell alone cannot tell a long wait from a shot'
  );
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

test('a window with no track at all proposes nothing rather than guessing', () => {
  const r = proposeHoleShots([], { fullShots: 4, fromTs: pocket.startTs, toTs: pocket.endTs });
  eq(r.found, 0, 'no stops');
  eq(r.proposed.length, 0, 'nothing proposed');
  eq(r.shortBy, 4, 'all four unaccounted for');
  eq(r.eligible, 0, 'nothing eligible either');
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


/* ------------------------------------------------- the capture panel is live */

/**
 * THE BUG THIS GUARDS.
 *
 * `updateCaptureUI` looked its targets up with `body.querySelector('.cap-meta')`
 * while `paintCapture` appended the panel to `footer`. Both lookups returned
 * null, both were guarded by `if (bar)` / `if (meta)`, and the function
 * therefore did nothing at all — for every capture the app had ever taken.
 *
 * On the course that reads as a hang. The progress bar never moves and the
 * panel says "Capturing…" forever, including long after the burst has finished
 * and the shot is sitting one lie tap from being saved. A tee shot hides it
 * completely, because a tee shot commits itself. Field test 5, in his words:
 * "multiple times I hit mark shot and it hung (app said capturing shot) and it
 * did not log it."
 *
 * So the test drives the real screen and asserts the panel actually changes —
 * a silently-guarded lookup against the wrong container passes any test that
 * only checks the capture eventually commits.
 */
export async function runCaptureUiTests() {
  group('the capture panel reports progress');

  const app = newAppState();
  const round = par4Round();
  const now = Date.now();

  // A receiver that answers instantly, so the test is about the panel rather
  // than about waiting out a burst.
  const gps = {
    running: true,
    error: null,
    fixCount: 4,
    last: { lat: TEE.lat, lon: TEE.lon, acc: 2.5, ts: now },
    get current() {
      return this.last;
    },
    staleSinceMs: () => 0,
    subscribe: () => () => {},
    captureBurst({ onProgress }) {
      // One tick mid-burst, then resolve — the shape the real one produces.
      onProgress?.({ elapsed: 1500, total: 3000, count: 2, bestAcc: 2.5 });
      return Promise.resolve({
        lat: TEE.lat,
        lon: TEE.lon,
        accuracyM: 1.53,
        quality: 'good',
        spreadM: 1,
        usedCount: 3,
        sampleCount: 4,
        samples: [],
      });
    },
  };

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
    trackStats: () => null,
  });
  document.body.appendChild(screen.el);

  const press = (re) =>
    [...screen.el.querySelectorAll('.footer button')].find((b) => re.test(b.textContent))?.click();
  const meta = () => screen.el.querySelector('.cap-meta')?.textContent ?? null;

  // The tee shot commits itself, which is exactly why it hid the bug.
  press(/MARK TEE SHOT/);
  await new Promise((r) => setTimeout(r, 80));

  // Shot 2 is the case that asks for a lie.
  press(/MARK SHOT/);
  await new Promise((r) => setTimeout(r, 80));
  const afterBurst = meta();
  const barWidth = screen.el.querySelector('.cap-bar span')?.style.width ?? '';
  const lieOffered = Boolean(screen.el.querySelector('.lie-grid'));

  // Repainting must not lose it either — tapping a club repaints the panel.
  screen.el.querySelector('.club-grid .seg-btn')?.click();
  await new Promise((r) => setTimeout(r, 40));
  const afterRepaint = meta();

  screen.el.remove();

  test('the panel is found where it actually lives, not where it was assumed to be', () => {
    assert(afterBurst != null, 'no capture panel rendered at all');
    assert(
      afterBurst !== 'Capturing…',
      `the panel never updated — still the hardcoded placeholder (${JSON.stringify(afterBurst)})`
    );
  });

  test('it says the burst finished, rather than capturing forever', () => {
    assert(
      /^Captured/.test(afterBurst),
      `expected the panel to report completion, got ${JSON.stringify(afterBurst)}`
    );
    // 1.53 m is 5.0 ft. Reported in feet, like everything else on screen.
    assert(/5\s*ft/.test(afterBurst), `expected the accuracy in feet, got ${JSON.stringify(afterBurst)}`);
  });

  test('the progress bar is driven', () => {
    assert(barWidth !== '', 'the bar was never given a width');
  });

  test('a finished burst still asks for the lie, and says so', () => {
    // Since v23 the shot is already saved at this point (see the mark-flow
    // group); the lie grid stays up to finish it.
    assert(lieOffered, 'the lie grid should be on screen waiting');
  });

  test('a repaint does not drop it back to the placeholder', () => {
    // paintCapture rebuilds the panel, so the references have to be re-handed
    // every time. Tapping a club is the ordinary way that happens mid-capture.
    assert(
      afterRepaint == null || afterRepaint !== 'Capturing…',
      `a repaint reverted the panel to the placeholder (${JSON.stringify(afterRepaint)})`
    );
  });
}

/* ------------------------------ marks name the shot, and LOCK never loses one */

/**
 * THREE ASKS FROM ONE MESSAGE, 2026-09-11.
 *
 * "Okay lets add the ability to mark the cup on any screen i had multiple
 * times where my ball is on the fringe of near the green and I have gone
 * behind the hole to read the line and wanted to mark but couldn't. I need the
 * ability to use the app lock screen as soon as marking the cup or a shot but
 * still have it log the shot there was an issue before of me hitting the lock
 * button before a shot was fully logged and it missed."
 *
 * And the words on the button: "It should be Mark Tee shot at the tee
 * location, Mark shot 2 from where I hit shot 2 which is exactly where the last
 * shot finished, then mark shot 3, then mark shot 4."
 *
 * Drives the real screen with a receiver whose burst ends only when the test
 * says so, because the whole bug lived between MARK SHOT and the end of the
 * burst — a receiver that resolves instantly can never put LOCK in that gap.
 */
function heldGps(start) {
  let finish = null;
  const gps = {
    running: true,
    error: null,
    fixCount: 4,
    at: start,
    // Pinned at the tee so the missing-tee nudge never fires mid-test.
    last: { lat: start.lat, lon: start.lon, acc: 2.5, ts: Date.now() },
    get current() {
      return this.last;
    },
    staleSinceMs: () => 0,
    subscribe: () => () => {},
    captureBurst() {
      return new Promise((resolve) => {
        finish = () => resolve(fakeReduced(gps.at, 1.53));
      });
    },
    endBurst() {
      const f = finish;
      finish = null;
      f?.();
    },
  };
  return gps;
}

export async function runMarkFlowTests() {
  group('marks name the shot, and LOCK never loses one');

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const app = newAppState();
  const round = par4Round();
  const hl = round.holes[0];
  const gps = heldGps(TEE);
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
    trackStats: () => null,
  });
  document.body.appendChild(screen.el);

  const footerButtons = () => [...screen.el.querySelectorAll('.footer button')];
  const buttons = () => footerButtons().map((b) => b.textContent.trim());
  const press = (re) => footerButtons().find((b) => re.test(b.textContent.trim()))?.click();
  // Anywhere on the screen. Since v24 the capture and lie card is in the body,
  // so its own buttons are not in the footer.
  const tap = (re) => [...screen.el.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()))?.click();
  const tapLie = (re) => [...screen.el.querySelectorAll('.lie-grid .seg-btn')].find((b) => re.test(b.textContent))?.click();
  const said = () => screen.el.querySelector('.banner[data-kind="ok"] span')?.textContent ?? null;
  const running = () => Boolean(document.querySelector('.capture[data-burst="running"]'));
  const lieGaps = () => roundGaps(round).filter((g) => g.kind === 'lie');
  const openSheet = () => document.querySelector('.scrim .sheet');
  const sheetButton = (re) => [...(openSheet()?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent.trim()));

  const onTee = buttons();

  // The tee shot commits itself.
  press(/^MARK TEE SHOT$/);
  gps.endBurst();
  await wait();
  const afterTee = { buttons: buttons(), said: said() };

  // Shot 2: MARK SHOT, then LOCK before any lie — the failure he described.
  gps.at = offsetM(TEE, 240, 5);
  press(/^MARK SHOT 2$/);
  const runningDuringBurst = running();
  // v24: the action stack survives the capture. MARK SHOT is disabled only for
  // the three seconds the burst is actually running.
  const duringBurst = {
    cardInBody: Boolean(screen.el.querySelector('.body > .capture[data-burst="running"]')),
    cardInFooter: Boolean(screen.el.querySelector('.footer .capture')),
    markShot: footerButtons().find((b) => /MARK SHOT/.test(b.textContent)) ?? null,
  };
  pocketLock.lock();
  gps.endBurst();
  await wait();
  const whileLocked = {
    locked: pocketLock.isLocked(),
    count: hl.shots.length,
    seq: hl.shots[1]?.seq,
    unanswered: lieUnanswered(hl.shots[1]),
    running: running(),
    panel: Boolean(screen.el.querySelector('.capture[data-burst="done"] .lie-grid')),
    gaps: lieGaps().length,
    // v24: with a lie outstanding, the next shot is still one tap away.
    cardInBody: Boolean(screen.el.querySelector('.body > .capture[data-burst="done"]')),
    cardInFooter: Boolean(screen.el.querySelector('.footer .capture')),
    markShot: buttons().find((t) => /^MARK SHOT/.test(t)) ?? null,
    markShotEnabled: !(footerButtons().find((b) => /MARK SHOT/.test(b.textContent))?.disabled ?? true),
  };
  pocketLock.unlock();
  tapLie(/^ROUGH$/);
  await wait();
  // Optional chaining throughout: against the old behaviour there is no shot 2,
  // and that has to read as a failed test, not a crashed run.
  const answered = {
    lie: hl.shots[1]?.lie,
    unanswered: lieUnanswered(hl.shots[1]),
    said: said(),
    buttons: buttons(),
    gaps: lieGaps().length,
  };

  // Shot 3: the lie tapped during the burst, then LOCK — the path that always worked.
  gps.at = offsetM(TEE, 340, 2);
  press(/^MARK SHOT 3$/);
  tapLie(/^FAIRWAY$/);
  pocketLock.lock();
  gps.endBurst();
  await wait();
  const lieFirst = { lie: hl.shots[2]?.lie, unanswered: lieUnanswered(hl.shots[2]), said: said() };
  pocketLock.unlock();

  // Shot 4, marked while shot 3's "marked · UNDO" banner is still up (it lives
  // 20 s), and no lie tapped. The moment the burst ends shot 4 is the newest
  // thing on the hole, so that banner's UNDO would take shot 4 while naming
  // shot 3. Found on the sim, 2026-09-11: "Shot 4 marked (Fairway). UNDO"
  // removed shot 5.
  gps.at = offsetM(TEE, 360, 1);
  press(/^MARK SHOT 4$/);
  gps.endBurst();
  await wait();
  const staleBanner = { said: said(), count: hl.shots.length, panel: Boolean(screen.el.querySelector('.capture[data-burst="done"]')) };
  tap(/^CANCEL SHOT$/);
  await wait();
  const cancelled = { count: hl.shots.length, buttons: buttons() };

  // The ball is not on the green (no GREEN mark), and the cup control is there anyway.
  const cupOffered = buttons().includes('MARK CUP');

  // A cup fix at the tee is questioned, and declining it saves nothing.
  gps.at = offsetM(TEE, 8, 0);
  press(/^MARK CUP$/);
  gps.endBurst();
  await wait();
  const atTee = { asked: /tee/i.test(openSheet()?.textContent ?? ''), cup: hl.cup };
  sheetButton(/^Close$/)?.click();
  await wait();
  const declined = hl.cup;

  // Confirming saves it — he is the source of truth about where he is.
  press(/^MARK CUP$/);
  gps.endBurst();
  await wait();
  sheetButton(/^MARK CUP HERE$/)?.click();
  await wait();
  const confirmedM = hl.cup ? distanceM(hl.cup, TEE) : null;

  // A real cup is never questioned.
  gps.at = offsetM(TEE, 380, 0);
  press(/^RE-MARK CUP$/);
  gps.endBurst();
  await wait();
  const farAsked = /tee/i.test(openSheet()?.textContent ?? '');
  const farM = hl.cup ? distanceM(hl.cup, TEE) : null;

  screen.el.remove();
  for (const s of document.querySelectorAll('.scrim')) s.remove();
  if (pocketLock.isLocked()) pocketLock.unlock();

  test('on the tee it says MARK TEE SHOT, and there is no cup control to mis-tap', () => {
    assert(onTee.includes('MARK TEE SHOT'), `buttons: ${JSON.stringify(onTee)}`);
    assert(!onTee.some((t) => /CUP/.test(t)), `a cup control on the tee: ${JSON.stringify(onTee)}`);
  });

  test('after the tee shot the button names shot 2, not a landing', () => {
    assert(afterTee.buttons.includes('MARK SHOT 2'), `buttons: ${JSON.stringify(afterTee.buttons)}`);
    assert(!afterTee.buttons.some((t) => /LANDING/.test(t)), 'the landing wording is back');
    eq(afterTee.said, 'Tee shot marked.');
  });

  test('LOCK straight after MARK SHOT still saves the shot', () => {
    assert(runningDuringBurst, 'the burst never showed as running');
    eq(whileLocked.locked, true, 'the lock was not up when the burst ended');
    eq(whileLocked.count, 2, 'the shot was not saved');
    eq(whileLocked.seq, 2, 'saved under the wrong shot number');
  });

  test('it is saved without a lie, flagged, and the gaps gate asks for it', () => {
    eq(whileLocked.unanswered, true, 'the lie was filled in without asking');
    eq(whileLocked.gaps, 1, 'the unanswered lie is not in the gaps gate');
  });

  test('the action stack survives the capture — MARK SHOT never leaves the screen', () => {
    // Field test 7, hole 1: the lie panel replaced the footer, so there was no
    // MARK SHOT and it read as "a lie is required". He deleted marks to escape.
    assert(duringBurst.cardInBody, 'the capture card is not in the body');
    eq(duringBurst.cardInFooter, false, 'the capture is still taking over the footer');
    assert(duringBurst.markShot, 'MARK SHOT disappeared while the burst ran');
    eq(duringBurst.markShot.disabled, true, 'MARK SHOT should be inert for the 3 s of the burst');
  });

  test('with a lie outstanding the next shot is still one tap away', () => {
    assert(whileLocked.cardInBody, 'the lie card is not in the body');
    eq(whileLocked.cardInFooter, false, 'the lie panel is still taking over the footer');
    eq(whileLocked.markShot, 'MARK SHOT 3', `footer offered ${JSON.stringify(whileLocked.markShot)}`);
    eq(whileLocked.markShotEnabled, true, 'MARK SHOT is disabled while a lie is outstanding');
  });

  test('once the burst is over the auto-lock is no longer held off', () => {
    // app.js locks unless a `.capture[data-burst="running"]` exists.
    eq(whileLocked.running, false, 'a finished burst still reads as running');
    assert(whileLocked.panel, 'no lie panel for the saved shot');
  });

  test('unlocking and tapping the lie finishes the shot', () => {
    eq(answered.lie, 'rough');
    eq(answered.unanswered, false, 'still flagged after he answered');
    eq(answered.said, 'Shot 2 marked (Rough).');
    eq(answered.gaps, 0, 'the gap outlived the answer');
    assert(answered.buttons.includes('MARK SHOT 3'), `buttons: ${JSON.stringify(answered.buttons)}`);
  });

  test('a lie tapped during the burst saves with it, locked or not', () => {
    eq(lieFirst.lie, 'fairway');
    eq(lieFirst.unanswered, false);
    eq(lieFirst.said, 'Shot 3 marked (Fairway).');
  });

  test('a shot saved for its lie clears the previous mark\'s UNDO banner', () => {
    assert(staleBanner.panel, 'no lie panel for shot 4');
    eq(staleBanner.count, 4, 'shot 4 was not saved');
    eq(staleBanner.said, null, `shot 3's banner is still offering UNDO over the saved shot 4: ${JSON.stringify(staleBanner.said)}`);
  });

  test('CANCEL SHOT takes back only the shot it is under', () => {
    eq(cancelled.count, 3, 'CANCEL SHOT removed the wrong number of shots');
    assert(cancelled.buttons.includes('MARK SHOT 4'), `buttons: ${JSON.stringify(cancelled.buttons)}`);
  });

  test('the cup can be marked with the ball off the green', () => {
    assert(cupOffered, 'no MARK CUP without a ball marked on the green');
  });

  test('a cup fix at the tee is questioned before it is saved', () => {
    assert(atTee.asked, 'no question raised for a cup 8 m from the tee');
    eq(atTee.cup, null, 'saved before he answered');
    eq(declined, null, 'saved although he declined');
  });

  test('confirming a cup at the tee saves it anyway', () => {
    assert(confirmedM != null && confirmedM < 12, `cup ${confirmedM} m from the tee`);
  });

  test('a real cup is never questioned', () => {
    eq(farAsked, false, 'a cup 380 m out was questioned');
    assert(farM != null && Math.abs(farM - 380) < 2, `cup ${farM} m from the tee`);
  });

  test('a lie answered "don\'t remember" at end-of-hole is not asked for again', () => {
    const r = par4Round();
    const hole = r.holes[0];
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    const guessed = addShot(hole, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 200, 0)), source: 'track' });
    guessed.lieInferred = true;
    eq(lieUnanswered(guessed), false);
    eq(roundGaps(r).filter((g) => g.kind === 'lie').length, 0);
  });

  test('a shot saved for later reads as unanswered until the lie is set', () => {
    const r = par4Round();
    const hole = r.holes[0];
    addShot(hole, { lie: 'tee', reduced: fakeReduced(TEE) });
    const later = addShotLieLater(hole, { reduced: fakeReduced(offsetM(TEE, 380, 0)) });
    eq(later.seq, 2);
    eq(lieUnanswered(later), true);
    const gap = roundGaps(r).find((g) => g.kind === 'lie');
    assert(gap && /shot 2/.test(gap.label), `gap: ${JSON.stringify(gap)}`);
    setShotLie(later, 'green');
    eq(lieUnanswered(later), false);
    eq(later.club, 'putter', 'a shot from the green is a putt');
  });
}

/* ----------------------------------------- the lock is reachable everywhere */

/**
 * His instruction, 2026-09-13: "We need the lock button bigger and available at
 * all times".
 *
 * Until v24 the tab sat BELOW the sheet scrim, so the putt sheet — the one
 * place on the green where he wants to pocket the phone — had no lock control
 * at all. Field test 7: "trying to lock the phone because you cant lock it on
 * the putting screen". Raising it above the scrim reopens the overlap that
 * z-index was avoiding, so the sheet now reserves the tab's strip exactly as
 * the play screen does.
 *
 * These measure the real CSS in a real layout rather than matching source text,
 * because "the rule exists" and "nothing tappable is under the tab" are
 * different claims.
 */
export async function runLockReachTests() {
  group('the lock tab is reachable everywhere');

  const css = await fetch('../css/base.css').then((r) => r.text());
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  pocketLock.enable();
  const tab = document.querySelector('.lock-tab');
  const size = tab?.getBoundingClientRect() ?? null;
  const tabZ = tab ? Number(getComputedStyle(tab).zIndex) : null;
  const gutter = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lock-tab-gutter')
  );

  // A sheet, the way the putt entry opens one.
  const body = document.createElement('button');
  body.className = 'btn';
  body.textContent = 'A FULL WIDTH BUTTON';
  const pending = sheet('Putts', () => body);
  await new Promise((r) => setTimeout(r, 20));
  const scrim = document.querySelector('.scrim');
  const panel = document.querySelector('.scrim .sheet');
  const scrimZ = scrim ? Number(getComputedStyle(scrim).zIndex) : null;
  const sheetPadRight = panel ? parseFloat(getComputedStyle(panel).paddingRight) : null;
  const tabWithSheet = Boolean(document.querySelector('.lock-tab'));

  // Locking from inside the sheet, and coming back to it afterwards.
  pocketLock.lock();
  const lockScreen = document.querySelector('.lock-screen');
  const lockedOverSheet = {
    locked: pocketLock.isLocked(),
    screenZ: lockScreen ? Number(getComputedStyle(lockScreen).zIndex) : null,
    tabHidden: !document.querySelector('.lock-tab'),
  };
  pocketLock.unlock();
  await new Promise((r) => setTimeout(r, 20));
  const sheetSurvived = Boolean(document.querySelector('.scrim .sheet'));

  // Its own Close button, because `closeSheet()` removes the element without
  // resolving the promise `sheet()` handed back — awaiting that hangs the suite.
  [...(document.querySelector('.scrim .sheet')?.querySelectorAll('button') ?? [])]
    .find((b) => /^Close$/.test(b.textContent.trim()))
    ?.click();
  await pending;
  closeSheet();
  pocketLock.disable();
  style.remove();

  test('the tab is on screen while a sheet is open, and above it', () => {
    assert(tabWithSheet, 'no lock tab while a sheet was open');
    assert(tabZ > scrimZ, `tab z-index ${tabZ} is not above the scrim's ${scrimZ}`);
  });

  test('the sheet reserves the tab strip, so nothing tappable sits under it', () => {
    // This is what lets the tab come above the scrim without recreating the
    // mis-tap the old z-index was avoiding.
    assert(sheetPadRight >= gutter, `sheet padding-right ${sheetPadRight}px against a ${gutter}px strip`);
  });

  test('it is big enough to hit without looking', () => {
    assert(size && size.width >= 76, `tab is ${size?.width}px wide`);
    assert(size && size.height >= 168, `tab is ${size?.height}px tall`);
  });

  test('locking from inside a sheet covers it, and the sheet is still there after', () => {
    eq(lockedOverSheet.locked, true, 'the tab did not lock from inside a sheet');
    assert(lockedOverSheet.screenZ > scrimZ, 'the lock screen does not cover the sheet');
    assert(lockedOverSheet.tabHidden, 'the tab is still showing under the lock screen');
    assert(sheetSurvived, 'unlocking lost the sheet he was in the middle of');
  });
}

/* ---------------------------------- the capture card stays out of the strip */

/**
 * The lie is answered on a card in the body since v24, and the body reserves
 * the lock tab's strip. That is only a guarantee if the card fits the body: a
 * grid column is `minmax(auto, 1fr)` by default, so a grid whose labels are
 * wider than their share grows past its container instead of shrinking - and
 * on the sim at 375x812 (Fable, item 2.2, 2026-09-14) the club chips "5" and
 * "PW" ended 6 px under the LOCK tab, and the lie grid 15 px past the card's
 * edge. A thumb going for a lie or a club at the right end of its row locks
 * the phone instead. The mark is already saved by then, so it costs a lock
 * and an unlock, not data; but "nothing tappable under the tab, on any
 * screen" is the rule the tab sits above the sheets on.
 *
 * Measured against the real CSS at an explicit width, so a hidden pane (which
 * lays out at 0 px wide) cannot make it pass vacuously: every button in the
 * card, during the burst and with the lie outstanding, must end inside the
 * body's content box - left of the strip, not merely left of the tab.
 */
export async function runCaptureReachTests() {
  group('the capture card stays out of the lock strip');

  const css = await fetch('../css/base.css').then((r) => r.text());
  const style = document.createElement('style');
  // A phone draws overlay scrollbars, which take no width. A desktop runner
  // draws a classic one inside the scrolling body (15 px in Chrome on Windows,
  // measured 2026-09-15): 5 px off each lie button, and a label test that
  // failed for a reason no phone has. So the layout measured is a phone's.
  style.textContent = `${css}\n.body { scrollbar-width: none; }\n.body::-webkit-scrollbar { display: none; }`;
  document.head.appendChild(style);

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const gutter = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--lock-tab-gutter')
  );
  pocketLock.enable();

  // A fresh round and screen per size, pinned to the top-left corner at a
  // phone's width and height so the rects read like a phone.
  const at = async (width, height) => {
    const gps = heldGps(TEE);
    const round = par4Round();
    const screen = playScreen({
      app: newAppState(),
      round,
      gps,
      params: {},
      go() {},
      persistRound() {},
      persistApp() {},
      startGps() {},
      stopGps() {},
      trackStats: () => null,
    });
    Object.assign(screen.el.style, { position: 'fixed', left: '0', top: '0', height: `${height}px`, width: `${width}px` });
    document.body.appendChild(screen.el);
    /*
     * THE FOOTER MUST BE AS TALL HERE AS IT IS ON THE PHONE, OR THERE IS NO FOLD.
     *
     * `.footer` is clamped to `78dvh`, and `dvh` is 0 in a hidden browser pane
     * - the same zero that made `zoneOf` misread the lock zones (item 2.2).
     * Clipped to nothing, the footer collapsed to its 19 px of padding, the
     * body took the other 400, and the fold test below passed against a layout
     * no phone has: it read a body bottom of 709 px at 360x728 where a phone
     * reads 298 (found 2026-09-16, building v26; on his S26 the second row of
     * lies was cut in half while this test was green). The clamp is restated
     * from the harness's own page height, which is what `dvh` would be.
     */
    screen.el.querySelector('.footer').style.maxHeight = `${Math.round(height * 0.78)}px`;
    const press = (re) => [...screen.el.querySelectorAll('.footer button')].find((b) => re.test(b.textContent.trim()))?.click();
    const worst = () => {
      const card = screen.el.querySelector('.body > .capture');
      const items = [...(card?.querySelectorAll('button') ?? [])].map((b) => ({
        text: b.textContent.trim(),
        right: b.getBoundingClientRect().right,
        // A label wider than its button: the column was pinned, the text was not.
        spill: b.scrollWidth - b.clientWidth,
      }));
      const w = items.reduce((a, x) => (x.right > (a?.right ?? -Infinity) ? x : a), null);
      const s = items.reduce((a, x) => (x.spill > (a?.spill ?? -Infinity) ? x : a), null);
      // The fold: the body is the only scroller, so a lie button below its
      // bottom edge needs a scroll before it can be tapped.
      const bodyBottom = screen.el.querySelector('.body').getBoundingClientRect().bottom;
      const lieButtons = [...(card?.querySelectorAll('.lie-grid .seg-btn') ?? [])];
      const lieBottom = Math.max(...lieButtons.map((b) => b.getBoundingClientRect().bottom), -Infinity);
      // Where the grid starts, so the running card can be held to the saved one.
      const lieTop = Math.min(...lieButtons.map((b) => b.getBoundingClientRect().top), Infinity);
      return { n: items.length, card: card?.dataset.burst ?? null, worst: w, spill: s, cardRight: card?.getBoundingClientRect().right ?? null, bodyBottom, lieBottom, lieTop };
    };
    await wait();
    press(/^MARK TEE SHOT$/);
    gps.endBurst();
    await wait();
    press(/^MARK SHOT 2$/);
    await wait();
    const burst = worst();
    gps.endBurst();
    await wait();
    const pending = worst();
    /*
     * THE LONGEST HINT IN THE APP, WITH A LIE CARD UNDER IT.
     *
     * The footer's hint is the only part of that footer whose height is not
     * fixed, and the body — which the lie card lives in — gets what the footer
     * leaves. Answering a lie GREEN and then pressing MARK SHOT instead of
     * MARK CUP is the one state that puts the "on the green" hint on screen
     * with a card up, and at v26 that hint wrapped to three lines at 360 px
     * and took 37.8 px off the body: the SAND / RECOVERY / GREEN row ended
     * 11.5 px under the footer with everything else about the layout correct
     * (Fable, 2026-09-16, off REPORT 2.6 Section 6; Matt: "shorten it and
     * push"). So the worst hint is measured, not the average one.
     */
    const lieBtn = (label) =>
      [...screen.el.querySelectorAll('.body > .capture .lie-grid .seg-btn')]
        .find((b) => b.textContent.trim() === label);
    lieBtn('GREEN')?.click();
    await wait();
    press(/^MARK SHOT 3$/);
    await wait();
    const onGreen = { ...worst(), hint: screen.el.querySelector('.footer .hint')?.textContent ?? '' };
    screen.el.remove();
    return { width, height, limit: width - gutter, burst, pending, onGreen };
  };

  /*
   * THE HEIGHT IS THE PAGE, NOT THE PHONE.
   *
   * v25 was measured at the phones' screen heights, 812 and 780, and passed
   * with 55 and 24 px to spare - then the SAND / RECOVERY / GREEN row came
   * back cut in half in a photograph of the installed app on his S26 (Matt,
   * 2026-09-16). The screen is 1080x2340 at density 480, which is 360x780 CSS
   * px, but the page is not the screen: Android's status bar (111 device px,
   * painted with the `theme-color`) and the gesture bar (45) are not the app's
   * to draw in. Read off that photograph, the hud starts 111 px down and the
   * footer's border-top lands at 1004, giving a body bottom of 297.7 and a
   * page of exactly (2295 - 111) / 3 = 728 CSS px. The footer measures 430.3
   * px there against 430 on the PC, which is what says the reading is right.
   *
   * So 728 is his phone, and it is the size this group is held to. The two
   * roomier heights are kept because they are the sizes the specification
   * named (759 and 791 - a 21 px status bar); each one that passes is a phone
   * with less chrome than his.
   */
  const sizes = [];
  for (const [w, h] of [
    [375, 791],
    [360, 759],
    [360, 728],
  ]) {
    sizes.push(await at(w, h));
  }

  pocketLock.disable();
  style.remove();

  for (const r of sizes) {
    test(`at ${r.width} px the capture card's buttons all end before the lock strip`, () => {
      assert(r.burst.card === 'running', `no running capture card (${r.burst.card})`);
      assert(r.burst.n >= 7, `only ${r.burst.n} buttons in the capture card`);
      assert(
        r.burst.worst.right <= r.limit,
        `"${r.burst.worst.text}" ends at ${Math.round(r.burst.worst.right)} px, strip starts at ${r.limit}`
      );
    });
    test(`at ${r.width} px the pending-lie card's buttons all end before the lock strip`, () => {
      assert(r.pending.card === 'done', `no pending-lie card (${r.pending.card})`);
      assert(r.pending.n >= 8, `only ${r.pending.n} buttons in the lie card`);
      assert(
        r.pending.worst.right <= r.limit,
        `"${r.pending.worst.text}" ends at ${Math.round(r.pending.worst.right)} px, strip starts at ${r.limit}`
      );
      assert(
        r.pending.worst.right <= r.pending.cardRight,
        `"${r.pending.worst.text}" spills ${Math.round(r.pending.worst.right - r.pending.cardRight)} px past the card`
      );
    });
    /*
     * The two below FAIL on v24 (Fable, item 2.2, 2026-09-14) and are left in
     * as the acceptance bar for the rework of the card - a test written for a
     * defect is proven to fail against it. Both are layout-agnostic: they say
     * what the golfer must be able to do, not how the card is built. Build v25
     * puts the lie field first in the card and is held to them.
     */
    test(`at ${r.width} px every label in the lie card fits its button`, () => {
      // A pinned column with a label wider than it is the strip defect moved
      // one level down. RECOVERY is the widest label.
      assert(
        r.pending.spill.spill <= 0,
        `"${r.pending.spill.text}" is ${r.pending.spill.spill} px wider than its button`
      );
    });
    test(`at ${r.width}x${r.height} the whole lie grid is above the footer when the burst ends`, () => {
      // Field test 7 was a required field the golfer could not find. In v23
      // the lie panel took over the footer and was always fully on screen; in
      // v24 the card sits in the body above a 430 px footer, and the second
      // row of lies (SAND, RECOVERY, GREEN) is below the fold at a phone's
      // height - it needs a scroll before it can be tapped.
      assert(
        r.pending.lieBottom <= r.pending.bodyBottom,
        `the lowest lie button ends at ${Math.round(r.pending.lieBottom)} px, the body at ${Math.round(r.pending.bodyBottom)} px (${Math.round(r.pending.lieBottom - r.pending.bodyBottom)} px below the fold)`
      );
    });
    test(`at ${r.width}x${r.height} the longest hint still leaves the whole lie grid above the footer`, () => {
      // The residual v26 left: the hint is the one variable-height thing in
      // the footer, and "on the green" is the longest one that can be on
      // screen with a lie card up. Three lines of it put the bottom row under
      // the footer at 360x728 — the same defect as the test above, reached
      // through the text rather than the box model.
      assert(/MARK CUP/.test(r.onGreen.hint), `the "on the green" hint is not up: "${r.onGreen.hint}"`);
      assert(r.onGreen.card === 'running', `no capture card in the on-the-green state (${r.onGreen.card})`);
      assert(Number.isFinite(r.onGreen.lieBottom), 'no lie grid in the on-the-green state');
      assert(
        r.onGreen.lieBottom <= r.onGreen.bodyBottom,
        `under "${r.onGreen.hint}" the lowest lie button ends at ${Math.round(r.onGreen.lieBottom)} px, the body at ${Math.round(r.onGreen.bodyBottom)} px (${Math.round(r.onGreen.lieBottom - r.onGreen.bodyBottom)} px below the fold)`
      );
    });
    test(`at ${r.width}x${r.height} the lie grid does not move when the burst ends`, () => {
      // Measured on the sim at 360x780 (2026-09-15): shot 2 marked while the
      // tee's "marked · UNDO" banner was still up, and the grid jumped 78 px at
      // burst end, because that banner sat above the card and is cleared the
      // moment the shot saves. The same press sequence runs here.
      assert(
        Number.isFinite(r.burst.lieTop) && Number.isFinite(r.pending.lieTop),
        `no lie grid in the ${Number.isFinite(r.burst.lieTop) ? 'saved' : 'running'} card`
      );
      assert(
        Math.abs(r.pending.lieTop - r.burst.lieTop) <= 1,
        `the lie grid moved ${Math.round(r.pending.lieTop - r.burst.lieTop)} px when the burst ended`
      );
    });
  }
}

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

  test('the accuracy chip shows the live reading, in feet', () => {
    // 3.2 m is 10.5 ft. Metres never reach the screen — Matt reads yards and
    // feet, and a number he has to convert in his head is one he will not check.
    assert(/10\s*ft/.test(whileLive), `expected the live accuracy in feet, got ${JSON.stringify(whileLive)}`);
    assert(!/m/.test(whileLive), `metres leaked into the chip: ${JSON.stringify(whileLive)}`);
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

/* ------------------------------------------- storage eviction protection */

/**
 * A stand-in for `navigator`, so these tests never touch the real receiver of
 * the real browser's storage state.
 *
 * `calls` records what was actually asked for, because the interesting bugs
 * here are about asking too often, or not at all — neither of which shows up in
 * a return value.
 */
function fakeNav({ persisted = false, grant = false, throws = false, missing = false } = {}) {
  const calls = { persisted: 0, persist: 0 };
  if (missing) return { calls, navigator: {} };
  let state = persisted;
  return {
    calls,
    navigator: {
      storage: {
        async persisted() {
          calls.persisted++;
          if (throws) throw new Error('nope');
          return state;
        },
        async persist() {
          calls.persist++;
          if (throws) throw new Error('nope');
          state = grant;
          return grant;
        },
      },
    },
  };
}

export async function runStoragePersistTests() {
  group('storage eviction protection');

  /* ------------------------------------------------------------- reading */

  const granted = await checkPersistence(fakeNav({ persisted: true }).navigator);
  const notGranted = await checkPersistence(fakeNav({ persisted: false }).navigator);
  const noApi = await checkPersistence(fakeNav({ missing: true }).navigator);
  const threw = await checkPersistence(fakeNav({ throws: true }).navigator);

  test('a persisted origin reads as persistent', () => eq(granted, PERSISTENT));
  test('a best-effort origin reads as best-effort', () => eq(notGranted, BEST_EFFORT));

  test('a browser without the API reads as unknown, never as best-effort', () => {
    // The distinction is the whole point of the third state. Telling Matt his
    // rounds are at risk when we simply could not ask is the same class of lie
    // as an export reporting success while carrying no track.
    eq(noApi, UNKNOWN);
  });

  test('a rejected persisted() reads as unknown rather than throwing', () => eq(threw, UNKNOWN));

  /* ------------------------------------------------------------ asking */

  const alreadyOn = fakeNav({ persisted: true });
  const stillOn = await requestPersistence(alreadyOn.navigator);
  test('an already-persistent origin is not asked again', () => {
    eq(stillOn, PERSISTENT);
    eq(alreadyOn.calls.persist, 0, 'persist() was called on an origin that was already protected');
  });

  const willGrant = fakeNav({ persisted: false, grant: true });
  const afterGrant = await requestPersistence(willGrant.navigator);
  test('a granted request comes back persistent', () => {
    eq(afterGrant, PERSISTENT);
    eq(willGrant.calls.persist, 1);
  });

  const willRefuse = fakeNav({ persisted: false, grant: false });
  const afterRefusal = await requestPersistence(willRefuse.navigator);
  test('a refused request comes back best-effort, not unknown', () => eq(afterRefusal, BEST_EFFORT));

  // Computed here rather than inside test(): the framework is synchronous, so
  // an async test body would resolve after the assertion was already recorded
  // as a pass — a test that cannot fail.
  const noPersistFn = await requestPersistence({ storage: { persisted: async () => false } });
  test('a browser with no persist() at all comes back unknown', () => eq(noPersistFn, UNKNOWN));

  /* -------------------------------------------- the automatic path */

  const s1 = {};
  const nav1 = fakeNav({ persisted: false, grant: true });
  const auto1 = await ensurePersistence(s1, nav1.navigator);
  test('START ROUND asks, and records what it got', () => {
    eq(auto1, PERSISTENT);
    eq(s1.storagePersistence, PERSISTENT);
    eq(s1.storagePersistAsked, true);
  });

  const s2 = { storagePersistAsked: true };
  const nav2 = fakeNav({ persisted: false, grant: false });
  await ensurePersistence(s2, nav2.navigator);
  test('a browser that already said no is not asked at every tee', () => {
    // Chrome decides silently, but Firefox shows the user a permission popup —
    // and a popup on the first tee of every round is its own kind of broken.
    eq(nav2.calls.persist, 0, 'persist() was called again after a recorded refusal');
    eq(s2.storagePersistence, BEST_EFFORT);
  });

  const s3 = { storagePersistAsked: true };
  const nav3 = fakeNav({ persisted: true });
  await ensurePersistence(s3, nav3.navigator);
  test('a grant is recorded even when the asking was skipped', () => eq(s3.storagePersistence, PERSISTENT));

  /* ------------------------------------------------------------ wording */

  test('the at-risk wording says the data can be deleted, and says it plainly', () => {
    const { heading, detail, tone } = persistenceLabel(BEST_EFFORT);
    assert(/AT RISK/.test(heading), `expected a blunt heading, got ${JSON.stringify(heading)}`);
    assert(/delete/i.test(detail), `expected the consequence spelled out, got ${JSON.stringify(detail)}`);
    eq(tone, 'bad');
  });

  test('the protected wording does not overclaim', () => {
    // Persistence stops automatic eviction and nothing else. A card that reads
    // as "your data is safe" would be wrong the next time he clears site data.
    const { detail, tone } = persistenceLabel(PERSISTENT);
    assert(/clearing browsing data/i.test(detail), `the caveat is missing: ${JSON.stringify(detail)}`);
    eq(tone, 'ok');
  });

  test('an unknown state is not dressed up as protection', () => {
    const { heading, tone } = persistenceLabel(UNKNOWN);
    assert(/UNKNOWN/.test(heading), heading);
    assert(tone !== 'ok', 'unknown rendered as though it were healthy');
  });

  /* ------------------------------------------------------------- export */

  const exported = await buildExportWithTracks(newAppState());
  test('every export records whether the phone was protecting its storage', () => {
    // The eviction that took field tests 1 to 5 had to be reconstructed from a
    // settings diff weeks after the fact. A file should answer this on its own.
    assert(
      [PERSISTENT, BEST_EFFORT, UNKNOWN].includes(exported.storagePersistence),
      `expected a storage state in the export, got ${JSON.stringify(exported.storagePersistence)}`
    );
  });

  /* ------------------------------------------------------ the Data card */

  const uiApp = newAppState();
  const screen = settingsScreen({
    app: uiApp,
    round: null,
    gps: { current: null, running: false, error: null, fixCount: 0, staleSinceMs: () => null },
    params: {},
    go() {},
    persistApp() {},
    persistRound() {},
    startGps() {},
    stopGps() {},
    trackStats: () => null,
  });
  document.body.appendChild(screen.el);
  // The box paints from a real promise; give it a turn to resolve.
  await new Promise((r) => setTimeout(r, 60));
  const box = screen.el.querySelector('.storage');
  const heading = box?.querySelector('h4')?.textContent ?? '';
  const hasButton = Boolean(box?.querySelector('button'));

  /*
   * Press it, and make sure the box comes back to a verdict.
   *
   * Written after the first version of the button threw a ReferenceError
   * inside its own promise chain, where a bare `.catch(() => {})` swallowed it
   * and left the box reading "checking…" for ever. Nothing about that was
   * visible: no console error, no failed test, just a control that silently
   * stopped meaning anything — which is exactly how the capture panel failed
   * for every capture the app had ever taken.
   */
  screen.el.querySelector('.storage button')?.click();
  await new Promise((r) => setTimeout(r, 250));
  const afterPress = screen.el.querySelector('.storage h4')?.textContent ?? '';

  screen.el.remove();

  test('the Data card states a storage verdict rather than staying quiet', () => {
    assert(box != null, 'no storage box rendered on the Data card at all');
    assert(
      /PROTECTED|AT RISK|UNKNOWN/.test(heading),
      `the box never resolved past its placeholder: ${JSON.stringify(heading)}`
    );
  });

  test('the verdict and the button agree with each other', () => {
    // A protected origin offering to request protection is confusing; an
    // at-risk one with no way to act on it is worse.
    const protectedNow = /PROTECTED/.test(heading);
    eq(hasButton, !protectedNow, `heading ${JSON.stringify(heading)} vs request button ${hasButton}`);
  });

  test('pressing REQUEST PROTECTION records the answer it got', () => {
    if (!hasButton) return; // Already protected here; nothing to press.
    /*
     * Asserted on the settings object, NOT on the heading.
     *
     * The heading version of this test was vacuous: the error path paints
     * UNKNOWN, which is itself a valid verdict, so it passed just as happily
     * with the bug reintroduced. What the bug actually destroys is the record
     * — the ReferenceError fires before anything is written — so that is what
     * this checks. Proven by putting the bug back and watching it fail.
     */
    assert(
      [PERSISTENT, BEST_EFFORT, UNKNOWN].includes(uiApp.settings.storagePersistence),
      `the request never recorded its outcome: ${JSON.stringify(uiApp.settings.storagePersistence)}`
    );
    eq(uiApp.settings.storagePersistAsked, true, 'the request was not marked as asked');
  });

  test('and never leaves the box on its placeholder', () => {
    if (!hasButton) return;
    assert(
      /PROTECTED|AT RISK|UNKNOWN/.test(afterPress),
      `the box never came back from the request: ${JSON.stringify(afterPress)}`
    );
  });
}

/* ------------------------------------------------ the native shell (3.1) */

/**
 * A stand-in for `window.GolfNative`, recording what the web layer actually
 * asked the phone to do.
 *
 * Return values match the real bridge's contract exactly: a JSON string for an
 * object result, a primitive otherwise, and never a throw. The `calls` log is
 * the interesting half — the bugs that matter here are "the points never
 * reached the bridge" and "the export went out twice", neither of which shows
 * up in a return value.
 */
function fakeBridge(overrides = {}) {
  const calls = [];
  const record = (name, fn) => (...args) => {
    calls.push([name, ...args]);
    return fn(...args);
  };
  const base = {
    version: () => 'v27',
    watch: () => true,
    unwatch: () => true,
    startRecording: () => true,
    stopRecording: () => true,
    recordingRoundId: () => '',
    readTrack: () => '[]',
    importTrack: (id, json) => JSON.parse(json).length,
    trackSize: () => 0,
    trackedRoundIds: () => '[]',
    deleteTrack: () => false,
    stats: () =>
      JSON.stringify({
        recording: true,
        roundId: 'r_fake',
        rows: 120,
        lastFixMs: 1789420084966,
        writeFailures: 2,
        skippedNoAcc: 0,
      }),
    saveExport: (name) => JSON.stringify({ path: `Download/golf-tracker/${name}` }),
    exportLogs: (id) => JSON.stringify({ path: `Download/golf-tracker/logs/${id}` }),
  };
  const bridge = {};
  for (const [name, fn] of Object.entries({ ...base, ...overrides })) {
    bridge[name] = record(name, fn);
  }
  return { calls, bridge };
}

/**
 * THE SHELL SEAM.
 *
 * Six things, all of which are invisible on Pages and load-bearing on the
 * phone: the GPS shim, the track store routing to the native log, the storage
 * verdict, the round's recorder stamp and the export leaving the phone. Every
 * one of them is proven with the bridge present AND checked to be inert with it
 * absent, because the failure that would cost a round is not "the shell is
 * broken" — it is "the shell changed what the web build does".
 */
export async function runNativeShellTests() {
  group('native shell');

  /* ---------------------------------------------------------- 1. the shim */

  const realGeolocation = navigator.geolocation;
  delete globalThis.GolfNative;
  delete globalThis.__golfNativeFix;

  /*
   * The shim is a side-effect module: importing it IS installing it. To prove
   * it installs ONLY under a bridge, the no-bridge case needs its own module
   * instance, and a distinct specifier is a distinct module in the registry.
   * Nothing in the app ever loads it twice; this is a test seam and says so.
   */
  await import('../js/native/shim.js?shell=absent');
  const geoUntouchedWithoutBridge = navigator.geolocation === realGeolocation;
  const noHookWithoutBridge = typeof globalThis.__golfNativeFix !== 'function';

  const gpsFake = fakeBridge();
  globalThis.GolfNative = gpsFake.bridge;
  await import('../js/native/shim.js?shell=present');
  const installedWithBridge = navigator.geolocation !== realGeolocation;

  const gps = new GpsService();
  gps.start();
  const nativeFix = {
    lat: 42.0414213,
    lon: -93.6501613,
    acc: 3.2,
    alt: 290,
    altAcc: 6,
    speed: 1.25,
    heading: 88,
    ts: 1789420084966,
  };
  globalThis.__golfNativeFix(nativeFix);
  const delivered = gps.last;

  // 2. the revive path: clearWatch then watchPosition, which is exactly what
  // GpsService.restart() does when a thawed page has gone quiet.
  gps.restart();
  globalThis.__golfNativeFix({ ...nativeFix, ts: nativeFix.ts + 1000 });
  const afterRevive = gps.last;
  const watchCalls = gpsFake.calls.filter((c) => c[0] === 'watch').length;
  const unwatchCalls = gpsFake.calls.filter((c) => c[0] === 'unwatch').length;
  gps.stop();

  test('the shim installs only when the bridge is there', () => {
    eq(geoUntouchedWithoutBridge, true, 'it replaced navigator.geolocation with no bridge present');
    eq(noHookWithoutBridge, true, 'it installed __golfNativeFix with no bridge present');
    eq(installedWithBridge, true, 'it did not replace navigator.geolocation under a bridge');
  });

  test('a native fix reaches GpsService carrying its own time, not the arrival time', () => {
    // `ts` is `Location.time`, the `fix_ms` column. The track is keyed on it and
    // tools/track-coverage.py measures every gap on it — a receive time here
    // would quietly re-base every gap in every round.
    assert(delivered != null, 'no fix reached the GPS service at all');
    eq(delivered.ts, nativeFix.ts, 'timestamp');
    near(delivered.lat, nativeFix.lat, 1e-9, 'latitude');
    near(delivered.acc, nativeFix.acc, 1e-9, 'accuracy');
    near(delivered.speed, nativeFix.speed, 1e-9, 'device speed survives — the stop detector needs it');
    eq(delivered.heading, 88, 'heading');
  });

  test('the watch survives a revive, and leaves the native count where it started', () => {
    eq(afterRevive.ts, nativeFix.ts + 1000, 'fixes stopped after clearWatch + watchPosition');
    // One down and one up: the count is what turns the phone's location service
    // on and off, so an unbalanced restart would leave it running for ever or
    // kill it mid-round.
    eq(watchCalls, 2, 'watchPosition should have registered twice');
    eq(unwatchCalls, 1, 'clearWatch should have deregistered once');
  });

  delete globalThis.GolfNative;
  delete globalThis.__golfNativeFix;
  delete navigator.geolocation; // the own property goes; the real accessor returns

  test('the suite gets the real receiver back', () => {
    eq(navigator.geolocation, realGeolocation, 'navigator.geolocation was left shimmed');
  });

  /* -------------------------------------------------- 3. the track store */

  const storeFake = fakeBridge({
    readTrack: () =>
      JSON.stringify([
        [42.1, -93.2, 3, 1000],
        [42.2, -93.3, 4, 2000, 1.5, 90],
      ]),
    trackSize: () => 42,
    trackedRoundIds: () => JSON.stringify(['r_a', 'r_b']),
    deleteTrack: () => true,
  });
  globalThis.GolfNative = storeFake.bridge;
  const nativeRead = await readTrack('r_native');
  const nativeWrote = await writeTrackChunk('r_native', [
    [42.1, -93.2, 3, 1000],
    'junk',
    [1, 2, 3, 'not a timestamp'],
  ]);
  const nativeSize = await trackSize('r_native');
  const nativeIds = await trackedRoundIds();
  const nativeDeleted = await deleteTrack('r_native');
  const nativeWriter = createTrackWriter('r_native');
  const nativePushed = nativeWriter.push({ lat: 42, lon: -93, acc: 3, ts: 1 });
  const nativeStats = nativeWriter.stats();
  const sentPoints = storeFake.calls.find((c) => c[0] === 'importTrack');
  delete globalThis.GolfNative;

  test('every track-store read routes to the bridge and keeps its shape', () => {
    eq(nativeRead.length, 2, 'readTrack parsed the bridge answer');
    eq(nativeRead[1].length, 6, 'the six-slot point came back whole');
    eq(nativeSize, 42, 'trackSize routed');
    eq(nativeIds.join(','), 'r_a,r_b', 'trackedRoundIds routed');
    eq(nativeDeleted, true, "deleteTrack returned the bridge's own answer");
  });

  test('writeTrackChunk filters first, then hands the points over', () => {
    // The filter is the thing that stops a junk row becoming a CSV row on the
    // phone, and the count is what the restore reports to Matt as success.
    eq(nativeWrote, 1, 'the native count came back');
    eq(sentPoints?.[2], JSON.stringify([[42.1, -93.2, 3, 1000]]), 'what crossed the bridge');
  });

  test('the shell writer stores nothing itself and reports the recorder instead', () => {
    // The recorder already wrote every fix to the round's own file, from its own
    // service, whether this page existed or not. A second copy would mean two
    // answers to "how many fixes does this round have".
    eq(nativePushed, false, 'the shell writer claimed to have stored a fix');
    eq(nativeStats.written, 120, "written = the recorder's row count");
    eq(nativeStats.buffered, 120, 'buffered = rows');
    eq(nativeStats.failures, 2, 'failures = writeFailures');
    eq(nativeStats.flushes, 0, 'nothing is ever in flight in the shell');
    eq(nativeStats.inBuffer, 0, 'nothing is ever in flight in the shell');
  });

  /* ------------------------------------------------- 4. storage verdict */

  const persistFake = fakeBridge();
  globalThis.GolfNative = persistFake.bridge;
  // A navigator that would answer "best effort", to prove the shell answer does
  // not come from `navigator.storage` at all.
  const shellNav = { storage: { persisted: async () => false, persist: async () => false } };
  const shellPersistence = await checkPersistence(shellNav);
  const shellRequest = await requestPersistence(shellNav);
  const shellLabel = persistenceLabel(PERSISTENT, { shell: true });
  delete globalThis.GolfNative;
  const webLabel = persistenceLabel(PERSISTENT);

  test('the shell reports protected storage without asking the browser', () => {
    // App-private WebView storage is not reachable by the per-origin eviction
    // that took field tests 1 to 5, so asking `navigator.storage` would answer
    // the wrong question.
    eq(shellPersistence, PERSISTENT);
    eq(shellRequest, PERSISTENT);
  });

  test('and says what actually deletes rounds there, not what deletes them in Chrome', () => {
    assert(/private storage/i.test(shellLabel.detail), shellLabel.detail);
    assert(/uninstalling/i.test(shellLabel.detail), shellLabel.detail);
    assert(/export/i.test(shellLabel.detail), 'the only copy that survives is not named');
    // Pages is untouched: same words as before.
    assert(/clearing browsing data/i.test(webLabel.detail), webLabel.detail);
  });

  /* ------------------------------------------- 5. the round's recorder */

  const webRound = newRound({
    courseId: 'veenker',
    courseName: 'Veenker',
    coursePar: 72,
    type: 'practice',
    teeSet: 'gold',
    startingNine: 'front',
    holes: [],
  });
  const recorderFake = fakeBridge();
  globalThis.GolfNative = recorderFake.bridge;
  const shellRound = newRound({
    courseId: 'veenker',
    courseName: 'Veenker',
    coursePar: 72,
    type: 'practice',
    teeSet: 'gold',
    startingNine: 'front',
    holes: [],
  });
  delete globalThis.GolfNative;

  test('a round records which recorder marked its track', () => {
    eq(webRound.device.recorder, 'web');
    eq(shellRound.device.recorder, 'native-k');
    // Additive and optional: the schema version does not move for it, so a
    // round logged before the shell existed has no key rather than a wrong one.
    eq(shellRound.schemaVersion, webRound.schemaVersion, 'schemaVersion moved');
  });

  /* ------------------------------------------------------- 6. the export */

  const EXPORT_ID = 'r_shell_export_test';
  deleteRound(EXPORT_ID);
  const exportRound = par4Round();
  exportRound.id = EXPORT_ID;
  saveRound(exportRound);
  const exportApp = loadApp();

  const exportFake = fakeBridge({
    readTrack: (id) =>
      id === EXPORT_ID
        ? JSON.stringify([
            [42.1, -93.2, 3, 1000],
            [42.11, -93.21, 3, 2000],
            [42.12, -93.22, 3, 3000],
          ])
        : '[]',
  });
  globalThis.GolfNative = exportFake.bridge;
  const expectedPayload = await buildExportWithTracks(exportApp);
  const savedResult = await downloadExport(exportApp);
  const sharedResult = await shareExport(exportApp);
  const saveCalls = exportFake.calls.filter((c) => c[0] === 'saveExport');
  const sentPayload = JSON.parse(saveCalls[0][2]);
  delete globalThis.GolfNative;
  deleteRound(EXPORT_ID);

  test('the shell export hands the phone the same payload the download path builds', () => {
    eq(sentPayload.format, expectedPayload.format, 'format');
    eq(sentPayload.formatVersion, expectedPayload.formatVersion, 'formatVersion');
    eq(sentPayload.rounds.length, expectedPayload.rounds.length, 'rounds');
    eq(sentPayload.trackPoints, expectedPayload.trackPoints, 'trackPoints');
    assert(expectedPayload.trackPoints >= 3, 'the fixture track never reached the export');
    eq(sentPayload.tracks[EXPORT_ID].length, 3, 'the native track rode along under its round id');
  });

  test('both export buttons write the file once, and say where it went', () => {
    // SEND used to fall back to the download when the share sheet was absent.
    // In the shell there is no share sheet and no Downloads folder a WebView can
    // reach, so both buttons take the same path — and if `saved` were missing,
    // Settings would fall through and write a second file.
    eq(saveCalls.length, 2, 'one call per button, no fallback');
    assert(savedResult.saved?.startsWith('Download/golf-tracker/'), savedResult.saved);
    assert(sharedResult.saved?.startsWith('Download/golf-tracker/'), sharedResult.saved);
    eq(savedResult.rounds, expectedPayload.rounds.length, 'the count Matt is shown');
    eq(savedResult.trackPoints, expectedPayload.trackPoints, 'the fix count Matt is shown');
  });
}

/* ---------------------------------------------------------- the green flow */

/**
 * THE GREEN FLOW — mark the cup or the ball, hole out, the putts, the score.
 *
 * His words, 2026-09-15: *"Workflow on the green mark the cup or my ball first
 * whatever is easiest. Hole out - record the putt length for short putts,
 * double check GPS for long putts, enter hole score (once this is entered the
 * app needs to compute the shots and ask me questions about the lie."* And the
 * number, 2026-09-16: *"With the Green flow established at 20ft not 15"*.
 *
 * Driven through the real screen and the real sheets, because the rule is only
 * worth anything at the point where it stops a SAVE.
 */
export async function runGreenFlowTests() {
  group('the green flow (cup, ball, putts, score)');

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const openSheet = () => document.querySelector('.scrim .sheet');
  const sheetText = () => openSheet()?.textContent ?? '';
  const sheetButton = (re) =>
    [...(openSheet()?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent.trim()));
  const puttField = (n = 1) =>
    [...(openSheet()?.querySelectorAll('.field') ?? [])].find((f) =>
      new RegExp(`Putt ${n}`).test(f.querySelector('.label')?.textContent ?? '')
    );

  test(`the ${TYPED_PUTT_MAX_FT} ft rule decides who supplies the first putt`, () => {
    // His ruling, not a recommendation: docs/DECISIONS_LOG.md at a778194.
    eq(TYPED_PUTT_MAX_FT, 20, '"20ft not 15"');
    eq(firstPuttEntryMode({ gpsFt: 20 }), 'gps', 'at the threshold the measurement stands');
    eq(firstPuttEntryMode({ gpsFt: 60 }), 'gps', 'and past it');
    eq(firstPuttEntryMode({ gpsFt: 19.9 }), 'typed', 'a tenth under it is his to type');
    eq(firstPuttEntryMode({ gpsFt: 8 }), 'typed', 'a tap-in is never GPS');
    eq(firstPuttEntryMode({ gpsFt: null }), 'typed', 'nothing to measure between');
    eq(firstPuttEntryMode({}), 'typed', 'and no argument at all is not a measurement');
  });

  /** On the green: tee and approach marked, ball marked, cup `cupFt` away. */
  const greenScreen = ({ cupFt, marks = true }) => {
    const round = par4Round();
    const hl = round.holes[0];
    if (marks) {
      addShot(hl, { lie: 'tee', reduced: fakeReduced(TEE) });
      addShot(hl, { lie: 'fairway', reduced: fakeReduced(offsetM(TEE, 240, 5)) });
    }
    const ball = offsetM(TEE, 372, 1);
    addShot(hl, { lie: 'green', reduced: fakeReduced(ball) });
    setCup(hl, fakeReduced(offsetM(ball, feetToM(cupFt), 0)));
    const screen = playScreen({
      app: newAppState(),
      round,
      gps: heldGps(ball),
      params: {},
      go() {},
      persistRound() {},
      persistApp() {},
      startGps() {},
      stopGps() {},
      trackStats: () => null,
    });
    document.body.appendChild(screen.el);
    return {
      round,
      hl,
      screen,
      press: (re) =>
        [...screen.el.querySelectorAll('.footer button')].find((b) => re.test(b.textContent.trim()))?.click(),
    };
  };

  /* ---- 30 ft: the measurement stands ---- */
  const long = greenScreen({ cupFt: 30 });
  long.press(/^GREEN/);
  await wait();
  const longSheet = {
    readout: puttField()?.querySelector('.stat')?.textContent ?? '',
    saveDisabled: sheetButton(/^SAVE$/)?.disabled ?? null,
    usingGps: Boolean(sheetButton(/^USING GPS/)),
    stands: /GPS stands/.test(sheetText()),
  };
  sheetButton(/^SAVE$/)?.click();
  await wait();
  const longPutt = long.hl.shots.find((s) => s.lie === 'green');
  const longSaved = {
    distanceFt: longPutt?.distanceFt ?? null,
    marked: Boolean(longPutt?.mark),
    measuredFt: firstPuttM(long.hl) == null ? null : toFeet(firstPuttM(long.hl)),
    // He marked this hole's shots, so SAVE is the end of it: the marks ARE the
    // shots and there is nothing for the track to propose.
    sheetAfter: openSheet()?.querySelector('h2')?.textContent ?? null,
  };
  long.screen.el.remove();
  closeSheet();

  /* ---- 12 ft: his thumb, or nothing ---- */
  const short = greenScreen({ cupFt: 12 });
  short.press(/^GREEN/);
  await wait();
  const shortSheet = {
    saveDisabled: sheetButton(/^SAVE$/)?.disabled ?? null,
    saidTypeIt: /under 20 ft, type it/.test(sheetText()),
    usingGps: Boolean(sheetButton(/^USING GPS/)),
    readout: puttField()?.querySelector('.stat')?.textContent ?? '',
  };
  [...(puttField()?.querySelectorAll('.hole-jump button') ?? [])]
    .find((b) => b.textContent.trim() === '10')
    ?.click();
  await wait();
  const shortTyped = { saveDisabled: sheetButton(/^SAVE$/)?.disabled ?? null };
  sheetButton(/^SAVE$/)?.click();
  await wait();
  const shortSaved = { firstPuttFt: puttDistancesFt(short.hl)[0], complete: isHoleComplete(short.hl) };
  short.screen.el.remove();
  closeSheet();

  test('at 30 ft the GPS distance stands and SAVE needs nothing typed', () => {
    assert(/^30/.test(longSheet.readout), `putt 1 read "${longSheet.readout}"`);
    assert(/GPS/.test(longSheet.readout), `no provenance on the readout: "${longSheet.readout}"`);
    assert(longSheet.usingGps, 'the USING GPS control is not offered at 30 ft');
    assert(longSheet.stands, 'the sheet never says GPS stands at 20 ft and over');
    eq(longSheet.saveDisabled, false, 'SAVE was gated on a putt GPS can measure');
  });

  test('a GPS first putt is stored as a measurement, not as a number', () => {
    // No `distanceFt`: the mark and the cup ARE the distance, and writing a
    // rounded copy of it beside them is how a measurement turns into an entry.
    eq(longSaved.distanceFt, null, 'a typed distance was invented from the GPS reading');
    assert(longSaved.marked, 'the ball mark did not survive the green entry');
    near(longSaved.measuredFt, 30, 0.5, 'mark-to-cup');
  });

  /* ---- MARK BALL, from inside the sheet ---- */
  const ballRound = par4Round();
  const ballHole = ballRound.holes[0];
  const ballAt = offsetM(TEE, 372, 1);
  setCup(ballHole, fakeReduced(offsetM(TEE, 380, 1)));
  const ballGps = heldGps(ballAt);
  const ballScreen = playScreen({
    app: newAppState(),
    round: ballRound,
    gps: ballGps,
    params: {},
    go() {},
    persistRound() {},
    persistApp() {},
    startGps() {},
    stopGps() {},
    trackStats: () => null,
  });
  document.body.appendChild(ballScreen.el);
  [...ballScreen.el.querySelectorAll('.footer button')]
    .find((b) => /^GREEN/.test(b.textContent.trim()))
    ?.click();
  await wait();
  // Optional chaining throughout: against the old behaviour there is no ball
  // mark at all, and that has to read as a failed test, not a crashed run.
  const greenMark = () => ballHole.shots.find((s) => s.lie === 'green')?.mark ?? null;
  const beforeBall = { offered: Boolean(sheetButton(/^MARK BALL$/)) };
  sheetButton(/^MARK BALL$/)?.click();
  ballGps.endBurst();
  await wait();
  const firstBall = {
    greens: ballHole.shots.filter((s) => s.lie === 'green').length,
    marked: Boolean(ballHole.shots.find((s) => s.lie === 'green')?.mark),
    club: ballHole.shots.find((s) => s.lie === 'green')?.club,
    lieAsked: Boolean(document.querySelector('.lie-grid')),
    reopened: /putts/i.test(openSheet()?.querySelector('h2')?.textContent ?? ''),
    remarkOffered: Boolean(sheetButton(/^RE-MARK BALL$/)),
    fromM: greenMark() ? distanceM(greenMark(), ballAt) : null,
  };
  // A second mark: the coin was replaced two paces away, not a second putt.
  ballGps.at = offsetM(ballAt, 6, 0);
  sheetButton(/^RE-MARK BALL$/)?.click();
  ballGps.endBurst();
  await wait();
  const secondBall = {
    greens: ballHole.shots.filter((s) => s.lie === 'green').length,
    shots: ballHole.shots.length,
    movedM: greenMark() ? distanceM(greenMark(), ballAt) : null,
  };
  ballScreen.el.remove();
  closeSheet();

  /* ---- the whole hole, phone in the pocket: putts, score, then the shots ---- */

  /*
   * A real 1 Hz pocket track under the sheet, not a stub: the point of the
   * flow is that SAVE on the green leads to the score, the score leads to the
   * track's proposals, and the ball and the cup are still there afterwards.
   * Timestamps are anchored near now so `holeWindow` — which is bounded by
   * marks and by now — actually contains the track.
   */
  const pocketRound = par4Round();
  const pocketHl = pocketRound.holes[0];
  const pocketStart = Date.now() - 22 * 60 * 1000;
  const played = pocketHole({ startTs: pocketStart });
  pocketRound.id = 'r_test_green_flow';
  pocketRound.startedAt = new Date(pocketStart - 60000).toISOString();
  await deleteTrack(pocketRound.id);
  const trackWriter = createTrackWriter(pocketRound.id, { flushMs: 50, maxBuffer: 200 });
  for (const pt of played.points) trackWriter.push(pt);
  await trackWriter.close();

  // On the green: the ball marked at the coin, the cup 12 ft away — so the
  // first putt is his to type, which is also what carries into the card.
  const ballOnGreen = played.at(366);
  addShot(pocketHl, { lie: 'green', reduced: fakeReduced(ballOnGreen) });
  setCup(pocketHl, fakeReduced(offsetM(ballOnGreen, feetToM(12), 0)));
  const cupTs = pocketHl.cup.ts;
  const pocketScreen = playScreen({
    app: newAppState(),
    round: pocketRound,
    gps: heldGps(ballOnGreen),
    params: {},
    go() {},
    persistRound() {},
    persistApp() {},
    startGps() {},
    stopGps() {},
    trackStats: () => null,
  });
  document.body.appendChild(pocketScreen.el);
  [...pocketScreen.el.querySelectorAll('.footer button')]
    .find((b) => /^GREEN/.test(b.textContent.trim()))
    ?.click();
  await wait();
  [...(puttField()?.querySelectorAll('.hole-jump button') ?? [])]
    .find((b) => b.textContent.trim() === '10')
    ?.click();
  await wait();
  sheetButton(/^SAVE$/)?.click();
  await wait();
  const scoreCard = {
    title: openSheet()?.querySelector('h2')?.textContent ?? null,
    labels: [...(openSheet()?.querySelectorAll('.field .label') ?? [])].map((l) => l.textContent.trim()),
    summary: [...(openSheet()?.querySelectorAll('.note') ?? [])].map((n) => n.textContent).join(' | '),
    findsShots: Boolean(sheetButton(/^FIND MY SHOTS/)),
  };
  sheetButton(/^FIND MY SHOTS/)?.click();
  // The track comes out of IndexedDB, so this stage is a round trip.
  await wait(300);
  const confirmCards = [...(openSheet()?.querySelectorAll('.card') ?? [])];
  const confirm = { title: openSheet()?.querySelector('h2')?.textContent ?? null, cards: confirmCards.length };
  const rowHead = (i) => openSheet()?.querySelectorAll('.card.shot-row')[i]?.querySelector('h2')?.textContent ?? null;
  const rowText = [...(openSheet()?.querySelectorAll('.card.shot-row') ?? [])].map((c) => c.textContent).join(' | ');
  const head0 = rowHead(0);
  const headBefore = rowHead(1);
  [...(confirmCards[1]?.querySelectorAll('.seg-btn') ?? [])]
    .find((b) => /^fairway$/i.test(b.textContent.trim()))
    ?.click();
  await wait();
  const headAfter = rowHead(1);
  sheetButton(/^SAVE HOLE$/)?.click();
  await wait();
  const written = {
    lies: pocketHl.shots.map((s) => s.lie),
    seqs: pocketHl.shots.map((s) => s.seq),
    ballStillMarked: Boolean(pocketHl.shots.find((s) => s.lie === 'green')?.mark),
    ballMovedM: pocketHl.shots.find((s) => s.lie === 'green')?.mark
      ? distanceM(pocketHl.shots.find((s) => s.lie === 'green').mark, ballOnGreen)
      : null,
    cupTs: pocketHl.cup?.ts ?? null,
    firstPuttFt: puttDistancesFt(pocketHl)[0],
    strokes: holeStrokes(pocketHl),
    sources: pocketHl.shots.map((s) => s.source),
  };
  pocketScreen.el.remove();
  closeSheet();
  await deleteTrack(pocketRound.id);

  test('under 20 ft SAVE waits for the number', () => {
    eq(shortSheet.saveDisabled, true, 'SAVE would have saved a 12 ft putt GPS cannot measure');
    assert(shortSheet.saidTypeIt, `the sheet never asked for it: "${shortSheet.readout}"`);
    eq(shortSheet.usingGps, false, 'GPS is still offered as the answer under 20 ft');
    eq(shortTyped.saveDisabled, false, 'SAVE stayed disabled after a distance was tapped');
    eq(shortSaved.firstPuttFt, 10, 'the tapped distance is what was stored');
    eq(shortSaved.complete, true, 'the hole did not finish');
  });

  test('MARK BALL saves the ball on the green without asking a lie', () => {
    assert(beforeBall.offered, 'the sheet has no way to mark the ball');
    eq(firstBall.greens, 1, 'one putt-to-be on the green');
    assert(firstBall.marked, 'the ball was not marked');
    eq(firstBall.club, 'putter', 'a shot from the green is a putt');
    eq(firstBall.lieAsked, false, 'a lie card came up for a mark that says BALL on it');
    assert(firstBall.reopened, 'the sheet did not come back after the burst');
    assert(firstBall.fromM != null && firstBall.fromM < 1, `the mark landed ${firstBall.fromM} m from the burst`);
  });

  test('RE-MARK BALL moves the mark rather than adding a stroke', () => {
    assert(firstBall.remarkOffered, 'no RE-MARK BALL offered once a ball is marked');
    eq(secondBall.greens, 1, 'a second putt appeared out of a correction');
    eq(secondBall.shots, 1, 'the hole grew a shot he did not play');
    assert(secondBall.movedM != null, 'there is no ball mark to have moved');
    near(secondBall.movedM, 6, 0.5, 'the mark did not move to the new burst');
  });

  test('SAVE on an unmarked hole goes straight to the score, putts carried in', () => {
    assert(/how did it go/i.test(scoreCard.title ?? ''), `the sheet after SAVE was "${scoreCard.title}"`);
    assert(scoreCard.findsShots, 'no way on to the shots from the score card');
    assert(!scoreCard.labels.includes('Putts'), `the putts were asked twice: ${JSON.stringify(scoreCard.labels)}`);
    assert(
      !scoreCard.labels.some((l) => /First putt/i.test(l)),
      `the first putt was asked twice: ${JSON.stringify(scoreCard.labels)}`
    );
    assert(scoreCard.labels.includes('Strokes'), `no strokes field: ${JSON.stringify(scoreCard.labels)}`);
    // Two putts carried in against a default of 4 strokes: 2 full shots.
    assert(/2 full shots/.test(scoreCard.summary), `the card counted: "${scoreCard.summary}"`);
  });

  test('a hole he marked saves and stops there', () => {
    // The marked flow is unchanged: his marks ARE the shots, so there is
    // nothing to propose and no card to answer.
    eq(longSaved.sheetAfter, null, `SAVE opened "${longSaved.sheetAfter}" on a hole with marked shots`);
  });

  test('a track row shows no dwell, next stop or cart/foot - only shot, lie, distance to the hole', () => {
    assert(rowText, 'no shot rows on the confirm sheet');
    assert(!/stood|next stop|arrived/i.test(rowText), `the row still says: "${rowText}"`);
    // Shot 1 is the tee at the card yardage since v31 (docs/SPEC_shot-places.md 3.2).
    assert(/^Shot 1 - Lie = Tee Box, Distance to the hole = \d+ yd \(scorecard\)$/.test(head0 ?? ''), `row 1 reads "${head0}"`);
  });

  test('the row heading follows a lie tap', () => {
    // Before the tap the row shows whatever it holds (the course map may have
    // preselected a lie); it must not already read Fairway, or the tap proves nothing.
    // The distance may carry where the hole was read from: this synthetic green
    // is hundreds of yards from hole 1's green on the map, so its cup is passed
    // over (docs/SPEC_hole-position.md 3.2) and the row reads "(green centre)".
    const tail = String.raw`Distance to the hole = \d+ yd( \((green centre|pin sheet|ball on the green)\))?$`;
    assert(new RegExp(`^Shot 2 - Lie = (?!Fairway,)[^,]+, ${tail}`).test(headBefore ?? ''), `before: "${headBefore}"`);
    assert(new RegExp(`^Shot 2 - Lie = Fairway, ${tail}`).test(headAfter ?? ''), `after: "${headAfter}"`);
    eq(headAfter.split(', ')[1], headBefore.split(', ')[1], 'the distance changed with the lie');
  });

  test('SAVE HOLE keeps the ball mark and the cup', () => {
    assert(/confirm your shots/i.test(confirm.title ?? ''), `the shots stage was "${confirm.title}"`);
    assert(confirm.cards >= 2, `${confirm.cards} shots proposed from the pocket track`);
    eq(JSON.stringify(written.lies), JSON.stringify(['tee', 'fairway', 'green', 'green']), 'the hole as written');
    eq(JSON.stringify(written.seqs), JSON.stringify([1, 2, 3, 4]), 'shot numbers');
    assert(written.ballStillMarked, 'the hole write dropped the ball mark — the first putt is no longer measured');
    assert(written.ballMovedM != null && written.ballMovedM < 1, `the ball mark moved ${written.ballMovedM} m`);
    eq(written.cupTs, cupTs, 'the marked cup was replaced');
    eq(written.firstPuttFt, 10, 'the typed first putt');
    eq(written.strokes, 4, 'two full shots and two putts');
    // Shot 1 off the map, shot 2 off the track (docs/SPEC_shot-places.md 3.4).
    eq(JSON.stringify(written.sources), JSON.stringify(['map', 'track', 'gps', 'manual']), 'provenance');
  });
}

export function getResults() {
  return results;
}

/* --------------------------------------------- ENTER SCORE is the main button */

/**
 * Matt, 2026-09-26, on the play screen of a fresh hole in the native app:
 * "there is a gigantic blank spot in the middle of the screen, a bold green
 * mark tee shot larger than everything, then the most important thing I
 * wanted to test - auto entry. Make it the main button in the center of the
 * page that is blank title "Enter Score"".
 *
 * END-OF-HOLE ENTRY was last in the footer and only on a hole with no marks;
 * on his 09-23 hole 3 (one tee mark) it did not exist. ENTER SCORE is in the
 * body on every hole and opens the same score card.
 */
export async function runEnterScoreTests() {
  group('ENTER SCORE is the main button on every hole');

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const round = par4Round();
  const hl = round.holes[0];
  const gps = heldGps(TEE);
  const screen = playScreen({
    app: newAppState(),
    round,
    gps,
    params: {},
    go() {},
    persistRound() {},
    persistApp() {},
    startGps() {},
    stopGps() {},
    trackStats: () => null,
  });
  document.body.appendChild(screen.el);

  const enter = () =>
    [...screen.el.querySelectorAll('.body button')].find((b) => b.textContent.trim() === 'ENTER SCORE') ?? null;
  const footerTexts = () => [...screen.el.querySelectorAll('.footer button')].map((b) => b.textContent.trim());
  const sheetTitle = () => document.querySelector('.scrim .sheet')?.textContent ?? '';
  const closeSheets = () => {
    for (const s of document.querySelectorAll('.scrim')) s.remove();
  };

  // An empty hole.
  const empty = { btn: enter(), primary: enter()?.classList.contains('primary') ?? false, footer: footerTexts() };
  enter()?.click();
  await wait();
  const opened = /how did it go/i.test(sheetTitle());
  closeSheets();

  // The tee shot marked: the hole 3 of 09-23 that had no entry at all.
  [...screen.el.querySelectorAll('.footer button')].find((b) => /^MARK TEE SHOT$/.test(b.textContent.trim()))?.click();
  const duringBurst = enter();
  gps.endBurst();
  await wait();
  const marked = { count: hl.shots.length, btn: enter(), footer: footerTexts() };
  const afterList = marked.btn?.closest('.enter-score')?.previousElementSibling?.classList.contains('shots') ?? false;
  enter()?.click();
  await wait();
  const openedMarked = /how did it go/i.test(sheetTitle());
  closeSheets();
  screen.el.remove();

  // A hand-entered hole.
  const manualRound = par4Round();
  manualRound.holes[0].manual = { strokes: 4, putts: 2 };
  const manualScreen = playScreen({
    app: newAppState(),
    round: manualRound,
    gps: heldGps(TEE),
    params: {},
    go() {},
    persistRound() {},
    persistApp() {},
    startGps() {},
    stopGps() {},
    trackStats: () => null,
  });
  document.body.appendChild(manualScreen.el);
  const manualBtn = [...manualScreen.el.querySelectorAll('.body button')].find((b) => b.textContent.trim() === 'ENTER SCORE') ?? null;
  const manual = { present: Boolean(manualBtn), disabled: manualBtn?.disabled ?? true };
  manualScreen.el.remove();
  closeSheets();

  test('on an empty hole ENTER SCORE is in the body, primary, and opens the score card', () => {
    assert(empty.btn, 'no ENTER SCORE button in the body');
    assert(empty.primary, 'ENTER SCORE is not the primary style');
    assert(opened, `tapping it did not open the score card (sheet: ${JSON.stringify(sheetTitle())})`);
  });

  test('on a hole with a stroke mark it is there too, under the shot list, and opens the score card', () => {
    assert(marked.count === 1, `expected the tee shot marked, have ${marked.count} shots`);
    assert(marked.btn, 'no ENTER SCORE on a hole with one mark');
    assert(afterList, 'ENTER SCORE is not directly under the shot list');
    assert(openedMarked, 'tapping it on a marked hole did not open the score card');
    assert(duringBurst == null, 'ENTER SCORE rendered while the capture card was up');
  });

  test('END-OF-HOLE ENTRY is no longer in the footer', () => {
    for (const texts of [empty.footer, marked.footer]) {
      assert(!texts.some((t) => /END-OF-HOLE/.test(t)), `footer: ${JSON.stringify(texts)}`);
    }
  });

  test('on a hand-entered hole ENTER SCORE is disabled', () => {
    assert(!manual.present || manual.disabled, 'ENTER SCORE is live on a hand-entered hole');
  });
}

/*
 * Part B of docs/SPEC_course-geometry.md: the HUD's second line reads the
 * course map's front / centre / back for the hole being viewed.
 */
export async function runGreenDistanceTests() {
  group('distance to green (play screen)');

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const G = courseGeometry(VEENKER);
  const hole1 = G.holes.find((x) => x.number === 1);
  const teeC = ringCentroid(G.polygons.find((p) => p.id === hole1.teeIds[0]).ring);
  const mount = (round, gps) => {
    const screen = playScreen({
      app: newAppState(),
      round,
      gps,
      params: {},
      go() {},
      persistRound() {},
      persistApp() {},
      startGps() {},
      stopGps() {},
      trackStats: () => null,
    });
    document.body.appendChild(screen.el);
    return screen;
  };

  const gps = heldGps(teeC);
  const screen = mount(par4Round(), gps);
  await wait();
  const line = () => screen.el.querySelector('.hud-green')?.textContent ?? null;
  const onFix = line();
  /*
   * Matt, 2026-09-27: "I never saw them yesterday". The line's sizes and its
   * fit at 360 px, read with the shipped stylesheet on a three-digit readout.
   */
  const css = await fetch('../css/base.css').then((r) => r.text());
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  Object.assign(screen.el.style, { position: 'fixed', left: '0', top: '0', width: '360px', height: '728px' });
  const gl = screen.el.querySelector('.hud-green');
  gl.querySelector('strong').textContent = '488';
  for (const b of gl.querySelectorAll('b')) b.textContent = '503';
  gl.querySelector('small').textContent = ' · ±12 yd';
  const big = {
    centre: getComputedStyle(gl.querySelector('strong')).fontSize,
    fb: [...gl.querySelectorAll('b')].map((b) => getComputedStyle(b).fontSize),
    letters: [...gl.querySelectorAll('.g-lbl')].map((x) => getComputedStyle(x).color),
    ink: getComputedStyle(gl.querySelector('strong')).color,
    spill: gl.scrollWidth - gl.clientWidth,
    right: gl.querySelector('small').getBoundingClientRect().right,
    edge: gl.getBoundingClientRect().right,
  };
  style.remove();
  Object.assign(screen.el.style, { position: '', left: '', top: '', width: '', height: '' });
  const g = toGreen(G, 1, { lat: gps.last.lat, lon: gps.last.lon, accuracyM: gps.last.acc });
  const expected = `GREEN ${g.centreYd} · F ${g.frontYd} · B ${g.backYd} · ±${g.uncertaintyYd} yd`;
  gps.last = null;
  [...screen.el.querySelectorAll('.holenav-arrow')].find((b) => /›/.test(b.textContent))?.click();
  await wait();
  const noFix = line();
  screen.el.remove();

  const rad = mount(createRound({ course: RADCLIFFE, teeSet: 'white', startingNine: 'front', type: 'practice' }), heldGps(teeC));
  await wait();
  const radEl = rad.el.querySelector('.hud-green');
  rad.el.remove();
  for (const s of document.querySelectorAll('.scrim')) s.remove();

  test("on a Veenker round the HUD reads hole 1's green from the tee", () => {
    eq(onFix, expected, 'green line');
  });

  test('the green line reads at arm length: centre 40 px, F and B 24 px, full ink, no clip at 360 px', () => {
    eq(big.centre, '40px', 'centre number');
    eq(JSON.stringify(big.fb), JSON.stringify(['24px', '24px']), 'F and B numbers');
    assert(big.letters.every((c) => c === big.ink), `letters are not in full ink: ${JSON.stringify(big.letters)} vs ${big.ink}`);
    assert(big.spill <= 0, `the line overflows by ${big.spill} px`);
    assert(big.right <= big.edge, `"yd" ends at ${big.right} px, the line at ${big.edge}`);
  });

  test('with no current fix it says so', () => {
    eq(noFix, 'GREEN — · no fix', 'green line');
  });

  test('on Radcliffe there is no green line at all', () => {
    eq(radEl, null, '.hud-green');
  });
}

/* ------------------------------ end-of-hole shots: the tee and the places */

/**
 * docs/SPEC_shot-places.md Section 7. Matt, 2026-09-28, on the 2026-09-27
 * round: hole 14 *"Could not find the tee shot - needs to default to the
 * scorecard could not find the next shot either."*; hole 12 *"here I hit the
 * mark tee shot and could not undo it"*; and *"it will not always be the
 * longest stop that is the actual shot. many times in golf you are waiting"*.
 *
 * Veenker hole 1 (gold, 419 yd) off the real course map, a 1 Hz pocket track
 * in IndexedDB, and the real screen and sheets from ENTER SCORE to SAVE HOLE.
 */
export async function runShotPlacesTests() {
  group('end-of-hole shots: the tee from the map, places on the hole');

  const realSetTimeout = globalThis.setTimeout;
  const wait = (ms = 30) => new Promise((r) => realSetTimeout(r, ms));
  const G = courseGeometry(VEENKER);
  const poly = (id) => G.polygons.find((p) => p.id === id);
  const h1 = G.holes.find((x) => x.number === 1);
  const teeBox = ringCentroid(poly(199287763).ring); // hole 1's box, blue and gold
  const green = ringCentroid(poly(h1.greenId).ring);
  const along = (f) => ({ lat: teeBox.lat + (green.lat - teeBox.lat) * f, lon: teeBox.lon + (green.lon - teeBox.lon) * f });
  // Rough 25 m north of hole 2's gold box: the map's nearest hole there is 2.
  const nextTeeGround = offsetPoint(ringCentroid(poly(199288724).ring), { north: 25 });
  const fairway = ringCentroid(poly(h1.fairwayIds[0]).ring);
  const toCentre = (yd, turn) => {
    const r = ((bearingDeg(green, teeBox) + turn) * Math.PI) / 180;
    return offsetPoint(green, { north: yd * 0.9144 * Math.cos(r), east: yd * 0.9144 * Math.sin(r) });
  };

  const openSheet = () => document.querySelector('.scrim .sheet');
  const sheetButton = (re) => [...(openSheet()?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent.trim()));
  const rows = (kind) =>
    [...(openSheet()?.querySelectorAll('.card.shot-row') ?? [])].filter((c) => !kind || c.dataset.kind === kind);
  const head = (card) => card?.querySelector('h2')?.textContent ?? null;
  const others = () => [...(openSheet()?.querySelectorAll('.other-places button') ?? [])];
  const inCard = (card, re) => [...(card?.querySelectorAll('button') ?? [])].find((b) => re.test(b.textContent.trim()));

  /** A 1 Hz pocket track: `s` seconds standing at each point, a cart at 6 m/s between. */
  const track = (stops, startTs) => {
    const pts = [];
    const jit = [0.6, -0.5, 0.3, -0.7, 0.4, 0.2, -0.4, 0.5];
    let ts = startTs;
    let j = 0;
    stops.forEach(({ pt, s }, k) => {
      for (let i = 0; i < s; i++) {
        const p = offsetM(pt, jit[j++ % 8], jit[(j + 3) % 8]);
        pts.push({ lat: p.lat, lon: p.lon, acc: 3.4, ts, speed: 0 });
        ts += 1000;
      }
      const next = stops[k + 1]?.pt;
      if (!next) return;
      const steps = Math.max(3, Math.ceil(distanceM(pt, next) / 6));
      for (let i = 1; i < steps; i++) {
        const f = i / steps;
        pts.push({ lat: pt.lat + (next.lat - pt.lat) * f, lon: pt.lon + (next.lon - pt.lon) * f, acc: 3.4, ts, speed: 6 });
        ts += 1000;
      }
    });
    return { points: pts, endTs: ts };
  };

  /** Hole 1 of a Veenker gold round over `stops`, mounted, the track in IndexedDB. */
  const scenario = async (id, stops, before) => {
    const round = par4Round();
    round.id = id;
    const startTs = Date.now() - 30 * 60 * 1000;
    round.startedAt = new Date(startTs - 60000).toISOString();
    await deleteTrack(id);
    if (stops.length) {
      const w = createTrackWriter(id, { flushMs: 50, maxBuffer: 1000 });
      for (const p of track(stops, startTs).points) w.push(p);
      await w.close();
    }
    const app = newAppState();
    const gps = heldGps(teeBox);
    const hl = round.holes[0];
    before?.({ round, hl });
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
      trackStats: () => null,
    });
    document.body.appendChild(screen.el);
    const done = async () => {
      screen.el.remove();
      for (const s of document.querySelectorAll('.scrim')) s.remove();
      await deleteTrack(id);
    };
    return { round, hl, app, gps, screen, startTs, done };
  };

  /** ENTER SCORE, the strokes, FIND MY SHOTS: the shots stage, read off IndexedDB. */
  const toShots = async (s, strokes) => {
    [...s.screen.el.querySelectorAll('.body button')].find((b) => b.textContent.trim() === 'ENTER SCORE')?.click();
    await wait();
    const f = [...(openSheet()?.querySelectorAll('.field') ?? [])].find((x) => x.querySelector('.label')?.textContent === 'Strokes');
    const plus = [...(f?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === '+');
    for (let i = Number(f?.querySelector('.v')?.textContent ?? strokes); i < strokes; i++) plus?.click();
    sheetButton(/^FIND MY SHOTS/)?.click();
    await wait(400);
  };

  /* ---- A: twelve stops on hole 1, a 5 with 2 putts: 3 full shots ---- */
  const A = await scenario('r_test_shot_places_a', [
    { pt: along(0), s: 60 }, // on the tee box
    { pt: along(0.1), s: 20 },
    { pt: along(0.2), s: 30 },
    { pt: along(0.3), s: 70 },
    { pt: along(0.4), s: 25 },
    { pt: along(0.5), s: 40 },
    { pt: along(0.6), s: 18 },
    { pt: along(0.7), s: 50 },
    { pt: along(0.8), s: 22 },
    { pt: along(0.9), s: 35 },
    { pt: along(1), s: 45 }, // on the green
    { pt: nextTeeGround, s: 90 }, // walked off toward the 2nd
  ]);
  await toShots(A, 5);
  const a = {
    teeHead: head(rows('tee')[0]),
    teeHasNotAShot: Boolean(inCard(rows('tee')[0], /^NOT A SHOT$/)),
    teeLieButtons: rows('tee')[0]?.querySelectorAll('.seg-btn').length ?? null,
    places: rows('place').length,
    others: others().length,
    trackCup: /Where the hole was/i.test(openSheet()?.textContent ?? ''),
  };
  others()[0]?.click();
  await wait();
  a.afterAdd = { places: rows('place').length, others: others().length };
  inCard(rows('place').find((c) => c.dataset.added === 'true'), /^NOT A SHOT$/)?.click();
  await wait();
  a.afterReturn = { places: rows('place').length, others: others().length };
  // Shot 3: the phone was not where the ball was.
  inCard(rows('place')[1], /^BALL NOT HERE$/)?.click();
  await wait();
  const yards = rows('typed')[0]?.querySelector('input');
  if (yards) {
    yards.value = '140';
    yards.dispatchEvent(new Event('input'));
  }
  [...(rows('typed')[0]?.querySelectorAll('.seg-btn') ?? [])].find((b) => /^rough$/i.test(b.textContent.trim()))?.click();
  await wait();
  a.typedHead = head(rows('typed')[0]);
  sheetButton(/^SAVE HOLE$/)?.click();
  await wait();
  const a1 = A.hl.shots[0];
  const a3 = A.hl.shots[2];
  const aSaved = {
    lies: A.hl.shots.map((s) => s.lie),
    tee: { source: a1?.source, method: a1?.mark?.method ?? null, fromBoxM: a1?.mark ? distanceM(a1.mark, teeBox) : null },
    learnedLive: A.app.courseLearning?.veenker?.tees?.[1] ?? null,
    typed: { source: a3?.source, mark: a3?.mark, entry: a3?.distanceEntry ?? null, ft: a3?.distanceFt ?? null },
    cup: A.hl.cup,
  };
  // The course model, rebuilt from a played round whose shot 1 came off the map.
  const played = JSON.parse(JSON.stringify(A.round));
  for (const x of played.holes.slice(1, 5)) x.manual = { strokes: 4, putts: 2, firstPuttFt: null, penalties: 0 };
  played.startedAt = new Date(Date.now() - 3600e3).toISOString();
  played.completedAt = new Date().toISOString();
  const app2 = newAppState();
  app2.rounds = [{ id: played.id }];
  rebuildCourseLearning(app2, () => played);
  aSaved.rebuilt = { played: isPlayedRound(played), tee: app2.courseLearning?.veenker?.tees?.[1] ?? null };
  await A.done();

  /* ---- B: 150 yd, then 170 yd: the ball went backwards ---- */
  const B = await scenario('r_test_shot_places_b', [
    { pt: toCentre(150, 0), s: 40 },
    { pt: toCentre(170, -20), s: 40 },
  ]);
  await toShots(B, 5);
  const b = {
    heads: rows().map(head),
    save: sheetButton(/SAVE HOLE|unaccounted|PICK A LIE|ENTER THE|too many/i),
    banners: [...(openSheet()?.querySelectorAll('.banner') ?? [])].map((x) => x.textContent),
  };
  b.saveText = b.save?.textContent ?? null;
  b.saveDisabled = b.save?.disabled ?? null;
  b.save?.click();
  await wait();
  b.full = B.hl.shots.filter((s) => s.lie !== 'green').length;
  b.complete = isHoleComplete(B.hl);
  await B.done();

  /* ---- C: he marked the tee himself ---- */
  const C = await scenario('r_test_shot_places_c', [
    { pt: along(0), s: 30 },
    { pt: along(0.5), s: 60 },
    { pt: along(1), s: 40 },
  ]);
  [...C.screen.el.querySelectorAll('.footer button')].find((x) => /^MARK TEE SHOT$/.test(x.textContent.trim()))?.click();
  C.gps.endBurst();
  await wait();
  const his = C.hl.shots[0];
  // Taken as he teed off, which is where this track starts.
  if (his?.mark) his.mark.ts = new Date(C.startTs).toISOString();
  await toShots(C, 4);
  const c = { head: head(rows()[0]), kind: rows()[0]?.dataset.kind ?? null };
  sheetButton(/^SAVE HOLE$/)?.click();
  await wait();
  c.firstId = C.hl.shots[0]?.id ?? null;
  c.firstSource = C.hl.shots[0]?.source ?? null;
  c.hisId = his?.id ?? null;
  await C.done();

  /* ---- D: the cup marked from the green sheet, then thirty seconds ---- */
  const D = await scenario('r_test_shot_places_d', [], ({ hl }) => {
    addShot(hl, { lie: 'tee', reduced: fakeReduced(teeBox) });
  });
  const realClear = globalThis.clearTimeout;
  const clock = { now: 0, seq: 1, q: new Map() };
  const d = {};
  globalThis.setTimeout = (fn, ms = 0, ...args) => {
    const id = `fake${clock.seq++}`;
    clock.q.set(id, { fn: () => fn(...args), at: clock.now + (ms || 0) });
    return id;
  };
  globalThis.clearTimeout = (id) => (clock.q.has(id) ? clock.q.delete(id) : realClear(id));
  try {
    [...D.screen.el.querySelectorAll('.footer button')].find((x) => /^GREEN/.test(x.textContent.trim()))?.click();
    await wait();
    sheetButton(/^MARK CUP$/)?.click();
    D.gps.at = along(0.99);
    D.gps.endBurst();
    await wait();
    d.cupMarked = Boolean(D.hl.cup);
    d.stamped = Boolean(D.hl.completedAt);
    // Thirty seconds of the test clock: every timer due by then fires.
    clock.now += 30000;
    for (const [id, t] of [...clock.q.entries()].sort((x, y) => x[1].at - y[1].at)) {
      if (t.at <= clock.now && clock.q.has(id)) {
        clock.q.delete(id);
        t.fn();
      }
    }
    await wait();
    d.inSheet = Boolean(sheetButton(/^UNDO$/));
    d.onScreen = Boolean(D.screen.el.querySelector('.banner[data-kind="ok"] button'));
    sheetButton(/^UNDO$/)?.click();
    await wait();
    d.after = { cup: D.hl.cup, completedAt: D.hl.completedAt, complete: isHoleComplete(D.hl), shots: D.hl.shots.length };
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClear;
  }
  await D.done();

  /* ---- the picker alone ---- */
  const t0 = 1_700_000_000_000;
  const grouped = track([{ pt: nextTeeGround, s: 40 }, { pt: along(0.5), s: 40 }], t0);
  const g = proposeHoleShots(grouped.points, { fullShots: 1, fromTs: t0, toTs: grouped.endTs, geometry: G, holeNumber: 1, teeYd: 419 });
  const waited = track([{ pt: nextTeeGround, s: 500 }, { pt: fairway, s: 40 }, { pt: along(1), s: 30 }], t0);
  const w = proposeHoleShots(waited.points, { fullShots: 1, fromTs: t0, toTs: waited.endTs, geometry: G, holeNumber: 1, teeYd: 419 });

  /* ---- revision 4.2 (spec Section 11): the pool ---- */
  const toward = (from, to, m) => {
    const r = (bearingDeg(from, to) * Math.PI) / 180;
    return offsetPoint(from, { north: m * Math.cos(r), east: m * Math.sin(r) });
  };
  // R1: 20 m from the map tee toward the green, off the box (rough).
  const besideTee = toward(teeBox, green, 20);
  const r1Track = track([{ pt: besideTee, s: 60 }, { pt: fairway, s: 40 }], t0);
  const r1 = proposeHoleShots(r1Track.points, {
    fullShots: 2, fromTs: t0, toTs: r1Track.endTs, geometry: G, holeNumber: 1, teeYd: 419, teePos: teeBox,
  });
  const r1Stop = r1.places?.find((p) => distanceM(p, besideTee) < 5) ?? null;
  // R2: 2 m inside hole 1's green on the tee side, a stop whose centre is
  // known to 5 m (10 m spread over 40 s: 10 / sqrt(40 / 10)).
  let edgeD = 0;
  while (pointInRing(toward(green, teeBox, edgeD + 0.1), poly(h1.greenId).ring)) edgeD += 0.1;
  const fringe = toward(green, teeBox, edgeD - 2);
  const r2Pts = track([{ pt: fairway, s: 40 }], t0).points;
  let r2Ts = r2Pts[r2Pts.length - 1].ts + 120000; // a dropout: two clusters, no walk between
  const spreadAt = (n) => offsetPoint(fringe, { north: n });
  for (let i = 0; i < 11; i++) r2Pts.push({ ...spreadAt(0), acc: 5, ts: (r2Ts += 1000), speed: 0 });
  for (let i = 0; i < 15; i++) {
    r2Pts.push({ ...spreadAt(10), acc: 5, ts: (r2Ts += 1000), speed: 0 });
    r2Pts.push({ ...spreadAt(-10), acc: 5, ts: (r2Ts += 1000), speed: 0 });
  }
  const r2 = proposeHoleShots(r2Pts, { fullShots: 2, fromTs: t0, toTs: r2Ts, geometry: G, holeNumber: 1, teeYd: 419 });
  const r2Stop = r2.places?.find((p) => distanceM(p, fringe) < 3) ?? null;
  // R3: rough between hole 1 and hole 14, which runs beside it: the map's
  // nearest hole is 14 and hole 1 is 10 m farther.
  const shared = offsetPoint(green, { north: 105, east: -75 });
  const r3Track = track([{ pt: shared, s: 40 }], t0);
  const r3 = proposeHoleShots(r3Track.points, { fullShots: 1, fromTs: t0, toTs: r3Track.endTs, geometry: G, holeNumber: 1, teeYd: 419 });

  test('1. shot 1 is the tee at the scorecard yardage, and the track is asked for the rest', () => {
    eq(a.teeHead, 'Shot 1 - Lie = Tee Box, Distance to the hole = 419 yd (scorecard)', 'row 1');
    eq(a.teeHasNotAShot, false, 'row 1 offers NOT A SHOT');
    eq(a.teeLieButtons, 0, 'row 1 offers lie buttons');
    eq(a.places, 2, 'places proposed for 3 full shots');
  });

  test('2. a tee he marked with MARK TEE SHOT is shot 1, untouched', () => {
    eq(c.kind, 'tee', 'row 1');
    assert(/^Shot 1 - Lie = Tee Box, Distance to the hole = \d+ yd \(green centre\)$/.test(c.head ?? ''), `row 1 reads "${c.head}"`);
    assert(c.hisId, 'the tee mark was not taken');
    eq(c.firstId, c.hisId, 'shot 1 after SAVE HOLE');
    eq(c.firstSource, 'gps', 'its source');
  });

  test('3. the map tee is stored as the map, and the course is not taught from it', () => {
    eq(aSaved.tee.source, 'map', 'shot 1 source');
    eq(aSaved.tee.method, 'map', 'shot 1 mark.method');
    assert(aSaved.tee.fromBoxM != null && aSaved.tee.fromBoxM < 1, `shot 1 is ${aSaved.tee.fromBoxM} m from the gold box centre`);
    eq(aSaved.learnedLive, null, 'learnTee ran on SAVE HOLE');
    assert(aSaved.rebuilt.played, 'fixture: the round does not count as played');
    eq(aSaved.rebuilt.tee, null, 'the rebuilt course model learned the map tee');
  });

  test('4. every stop in the window is reachable: 12 stops, 2 wanted, 10 under OTHER PLACES', () => {
    eq(a.others, 10, 'OTHER PLACES entries');
    eq(JSON.stringify(a.afterAdd), JSON.stringify({ places: 3, others: 9 }), 'after tapping one');
    eq(JSON.stringify(a.afterReturn), JSON.stringify({ places: 2, others: 10 }), 'NOT A SHOT returns it to the list');
  });

  test("5. a stop on another hole's ground is listed after this hole's, not dropped", () => {
    const other = g.places?.find((p) => distanceM(p, nextTeeGround) < 12);
    const own = g.places?.findIndex((p) => distanceM(p, along(0.5)) < 12) ?? -1;
    assert(other, 'the stop on hole 2 ground is not in the list');
    eq(other.place?.ground, 'other', 'its ground');
    assert(own >= 0 && g.places.indexOf(other) > own, 'it is listed before the stop on this hole');
  });

  test('6. dwell does not choose: a 40 s stop in the fairway beats a 500 s wait by the next tee', () => {
    eq(w.proposed.length, 1, 'proposed');
    near(distanceM(w.proposed[0], fairway), 0, 12, 'the preselected place is the fairway stop');
  });

  test('7. farther from the hole than the shot before saves, with no warning', () => {
    assert(/= 150 yd \(green centre\)$/.test(b.heads[1] ?? ''), `shot 2 reads "${b.heads[1]}"`);
    assert(/= 170 yd \(green centre\)$/.test(b.heads[2] ?? ''), `shot 3 reads "${b.heads[2]}"`);
    eq(b.saveText, 'SAVE HOLE', 'the save button');
    eq(b.saveDisabled, false, 'SAVE HOLE is blocked');
    eq(b.banners.length, 0, `warned: ${JSON.stringify(b.banners)}`);
    eq(b.full, 3, 'full shots saved');
    eq(b.complete, true, 'the hole is not complete');
  });

  test('8. BALL NOT HERE: typed 140 yd, rough, stored as a hand-entered shot', () => {
    eq(a.typedHead, 'Shot 3 - Lie = Rough, Distance to the hole = 140 yd (entered)', 'the typed row');
    eq(aSaved.typed.source, 'manual', 'source');
    eq(aSaved.typed.mark, null, 'mark');
    eq(
      JSON.stringify(aSaved.typed.entry && { value: aSaved.typed.entry.value, unit: aSaved.typed.entry.unit }),
      JSON.stringify({ value: 140, unit: 'yards' }),
      'distanceEntry'
    );
    eq(aSaved.typed.ft, 420, 'distanceFt');
    eq(aSaved.lies.length, 5, `the hole as written: ${JSON.stringify(aSaved.lies)}`);
  });

  test('9. no cup from the track: no "Where the hole was", and hl.cup stays null', () => {
    eq(a.trackCup, false, "the sheet offers the track's cup");
    eq(aSaved.cup, null, 'hl.cup after SAVE HOLE');
  });

  test('10. UNDO of a cup marked from the green sheet is still there after 30 s, and restores the hole', () => {
    assert(d.cupMarked && d.stamped, `fixture: cup ${d.cupMarked}, completedAt ${d.stamped}`);
    assert(d.inSheet, 'no UNDO in the green sheet');
    assert(d.onScreen, 'no UNDO on the play screen after 30 s');
    assert(d.after, 'the scenario did not finish');
    eq(d.after.cup, null, 'the cup after UNDO');
    eq(d.after.completedAt, null, 'completedAt after UNDO');
    eq(d.after?.complete, false, 'the hole is complete');
    eq(d.after?.shots, 1, 'the tee shot');
  });

  test('11. (4.2 R1) a stop 20 m from the map tee is not preselected, and is in the list', () => {
    assert(r1Stop, 'the stop beside the tee is not in the list');
    near(distanceM(r1Stop, teeBox), 20, 2, 'fixture: its distance from the map tee');
    eq(r1Stop.place?.onTee, false, 'fixture: the map reads it as on the tee box');
    eq(r1Stop.place?.ground, 'own', 'fixture: its ground');
    assert(!r1.proposed.includes(r1Stop), 'the stop beside the tee was preselected');
    eq(r1.proposed.length, 1, 'proposed');
    near(distanceM(r1.proposed[0], fairway), 0, 12, 'the preselected place is the fairway stop');
  });

  test('12. (4.2 R2) a stop 2 m inside the green with 5 m accuracy is in the pool', () => {
    assert(r2Stop, 'the fringe stop is not in the list');
    near(candidateAccuracyM(r2Stop), 5, 0.3, 'fixture: its accuracy, m');
    const said = lieAt(G, { lat: r2Stop.lat, lon: r2Stop.lon });
    eq(said?.lie, 'green', 'fixture: the map lie');
    near(said?.edgeM ?? NaN, 2, 0.5, 'fixture: metres inside the green edge');
    eq(r2Stop.place?.onGreen, false, 'onGreen');
    eq(r2.proposed.length, 2, 'proposed');
    assert(r2.proposed.includes(r2Stop), 'the fringe stop was left out of the pool');
  });

  test("13. (4.2 R3) a stop 10 m nearer hole 14's line than hole 1's is on hole 1's ground", () => {
    const n = nearestHole(G, { ...shared, accuracyM: 3 }, { maxM: 500 });
    eq(n?.hole, 14, 'fixture: the nearest hole');
    eq(n?.runnerUp?.hole, 1, 'fixture: the runner-up');
    near(n?.marginM ?? NaN, 10, 1.5, 'fixture: the margin, m');
    eq(r3.places?.length, 1, 'stops in the list');
    eq(r3.places?.[0]?.place?.ground, 'own', 'its ground');
  });
}

/* ------------------------------------------- the PIN SHEET sheet (D1 Part B) */

/**
 * docs/SPEC_hole-position.md Section 9. Matt, 2026-09-28: *"D1. map center
 * with the option for me to correct it manually by entering tournament pin
 * sheet numbers."* The real play screen, the real round summary and their
 * sheets, over Veenker's course map; Radcliffe has no map.
 */
export async function runPinSheetTests() {
  group('the pin sheet (D1 Part B)');

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const G = courseGeometry(VEENKER);
  const PACE_M = (ft) => ft * 0.3048;
  const openSheet = () => document.querySelector('.scrim .sheet');
  const title = () => openSheet()?.querySelector('h2')?.textContent ?? null;
  const closeAll = () => {
    for (const s of document.querySelectorAll('.scrim')) s.remove();
  };
  const row = (n) => openSheet()?.querySelector(`.pin-row[data-hole="${n}"]`) ?? null;
  const input = (n, f) => row(n)?.querySelector(`input[data-f="${f}"]`) ?? null;
  const type = (el, v) => {
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input'));
  };
  const side = (n, s) => [...(row(n)?.querySelectorAll('.pin-side button') ?? [])].find((b) => b.dataset.side === s)?.click();
  const readout = (n) => {
    const p = row(n)?.querySelector('.pin-readout');
    return p && !p.hidden ? { text: p.textContent, warn: p.dataset.warn === 'true' } : null;
  };
  const save = () => openSheet()?.querySelector('.pin-save button')?.click();
  const radRound = () => createRound({ course: RADCLIFFE, teeSet: 'white', startingNine: 'front', type: 'practice' });

  /** The play screen: live on `round`, or in edit mode with `params.roundId` (the round in storage). */
  const mount = (round, { params = {}, app = newAppState() } = {}) => {
    const saved = [];
    const screen = playScreen({
      app,
      round: params.roundId ? null : round,
      gps: heldGps(TEE),
      params,
      go() {},
      persistRound(r) {
        saved.push(r ?? round);
      },
      persistApp() {},
      startGps() {},
      stopGps() {},
      trackStats: () => null,
    });
    document.body.appendChild(screen.el);
    return {
      screen,
      saved,
      done: () => {
        screen.el.remove();
        closeAll();
      },
    };
  };
  /** The Round menu's Pin sheet: true when it was there to tap. */
  const menuPinSheet = async (screen) => {
    screen.el.querySelector('button[aria-label="Round menu"]')?.click();
    await wait();
    const btn = [...(openSheet()?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === 'Pin sheet') ?? null;
    btn?.click();
    await wait();
    if (!btn) closeAll();
    return Boolean(btn);
  };

  /* ---- 1: where it opens ---- */
  const one = {};
  {
    const back = createRound({ course: VEENKER, teeSet: 'gold', startingNine: 'back', type: 'practice' });
    const v = mount(back);
    one.menuVeenker = await menuPinSheet(v.screen);
    one.titleVeenker = title();
    one.order = [...(openSheet()?.querySelectorAll('.pin-row[data-hole]') ?? [])].map((r) => Number(r.dataset.hole));
    one.played = back.holes.map((x) => x.number);
    v.done();
    const r = mount(radRound());
    one.menuRadcliffe = await menuPinSheet(r.screen);
    r.done();

    const went = [];
    const summaryButton = (round) => {
      const s = summaryScreen({
        app: newAppState(),
        round,
        params: { roundId: round.id, from: 'history' },
        go: (screen, params) => went.push({ screen, params }),
      });
      return [...s.el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'PIN SHEET') ?? null;
    };
    const done = par4Round();
    done.status = 'completed';
    try {
      saveRound(done);
      summaryButton(done)?.click();
      one.went = went[0] ?? null;
      if (one.went) {
        const e = mount(null, { params: one.went.params });
        one.editTitle = title();
        one.editing = /^EDITING/.test(e.screen.el.querySelector('.hud-meta')?.textContent ?? '');
        closeAll();
        one.menuEditing = await menuPinSheet(e.screen);
        e.done();
      }
    } finally {
      restoreStorage();
    }
    one.summaryRadcliffe = Boolean(summaryButton(radRound()));
    one.doneId = done.id;
  }

  test('1. the Round menu and the round summary open the pin sheet on Veenker, not on Radcliffe', () => {
    eq(one.menuVeenker, true, 'Veenker: Pin sheet in the Round menu');
    eq(one.titleVeenker, 'Pin sheet', 'Veenker: the sheet it opens');
    eq(one.order.join(','), one.played.join(','), 'one row per hole, in the order played');
    eq(one.menuRadcliffe, false, 'Radcliffe: Pin sheet in the Round menu');
    eq(one.went?.screen, 'play', 'PIN SHEET goes to the round');
    eq(JSON.stringify(one.went?.params), JSON.stringify({ roundId: one.doneId, pinSheet: true }), 'with the sheet asked for');
    eq(one.editing, true, 'in edit mode');
    eq(one.editTitle, 'Pin sheet', 'with the sheet up');
    eq(one.menuEditing, true, 'edit mode: Pin sheet in the Round menu');
    eq(one.summaryRadcliffe, false, 'Radcliffe: PIN SHEET on the summary');
  });

  /* ---- 2: typing 12 / L / 5 on hole 1 ---- */
  const two = {};
  {
    const app = newAppState();
    app.settings.paceFeet = 2.75; // not the default, so the stored stride is shown to be his setting
    const round = par4Round();
    const h1 = round.holes[0];
    const untouched = (x) => JSON.stringify({ cup: x.cup, shots: x.shots, greenEntry: x.greenEntry, completedAt: x.completedAt });
    const before = untouched(h1);
    const m = mount(round, { app });
    await menuPinSheet(m.screen);
    two.intro = openSheet()?.querySelector('.pin-sheet > p')?.textContent ?? null;
    two.deep = row(1)?.querySelector('.pin-hole small')?.textContent ?? null;
    two.wantDeep = `${Math.round(greenFrame(G, 1).depthM / PACE_M(2.75))} deep`;
    two.sideOffOnC = input(1, 'side')?.disabled ?? null;
    const on = input(1, 'on');
    const refused = [];
    for (const v of ['0', '61', '7.5']) {
      type(on, v);
      refused.push(on?.value);
    }
    type(on, '12');
    type(on, '12.5');
    two.onKept = on?.value;
    side(1, 'L');
    two.sideOnL = input(1, 'side')?.disabled ?? null;
    const sd = input(1, 'side');
    type(sd, '31');
    refused.push(sd?.value);
    type(sd, '5');
    two.refused = refused;
    save();
    await wait();
    two.stored = h1.pinSheet ? { ...h1.pinSheet } : null;
    two.others = round.holes.slice(1).every((x) => x.pinSheet == null);
    two.untouched = untouched(h1) === before;
    two.persisted = m.saved.length;
    m.done();
  }

  test('2. typing 12 / L / 5 on hole 1 and SAVE stores exactly the Section 5 object', () => {
    eq(two.intro, 'Paces on from the front edge, then paces from the left or right edge. Your stride is set to 2.75 ft.', 'the line at the top');
    eq(two.deep, two.wantDeep, "the green's depth in his paces");
    eq(two.sideOffOnC, true, 'fixture: the side field is off on C');
    eq(two.sideOnL, false, 'the side field on L');
    eq(JSON.stringify(two.refused), JSON.stringify(['', '', '', '']), 'ON 0, 61 and 7.5 and side 31 are not accepted');
    eq(two.onKept, '12', 'a fraction does not replace 12');
    assert(two.stored, 'hole 1 has no pin sheet');
    const iso = two.stored.enteredAt;
    assert(typeof iso === 'string' && new Date(iso).toISOString() === iso, `enteredAt ${iso}`);
    eq(
      JSON.stringify({ ...two.stored, enteredAt: 'ISO' }),
      JSON.stringify({ onPaces: 12, side: 'L', sidePaces: 5, sideFrom: 'edge', paceFeet: 2.75, enteredAt: 'ISO' }),
      'hole 1 pinSheet'
    );
    eq(two.others, true, 'another hole got a pin sheet');
    eq(two.untouched, true, 'the cup, the shots, the green entry or completedAt changed');
    eq(two.persisted, 1, 'saved once');
  });

  /* ---- 3: an empty ON ---- */
  const three = {};
  {
    const round = par4Round();
    setPinSheet(round.holes[0], { onPaces: 9, side: 'R', sidePaces: 4, sideFrom: 'edge', paceFeet: 3 });
    const m = mount(round);
    await menuPinSheet(m.screen);
    three.prefill = [input(1, 'on')?.value, row(1)?.querySelector('.pin-side [aria-pressed="true"]')?.dataset.side, input(1, 'side')?.value].join(' ');
    type(input(1, 'on'), '');
    save();
    await wait();
    three.after = round.holes[0].pinSheet;
    m.done();
  }

  test('3. an empty ON clears the key', () => {
    eq(three.prefill, '9 R 4', 'the stored entry is on its row');
    eq(three.after, null, 'hole 1 pinSheet after SAVE');
  });

  /* ---- 4: one UNDO, live and in edit mode ---- */
  const undoScenario = async (editMode) => {
    const round = par4Round();
    const [h1, h2, h3] = round.holes;
    const at = '2026-09-20T15:00:00.000Z';
    setPinSheet(h1, { onPaces: 9, side: 'R', sidePaces: 4, sideFrom: 'edge', paceFeet: 3, enteredAt: at });
    delete h2.pinSheet; // a hole logged before the key existed
    setPinSheet(h3, { onPaces: 14, side: 'C', sidePaces: null, sideFrom: 'edge', paceFeet: 3, enteredAt: at });
    const snap = (r) => JSON.stringify(r.holes.slice(0, 3).map((x) => ('pinSheet' in x ? x.pinSheet : 'absent')));
    const before = snap(round);
    let m;
    if (editMode) {
      round.status = 'completed';
      saveRound(round);
      m = mount(null, { params: { roundId: round.id } });
    } else {
      m = mount(round);
    }
    await menuPinSheet(m.screen);
    type(input(1, 'on'), '11');
    type(input(2, 'on'), '7');
    side(2, 'L');
    type(input(2, 'side'), '3');
    type(input(3, 'on'), '');
    save();
    await wait();
    const held = editMode ? m.saved[m.saved.length - 1] : round;
    const out = { before, afterSave: held ? snap(held) : null };
    const b = [...m.screen.el.querySelectorAll('.banner[data-kind="ok"]')].find((x) => /Pin sheet saved/.test(x.textContent));
    out.banner = b?.querySelector('span')?.textContent ?? null;
    b?.querySelector('button')?.click();
    await wait();
    out.after = held ? snap(held) : null;
    m.done();
    return out;
  };
  const four = {};
  try {
    four.live = await undoScenario(false);
    four.edit = await undoScenario(true);
  } finally {
    restoreStorage();
  }

  test("4. one UNDO puts every hole's pin sheet back as it was, live and in edit mode", () => {
    for (const [mode, s] of Object.entries(four)) {
      assert(s.afterSave && s.afterSave !== s.before, `${mode}: SAVE changed nothing`);
      eq(s.banner, 'Pin sheet saved: 2 holes, 1 cleared.', `${mode}: the banner`);
      eq(s.after, s.before, `${mode}: after UNDO`);
    }
  });

  /* ---- 5: the read-out, and SAVE either way ---- */
  const five = {};
  {
    const round = par4Round();
    const m = mount(round);
    await menuPinSheet(m.screen);
    five.deepOn = Math.round(greenFrame(G, 1).depthM / PACE_M(3)) + 5;
    five.past = pinFromSheet(G, 1, { onPaces: five.deepOn, side: 'C', sidePaces: null, sideFrom: 'edge', paceFeet: 3 });
    five.across = pinFromSheet(G, 3, { onPaces: 8, side: 'R', sidePaces: 30, sideFrom: 'edge', paceFeet: 3 });
    five.on = pinFromSheet(G, 2, { onPaces: 8, side: 'L', sidePaces: 4, sideFrom: 'edge', paceFeet: 3 });
    five.before = readout(1);
    type(input(1, 'on'), String(five.deepOn)); // past the back of the green
    five.read1 = readout(1);
    type(input(2, 'on'), '8');
    side(2, 'L');
    type(input(2, 'side'), '4');
    five.read2 = readout(2);
    type(input(3, 'on'), '8');
    side(3, 'R');
    type(input(3, 'side'), '30'); // in from the right edge, past the left one
    five.read3 = readout(3);
    save();
    await wait();
    five.stored = round.holes.slice(0, 3).map((x) => (x.pinSheet ? `${x.pinSheet.onPaces} ${x.pinSheet.side} ${x.pinSheet.sidePaces}` : null));
    five.sources = round.holes.slice(0, 3).map((x) => holePosition(x, { geometry: G }).source);
    m.done();
  }

  test('5. the read-out warns on a pin off the green, and SAVE still stores it', () => {
    eq(five.before, null, 'a read-out before ON has a number');
    eq(`${five.past.placed} ${five.past.why}`, 'false on-point-off-green', 'fixture: past the back');
    assert(five.across.placed && five.across.offGreenM > 3, `fixture: across ${JSON.stringify(five.across)}`);
    assert(five.on.placed && five.on.offGreenM === 0, `fixture: on ${JSON.stringify(five.on)}`);
    eq(JSON.stringify(five.read1), JSON.stringify({ text: `${five.deepOn} on is off the green on the map - check the numbers`, warn: true }), 'past the back');
    eq(
      JSON.stringify(five.read3),
      JSON.stringify({ text: `lands ${Math.round(toYards(five.across.offGreenM))} yd off the green on the map - check the numbers`, warn: true }),
      'off the far edge'
    );
    eq(JSON.stringify(five.read2), JSON.stringify({ text: `${Math.round(toYards(five.on.fromCentreM))} yd from the centre`, warn: false }), 'on the green');
    eq(JSON.stringify(five.stored), JSON.stringify([`${five.deepOn} C null`, '8 L 4', '8 R 30']), 'what he typed is stored');
    eq(five.sources.join(','), 'map-green,pin-sheet,map-green', 'what the engine reads');
  });

  /* ---- 6: the green sheet's old control ---- */
  const six = {};
  for (const [name, round] of [['veenker', par4Round()], ['radcliffe', radRound()]]) {
    const m = mount(round);
    [...m.screen.el.querySelectorAll('.footer button')].find((b) => /^GREEN/.test(b.textContent.trim()))?.click();
    await wait();
    six[name] = {
      title: title(),
      pin: /Where was the pin\?/.test(openSheet()?.textContent ?? ''),
      rest: [...(openSheet()?.querySelectorAll('button, .field > .label') ?? [])]
        .map((b) => b.textContent.trim())
        .filter((t) => /^(MARK CUP|MARK BALL|SAVE|Putts|Putt \d.*)$/.test(t)),
    };
    m.done();
  }

  test('6. the green sheet has no "Where was the pin?" on Veenker, and has it on Radcliffe', () => {
    eq(six.veenker.title, 'Hole 1 — putts', 'fixture: Veenker green sheet');
    eq(six.radcliffe.title, 'Hole 1 — putts', 'fixture: Radcliffe green sheet');
    eq(six.veenker.pin, false, 'Veenker');
    eq(six.radcliffe.pin, true, 'Radcliffe');
    eq(six.veenker.rest.join(' | '), 'MARK CUP | MARK BALL | Putts | Putt 1 — to the hole | Putt 2 — the leave | SAVE', 'nothing else moved');
    eq(six.radcliffe.rest.join(' | '), six.veenker.rest.join(' | '), 'the same controls on both');
  });

  /* ---- 7: the fit at 360x728 ---- */
  const seven = {};
  {
    const css = await fetch('../css/base.css').then((r) => r.text());
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const hadTab = document.body.classList.contains('has-lock-tab');
    const m = mount(par4Round());
    await menuPinSheet(m.screen);
    const scrim = document.querySelector('.scrim');
    const sh = openSheet();
    if (scrim && sh) {
      // 360x728 whatever the window is: the scrim at that size, the sheet's 88dvh as pixels.
      Object.assign(scrim.style, { inset: 'auto', left: '0', top: '0', width: '360px', height: '728px' });
      sh.style.maxHeight = `${0.88 * 728}px`;
      const rect = (e) => e.getBoundingClientRect();
      const measure = () => {
        const rows = [...sh.querySelectorAll('.pin-row[data-hole]')];
        const inputs = [...sh.querySelectorAll('.pin-row input')];
        const wrap = sh.querySelector('.pin-save');
        const saveBtn = wrap?.querySelector('button');
        sh.scrollTop = 0;
        const out = {
          rows: rows.length,
          sideways: sh.scrollWidth - sh.clientWidth,
          spill: Math.max(...[...sh.querySelectorAll('.pin-sheet *')].map((e) => rect(e).right)) - rect(sh).right,
          minInputH: Math.min(...inputs.map((i) => rect(i).height)),
          saveAtTop: rect(saveBtn).top >= rect(sh).top && rect(saveBtn).bottom <= 728,
          unreachable: [],
        };
        for (const r of rows) {
          // Up to just above SAVE, the way a thumb scrolls it.
          sh.scrollTop += rect(r).bottom - rect(wrap).top;
          if (rect(r).top < rect(sh).top - 0.5 || rect(r).bottom > rect(wrap).top + 0.5) out.unreachable.push(r.dataset.hole);
        }
        sh.scrollTop = sh.scrollHeight;
        out.saveAtEnd = rect(saveBtn).bottom <= 728;
        return out;
      };
      seven.plain = measure();
      document.body.classList.add('has-lock-tab');
      seven.lockTab = measure();
      document.body.classList.toggle('has-lock-tab', hadTab);
    }
    style.remove();
    m.done();
  }

  test('7. the fit at 360x728: every row and SAVE reachable, no sideways scroll, number fields 44 px or taller', () => {
    for (const [mode, f] of Object.entries({ plain: seven.plain, 'lock tab': seven.lockTab })) {
      assert(f, `${mode}: not measured`);
      eq(f.rows, 18, `${mode}: rows`);
      assert(f.sideways <= 0 && f.spill <= 0.5, `${mode}: sideways ${f.sideways} px, spill ${f.spill} px`);
      assert(f.minInputH >= 44, `${mode}: a number field is ${f.minInputH} px tall`);
      eq(f.unreachable.join(','), '', `${mode}: rows that cannot be brought above SAVE`);
      eq(f.saveAtTop, true, `${mode}: SAVE on screen with the sheet at the top`);
      eq(f.saveAtEnd, true, `${mode}: SAVE on screen with the sheet at the end`);
    }
  });
}

/* ------------------------------------------ the Hole Overview page (Part D) */

/**
 * docs/SPEC_hole-overview.md 6.6 and 6.7. Matt, 2026-09-28: *"I want to
 * integrate the map in to the app and have a "hole Overview" page I can toggle
 * to."* The real play screen and its MAP control, the real page and its layup
 * sheets, the shipped stylesheet, at his page size, 360 x 728.
 */
export async function runHoleOverviewPageTests() {
  group('hole overview (page)');

  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  const G = courseGeometry(VEENKER);
  const css = await fetch('../css/base.css').then((r) => r.text());
  const style = document.createElement('style');
  // A phone draws overlay scrollbars, which take no width; a desktop runner
  // draws a classic one (see 'the capture card stays out of the lock strip').
  style.textContent = `${css}\n.body, .ho-scroll { scrollbar-width: none; }\n.body::-webkit-scrollbar, .ho-scroll::-webkit-scrollbar { display: none; }`;
  document.head.appendChild(style);

  const closeAll = () => {
    for (const s of document.querySelectorAll('.scrim, .toast')) s.remove();
  };
  const clearNotes = () => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('gt:course:')) localStorage.removeItem(k);
    }
  };
  const veenkerRound = (teeSet = 'blue', hole = 1) => {
    const r = createRound({ course: VEENKER, teeSet, startingNine: 'front', type: 'practice' });
    r.currentHoleIndex = r.holes.findIndex((x) => x.number === hole);
    return r;
  };
  const fixAtPos = (pos, acc = 2.5) => ({ lat: pos.lat, lon: pos.lon, acc, ts: Date.now() });
  /** The play screen at 360 x 728, live on `round` or in edit mode with `params.roundId`. */
  const mount = (round, { params = {}, fix } = {}) => {
    const gps = heldGps(TEE);
    if (fix !== undefined) gps.last = fix;
    const saved = [];
    const screen = playScreen({
      app: newAppState(),
      round: params.roundId ? null : round,
      gps,
      params,
      go() {},
      persistRound(r) {
        saved.push(r ?? round);
      },
      persistApp() {},
      startGps() {},
      stopGps() {},
      trackStats: () => null,
    });
    Object.assign(screen.el.style, { position: 'fixed', left: '0', top: '0', width: '360px', height: '728px' });
    document.body.appendChild(screen.el);
    // `dvh` can read 0 in a hidden pane; restated as the page height's 78 %.
    screen.el.querySelector('.footer').style.maxHeight = `${Math.round(728 * 0.78)}px`;
    return {
      screen,
      gps,
      saved,
      done: () => {
        screen.el.remove();
        closeAll();
      },
    };
  };
  const mapBtn = (m) => m.screen.el.querySelector('.holenav-map');
  const pageOf = (m) => m.screen.el.querySelector('.hole-overview');
  const open = async (m) => {
    mapBtn(m)?.click();
    await wait();
    return pageOf(m);
  };
  const col = (p, c) => p?.querySelector(`.ho-col[data-col="${c}"]`) ?? null;
  const greenOf = (c) => {
    const out = {};
    for (const e of c?.querySelectorAll('[data-row="green"] [data-f], [data-row="fb"] [data-f]') ?? []) out[e.dataset.f] = e.textContent;
    return out;
  };
  const press = (m, re) => [...m.screen.el.querySelectorAll('.footer button')].find((b) => re.test(b.textContent.trim()))?.click();
  const sheetEl = () => document.querySelector('.scrim .sheet');
  const type = (el, v) => {
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input'));
  };
  const tap = (root, label) => [...(root?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === label)?.click();
  const creekLine = (p) => {
    const c = p?.querySelector('.ho-creek');
    return c && !c.hidden ? c.textContent : null;
  };
  const creekShown = (p) => {
    const c = p?.querySelector('.ho-creek');
    if (!c || c.hidden) return false;
    const r = c.getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    return r.height > 0 && r.top >= pr.top && r.bottom <= pr.bottom;
  };

  /* ---- 1: MAP is always there ---- */
  const one = {};
  {
    const r = par4Round();
    const m = mount(r);
    await wait();
    one.fresh = Boolean(mapBtn(m));
    press(m, /^MARK TEE SHOT$/);
    m.gps.endBurst();
    await wait();
    one.shots = r.holes[0].shots.length;
    one.marked = Boolean(mapBtn(m));
    press(m, /^MARK SHOT 2$/);
    m.gps.endBurst();
    await wait();
    one.pendingCard = m.screen.el.querySelector('.body > .capture')?.dataset.burst ?? null;
    one.pending = Boolean(mapBtn(m));
    m.done();

    const c = par4Round();
    setManualHole(c.holes[0], { strokes: 4, putts: 2 });
    one.complete = isHoleComplete(c.holes[0]);
    const cm = mount(c);
    await wait();
    one.completed = Boolean(mapBtn(cm));
    cm.done();

    const rad = mount(createRound({ course: RADCLIFFE, teeSet: 'white', startingNine: 'front', type: 'practice' }));
    await wait();
    one.radcliffe = Boolean(mapBtn(rad));
    one.radNav = rad.screen.el.querySelectorAll('.holenav > button').length;
    rad.done();

    const finished = par4Round();
    finished.status = 'completed';
    try {
      saveRound(finished);
      const e = mount(null, { params: { roundId: finished.id } });
      await wait();
      one.editing = /^EDITING/.test(e.screen.el.querySelector('.hud-meta')?.textContent ?? '');
      one.edit = Boolean(mapBtn(e));
      e.done();
    } finally {
      restoreStorage();
    }
  }

  test('1. MAP is always there: a fresh hole, after a mark, a lie pending, a completed hole; not on Radcliffe or in edit mode', () => {
    eq(one.fresh, true, 'a fresh hole');
    eq(one.shots, 1, 'fixture: the tee shot marked');
    eq(one.marked, true, 'after a mark');
    eq(one.pendingCard, 'done', 'fixture: a lie pending');
    eq(one.pending, true, 'with a lie pending');
    eq(one.complete, true, 'fixture: a completed hole');
    eq(one.completed, true, 'on a completed hole');
    eq(one.radcliffe, false, 'Radcliffe');
    eq(one.radNav, 3, 'Radcliffe: the row keeps its three controls');
    eq(one.editing, true, 'fixture: edit mode');
    eq(one.edit, false, 'edit mode');
  });

  /* ---- 2: one green ---- */
  const two = {};
  {
    const pos = layupPoint(G, 1, { ref: 'green', yards: 150 }, null);
    const m = mount(par4Round(), { fix: fixAtPos(pos, 3.2) });
    await wait();
    two.line = m.screen.el.querySelector('.hud-green')?.textContent ?? '';
    const p = await open(m);
    two.you = greenOf(col(p, 'you'));
    two.head = col(p, 'you')?.querySelector('h3')?.textContent ?? null;
    two.want = toGreen(G, 1, { lat: pos.lat, lon: pos.lon, accuracyM: 3.2 });
    m.done();
  }

  test("2. one green: with a held fix the page's YOU green numbers are the play screen's green line", () => {
    const g = /^GREEN (\d+) · F (\d+) · B (\d+) · ±(\d+) yd$/.exec(two.line);
    assert(g, `the play screen's line reads "${two.line}"`);
    eq(two.you.C, g[1], 'centre');
    eq(two.you.F, g[2], 'front');
    eq(two.you.B, g[3], 'back');
    eq(`${two.you.F} ${two.you.C} ${two.you.B}`, `${two.want.frontYd} ${two.want.centreYd} ${two.want.backYd}`, 'toGreen');
    eq(two.head, `YOU ±${g[4]} yd`, "the column header, the fix's own accuracy");
  });

  /* ---- 3: no fix ---- */
  const three = {};
  {
    const m = mount(par4Round(), { fix: null });
    await wait();
    const p = await open(m);
    const you = col(p, 'you');
    three.noFix = you?.querySelector('.ho-none')?.textContent ?? null;
    three.youNums = [...(you?.querySelectorAll('.v') ?? [])].map((e) => e.textContent);
    three.tee = greenOf(col(p, 'tee'));
    three.want = toGreen(G, 1, teeOrigin(G, 1, 'gold'));
    m.done();
  }

  test('3. no fix: YOU reads "no fix" and every number is a dash; TEE still has its numbers', () => {
    eq(three.noFix, 'no fix', 'YOU');
    assert(three.youNums.length >= 3, `fixture: ${three.youNums.length} YOU numbers`);
    assert(three.youNums.every((t) => t === '—'), `YOU numbers: ${JSON.stringify(three.youNums)}`);
    eq(`${three.tee.F}/${three.tee.C}/${three.tee.B}`, `${three.want.frontYd}/${three.want.centreYd}/${three.want.backYd}`, 'TEE green');
  });

  /* ---- 4: going there costs nothing ---- */
  const four = {};
  {
    const r = par4Round();
    const m = mount(r);
    await wait();
    const snap = () => {
      const card = m.screen.el.querySelector('.body > .capture');
      return {
        card,
        burst: card?.dataset.burst ?? null,
        banner: [...m.screen.el.querySelectorAll('.body > .banner')].map((b) => b.textContent).join(' | '),
        hole: r.currentHoleIndex,
        saved: m.saved.length,
        round: JSON.stringify(r),
      };
    };
    const openAndClose = async () => {
      const p = await open(m);
      const opened = Boolean(p);
      p?.querySelector('.ho-close')?.click();
      await wait();
      return opened && !pageOf(m);
    };
    press(m, /^MARK TEE SHOT$/);
    m.gps.endBurst();
    await wait();
    press(m, /^MARK SHOT 2$/);
    await wait();
    const a = snap();
    const ok1 = await openAndClose();
    four.running = { a, b: snap(), ok: ok1 };
    m.gps.endBurst();
    await wait();
    const c = snap();
    const ok2 = await openAndClose();
    four.pending = { c, d: snap(), ok: ok2 };
    m.done();
  }

  test('4. going there costs nothing: the capture, the lie pending and the UNDO banner survive; the hole and the round do not move; nothing is saved', () => {
    const { a, b, ok } = four.running;
    eq(ok, true, 'the page opened and PLAY closed it');
    eq(a.burst, 'running', 'fixture: shot 2 capturing, its lie being asked for');
    assert(/UNDO/.test(a.banner), `fixture: the UNDO banner is up ("${a.banner}")`);
    assert(b.card === a.card, 'the capture card was rebuilt');
    eq(b.banner, a.banner, 'the UNDO banner');
    eq(b.hole, a.hole, 'currentHoleIndex');
    eq(b.saved, a.saved, 'persistRound calls');
    eq(b.round, a.round, 'the round');
    const { c, d, ok: ok2 } = four.pending;
    eq(ok2, true, 'the page opened and PLAY closed it, lie pending');
    eq(c.burst, 'done', 'fixture: the lie pending on a saved shot');
    assert(d.card === c.card, 'the pending-lie card was rebuilt');
    eq(d.hole, c.hole, 'currentHoleIndex, lie pending');
    eq(d.saved, c.saved, 'persistRound calls, lie pending');
    eq(d.round, c.round, 'the round, lie pending');
  });

  /* ---- 5: looking is not moving ---- */
  const five = {};
  {
    const r = par4Round();
    const m = mount(r);
    await wait();
    const p = await open(m);
    five.before = p?.querySelector('.ho-title strong')?.textContent ?? null;
    p?.querySelector('.ho-next')?.click();
    await wait();
    five.after = p?.querySelector('.ho-title strong')?.textContent ?? null;
    five.index = r.currentHoleIndex;
    five.nav = m.screen.el.querySelector('.holenav-current strong')?.textContent ?? null;
    five.saved = m.saved.length;
    m.done();
  }

  test("5. looking is not moving: the page's next-hole arrow changes the hole shown, never currentHoleIndex", () => {
    eq(five.before, 'HOLE 1', 'the page opens on the current hole');
    eq(five.after, 'HOLE 2', 'after the arrow');
    eq(five.index, 0, 'currentHoleIndex');
    eq(five.nav, '1', "the play screen's hole");
    eq(five.saved, 0, 'persistRound calls');
  });

  /* ---- 6: layups through the sheets ---- */
  const six = {};
  {
    clearNotes();
    const r = par4Round();
    const before = JSON.stringify(r);
    const m = mount(r);
    await wait();
    const p = await open(m);
    const stored = () =>
      loadCourseNotes('veenker')
        .layups.map((l) => `${l.hole} ${l.ref} ${l.yards} ${l.label ?? '-'}`)
        .join('; ');
    tap(p, '+ LAYUP');
    await wait();
    six.title = sheetEl()?.querySelector('h2')?.textContent ?? null;
    type(sheetEl()?.querySelector('.ho-in-yards'), '100');
    tap(sheetEl(), 'SAVE');
    await wait();
    six.added = stored();
    six.rows = p.querySelectorAll('.ho-layup').length;
    const id = loadCourseNotes('veenker').layups[0]?.id ?? null;
    p.querySelector('.ho-layup')?.click();
    await wait();
    type(sheetEl()?.querySelector('.ho-in-yards'), '110');
    type(sheetEl()?.querySelector('.ho-in-label'), 'short of the bunker');
    tap(sheetEl(), 'SAVE');
    await wait();
    six.edited = stored();
    six.editedId = loadCourseNotes('veenker').layups[0]?.id === id;
    p.querySelector('.ho-layup')?.click();
    await wait();
    tap(sheetEl(), 'DELETE');
    await wait();
    six.asked = sheetEl()?.querySelector('h2')?.textContent ?? null;
    six.beforeConfirm = stored();
    tap(sheetEl(), 'DELETE');
    await wait();
    six.deleted = stored();
    six.toast = document.querySelector('.toast span')?.textContent ?? null;
    tap(document.querySelector('.toast'), 'RESTORE');
    await wait();
    six.restored = stored();
    six.restoredId = loadCourseNotes('veenker').layups[0]?.id === id;
    six.rowsAfter = p.querySelectorAll('.ho-layup').length;
    six.round = JSON.stringify(r) === before;
    six.saved = m.saved.length;
    m.done();
    restoreStorage();
  }

  test("6. layups through the sheets: add, edit, delete, restore change his course notes; the round's JSON is byte-identical", () => {
    eq(six.title, 'Hole 1 — new layup', 'the + LAYUP sheet');
    eq(six.added, '1 green 100 -', 'added');
    eq(six.rows, 1, 'its row on the page');
    eq(six.edited, '1 green 110 short of the bunker', 'edited');
    eq(six.editedId, true, 'the same layup, edited in place');
    eq(six.asked, 'Delete this layup?', 'delete asks once');
    eq(six.beforeConfirm, '1 green 110 short of the bunker', 'nothing removed before the confirmation');
    eq(six.deleted, '', 'deleted');
    eq(six.toast, 'Layup deleted.', 'the toast');
    eq(six.restored, '1 green 110 short of the bunker', 'restored');
    eq(six.restoredId, true, 'the same layup restored');
    eq(six.rowsAfter, 1, 'its row back on the page');
    eq(six.round, true, "the round's JSON");
    eq(six.saved, 0, 'persistRound calls');
  });

  /* ---- 7: fit at 360 x 728 ---- */
  const seven = {};
  {
    clearNotes();
    const notes = loadCourseNotes('veenker');
    notes.layups.push(
      newLayup({ hole: 11, ref: 'green', yards: 60, label: 'short of the creek' }),
      newLayup({ hole: 11, ref: 'tee', yards: 100, teeSet: 'blue' })
    );
    saveCourseNotes(notes);
    const rect = (e) => e.getBoundingClientRect();
    const px = (e) => parseFloat(getComputedStyle(e).fontSize);
    const digits = (e) => /\d/.test(e.textContent);
    const label = (e) => e.textContent.trim() || e.className;
    const measure = async (hole) => {
      const m = mount(veenkerRound('blue', hole), { fix: fixAtPos(teeOrigin(G, hole, 'blue'), 3) });
      await wait();
      const mapR = rect(mapBtn(m));
      const p = await open(m);
      const sc = p.querySelector('.ho-scroll');
      const you = col(p, 'you');
      const tee = col(p, 'tee');
      const centre = you.querySelector('.ho-c');
      const out = { features: holeFeatures(G, hole).length, layups: p.querySelectorAll('.ho-layup').length };
      out.sideways = Math.max(
        p.scrollWidth - p.clientWidth,
        sc.scrollWidth - sc.clientWidth,
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      out.centre = px(centre);
      const youNums = [...you.querySelectorAll('.v'), ...p.querySelectorAll('.ho-lv.you b')].filter((e) => e !== centre && digits(e));
      const teeNums = [...tee.querySelectorAll('.v'), ...p.querySelectorAll('.ho-lv.tee b')].filter(digits);
      out.youCount = youNums.length;
      out.youMin = Math.min(...youNums.map(px));
      out.teeCount = teeNums.length;
      out.teeMin = Math.min(...teeNums.map(px));
      const targets = [...p.querySelectorAll('button, [role="button"]')].filter((e) => rect(e).width > 0);
      out.targets = targets.length;
      out.small = targets.filter((e) => rect(e).width < 48 || rect(e).height < 48).map(label);
      out.close = [];
      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const a = rect(targets[i]);
          const b = rect(targets[j]);
          const gap = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
          if (gap < 8) out.close.push(`${label(targets[i])} / ${label(targets[j])}: ${gap.toFixed(1)} px`);
        }
      }
      const bar = p.querySelector('.ho-bar');
      const creek = p.querySelector('.ho-creek');
      const barTop = rect(bar).top;
      const creekTop = creek.hidden ? null : rect(creek).top;
      sc.scrollTop = sc.scrollHeight;
      out.scrolled = sc.scrollTop;
      out.barMoved = Math.abs(rect(bar).top - barTop);
      out.creekMoved = creekTop == null ? null : Math.abs(rect(creek).top - creekTop);
      const playR = rect(p.querySelector('.ho-close'));
      out.playVsMap = Math.max(
        Math.abs(playR.left - mapR.left),
        Math.abs(playR.top - mapR.top),
        Math.abs(playR.width - mapR.width),
        Math.abs(playR.height - mapR.height)
      );
      if (!creek.hidden) {
        const [a, b] = creek.querySelectorAll('.ho-cc');
        out.creek = {
          px: px(creek),
          spill: creek.scrollWidth - creek.clientWidth,
          first: a?.textContent ?? null,
          broke: Boolean(a && b && rect(b).top > rect(a).top + 1),
        };
      }
      m.done();
      return out;
    };
    for (const hole of [11, 16, 1]) seven[hole] = await measure(hole);
    restoreStorage();
  }

  test('7. fit at 360x728 on hole 11 (4 features, 2 layups), 16 (3 features, the creek line) and 1 (none)', () => {
    eq(`${seven[11].features} ${seven[11].layups}`, '4 2', 'fixture: hole 11');
    eq(seven[16].features, 3, 'fixture: hole 16');
    eq(seven[1].features, 0, 'fixture: hole 1');
    assert(seven[11].scrolled > 0, 'fixture: hole 11 scrolls, so the top bar is held to a scroll');
    for (const hole of [11, 16, 1]) {
      const f = seven[hole];
      assert(f.sideways <= 0, `hole ${hole}: ${f.sideways} px of sideways scroll`);
      eq(f.centre, 40, `hole ${hole}: YOU green centre, px`);
      assert(f.youCount >= 2 && f.youMin >= 24, `hole ${hole}: a YOU number is ${f.youMin} px (n = ${f.youCount})`);
      assert(f.teeCount >= 1 && f.teeMin >= 18, `hole ${hole}: a TEE number is ${f.teeMin} px (n = ${f.teeCount})`);
      eq(f.small.join(', '), '', `hole ${hole}: tap targets under 48 px`);
      eq(f.close.join('; '), '', `hole ${hole}: tap targets under 8 px apart`);
      assert(f.barMoved < 0.5, `hole ${hole}: the top bar moved ${f.barMoved} px with the scroll`);
      assert(f.playVsMap < 0.5, `hole ${hole}: PLAY is ${f.playVsMap} px from where MAP was`);
    }
    const c = seven[16].creek;
    assert(c, 'hole 16: no creek line');
    assert(c.px >= 16, `hole 16: the creek line is ${c.px} px`);
    assert(c.spill <= 0, `hole 16: the creek line scrolls sideways by ${c.spill} px`);
    assert(c.broke && /\(your mark\) ·$/.test(c.first), `hole 16: the line breaks after the blue number ("${c.first}")`);
    assert(seven[16].creekMoved < 0.5, `hole 16: the creek line moved ${seven[16].creekMoved} px with the scroll`);
  });

  /* ---- 8: no photo ---- */
  const eight = {};
  {
    const F = courseFrames(VEENKER);
    const broken = { ...F, holes: F.holes.map((fr) => ({ ...fr, file: `img/veenker/no-such-photo-${fr.number}.webp` })) };
    const pos = layupPoint(G, 7, { ref: 'green', yards: 250 }, null);
    const make = async (frames) => {
      const host = document.createElement('div');
      Object.assign(host.style, { position: 'fixed', left: '0', top: '0', width: '360px', height: '629px', display: 'flex', flexDirection: 'column' });
      const page = holeOverview({
        course: VEENKER,
        geometry: G,
        frames,
        teeSet: 'blue',
        holes: VEENKER.holes.map((x) => x.number),
        holeNumber: 7,
        getFix: () => fixAtPos(pos, 3),
      });
      page.el.style.flex = '1';
      host.appendChild(page.el);
      document.body.appendChild(host);
      const img = page.el.querySelector('.ho-photo');
      for (let i = 0; i < 60 && !img.complete; i++) await wait(50);
      await wait();
      const out = {
        noPhoto: page.el.classList.contains('no-photo'),
        loaded: img.naturalWidth > 0,
        hidden: getComputedStyle(img).visibility === 'hidden',
        shapes: page.el.querySelectorAll('.ho-shapes .ho-shape').length,
        marks: [...page.el.querySelectorAll('.ho-mk')].map((e) => e.textContent).filter(Boolean).sort().join(','),
        dot: page.el.querySelectorAll('.ho-mk.you-dot').length,
        nums: page.el.querySelector('.ho-nums').textContent,
        picH: page.el.querySelector('.ho-pic').getBoundingClientRect().height,
      };
      page.close();
      host.remove();
      closeAll();
      return out;
    };
    eight.photo = await make(F);
    eight.none = await make(broken);
  }

  test('8. no photo: the outlines and the markers are drawn, the numbers are unchanged', () => {
    eq(eight.photo.loaded, true, 'fixture: the photo loads when it is there');
    eq(eight.photo.noPhoto, false, 'fixture: no no-photo state with the photo');
    eq(eight.none.loaded, false, 'fixture: the photo request failed');
    eq(eight.none.noPhoto, true, 'the page knows the photo is missing');
    eq(eight.none.hidden, true, 'the broken image is not shown');
    assert(eight.none.shapes > 0 && eight.none.shapes === eight.photo.shapes, `outlines: ${eight.none.shapes} vs ${eight.photo.shapes}`);
    eq(eight.none.marks, eight.photo.marks, 'markers');
    assert(/W1/.test(eight.none.marks) && /T/.test(eight.none.marks), `fixture: markers ${eight.none.marks}`);
    eq(eight.none.dot, 1, 'his position');
    eq(eight.none.nums, eight.photo.nums, 'the numbers');
    near(eight.none.picH, eight.photo.picH, 0.5, 'the picture keeps its size');
  });

  /* ---- 9: one tap back ---- */
  const nine = {};
  {
    const r = veenkerRound('gold', 5);
    const m = mount(r);
    await wait();
    nine.opened = Boolean(await open(m));
    pageOf(m)?.querySelector('.ho-close')?.click();
    await wait();
    nine.closed = !pageOf(m);
    nine.nav = m.screen.el.querySelector('.holenav-current strong')?.textContent ?? null;
    nine.index = r.currentHoleIndex;
    nine.map = Boolean(mapBtn(m));
    nine.saved = m.saved.length;
    m.done();
  }

  test('9. one tap back: with the page open, PLAY returns to the play screen on the same hole', () => {
    eq(nine.opened, true, 'the page opened');
    eq(nine.closed, true, 'PLAY closed it');
    eq(nine.nav, '5', "the play screen's hole");
    eq(nine.index, 4, 'currentHoleIndex');
    eq(nine.map, true, 'MAP is there to go again');
    eq(nine.saved, 0, 'persistRound calls');
  });

  /* ---- 10: the creek carry off the tee stays ---- */
  const ten = { bySet: {}, states: {}, others: {} };
  {
    for (const set of ['blue', 'gold', 'white']) {
      const got = { playScreen: [] };
      for (const hole of [15, 16]) {
        const m = mount(veenkerRound(set, hole));
        await wait();
        got.playScreen.push(/CREEK CARRY/.test(m.screen.el.textContent));
        got[hole] = creekLine(await open(m));
        m.done();
      }
      ten.bySet[set] = got;
    }
    clearNotes();
    const notes = loadCourseNotes('veenker');
    for (const y of [40, 60, 80, 100, 120]) notes.layups.push(newLayup({ hole: 15, ref: 'green', yards: y }));
    saveCourseNotes(notes);
    const H15 = holePath(G, 15);
    const state = async (fix, act) => {
      const m = mount(veenkerRound('blue', 15), { fix });
      await wait();
      const p = await open(m);
      const extra = await act?.(p);
      const out = { line: creekShown(p) ? creekLine(p) : null, ...extra };
      m.done();
      return out;
    };
    ten.states.noFix = await state(null);
    ten.states.onGreen = await state(fixAtPos(H15[H15.length - 1], 3));
    ten.states.scrolled = await state(fixAtPos(teeOrigin(G, 15, 'blue'), 3), async (p) => {
      const sc = p.querySelector('.ho-scroll');
      sc.scrollTop = sc.scrollHeight;
      await wait();
      return { scrollTop: sc.scrollTop };
    });
    ten.states.filled = await state(fixAtPos(teeOrigin(G, 15, 'blue'), 3), async (p) => {
      p.querySelector('.ho-pic')?.click();
      await wait();
      return { filled: p.classList.contains('filled') };
    });
    restoreStorage();
    for (const hole of [7, 11]) {
      const m = mount(veenkerRound('blue', hole));
      await wait();
      ten.others[hole] = creekLine(await open(m));
      m.done();
    }
  }

  test('10. the creek carry off the tee stays: holes 15 and 16, blue and gold, on every round and in every state; nowhere else', () => {
    const l15 = ten.bySet.blue[15] ?? '';
    const l16 = ten.bySet.blue[16] ?? '';
    const m15 = /^CREEK CARRY BLUE (\d+) · GOLD (\d+)$/.exec(l15);
    assert(m15, `hole 15 reads "${l15}"`);
    near(Number(m15[1]), 255, 1, 'hole 15 blue');
    near(Number(m15[2]), 223, 1, 'hole 15 gold');
    const m16 = /^CREEK CARRY BLUE (\d+) \(your mark\) · GOLD (\d+)$/.exec(l16);
    assert(m16, `hole 16 reads "${l16}"`);
    near(Number(m16[1]), 477, 1, 'hole 16 blue');
    near(Number(m16[2]), 415, 1, 'hole 16 gold');
    assert(!/\b99\b/.test(l16) && !/\b35\b/.test(l16), `hole 16's crossing in front of the tee is on the line: "${l16}"`);
    for (const set of ['gold', 'white']) {
      eq(ten.bySet[set][15], l15, `hole 15 on a ${set} round`);
      eq(ten.bySet[set][16], l16, `hole 16 on a ${set} round`);
    }
    for (const set of ['blue', 'gold', 'white']) eq(ten.bySet[set].playScreen.join(','), 'false,false', `the play screen, ${set} round`);
    eq(ten.states.noFix.line, l15, 'with no fix');
    eq(ten.states.onGreen.line, l15, 'with a fix on the green');
    assert(ten.states.scrolled.scrollTop > 0, 'fixture: the table scrolled');
    eq(ten.states.scrolled.line, l15, 'with the table scrolled to its end');
    eq(ten.states.filled.filled, true, 'fixture: the picture fills the screen');
    eq(ten.states.filled.line, l15, 'with the picture filling the screen');
    eq(ten.others[7], null, 'hole 7');
    eq(ten.others[11], null, 'hole 11');
  });

  /* ---- 11: a pond has no number ---- */
  const eleven = {};
  for (const hole of [3, 5]) {
    const m = mount(veenkerRound('blue', hole), { fix: fixAtPos(teeOrigin(G, hole, 'blue'), 3) });
    await wait();
    const p = await open(m);
    eleven[hole] = {
      rows: [...p.querySelectorAll('.ho-col [data-row]')].map((e) => e.dataset.row),
      w: [...p.querySelectorAll('.ho-mk')].filter((e) => /^W/.test(e.textContent)).length,
      ponds: p.querySelectorAll('.ho-shapes .ho-shape.pond').length,
    };
    m.done();
  }

  test('11. a pond has no number: holes 3 and 5 have no water row and no W marker', () => {
    for (const hole of [3, 5]) {
      const e = eleven[hole];
      assert(e.ponds >= 1, `fixture: hole ${hole}'s picture draws no pond`);
      assert(e.rows.includes('B1'), `fixture: hole ${hole}'s rows ${JSON.stringify(e.rows)}`);
      eq(e.rows.filter((r) => /^W/.test(r)).length, 0, `hole ${hole}: water rows`);
      eq(e.w, 0, `hole ${hole}: W markers`);
    }
  });

  /* ---- 12 (6.7): the page from the home screen ---- */
  const twelve = {};
  {
    clearNotes();
    const app = newAppState();
    app.settings.teeByCourse = { veenker: 'gold' };
    const went = [];
    const s = mapScreen({ app, round: null, params: { courseId: 'veenker' }, go: (screen) => went.push(screen) });
    Object.assign(s.el.style, { position: 'fixed', left: '0', top: '0', width: '360px', height: '728px' });
    document.body.appendChild(s.el);
    await wait();
    const p = s.el.querySelector('.hole-overview');
    twelve.you = Boolean(col(p, 'you'));
    twelve.teeHead = col(p, 'tee')?.querySelector('h3')?.textContent ?? null;
    twelve.tee = greenOf(col(p, 'tee'));
    twelve.want = toGreen(G, 1, teeOrigin(G, 1, 'gold'));
    twelve.pressed = p.querySelector('.ho-sub .seg-btn[aria-pressed="true"]')?.textContent ?? null;
    twelve.close = p.querySelector('.ho-close')?.textContent ?? null;
    for (let i = 0; i < 14; i++) p.querySelector('.ho-next')?.click();
    await wait();
    twelve.hole = p.querySelector('.ho-title strong')?.textContent ?? null;
    twelve.creek = creekLine(p);
    tap(p, '+ LAYUP');
    await wait();
    type(sheetEl()?.querySelector('.ho-in-yards'), '150');
    tap(sheetEl(), 'SAVE');
    await wait();
    twelve.notes = loadCourseNotes('veenker')
      .layups.map((l) => `${l.hole} ${l.ref} ${l.yards}`)
      .join('; ');
    p.querySelector('.ho-close')?.click();
    await wait();
    twelve.went = went.join(',');
    s.el.remove();
    closeAll();
    restoreStorage();
  }

  test('12. (6.7) the page from home: no round, the TEE column, the creek line on hole 15, a layup typed there is in his notes', () => {
    eq(twelve.you, false, 'no YOU column: GPS is not started');
    eq(twelve.pressed, 'GOLD', 'the tee-set selector starts at teeByCourse');
    assert(/^GOLD TEE ±\d+ yd$/.test(twelve.teeHead ?? ''), `the TEE column reads "${twelve.teeHead}"`);
    eq(`${twelve.tee.F}/${twelve.tee.C}/${twelve.tee.B}`, `${twelve.want.frontYd}/${twelve.want.centreYd}/${twelve.want.backYd}`, 'TEE green, hole 1');
    eq(twelve.close, 'HOME', 'HOME where PLAY is');
    eq(twelve.hole, 'HOLE 15', 'fixture: hole 15');
    assert(/^CREEK CARRY BLUE \d+ · GOLD \d+$/.test(twelve.creek ?? ''), `hole 15's creek line: "${twelve.creek}"`);
    eq(twelve.notes, '15 green 150', 'the layup in his course notes');
    eq(twelve.went, 'home', 'HOME goes home');
  });

  /* ---- 13-15 (C2, Fable's review of v35): looking at another hole, one green on the screen ---- */
  const c2 = {};
  {
    const hud = (m) => {
      const vis = (sel) => {
        const e = m.screen.el.querySelector(sel);
        return e ? getComputedStyle(e).visibility : null;
      };
      return {
        green: vis('.hud-green'),
        title: vis('.hud-meta'),
        menu: vis('.hud .icon-btn'),
        chips: [...m.screen.el.querySelectorAll('.hud .acc-chip')].map((e) => getComputedStyle(e).visibility).join(','),
        away: m.screen.el.classList.contains('ho-away'),
        greenText: m.screen.el.querySelector('.hud-green')?.textContent ?? '',
      };
    };
    const subOf = (p) => p?.querySelector('.ho-sub')?.textContent ?? null;
    const m = mount(veenkerRound('blue', 16), { fix: fixAtPos(teeOrigin(G, 16, 'blue'), 3) });
    await wait();
    c2.before = hud(m);
    const p = await open(m);
    c2.home = { ...hud(m), sub: subOf(p), hole: p?.querySelector('.ho-title strong')?.textContent ?? null };
    p?.querySelector('.ho-next')?.click();
    await wait();
    c2.next = { ...hud(m), sub: subOf(p), hole: p?.querySelector('.ho-title strong')?.textContent ?? null };
    p?.querySelector('.ho-prev')?.click();
    await wait();
    c2.back = { ...hud(m), sub: subOf(p), hole: p?.querySelector('.ho-title strong')?.textContent ?? null };
    p?.querySelector('.ho-prev')?.click();
    await wait();
    c2.other = { ...hud(m), hole: p?.querySelector('.ho-title strong')?.textContent ?? null };
    p?.querySelector('.ho-close')?.click();
    await wait();
    c2.played = { ...hud(m), open: Boolean(pageOf(m)) };
    m.done();
  }

  test("13. (C2) the page on the round's hole: the HUD GREEN line is visible and the sub line has no ROUND IS ON", () => {
    eq(c2.home.hole, 'HOLE 16', 'fixture: the page opens on the round\'s hole');
    assert(/^GREEN \d+/.test(c2.before.greenText), `fixture: the HUD reads "${c2.before.greenText}"`);
    eq(c2.home.green, 'visible', 'the HUD GREEN line');
    eq(c2.home.title, 'visible', "the HUD's hole title");
    eq(c2.home.away, false, 'the class');
    assert(c2.home.sub != null && !/ROUND IS ON/.test(c2.home.sub), `the sub line reads "${c2.home.sub}"`);
  });

  test("14. (C2) another hole: the HUD GREEN line and title are hidden and the sub line says where the round is; back to the round's hole restores both", () => {
    eq(c2.next.hole, 'HOLE 17', 'fixture: the next-hole arrow');
    eq(c2.next.green, 'hidden', 'the HUD GREEN line, hole 17');
    eq(c2.next.title, 'hidden', "the HUD's hole title, hole 17");
    eq(c2.next.menu, 'visible', 'the menu button stays');
    eq(c2.next.chips, 'visible,visible', 'the accuracy chip and the track chip stay');
    assert(/ · ROUND IS ON HOLE 16$/.test(c2.next.sub ?? ''), `the sub line reads "${c2.next.sub}"`);
    eq(c2.back.hole, 'HOLE 16', "fixture: the arrow back to the round's hole");
    eq(`${c2.back.green} ${c2.back.title}`, 'visible visible', "the HUD, back on the round's hole");
    eq(c2.back.sub, c2.home.sub, "the sub line, back on the round's hole");
  });

  test('15. (C2) PLAY from another hole: the class is gone and the HUD lines are visible', () => {
    eq(`${c2.other.hole} ${c2.other.green}`, 'HOLE 15 hidden', 'fixture: on another hole');
    eq(c2.played.open, false, 'fixture: PLAY closed the page');
    eq(c2.played.away, false, 'the class');
    eq(`${c2.played.green} ${c2.played.title}`, 'visible visible', 'the HUD lines');
    eq(c2.played.greenText, c2.before.greenText, 'the HUD GREEN line reads as before the page opened');
  });

  style.remove();
}
