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

import { REVISION } from './revision.js';

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

/**
 * `strokes` is the DEFAULT, not the only value — the sheet offers 1 or 2. Every
 * type was hardcoded to +1 through rev 2, which meant the general penalty in
 * stroke play, which is two strokes, could not be entered at all.
 *
 * `strokeAndDistance` drives what the app says to do next, and it is not
 * cosmetic. Matt plays lost and OB straight: no drop, replay from where the
 * last shot was played. Telling him to "mark your next shot from the drop" — as
 * every type did through rev 2 — describes a Model Local Rule E-5 relief he has
 * explicitly ruled out, and a mark taken at a drop zone that does not exist
 * puts the next shot in the wrong place.
 */
export const PENALTY_TYPES = {
  water: { label: 'Water', strokes: 1, strokeAndDistance: false },
  ob: { label: 'OB / Lost', strokes: 1, strokeAndDistance: true },
  unplayable: { label: 'Unplayable', strokes: 1, strokeAndDistance: false },
  other: { label: 'Other', strokes: 1, strokeAndDistance: false },
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
      /**
       * Full-rate position recording to IndexedDB (rev 2). This is what makes
       * shots recoverable after the round instead of during it.
       *
       * Independent of `recordTrack` on purpose: the breadcrumb is the fallback
       * that keeps a round useful when this cannot run, so turning the dense
       * track off must never turn the breadcrumb off with it.
       */
      denseTrack: true,
      sgBaseline: 'scratch', // strokes gained benchmark: scratch per the spec
      // Feet, not paces. Matt steps off in paces but converts to feet in his
      // head on the way to the phone, so asking for paces made him convert back.
      puttUnit: 'feet',
      puttUnitDefaultedToFeet: true, // fresh installs skip the one-time migration
      paceFeet: 3.0, // Matt's stride, calibrated; used to convert paces to feet
      promptGreenEntry: true, // nudge for putts when leaving a hole without them
      /**
       * Seconds of inactivity before the pocket lock engages; 0 = manual only.
       * Adjustable mid-round from the round menu.
       *
       * Was 15 through rev 2, and field test 3 showed one value failing in both
       * directions at once: too long to pocket the phone straight after a mark
       * ("I ... have to wait to put it in my pocket for the lock screen to go
       * active"), and too short while working a green ("it times out when I am
       * on the green a lot"). Those are not the same setting. The first is now
       * the floating LOCK tab, which is instant; this is only the safety net for
       * forgetting to press it, so it is free to be generous.
       *
       * Generous is also the honest setting. `noteActivity()` resets this timer
       * on any pointerdown anywhere in the document — including the phantom
       * touches a pocket generates — so a phone that is actually being sat on
       * keeps pushing the timer out and never auto-locks. The timer has always
       * been a defence against putting the phone down, not against the pocket;
       * the two-tap overlay is what defends the pocket. Tuning it as though it
       * were the pocket defence only bought the annoyance without the safety.
       */
      autoLockSec: 120,
      autoLockRaisedForLockTab: true, // fresh installs skip the one-time raise
      // Club per shot. On by default because it is the only way to find out
      // whether the extra tap is worth it; one switch turns it off.
      trackClubs: true,
      /**
       * Whether the play screen shows scoring and distances mid-round.
       * 'never' | 'tournament' | 'always'.
       *
       * Default 'tournament': in a practice round the score is a distraction
       * from the thing being practised, but in a tournament you need to know
       * where you stand. The round card and Trends are unaffected — this is
       * only about what is visible while standing over the ball.
       */
      showScoring: 'tournament',
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
    /**
     * Club id from js/data/clubs.js, or null when club tracking is off or the
     * club was not recorded.
     *
     * Null is a real answer here and must stay distinguishable from "unknown" —
     * per-club stats are only honest if a shot with no club recorded is
     * excluded from every club's numbers rather than quietly bucketed.
     */
    club: null,
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
     * Yardages Matt lasered on this hole, entered after holing out. Entry `i`
     * is the distance to the pin before shot `i + 1`.
     *
     * Hole-level rather than per-shot on purpose. Under the continuous-track
     * model the phone stays in a pocket and no shot records exist while the
     * hole is being played, so there is nothing to hang them on until the round
     * is reconstructed. A `null` entry is meaningful: it says that shot was not
     * ranged, which inside 60 yards is the normal case.
     *
     * These are ground truth, not a convenience. Three or more on one hole make
     * the pin position solvable from the track alone, which turns GPS error
     * into something measurable without any surveyed reference.
     */
    lasered: null, // { yards: (number|null)[], enteredAt }
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
    /**
     * Which build recorded this round. See js/data/revision.js.
     *
     * Stamped at creation and never updated afterwards — editing a rev-1 round
     * on a rev-3 build must not relabel where the data came from.
     */
    revision: REVISION,
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
    // Carried into the index so History can group and filter by build without
    // loading every round off disk. `?? null` keeps pre-rev rounds honest
    // rather than defaulting them to the current build.
    revision: round.revision ?? null,
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

  /*
   * 2026-07-27: putt entry moved from paces to feet.
   *
   * Changing the default alone would not have reached an existing install,
   * which is the only install that matters here — the stored 'paces' was
   * making real rounds harder to log. Applied once and recorded, so choosing
   * paces again afterwards sticks.
   */
  if (p.settings && p.settings.puttUnit === 'paces' && !p.settings.puttUnitDefaultedToFeet) {
    p = { ...p, settings: { ...p.settings, puttUnit: 'feet', puttUnitDefaultedToFeet: true } };
  }
  /*
   * 2026-08-21: auto-lock raised once the floating LOCK tab existed.
   *
   * Same reasoning as the paces migration above — the only install that matters
   * is the one that already has a value, and Matt's phone is carrying the 15 s
   * that made him unlock and re-lock repeatedly on every green in field test 3.
   * A new default alone would never reach it.
   *
   * Only the two values that were removed from the scale are touched. 30 and 60
   * are still offered, so a stored 30 or 60 is a choice and is left alone, and 0
   * means auto-lock was switched off on purpose — raising that would turn the
   * lock back on for someone who had turned it off.
   */
  if (
    p.settings &&
    !p.settings.autoLockRaisedForLockTab &&
    Number.isFinite(p.settings.autoLockSec) &&
    p.settings.autoLockSec > 0 &&
    p.settings.autoLockSec < 30
  ) {
    p = { ...p, settings: { ...p.settings, autoLockSec: 120, autoLockRaisedForLockTab: true } };
  }

  /*
   * DELIBERATELY NOT MIGRATED: `revision`.
   *
   * Rounds recorded before rev 2 carry no revision stamp, and there is no
   * honest way to add one — the app would be guessing which build produced
   * data it did not label. Design rule 5 says measured and inferred data are
   * never mixed silently, and provenance is the last field that should break
   * that rule. They stay `undefined`, and render as "unstamped".
   *
   * Do not "fix" this by defaulting to REVISION. That would relabel field-test
   * data as having come from a build that did not exist when it was recorded.
   */

  // Future: while (p.schemaVersion < SCHEMA_VERSION) { ...; p.schemaVersion++ }
  return p;
}
