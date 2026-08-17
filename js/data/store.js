/**
 * localStorage persistence.
 *
 * One key per round means committing a mark rewrites a few tens of KB, not the
 * whole database — that matters when it happens ~90 times a round with a glove
 * on and a phone that might get backgrounded at any moment.
 *
 * Every write is guarded: a full quota must be loud and immediate, because the
 * one thing this app can never do is silently lose a round that cannot be
 * re-collected.
 */

import { migrate, newAppState, summarizeRound, APP_VERSION } from './schema.js';
import { REVISION } from './revision.js';
import { readTrack, writeTrackChunk } from './trackstore.js';

const APP_KEY = 'gt:app';
const ROUND_PREFIX = 'gt:round:';

const listeners = new Set();

/** Subscribe to storage failures (quota, private mode, etc.). */
export function onStorageError(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitError(err, context) {
  for (const fn of listeners) {
    try {
      fn(err, context);
    } catch {
      /* a broken listener must not break a save */
    }
  }
}

export function storageAvailable() {
  try {
    const k = '__gt_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    emitError(err, key);
    return false;
  }
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    emitError(err, key);
    return null;
  }
}

/* ---------------------------------------------------------------- app state */

export function loadApp() {
  const stored = readJson(APP_KEY);
  if (!stored) return newAppState();
  const migrated = migrate(stored);
  // Merge forward so a new setting added in a later build gets its default
  // rather than showing up as undefined on an existing install.
  const base = newAppState();
  return {
    ...base,
    ...migrated,
    appVersion: APP_VERSION,
    settings: { ...base.settings, ...(migrated.settings ?? {}) },
    courses: migrated.courses ?? {},
    courseLearning: migrated.courseLearning ?? {},
    rounds: Array.isArray(migrated.rounds) ? migrated.rounds : [],
  };
}

export function saveApp(app) {
  return writeRaw(APP_KEY, JSON.stringify(app));
}

/* -------------------------------------------------------------------- rounds */

export function roundKey(id) {
  return ROUND_PREFIX + id;
}

export function loadRound(id) {
  if (!id) return null;
  const stored = readJson(roundKey(id));
  return stored ? migrate(stored) : null;
}

export function saveRound(round) {
  if (!round?.id) return false;
  return writeRaw(roundKey(round.id), JSON.stringify(round));
}

export function deleteRound(id) {
  try {
    localStorage.removeItem(roundKey(id));
    return true;
  } catch (err) {
    emitError(err, roundKey(id));
    return false;
  }
}

/** Every round id currently in storage, including any missing from the index. */
export function allRoundIds() {
  const ids = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(ROUND_PREFIX)) ids.push(k.slice(ROUND_PREFIX.length));
  }
  return ids;
}

/** Keep the lightweight index in sync with a round's current state. */
export function upsertRoundSummary(app, round) {
  const summary = summarizeRound(round);
  const i = app.rounds.findIndex((r) => r.id === round.id);
  if (i >= 0) app.rounds[i] = summary;
  else app.rounds.unshift(summary);
  app.rounds.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return app;
}

/**
 * Rebuild the index from the round keys themselves. Used on startup so a round
 * whose index write failed (quota, crash between the two writes) is never
 * invisible — the round data is what matters, the index is disposable.
 */
export function reconcileIndex(app) {
  const known = new Set(app.rounds.map((r) => r.id));
  let changed = false;
  for (const id of allRoundIds()) {
    if (known.has(id)) continue;
    const round = loadRound(id);
    if (!round) continue;
    app.rounds.push(summarizeRound(round));
    changed = true;
  }
  const stored = new Set(allRoundIds());
  const before = app.rounds.length;
  app.rounds = app.rounds.filter((r) => stored.has(r.id));
  if (app.rounds.length !== before) changed = true;
  app.rounds.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return changed;
}

/* ------------------------------------------------------------ export/import */

export function buildExport(app) {
  const rounds = [];
  for (const id of allRoundIds()) {
    const r = loadRound(id);
    if (r) rounds.push(r);
  }
  rounds.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return {
    format: 'golf-tracker-export',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    // The build that produced the FILE, which is not necessarily the build that
    // produced the rounds inside it — each of those carries its own `revision`.
    exportedByRevision: REVISION,
    app,
    rounds,
  };
}

/**
 * Export, with the dense tracks attached.
 *
 * `buildExport` reads localStorage only, which meant the export carried every
 * round record and none of the continuous tracks — the tracks live in
 * IndexedDB, and they are the entire reason rev 2 exists. A backup that
 * silently omits the most expensive data in the app is worse than no backup,
 * because it looks like one.
 *
 * Tracks go in a sibling map keyed by round id rather than inside the round
 * objects, so `rounds` stays byte-for-byte what a formatVersion-1 importer
 * expects and an older reader degrades to "no tracks" instead of failing.
 */
export async function buildExportWithTracks(app) {
  const payload = buildExport(app);
  const tracks = {};
  let points = 0;
  for (const round of payload.rounds) {
    try {
      const pts = await readTrack(round.id);
      if (pts.length) {
        tracks[round.id] = pts;
        points += pts.length;
      }
    } catch {
      // A track that cannot be read must not take the round data down with it.
    }
  }
  return { ...payload, tracks, trackPoints: points };
}

export function exportFilename(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `golf-tracker-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(
    now.getHours()
  )}${p(now.getMinutes())}.json`;
}

/**
 * Write the export to a file. Async because the tracks come from IndexedDB.
 *
 * Returns both counts. The caller reports the track point count to the user on
 * purpose: an export that quietly contained no track is the exact failure this
 * function was changed to fix, and it must not look identical to one that did.
 */
export async function downloadExport(app) {
  const payload = await buildExportWithTracks(app);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { rounds: payload.rounds.length, trackPoints: payload.trackPoints };
}

/**
 * Hand the export to the OS share sheet.
 *
 * On a phone the download button is close to useless: the file lands in a
 * Downloads folder the user then has to go find in another app, which is a
 * poor way to treat the only copy of a round that cannot be re-collected.
 * `navigator.share` with a file opens Gmail/Drive/Messages directly.
 *
 * Returns a result rather than throwing, because "your browser cannot do this"
 * and "you closed the share sheet" are both normal and need different words.
 * The caller falls back to the download.
 */
export async function shareExport(app) {
  const payload = await buildExportWithTracks(app);
  const file = new File([JSON.stringify(payload, null, 2)], exportFilename(), {
    type: 'application/json',
  });
  const counts = { rounds: payload.rounds.length, trackPoints: payload.trackPoints };

  // canShare must be asked about the actual file: support for sharing TEXT
  // says nothing about support for sharing FILES, and the difference is the
  // whole feature.
  if (typeof navigator === 'undefined' || !navigator.canShare?.({ files: [file] })) {
    return { ...counts, shared: false, reason: 'unsupported' };
  }
  try {
    await navigator.share({ files: [file], title: 'Golf Tracker export' });
    return { ...counts, shared: true };
  } catch (err) {
    // AbortError is the user dismissing the sheet — not a failure to report.
    return { ...counts, shared: false, reason: err?.name === 'AbortError' ? 'cancelled' : 'failed' };
  }
}

/**
 * Restore dense tracks from an export, after `importExport` has added the
 * rounds it is going to add.
 *
 * Separate and async because IndexedDB is, and deliberately not folded into
 * `importExport`: a track that fails to restore must not take down a round that
 * has already been written. Pass the ids that were actually added, or every
 * track in the file gets written — including onto rounds that were skipped
 * because this device already had them, which would duplicate their points.
 */
export async function restoreTracks(parsed, addedIds = null) {
  const tracks = parsed?.tracks;
  const out = { rounds: 0, points: 0 };
  if (!tracks || typeof tracks !== 'object') return out;
  const allow = addedIds ? new Set(addedIds) : null;
  for (const [roundId, pts] of Object.entries(tracks)) {
    if (allow && !allow.has(roundId)) continue;
    const n = await writeTrackChunk(roundId, pts);
    if (n) {
      out.rounds++;
      out.points += n;
    }
  }
  return out;
}

/**
 * Restore from an export. `mode` is 'merge' (default — keeps rounds already on
 * this device, adds anything missing) or 'replace'.
 * Returns a report rather than throwing on partial failure.
 *
 * Does NOT restore dense tracks — call `restoreTracks` with `report.addedIds`
 * afterwards.
 */
export function importExport(parsed, mode = 'merge') {
  if (parsed?.format !== 'golf-tracker-export') {
    throw new Error('Not a golf-tracker export file.');
  }
  const report = { added: 0, skipped: 0, failed: 0, replaced: mode === 'replace', addedIds: [] };

  if (mode === 'replace') {
    for (const id of allRoundIds()) deleteRound(id);
  }

  const existing = new Set(allRoundIds());
  for (const round of parsed.rounds ?? []) {
    if (!round?.id) {
      report.failed++;
      continue;
    }
    if (existing.has(round.id)) {
      report.skipped++;
      continue;
    }
    if (saveRound(migrate(round))) {
      report.added++;
      // Recorded so the track restore only writes tracks for rounds that were
      // actually added — re-writing a track for a skipped round would duplicate
      // points onto a track already on this device.
      report.addedIds.push(round.id);
    } else report.failed++;
  }

  const app = mode === 'replace' ? { ...newAppState(), ...migrate(parsed.app ?? {}) } : loadApp();
  app.rounds = [];
  reconcileIndex(app);
  // An in-progress round from another device should not hijack this one.
  if (app.activeRoundId && !loadRound(app.activeRoundId)) app.activeRoundId = null;
  saveApp(app);
  report.app = app;
  return report;
}

/* -------------------------------------------------------------- diagnostics */

/** Approximate bytes used by this app's keys (UTF-16, so 2 bytes/char). */
export function usageBytes() {
  let chars = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith('gt:')) continue;
    chars += k.length + (localStorage.getItem(k)?.length ?? 0);
  }
  return chars * 2;
}
