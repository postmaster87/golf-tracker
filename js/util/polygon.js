/**
 * Planar polygon helpers for course geometry (docs/SPEC_course-geometry.md 2.1).
 *
 * Every calculation is done on east/north offsets from the query point via
 * `enuOffset` - the same local tangent plane every distance in the app uses.
 * Never haversine. Rings are `[{ lat, lon }, ...]`, closed (first == last).
 */

import { enuOffset, offsetPoint } from './geo.js';

/** Offsets of every vertex from `pt`, as [east, north]. */
function local(pt, pts) {
  return pts.map((q) => {
    const o = enuOffset(pt, q);
    return [o.east, o.north];
  });
}

/** Distance from the origin to segment a-b (planar, metres). */
function segDist(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L));
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}

/** Even-odd ray cast (along +east) from `pt`. */
export function pointInRing(pt, ring) {
  const P = local(pt, ring);
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[j];
    if (y1 > 0 !== y2 > 0 && 0 < ((x2 - x1) * (0 - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

/** Min distance from `pt` to the ring's edges, metres. 0 on an edge, NOT 0 inside. */
export function distanceToRing(pt, ring) {
  const P = local(pt, ring);
  let best = Infinity;
  for (let i = 1; i < P.length; i++) best = Math.min(best, segDist(P[i - 1], P[i]));
  if (P.length === 1) best = Math.hypot(P[0][0], P[0][1]);
  return best;
}

/** Min distance from `pt` to an open polyline's segments, metres. */
export function distanceToPolyline(pt, line) {
  return distanceToRing(pt, line);
}

/** Area-weighted centroid (planar), back to lat/lon; the vertex mean when degenerate. */
export function ringCentroid(ring) {
  const o = ring[0];
  const P = local(o, ring);
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i + 1 < P.length; i++) {
    const [x1, y1] = P[i];
    const [x2, y2] = P[i + 1];
    const c = x1 * y2 - x2 * y1;
    a += c;
    cx += (x1 + x2) * c;
    cy += (y1 + y2) * c;
  }
  if (Math.abs(a) < 1e-9) {
    const pts = ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon
      ? ring.slice(0, -1)
      : ring;
    return {
      lat: pts.reduce((s, q) => s + q.lat, 0) / pts.length,
      lon: pts.reduce((s, q) => s + q.lon, 0) / pts.length,
    };
  }
  return offsetPoint(o, { east: cx / (3 * a), north: cy / (3 * a) });
}

/**
 * Distances along the ray `from -> towards` at which it crosses the ring's
 * edges, ascending, metres. A crossing exactly at a shared vertex is counted once.
 */
export function rayRingIntersections(from, towards, ring) {
  const d = enuOffset(from, towards);
  const len = Math.hypot(d.east, d.north);
  if (len === 0) return [];
  const ux = d.east / len;
  const uy = d.north / len;
  const P = local(from, ring);
  const out = [];
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const ex = bx - ax;
    const ey = by - ay;
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (ax * ey - ay * ex) / den; // along the ray
    const s = (ax * uy - ay * ux) / den; // along the edge
    if (t >= 0 && s >= 0 && s <= 1) out.push(t);
  }
  out.sort((x, y) => x - y);
  return out.filter((t, i) => i === 0 || t - out[i - 1] > 1e-6);
}
