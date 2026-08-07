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

export function exportFilename(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `golf-tracker-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(
    now.getHours()
  )}${p(now.getMinutes())}.json`;
}

export function downloadExport(app) {
  const payload = buildExport(app);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return payload.rounds.length;
}

/**
 * Restore from an export. `mode` is 'merge' (default — keeps rounds already on
 * this device, adds anything missing) or 'replace'.
 * Returns a report rather than throwing on partial failure.
 */
export function importExport(parsed, mode = 'merge') {
  if (parsed?.format !== 'golf-tracker-export') {
    throw new Error('Not a golf-tracker export file.');
  }
  const report = { added: 0, skipped: 0, failed: 0, replaced: mode === 'replace' };

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
    if (saveRound(migrate(round))) report.added++;
    else report.failed++;
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
