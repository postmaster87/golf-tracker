/**
 * BENCHMARK LOOKUP — expected strokes to hole out, by lie and distance.
 *
 * All numbers come from js/analysis/tour-benchmark.js, which holds data read
 * directly off Broadie (2011). This file contains only lookup, interpolation
 * and the derivation of non-tour baselines. No number is invented here.
 *
 * Two different mechanisms, deliberately:
 *
 *   FULL SHOTS are a table lookup. Broadie's Table 9 gives tee, fairway, rough,
 *   sand and recovery from 10 to 600 yards, so there is nothing to model.
 *
 *   PUTTING is a physical model, because the paper gives one rather than a
 *   table — and a model is better here. It is fit from two published anchors
 *   per skill level (the distance at which half the putts drop, and the
 *   distance at which the average is exactly two putts), which means a
 *   non-tour baseline is derived from stated facts instead of a guessed offset.
 *
 * The two mechanisms also get different scratch treatments, and that is the
 * most consequential decision in this file. See SCRATCH_CALIBRATION.
 */

import {
  SOURCE,
  TABLE_9,
  PUTTING_MODEL,
  PUTTING_ANCHORS,
  SCRATCH_CALIBRATION,
  CATEGORY_DEFINITION,
} from './tour-benchmark.js';

export { SOURCE, CATEGORY_DEFINITION };

/* -------------------------------------------------------------- normal CDF */

/** Abramowitz & Stegun 26.2.17. |error| < 7.5e-8, far tighter than the data. */
export function normalCdf(z) {
  const b = [0.31938153, -0.356563782, 1.781477937, -1.821255978, 1.330274429];
  const p = 0.2316419;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z);
  const t = 1 / (1 + p * x);
  const poly = b[0] * t + b[1] * t ** 2 + b[2] * t ** 3 + b[3] * t ** 4 + b[4] * t ** 5;
  const upperTail = (Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI)) * poly;
  return sign > 0 ? 1 - upperTail : upperTail;
}

/* ------------------------------------------------------------ putting model */

const FT_PER_YARD = 3;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Probability of holing out in one putt, from Broadie's equation (5).
 *
 * Putting error is split into an angular part (did it start on line) and a
 * distance part (did it finish in the window from the hole out to `h` past it).
 * The two are independent, so the probability is their product.
 *
 * `distanceFeet` in, yards used internally because that is the model's unit.
 */
export function onePuttProbability(distanceFeet, { sigmaAlphaDegrees, sigmaD } = {}) {
  const { t, h, holeRadiusYards } = PUTTING_MODEL;
  const sa = sigmaAlphaDegrees ?? PUTTING_MODEL.sigmaAlphaDegrees;
  const sd = sigmaD ?? PUTTING_MODEL.sigmaD;

  const d = distanceFeet / FT_PER_YARD;
  if (!(d > 0)) return 1;

  // Angular: the half-angle the hole subtends, against the golfer's aim error.
  const alphaC = Math.atan(holeRadiusYards / d) * RAD_TO_DEG;
  const angular = 2 * normalCdf(alphaC / sa) - 1;

  // Distance: the roll must reach the hole but not run more than h past it.
  const spread = sd * (d + t);
  const distance = normalCdf((h - t) / spread) - normalCdf(-t / spread);

  return Math.max(0, Math.min(1, angular * distance));
}

/**
 * Probability of three-putting.
 *
 * The paper fits a logistic here, but publishes its coefficients in a
 * parameterisation I could not reproduce from the text — substituting the
 * stated values gives probabilities that are negative or that fall with
 * distance. Rather than guess at what was meant, this uses a power law fitted
 * to the paper's two stated three-putt facts:
 *
 *     - the average is exactly two putts at 33 feet, which forces
 *       p3(33) = p1(33) since J = 2 - p1 + p3
 *     - three-putt probability first exceeds 10% at 40 feet
 *
 * Checked against a third, independent statement: this yields ~26% at 60 feet
 * where the paper's Figure 3 shows ~23%. The overshoot is because a power law
 * keeps climbing while the real curve flattens, so p3 is capped. Inside 50
 * feet — which is nearly every putt — the fit is good.
 */
export function threePuttProbability(distanceFeet, { c, exponent } = {}) {
  if (!(distanceFeet > 0)) return 0;
  const raw = c * distanceFeet ** exponent;
  return Math.max(0, Math.min(0.45, raw));
}

/** Average putts to hole out: J = p1(1) + p2(2) + p3(3) = 2 - p1 + p3. */
export function expectedPutts(distanceFeet, params) {
  if (distanceFeet == null || !Number.isFinite(distanceFeet) || distanceFeet < 0) return null;
  const p1 = onePuttProbability(distanceFeet, params);
  const p3 = threePuttProbability(distanceFeet, params);
  return Math.max(1, 2 - p1 + p3);
}

/* ---------------------------------------------------------------- solvers */

/** Bisection on a monotonic function. Deterministic, and plenty fast here. */
function solve(fn, target, lo, hi, iterations = 80) {
  let a = lo;
  let b = hi;
  const increasing = fn(hi) > fn(lo);
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    const v = fn(mid);
    if (increasing ? v < target : v > target) a = mid;
    else b = mid;
  }
  return (a + b) / 2;
}

/**
 * The angular error that puts half the putts in the hole at a given distance.
 * p1 falls as sigmaAlpha grows, so this is a clean monotonic solve.
 */
function fitSigmaAlpha(onePutt50Ft, sigmaD) {
  return solve(
    (sa) => onePuttProbability(onePutt50Ft, { sigmaAlphaDegrees: sa, sigmaD }),
    0.5,
    0.2,
    12
  );
}

/**
 * The three-putt coefficient implied by "the average is exactly two putts at
 * this distance". At that distance one-putts and three-putts must cancel, so
 * p3 = p1 there, which pins c once the exponent is known.
 */
function fitThreePuttC(twoPuttFt, exponent, puttingParams) {
  const p1 = onePuttProbability(twoPuttFt, puttingParams);
  return p1 / twoPuttFt ** exponent;
}

/* --------------------------------------------------------------- baselines */

/** Derived once at load. The anchors are the source of truth, not these. */
function buildPuttingParams({ onePutt50Ft, twoPuttFt }, exponent) {
  const sigmaD = PUTTING_MODEL.sigmaD;
  const sigmaAlphaDegrees =
    onePutt50Ft === PUTTING_ANCHORS.tour.onePutt50Ft
      ? PUTTING_MODEL.sigmaAlphaDegrees // published; don't re-fit what is given
      : fitSigmaAlpha(onePutt50Ft, sigmaD);
  const params = { sigmaAlphaDegrees, sigmaD, exponent, c: 0 };
  params.c = fitThreePuttC(twoPuttFt, exponent, params);
  return params;
}

// The exponent is a property of the shape of the three-putt curve, fitted once
// from the tour anchors and held fixed across skill levels; only the
// coefficient moves. Amateurs three-putt more at every distance, but the way
// three-putting grows with distance is a fact about greens, not about golfers.
const TOUR_P1_AT_TWO_PUTT = onePuttProbability(PUTTING_ANCHORS.tour.twoPuttFt, PUTTING_MODEL);
const P3_EXPONENT =
  Math.log(0.1 / TOUR_P1_AT_TWO_PUTT) /
  Math.log(PUTTING_ANCHORS.tour.threePuttExceeds10PctFt / PUTTING_ANCHORS.tour.twoPuttFt);

export const BASELINES = {
  tour: {
    key: 'tour',
    label: 'PGA Tour',
    k: 0,
    putting: buildPuttingParams(PUTTING_ANCHORS.tour, P3_EXPONENT),
    provenance: {
      verified: true,
      note: 'Broadie (2011) Table 9 and Section 3.3, read directly from the paper.',
    },
  },
  scratch: {
    key: 'scratch',
    label: 'Scratch',
    k: SCRATCH_CALIBRATION.kScratch,
    putting: buildPuttingParams(
      {
        onePutt50Ft: SCRATCH_CALIBRATION.scratchOnePutt50Ft,
        twoPuttFt: SCRATCH_CALIBRATION.scratchTwoPuttFt,
      },
      P3_EXPONENT
    ),
    provenance: {
      verified: false,
      note: 'Interpolated between Broadie\'s tour and 90-golfer figures, pinned to the published scratch value of 4.10 from a 400-yard tee. Full shots and putting are calibrated separately — see tour-benchmark.js.',
    },
  },
  golfer90: {
    key: 'golfer90',
    label: '90-golfer',
    k: SCRATCH_CALIBRATION.k90,
    putting: buildPuttingParams(PUTTING_ANCHORS.golfer90, P3_EXPONENT),
    provenance: {
      verified: true,
      note: 'Broadie (2011) 90-golfer figures. Included mostly as a sanity rail on the scratch derivation.',
    },
  },
};

export const BENCHMARK_PROVENANCE = Object.fromEntries(
  Object.entries(BASELINES).map(([k, v]) => [k, { label: v.label, ...v.provenance }])
);

export const DEFAULT_BASELINE = 'scratch';

/* ------------------------------------------------------------ table lookup */

const COLUMN_INDEX = Object.fromEntries(TABLE_9.columns.map((c, i) => [c, i + 1]));

/** Linear interpolation down a Table 9 column, skipping its empty head. */
function lookupTable(lie, yards) {
  const col = COLUMN_INDEX[lie];
  if (col == null) return null;
  const rows = TABLE_9.rows.filter((r) => r[col] != null);
  if (!rows.length) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  if (yards <= first[0]) {
    // Extrapolating a full shot below the table's shortest entry is not
    // meaningful, and clamping is honest: the table starts where the data does.
    return first[col];
  }
  if (yards >= last[0]) {
    const prev = rows[rows.length - 2];
    const slope = (last[col] - prev[col]) / (last[0] - prev[0]);
    return last[col] + (yards - last[0]) * slope;
  }
  for (let i = 1; i < rows.length; i++) {
    if (yards <= rows[i][0]) {
      const a = rows[i - 1];
      const b = rows[i];
      return a[col] + ((yards - a[0]) / (b[0] - a[0])) * (b[col] - a[col]);
    }
  }
  return last[col];
}

/**
 * Expected strokes to hole out.
 *
 * @param lie      tee | fairway | rough | sand | recovery | green
 * @param distance YARDS for every lie except `green`, which is FEET
 * @param opts     { baseline: 'tour' | 'scratch' | 'golfer90' }
 * @returns number, or null when the distance is unknown — never a guess
 */
export function expectedStrokes(lie, distance, { baseline = DEFAULT_BASELINE } = {}) {
  if (distance == null || !Number.isFinite(distance) || distance < 0) return null;
  const base = BASELINES[baseline];
  if (!base) return null;

  if (lie === 'green') return expectedPutts(distance, base.putting);

  // Table 9's tee column starts at 100 yards. A tee shot shorter than that is a
  // very short par 3, which plays like a shot from the fairway.
  const effectiveLie = lie === 'tee' && distance < 100 ? 'fairway' : lie;

  const tour = lookupTable(effectiveLie, distance);
  if (tour == null) return null;

  // The excess scales with the golf still to be played from here: from one foot
  // every golfer holes out in one stroke, so the gap must vanish there.
  return tour + base.k * (tour - 1);
}

export const lieUnit = (lie) => (lie === 'green' ? 'feet' : 'yards');

/* -------------------------------------------------------------- validation */

/**
 * Checks the data against the paper's own published statements. These are
 * acceptance tests, not smoke tests: if one fails, the change that broke it is
 * wrong, because the right-hand side is a quoted fact.
 */
export function validateBenchmarks() {
  const problems = [];
  const near = (actual, expected, tol, what) => {
    if (!(Math.abs(actual - expected) <= tol)) {
      problems.push(`${what}: expected ~${expected}, got ${actual.toFixed(4)}`);
    }
  };

  // --- published anchors ---------------------------------------------------
  near(
    onePuttProbability(8, BASELINES.tour.putting),
    0.5,
    0.01,
    'tour one-putts half the time from 8 ft'
  );
  near(expectedPutts(33, BASELINES.tour.putting), 2.0, 0.01, 'tour averages 2 putts from 33 ft');
  near(
    threePuttProbability(40, BASELINES.tour.putting),
    0.1,
    0.005,
    'tour three-putt probability reaches 10% at 40 ft'
  );
  near(
    onePuttProbability(5, BASELINES.golfer90.putting),
    0.5,
    0.01,
    '90-golfer one-putts half the time from 5 ft'
  );
  near(
    expectedPutts(19, BASELINES.golfer90.putting),
    2.0,
    0.01,
    '90-golfer averages 2 putts from 19 ft'
  );
  near(
    expectedStrokes('tee', 400, { baseline: 'tour' }),
    3.99,
    0.005,
    'tour tee shot from 400 yd (Table 9)'
  );
  near(
    expectedStrokes('tee', 400, { baseline: 'scratch' }),
    SCRATCH_CALIBRATION.anchorScratch,
    0.02,
    'scratch tee shot from 400 yd'
  );

  // --- ordering that has to hold ------------------------------------------
  for (const d of [50, 100, 150, 200, 300]) {
    const tour = expectedStrokes('fairway', d, { baseline: 'tour' });
    const scratch = expectedStrokes('fairway', d, { baseline: 'scratch' });
    const am = expectedStrokes('fairway', d, { baseline: 'golfer90' });
    if (!(tour < scratch && scratch < am)) {
      problems.push(`skill ordering broken from ${d} yd fairway: ${tour} / ${scratch} / ${am}`);
    }
  }
  for (const d of [10, 60, 100, 200, 400]) {
    const f = expectedStrokes('fairway', d, { baseline: 'tour' });
    const r = expectedStrokes('rough', d, { baseline: 'tour' });
    if (!(r > f)) problems.push(`rough not harder than fairway at ${d} yd`);
  }

  // The paper states sand is EASIER than rough between 15 and 34 yards and
  // harder outside it. Faithfulness to that is a good check on transcription.
  for (const d of [20, 30]) {
    if (!(lookupTable('sand', d) < lookupTable('rough', d))) {
      problems.push(`sand should beat rough at ${d} yd, per the paper`);
    }
  }
  for (const d of [10, 50, 100]) {
    if (!(lookupTable('sand', d) > lookupTable('rough', d))) {
      problems.push(`sand should be worse than rough at ${d} yd, per the paper`);
    }
  }

  // Putting must rise with distance and start at essentially a tap-in.
  let prev = 0;
  for (let ft = 1; ft <= 90; ft++) {
    const j = expectedPutts(ft, BASELINES.tour.putting);
    if (j < prev - 1e-9) problems.push(`expected putts falls between ${ft - 1} and ${ft} ft`);
    prev = j;
  }
  near(expectedPutts(1, BASELINES.tour.putting), 1.0, 0.02, 'a one-foot putt is a tap-in');

  return problems;
}
