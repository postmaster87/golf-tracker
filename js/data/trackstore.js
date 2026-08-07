/**
 * DENSE TRACK STORAGE — IndexedDB, append-only, off the round record.
 *
 * WHY THIS IS NOT IN localStorage WITH EVERYTHING ELSE
 *
 * The decimated breadcrumb (`appendTrack`, js/round/round.js) exists because a
 * full 1 Hz track is ~16k points for a 4.5 hour round. Two problems, and only
 * the first one is the famous one:
 *
 *  1. SIZE. At ~45 chars per JSON point that is ~730 KB of string per round,
 *     which localStorage stores as UTF-16 — call it 1.5 MB. The quota is around
 *     5 MB for the whole origin. Three rounds and the app is dead. Delta
 *     encoding buys maybe 4x, which buys a dozen rounds, which is still a
 *     ceiling with a date on it rather than a fix.
 *
 *  2. WRITE AMPLIFICATION, which is worse. The round is ONE localStorage key,
 *     so appending one track point rewrites the entire round — every mark,
 *     every raw sample. At the old 30 s cadence that was fine. At 1 Hz it is a
 *     synchronous JSON.stringify of a growing megabyte, on the main thread,
 *     every second, for four hours, on a phone in a pocket in the sun. That
 *     alone rules the approach out regardless of quota.
 *
 * IndexedDB fixes both: quota is disk-proportional rather than a few megabytes,
 * writes are asynchronous and off the main thread, and records append
 * independently so nothing gets rewritten.
 *
 * WHAT IS STORED
 *
 * Chunks, not points. One record per flush holds a batch of fixes, which keeps
 * the record count in the hundreds instead of tens of thousands — IndexedDB is
 * fast per transaction but not free per record.
 *
 * FAILURE POSTURE
 *
 * Every entry point degrades to null/no-op rather than throwing. If IndexedDB
 * is unavailable — private mode, storage pressure, a browser that says no —
 * the caller keeps the rev-1 decimated breadcrumb and the round is still fully
 * recorded by hand. Losing the dense track costs analysis quality. Losing the
 * round costs a round of golf, and that is the one thing this app may never do.
 */

const DB_NAME = 'gt-track';
const DB_VERSION = 1;
const STORE = 'chunks';

/**
 * Flush cadence.
 *
 * `MAX_BUFFER` bounds what a hard kill can lose; `FLUSH_MS` bounds how long
 * good data sits in volatile memory when the buffer is filling slowly. 30 fixes
 * at 1 Hz is a 30 second exposure, which is under one shot's worth.
 */
export const FLUSH_MS = 15000;
export const MAX_BUFFER = 30;

let dbPromise = null;
let unavailable = false;

/**
 * Open (and lazily create) the database.
 *
 * Resolves to null rather than rejecting — see the failure posture above. The
 * result is cached, including the null, so a browser that refuses once is not
 * asked again on every fix.
 */
export function openTrackDb() {
  if (unavailable) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    let idb;
    try {
      idb = globalThis.indexedDB;
    } catch {
      idb = null; // some privacy modes throw on mere access
    }
    if (!idb) {
      unavailable = true;
      resolve(null);
      return;
    }

    let req;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch {
      unavailable = true;
      resolve(null);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        // Every read and every delete is "all chunks for one round", so this is
        // the only index the app ever needs.
        store.createIndex('roundId', 'roundId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      unavailable = true;
      resolve(null);
    };
    req.onblocked = () => {
      unavailable = true;
      resolve(null);
    };
  });

  return dbPromise;
}

/** Wrap a request in a promise that resolves to `fallback` on any failure. */
function reqToPromise(req, fallback = null) {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(fallback);
  });
}

/**
 * A single stored fix.
 *
 * `speed` and `heading` are carried because they are the whole point of dense
 * recording: the stop detector keys off arrival at zero speed and departure,
 * and a device-reported Doppler speed is a far better signal than one
 * differentiated from noisy positions. They are frequently absent, so both stay
 * optional rather than being faked from consecutive fixes.
 */
function compactFix(f) {
  const p = [
    Number(f.lat.toFixed(7)),
    Number(f.lon.toFixed(7)),
    Math.round(f.acc * 10) / 10,
    f.ts,
  ];
  // Trailing optional slots: appended only when present, so a fix without them
  // costs nothing. Readers must check length, not assume arity.
  if (Number.isFinite(f.speed)) {
    p.push(Math.round(f.speed * 100) / 100);
    if (Number.isFinite(f.heading)) p.push(Math.round(f.heading));
  }
  return p;
}

/** Decode a stored point back into an object. Inverse of `compactFix`. */
export function expandFix(p) {
  return {
    lat: p[0],
    lon: p[1],
    acc: p[2],
    ts: p[3],
    speed: p.length > 4 ? p[4] : null,
    heading: p.length > 5 ? p[5] : null,
  };
}

/**
 * Buffered writer for one round.
 *
 * Created when a round starts and closed when it ends. Holds fixes in memory
 * and flushes on whichever comes first: MAX_BUFFER points, FLUSH_MS elapsed, or
 * the page going away.
 *
 * That last trigger is not a nicety. The stated use case is a phone in a
 * pocket, which means the page is backgrounded for most of the round and
 * Android may freeze or discard it at any moment. `visibilitychange` to hidden
 * is the last reliable moment to write, and `pagehide` covers the rest. Without
 * these the buffer is lost on every single pocket, which is most of the data.
 */
export function createTrackWriter(roundId, { flushMs = FLUSH_MS, maxBuffer = MAX_BUFFER } = {}) {
  let buffer = [];
  let seq = 0;
  let timer = null;
  let closed = false;
  let pending = Promise.resolve();
  const stats = { buffered: 0, written: 0, flushes: 0, failures: 0 };

  function scheduleFlush() {
    if (timer != null || closed) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, flushMs);
  }

  function flush() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length === 0) return pending;
    const pts = buffer;
    buffer = [];
    const chunk = {
      roundId,
      seq: seq++,
      from: pts[0][3],
      to: pts[pts.length - 1][3],
      n: pts.length,
      pts,
    };

    pending = pending.then(async () => {
      const db = await openTrackDb();
      if (!db) {
        stats.failures++;
        return;
      }
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).add(chunk);
        const ok = await new Promise((resolve) => {
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        });
        if (ok) {
          stats.written += chunk.n;
          stats.flushes++;
        } else {
          stats.failures++;
        }
      } catch {
        stats.failures++;
      }
    });
    return pending;
  }

  const onHide = () => {
    // Only flush on the way OUT. Flushing when the page becomes visible would
    // do nothing useful and costs a transaction at the exact moment the user is
    // looking at the screen and expecting it to respond.
    if (document.visibilityState === 'hidden') flush();
  };

  if (globalThis.document?.addEventListener) {
    document.addEventListener('visibilitychange', onHide);
    globalThis.addEventListener?.('pagehide', flush);
  }

  return {
    /** Buffer one fix. Cheap and synchronous; the write is not. */
    push(fix) {
      if (closed || !fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return false;
      buffer.push(compactFix(fix));
      stats.buffered++;
      if (buffer.length >= maxBuffer) flush();
      else scheduleFlush();
      return true;
    },
    flush,
    stats: () => ({ ...stats, inBuffer: buffer.length }),
    /** Flush what is held and stop listening. Safe to call twice. */
    async close() {
      if (closed) return pending;
      const p = flush();
      closed = true;
      if (globalThis.document?.removeEventListener) {
        document.removeEventListener('visibilitychange', onHide);
        globalThis.removeEventListener?.('pagehide', flush);
      }
      await p;
      return pending;
    },
  };
}

/**
 * Every stored fix for a round, in time order.
 *
 * Chunks are sorted by their own `seq` rather than trusted to come back in
 * insertion order, and points are sorted by timestamp within the merged result
 * — a resumed round can interleave writers, and a track that is out of order is
 * worse than no track because the stop detector would read it as teleporting.
 */
export async function readTrack(roundId) {
  const db = await openTrackDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('roundId');
    const chunks = (await reqToPromise(idx.getAll(roundId), [])) ?? [];
    chunks.sort((a, b) => a.seq - b.seq);
    const pts = [];
    for (const c of chunks) if (Array.isArray(c.pts)) pts.push(...c.pts);
    pts.sort((a, b) => a[3] - b[3]);
    return pts;
  } catch {
    return [];
  }
}

/** Point count for a round without materialising the points. */
export async function trackSize(roundId) {
  const db = await openTrackDb();
  if (!db) return 0;
  try {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('roundId');
    const chunks = (await reqToPromise(idx.getAll(roundId), [])) ?? [];
    return chunks.reduce((n, c) => n + (c.n ?? 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Drop a round's track. Called when the round itself is deleted — an orphaned
 * dense track is pure cost, and the whole reason this store exists is that its
 * contents are big.
 */
export async function deleteTrack(roundId) {
  const db = await openTrackDb();
  if (!db) return false;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const idx = tx.objectStore(STORE).index('roundId');
    // getAllKeys on an INDEX is correct here — a delete needs the primary keys
    // of the matching chunks, which is exactly what it returns. Contrast
    // trackedRoundIds, which needs the index keys and must use a cursor.
    const keys = (await reqToPromise(idx.getAllKeys(roundId), [])) ?? [];
    const store = tx.objectStore(STORE);
    for (const k of keys) store.delete(k);
    const committed = await new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
    // "Did I remove a track?", not "did the transaction run?". Deleting nothing
    // used to report success, which let a lookup bug in the caller pass its own
    // test — the count went up while the data stayed put.
    return committed && keys.length > 0;
  } catch {
    return false;
  }
}

/**
 * Round ids that have a stored track, for diagnostics and orphan cleanup.
 *
 * A key cursor with `nextunique`, NOT `index.getAllKeys()`. On an index,
 * getAllKeys returns the PRIMARY keys of the matching records — here the
 * autoincrement chunk ids — not the roundIds being indexed. That mistake is
 * silent and nasty: pruning then looks up chunks by a number that matches no
 * round, deletes nothing, and reports success. `nextunique` also skips straight
 * over the duplicate entries, so this stays one step per round rather than one
 * per chunk.
 */
export async function trackedRoundIds() {
  const db = await openTrackDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('roundId');
    return await new Promise((resolve) => {
      const ids = [];
      const req = idx.openKeyCursor(null, 'nextunique');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve(ids);
          return;
        }
        ids.push(cur.key);
        cur.continue();
      };
      req.onerror = () => resolve(ids);
    });
  } catch {
    return [];
  }
}

/**
 * Delete tracks whose round no longer exists.
 *
 * `liveIds` must be the full set of surviving round ids — anything not in it is
 * deleted, so passing a partial list destroys good data. Callers should source
 * it from `allRoundIds()`, not from the round index, which is explicitly
 * described as disposable in store.js.
 */
export async function pruneOrphanTracks(liveIds) {
  const live = new Set(liveIds);
  const stored = await trackedRoundIds();
  let removed = 0;
  for (const id of stored) {
    if (!live.has(id)) {
      if (await deleteTrack(id)) removed++;
    }
  }
  return removed;
}

/** Test seam: forget the cached handle so a fresh open is attempted. */
export function resetTrackDbForTests() {
  dbPromise = null;
  unavailable = false;
}
