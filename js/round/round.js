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
// One direction only: track-analysis knows nothing about rounds, so this cannot
// close a cycle.
import { candidateAccuracyM, candidateQuality } from './track-analysis.js';

/* ------------------------------------------------------------ construction */

export function createRound({ course, teeSet, startingNine, type, holeCount = 18, startHole = null }) {
  // `startHole` is the shotgun start: the sequence is rotated to begin there,
  // so hole order, NEXT HOLE and FINISH ROUND all follow what is being played.
  const ordered = playOrder(course, startingNine, holeCount, startHole);
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

/**
 * Put a tee shot back on a hole that was played without one.
 *
 * The tee is the one position on a golf course that cannot really be lost. A
 * ball's resting place is unique to that shot and gone the moment you play it,
 * but the tee is a fixed feature you were standing on when the hole began — so
 * it is in the dense track whether or not anyone remembered to mark it.
 *
 * Inserted at the FRONT and renumbered, because a tee shot recovered after the
 * fact is still the first stroke of the hole. Appending it would make the drive
 * the last shot played, which is the same class of error as the penalty landing
 * on the wrong shot.
 *
 * `source: 'track'` and `inferred` are what keep this out of the measured data.
 * Design rule 5: a recovered tee is evidence, not a mark he stood on and took.
 */
export function insertTeeShot(hole, { reduced, club = null, inferredFrom = 'track' }) {
  const mark = reduced
    ? newMark({
        lat: reduced.lat,
        lon: reduced.lon,
        accuracyM: reduced.accuracyM,
        quality: reduced.quality,
        method: 'track',
        samples: [],
        spreadM: reduced.spreadM ?? null,
        usedCount: reduced.usedCount ?? null,
      })
    : null;
  const shot = newShot({ seq: 1, lie: 'tee', mark, source: 'track' });
  shot.club = club || null;
  shot.inferred = inferredFrom;
  hole.shots.unshift(shot);
  renumber(hole);
  return shot;
}

/** True when this hole's tee shot was recovered rather than marked. */
export const teeIsInferred = (hole) => Boolean(hole.shots?.[0]?.inferred && hole.shots[0].lie === 'tee');

/** The tee shot on a hole, if one was ever recorded. */
export const teeShot = (hole) => hole.shots?.find((s) => s.lie === 'tee') ?? null;

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

/**
 * Accept a track-derived first-putt distance.
 *
 * Kept separate from `setShotDistance` so the provenance cannot be lost by
 * accident. Design rule 5: measured and inferred data are never silently mixed,
 * and a putt distance is the single most load-bearing number in the round —
 * strokes gained putting is extremely sensitive to it, and field test 3 showed
 * that getting it wrong in the *absent* direction moved his putting by a third
 * of a stroke over nine holes.
 *
 * So the value goes in, and `distanceEntry.inferred` goes in beside it, along
 * with the uncertainty the proposal came with. Anything reading this back can
 * tell a paced 8 ft from a track-estimated 8 ft, which are not the same
 * measurement and must never average together as though they were.
 */
export function setInferredFirstPutt(hole, proposal) {
  const putt = hole.shots.find((s) => s.lie === 'green');
  if (!putt || !proposal) return null;
  setShotDistanceFt(putt, proposal.distanceFt);
  putt.distanceEntry = {
    value: proposal.distanceFt,
    unit: 'feet',
    paceFeet: null,
    inferred: 'track',
    uncertaintyFt: proposal.uncertaintyFt,
    confidence: proposal.confidence,
    acceptedAt: new Date().toISOString(),
  };
  return putt;
}

/** True when this hole's first putt distance was estimated, not stepped off. */
export const firstPuttIsInferred = (hole) =>
  Boolean(hole.shots.find((s) => s.lie === 'green')?.distanceEntry?.inferred);

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

/**
 * The stretch of track that belongs to one hole.
 *
 * Agenda item 2 has to work on a hole where **nothing was marked at all** —
 * that is the whole point of it, the phone stayed in the pocket — so the window
 * cannot be derived from this hole's own marks. It is bounded by the holes
 * either side instead: the previous completed hole's `completedAt` opens it,
 * and the next completed hole's first mark, or now, closes it.
 *
 * Deliberately generous at both ends. Too wide only offers a few extra
 * candidates, which the ranking pushes down and Matt rejects in a tap; too
 * narrow silently omits a real shot, which he then has to notice is missing.
 * Those costs are not symmetric.
 */
export function holeWindow(round, hole, { now = Date.now() } = {}) {
  const order = round.holes;
  const i = order.indexOf(hole);
  const parse = (iso) => (iso ? Date.parse(iso) : NaN);

  let fromTs = parse(round.startedAt);
  for (let j = i - 1; j >= 0; j--) {
    const t = parse(order[j].completedAt);
    if (Number.isFinite(t)) {
      fromTs = t;
      break;
    }
  }

  // This hole's own marks tighten the window when there are any — a marked tee
  // shot is a much better lower bound than the previous green.
  const marks = hole.shots
    .filter((s) => s.mark?.ts)
    .map((s) => Date.parse(s.mark.ts))
    .filter(Number.isFinite);
  if (marks.length) fromTs = Math.min(fromTs, ...marks);

  let toTs = now;
  const own = parse(hole.completedAt);
  if (Number.isFinite(own)) toTs = own;
  for (let j = i + 1; j < order.length; j++) {
    const t = parse(order[j].completedAt);
    if (Number.isFinite(t)) {
      toTs = Math.min(toTs, t);
      break;
    }
  }

  return { fromTs: Number.isFinite(fromTs) ? fromTs : null, toTs: Number.isFinite(toTs) ? toTs : null };
}

/**
 * Turn a confirmed stop candidate into a real shot on the hole.
 *
 * The candidate is reshaped into the same `reduced` object a GPS burst
 * produces, so it flows through `addShot` and every distance, lie and strokes
 * gained calculation downstream treats it identically — except for its
 * provenance, which is `source: 'track'` on the shot and `method: 'track'` on
 * the mark, and never gets to look like a burst he stood still for.
 *
 * `lieInferred` records that the lie was the app's guess rather than his
 * answer. Design rule 5 again, and his own instruction on the point: *"If I
 * cant remember do what you need"* — with the standing caveat that inferred
 * lies must be flagged, not folded in silently.
 */
export function addTrackShot(hole, { lie, candidate, club = null, lieInferred = false }) {
  const accuracyM = candidateAccuracyM(candidate);
  const shot = addShot(hole, {
    lie,
    source: 'track',
    club,
    reduced: {
      lat: candidate.lat,
      lon: candidate.lon,
      accuracyM,
      quality: candidateQuality(accuracyM),
      spreadM: candidate.spreadM,
      usedCount: candidate.n,
      samples: [],
    },
  });
  if (shot.mark) {
    shot.mark.method = 'track';
    // Keep the evidence with the shot. A confirmed candidate is a labelled
    // example, and "this needs to be trainable" is a stated requirement — the
    // features that earned the proposal have to survive the confirmation.
    shot.mark.trackStop = {
      startTs: candidate.startTs,
      endTs: candidate.endTs,
      dwellMs: candidate.dwellMs,
      departureM: candidate.departureM,
      arrivalSpeed: candidate.arrivalSpeed,
      score: candidate.score,
    };
  }
  if (lieInferred) shot.lieInferred = true;
  return shot;
}

/** True when any shot on this hole came from the track rather than a mark. */
export const holeHasTrackShots = (hole) => hole.shots.some((s) => s.source === 'track');

/**
 * WHAT IS MISSING FROM A ROUND, AS A LIST OF THINGS TO GO AND FIX
 *
 * Matt, after field test 3: *"Mandatory stats to finish the round. If there is
 * missing data it is best I fill that in before saving the round."*
 *
 * He is not asking for tidiness. That round finished with 4 of 40 strokes
 * unattributed — two holes with no first-putt distance — and filling them in
 * afterwards moved his putting from +0.52 to +0.19. Every gap that closed took
 * something off his best category and nothing was ever added, because a stroke
 * the app cannot see is a stroke it cannot charge him for. Missing data does
 * not average out. It flatters.
 *
 * Two kinds are reported, and the distinction matters:
 *
 *   `incomplete` — a hole with shots on it but no putts entered. He played it;
 *                  the app just never got told how it ended.
 *   `firstPutt`  — a completed hole whose first putt has no distance, by pace,
 *                  by hand, or recoverable from a ball mark and a cup mark.
 *                  This is the one that actually happened, twice.
 *
 * Holes never started are deliberately NOT reported. Walking in after nine of
 * an eighteen is a choice, not an omission, and a gate that argues with it
 * would be trained away within a round.
 */
export function roundGaps(round) {
  const gaps = [];
  for (const hole of round?.holes ?? []) {
    if (!isHoleStarted(hole)) continue;

    if (!isHoleComplete(hole)) {
      gaps.push({
        holeNumber: hole.number,
        kind: 'incomplete',
        label: `Hole ${hole.number}: no putts entered`,
      });
      continue;
    }

    // firstPuttM already tries the paced value, the hand-entered value, and
    // the ball-mark-to-cup geometry. Null here means there is genuinely no way
    // to know, and those putts drop out of the analysis entirely.
    if ((holePutts(hole) ?? 0) > 0 && firstPuttM(hole) == null) {
      gaps.push({
        holeNumber: hole.number,
        kind: 'firstPutt',
        label: `Hole ${hole.number}: first putt distance missing`,
      });
    }
  }
  return gaps;
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

/**
 * Fold a good-quality tee mark into the accumulated tee position.
 *
 * A tee box does not move. `warnM` is generous enough to absorb a tee set being
 * played forward and the markers being shifted, and nothing else — a mark
 * further out than this is on another hole, or another course, or a desk. It is
 * still recorded on the round; it simply does not get to teach the course.
 */
export function learnTee(app, round, holeNumber, mark, { warnM = 120 } = {}) {
  if (!mark || mark.quality === 'poor') return { warning: null };
  const L = learningFor(app, round.courseId);
  L.tees[holeNumber] ??= {};
  const prev = L.tees[holeNumber][round.teeSet];
  let warning = null;
  if (prev && prev.n >= 1) {
    const d = distanceM(prev, mark);
    if (d > warnM) {
      warning = `Tee mark is ${Math.round(toYards(d))} yd from where hole ${holeNumber}'s ${round.teeSet} tee has been.`;
    }
  }
  if (!warning) L.tees[holeNumber][round.teeSet] = runningMean(prev, mark);
  return { warning };
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
  /*
   * The threshold arms at n >= 1, not n >= 2.
   *
   * Waiting for two prior rounds meant the very first contradicting mark went
   * in unchallenged — which is exactly how field test 4's second nine poisoned
   * holes 7 and 8, each of which had a single prior observation. One prior mark
   * is enough to notice that a cup has moved 150 yards.
   */
  if (prev && prev.n >= 1) {
    const d = distanceM(prev, mark);
    if (d > warnM) {
      warning =
        prev.n === 1
          ? `Cup mark is ${Math.round(toYards(d))} yd from where hole ${holeNumber}'s cup was last round.`
          : `Cup mark is ${Math.round(toYards(d))} yd from where hole ${holeNumber}'s cup has been on ${prev.n} previous rounds.`;
    }
  }
  /*
   * A flagged mark is NOT learned from.
   *
   * It used to warn and then fold the mark in regardless, which is the worst of
   * both: the app says the mark is impossible and then averages it into the
   * model anyway, where it silently degrades every future round. The mark is
   * still recorded on the hole — the golfer is the source of truth about where
   * he was — but it does not get to teach the course until it stops looking
   * like a mistake.
   */
  if (!warning) L.cups[holeNumber] = runningMean(prev, mark);
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
 * REBUILD THE COURSE MODEL FROM THE ROUNDS THAT STILL EXIST.
 *
 * `learnTee` / `learnCup` / `learnGreen` fold marks into a running mean, which
 * is a one-way operation: there is no way to subtract a round back out. So a
 * round that taught the model something wrong poisons it permanently, and
 * deleting the round does nothing — the average it moved stays moved.
 *
 * Field test 4 is the case in point. The abandoned second nine was set to start
 * on hole 7 but actually started on hole 8, so every mark in it was filed under
 * the wrong hole number. Averaged against the correct round, that left hole 8's
 * learned tee **227 m** from the real tee and hole 7's 173 m out — two tees
 * 450 m apart, meaned into a position that is neither. The model is the thing a
 * missing tee mark would be recovered *from*, so a poisoned model turns one bad
 * round into every future round's problem.
 *
 * Rebuilding is the only honest repair, and it is cheap: the marks are all
 * still in the rounds, so the accumulators can simply be replayed. This runs on
 * delete, which is what makes "dump that round" mean what it says.
 *
 * Abandoned rounds still contribute. Their marks are real positions taken on a
 * real course, and refusing them would throw away most of what the model knows
 * — the failure here was a wrong hole NUMBER, not an abandoned round, and the
 * fix for that is deleting the round, which now works.
 */
/**
 * Was this round actually played on the course, or was it a test?
 *
 * The distinction is not cosmetic — it decides what the app is allowed to
 * believe about a golf course. Field test 4's export carried 26 rounds, of
 * which four were real; the other 22 were development sessions logged at a
 * desk, and every one of them taught the course model where a tee was. The
 * damage: Veenker's learned 1st and 10th tees ended up **23.6 km apart**, and
 * hole 1's learned tee sat 23 km from the tee in the two rounds that were
 * genuinely played there.
 *
 * That is what made `detectStartingNine` prompt on every single round — it
 * compares the first mark against those positions, they are nonsense, so it
 * produces a confident wrong verdict every time.
 *
 * Clustering the marks does NOT rescue this. The largest cluster of hole 1 tee
 * marks has six members and is a desk; the real tee has two, from the only two
 * rounds that reached the ninth green. Volume of marks says nothing. Whether
 * the round was played says everything, and it separates cleanly: real rounds
 * finished 5-9 holes over 93-181 minutes, and every polluting round finished
 * one hole or none, most inside two minutes.
 *
 * Deliberately not keyed on `status`. An abandoned round that got through five
 * holes is real golf and worth learning from; a "completed" round that lasted
 * two minutes is not.
 */
export function isPlayedRound(round, { minHoles = 5, minMinutes = 30 } = {}) {
  if (!round?.holes?.length) return false;
  const finished = round.holes.filter((h) => h.greenEntry || h.manual).length;
  if (finished < minHoles) return false;
  const start = Date.parse(round.startedAt);
  const end = Date.parse(round.completedAt ?? round.startedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return (end - start) / 60000 >= minMinutes;
}

export function rebuildCourseLearning(app, load) {
  app.courseLearning = {};
  for (const summary of app.rounds ?? []) {
    const round = load(summary.id);
    if (!round?.courseId) continue;
    // A round that was never played teaches nothing. See `isPlayedRound`.
    if (!isPlayedRound(round)) continue;
    for (const hole of round.holes ?? []) {
      const tee = hole.shots?.find((s) => s.lie === 'tee' && s.mark);
      if (tee) learnTee(app, round, hole.number, tee.mark);
      if (hole.cup) learnCup(app, round, hole.number, hole.cup);
      for (const s of hole.shots ?? []) {
        if (s.lie === 'green' && s.mark) learnGreen(app, round, hole.number, s.mark);
      }
    }
  }
  return app.courseLearning;
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
 * WHICH HOLE DID HE ACTUALLY TEE OFF ON?
 *
 * Replaces `detectStartingNine`, which asked a narrower question — front nine
 * or back — and could only ever catch one kind of mistake. A shotgun start can
 * put you on any hole, and field test 4's second round was set to hole 7 while
 * actually starting on hole 8: its "hole 7" tee sits 4.9 m from the real hole 8
 * tee. Nothing questioned it, every mark went in under the wrong number, and
 * the course model took the damage permanently.
 *
 * The question this asks instead: of all the tees this course has taught us,
 * which one is the first mark standing on? If that is not the hole the round
 * says it started on, and the answer is not close, say so.
 *
 * TWO GUARDS AGAINST NAGGING, which matters more than the detection.
 *
 * Matt on the old check: *"Veenker Tees are close enough it asks me every
 * time."* The real cause was a poisoned model rather than close tees, but the
 * lesson stands — a check that cries wolf gets dismissed reflexively and then
 * catches nothing.
 *
 *   1. The candidate must be **decisively** closer than the hole he chose. A
 *      tee that is merely nearer by a few metres is GPS noise, not evidence.
 *   2. The mark must be plausibly ON the candidate tee. Being 400 m from every
 *      known tee means the model does not cover where he is, and the honest
 *      response to that is silence, not a guess.
 *
 * Returns null whenever the data cannot carry the question — which is most of
 * the time, and is the point.
 */
export function detectStartingHole(app, round, mark, { decisiveM = 60, maxFromTeeM = 50 } = {}) {
  const L = app.courseLearning?.[round?.courseId];
  if (!L?.tees || !mark) return null;

  const claimed = round.holes?.[0]?.number ?? null;
  if (claimed == null) return null;

  const candidates = [];
  for (const [num, sets] of Object.entries(L.tees)) {
    const tee = sets?.[round.teeSet];
    if (!tee) continue;
    candidates.push({ hole: Number(num), distanceM: distanceM(tee, mark) });
  }
  if (candidates.length < 2) return null; // nothing to compare against

  candidates.sort((a, b) => a.distanceM - b.distanceM);
  const best = candidates[0];
  const claimedTee = candidates.find((c) => c.hole === claimed) ?? null;

  // The model has never seen the hole he says he is on. Not evidence of a
  // mistake — it is evidence the model is incomplete.
  if (!claimedTee) return null;
  if (best.hole === claimed) return null;
  if (best.distanceM > maxFromTeeM) return null;
  if (claimedTee.distanceM - best.distanceM < decisiveM) return null;

  return {
    claimed,
    actual: best.hole,
    actualM: Math.round(best.distanceM),
    claimedM: Math.round(claimedTee.distanceM),
  };
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
