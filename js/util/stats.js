/** Small, dependency-free statistics helpers. Honest about empty input: null. */

export function median(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function mean(values) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * Median absolute deviation, scaled to be a consistent estimator of sigma for
 * normally distributed data. Robust to the single wild fix that a phone GPS
 * occasionally emits, which is exactly why we use it instead of stddev.
 */
export function mad(values) {
  const m = median(values);
  if (m == null) return null;
  const scaled = median(values.map((x) => Math.abs(x - m)));
  return scaled == null ? null : 1.4826 * scaled;
}

export function sum(values) {
  return values.filter(Number.isFinite).reduce((a, b) => a + b, 0);
}

export function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

export function round(x, dp = 0) {
  if (!Number.isFinite(x)) return null;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
