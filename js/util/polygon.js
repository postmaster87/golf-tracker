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

/* ------------------------------------------ the Hole Overview (SPEC_hole-overview.md 3.1) */

/**
 * The nearest point of an open polyline to `pt`.
 *
 * Returns `{ distanceM, sM, leg, side }`: its distance from `pt`; its position
 * along the line from the first vertex; `leg`, the index of the END vertex of
 * the leg it is on (1-based: the first leg is 1, so `line[leg]` is where that
 * leg ends); `side` +1 when `pt` is left of that leg's direction, -1 right,
 * 0 on it. Equal distances keep the earlier leg. Null for fewer than 2 points.
 */
export function projectOnPolyline(pt, line) {
  if (!pt || !line || line.length < 2) return null;
  const P = local(pt, line);
  let best = null;
  let acc = 0;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    const L = Math.sqrt(L2);
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || d < best.distanceM - 1e-9) {
      // (b - a) x (pt - a); pt is the origin of the local frame.
      const cross = dx * -ay - dy * -ax;
      best = { distanceM: d, sM: acc + t * L, leg: i, side: cross > 0 ? 1 : cross < 0 ? -1 : 0 };
    }
    acc += L;
  }
  return best;
}

/**
 * Where the segment `a -> b` crosses the ring: `[{ tM, point }]`, ascending,
 * `tM` metres from `a`. `rayRingIntersections` cut at the segment's length.
 */
export function segmentRingCrossings(a, b, ring) {
  const d = enuOffset(a, b);
  const len = Math.hypot(d.east, d.north);
  if (len === 0) return [];
  return rayRingIntersections(a, b, ring)
    .filter((t) => t <= len)
    .map((t) => ({ tM: t, point: offsetPoint(a, { east: (d.east * t) / len, north: (d.north * t) / len }) }));
}

/** Twice the signed area of a-b-c (planar [x, y] points). */
function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** c inside the bounding box of a-b (for a collinear touch). */
function within(a, b, c) {
  return (
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
  );
}

/** Do planar segments p1-p2 and q1-q2 touch or cross? */
function segmentsMeet(p1, p2, q1, q2) {
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && within(q1, q2, p1)) ||
    (d2 === 0 && within(q1, q2, p2)) ||
    (d3 === 0 && within(p1, p2, q1)) ||
    (d4 === 0 && within(p1, p2, q2))
  );
}

/** The even-odd test of `pointInRing`, on planar [x, y] points. */
function insidePlanar(p, R) {
  let c = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const y1 = R[i][1];
    const y2 = R[j][1];
    if (y1 > p[1] !== y2 > p[1] && p[0] < ((R[j][0] - R[i][0]) * (p[1] - y1)) / (y2 - y1) + R[i][0]) c = !c;
  }
  return c;
}

/** Distance from planar point p to segment a-b. */
function pointSegPlanar(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
}

/**
 * The smallest distance between two rings' boundaries, metres; 0 when a vertex
 * of either is inside the other, or when the boundaries cross.
 */
export function ringGapM(ringA, ringB) {
  // One plane for both rings, anchored on the first; over a golf hole the
  // difference from per-vertex frames is well under a millimetre.
  const A = local(ringA[0], ringA);
  const B = local(ringA[0], ringB);
  for (const p of A) if (insidePlanar(p, B)) return 0;
  for (const p of B) if (insidePlanar(p, A)) return 0;
  for (let i = 1; i < A.length; i++) {
    for (let j = 1; j < B.length; j++) if (segmentsMeet(A[i - 1], A[i], B[j - 1], B[j])) return 0;
  }
  let best = Infinity;
  for (const p of A) for (let j = 1; j < B.length; j++) best = Math.min(best, pointSegPlanar(p, B[j - 1], B[j]));
  for (const p of B) for (let i = 1; i < A.length; i++) best = Math.min(best, pointSegPlanar(p, A[i - 1], A[i]));
  return best;
}

/** The diagonal of the ring's east/north bounding box, metres. */
export function ringSpanM(ring) {
  const P = local(ring[0], ring);
  const es = P.map((p) => p[0]);
  const ns = P.map((p) => p[1]);
  return Math.hypot(Math.max(...es) - Math.min(...es), Math.max(...ns) - Math.min(...ns));
}
