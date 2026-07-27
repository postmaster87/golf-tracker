/**
 * STROKES GAINED
 *
 * One idea, applied to every shot:
 *
 *     SG = E(where you started) - E(where you ended) - 1 - penalty strokes
 *
 * Holing out means E(end) = 0. A shot that leaves you in a position worth fewer
 * expected strokes than the one it cost you gained; otherwise it lost.
 *
 * Two things this module refuses to do:
 *
 *  1. Guess a distance. If a shot's start or end position is unknown, its SG is
 *     null and it is counted as unattributed. A round card that silently drops
 *     the shots it couldn't measure would flatter every category.
 *
 *  2. Require data the green workflow doesn't collect. Per-hole putting SG only
 *     needs the first-putt distance and the putt count — E(d1) minus the putts
 *     actually taken — so it is exact even when the intermediate putts weren't
 *     paced. Individual putt SG is computed on top of that when the distances
 *     are there, but the total never depends on it.
 */

import {
  expectedStrokes,
  BENCHMARK_PROVENANCE,
  DEFAULT_BASELINE,
  CATEGORY_DEFINITION,
} from './benchmarks.js';
import { toYards, toFeet } from '../util/geo.js';
import { shotGeometry, holePutts, puttDistancesFt, isHoleComplete, penaltyStrokes } from '../round/round.js';

export const CATEGORIES = ['off_tee', 'approach', 'short_game', 'putting'];

export const CATEGORY_LABELS = {
  off_tee: 'Off the tee',
  approach: 'Approach',
  short_game: 'Short game',
  putting: 'Putting',
};

/**
 * Cut between approach and short game: 100 yards.
 *
 * This IS Broadie's own boundary — he defines the long game as shots starting
 * over 100 yards and the short game as under 100 excluding putts (2011,
 * Section 1). The 30-yard figure belongs to the PGA Tour's separate "around
 * the green" statistic, which is a different measure entirely.
 *
 * That the spec and the source agree matters: it means these category totals
 * are directly comparable to Broadie's published population figures, so the
 * approach-versus-driving argument can be settled against his data rather than
 * only against Matt's own baseline drift.
 */
export const DEFAULT_SHORT_GAME_YARDS = CATEGORY_DEFINITION.shortGameYards;

/**
 * Which category a shot belongs to, from where it was played.
 *
 * A par-3 tee shot is an approach, not a drive: the skill it tests is hitting a
 * green, and counting it as driving would flatter or punish the wrong bucket.
 * Note this is a CATEGORY decision only — the benchmark lookup still uses the
 * tee column, which is correct, because Broadie's tee data includes par 3s
 * (hence the jump in his curve between long par 3s and short par 4s).
 */
export function categorize(lie, distanceYards, par, isFirstShot, shortGameYards = DEFAULT_SHORT_GAME_YARDS) {
  if (lie === 'green') return 'putting';
  if (isFirstShot && lie === 'tee' && par >= 4) return 'off_tee';
  if (distanceYards != null && distanceYards < shortGameYards) return 'short_game';
  return 'approach';
}

/**
 * The sequence of positions on a hole, as (lie, distance) pairs the benchmark
 * tables can be looked up with. Distances are yards off the green and feet on
 * it, matching the tables' own units.
 */
export function holeStates(hole, fallbackPos = null) {
  const geo = shotGeometry(hole, fallbackPos);
  return geo.map((g) => {
    const onGreen = g.shot.lie === 'green';
    return {
      shot: g.shot,
      lie: g.shot.lie,
      distance: g.toHoleM == null ? null : onGreen ? toFeet(g.toHoleM) : toYards(g.toHoleM),
      distanceYards: g.toHoleM == null ? null : toYards(g.toHoleM),
      onGreen,
      source: g.toHoleSource,
    };
  });
}

/**
 * Per-shot strokes gained for one hole.
 *
 * Returns `{ shots: [...], categories: {...}, unattributed: n, reasons: [...] }`.
 * Putting totals come from the hole-level identity described at the top of this
 * file, so they survive unpaced second putts.
 */
export function holeStrokesGained(hole, opts = {}) {
  const {
    baseline = DEFAULT_BASELINE,
    shortGameYards = DEFAULT_SHORT_GAME_YARDS,
    fallbackPos = null,
  } = opts;

  const out = {
    shots: [],
    categories: { off_tee: 0, approach: 0, short_game: 0, putting: 0 },
    counts: { off_tee: 0, approach: 0, short_game: 0, putting: 0 },
    unattributed: 0,
    reasons: [],
  };

  if (hole.manual) {
    // A hand-entered hole has no shot-level detail. Its putting is still
    // recoverable if a first-putt distance was written down.
    const puttSG = puttingSG(hole, { baseline });
    const putts = hole.manual.putts ?? 0;
    if (puttSG != null) {
      out.categories.putting += puttSG;
      out.counts.putting += putts;
    } else if (putts > 0) {
      // Without a first-putt distance these putts produce no analysis either.
      // Dropping them silently would under-report how much of the hole the
      // round card could not account for.
      out.unattributed += putts;
      out.reasons.push(`hole ${hole.number}: hand-entered, ${putts} putt(s) with no first-putt distance`);
    }
    const others = (hole.manual.strokes ?? 0) - putts;
    out.unattributed += Math.max(0, others);
    if (others > 0) out.reasons.push(`hole ${hole.number}: hand-entered, ${others} full shot(s) have no positions`);
    return out;
  }

  if (!isHoleComplete(hole)) return out;

  const states = holeStates(hole, fallbackPos);
  const lookup = (st) => expectedStrokes(st.lie, st.distance, { baseline });

  states.forEach((st, i) => {
    const next = states[i + 1];
    const isLast = i === states.length - 1;
    const category = categorize(st.lie, st.distanceYards, hole.par, i === 0, shortGameYards);
    const penalty = st.shot.penalty?.strokes ?? 0;

    const eStart = lookup(st);
    // The last shot on a completed hole ends in the cup, which is worth nothing.
    const eEnd = isLast ? 0 : next ? lookup(next) : null;

    let sg = null;
    if (eStart != null && eEnd != null) sg = eStart - eEnd - 1 - penalty;

    out.shots.push({
      shot: st.shot,
      seq: st.shot.seq,
      lie: st.lie,
      category,
      distance: st.distance,
      distanceUnit: st.onGreen ? 'ft' : 'yd',
      distanceSource: st.source,
      expectedStart: eStart,
      expectedEnd: eEnd,
      penalty,
      sg,
    });

    // Putting is totalled separately below, from the more robust identity.
    if (category === 'putting') return;

    if (sg == null) {
      out.unattributed++;
      out.reasons.push(
        `hole ${hole.number} shot ${st.shot.seq}: ${eStart == null ? 'start' : 'end'} position unknown`
      );
      return;
    }
    out.categories[category] += sg;
    out.counts[category]++;
  });

  const puttSG = puttingSG(hole, { baseline });
  const putts = holePutts(hole) ?? 0;
  if (puttSG != null) {
    out.categories.putting += puttSG;
    out.counts.putting += putts;
  } else if (putts > 0) {
    out.unattributed += putts;
    out.reasons.push(`hole ${hole.number}: ${putts} putt(s) with no first-putt distance`);
  }

  return out;
}

/**
 * Strokes gained putting for a hole: what a benchmark player would take from
 * the first putt's distance, minus what was actually taken.
 *
 * Needs only the first-putt distance and the putt count — exactly the two
 * numbers the green workflow collects — so it does not degrade when the second
 * putt wasn't paced. Returns null if the first-putt distance is unknown, and 0
 * when the hole was finished without putting.
 */
export function puttingSG(hole, { baseline = DEFAULT_BASELINE } = {}) {
  const putts = holePutts(hole);
  if (putts == null) return null;
  if (putts === 0) return 0;
  const first = puttDistancesFt(hole)[0];
  if (first == null) return null;
  const expected = expectedStrokes('green', first, { baseline });
  if (expected == null) return null;
  return expected - putts;
}

/**
 * Strokes gained across a whole round, by category.
 *
 * `perRound` values are the raw totals. `unattributed` is the number of strokes
 * that could not be placed, and it is reported alongside every figure — the
 * point of this app is honest attribution, and a category total means nothing
 * without knowing what was left out of it.
 */
export function roundStrokesGained(round, opts = {}) {
  const totals = { off_tee: 0, approach: 0, short_game: 0, putting: 0 };
  const counts = { off_tee: 0, approach: 0, short_game: 0, putting: 0 };
  const holes = [];
  let unattributed = 0;
  const reasons = [];

  for (const hole of round.holes) {
    if (!isHoleComplete(hole)) continue;
    const fallbackPos = opts.fallbackFor?.(hole) ?? null;
    const hs = holeStrokesGained(hole, { ...opts, fallbackPos });
    for (const c of CATEGORIES) {
      totals[c] += hs.categories[c];
      counts[c] += hs.counts[c];
    }
    unattributed += hs.unattributed;
    reasons.push(...hs.reasons);
    holes.push({ number: hole.number, par: hole.par, ...hs });
  }

  const total = CATEGORIES.reduce((a, c) => a + totals[c], 0);
  return {
    baseline: opts.baseline ?? DEFAULT_BASELINE,
    provenance: BENCHMARK_PROVENANCE[opts.baseline ?? DEFAULT_BASELINE],
    totals,
    counts,
    total,
    unattributed,
    reasons,
    holes,
    holesScored: holes.length,
  };
}

/**
 * Categories ranked by strokes lost — the practice-priority output.
 *
 * Ranked on TOTAL strokes lost, not per-shot average: the question is where the
 * round is actually leaking, and a category you only face five times cannot
 * cost you as much as one you face fourteen times, however bad it is per shot.
 * The per-shot figure comes along for diagnosis.
 */
export function practicePriority(sg) {
  return CATEGORIES.map((c) => ({
    category: c,
    label: CATEGORY_LABELS[c],
    total: sg.totals[c],
    shots: sg.counts[c],
    perShot: sg.counts[c] ? sg.totals[c] / sg.counts[c] : null,
  })).sort((a, b) => a.total - b.total);
}

export function fmtSG(x, dp = 2) {
  if (x == null || !Number.isFinite(x)) return '—';
  const v = x.toFixed(dp);
  return x > 0 ? `+${v}` : v;
}
