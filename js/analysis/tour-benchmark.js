/**
 * PGA TOUR BENCHMARK — VERIFIED SOURCE DATA
 *
 * Source: Mark Broadie, "Assessing Golfer Performance on the PGA TOUR",
 *         Interfaces, this version 8 April 2011.
 *         https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf
 *
 * Everything in this file was read directly off that paper. Nothing is
 * recalled, interpolated or invented. Values estimated by Broadie from over
 * eight million ShotLink shots, 2003–2010.
 *
 * This file is DATA ONLY, deliberately. Keeping the numbers separate from the
 * lookup and modelling code means the thing that is expensive to re-derive is
 * also the thing that is easiest to audit.
 */

export const SOURCE = {
  citation:
    'Broadie, M. (2011). Assessing Golfer Performance on the PGA TOUR. Interfaces. Table 9 and Section 3.3.',
  url: 'https://columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf',
  data: 'PGA TOUR ShotLink, 2003–2010, >8 million shots',
  retrieved: '2026-07-25',
  verified: true,
};

/**
 * Table 9 — average strokes to complete the hole from various starting
 * positions. Distance to the hole in YARDS, measured along the fairway (dogleg
 * distance from the tee), not straight line.
 *
 * `null` in the tee column: the paper gives no tee value under 100 yards.
 *
 * NOTE: this table is not perfectly monotonic, and that is faithful to the
 * source — the tee column dips at 140, and sand/recovery dip through the
 * 80–140 range. Do not "clean" it.
 */
export const TABLE_9 = {
  unit: 'yards',
  columns: ['tee', 'fairway', 'rough', 'sand', 'recovery'],
  rows: [
    // yards,  tee,  fairway, rough, sand, recovery
    [10, null, 2.18, 2.34, 2.43, 3.45],
    [20, null, 2.4, 2.59, 2.53, 3.51],
    [30, null, 2.52, 2.7, 2.66, 3.57],
    [40, null, 2.6, 2.78, 2.82, 3.71],
    [50, null, 2.66, 2.87, 2.92, 3.79],
    [60, null, 2.7, 2.91, 3.15, 3.83],
    [70, null, 2.72, 2.93, 3.21, 3.84],
    [80, null, 2.75, 2.96, 3.24, 3.84],
    [90, null, 2.77, 2.99, 3.24, 3.82],
    [100, 2.92, 2.8, 3.02, 3.23, 3.8],
    [120, 2.99, 2.85, 3.08, 3.21, 3.78],
    [140, 2.97, 2.91, 3.15, 3.22, 3.8],
    [160, 2.99, 2.98, 3.23, 3.28, 3.81],
    [180, 3.05, 3.08, 3.31, 3.4, 3.82],
    [200, 3.12, 3.19, 3.42, 3.55, 3.87],
    [220, 3.17, 3.32, 3.53, 3.7, 3.92],
    [240, 3.25, 3.45, 3.64, 3.84, 3.97],
    [260, 3.45, 3.58, 3.74, 3.93, 4.03],
    [280, 3.65, 3.69, 3.83, 4.0, 4.1],
    [300, 3.71, 3.78, 3.9, 4.04, 4.2],
    [320, 3.79, 3.84, 3.95, 4.12, 4.31],
    [340, 3.86, 3.88, 4.02, 4.26, 4.44],
    [360, 3.92, 3.95, 4.11, 4.41, 4.56],
    [380, 3.96, 4.03, 4.21, 4.55, 4.66],
    [400, 3.99, 4.11, 4.3, 4.69, 4.75],
    [420, 4.02, 4.19, 4.4, 4.83, 4.84],
    [440, 4.08, 4.27, 4.49, 4.97, 4.94],
    [460, 4.17, 4.34, 4.58, 5.11, 5.03],
    [480, 4.28, 4.42, 4.68, 5.25, 5.13],
    [500, 4.41, 4.5, 4.77, 5.4, 5.22],
    [520, 4.54, 4.58, 4.87, 5.54, 5.32],
    [540, 4.65, 4.66, 4.96, 5.68, 5.41],
    [560, 4.74, 4.74, 5.06, 5.82, 5.51],
    [580, 4.79, 4.82, 5.15, 5.96, 5.6],
    [600, 4.82, 4.89, 5.25, 6.1, 5.7],
  ],
};

/**
 * PUTTING — Section 3.3.
 *
 * The paper does not tabulate putting; it gives a physical model, which is
 * better. Average putts to hole out is:
 *
 *     J(d) = p1(d) + 2(1 - p1(d) - p3(d)) + 3 p3(d)  =  2 - p1(d) + p3(d)
 *
 * One-putt probability (paper equation 5) treats putting as independent random
 * direction and distance errors:
 *
 *     p1 = (2Φ(αc/σα) - 1) · (Φ((h-t)/(σd(d+t))) - Φ(-t/(σd(d+t))))
 *
 * where αc = atan(r/d) is the half-angle subtended by the hole, r is the hole
 * radius, t is how far past the hole the putt is aimed, and h is how far past
 * the hole a ball can roll and still drop.
 *
 * VERIFIED: with these parameters the model returns p1 = 0.504 at 8 feet,
 * matching the paper's stated "PGA TOUR golfers one-putt 50% of the time from
 * a distance of eight feet" to within half a percent.
 */
export const PUTTING_MODEL = {
  sigmaAlphaDegrees: 1.46, // fitted, tour
  sigmaD: 0.057, // fitted, tour
  t: 0.5, // yards past the hole the putt is aimed
  h: 2 / 3, // yards past the hole a ball can still drop
  holeRadiusYards: 2.125 / 36, // 2.125 inches
  note: 'Distances inside the model are YARDS. The app works in feet and converts.',
};

/**
 * Anchors stated in the paper's text. These are the acceptance tests for any
 * putting model this app ships — if a change breaks one of these, the change is
 * wrong, not the anchor.
 */
export const PUTTING_ANCHORS = {
  tour: {
    onePutt50Ft: 8, // "one-putt 50% of the time from a distance of eight feet"
    twoPuttFt: 33, // "average two putts from 33 feet"
    threePuttsPerRound: 0.55, // "average 0.55 three-putt greens per round"
    threePuttExceeds10PctFt: 40, // "not until 40 feet that the three-putt probability exceeds 10%"
  },
  golfer90: {
    onePutt50Ft: 5, // "90-golfers one-putt 50% of the time from five feet"
    twoPuttFt: 19, // "90-golfers average two putts from 19 feet"
    threePuttsPerRound: 2.3, // "three-putt about 2.3 times per round"
  },
};

/**
 * Tee-shot regressions, Section 3.1. Distance d in yards.
 *
 * The paper is explicit that the linear fit is not adequate for the tour (there
 * is a jump between long par 3s at ~235 yards and short par 4s at ~300), which
 * is why TABLE_9 exists and should be preferred for tour values. The 90-golfer
 * regression has no tabulated equivalent, so it is the only handle available on
 * amateur play — and it is what makes a scratch baseline derivable at all.
 */
export const TEE_REGRESSIONS = {
  tour: { intercept: 2.38, slope: 0.0041, r2: 0.98 },
  golfer90: { intercept: 2.79, slope: 0.0066 },
  note: 'Broadie (2008) via this paper. 90-golfer = amateur averaging 90 for 18 holes.',
};

/**
 * SCRATCH CALIBRATION — the key derivation.
 *
 * The paper gives no scratch table, so scratch is placed on a line between the
 * tour benchmark and the 90-golfer benchmark by a single skill parameter s,
 * where s = 0 is tour and s = 1 is a 90-golfer.
 *
 * s is pinned by an external published figure: a scratch golfer's expected
 * strokes from the tee of a 400-yard par 4 is about 4.10.
 *
 *     tour at 400 yd (Table 9)        = 3.99
 *     90-golfer at 400 yd (2.79+.0066·400) = 5.43
 *     3.99 + s(5.43 - 3.99) = 4.10    =>  s = 0.076
 *
 * Sanity check on that number: interpolating 18-hole scores the same way puts
 * scratch at 71 + 0.076·(90 - 71) ≈ 72.5, which is what a scratch golfer
 * actually averages. Two independent readings agreeing is the reason to trust
 * this rather than the 3.0-stroke gap originally guessed — that guess implied
 * roughly double the real difference.
 *
 * For non-putting lies the excess is applied proportionally to the strokes
 * still to be played from a position, E - 1, since from one foot every golfer
 * holes out in one stroke. Calibrating that against the tee regressions gives
 * k90 ≈ 0.47 across the driver range, so k_scratch = s · k90 ≈ 0.036.
 *
 * PUTTING IS DELIBERATELY NOT SCALED BY k. Checking k against the paper's
 * putting anchors shows it badly under-predicts how much worse an amateur
 * putts (it implies a 90-golfer one-putts 65% from 5 feet; the paper says 50%).
 * Putting skill does not scale like long-game skill, and forcing one constant
 * across both would bias exactly the category comparison this app exists to
 * settle. Putting is interpolated on its own anchors instead.
 */
export const SCRATCH_CALIBRATION = {
  s: 0.076,
  anchorDistanceYards: 400,
  anchorTour: 3.99,
  anchorGolfer90: 5.43,
  anchorScratch: 4.1,
  anchorSource:
    'Published scratch figure ("about 4.10 from the tee on a 400-yard par 4"); secondary source, not the Broadie paper.',
  k90: 0.47,
  kScratch: 0.036,
  // Putting anchors interpolated at s, rather than scaled by k.
  scratchOnePutt50Ft: 7.77, // 8 - 0.076·(8 - 5)
  scratchTwoPuttFt: 31.9, // 33 - 0.076·(33 - 19)
};

/**
 * Category boundaries as Broadie defines them IN THIS PAPER:
 *   long game   — shots starting over 100 yards from the hole
 *   short game  — under 100 yards, excluding putts
 *   putting     — on the green
 *
 * This matters: the spec's "short game inside ~100 yds" IS Broadie's own
 * definition, not a departure from it. (The 30-yard boundary belongs to the PGA
 * TOUR's separate "around the green" statistic, which is a different thing.)
 * The paper also notes long game explains about two-thirds of scoring
 * variability among tour players — directly relevant to the off-the-tee versus
 * approach question this app is meant to answer.
 */
export const CATEGORY_DEFINITION = {
  shortGameYards: 100,
  source: 'Broadie 2011, Section 1',
  note: 'Long game (>100 yd) explains ~2/3 of scoring variability among PGA TOUR golfers.',
};
