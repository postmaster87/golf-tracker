/**
 * TRENDS AND PRACTICE PRIORITY
 *
 * The spec calls this the whole point of the app, and the spec also says:
 * "never smooth over small sample sizes — show n alongside every trend." That
 * second instruction shapes everything here.
 *
 * With a couple of dozen rounds, round-to-round strokes gained is dominated by
 * noise. A category average over five rounds can easily be a stroke off the
 * truth. So this module never reports a mean without its n and its spread, and
 * the hypothesis test below will say "not separated yet" for as long as that is
 * the honest answer — including forever, if the two categories really are level.
 *
 * Everything is normalised to STROKES PER 18 HOLES so that nine-hole rounds,
 * abandoned rounds and rounds with unattributed shots can sit in the same
 * series without quietly distorting it.
 */

import { roundStrokesGained, CATEGORIES, CATEGORY_LABELS } from './strokes-gained.js';
import { accumulatedHolePosition } from '../round/round.js';
import { loadRound } from '../data/store.js';
import { DEFAULT_BASELINE } from './benchmarks.js';

export const WINDOWS = [5, 10, 20];

/**
 * Per-round strokes gained, newest first.
 *
 * A round is only included if it actually carries attributable shots — an
 * abandoned round with two holes logged is not a data point about your game,
 * and letting it into a five-round average would be worse than having no
 * average at all.
 */
export function buildSeries(app, { type = 'all', courseId = 'all', baseline = DEFAULT_BASELINE, minHoles = 9 } = {}) {
  const series = [];

  for (const summary of app.rounds) {
    if (summary.status !== 'completed') continue;
    if (type !== 'all' && summary.type !== type) continue;
    if (courseId !== 'all' && summary.courseId !== courseId) continue;

    const round = loadRound(summary.id);
    if (!round) continue;

    const sg = roundStrokesGained(round, {
      baseline,
      fallbackFor: (hole) => accumulatedHolePosition(app, round.courseId, hole.number),
    });
    if (sg.holesScored < minHoles) continue;

    const scale = 18 / sg.holesScored;
    const per18 = {};
    for (const c of CATEGORIES) per18[c] = sg.totals[c] * scale;

    series.push({
      id: round.id,
      date: round.startedAt,
      courseId: round.courseId,
      courseName: round.courseName,
      type: round.type,
      teeSet: round.teeSet,
      simulated: Boolean(round.simulated),
      holesScored: sg.holesScored,
      unattributed: sg.unattributed,
      per18,
      total18: CATEGORIES.reduce((a, c) => a + per18[c], 0),
    });
  }

  // app.rounds is already newest-first, but do not rely on it.
  series.sort((a, b) => (a.date < b.date ? 1 : -1));
  return series;
}

/* ------------------------------------------------------------- statistics */

export function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation. Null below two points, where it is undefined. */
export function stdDev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Two-tailed 95% critical value. Uses t rather than 1.96 because at n = 6 the
 * normal approximation understates the interval by about 25%, which is exactly
 * the sample size this app will be living at for its first season.
 */
export function tCritical95(df) {
  const table = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16,
    2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052,
    2.048, 2.045, 2.042,
  ];
  if (df < 1) return null;
  return df <= 30 ? table[df - 1] : 1.96;
}

/** Mean with its 95% confidence interval. Honest about tiny n. */
export function summarise(xs) {
  const n = xs.length;
  if (!n) return { n: 0, mean: null, sd: null, se: null, ci: null };
  const m = mean(xs);
  const sd = stdDev(xs);
  if (sd == null) return { n, mean: m, sd: null, se: null, ci: null };
  const se = sd / Math.sqrt(n);
  const t = tCritical95(n - 1);
  return { n, mean: m, sd, se, ci: t * se };
}

/* ---------------------------------------------------------------- windows */

/**
 * Rolling 5 / 10 / 20-round windows per category.
 *
 * A window is reported even when fewer rounds exist than it asks for — with the
 * real n attached, so "last 20" reading n = 6 is visible rather than implied.
 */
export function rollingWindows(series, windows = WINDOWS) {
  const out = {};
  for (const w of windows) {
    const slice = series.slice(0, w);
    out[w] = {
      requested: w,
      rounds: slice.length,
      complete: slice.length >= w,
      categories: Object.fromEntries(
        CATEGORIES.map((c) => [c, summarise(slice.map((r) => r.per18[c]))])
      ),
      total: summarise(slice.map((r) => r.total18)),
    };
  }
  return out;
}

/**
 * Practice priority, weighted toward recent rounds.
 *
 * Exponential decay by round index with a half-life of `halfLifeRounds`: the
 * round before last counts a little less than the last one, and a round from a
 * season ago barely counts at all. Eight rounds is a compromise — short enough
 * that a swing change shows up, long enough that one bad Saturday cannot
 * reorder your practice plan.
 *
 * Ranked by weighted strokes lost per 18 holes, worst first. The unweighted
 * mean and n travel alongside so the weighting can be sanity-checked rather
 * than trusted.
 */
export function weightedPriority(series, { halfLifeRounds = 8 } = {}) {
  if (!series.length) return [];
  const lambda = Math.log(2) / halfLifeRounds;

  return CATEGORIES.map((c) => {
    let wsum = 0;
    let vsum = 0;
    series.forEach((r, i) => {
      const w = Math.exp(-lambda * i);
      wsum += w;
      vsum += w * r.per18[c];
    });
    const raw = summarise(series.map((r) => r.per18[c]));
    return {
      category: c,
      label: CATEGORY_LABELS[c],
      weighted: wsum ? vsum / wsum : null,
      mean: raw.mean,
      ci: raw.ci,
      n: raw.n,
    };
  }).sort((a, b) => a.weighted - b.weighted);
}

/* ------------------------------------------------- the open question */

/**
 * Matt's hypothesis (off the tee is the biggest leak) against his friend's
 * (approach is, per Broadie's population data).
 *
 * This is a PAIRED comparison: both categories are measured in the same rounds,
 * so the round-to-round noise that swamps either category individually — a
 * windy day, a bad night's sleep — largely cancels in the difference. Pairing
 * is what makes this answerable in a couple of dozen rounds instead of a couple
 * of hundred.
 *
 * `verdict` is deliberately allowed to stay 'undecided' indefinitely. If the
 * two categories are genuinely level, that is the correct answer forever, and
 * `roundsNeeded` will keep climbing rather than converging.
 */
export function hypothesisVerdict(series, { a = 'off_tee', b = 'approach' } = {}) {
  const diffs = series.map((r) => r.per18[a] - r.per18[b]);
  const s = summarise(diffs);

  const base = {
    a,
    b,
    labelA: CATEGORY_LABELS[a],
    labelB: CATEGORY_LABELS[b],
    n: s.n,
    meanDiff: s.mean,
    ci: s.ci,
    sd: s.sd,
    worse: null,
    verdict: 'undecided',
    roundsNeeded: null,
  };

  if (s.n < 2 || s.ci == null) {
    return { ...base, reason: s.n ? 'needs at least two rounds to see any spread' : 'no rounds yet' };
  }

  const separated = Math.abs(s.mean) > s.ci;
  // Which category is actually losing more strokes (more negative SG).
  const worse = s.mean < 0 ? a : b;

  // How many rounds would it take to resolve an effect this size, if the
  // observed mean and spread hold? n = (t·sd/|mean|)^2, iterated once because t
  // itself depends on n.
  let roundsNeeded = null;
  if (Math.abs(s.mean) > 1e-9 && s.sd != null) {
    let n = Math.max(2, Math.ceil((1.96 * s.sd / Math.abs(s.mean)) ** 2));
    const t = tCritical95(Math.min(n, 31) - 1) ?? 1.96;
    n = Math.max(2, Math.ceil((t * s.sd / Math.abs(s.mean)) ** 2));
    roundsNeeded = n;
  }

  return {
    ...base,
    worse,
    verdict: separated ? 'separated' : 'undecided',
    roundsNeeded,
    reason: separated
      ? `${CATEGORY_LABELS[worse]} is losing more, and the gap is larger than the 95% interval`
      : 'the gap is still inside the 95% interval — could go either way',
  };
}

/** Simple per-category series for sparkline-style display, oldest first. */
export function categorySeries(series, category) {
  return series
    .slice()
    .reverse()
    .map((r) => ({ date: r.date, value: r.per18[category], id: r.id }));
}
