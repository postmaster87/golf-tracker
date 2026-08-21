/**
 * Course templates.
 *
 * Veenker is verified against the Iowa PGA / BlueGolf detailed scorecard
 * (checked 2026-07-25). Par, per-tee yardages and stroke indices are internally
 * consistent: OUT 36 / IN 36 / par 72, blue 3351 + 3281 = 6632.
 *
 * Ratings/slopes are only recorded where a published value was found. Nothing
 * is guessed — a null rating shows as "not set" rather than a plausible lie.
 * (Women's tees play holes 1 and 10 as par 5 for a par of 73; irrelevant here.)
 */

export const VEENKER = {
  id: 'veenker',
  builtin: true,
  name: 'Veenker Memorial',
  /** For the home shortcut, where the full name will not fit on one line. */
  shortName: 'Veenker',
  location: 'Ames, IA',
  par: 72,
  source: 'Iowa PGA / BlueGolf detailed scorecard, verified 2026-07-25',
  teeSets: {
    blue: { label: 'Blue', yards: 6632, rating: 72.2, slope: 125 },
    gold: { label: 'Gold', yards: 6029, rating: null, slope: null },
    white: { label: 'White', yards: 5323, rating: null, slope: null },
    red: { label: 'Red', yards: 5233, rating: null, slope: null },
  },
  holes: [
    { number: 1, par: 4, hcp: 7, yards: { blue: 435, gold: 419, white: 405, red: 400 } },
    { number: 2, par: 4, hcp: 9, yards: { blue: 334, gold: 283, white: 255, red: 250 } },
    { number: 3, par: 4, hcp: 13, yards: { blue: 333, gold: 289, white: 208, red: 203 } },
    { number: 4, par: 4, hcp: 11, yards: { blue: 349, gold: 340, white: 335, red: 330 } },
    { number: 5, par: 4, hcp: 3, yards: { blue: 402, gold: 350, white: 324, red: 319 } },
    { number: 6, par: 3, hcp: 15, yards: { blue: 210, gold: 185, white: 137, red: 132 } },
    { number: 7, par: 5, hcp: 1, yards: { blue: 570, gold: 513, white: 480, red: 475 } },
    { number: 8, par: 3, hcp: 17, yards: { blue: 181, gold: 157, white: 128, red: 123 } },
    { number: 9, par: 5, hcp: 5, yards: { blue: 537, gold: 495, white: 437, red: 432 } },
    { number: 10, par: 5, hcp: 6, yards: { blue: 540, gold: 473, white: 464, red: 459 } },
    { number: 11, par: 3, hcp: 14, yards: { blue: 155, gold: 134, white: 103, red: 98 } },
    { number: 12, par: 4, hcp: 12, yards: { blue: 330, gold: 306, white: 295, red: 290 } },
    { number: 13, par: 3, hcp: 16, yards: { blue: 160, gold: 144, white: 130, red: 125 } },
    { number: 14, par: 4, hcp: 10, yards: { blue: 416, gold: 397, white: 351, red: 346 } },
    { number: 15, par: 4, hcp: 8, yards: { blue: 420, gold: 386, white: 349, red: 344 } },
    { number: 16, par: 5, hcp: 2, yards: { blue: 544, gold: 485, white: 373, red: 368 } },
    { number: 17, par: 3, hcp: 18, yards: { blue: 182, gold: 152, white: 137, red: 132 } },
    { number: 18, par: 5, hcp: 4, yards: { blue: 534, gold: 521, white: 412, red: 407 } },
  ],
};

/**
 * Radcliffe Friendly Fairways — nine holes, par 36.
 *
 * Per-hole pars and yardages from the GolfLink scorecard, checked 2026-08-21.
 * They reconcile exactly against the course's own published totals: the pars
 * sum to 36 with two par-3s and two par-5s, white sums to 3,125 and red to
 * 2,745, all three of which rffgolf.com states independently. That is the same
 * bar Veenker was held to.
 *
 * Stroke indices are NOT published anywhere found, so they are null rather than
 * invented — they show as "not set" and are irrelevant to a best-ball round
 * anyway. Rating and slope are likewise absent: GolfLink reports 0.00/0, and a
 * search result that appeared to give them could not be resolved into which
 * number was which.
 */
export const RADCLIFFE = {
  id: 'radcliffe',
  builtin: true,
  name: 'Radcliffe Friendly Fairways',
  shortName: 'Radcliffe',
  location: 'Radcliffe, IA',
  par: 36,
  source: 'GolfLink scorecard, checked 2026-08-21; totals cross-checked against rffgolf.com',
  teeSets: {
    white: { label: 'White', yards: 3125, rating: null, slope: null },
    red: { label: 'Red', yards: 2745, rating: null, slope: null },
  },
  holes: [
    { number: 1, par: 5, hcp: null, yards: { white: 520, red: 469 } },
    { number: 2, par: 3, hcp: null, yards: { white: 160, red: 145 } },
    { number: 3, par: 5, hcp: null, yards: { white: 486, red: 355 } },
    { number: 4, par: 4, hcp: null, yards: { white: 352, red: 337 } },
    { number: 5, par: 4, hcp: null, yards: { white: 326, red: 301 } },
    { number: 6, par: 4, hcp: null, yards: { white: 350, red: 336 } },
    { number: 7, par: 3, hcp: null, yards: { white: 226, red: 211 } },
    { number: 8, par: 4, hcp: null, yards: { white: 308, red: 293 } },
    { number: 9, par: 4, hcp: null, yards: { white: 397, red: 298 } },
  ],
};

export const BUILTIN_COURSES = { veenker: VEENKER, radcliffe: RADCLIFFE };

export function getCourse(app, courseId) {
  return BUILTIN_COURSES[courseId] ?? app.courses?.[courseId] ?? null;
}

export function allCourses(app) {
  return [...Object.values(BUILTIN_COURSES), ...Object.values(app.courses ?? {})];
}

/** Build a blank custom course: par 4 everywhere, one unnamed tee set. */
export function newCustomCourse(name, holeCount = 18) {
  const holes = [];
  for (let i = 1; i <= holeCount; i++) {
    holes.push({ number: i, par: 4, hcp: i, yards: { default: null } });
  }
  return {
    id: `c_${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${Date.now().toString(36)}`,
    builtin: false,
    name,
    location: null,
    par: holes.reduce((a, h) => a + h.par, 0),
    source: 'manual entry',
    teeSets: { default: { label: 'Default', yards: null, rating: null, slope: null } },
    holes,
  };
}

/**
 * Play order for a round. Veenker alternates which nine goes off first, so a
 * back start plays 10..18 then 1..9. Nine-hole rounds stop after the first nine.
 */
export function playOrder(course, startingNine, holeCount = 18) {
  const n = course.holes.length;
  /*
   * A course with one nine has no back nine to start on.
   *
   * Guarded here rather than in the setup screen, which already hides the
   * control: `startingNine` is a persisted setting, so arriving at a nine-hole
   * course after a back-nine round at Veenker would otherwise deal the holes
   * 5-9 then 1-4 with nothing on screen saying so. The caller cannot be relied
   * on to know that; the course knows.
   */
  if (n < 18) return course.holes.slice(0, Math.min(holeCount, n));
  const nine = Math.floor(n / 2);
  const front = course.holes.slice(0, nine);
  const back = course.holes.slice(nine);
  const ordered = startingNine === 'back' ? [...back, ...front] : [...front, ...back];
  return ordered.slice(0, Math.min(holeCount, n));
}

/** Yardage for a hole from the tee set in play, falling back to any tee set. */
export function holeYards(hole, teeSet) {
  if (hole.yards == null) return null;
  if (hole.yards[teeSet] != null) return hole.yards[teeSet];
  const first = Object.values(hole.yards).find((v) => v != null);
  return first ?? null;
}
