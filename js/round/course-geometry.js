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
import { distanceM, toYards, yardsToM, enuOffset, offsetPoint } from '../util/geo.js';
import {
  pointInRing,
  distanceToRing,
  distanceToPolyline,
  ringCentroid,
  rayRingIntersections,
  projectOnPolyline,
  segmentRingCrossings,
  ringGapM,
  ringSpanM,
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

/* ============================================================================
 * The Hole Overview's numbers (docs/SPEC_hole-overview.md Section 3).
 *
 * One ruler, his rulings 4 to 7: every number is the straight-line distance
 * from the origin at the top of its column to a point on the map. The TEE
 * column is the YOU column computed from the tee box centre; both run these
 * same functions. Pure: no DOM, no storage, nothing written.
 * ========================================================================= */

/** Tells a pond from the creek: ponds 37 and 66 m, the creek 6.9 km (n = 3 water polygons). */
export const COMPACT_SPAN_M = 150;
/** A bunker this close to a green's edge is that green's, and numbered on its hole only (3.4). */
export const GREENSIDE_M = 30;
/** A bunker any of whose vertices is this close to a hole path is numbered on that hole (3.4). */
export const BESIDE_LINE_M = 35;
/** Standing this close to a corner of the hole, his line goes to the next point (3.6). */
export const CORNER_M = 30;
/** A crossing on his line belongs to a creek feature within this of its span down the hole (3.7). */
export const CROSSING_MATCH_M = 80;

const overviewCache = new WeakMap();
function overview(geometry) {
  let oc = overviewCache.get(geometry);
  if (!oc) {
    oc = { owners: null, compact: new Map(), features: new Map() };
    overviewCache.set(geometry, oc);
  }
  return oc;
}

/** The green's centroid - the same centre, from the same cache, that `toGreen` measures to. */
function greenCentreOf(geometry, hole) {
  const ix = index(geometry);
  const green = ix.byId.get(hole.greenId);
  if (!green) return null;
  let C = ix.centroids.get(green.id);
  if (!C) {
    C = ringCentroid(green.ring);
    ix.centroids.set(green.id, C);
  }
  return C;
}

/** The hole's line, its last point replaced by its green's centroid (3.3). */
export function holePath(geometry, holeNumber) {
  if (!geometry) return null;
  const hole = holeOf(geometry, holeNumber);
  if (!hole || !hole.line?.length) return null;
  const C = greenCentreOf(geometry, hole);
  if (!C) return null;
  return [...hole.line.slice(0, -1), C];
}

function isCompact(geometry, p) {
  const oc = overview(geometry);
  if (!oc.compact.has(p.id)) oc.compact.set(p.id, ringSpanM(p.ring) <= COMPACT_SPAN_M);
  return oc.compact.get(p.id);
}

/**
 * Where `path` goes into and out of `ring`, leg by leg: `[{ entry, exit }]`,
 * each `{ sM, point }` with `sM` metres along the path. When the path starts
 * inside the ring its first crossing is a way out, and is dropped.
 */
function crossingPairs(path, ring) {
  const xs = [];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    for (const c of segmentRingCrossings(path[i - 1], path[i], ring)) {
      const sM = acc + c.tM;
      // A crossing exactly on a shared vertex is found by both legs: once.
      if (xs.length && sM - xs[xs.length - 1].sM <= 1e-6) continue;
      xs.push({ sM, point: c.point });
    }
    acc += distanceM(path[i - 1], path[i]);
  }
  if (pointInRing(path[0], ring)) xs.shift();
  const pairs = [];
  for (let j = 0; j + 1 < xs.length; j += 2) pairs.push({ entry: xs[j], exit: xs[j + 1] });
  return pairs;
}

/**
 * Each bunker's green, when it has one: the hole whose green is nearest among
 * those within GREENSIDE_M of it (tie: the lower hole number); null when it is
 * not greenside. Per geometry, computed once.
 */
function bunkerOwners(geometry) {
  const oc = overview(geometry);
  if (oc.owners) return oc.owners;
  const ix = index(geometry);
  const greens = geometry.holes.map((h) => ({ n: h.number, g: ix.byId.get(h.greenId) })).filter((x) => x.g);
  const owners = new Map();
  for (const p of geometry.polygons) {
    if (p.kind !== 'bunker') continue;
    let owner = null;
    let bestGap = Infinity;
    for (const { n, g } of greens) {
      const gap = ringGapM(p.ring, g.ring);
      if (gap <= GREENSIDE_M && (gap < bestGap || (gap === bestGap && n < owner))) {
        owner = n;
        bestGap = gap;
      }
    }
    owners.set(p.id, owner);
  }
  oc.owners = owners;
  return owners;
}

const sideOf = (s) => (s > 0 ? 'L' : s < 0 ? 'R' : 'C');
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The bunkers and creek crossings that get a number on this hole (3.4). Fixed
 * per hole - it does not depend on where he stands, so a marker never changes
 * its name while he walks. Cached per geometry and hole; the list is frozen.
 * A pond is never a feature (his ruling 8), nor the creek beside a hole
 * without crossing it (ruling 9).
 */
export function holeFeatures(geometry, holeNumber) {
  if (!geometry) return [];
  const oc = overview(geometry);
  if (oc.features.has(holeNumber)) return oc.features.get(holeNumber);
  const H = holePath(geometry, holeNumber);
  if (!H || H.length < 2) return [];
  const owners = bunkerOwners(geometry);
  const found = [];
  for (const p of geometry.polygons) {
    if (p.kind === 'bunker') {
      const owner = owners.get(p.id);
      const on =
        owner != null ? owner === holeNumber : p.ring.some((q) => projectOnPolyline(q, H).distanceM <= BESIDE_LINE_M);
      if (!on) continue;
      const at = ringCentroid(p.ring);
      const c = projectOnPolyline(at, H);
      const ss = p.ring.map((q) => projectOnPolyline(q, H).sM);
      found.push({
        id: p.id,
        kind: 'bunker',
        mode: 'beside',
        side: sideOf(c.side),
        sM: c.sM,
        sMinM: Math.min(...ss),
        sMaxM: Math.max(...ss),
        at: Object.freeze(at),
      });
    } else if (p.kind === 'water' && !isCompact(geometry, p)) {
      for (const { entry, exit } of crossingPairs(H, p.ring)) {
        const d = enuOffset(entry.point, exit.point);
        const at = offsetPoint(entry.point, { east: d.east / 2, north: d.north / 2 });
        found.push({
          id: p.id,
          kind: 'water',
          mode: 'cross',
          side: 'C',
          sM: projectOnPolyline(at, H).sM,
          sMinM: entry.sM,
          sMaxM: exit.sM,
          at: Object.freeze(at),
          entry: Object.freeze({ lat: entry.point.lat, lon: entry.point.lon }),
          exit: Object.freeze({ lat: exit.point.lat, lon: exit.point.lon }),
        });
      }
    }
  }
  found.sort((a, b) => a.sM - b.sM || byName(String(a.id), String(b.id)));
  let nb = 0;
  let nw = 0;
  const list = Object.freeze(
    found.map((f) => Object.freeze({ name: f.kind === 'bunker' ? `B${++nb}` : `W${++nw}`, ...f })),
  );
  oc.features.set(holeNumber, list);
  return list;
}

/**
 * Where the TEE column measures from (3.5): the centroid of the mapped box that
 * carries the hole and the set (the one farthest from the green when there
 * are two - his hole 10 ruling), else his markup point for it, else null.
 */
export function teeOrigin(geometry, holeNumber, teeSet) {
  if (!geometry || !teeSet) return null;
  const hole = holeOf(geometry, holeNumber);
  if (!hole) return null;
  const C = greenCentreOf(geometry, hole);
  let best = null;
  for (const b of geometry.polygons) {
    if (b.kind !== 'tee' || !(b.holes ?? []).includes(holeNumber) || !(b.sets ?? []).includes(teeSet)) continue;
    const c = ringCentroid(b.ring);
    const d = C ? distanceM(c, C) : 0;
    if (!best || d > best.d) best = { b, c, d };
  }
  if (best) {
    const reachM = Math.max(...best.b.ring.map((q) => distanceM(best.c, q)));
    return { lat: best.c.lat, lon: best.c.lon, accuracyM: Math.round(reachM * 10) / 10, source: 'map', id: best.b.id };
  }
  const pt = (geometry.points ?? []).find(
    (q) => q.kind === 'tee' && (q.holes ?? []).includes(holeNumber) && (q.sets ?? []).includes(teeSet),
  );
  return pt ? { lat: pt.lat, lon: pt.lon, accuracyM: null, source: 'markup', id: pt.id } : null;
}

/**
 * His line of play from `origin` (3.6): to the next point of the hole path
 * ahead of him - past a corner he is within CORNER_M of - and on to the green.
 */
export function playPath(geometry, holeNumber, origin) {
  if (!geometry || !origin) return null;
  const H = holePath(geometry, holeNumber);
  if (!H || H.length < 2) return null;
  const p = projectOnPolyline(origin, H);
  let k = p.leg;
  if (k < H.length - 1 && distanceM(origin, H[k]) <= CORNER_M) k += 1;
  return { path: [origin, ...H.slice(k)], originS: p.sM };
}

/**
 * Every number on the page for one origin (3.7): the green, the same object the
 * play screen's GREEN line reads, and reach / carry for each feature.
 */
export function holeNumbers(geometry, holeNumber, origin) {
  if (!geometry || !origin) return null;
  if (!holeOf(geometry, holeNumber)) return null;
  const play = playPath(geometry, holeNumber, origin);
  if (!play) return null;
  const H = holePath(geometry, holeNumber);
  const byId = index(geometry).byId;
  const yd = (m) => Math.round(toYards(m));
  const features = holeFeatures(geometry, holeNumber).map((f) => {
    const p = byId.get(f.id);
    const inside = inPolygon(origin, p);
    let reachM;
    let carryM;
    let ownLine = null;
    if (f.mode === 'beside') {
      reachM = inside ? 0 : distanceToRing(origin, p.ring);
      carryM = Math.max(...p.ring.map((q) => distanceM(origin, q)));
    } else {
      ownLine = false;
      reachM = distanceM(origin, f.entry);
      carryM = distanceM(origin, f.exit);
      for (const { entry, exit } of crossingPairs(play.path, p.ring)) {
        const d = enuOffset(entry.point, exit.point);
        const mid = offsetPoint(entry.point, { east: d.east / 2, north: d.north / 2 });
        const s = projectOnPolyline(mid, H).sM;
        if (s >= f.sMinM - CROSSING_MATCH_M && s <= f.sMaxM + CROSSING_MATCH_M) {
          reachM = distanceM(origin, entry.point);
          carryM = distanceM(origin, exit.point);
          ownLine = true;
          break;
        }
      }
    }
    return {
      name: f.name,
      kind: f.kind,
      mode: f.mode,
      side: f.side,
      reachM,
      carryM,
      reachYd: yd(reachM),
      carryYd: yd(carryM),
      inside,
      behind: f.sMaxM < play.originS,
      ownLine,
    };
  });
  return { hole: holeNumber, originS: play.originS, green: toGreen(geometry, holeNumber, origin), features };
}

/** The first point of `path` at `R` metres from `centre`, from its start or searching back from its end. */
function circleOnPath(path, centre, R, fromEnd) {
  const legs = [];
  for (let i = 1; i < path.length; i++) legs.push(i);
  if (fromEnd) legs.reverse();
  for (const i of legs) {
    const a = enuOffset(centre, path[i - 1]);
    const b = enuOffset(centre, path[i]);
    const dx = b.east - a.east;
    const dy = b.north - a.north;
    const A = dx * dx + dy * dy;
    if (A === 0) continue;
    const B = 2 * (a.east * dx + a.north * dy);
    const Cc = a.east * a.east + a.north * a.north - R * R;
    const disc = B * B - 4 * A * Cc;
    if (disc < 0) continue;
    const r = Math.sqrt(disc);
    const ts = [(-B - r) / (2 * A), (-B + r) / (2 * A)].filter((t) => t >= -1e-9 && t <= 1 + 1e-9);
    if (!ts.length) continue;
    const t = Math.min(1, Math.max(0, fromEnd ? Math.max(...ts) : Math.min(...ts)));
    return offsetPoint(path[i - 1], { east: dx * t, north: dy * t });
  }
  return null;
}

/**
 * Where a layup he typed sits on the hole (3.8), derived on read - nothing
 * about the point is stored. `ref: 'green'`: on the hole path, searching back
 * from the green, the first point `yards` from the green's centroid.
 * `ref: 'tee'`: on his line of play from `tee`, the first point `yards` from it.
 */
export function layupPoint(geometry, holeNumber, layup, tee) {
  if (!geometry || !layup) return null;
  const R = yardsToM(layup.yards);
  if (!Number.isFinite(R)) return null;
  if (layup.ref === 'green') {
    const H = holePath(geometry, holeNumber);
    return H && H.length >= 2 ? circleOnPath(H, H[H.length - 1], R, true) : null;
  }
  if (layup.ref === 'tee') {
    if (!tee) return null;
    const play = playPath(geometry, holeNumber, tee);
    return play ? circleOnPath(play.path, tee, R, false) : null;
  }
  return null;
}
