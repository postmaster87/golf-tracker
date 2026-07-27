/**
 * DATA MODEL — the hardest thing to reverse once real rounds exist.
 *
 * Design rules, in priority order:
 *
 *  1. STORE RAW, DERIVE EVERYTHING ELSE. Every mark keeps its lat/lon,
 *     accuracy, timestamp AND the individual fixes that produced it. No
 *     distance is ever persisted — distances are recomputed from coordinates on
 *     read. If the reduction algorithm improves later, old rounds improve too.
 *
 *  2. NOTHING BENCHMARK-DEPENDENT IS PERSISTED. Strokes gained is a function of
 *     (start distance, lie) against a table. Both inputs are already here, so
 *     the SG engine is additive: it needs no migration and no re-logging.
 *
 *  3. A MARK IS WHERE THE BALL WAS PLAYED FROM, not where it finished. Shot i's
 *     length is dist(mark_i, mark_{i+1}); the last shot's length is
 *     dist(mark_last, cup). This is the only convention that makes the
 *     mark-at-the-cup workflow back-compute cleanly, and it matches how the app
 *     is actually used: you stand at the ball and tap.
 *
 *  4. PUTTS ARE SHOTS. A putt is a shot with lie 'green'. First-putt distance
 *     falls out of the same back-computation as everything else. The manual
 *     putt-count fallback is a separate, clearly-flagged path so it can never
 *     be mistaken for measured data.
 *
 *  5. MEASURED AND ENTERED DATA ARE NEVER MIXED SILENTLY. Every shot carries
 *     its source. Analysis can exclude hand-entered holes without guessing.
 *
 * Storage layout (localStorage):
 *   gt:app            -> AppState (settings, courses, round index) — small, rewritten often
 *   gt:round:<id>     -> Round    — one key per round, so a mark rewrites ~1 round, not the DB
 *
 * Keys are NOT versioned. The version lives inside the payload and `migrate()`
 * upgrades on read, so a schema bump never orphans data.
 */

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0.0';

export const LIES = ['tee', 'fairway', 'rough', 'sand', 'recovery', 'green'];

export const LIE_LABELS = {
  tee: 'Tee',
  fairway: 'Fairway',
  rough: 'Rough',
  sand: 'Sand',
  recovery: 'Recovery',
  green: 'Green',
};

export const PENALTY_TYPES = {
  water: { label: 'Water', strokes: 1 },
  ob: { label: 'OB / Lost', strokes: 1 },
  unplayable: { label: 'Unplayable', strokes: 1 },
  other: { label: 'Other', strokes: 1 },
};

export const ROUND_TYPES = ['practice', 'tournament'];
export const TEE_SETS = ['blue', 'gold', 'white', 'red'];
/** Light palettes first, then dark, so the picker reads in a sensible order. */
export const THEMES = [
  'fairway',
  'forest',
  'clay',
  'paper',
  'slate',
  'ocean',
  'ink',
  'dusk',
  'midnight',
];

export const DARK_THEMES = new Set(['dusk', 'midnight']);

export function uid(prefix = '') {
  const raw =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Default persisted application state. */
export function newAppState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    settings: {
      theme: 'fairway',
      teeSet: 'gold', // Matt plays gold for league/friends, blue solo
      startingNine: 'front',
      roundType: 'practice',
      courseId: 'veenker',
      maxAccuracyM: 8, // reject-and-warn threshold from the spec
      burstMs: 3000,
      recordTrack: true, // decimated breadcrumb for future pace/auto-advance work
      sgBaseline: 'scratch', // strokes gained benchmark: scratch per the spec
      puttUnit: 'paces', // how putt distances are entered
      paceFeet: 3.0, // Matt's stride, calibrated; used to convert paces to feet
      promptGreenEntry: true, // nudge for putts when leaving a hole without them
      // Seconds of inactivity before the pocket lock engages; 0 = manual only.
      // Adjustable mid-round from the round menu, because the right value
      // depends on how long you linger on the screen between shots.
      autoLockSec: 15,
      confirmHoleAdvance: true,
    },
    courses: {}, // custom courses only; built-ins live in courses.js
    courseLearning: {}, // courseId -> { tees: {...}, cups: {...} } accumulated positions
    activeRoundId: null,
    rounds: [], // RoundSummary[], newest first — lets History render without loading every round
  };
}

/**
 * Coordinate precision actually stored.
 *
 * A double serialises 17 significant digits, which on a latitude is 0.1
 * nanometres — from a receiver good to about two metres. That noise is not
 * free: it more than doubles the size of every stored fix, and localStorage is
 * a few megabytes for the life of the app. Seven decimal places is 1.1 cm,
 * which is still three orders of magnitude finer than the hardware can resolve.
 */
const COORD_DP = 7;

const fix = (x, dp) => (Number.isFinite(x) ? Number(x.toFixed(dp)) : null);

/**
 * Store a raw fix compactly. Optional fields the device did not report are
 * omitted entirely rather than persisted as `null` — over ~90 marks a round
 * those nulls are pure overhead.
 */
export function compactSample(s) {
  const out = {
    lat: fix(s.lat, COORD_DP),
    lon: fix(s.lon, COORD_DP),
    acc: fix(s.acc, 2),
    ts: s.ts,
  };
  if (Number.isFinite(s.alt)) out.alt = fix(s.alt, 1);
  if (Number.isFinite(s.altAcc)) out.altAcc = fix(s.altAcc, 1);
  if (Number.isFinite(s.speed)) out.speed = fix(s.speed, 2);
  if (Number.isFinite(s.heading)) out.heading = fix(s.heading, 1);
  if (s.used === false) out.used = false; // `used: true` is the default; don't store it
  if (s.reject) out.reject = s.reject;
  return out;
}

/**
 * A committed position. `lat`/`lon` are the reduced estimate; `samples` are the
 * raw fixes behind it, kept so a mark can be re-examined — or re-reduced with a
 * better algorithm — months later.
 */
export function newMark({
  lat,
  lon,
  accuracyM,
  quality = 'good',
  method = 'burst',
  samples = [],
  spreadM = null,
  usedCount = null,
}) {
  return {
    lat: fix(lat, COORD_DP),
    lon: fix(lon, COORD_DP),
    accuracyM: fix(accuracyM, 2),
    quality, // 'good' | 'degraded' | 'poor'
    method, // 'burst' | 'single' | 'manual'
    spreadM: fix(spreadM, 2),
    usedCount,
    sampleCount: samples.length,
    samples: samples.map(compactSample),
    ts: nowIso(),
  };
}

export function newShot({ seq, lie, mark = null, source = 'gps' }) {
  return {
    id: uid('s'),
    seq, // 1-based within the hole; strokes are counted from this list
    lie,
    mark,
    source, // 'gps' | 'manual'
    penalty: null, // { type, strokes, note }
    /**
     * Stepped-off distance to the hole, in feet, for this shot.
     *
     * A ±2 m fix is ±6.5 ft, which is the entire useful range of a putt — GPS
     * simply cannot measure putting, and strokes gained putting is extremely
     * sensitive to the first-putt distance. A paced distance is genuinely
     * BETTER instrumentation here, not a fallback. When set it OVERRIDES any
     * computed distance.
     */
    distanceFt: null,
    /**
     * How that number was actually produced — `{ value, unit, paceFeet }`.
     * Storing the raw count and the pace length rather than only the derived
     * feet means a recalibrated pace can be applied retroactively to rounds
     * already logged, instead of silently poisoning them.
     */
    distanceEntry: null,
    note: null,
    ts: nowIso(),
  };
}

export function newHole({ number, playOrder, par, yards, hcp }) {
  return {
    number, // course hole number (1-18)
    playOrder, // 0-based order actually played (back-nine starts differ)
    par,
    yards, // from the tee set in play
    hcp,
    shots: [],
    /**
     * Optional. Marking at the cup gives exact distances, but it is no longer
     * required to finish a hole: the ball-on-green mark plus a paced first-putt
     * distance locates the hole to within that putt, which is a sub-4% error on
     * any full shot. The green is not a place to be handling a phone.
     */
    cup: null, // Mark
    /**
     * Set when the hole's putts were entered after holing out. Records the
     * count and the units used, so a hole can be told apart from one that was
     * simply abandoned mid-way.
     */
    greenEntry: null, // { putts, unit, paceFeet, enteredAt }
    /**
     * Only populated when GPS was unavailable / the hole was hand-entered.
     * Kept separate from `shots` so measured data is never diluted.
     */
    manual: null, // { strokes, putts, firstPuttFt, fir, gir, penalties }
    completedAt: null,
    note: null,
  };
}

export function newRound({
  courseId,
  courseName,
  coursePar,
  type,
  teeSet,
  startingNine,
  holes,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    id: uid('r'),
    courseId,
    courseName,
    coursePar,
    type, // 'practice' | 'tournament'
    teeSet,
    startingNine, // 'front' | 'back'
    startedAt: nowIso(),
    completedAt: null,
    status: 'in_progress', // 'in_progress' | 'completed' | 'abandoned'
    // Stamped when the dev GPS simulator is active, so synthetic rounds can
    // always be told apart from real ones — in the UI and in any export.
    simulated: globalThis.__GT_SIM__ === true,
    currentHoleIndex: 0,
    holes,
    track: [], // decimated breadcrumb: [lat, lon, acc, ts]
    device: {
      ua: globalThis.navigator?.userAgent ?? null,
      screen: globalThis.screen ? `${screen.width}x${screen.height}` : null,
    },
    note: null,
  };
}

export function summarizeRound(round) {
  return {
    id: round.id,
    courseId: round.courseId,
    courseName: round.courseName,
    type: round.type,
    teeSet: round.teeSet,
    startingNine: round.startingNine,
    startedAt: round.startedAt,
    completedAt: round.completedAt,
    status: round.status,
  };
}

/**
 * Upgrade a persisted payload to the current schema. v1 is the floor, so this
 * is currently a no-op — it exists so the first real migration has an obvious
 * home and every read path already routes through it.
 */
export function migrate(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  let p = payload;
  if (p.schemaVersion == null) p = { ...p, schemaVersion: SCHEMA_VERSION };
  // Future: while (p.schemaVersion < SCHEMA_VERSION) { ...; p.schemaVersion++ }
  return p;
}
