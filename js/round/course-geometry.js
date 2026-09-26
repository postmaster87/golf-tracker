/**
 * The course-geometry engine (docs/SPEC_course-geometry.md Section 2).
 *
 * Pure functions over a generated geometry module (js/data/geometry/*.js):
 * the lie at a position, distances to a hole's green, and the hole a position
 * is nearest. No DOM, no storage. Every answer is a SUGGESTION for the play
 * screen to propose - the golfer is the source of truth about where he is.
 *
 * Positions are `{ lat, lon, accuracyM? }`. Distances are in the local tangent
 * plane (`enuOffset`), like every distance in the app.
 */

import { VEENKER_GEOMETRY } from '../data/geometry/veenker.js';
import { distanceM, toYards } from '../util/geo.js';
import {
  pointInRing,
  distanceToRing,
  distanceToPolyline,
  ringCentroid,
  rayRingIntersections,
} from '../util/polygon.js';

const GEOMETRIES = { veenker: VEENKER_GEOMETRY };

/** The geometry for a course, by its `geometry` key; null for every course without one. */
export function courseGeometry(course) {
  return (course?.geometry && GEOMETRIES[course.geometry]) || null;
}

const LIE_OF = { green: 'green', bunker: 'sand', tee: 'tee', fairway: 'fairway' };
const PRIORITY = ['green', 'sand', 'tee', 'fairway'];
const ROUGH_REACH_M = 80;
const BAND_FLOOR_M = 4;

const indexCache = new WeakMap();
function index(geometry) {
  let ix = indexCache.get(geometry);
  if (!ix) {
    const byId = new Map(geometry.polygons.map((p) => [p.id, p]));
    ix = { byId, centroids: new Map() };
    indexCache.set(geometry, ix);
  }
  return ix;
}

/** Inside the outer ring and in none of its inner rings. */
function inPolygon(pos, p) {
  if (!pointInRing(pos, p.ring)) return false;
  return !(p.inner ?? []).some((r) => pointInRing(pos, r));
}

/** Distance to the polygon's nearest edge (outer or inner), metres. */
function edgeDistance(pos, p) {
  let d = distanceToRing(pos, p.ring);
  for (const r of p.inner ?? []) d = Math.min(d, distanceToRing(pos, r));
  return d;
}

/**
 * The lie the map puts `pos` in (Section 2.2).
 * Priority inside overlapping polygons: green, sand, tee, fairway. Water only
 * sets `water`. Outside every polygon: rough within 80 m of the course, else
 * `lie: null` ("off the map").
 */
export function lieAt(geometry, pos, { bandM } = {}) {
  if (!geometry || !pos) return null;
  const band = bandM ?? Math.max(BAND_FLOOR_M, pos.accuracyM ?? 0);
  const rows = geometry.polygons.map((p) => {
    const inside = inPolygon(pos, p);
    const edge = edgeDistance(pos, p);
    return { p, inside, edge, dist: inside ? 0 : edge };
  });
  const water = rows.some((r) => r.inside && r.p.kind === 'water');
  const playable = rows.filter((r) => r.p.kind !== 'water');

  let decider = null;
  for (const lie of PRIORITY) {
    const hits = playable.filter((r) => r.inside && LIE_OF[r.p.kind] === lie);
    if (hits.length) {
      decider = hits.reduce((a, b) => (b.edge > a.edge ? b : a));
      break;
    }
  }

  let lie;
  let feature;
  let edgeM;
  const cand = [];
  if (decider) {
    lie = LIE_OF[decider.p.kind];
    feature = decider.p;
    edgeM = decider.edge;
    if (edgeM <= band) cand.push({ lie: 'rough', d: edgeM });
  } else {
    const outside = rows.filter((r) => !r.inside);
    const nearest = outside.length ? outside.reduce((a, b) => (b.edge < a.edge ? b : a)) : null;
    const lineD = Math.min(...geometry.holes.map((h) => distanceToPolyline(pos, h.line)));
    const reach = Math.min(nearest?.edge ?? Infinity, lineD);
    if (reach > ROUGH_REACH_M) {
      return { lie: null, water, feature: null, edgeM: null, inQuestion: false, alternatives: [], source: 'map' };
    }
    lie = 'rough';
    feature = nearest?.p ?? null;
    edgeM = nearest?.edge ?? null;
  }
  for (const r of playable) {
    if (r.dist <= band) cand.push({ lie: LIE_OF[r.p.kind], d: r.dist });
  }
  cand.sort((a, b) => a.d - b.d || PRIORITY.indexOf(a.lie) - PRIORITY.indexOf(b.lie));
  const alternatives = [];
  for (const c of cand) if (c.lie !== lie && !alternatives.includes(c.lie)) alternatives.push(c.lie);

  return {
    lie,
    water,
    feature: feature ? { kind: feature.kind, id: feature.id, holes: feature.holes } : null,
    edgeM,
    inQuestion: edgeM != null && edgeM <= band,
    alternatives,
    source: 'map',
  };
}

function holeOf(geometry, n) {
  return geometry.holes.find((h) => h.number === n) ?? null;
}

/** Front / centre / back of hole `holeNumber`'s green from `pos` (Section 2.3). */
export function toGreen(geometry, holeNumber, pos) {
  if (!geometry || !pos) return null;
  const hole = holeOf(geometry, holeNumber);
  if (!hole) return null;
  const ix = index(geometry);
  const green = ix.byId.get(hole.greenId);
  if (!green) return null;
  const G = green.ring;
  let C = ix.centroids.get(green.id);
  if (!C) {
    C = ringCentroid(G);
    ix.centroids.set(green.id, C);
  }
  const centreM = distanceM(pos, C);
  const xs = rayRingIntersections(pos, C, G);
  const farthestVertex = () => Math.max(...G.map((q) => distanceM(pos, q)));
  let frontM;
  let backM;
  if (pointInRing(pos, G)) {
    frontM = 0;
    backM = xs.length ? xs[xs.length - 1] : farthestVertex();
  } else if (xs.length) {
    frontM = xs[0];
    backM = xs[xs.length - 1];
  } else {
    frontM = distanceToRing(pos, G);
    backM = farthestVertex();
  }
  const yd = (m) => Math.round(toYards(m));
  return {
    frontM,
    centreM,
    backM,
    frontYd: yd(frontM),
    centreYd: yd(centreM),
    backYd: yd(backM),
    uncertaintyYd: Number.isFinite(pos.accuracyM) ? yd(pos.accuracyM) : null,
    greenId: green.id,
  };
}

/** The hole `pos` is nearest to, or null beyond `maxM` (Section 2.4). */
export function nearestHole(geometry, pos, { maxM = 60 } = {}) {
  if (!geometry || !pos) return null;
  const ix = index(geometry);
  const scored = geometry.holes.map((h) => {
    let dTee = Infinity;
    let onTee = false;
    for (const id of h.teeIds) {
      const t = ix.byId.get(id);
      if (!t) continue;
      if (inPolygon(pos, t)) {
        dTee = 0;
        onTee = true;
      } else dTee = Math.min(dTee, edgeDistance(pos, t));
    }
    for (const pt of geometry.points ?? []) {
      if (pt.kind === 'tee' && pt.holes.includes(h.number)) dTee = Math.min(dTee, distanceM(pos, pt));
    }
    const g = ix.byId.get(h.greenId);
    const onGreen = g ? inPolygon(pos, g) : false;
    const dGreen = g ? (onGreen ? 0 : edgeDistance(pos, g)) : Infinity;
    const dLine = distanceToPolyline(pos, h.line);
    return { hole: h.number, distanceM: Math.min(dLine, dTee, dGreen), onTee, onGreen };
  });
  // Equal distances: a position inside the hole's own green or tee ranks first.
  scored.sort(
    (a, b) =>
      a.distanceM - b.distanceM ||
      Number(b.onGreen || b.onTee) - Number(a.onGreen || a.onTee) ||
      a.hole - b.hole,
  );
  const [best, second] = scored;
  if (!best || best.distanceM > maxM) return null;
  return {
    hole: best.hole,
    distanceM: best.distanceM,
    runnerUp: second ? { hole: second.hole, distanceM: second.distanceM } : null,
    marginM: second ? second.distanceM - best.distanceM : Infinity,
    onTee: best.onTee,
    onGreen: best.onGreen,
  };
}
