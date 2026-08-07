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
 * WHAT THE SIGNAL ACTUALLY IS
 *
 * Not dwell length. Matt is over the ball for "about 10 seconds or less", which
 * at 1 Hz is ten fixes — close enough to GPS noise that duration alone cannot
 * carry the decision. The TRANSITION carries it: arrival at zero speed after
 * cart motion, then departure a long way. A cart segment runs 4-7 m/s, walking
 * is ~1.3 m/s, standing is 0. Those are separable; ten seconds versus fourteen
 * is not.
 *
 * KNOWN FALSE POSITIVES, DELIBERATELY NOT FILTERED OUT
 *
 *  - Behind the hole. Matt walks behind every cup to read the putt back the
 *    other way, "every time no deviation". That is a real stop that is not a
 *    shot. It is also the most predictable event on the golf course, so it is
 *    surfaced as a low `departureM` rather than suppressed.
 *  - Sitting in the cart while a partner plays. The phone rides in his pocket,
 *    so a cart at rest is a stop. Confirmation resolves it; a filter would
 *    guess.
 *
 * Suppressing either one here would destroy the labelled examples that make
 * this trainable, which is a stated requirement and not a nice-to-have.
 */

import { distanceM, weightedCentroid } from '../util/geo.js';
import { expandFix } from '../data/trackstore.js';

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
export const DEFAULTS = {
  stopRadiusM: 12,
  minDwellMs: 6000,
  /** Below this, a "stop" is a cart pause, not someone standing over a ball. */
  minDepartureM: 18,
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
 * `departureM` is straight-line distance to the NEXT stop, which is the closest
 * thing to "how far the ball went" available before anything is confirmed. It
 * is the single most discriminating feature: a shot moves a long way, reading a
 * putt from behind the hole moves a few metres.
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

    const reasons = [];
    let score = 0;

    if (departureM == null) {
      reasons.push('last stop on the track — no departure to measure');
      score += 0.2;
    } else if (departureM >= cfg.minDepartureM) {
      // Saturating rather than linear: past a full shot, further is not more
      // shot-like, and a 250 yard drive should not outrank a wedge.
      const d = Math.min(departureM, 200) / 200;
      score += 0.5 * (0.4 + 0.6 * d);
      reasons.push(`departed ${departureM} m`);
    } else {
      reasons.push(`departed only ${departureM} m — repositioning, or reading a putt`);
    }

    if (Number.isFinite(arrivalSpeed) && arrivalSpeed > 2.5) {
      score += 0.25;
      reasons.push(`arrived at ${arrivalSpeed.toFixed(1)} m/s (cart)`);
    } else if (Number.isFinite(arrivalSpeed)) {
      score += 0.1;
      reasons.push(`arrived on foot (${arrivalSpeed.toFixed(1)} m/s)`);
    }

    const dwellS = stop.dwellMs / 1000;
    // Matt's routine is ~10 s. Credit the band around it without letting dwell
    // dominate — see the header on why duration cannot carry this decision.
    if (dwellS >= 6 && dwellS <= 45) {
      score += 0.15;
      reasons.push(`stood ${Math.round(dwellS)} s`);
    } else if (dwellS > 45) {
      reasons.push(`stood ${Math.round(dwellS)} s — long for a pre-shot routine`);
    }

    if (stop.spreadM <= 8) {
      score += 0.1;
      reasons.push(`tight cluster (${stop.spreadM} m)`);
    }

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
      score: Number(Math.min(1, score).toFixed(3)),
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
