/**
 * Geodesy for golf distances.
 *
 * We deliberately do NOT use a spherical-earth haversine here. A modern
 * dual-frequency phone resolves ~1-3 m outdoors; a spherical approximation
 * throws away part of that budget (the mean-radius assumption is off by up to
 * ~0.3% depending on latitude, which is ~1.5 yd on a 500 yd drive-and-a-half).
 *
 * Instead we project onto a local tangent plane using the true WGS-84 radii of
 * curvature at the midpoint latitude. Over the few hundred metres that matter
 * on a golf hole this is accurate to well under a centimetre, and it is cheaper
 * than haversine.
 */

const A = 6378137.0;                 // WGS-84 semi-major axis (m)
const F = 1 / 298.257223563;         // WGS-84 flattening
const E2 = F * (2 - F);              // first eccentricity squared
const D2R = Math.PI / 180;

export const M_PER_YARD = 0.9144;
export const M_PER_FOOT = 0.3048;

/** Meridional (M) and prime-vertical (N) radii of curvature at a latitude. */
export function radiiAt(latDeg) {
  const s = Math.sin(latDeg * D2R);
  const t = 1 - E2 * s * s;
  const rt = Math.sqrt(t);
  return { M: (A * (1 - E2)) / (t * rt), N: A / rt };
}

/** Normalise a longitude delta into [-180, 180]. */
function wrapLon(d) {
  let x = d;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

/**
 * Local east/north offset in metres from `from` to `to`.
 * Both args are `{ lat, lon }` in degrees.
 */
export function enuOffset(from, to) {
  const lat0 = (from.lat + to.lat) / 2;
  const { M, N } = radiiAt(lat0);
  return {
    north: M * (to.lat - from.lat) * D2R,
    east: N * Math.cos(lat0 * D2R) * wrapLon(to.lon - from.lon) * D2R,
  };
}

/** Great-ellipse-approximating distance in metres. */
export function distanceM(from, to) {
  if (!from || !to) return null;
  const { east, north } = enuOffset(from, to);
  return Math.hypot(east, north);
}

/** Compass bearing in degrees (0 = north, clockwise). */
export function bearingDeg(from, to) {
  if (!from || !to) return null;
  const { east, north } = enuOffset(from, to);
  return (Math.atan2(east, north) * (180 / Math.PI) + 360) % 360;
}

export const toYards = (m) => (m == null ? null : m / M_PER_YARD);
export const toFeet = (m) => (m == null ? null : m / M_PER_FOOT);
export const yardsToM = (y) => (y == null ? null : y * M_PER_YARD);
export const feetToM = (f) => (f == null ? null : f * M_PER_FOOT);

/**
 * Inverse-variance weighted centroid of `{ lat, lon, acc }` points.
 * Weight = 1/acc^2, i.e. each fix contributes in proportion to how much the
 * receiver claims to trust it. Returns null for an empty set.
 *
 * Averaging raw degrees is exact here: over a few metres the mapping from
 * degrees to the local tangent plane is affine, so a weighted mean of degrees
 * and a weighted mean of metres agree.
 */
export function weightedCentroid(points, accFloorM = 0.5) {
  let sw = 0;
  let slat = 0;
  let slon = 0;
  for (const p of points) {
    const acc = Math.max(Number.isFinite(p.acc) ? p.acc : accFloorM, accFloorM);
    const w = 1 / (acc * acc);
    sw += w;
    slat += w * p.lat;
    slon += w * p.lon;
  }
  if (sw === 0) return null;
  return { lat: slat / sw, lon: slon / sw, sumWeight: sw };
}
