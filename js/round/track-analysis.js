/**
 * STOP DETECTION — turning a dense track into ranked candidates.
 *
 * THE DESIGN POSITION THIS IMPLEMENTS
 *
 * Propose and confirm, NOT detect. The app does not have to find every shot.
 * Matt knows his score, so the problem is not unsupervised detection — it is
 * ranking candidate stops so the right ones are near the top and he confirms
 * them. That is a much easier problem, and it fails gracefully: a bad ranking
 * costs taps, where a bad classifier costs data.
 *
 * Nothing here decides what a shot IS. It emits stops with the features a human
 * (or, later, a trained model) needs to judge them. Every threshold below is a
 * default, not a truth, and every candidate keeps the raw numbers behind its
 * score so a wrong call can be diagnosed instead of guessed at.
 *
 * WHAT THE SIGNAL ACTUALLY IS — REWRITTEN 2026-09-10, FROM MEASUREMENT
 *
 * It is dwell. This module previously said the opposite, in this comment, and
 * built its score around it: "Not dwell length... The TRANSITION carries it:
 * arrival at zero speed after cart motion, then departure a long way." That was
 * reasoned from how golf looks, not measured, and it was wrong in both halves.
 *
 * Measured over 444 stops across 24 played holes and four rounds — a scramble,
 * two rounds riding, and one cart-path-only — comparing stops that sit on a
 * confirmed mark against those that do not:
 *
 *   dwell          62.9 s  vs  19.0 s     the only feature that separates
 *   arrival speed   4.60 m/s vs 4.31 m/s  nothing
 *   spread         11.6 m  vs  11.4 m     nothing
 *   fix count      93      vs  33         dwell again, in another unit
 *
 * `departureM` — distance to the next stop — was the most heavily weighted term
 * and carries no signal at all: 20.5 m at real shots against 23.7 m elsewhere
 * on the cart-path round, 22.4 vs 23.3 riding. The reason is structural rather
 * than incidental. There are ~2.4 non-shot stops for every shot stop, and the
 * nearest one sits a median 20-21 m from the ball in every regime measured: the
 * partner's ball when riding, the cart you walked back to on a cart-path day.
 * So the "next stop" is almost never where the ball went. Redefining it to skip
 * companion stops does not rescue it either — at a 30 m skip it reads 50.1 m at
 * shots against 46.0 m elsewhere, and adding it to dwell in any form makes dwell
 * worse. Non-shot stops lie on the same line of travel as shots, so "distance to
 * somewhere further along" cannot separate the two at any threshold.
 *
 * The old score therefore ranked real shots BELOW the noise: 25/89 (28%) of
 * confirmed shots selected across those four rounds. Dwell alone gets 66/89
 * (74%), and nothing measured improves on it — capping it costs accuracy by
 * creating ties, and spread, fix count and arrival speed each change nothing.
 *
 * So the score is dwell, and only dwell. It is `d / (d + 45 s)`: bounded in
 * [0, 1) for display, strictly increasing for ever so the ranking is exactly
 * the dwell ordering with no ties, and crossing 0.5 at 45 s — between the two
 * measured medians, which is what makes "strong candidate" mean something.
 *
 * The other features stay ON the candidate. They are real measurements, they
 * are what a trained model would want, and one of them being useless for
 * ranking today is not a reason to stop recording it. They simply no longer
 * vote.
 *
 * KNOWN FALSE POSITIVES, DELIBERATELY NOT FILTERED OUT
 *
 *  - Behind the hole. Matt walks behind every cup to read the putt back the
 *    other way, "every time no deviation". That is a real stop that is not a
 *    shot. It is surfaced with its short dwell rather than suppressed.
 *  - Sitting in the cart while a partner plays. The phone rides in his pocket,
 *    so a cart at rest is a stop. Confirmation resolves it; a filter would
 *    guess.
 *
 * Suppressing either one here would destroy the labelled examples that make
 * this trainable, which is a stated requirement and not a nice-to-have.
 */

import { distanceM, weightedCentroid, enuOffset, offsetPoint, bearingDeg, toFeet, toYards } from '../util/geo.js';
import { expandFix } from '../data/trackstore.js';
import { toGreen, lieAt, nearestHole } from './course-geometry.js';

/**
 * Defaults, all overridable per call.
 *
 * `stopRadiusM` is the one to understand. It must exceed GPS scatter while
 * standing still or a single stop fragments into several. Reported accuracy is
 * 4-8 m (`maxAccuracyM: 8`, `goodAccM: 4` in js/gps/gps.js), and scatter runs
 * wider than reported accuracy, so 12 m is deliberately generous. The cost of
 * too large is merging a stop with an adjacent one; the cost of too small is
 * shredding every stop into noise, which is far worse for ranking.
 */
/**
 * The dwell at which a stop is even money, in seconds.
 *
 * Sets where `d / (d + HALF)` crosses 0.5, which is the threshold the round
 * summary already uses to count "strong" candidates. 45 s sits between the two
 * measured medians — 62.9 s on stops that carry a confirmed mark, 19.0 s on
 * those that do not — so the count means "stops that look more like a shot than
 * not" rather than an arbitrary line. Changing it re-labels candidates; it can
 * never change their ORDER, because the curve is monotonic in dwell whatever
 * this is set to.
 */
export const DWELL_HALF_S = 45;

export const DEFAULTS = {
  stopRadiusM: 12,
  minDwellMs: 6000,
  /** Fixes worse than this are dropped before segmenting. */
  maxAccuracyM: 20,
  /** Gap that means the receiver dropped out; never bridged into one stop. */
  maxGapMs: 60000,
};

/** Normalise input: accepts stored point arrays or already-expanded objects. */
function toFixes(points) {
  const out = [];
  for (const p of points ?? []) {
    const f = Array.isArray(p) ? expandFix(p) : p;
    if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lon) || !Number.isFinite(f.ts)) {
      continue;
    }
    out.push(f);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Inverse-variance centroid of a run of fixes, reusing the GPS reducer. */
function centroidOf(fixes) {
  const c = weightedCentroid(fixes.map((f) => ({ lat: f.lat, lon: f.lon, acc: f.acc ?? 8 })));
  return c ?? { lat: fixes[0].lat, lon: fixes[0].lon };
}

/** Largest distance from the centroid — how tight the cluster actually is. */
function spreadOf(fixes, centre) {
  let max = 0;
  for (const f of fixes) max = Math.max(max, distanceM(centre, f));
  return max;
}

/**
 * Median speed over a run of fixes.
 *
 * Device speed when present, otherwise differentiated from positions. The
 * fallback is noticeably noisier — differentiating a ±4 m position over a 1 s
 * interval yields metres per second of pure noise — so `speedSource` is
 * reported alongside and a consumer that cares can weight it down.
 */
function medianSpeed(fixes) {
  const reported = fixes.map((f) => f.speed).filter((s) => Number.isFinite(s));
  if (reported.length >= Math.max(2, fixes.length / 2)) {
    return { speed: median(reported), speedSource: 'device' };
  }
  const derived = [];
  for (let i = 1; i < fixes.length; i++) {
    const dt = (fixes[i].ts - fixes[i - 1].ts) / 1000;
    if (dt > 0.2) derived.push(distanceM(fixes[i - 1], fixes[i]) / dt);
  }
  if (!derived.length) return { speed: null, speedSource: 'none' };
  return { speed: median(derived), speedSource: 'derived' };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Split a track into alternating stops and moves.
 *
 * Standard stay-point clustering: extend the current cluster while every fix
 * stays within `stopRadiusM` of its running centroid, close it when one does
 * not. A closed cluster long enough to clear `minDwellMs` is a stop; anything
 * else is movement.
 *
 * The centroid is recomputed as the cluster grows rather than anchored on the
 * first fix, so a stop does not drift out of its own radius when the receiver
 * wanders — which it does, constantly, while standing still.
 */
export function segmentTrack(points, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const fixes = toFixes(points).filter((f) => !Number.isFinite(f.acc) || f.acc <= cfg.maxAccuracyM);
  if (fixes.length === 0) return [];

  const segments = [];
  let cluster = [fixes[0]];
  let centre = { lat: fixes[0].lat, lon: fixes[0].lon };

  const close = (next) => {
    const dwellMs = cluster[cluster.length - 1].ts - cluster[0].ts;
    const c = centroidOf(cluster);
    segments.push({
      kind: dwellMs >= cfg.minDwellMs ? 'stop' : 'move',
      lat: c.lat,
      lon: c.lon,
      startTs: cluster[0].ts,
      endTs: cluster[cluster.length - 1].ts,
      dwellMs,
      n: cluster.length,
      spreadM: Number(spreadOf(cluster, c).toFixed(1)),
      ...medianSpeed(cluster),
    });
    cluster = next ? [next] : [];
    if (next) centre = { lat: next.lat, lon: next.lon };
  };

  for (let i = 1; i < fixes.length; i++) {
    const f = fixes[i];
    const gap = f.ts - cluster[cluster.length - 1].ts;
    // A receiver dropout is not evidence of standing still. Break the cluster
    // rather than treating a two-minute hole in the data as a two-minute dwell.
    if (gap > cfg.maxGapMs) {
      close(f);
      continue;
    }
    if (distanceM(centre, f) <= cfg.stopRadiusM) {
      cluster.push(f);
      centre = centroidOf(cluster);
    } else {
      close(f);
    }
  }
  if (cluster.length) close(null);

  return mergeAdjacentStops(segments, cfg);
}

/**
 * Fold a stop / tiny-move / stop sandwich back into one stop.
 *
 * Shuffling the feet, or a reset — which Matt says re-runs the whole routine —
 * can push one fix past the radius and split a single dwell in two. Both halves
 * then look too short to matter and the real stop disappears from the ranking.
 * Only merges when the intervening movement went nowhere.
 */
function mergeAdjacentStops(segments, cfg) {
  const out = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    const beforePrev = out[out.length - 2];
    if (
      prev &&
      beforePrev &&
      seg.kind === 'stop' &&
      beforePrev.kind === 'stop' &&
      prev.kind === 'move' &&
      distanceM(beforePrev, seg) <= cfg.stopRadiusM * 1.5
    ) {
      out.pop(); // the tiny move
      const merged = out.pop(); // the earlier stop
      const c = {
        lat: (merged.lat + seg.lat) / 2,
        lon: (merged.lon + seg.lon) / 2,
      };
      out.push({
        ...merged,
        ...c,
        endTs: seg.endTs,
        dwellMs: seg.endTs - merged.startTs,
        n: merged.n + prev.n + seg.n,
        spreadM: Math.max(merged.spreadM, seg.spreadM),
        merged: (merged.merged ?? 1) + 1,
      });
      continue;
    }
    out.push(seg);
  }
  return out;
}

/**
 * Ranked stop candidates.
 *
 * Each carries its own features and a `reasons` list, because a score with no
 * explanation is untestable and unfixable — and because these become the
 * labelled examples that make the thing trainable.
 *
 * `departureM` is straight-line distance to the NEXT stop. It is kept because
 * it is a real measurement and a future model may find a use for it, but it no
 * longer scores anything: measured, it does not separate shots from anything
 * else, and the header explains why that is structural rather than a tuning
 * problem. The score is dwell.
 */
export function stopCandidates(points, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const segments = segmentTrack(points, cfg);
  const stops = segments.filter((s) => s.kind === 'stop');

  return stops.map((stop, i) => {
    const next = stops[i + 1] ?? null;
    const prevMove = precedingMove(segments, stop);
    const departureM = next ? Number(distanceM(stop, next).toFixed(1)) : null;
    const arrivalSpeed = prevMove?.speed ?? null;

    const dwellS = stop.dwellMs / 1000;

    /*
     * The score IS the dwell. See the header for the measurements.
     *
     * d / (d + HALF) rather than a clamped ramp, for two reasons. It is
     * strictly increasing with no ceiling, so ranking by score is exactly
     * ranking by dwell and two long stops never tie — capping at 90 s or 120 s
     * measurably costs accuracy (69% against 74%) by manufacturing ties among
     * precisely the stops most likely to be shots. And it is bounded below 1,
     * so it still reads as a confidence and the existing `score >= 0.5` test on
     * the round summary keeps working — that threshold now means "stood at
     * least HALF seconds", which falls between the measured medians of 62.9 s
     * on shots and 19.0 s elsewhere.
     */
    const score = dwellS / (dwellS + DWELL_HALF_S);

    /*
     * Reasons are the evidence FOR THE SCORE, so dwell leads and is the only
     * one phrased as a judgement. The rest are observations, deliberately
     * neutral now that they do not vote — the old list asserted "ball went
     * 25 yd" about a number that turned out to describe the walk back to the
     * cart, which is worse than saying nothing.
     */
    const reasons = [`stood ${Math.round(dwellS)} s`];
    if (departureM == null) reasons.push('last stop on the track');
    else reasons.push(`next stop ${Math.round(toYards(departureM))} yd away`);
    if (Number.isFinite(arrivalSpeed)) {
      reasons.push(
        arrivalSpeed > 2.5
          ? `arrived at ${arrivalSpeed.toFixed(1)} m/s (cart)`
          : `arrived on foot (${arrivalSpeed.toFixed(1)} m/s)`
      );
    }

    reasons.push(`${stop.n} fixes, ${Math.round(toFeet(stop.spreadM))} ft spread`);

    return {
      lat: stop.lat,
      lon: stop.lon,
      startTs: stop.startTs,
      endTs: stop.endTs,
      dwellMs: stop.dwellMs,
      n: stop.n,
      spreadM: stop.spreadM,
      speedSource: stop.speedSource,
      merged: stop.merged ?? 1,
      arrivalSpeed,
      departureM,
      score: Number(score.toFixed(3)),
      reasons,
    };
  });
}

/** The movement segment immediately before a stop, if there is one. */
function precedingMove(segments, stop) {
  const i = segments.indexOf(stop);
  for (let j = i - 1; j >= 0; j--) {
    if (segments[j].kind === 'move') return segments[j];
    if (segments[j].kind === 'stop') return null;
  }
  return null;
}

/**
 * The `n` best candidates within a time window, best first.
 *
 * This is the call the end-of-hole screen will make: Matt enters that he took 5
 * on the hole, and the app proposes the 5 highest-scoring stops between teeing
 * off and holing out. Ordering the RESULT by time (not score) matters — a shot
 * list out of sequence is unreadable, however well ranked.
 */
export function proposeStops(points, { fromTs, toTs, count, ...opts } = {}) {
  const all = stopCandidates(points, opts);
  const within = all.filter(
    (c) => (fromTs == null || c.endTs >= fromTs) && (toTs == null || c.startTs <= toTs)
  );
  if (count == null) return within;
  return [...within]
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.startTs - b.startTs);
}

/* ------------------------------------------------------ first putt recovery */

/**
 * Green-scale segmentation defaults.
 *
 * The shot-scale `stopRadiusM` of 12 m is useless here: a green is roughly 25 m
 * across, so a 12 m radius swallows the ball, the read from behind the hole and
 * the cup into a single stop. 7 m is the smallest radius that still survives
 * the scatter of a stationary receiver, and it is knowingly close to that noise
 * floor — which is why everything below reports its uncertainty rather than
 * just a number.
 */
export const GREEN_DEFAULTS = {
  stopRadiusM: 7,
  minDwellMs: 4000,
  maxAccuracyM: 12,
  /** Beyond this from the other anchor, a stop is not on this green. */
  maxPuttM: 40,
};

const M_TO_FT = 3.280839895;

/**
 * PROPOSE A FIRST-PUTT DISTANCE FROM THE TRACK.
 *
 * Backup A in the rev 3 backlog: supply a first-putt distance when none was
 * entered, so those strokes are not dropped from strokes gained entirely.
 *
 * READ THIS BEFORE TRUSTING THE OUTPUT
 *
 * `schema.js` already states the case against doing this at all, and it is
 * right: "a ±2 m fix is ±6.5 ft, which is the entire useful range of a putt —
 * GPS simply cannot measure putting, and strokes gained putting is extremely
 * sensitive to the first-putt distance." Nothing here repeals that. A paced
 * distance is better instrumentation and stays the primary path.
 *
 * What makes this worth having anyway is the alternative. An unrecorded first
 * putt does not degrade the number — it deletes those strokes from the round,
 * and field test 3 measured what that costs: putting read +0.52 with four
 * strokes unattributed and +0.19 once they were filled in. Every gap that
 * closed took something off his best category. A rough distance lands in
 * roughly the right band of the expected-putts curve; no distance at all lands
 * nowhere, and flatters him.
 *
 * Two things make this better than the raw ±3 m suggests, and one much worse:
 *
 *   BETTER  Both anchors come from one receiver minutes apart on one green, so
 *           most of the error is common-mode — same satellites, same multipath
 *           — and cancels in the difference. This is why field test 3 recovered
 *           hole 8's cup to within 1.5 ft of the ball mark.
 *   BETTER  Every anchor is a cluster centroid, not a single fix.
 *   WORSE   The expected-putts curve is steep inside 10 ft. At 25 ft an error
 *           of 8 ft barely moves the answer; at 5 ft it changes it completely.
 *           So `confidence` is downgraded on short estimates however tight the
 *           geometry looks.
 *
 * Propose and confirm, never detect and fill. The return value is an argument
 * with its evidence attached, for Matt to accept or overrule — the same
 * position the rest of this module takes, and design rule 5's requirement that
 * measured and inferred data are never silently mixed.
 *
 * @param points  Dense track for the round (stored arrays or expanded fixes).
 * @param ball    The marked ball position on the green, or null.
 * @param cup     The marked cup position, or null.
 * @param fromTs  Start of the green window — the ball mark, or the approach.
 * @param toTs    End of the window — when the hole was completed.
 * @returns null, or a proposal with `distanceFt`, `uncertaintyFt`,
 *          `confidence`, both anchors with their `source`, and `reasons`.
 */
export function proposeFirstPutt(
  points,
  { ball = null, cup = null, fromTs = null, toTs = null, ...opts } = {}
) {
  const cfg = { ...DEFAULTS, ...GREEN_DEFAULTS, ...opts };

  // Nothing to infer: `firstPuttM` already computes this from two real marks,
  // and a track guess must never override a measurement.
  if (ball && cup) return null;

  const window = toFixes(points).filter(
    (f) => (fromTs == null || f.ts >= fromTs) && (toTs == null || f.ts <= toTs)
  );
  if (window.length < 4) return null;

  const stops = segmentTrack(window, cfg).filter((s) => s.kind === 'stop');
  if (!stops.length) return null;

  const reasons = [];
  const near = (a, b) => distanceM(a, b) <= cfg.maxPuttM;
  const asAnchor = (stop) => ({
    lat: stop.lat,
    lon: stop.lon,
    source: 'track',
    spreadM: stop.spreadM,
    dwellMs: stop.dwellMs,
  });

  let ballAt = ball
    ? { lat: ball.lat, lon: ball.lon, source: 'mark', spreadM: ball.accuracyM ?? null }
    : null;
  let cupAt = cup ? { lat: cup.lat, lon: cup.lon, source: 'mark', spreadM: cup.accuracyM ?? null } : null;

  if (ballAt && !cupAt) {
    /*
     * The cup is where he stood to pick the ball out, which is the LAST stop on
     * this green — his routine walks behind the hole to read the putt first, so
     * an earlier in-range stop is the read, not the cup. Restricting to stops
     * within a putt's reach of the ball is what keeps the next tee out of it
     * when the window runs long, which it does whenever the putts are entered
     * after walking off.
     */
    const away = stops.filter((s) => near(ballAt, s) && distanceM(ballAt, s) > cfg.stopRadiusM);
    if (!away.length) return null;
    // Longest dwell, not simply the latest. Walking 25 m across a green at
    // 1.3 m/s produces clusters that clear `minDwellMs` on their own — the
    // radius closes a cluster roughly every 10 s of walking — so "the last
    // stop" can easily be an artifact of the walk itself. Time spent standing
    // is the discriminator that survives: reading, putting out and picking the
    // ball out of the cup all happen in one place, and none of the walking
    // artifacts come close. Latest wins a tie, since retrieval is last.
    const cupStop = away.reduce((best, s) =>
      s.dwellMs > best.dwellMs || (s.dwellMs === best.dwellMs && s.endTs > best.endTs) ? s : best
    );
    cupAt = asAnchor(cupStop);
    reasons.push(
      away.length > 1
        ? `cup taken as the longest of ${away.length} stops away from the ball (${Math.round(cupStop.dwellMs / 1000)} s)`
        : `cup taken as the only stop away from the ball (${Math.round(cupStop.dwellMs / 1000)} s)`
    );
  } else if (cupAt && !ballAt) {
    // Mirror image: he arrives at his ball before he reaches the hole, so the
    // ball is the FIRST in-range stop.
    const away = stops.filter((s) => near(cupAt, s) && distanceM(cupAt, s) > cfg.stopRadiusM);
    if (!away.length) return null;
    // Earliest rather than longest here: he reaches his own ball before he
    // reaches the hole, and the ball is the one place on the green he is
    // guaranteed to stand before putting.
    ballAt = asAnchor(away[0]);
    reasons.push(`ball taken as the first stop away from the cup (${away.length} candidate(s))`);
  } else {
    // Neither marked. The window's first and last stops, and only if they are
    // close enough together to be one green.
    if (stops.length < 2) return null;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!near(first, last)) return null;
    ballAt = asAnchor(first);
    cupAt = asAnchor(last);
    reasons.push('neither the ball nor the cup was marked — both ends came from the track');
  }

  const metres = distanceM(ballAt, cupAt);
  if (!Number.isFinite(metres) || metres > cfg.maxPuttM) return null;

  const distanceFt = Number((metres * M_TO_FT).toFixed(1));

  /*
   * HOW WRONG THIS COULD BE
   *
   * Not the cluster's spread. `spreadM` is the largest distance any fix sat
   * from the centroid, which describes how wide the cluster is, not how well
   * its centre is known — and the centre is the only thing being used. Standing
   * still for a minute inside a 7 m stay-point radius routinely yields a 6-7 m
   * spread while the centroid is good to a metre or two, so quoting the spread
   * would reject perfectly usable proposals.
   *
   * Nor is it spread / sqrt(n). That is the textbook standard error and it is
   * wrong in the other direction, because it assumes independent samples. GPS
   * error is dominated by satellite geometry and multipath, both of which drift
   * over tens of seconds — consecutive 1 Hz fixes are strongly correlated, and
   * averaging 55 of them does not buy a factor of 7.4.
   *
   * So the effective sample count is the dwell divided by a 10 s correlation
   * time, not the fix count. A minute of standing still counts as about six
   * independent looks. That is the conservative reading of a noisy literature,
   * and it is the number the confidence tiers are calibrated against.
   *
   * A marked anchor contributes its burst accuracy directly — that reduction
   * has already done this arithmetic.
   */
  const CORRELATION_MS = 10000;
  const sigma = (a) => {
    if (a.source === 'mark') return Number.isFinite(a.spreadM) ? a.spreadM : cfg.stopRadiusM;
    const spread = Number.isFinite(a.spreadM) ? a.spreadM : cfg.stopRadiusM;
    const looks = Math.max(1, (a.dwellMs ?? 0) / CORRELATION_MS);
    return spread / Math.sqrt(looks);
  };
  const uncertaintyFt = Number((Math.hypot(sigma(ballAt), sigma(cupAt)) * M_TO_FT).toFixed(1));

  const inferredEnds = [ballAt, cupAt].filter((a) => a.source === 'track').length;

  let confidence;
  if (distanceFt < 10) {
    // Steep part of the expected-putts curve. Whatever the geometry says, an
    // estimate this short cannot carry the weight strokes gained puts on it.
    confidence = 'poor';
    reasons.push(`${distanceFt} ft is inside the range where GPS cannot separate a tap-in from a 10-footer`);
  } else if (inferredEnds === 1 && uncertaintyFt <= 8) {
    confidence = 'good';
  } else if (uncertaintyFt <= 15) {
    confidence = 'fair';
  } else {
    confidence = 'poor';
  }

  reasons.push(`${Math.round(distanceFt)} ft ±${Math.round(uncertaintyFt)} ft from ${stops.length} stop(s) in the window`);

  return { distanceFt, uncertaintyFt, confidence, ball: ballAt, cup: cupAt, reasons };
}

/* --------------------------------------------------- end-of-hole candidates */

/**
 * How well a stop candidate's centre is actually known, in metres.
 *
 * Same reasoning as `proposeFirstPutt`: `spreadM` is how wide the cluster is,
 * not how well its centre is known, and dividing by sqrt(n) would assume
 * independent samples that GPS does not provide. Effective looks are the dwell
 * over a 10 s correlation time.
 *
 * Exported because a confirmed candidate becomes a real shot mark, and that
 * mark has to carry an honest accuracy — it is what every distance on the hole
 * is then computed from.
 */
export function candidateAccuracyM(candidate, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const spread = Number.isFinite(candidate?.spreadM) ? candidate.spreadM : cfg.stopRadiusM;
  const looks = Math.max(1, (candidate?.dwellMs ?? 0) / 10000);
  return Number((spread / Math.sqrt(looks)).toFixed(2));
}

/** The same three bands `reduceBurst` uses, so a track mark reads consistently. */
export function candidateQuality(accuracyM, { goodAccM = 4, maxAccuracyM = 8 } = {}) {
  if (accuracyM <= goodAccM) return 'good';
  if (accuracyM <= maxAccuracyM) return 'degraded';
  return 'poor';
}

/**
 * A stop shorter than this is never preselected as a place a shot was played
 * from (docs/SPEC_shot-places.md 4.3). It stays in the list, one tap away.
 */
export const PLACE_MIN_DWELL_S = 15;

/**
 * AGENDA ITEM 2 — what the track thinks happened on one hole.
 *
 * Matt's order, verbatim: *"lets hone down the tracking and then move to the
 * after hole entry, and then how we handle a mislog, forgotten phone in the
 * cart, etc"*. This is the after-hole entry half.
 *
 * He supplies the score, because he knows it and the app does not. The tee is
 * not asked of the track any more: shot 1 is the tee box at the scorecard
 * yardage (docs/SPEC_shot-places.md Section 3), his words on 2026-09-28 about
 * the 2026-09-27 round: *"Could not find the tee shot - needs to default to the
 * scorecard could not find the next shot either."* So the caller asks this for
 * the places the REST were played from: `fullShots` here is the number of
 * places wanted, strokes minus putts minus penalties minus the tee.
 *
 * EVERY STOP IS A PLACE ON THE HOLE, DESCRIBED BY THE MAP (4.2)
 *
 * Every stop in the window comes back in `places`, none hidden, each carrying
 * what the course map says about it in `place`: distance to this hole's green
 * centre, the lie, whose ground it is on (`own` when the map's nearest hole is
 * this one, `other` otherwise), whether it is on a tee or a green, and whether
 * it starts after he first stood on this hole's own green. `places` is in two
 * groups, this hole's ground then everyone else's, each in time order, with
 * the stops off the map last. With no map every field is null and every stop
 * is `other`: nothing is said that the map did not say.
 *
 * THE PRESELECTION (4.3) — a suggestion, every row can be swapped.
 *
 *   1. Pool: this hole's ground, not on a tee, not on a green, not after the
 *      green, standing 15 s or more.
 *   2. Short of `fullShots`: the other ground's stops that pass the same tests.
 *   3. Choose `fullShots` of them, in time order, that maximise the number of
 *      steps where the distance to the hole falls — from `teeYd`, shot 1's
 *      distance, onward. Ties go to the most total dwell.
 *
 * His item 2 as he qualified it: *"most of the time but it is possible to hit
 * something and the ball go backwards so be careful with that"*. So "closer
 * than the shot before" only ranks sequences; it never removes a place.
 *
 * Dwell is a tie-break and nothing else. His words: *"not true. When it is 100
 * degrees out and I am waiting you better believe it is in the shade."* A long
 * stop in the shade is a long stop and earns no preference.
 *
 * THE COUNT IS STILL THE DIAGNOSTIC. `shortBy` is how many places the pool
 * could not cover. Almost always stroke and distance: Matt plays it straight,
 * so a lost ball or OB replays from the same spot and leaves one stop where two
 * strokes happened. The UI asks which one he played twice.
 *
 * @param points      Dense track for the round.
 * @param fullShots   Places wanted: full shots after the tee.
 * @param fromTs      Start of the hole's window, epoch ms.
 * @param toTs        End of the hole's window, epoch ms.
 * @param geometry    The course map (`courseGeometry`), or null.
 * @param holeNumber  The hole being entered, for the map.
 * @param teeYd       Shot 1's distance to the hole, yards, or null.
 * @returns `{ proposed, places, rejected, found, eligible, fullShots, shortBy,
 *          windowMs }`. `proposed` is in time order.
 */
export function proposeHoleShots(
  points,
  { fullShots, fromTs = null, toTs = null, geometry = null, holeNumber = null, teeYd = null, ...opts } = {}
) {
  const want = Math.max(0, Math.floor(fullShots ?? 0));
  const all = stopCandidates(points, opts).filter(
    (c) => (fromTs == null || c.endTs >= fromTs) && (toTs == null || c.startTs <= toTs)
  );

  // What the map says about each stop, computed once (4.2).
  let greenFrom = null;
  for (const c of all) {
    const pos = { lat: c.lat, lon: c.lon, accuracyM: candidateAccuracyM(c) };
    const g = geometry ? toGreen(geometry, holeNumber, pos) : null;
    const said = geometry ? lieAt(geometry, pos) : null;
    const near = geometry ? nearestHole(geometry, pos, { maxM: 500 }) : null;
    const inOwnGreen = g != null && g.frontM === 0;
    if (inOwnGreen && greenFrom == null) greenFrom = c.startTs;
    c.place = {
      toHoleYd: g?.centreYd ?? null,
      lie: said?.lie ?? null,
      ground: near != null && near.hole === holeNumber ? 'own' : 'other',
      onTee: said?.lie === 'tee',
      onGreen: said?.lie === 'green',
      afterGreen: false,
    };
  }
  for (const c of all) c.place.afterGreen = greenFrom != null && c.startTs > greenFrom;

  const byTime = (a, b) => a.startTs - b.startTs;
  const own = all.filter((c) => c.place.ground === 'own').sort(byTime);
  const onMap = all.filter((c) => c.place.ground === 'other' && c.place.lie != null).sort(byTime);
  const offMap = all.filter((c) => c.place.ground === 'other' && c.place.lie == null).sort(byTime);
  const places = [...own, ...onMap, ...offMap];

  // 4.3, steps 1 and 2.
  const passes = (c) =>
    !c.place.onTee && !c.place.onGreen && !c.place.afterGreen && c.dwellMs >= PLACE_MIN_DWELL_S * 1000;
  let pool = own.filter(passes);
  if (pool.length < want) pool = [...pool, ...[...onMap, ...offMap].filter(passes)].sort(byTime);

  const proposed = bestSequence(pool, want, teeYd);
  const chosen = new Set(proposed);

  return {
    proposed,
    places,
    /*
     * Everything not preselected, still returned: they are the labelled
     * negatives that make this trainable, and on the sheet they are OTHER
     * PLACES ON THIS HOLE, one tap from being a shot.
     */
    rejected: places.filter((c) => !chosen.has(c)),
    found: all.length,
    eligible: pool.length,
    fullShots: want,
    shortBy: Math.max(0, want - proposed.length),
    windowMs: fromTs != null && toTs != null ? toTs - fromTs : null,
  };
}

/**
 * 4.3 step 3: `k` stops from `pool` (time order) maximising the steps where
 * the distance to the hole falls, starting from `startYd`; then the most total
 * dwell. Both are sums over consecutive pairs, so a table over (last stop,
 * count) finds the best exactly. A step with a distance unknown is not a fall.
 */
function bestSequence(pool, want, startYd) {
  const k = Math.min(want, pool.length);
  if (k === 0) return [];
  const yd = pool.map((c) => c.place?.toHoleYd ?? null);
  const falls = (from, to) => (from != null && to != null && to < from ? 1 : 0);
  const better = (a, b) => !b || a.falls > b.falls || (a.falls === b.falls && a.dwell > b.dwell);
  // best[c][i]: the best sequence of c + 1 stops ending at pool[i].
  const best = [pool.map((c, i) => ({ falls: falls(startYd, yd[i]), dwell: c.dwellMs, prev: -1 }))];
  for (let c = 1; c < k; c++) {
    best[c] = pool.map((cand, i) => {
      let top = null;
      for (let j = c - 1; j < i; j++) {
        const from = best[c - 1][j];
        if (!from) continue;
        const next = { falls: from.falls + falls(yd[j], yd[i]), dwell: from.dwell + cand.dwellMs, prev: j };
        if (better(next, top)) top = next;
      }
      return top;
    });
  }
  let end = -1;
  best[k - 1].forEach((s, i) => {
    if (s && better(s, best[k - 1][end])) end = i;
  });
  const out = [];
  for (let c = k - 1, i = end; c >= 0; i = best[c][i].prev, c--) out.unshift(pool[i]);
  return out;
}

/* ------------------------------------------------------- pin, from paces */

/**
 * WHERE THE CUP WAS, FROM A PIN-SHEET DESCRIPTION.
 *
 * Matt's ask after field test 4: mark the hole done without marking the cup,
 * and instead *"enter a rough number of paces the cup was located on the green
 * like a tournament pin sheet does. Then you can compare the tracked data and
 * know fairly certainly from my entered data where the cup was."*
 *
 * That is the right instinct, because the two sources fail independently. The
 * track knows the green's shape and where he walked but not which spot was the
 * hole; he knows the pin position but not where it is on Earth. Neither is much
 * on its own and together they pin it down.
 *
 * THE FRAME. A pin sheet is read along the line of play — so many paces on from
 * the front edge, so many left or right of centre. That line is recoverable:
 * it is the bearing from wherever the approach was played to the green. Every
 * measurement below happens in that frame, which is why the description
 * transfers without him needing to think about compass directions.
 *
 * WHAT IS AND IS NOT KNOWN. The front edge is estimated from where he actually
 * walked, which is a floor, not the true edge — if he came on from the side,
 * "the front of the walk" is short of the front of the green. Centre across the
 * line is far steadier, because his path crosses it whatever route he takes, so
 * the lateral term is the more trustworthy of the two. Both are reported inside
 * `uncertaintyM` rather than smoothed over.
 *
 * The cross-check is the point. `fromTrack` is where he stood to pick the ball
 * out, which is an independent estimate of the same thing, and `agreementM` is
 * how far apart the two answers are. Close together means the cup is known well
 * — better than either source alone. Far apart means something is wrong and the
 * app should say so instead of averaging two contradictory numbers into a
 * confident-looking one.
 *
 * @param points     Dense track for the round.
 * @param approach   Where the approach was played from; sets the line of play.
 * @param anchor     A point known to be ON this green — the ball mark, or the
 *                   retrieval stop. Only used to select the green's fixes.
 * @param onPaces    Paces from the front edge, along the line of play.
 * @param sidePaces  Paces from centre. Positive is right, negative is left.
 * @param paceFeet   His stride. Stored per user; 3.0 by default.
 * @returns null, or `{ lat, lon, uncertaintyM, fromTrack, agreementM,
 *          confidence, reasons }`.
 */
export function locateCupFromPaces(
  points,
  {
    approach = null,
    anchor = null,
    onPaces = 0,
    sidePaces = 0,
    paceFeet = 3,
    fromTs = null,
    toTs = null,
    greenRadiusM = 35,
    ...opts
  } = {}
) {
  if (!anchor || !Number.isFinite(onPaces)) return null;
  const cfg = { ...DEFAULTS, ...GREEN_DEFAULTS, ...opts };
  const paceM = paceFeet * 0.3048;

  const window = toFixes(points).filter(
    (f) => (fromTs == null || f.ts >= fromTs) && (toTs == null || f.ts <= toTs)
  );
  const green = window.filter((f) => distanceM(anchor, f) <= greenRadiusM);
  if (green.length < 5) return null;

  /*
   * The line of play. Without an approach position there is no principled
   * direction to read the sheet along, and guessing one would rotate the whole
   * description — a pin four paces right would land four paces long. Better to
   * decline.
   */
  if (!approach) return null;
  const theta = (bearingDeg(approach, anchor) * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);

  // Project the walked fixes into (along the line of play, across it).
  const proj = green.map((f) => {
    const { north, east } = enuOffset(anchor, f);
    return { along: east * sin + north * cos, across: east * cos - north * sin };
  });

  const sortedAlong = proj.map((p) => p.along).sort((a, b) => a - b);
  const sortedAcross = proj.map((p) => p.across).sort((a, b) => a - b);
  const at = (arr, q) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * q)))];

  /*
   * A low percentile rather than the outright minimum. One wild fix — and this
   * round's worst was 71 m — would otherwise define the front edge of the green
   * and drag every pin placed from it.
   */
  const front = at(sortedAlong, 0.05);
  /*
   * Mid-range, NOT the median.
   *
   * The median is time-weighted, and by far the most time on a green is spent
   * standing at the cup picking the ball out. So a median "centre" converges on
   * the pin itself, every pin comes out dead centre, and the left/right entry
   * silently stops meaning anything — it would appear to work perfectly while
   * measuring nothing. The centre of a green is a fact about its shape, so it
   * has to come from the extent of the walk rather than the dwell within it.
   */
  const centre = (at(sortedAcross, 0.05) + at(sortedAcross, 0.95)) / 2;
  const walkedDepth = at(sortedAlong, 0.95) - front;
  const walkedWidth = at(sortedAcross, 0.95) - at(sortedAcross, 0.05);

  const along = front + onPaces * paceM;
  const across = centre + sidePaces * paceM;
  const cup = offsetPoint(anchor, {
    north: along * cos + across * -sin,
    east: along * sin + across * cos,
  });

  /*
   * Error budget, all of it real:
   *   - the front edge is a floor on the true edge, and how far off scales with
   *     how little of the green he walked;
   *   - a paced distance is good to roughly a tenth of itself;
   *   - GPS under the walk itself.
   */
  const frontErr = Math.max(3, 8 - walkedDepth / 4);
  // A centre inferred from a narrow walk is a guess about where the rest of the
  // green is, and the lateral term inherits that.
  const centreErr = Math.max(2, 10 - walkedWidth / 2);
  const paceErr = Math.abs(onPaces * paceM) * 0.1 + Math.abs(sidePaces * paceM) * 0.1;
  const uncertaintyM = Number(Math.hypot(frontErr, centreErr, paceErr, 3).toFixed(1));

  const reasons = [
    `${green.length} fixes on the green, ${Math.round(toFeet(walkedDepth))} ft walked along the line of play and ${Math.round(toFeet(walkedWidth))} ft across it`,
    `${onPaces} pace${onPaces === 1 ? '' : 's'} on, ${Math.abs(sidePaces)} ${sidePaces < 0 ? 'left' : 'right'} of centre, at ${paceFeet} ft per pace`,
  ];

  // The independent answer: where he stood to pick the ball out.
  const stops = segmentTrack(green, cfg).filter((s) => s.kind === 'stop');
  const fromTrack = stops.length ? stops[stops.length - 1] : null;
  const agreementM = fromTrack ? Number(distanceM(cup, fromTrack).toFixed(1)) : null;

  let confidence = 'fair';
  if (agreementM == null) {
    confidence = 'fair';
    reasons.push('no retrieval stop on the track to check it against');
  } else if (agreementM <= uncertaintyM) {
    confidence = 'good';
    reasons.push(`agrees with where you picked the ball out, ${Math.round(toFeet(agreementM))} ft apart`);
  } else if (agreementM <= uncertaintyM * 2.5) {
    confidence = 'fair';
    reasons.push(`${Math.round(toFeet(agreementM))} ft from where you picked the ball out`);
  } else {
    confidence = 'poor';
    reasons.push(`${Math.round(toFeet(agreementM))} ft from where you picked the ball out — one of the two is wrong`);
  }

  return {
    lat: cup.lat,
    lon: cup.lon,
    uncertaintyM,
    fromTrack: fromTrack ? { lat: fromTrack.lat, lon: fromTrack.lon } : null,
    agreementM,
    confidence,
    reasons,
  };
}
