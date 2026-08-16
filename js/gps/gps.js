/**
 * GPS PRECISION PIPELINE
 *
 * Battery is explicitly not a constraint, so the receiver never goes cold:
 * `watchPosition` with `enableHighAccuracy` runs from the first tee to the last
 * putt. A warm receiver with continuous carrier tracking is the single biggest
 * lever on accuracy — bigger than anything done in software afterwards.
 *
 * On Mark, we take a ~3 s burst (collected while the lie is being selected, so
 * it costs no wall-clock time) and reduce it in three stages:
 *
 *   1. ACCURACY GATE   — drop fixes the receiver itself doesn't trust (>8 m).
 *   2. OUTLIER REJECT  — median-position + MAD. Robust: a single wild fix, the
 *                        classic multipath spike near trees, cannot drag the
 *                        result the way a mean would.
 *   3. WEIGHTED MEAN   — inverse-variance (1/acc²). A claimed-2 m fix counts
 *                        for 9× a claimed-6 m fix, which is the correct
 *                        weighting if the reported accuracy is a 1-sigma radius.
 *
 * The reported accuracy of the result is deliberately CONSERVATIVE. The naive
 * inverse-variance combination assumes independent errors; consecutive GPS
 * fixes are strongly correlated (same satellites, same multipath, same
 * ionosphere), so averaging n fixes does not really buy sqrt(n). We floor the
 * estimate at 0.6x the best single fix. Overstating precision would be worse
 * than useless here — it would quietly poison the strokes-gained numbers.
 */

import { distanceM, weightedCentroid } from '../util/geo.js';
import { median, mad, round } from '../util/stats.js';

export const GPS_DEFAULTS = {
  maxAccuracyM: 8, // hard gate from the spec
  goodAccM: 4,
  burstMs: 3000,
  burstHardTimeoutMs: 10000,
  minSamples: 2,
  staleFixMs: 4000, // a fix older than this is not "current"
  seedWindowMs: 1200, // reuse a fix that landed just before the tap
  accFloorM: 0.5,
  /**
   * How long to let a thawed page resume delivering on its own before the watch
   * is treated as dead and re-armed. Long enough that a watch which is merely
   * slow to wake is not thrown away, short enough that a dead one is caught
   * before the next shot.
   */
  reviveGraceMs: 3000,
};

/**
 * Reduce a burst of raw fixes to one position. Pure — no browser APIs — so it
 * is unit-testable and can be re-run over stored raw samples later.
 *
 * Returns `{ lat, lon, accuracyM, quality, spreadM, usedCount, samples }` where
 * `samples` are the inputs annotated with `used`/`reject`. Null for empty input.
 */
export function reduceBurst(rawSamples, opts = {}) {
  const o = { ...GPS_DEFAULTS, ...opts };
  if (!rawSamples?.length) return null;

  const samples = rawSamples.map((s) => ({ ...s, used: true, reject: null }));

  // --- 1. accuracy gate -----------------------------------------------------
  let pool = samples.filter((s) => Number.isFinite(s.acc) && s.acc <= o.maxAccuracyM);
  let gatePassed = pool.length > 0;
  if (!gatePassed) {
    // Everything is junk. Keep it all rather than discarding the mark outright —
    // the caller warns and offers a re-mark, and a flagged poor mark still beats
    // a hole in the data.
    pool = samples.slice();
  } else {
    for (const s of samples) {
      if (!(Number.isFinite(s.acc) && s.acc <= o.maxAccuracyM)) {
        s.used = false;
        s.reject = 'accuracy';
      }
    }
  }

  // --- 2. spatial outlier rejection ----------------------------------------
  // Needs >= 4 points for the MAD to mean anything; below that a "robust"
  // estimator is just an opinion.
  if (pool.length >= 4) {
    const center = { lat: median(pool.map((s) => s.lat)), lon: median(pool.map((s) => s.lon)) };
    const dists = pool.map((s) => distanceM(center, s));
    const medD = median(dists);
    const sigma = mad(dists) ?? 0;
    const medAcc = median(pool.map((s) => s.acc)) ?? o.maxAccuracyM;
    // Three robust sigmas, but never tighter than a sensible fraction of the
    // receiver's own claimed accuracy, and never below a 3 m floor — otherwise
    // a very tight cluster would start rejecting perfectly good fixes.
    const threshold = Math.max(medD + 3 * sigma, 0.75 * medAcc, 3);
    const keep = pool.filter((s, i) => dists[i] <= threshold);
    if (keep.length >= 3) {
      pool.forEach((s, i) => {
        if (dists[i] > threshold) {
          s.used = false;
          s.reject = 'outlier';
        }
      });
      pool = keep;
    }
  }

  // --- 3. inverse-variance weighted mean ------------------------------------
  const centroid = weightedCentroid(pool, o.accFloorM);
  if (!centroid) return null;

  const bestAcc = Math.min(...pool.map((s) => Math.max(s.acc ?? o.maxAccuracyM, o.accFloorM)));
  const combined = Math.sqrt(1 / centroid.sumWeight);
  const accuracyM = Math.max(combined, 0.6 * bestAcc);

  const spreadM =
    pool.length > 1
      ? Math.max(...pool.map((s) => distanceM({ lat: centroid.lat, lon: centroid.lon }, s)))
      : 0;

  const quality = !gatePassed || accuracyM > o.maxAccuracyM
    ? 'poor'
    : accuracyM <= o.goodAccM
      ? 'good'
      : 'degraded';

  return {
    lat: centroid.lat,
    lon: centroid.lon,
    accuracyM: round(accuracyM, 2),
    spreadM: round(spreadM, 2),
    quality,
    gatePassed,
    usedCount: pool.length,
    sampleCount: samples.length,
    samples,
  };
}

/**
 * Continuous positioning service. One instance per app; started when a round
 * starts and stopped when it ends.
 */
export class GpsService {
  constructor(opts = {}) {
    this.opts = { ...GPS_DEFAULTS, ...opts };
    this.watchId = null;
    this.last = null; // most recent raw fix
    this.buffer = []; // recent fixes, newest last
    this.bufferLimit = 240;
    this.error = null;
    this.permission = 'unknown'; // 'granted' | 'denied' | 'prompt' | 'unknown'
    this.fixCount = 0;
    this._subs = new Set();
    this._bursts = new Set();
    this._reviveTimer = null;
    this._visibilityBound = false;
  }

  get supported() {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }

  get running() {
    return this.watchId != null;
  }

  /** Current fix if it is recent enough to be meaningful, else null. */
  get current() {
    if (!this.last) return null;
    if (Date.now() - this.last.ts > this.opts.staleFixMs) return null;
    return this.last;
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }

  _emit(event) {
    for (const fn of this._subs) {
      try {
        fn(event, this);
      } catch {
        /* never let a subscriber break the GPS loop */
      }
    }
  }

  start() {
    if (!this.supported) {
      this.error = { code: -1, message: 'Geolocation is not available in this browser.' };
      this._emit('error');
      return false;
    }
    if (this.running) return true;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._onFix(pos),
      (err) => this._onError(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
    this._bindVisibility();
    this._emit('started');
    return true;
  }

  stop() {
    clearTimeout(this._reviveTimer);
    this._reviveTimer = null;
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      this._emit('stopped');
    }
  }

  /**
   * Re-arm the watch when the page comes back from being hidden.
   *
   * Android freezes a backgrounded page, and nothing guarantees that a
   * `watchPosition` subscription resumes delivering once it thaws. The failure
   * is silent in the worst possible way: `watchId` stays non-null either way,
   * so `running` is still true and `start()` short-circuits — the app looks
   * healthy while recording nothing.
   *
   * This is not an edge case for this user. Locking the phone is a stated
   * habit, so a round WILL contain lock/unlock cycles; the track gap while it
   * is locked is unavoidable, but failing to resume afterwards is not.
   *
   * Re-arming only happens when fixes have actually stopped — a watch that woke
   * up on its own is left alone, since a needless restart costs a receiver cold
   * start. The grace period is what tells those two apart.
   */
  _bindVisibility() {
    if (this._visibilityBound || typeof document === 'undefined') return;
    this._visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.running) return;
      clearTimeout(this._reviveTimer);
      this._reviveTimer = setTimeout(() => {
        if (!this.running) return;
        if (this.staleSinceMs() > this.opts.staleFixMs) this.restart();
      }, this.opts.reviveGraceMs);
    });
  }

  /** Age of the newest fix, or Infinity if none has ever landed. */
  staleSinceMs() {
    return this.last ? Date.now() - this.last.ts : Infinity;
  }

  /** Tear the watch down and arm a fresh one. Safe when already stopped. */
  restart() {
    const wasRunning = this.running;
    this.stop();
    if (wasRunning) this.start();
    this._emit('restarted');
    return this.running;
  }

  _onFix(pos) {
    const c = pos.coords;
    const fix = {
      lat: c.latitude,
      lon: c.longitude,
      acc: c.accuracy,
      alt: Number.isFinite(c.altitude) ? c.altitude : null,
      altAcc: Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy : null,
      speed: Number.isFinite(c.speed) ? c.speed : null,
      heading: Number.isFinite(c.heading) ? c.heading : null,
      ts: pos.timestamp ?? Date.now(),
    };
    this.error = null;
    this.permission = 'granted';
    this.last = fix;
    this.fixCount++;
    this.buffer.push(fix);
    if (this.buffer.length > this.bufferLimit) this.buffer.shift();
    for (const burst of this._bursts) burst.push(fix);
    this._emit('fix');
  }

  _onError(err) {
    this.error = { code: err.code, message: err.message };
    if (err.code === 1) this.permission = 'denied';
    this._emit('error');
  }

  /**
   * Collect fixes for ~`burstMs`, then reduce.
   *
   * The burst is seeded with any fix that arrived in the moment just before the
   * tap: the receiver is already tracking, so that fix is as valid as the ones
   * that follow, and it guarantees a usable result even if the OS goes quiet.
   *
   * `onProgress` is called with `{ elapsed, total, count, bestAcc }` so the UI
   * can show the burst filling while the lie is being selected.
   */
  captureBurst({ durationMs, onProgress, signal } = {}) {
    const total = durationMs ?? this.opts.burstMs;
    const collected = [];
    const seed = this.buffer.filter((f) => Date.now() - f.ts <= this.opts.seedWindowMs);
    collected.push(...seed);
    this._bursts.add(collected);

    const startedAt = Date.now();

    return new Promise((resolve) => {
      let done = false;
      const finish = (cancelled) => {
        if (done) return;
        done = true;
        clearInterval(tick);
        this._bursts.delete(collected);
        if (cancelled) {
          resolve(null);
          return;
        }
        resolve(reduceBurst(collected, this.opts));
      };

      const tick = setInterval(() => {
        if (signal?.aborted) return finish(true);
        const elapsed = Date.now() - startedAt;
        onProgress?.({
          elapsed,
          total,
          count: collected.length,
          bestAcc: collected.length ? Math.min(...collected.map((f) => f.acc)) : null,
        });
        // Normal exit: the window has elapsed and we have something to reduce.
        if (elapsed >= total && collected.length >= Math.min(this.opts.minSamples, 1)) {
          return finish(false);
        }
        // Hard exit: the OS has stopped delivering fixes. Resolve with whatever
        // we have (possibly nothing) rather than hanging the UI on the course.
        if (elapsed >= this.opts.burstHardTimeoutMs) return finish(false);
      }, 100);
    });
  }
}
