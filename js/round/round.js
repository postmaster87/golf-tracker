/**
 * Round logic and derivations.
 *
 * Nothing in here is persisted except the round object itself. Every number the
 * UI shows — distances, scores, FIR/GIR, scrambling — is computed from raw
 * marks on read. That is what makes the strokes-gained layer additive later:
 * it will consume exactly these derivations, not a parallel copy of the data.
 */

import { distanceM, toYards, toFeet, feetToM } from '../util/geo.js';
import { newRound, newHole, newShot, newMark } from '../data/schema.js';
import { PUTTER } from '../data/clubs.js';
import { playOrder, holeYards } from '../data/courses.js';

/* ------------------------------------------------------------ construction */

export function createRound({ course, teeSet, startingNine, type, holeCount = 18 }) {
  const ordered = playOrder(course, startingNine, holeCount);
  const holes = ordered.map((h, i) =>
    newHole({
      number: h.number,
      playOrder: i,
      par: h.par,
      yards: holeYards(h, teeSet),
      hcp: h.hcp,
    })
  );
  return newRound({
    courseId: course.id,
    courseName: course.name,
    coursePar: holes.reduce((a, h) => a + h.par, 0),
    type,
    teeSet,
    startingNine,
    holes,
  });
}

export const currentHole = (round) => round?.holes?.[round.currentHoleIndex] ?? null;

/* -------------------------------------------------------------- mutations */

/**
 * Suggested lie for the next shot.
 *
 * No longer used to pre-select anything in the capture panel — a highlighted
 * default read as "already chosen" while still requiring the tap. Kept because
 * it is the right basis for any future suggestion that does not masquerade as
 * a selection.
 */
export function defaultLie(hole) {
  if (!hole.shots.length) return 'tee';
  const prev = hole.shots[hole.shots.length - 1];
  if (prev.lie === 'green') return 'green';
  return 'fairway';
}

/** Record which club was used. Pass null to clear it. */
export function setShotClub(shot, club) {
  shot.club = club || null;
  return shot;
}

export function addShot(hole, { lie, reduced, source = 'gps', club = null }) {
  const mark = reduced
    ? newMark({
        lat: reduced.lat,
        lon: reduced.lon,
        accuracyM: reduced.accuracyM,
        quality: reduced.quality,
        method: 'burst',
        samples: reduced.samples,
        spreadM: reduced.spreadM,
        usedCount: reduced.usedCount,
      })
    : null;
  const shot = newShot({ seq: hole.shots.length + 1, lie, mark, source });
  // A shot from the green is a putt by definition — no reason to make anyone
  // tell the app that.
  shot.club = lie === 'green' ? PUTTER : club || null;
  hole.shots.push(shot);
  return shot;
}

export function setCup(hole, reduced) {
  hole.cup = newMark({
    lat: reduced.lat,
    lon: reduced.lon,
    accuracyM: reduced.accuracyM,
    quality: reduced.quality,
    method: 'burst',
    samples: reduced.samples,
    spreadM: reduced.spreadM,
    usedCount: reduced.usedCount,
  });
  hole.completedAt = new Date().toISOString();
  return hole.cup;
}

export function attachPenalty(shot, { type, strokes = 1, note = null }) {
  shot.penalty = { type, strokes, note };
  return shot;
}

/**
 * One-tap undo of the most recent mark on this hole. Returns a token that
 * `restoreUndo` can put back, so a mis-tap on UNDO is itself recoverable.
 */
export function undoLast(hole) {
  // Most-recent-action order. A hand entry is always the newest thing on the
  // hole, so it comes off first — otherwise undo would silently eat a GPS shot
  // that the hand entry had merely overridden.
  if (hole.manual) {
    const manual = hole.manual;
    hole.manual = null;
    hole.completedAt = hole.cup ? hole.cup.ts : null;
    return { kind: 'manual', manual };
  }
  if (hole.greenEntry) {
    const entry = hole.greenEntry;
    // Putts typed in are removed; a putt that carries a GPS mark is the ball's
    // resting place after the approach, so it stays — only its paced distance
    // is cleared.
    const removed = hole.shots.filter((s) => s.lie === 'green' && !s.mark);
    hole.shots = hole.shots.filter((s) => !(s.lie === 'green' && !s.mark));
    const markedFirst = hole.shots.find((s) => s.lie === 'green') ?? null;
    const cleared = markedFirst
      ? { id: markedFirst.id, distanceFt: markedFirst.distanceFt, distanceEntry: markedFirst.distanceEntry }
      : null;
    if (markedFirst) {
      markedFirst.distanceFt = null;
      markedFirst.distanceEntry = null;
    }
    hole.greenEntry = null;
    hole.completedAt = hole.cup ? hole.cup.ts : null;
    renumber(hole);
    return { kind: 'green', entry, removed, cleared };
  }
  if (hole.cup) {
    const cup = hole.cup;
    hole.cup = null;
    hole.completedAt = hole.greenEntry ? hole.greenEntry.enteredAt : null;
    return { kind: 'cup', cup };
  }
  if (hole.shots.length) {
    const shot = hole.shots.pop();
    renumber(hole);
    return { kind: 'shot', shot };
  }
  return null;
}

export function restoreUndo(hole, token) {
  if (!token) return false;
  if (token.kind === 'green') {
    if (token.cleared) {
      const shot = hole.shots.find((s) => s.id === token.cleared.id);
      if (shot) {
        shot.distanceFt = token.cleared.distanceFt;
        shot.distanceEntry = token.cleared.distanceEntry;
      }
    }
    hole.shots.push(...token.removed);
    renumber(hole);
    hole.greenEntry = token.entry;
    hole.completedAt = token.entry.enteredAt;
    return true;
  }
  if (token.kind === 'cup') {
    hole.cup = token.cup;
    hole.completedAt = token.cup.ts;
    return true;
  }
  if (token.kind === 'shot') {
    hole.shots.push(token.shot);
    renumber(hole);
    return true;
  }
  if (token.kind === 'manual') {
    hole.manual = token.manual;
    hole.completedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function removeShot(hole, shotId) {
  const i = hole.shots.findIndex((s) => s.id === shotId);
  if (i < 0) return null;
  const [shot] = hole.shots.splice(i, 1);
  renumber(hole);
  return shot;
}

function renumber(hole) {
  hole.shots.forEach((s, i) => {
    s.seq = i + 1;
  });
}

/**
 * Lasered yardages for a hole, entered after holing out.
 *
 * Entry `i` is the distance to the pin before shot `i + 1`. Stored against the
 * hole rather than against shots because under the continuous-track model no
 * shot records exist while the hole is played — these arrive before the shots
 * they describe do.
 *
 * A `null` entry is kept, not dropped. It states that the shot happened and was
 * NOT ranged, which is different from the shot not existing, and inside 60
 * yards it is the normal case. Trailing nulls ARE dropped, because a blank row
 * at the end is an untouched input rather than a claim about a shot.
 *
 * Values are rounded to whole yards. A laser reads to a yard; storing more
 * precision than the instrument has would overstate the ground truth these
 * exist to provide.
 */
export function setLaseredYards(hole, list) {
  const yards = (list ?? []).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  });
  while (yards.length && yards[yards.length - 1] == null) yards.pop();
  if (!yards.length) {
    hole.lasered = null;
    return null;
  }
  hole.lasered = { yards, enteredAt: new Date().toISOString() };
  return hole.lasered;
}

export const laseredYards = (hole) => hole.lasered?.yards ?? [];
export const laseredCount = (hole) => laseredYards(hole).filter((y) => y != null).length;

/** Hand-entered hole, used when GPS was unusable. Flagged, never blended. */
export function setManualHole(hole, { strokes, putts, firstPuttFt = null, penalties = 0 }) {
  hole.manual = { strokes, putts, firstPuttFt, penalties, enteredAt: new Date().toISOString() };
  hole.completedAt = new Date().toISOString();
  return hole.manual;
}

/* ------------------------------------------------------------- derivations */

/**
 * A hole is finished when its putts are recorded, not when the cup is marked.
 *
 * The cup used to imply completion because it was marked on holing out. It is
 * now marked on the walk from ball to hole, BEFORE the putt — it locates the
 * hole, it does not end it. Treating it as completion would score a hole whose
 * putts had not happened yet.
 *
 * Holing out from off the green still counts: that is a green entry of zero
 * putts, which is an explicit statement rather than an inference.
 */
export const isHoleComplete = (hole) => Boolean(hole.greenEntry || hole.manual);
export const isHoleStarted = (hole) => Boolean(hole.shots.length || hole.manual);

export function penaltyStrokes(hole) {
  return hole.shots.reduce((a, s) => a + (s.penalty?.strokes ?? 0), 0);
}

/**
 * Per-shot geometry. `toHoleM` is the distance from where the shot was played
 * to the cup; `lengthM` is how far the ball actually travelled. Both are null
 * until there is enough information to compute them honestly.
 */
/**
 * Where the hole is, and how well we know it.
 *
 * Marking at the cup is exact but means handling a phone on the green, which is
 * a bad trade during the part of the round that needs the most feel. So the
 * position degrades through tiers, each one reporting its own uncertainty:
 *
 *   1. cup mark          — exact (± the mark's own accuracy)
 *   2. ball-on-green     — off by at most the first putt, which is paced and
 *                          therefore known. On a 150 yd approach a 20 ft offset
 *                          is under 4%, worth ~0.02 strokes of SG. Fine.
 *   3. accumulated       — the average of previous rounds' cup or green marks
 *                          on this hole, passed in by the caller. Uncertainty
 *                          is roughly how far the pin moves.
 *
 * Nothing here ever guesses silently: `source` and `uncertaintyM` travel with
 * the position, and the UI shows them.
 */
export function holePosition(hole, fallback = null) {
  if (hole.cup) {
    return {
      lat: hole.cup.lat,
      lon: hole.cup.lon,
      source: 'cup',
      uncertaintyM: hole.cup.accuracyM ?? 0,
    };
  }
  const firstPutt = hole.shots.find((s) => s.lie === 'green' && s.mark);
  if (firstPutt) {
    // Unknown putt length is treated as a generous 30 ft rather than zero —
    // an honest wide bound beats a flattering narrow one.
    const offsetM = firstPutt.distanceFt != null ? feetToM(firstPutt.distanceFt) : feetToM(30);
    return {
      lat: firstPutt.mark.lat,
      lon: firstPutt.mark.lon,
      source: 'ball-on-green',
      uncertaintyM: Math.round((offsetM + (firstPutt.mark.accuracyM ?? 0)) * 10) / 10,
    };
  }
  return fallback;
}

export function shotGeometry(hole, fallbackPos = null) {
  const { shots } = hole;
  const pin = holePosition(hole, fallbackPos);
  // When the hole's position comes from the ball on the green, that ball cannot
  // measure its own distance to the hole — it would read zero, which is a lie.
  // Only the paced putt distance can answer for it.
  const anchorId =
    pin?.source === 'ball-on-green' ? shots.find((s) => s.lie === 'green' && s.mark)?.id : null;

  return shots.map((s, i) => {
    const next = shots[i + 1];
    const end = next?.mark ?? hole.cup ?? null;
    const paced = s.distanceFt != null;
    const measurable = !paced && s.id !== anchorId && s.mark && pin;
    return {
      shot: s,
      // A stepped-off distance beats a GPS one whenever it exists — on a putt
      // it is not a fallback, it is the better measurement.
      toHoleM: paced ? feetToM(s.distanceFt) : measurable ? distanceM(s.mark, pin) : null,
      toHoleSource: paced ? s.distanceEntry?.unit ?? 'entered' : measurable ? pin.source : null,
      toHoleUncertaintyM: measurable ? pin.uncertaintyM : null,
      // A penalty means the next mark is a drop, not where this shot finished,
      // so the "length" of a penalised shot is not measurable. Say so.
      lengthM: s.mark && end && !s.penalty ? distanceM(s.mark, end) : null,
      endsAtCup: !next && Boolean(hole.cup),
    };
  });
}

export const PUTT_UNITS = {
  paces: { label: 'paces', short: 'pc', toFeet: (v, paceFeet) => v * paceFeet },
  feet: { label: 'feet', short: 'ft', toFeet: (v) => v },
  yards: { label: 'yards', short: 'yd', toFeet: (v) => v * 3 },
};

/**
 * Record a stepped-off distance to the hole. Keeps the raw count and the pace
 * length alongside the derived feet, so a recalibrated stride can be reapplied
 * to old rounds instead of quietly invalidating them.
 */
export function setShotDistance(shot, { value, unit = 'feet', paceFeet = 3 } = {}) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) {
    shot.distanceFt = null;
    shot.distanceEntry = null;
    return shot;
  }
  const feet = (PUTT_UNITS[unit] ?? PUTT_UNITS.feet).toFeet(n, paceFeet);
  shot.distanceFt = Math.round(feet * 10) / 10;
  shot.distanceEntry = { value: n, unit, paceFeet: unit === 'paces' ? paceFeet : null };
  return shot;
}

/** Convenience for a distance already in feet. */
export function setShotDistanceFt(shot, feet) {
  return setShotDistance(shot, { value: feet, unit: 'feet' });
}

export const isFirstPutt = (hole, shot) => hole.shots.find((s) => s.lie === 'green') === shot;

/**
 * Enter the hole's putting after the fact — the count, and the distance to the
 * hole before each putt. This is the whole green workflow: nothing is tapped
 * between reaching the green and walking off it.
 *
 * `distances[i]` is the distance to the hole BEFORE putt i+1, so distances[1]
 * is the leave from the first putt — the number that decides whether a lag was
 * any good.
 *
 * A GPS mark on the first putt (the ball's resting place after the approach) is
 * preserved: it is what locates the hole for every earlier shot.
 */
export function setGreenEntry(hole, { putts, distances = [], unit = 'paces', paceFeet = 3 }) {
  const existingGreen = hole.shots.filter((s) => s.lie === 'green');
  const markedFirst = existingGreen.find((s) => s.mark) ?? null;

  hole.shots = hole.shots.filter((s) => s.lie !== 'green');
  for (let i = 0; i < putts; i++) {
    const shot =
      i === 0 && markedFirst ? markedFirst : newShot({ seq: 0, lie: 'green', mark: null, source: 'manual' });
    shot.club = PUTTER;
    setShotDistance(shot, { value: distances[i] ?? null, unit, paceFeet });
    hole.shots.push(shot);
  }
  renumber(hole);

  hole.greenEntry = { putts, unit, paceFeet, enteredAt: new Date().toISOString() };
  hole.completedAt = new Date().toISOString();
  return hole.greenEntry;
}

/** Distance to the hole before each putt, in feet. Nulls where not recorded. */
export function puttDistancesFt(hole) {
  if (hole.manual) return hole.manual.firstPuttFt != null ? [hole.manual.firstPuttFt] : [];
  return hole.shots.filter((s) => s.lie === 'green').map((s) => s.distanceFt);
}

export function holeStrokes(hole) {
  if (hole.manual) return hole.manual.strokes;
  if (!hole.shots.length) return null;
  return hole.shots.length + penaltyStrokes(hole);
}

export function holePutts(hole) {
  if (hole.manual) return hole.manual.putts;
  return hole.shots.filter((s) => s.lie === 'green').length;
}

export function firstPuttM(hole) {
  if (hole.manual) {
    return hole.manual.firstPuttFt != null ? feetToM(hole.manual.firstPuttFt) : null;
  }
  const putt = hole.shots.find((s) => s.lie === 'green');
  if (!putt) return null;
  if (putt.distanceFt != null) return feetToM(putt.distanceFt);
  if (!putt.mark || !hole.cup) return null;
  return distanceM(putt.mark, hole.cup);
}

/**
 * Fairway in regulation. Null on par 3s, where it has no meaning.
 *
 * Driving the green counts as a hit: Veenker's gold tees have three par 4s
 * under 300 yards, and scoring a drive that finished on the putting surface as
 * a missed fairway would be perverse — there was nothing better available.
 */
export function fir(hole) {
  if (hole.par < 4) return null;
  if (hole.manual) return hole.manual.fir ?? null;
  if (!hole.shots.length) return null;
  const second = hole.shots[1];
  if (!second) return isHoleComplete(hole) ? true : null; // holed the tee shot
  return second.lie === 'fairway' || second.lie === 'green';
}

/**
 * Green in regulation: on the putting surface in (par - 2) strokes or fewer,
 * penalties included. Holing out from off the green in that many strokes counts.
 */
export function gir(hole) {
  if (hole.manual) return hole.manual.gir ?? null;
  if (!isHoleComplete(hole)) return null;
  const target = hole.par - 2;
  const firstPuttIdx = hole.shots.findIndex((s) => s.lie === 'green');
  if (firstPuttIdx < 0) {
    const strokes = holeStrokes(hole);
    return strokes != null && strokes <= target;
  }
  const before = hole.shots.slice(0, firstPuttIdx);
  const strokesToGreen = before.length + before.reduce((a, s) => a + (s.penalty?.strokes ?? 0), 0);
  return strokesToGreen <= target;
}

/** Scrambling: missed the green in regulation and still made par or better. */
export function scramble(hole) {
  if (!isHoleComplete(hole)) return null;
  const g = gir(hole);
  if (g !== false) return null;
  const strokes = holeStrokes(hole);
  if (strokes == null) return null;
  return strokes <= hole.par;
}

export function roundTotals(round) {
  const played = round.holes.filter(isHoleComplete);
  const t = {
    holes: played.length,
    strokes: 0,
    par: 0,
    toPar: 0,
    putts: 0,
    penalties: 0,
    firHit: 0,
    firEligible: 0,
    girHit: 0,
    girEligible: 0,
    scrambleHit: 0,
    scrambleEligible: 0,
    manualHoles: 0,
    gpsShots: 0,
    poorMarks: 0,
    // "No 3 putts, but 1 putt better" — the two numbers that motto lives on,
    // plus the two distances that explain them.
    onePutts: 0,
    twoPutts: 0,
    threePlusPutts: 0,
    holesWithPuttData: 0,
    proximityFt: [], // distance to the hole facing the first putt
    lagFt: [], // what was left after it
  };
  for (const hole of played) {
    const s = holeStrokes(hole);
    if (s == null) continue;
    t.strokes += s;
    t.par += hole.par;
    t.putts += holePutts(hole) ?? 0;
    t.penalties += hole.manual ? (hole.manual.penalties ?? 0) : penaltyStrokes(hole);
    if (hole.manual) t.manualHoles++;

    const f = fir(hole);
    if (f !== null) {
      t.firEligible++;
      if (f) t.firHit++;
    }
    const g = gir(hole);
    if (g !== null) {
      t.girEligible++;
      if (g) t.girHit++;
    }
    const sc = scramble(hole);
    if (sc !== null) {
      t.scrambleEligible++;
      if (sc) t.scrambleHit++;
    }
    const putts = holePutts(hole);
    if (putts != null) {
      t.holesWithPuttData++;
      if (putts === 1) t.onePutts++;
      else if (putts === 2) t.twoPutts++;
      else if (putts >= 3) t.threePlusPutts++;
    }
    const dists = puttDistancesFt(hole);
    if (dists[0] != null) t.proximityFt.push(dists[0]);
    if (dists[1] != null) t.lagFt.push(dists[1]);

    for (const shot of hole.shots) {
      if (shot.mark) {
        t.gpsShots++;
        if (shot.mark.quality === 'poor') t.poorMarks++;
      }
    }
  }
  t.toPar = t.strokes - t.par;
  return t;
}

/* ------------------------------------------------------------------- track */

/**
 * Decimated breadcrumb. Full 1 Hz tracking for 4.5 hours would be ~16k points
 * per round; at two dozen rounds that alone would threaten the localStorage
 * budget. 25 m / 30 s keeps walking pace recoverable at ~1% of the size.
 */
export function appendTrack(round, fix, { minGapMs = 30000, minMoveM = 25, cap = 3000 } = {}) {
  if (!fix) return false;
  const last = round.track[round.track.length - 1];
  if (last) {
    const movedEnough = distanceM({ lat: last[0], lon: last[1] }, fix) >= minMoveM;
    const waitedEnough = fix.ts - last[3] >= minGapMs;
    if (!movedEnough && !waitedEnough) return false;
  }
  round.track.push([
    Number(fix.lat.toFixed(7)),
    Number(fix.lon.toFixed(7)),
    Math.round(fix.acc),
    fix.ts,
  ]);
  if (round.track.length > cap) round.track.shift();
  return true;
}

/* -------------------------------------------------- accumulated course data */

function runningMean(entry, mark) {
  if (!entry) return { lat: mark.lat, lon: mark.lon, n: 1 };
  const n = entry.n + 1;
  return {
    lat: entry.lat + (mark.lat - entry.lat) / n,
    lon: entry.lon + (mark.lon - entry.lon) / n,
    n,
  };
}

function learningFor(app, courseId) {
  app.courseLearning ??= {};
  app.courseLearning[courseId] ??= { tees: {}, cups: {}, greens: {} };
  app.courseLearning[courseId].greens ??= {};
  return app.courseLearning[courseId];
}

/** Fold a good-quality tee mark into the accumulated tee position. */
export function learnTee(app, round, holeNumber, mark) {
  if (!mark || mark.quality === 'poor') return;
  const L = learningFor(app, round.courseId);
  L.tees[holeNumber] ??= {};
  L.tees[holeNumber][round.teeSet] = runningMean(L.tees[holeNumber][round.teeSet], mark);
}

/**
 * Fold a cup mark into the accumulated green position, and flag it if it is far
 * from where this hole's cup has been every other time — usually the sign of a
 * mark taken on the wrong hole.
 */
export function learnCup(app, round, holeNumber, mark, { warnM = 60 } = {}) {
  if (!mark || mark.quality === 'poor') return { warning: null };
  const L = learningFor(app, round.courseId);
  const prev = L.cups[holeNumber];
  let warning = null;
  if (prev && prev.n >= 2) {
    const d = distanceM(prev, mark);
    if (d > warnM) {
      warning = `Cup mark is ${Math.round(toYards(d))} yd from where hole ${holeNumber}'s cup has been on ${prev.n} previous rounds.`;
    }
  }
  L.cups[holeNumber] = runningMean(prev, mark);
  return { warning };
}

/**
 * Fold a ball-on-green mark into the accumulated green position. Noisier than a
 * cup mark — it is wherever an approach happened to finish — but it accumulates
 * from ordinary play with no extra taps, and averages toward the green's centre.
 */
export function learnGreen(app, round, holeNumber, mark) {
  if (!mark || mark.quality === 'poor') return;
  const L = learningFor(app, round.courseId);
  L.greens ??= {};
  L.greens[holeNumber] = runningMean(L.greens[holeNumber], mark);
}

/**
 * Best known position of the hole from previous rounds. Cup marks win; green
 * marks are the fallback. Uncertainty reflects how far a pin moves, so a
 * distance derived from this is never presented as if it were measured.
 */
export function accumulatedHolePosition(app, courseId, holeNumber) {
  const L = app.courseLearning?.[courseId];
  const cup = L?.cups?.[holeNumber];
  if (cup) return { lat: cup.lat, lon: cup.lon, source: 'accumulated-cup', uncertaintyM: 12, n: cup.n };
  const green = L?.greens?.[holeNumber];
  if (green) return { lat: green.lat, lon: green.lon, source: 'accumulated-green', uncertaintyM: 18, n: green.n };
  return null;
}

/**
 * Which nine did this round actually start on? Compares the first tee mark
 * against accumulated tee positions for the two possible opening holes.
 * Returns null unless both are seeded and one is clearly closer — the manual
 * toggle stays authoritative until the data can beat it.
 */
export function detectStartingNine(app, course, teeSet, mark, { minSeparationM = 100 } = {}) {
  const L = app.courseLearning?.[course.id];
  if (!L || !mark) return null;
  const nine = Math.floor(course.holes.length / 2);
  const frontHole = course.holes[0]?.number;
  const backHole = course.holes[nine]?.number;
  const frontTee = L.tees?.[frontHole]?.[teeSet];
  const backTee = L.tees?.[backHole]?.[teeSet];
  if (!frontTee || !backTee) return null;

  const dFront = distanceM(frontTee, mark);
  const dBack = distanceM(backTee, mark);
  if (Math.abs(dFront - dBack) < minSeparationM) return null;
  return {
    nine: dFront < dBack ? 'front' : 'back',
    dFrontM: dFront,
    dBackM: dBack,
  };
}

/* ---------------------------------------------------------------- formatting */

export function fmtYards(m, { dp = 0 } = {}) {
  if (m == null) return '—';
  const y = toYards(m);
  return `${y.toFixed(dp)} yd`;
}

/**
 * Golfers switch units by shot type, not by a distance threshold: a pitch is
 * "30 yards", a putt is "20 feet". Nobody calls a pitch 89 feet. So putts are
 * always feet, everything else is yards until it gets short enough that feet
 * read more naturally.
 */
export function fmtDistance(m, { asFeet = false } = {}) {
  if (m == null) return '—';
  if (asFeet) return `${Math.round(toFeet(m))} ft`;
  const y = toYards(m);
  if (y < 10) return `${Math.round(toFeet(m))} ft`;
  return `${Math.round(y)} yd`;
}

export function fmtToPar(n) {
  if (n == null) return '—';
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}
