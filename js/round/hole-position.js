/**
 * WHERE THE HOLE IS (docs/SPEC_hole-position.md, D1).
 *
 * Matt, 2026-09-28: *"D1. map center with the option for me to correct it
 * manually by entering tournament pin sheet numbers."* And on the cup the track
 * used to offer, his item 3, answered "yes": distance to the hole uses the
 * map's green, never a cup taken from the track.
 *
 * Every distance the app shows and every distance the strokes-gained engine
 * looks up is measured to the position this module resolves. On a course with
 * a map the order is (Section 3.1):
 *
 *   1. the cup he marked (any method except `track`)        source `cup`
 *   2. his pin sheet, placed on the map's green              source `pin-sheet`
 *   3. the ball he marked on the green                       source `ball-on-green`
 *   4. the centre of the map's green                         source `map-green`
 *
 * A position that cannot be the hole is passed over and named in `skipped`
 * (Section 3.2): a cup taken from the track, a cup or ball mark more than
 * 15 m outside the hole's own green, a pin sheet that lands more than 3 m off
 * it or cannot be placed. That is a filter at read time. Nothing stored is
 * deleted or rewritten: the mark stays on the hole and the pin sheet stays as
 * he typed it.
 *
 * With no map - or no green on the map for that hole - it is exactly the order
 * and the numbers of build v32 (Section 3.3): `hole.cup` of any method, the
 * ball on the green, the accumulated position from earlier rounds.
 *
 * Pure functions. Imports from geo.js and polygon.js only: course-geometry.js
 * is read, not written, and nothing here needs it.
 */

import { distanceM, bearingDeg, enuOffset, offsetPoint, feetToM } from '../util/geo.js';
import { pointInRing, distanceToRing, ringCentroid, rayRingIntersections } from '../util/polygon.js';

/** A cup or ball mark farther than this outside its own green is not the hole (3.2). */
export const HOLE_ON_GREEN_M = 15;
/** A pin sheet that lands farther than this outside the green is not used (3.2). */
export const PIN_OFF_GREEN_M = 3;
/** The error bar on a pin placed from his pin sheet (3.1, tier 2). */
export const PIN_SHEET_UNCERTAINTY_M = 4;
/** 150 yd: where the line of play is taken from, back along the hole's line (4.1). */
export const APPROACH_BACK_M = 137.16;
/**
 * 100 yd past the card: a mark farther than `hole.yards` plus this from the hole
 * is not on the hole, and gives no distance (spec Section 12, C8). The engine
 * refuses to guess a distance; a lookup 3,905 yd out on a 419 yd hole is one.
 */
export const OFF_HOLE_MARGIN_M = 91.44;

const frameCache = new WeakMap();

function greenOf(geometry, holeNumber) {
  const hole = geometry?.holes?.find((h) => h.number === holeNumber) ?? null;
  if (!hole) return { hole: null, green: null };
  const green = geometry.polygons?.find((p) => p.id === hole.greenId) ?? null;
  return { hole, green: green?.ring?.length ? green : null };
}

/**
 * The point `backM` metres back from the end of a polyline, measured along it;
 * the line's start when the line is shorter than that (4.1 step 1).
 */
function pointBackAlong(line, backM) {
  let remaining = backM;
  for (let i = line.length - 1; i > 0; i--) {
    const a = line[i];
    const b = line[i - 1];
    const seg = distanceM(a, b);
    if (seg >= remaining) {
      if (seg === 0) return { lat: a.lat, lon: a.lon };
      const d = enuOffset(a, b);
      const t = remaining / seg;
      return offsetPoint(a, { north: d.north * t, east: d.east * t });
    }
    remaining -= seg;
  }
  return { lat: line[0].lat, lon: line[0].lon };
}

/**
 * The green's frame (Section 4.1): the approach point A 150 yd back along the
 * hole's line, the centre C (`ringCentroid`, the centre `toGreen` uses), the
 * line of play from A to C, the front edge F where the ray A->C first crosses
 * the ring, and the depth from the first crossing to the last.
 *
 * `{ centre, front, depthM, bearingDeg, ring, greenId, approach }`, or null
 * with no map, no hole or no green on the map for that hole - and null when
 * A stands inside the green or the ray never crosses it, since then there is
 * no front edge to measure from.
 */
export function greenFrame(geometry, holeNumber) {
  if (!geometry) return null;
  let byHole = frameCache.get(geometry);
  if (!byHole) {
    byHole = new Map();
    frameCache.set(geometry, byHole);
  }
  if (byHole.has(holeNumber)) return byHole.get(holeNumber);

  let frame = null;
  const { hole, green } = greenOf(geometry, holeNumber);
  if (hole && green && hole.line?.length) {
    const ring = green.ring;
    const centre = ringCentroid(ring);
    const approach = pointBackAlong(hole.line, APPROACH_BACK_M);
    const xs = pointInRing(approach, ring) ? [] : rayRingIntersections(approach, centre, ring);
    if (xs.length) {
      const d = enuOffset(approach, centre);
      const len = Math.hypot(d.east, d.north);
      const front = offsetPoint(approach, { north: (d.north / len) * xs[0], east: (d.east / len) * xs[0] });
      frame = {
        centre,
        front,
        depthM: xs[xs.length - 1] - xs[0],
        bearingDeg: bearingDeg(approach, centre),
        ring,
        greenId: green.id,
        approach,
      };
    }
  }
  byHole.set(holeNumber, frame);
  return frame;
}

/** Metres outside hole `holeNumber`'s green ring, 0 inside; null with no map, no green or no position. */
export function offOwnGreenM(geometry, holeNumber, pos) {
  if (!geometry || !Number.isFinite(pos?.lat) || !Number.isFinite(pos?.lon)) return null;
  const { green } = greenOf(geometry, holeNumber);
  if (!green) return null;
  return pointInRing(pos, green.ring) ? 0 : distanceToRing(pos, green.ring);
}

/**
 * His pin sheet, placed on the map's green (Section 4.2).
 *
 * `pinSheet` is what he typed (Section 5): `{ onPaces, side, sidePaces,
 * sideFrom, paceFeet }`. One pace is `paceFeet x 0.3048` m.
 *
 *   1. The point on the line of play `onPaces` from F, toward C.
 *   2. Through it, the line across the green at right angles; its crossings
 *      with the ring are the left and right edges there. Right is to the right
 *      of a player facing from A to C.
 *   3. `sideFrom: 'edge'` (the tournament sheet): L is `sidePaces` in from the
 *      left edge, R in from the right edge, C halfway between the two.
 *   4. `sideFrom: 'centre'`: `sidePaces` right of the line for R, left for L,
 *      on it for C.
 *
 * Returns `{ placed: true, lat, lon, offGreenM, fromCentreM }`, or
 * `{ placed: false, why }` - `why` is `on-point-off-green` (step 1 is not on
 * the green), `no-left-edge` / `no-right-edge` (step 2), or `bad-entry` (a
 * number that is not one, an unknown side, or L / R with no side number) - or
 * null with no map, no frame for that hole, or no entry.
 */
export function pinFromSheet(geometry, holeNumber, pinSheet) {
  if (!geometry || !pinSheet) return null;
  const frame = greenFrame(geometry, holeNumber);
  if (!frame) return null;

  const { onPaces, side, sidePaces = null, sideFrom = 'edge', paceFeet } = pinSheet;
  const paceM = feetToM(Number(paceFeet));
  const on = Number(onPaces);
  const lateral = side === 'C' ? 0 : Number(sidePaces);
  if (
    !(paceM > 0) ||
    onPaces == null ||
    !Number.isFinite(on) ||
    on < 0 ||
    !['L', 'R', 'C'].includes(side) ||
    (side !== 'C' && (sidePaces == null || !Number.isFinite(lateral) || lateral < 0))
  ) {
    return { placed: false, why: 'bad-entry' };
  }

  const b = (frame.bearingDeg * Math.PI) / 180;
  const u = { east: Math.sin(b), north: Math.cos(b) }; // A toward C
  const v = { east: u.north, north: -u.east }; // to his right, facing A to C
  const step = (from, dir, m) => offsetPoint(from, { east: dir.east * m, north: dir.north * m });

  const onM = on * paceM;
  const point = step(frame.front, u, onM);
  if (!pointInRing(point, frame.ring)) return { placed: false, why: 'on-point-off-green' };

  const leftM = rayRingIntersections(point, step(point, v, -10), frame.ring)[0];
  const rightM = rayRingIntersections(point, step(point, v, 10), frame.ring)[0];
  if (!Number.isFinite(leftM)) return { placed: false, why: 'no-left-edge' };
  if (!Number.isFinite(rightM)) return { placed: false, why: 'no-right-edge' };

  // Across the green, metres to his right of `point`.
  const sM = lateral * paceM;
  let x;
  if (sideFrom === 'centre') x = side === 'R' ? sM : side === 'L' ? -sM : 0;
  else x = side === 'L' ? -leftM + sM : side === 'R' ? rightM - sM : (rightM - leftM) / 2;

  const pin = step(point, v, x);
  return {
    placed: true,
    lat: pin.lat,
    lon: pin.lon,
    offGreenM: pointInRing(pin, frame.ring) ? 0 : distanceToRing(pin, frame.ring),
    fromCentreM: distanceM(pin, frame.centre),
  };
}

/** The ball he marked on the green: the first putt that carries a mark. */
const markedFirstPutt = (hole) => hole.shots?.find((s) => s.lie === 'green' && s.mark) ?? null;

function ballOnGreen(putt, skipped) {
  // Unknown putt length is treated as a generous 30 ft rather than zero -
  // an honest wide bound beats a flattering narrow one.
  const offsetM = putt.distanceFt != null ? feetToM(putt.distanceFt) : feetToM(30);
  return {
    lat: putt.mark.lat,
    lon: putt.mark.lon,
    source: 'ball-on-green',
    uncertaintyM: Math.round((offsetM + (putt.mark.accuracyM ?? 0)) * 10) / 10,
    skipped,
  };
}

/**
 * Where the hole is: `{ lat, lon, source, uncertaintyM, skipped }`, or null
 * when nothing locates it (a course with no map and no data).
 *
 * `geometry` is the course map (null for a course without one); `accumulated`
 * is the position earlier rounds learned (`accumulatedHolePosition`), reached
 * only on a course with no map. `skipped` lists every position passed over,
 * `{ what: 'cup' | 'ball' | 'pin-sheet', why: 'from-track' | 'off-green' |
 * 'not-placed', offM }`, `offM` null where it does not apply.
 */
export function resolveHolePosition(hole, { geometry = null, accumulated = null } = {}) {
  if (!hole) return null;
  const frame = geometry ? greenFrame(geometry, hole.number) : null;

  if (!frame) {
    // A course with no map, or a hole the map has no green for (3.3).
    if (hole.cup) {
      return {
        lat: hole.cup.lat,
        lon: hole.cup.lon,
        source: 'cup',
        uncertaintyM: hole.cup.accuracyM ?? 0,
        skipped: [],
      };
    }
    const putt = markedFirstPutt(hole);
    if (putt) return ballOnGreen(putt, []);
    return accumulated ? { ...accumulated, skipped: [] } : null;
  }

  const skipped = [];
  const off = (pos) => offOwnGreenM(geometry, hole.number, pos);

  // 1. The cup he marked. Never one taken from the track (his item 3).
  if (hole.cup) {
    if (hole.cup.method === 'track') {
      skipped.push({ what: 'cup', why: 'from-track', offM: null });
    } else {
      const offM = off(hole.cup);
      if (offM > HOLE_ON_GREEN_M) skipped.push({ what: 'cup', why: 'off-green', offM });
      else {
        return {
          lat: hole.cup.lat,
          lon: hole.cup.lon,
          source: 'cup',
          uncertaintyM: hole.cup.accuracyM ?? 0,
          skipped,
        };
      }
    }
  }

  // 2. His pin sheet, placed on the map's green.
  const sheet = hole.pinSheet ?? null;
  if (sheet) {
    const pin = pinFromSheet(geometry, hole.number, sheet);
    if (!pin?.placed) skipped.push({ what: 'pin-sheet', why: 'not-placed', offM: null });
    else if (pin.offGreenM > PIN_OFF_GREEN_M) skipped.push({ what: 'pin-sheet', why: 'off-green', offM: pin.offGreenM });
    else {
      return { lat: pin.lat, lon: pin.lon, source: 'pin-sheet', uncertaintyM: PIN_SHEET_UNCERTAINTY_M, skipped };
    }
  }

  // 3. The ball he marked on the green, as before.
  const putt = markedFirstPutt(hole);
  if (putt) {
    const offM = off(putt.mark);
    if (offM > HOLE_ON_GREEN_M) skipped.push({ what: 'ball', why: 'off-green', offM });
    else return ballOnGreen(putt, skipped);
  }

  // 4. The centre of the map's green. Always there on a map course.
  return {
    lat: frame.centre.lat,
    lon: frame.centre.lon,
    source: 'map-green',
    uncertaintyM: frame.depthM / 2,
    skipped,
  };
}
