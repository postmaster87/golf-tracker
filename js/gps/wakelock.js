/**
 * Screen Wake Lock, held for the whole round.
 *
 * Android releases the lock whenever the page is hidden (screen off, app
 * switch, incoming call), and does NOT restore it — so the visibilitychange
 * re-acquire below is not an optimisation, it is the thing that makes the lock
 * survive a round.
 */

let sentinel = null;
let wanted = false;
let listenerBound = false;
const subs = new Set();

export function onWakeLockChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function emit() {
  for (const fn of subs) {
    try {
      fn(status());
    } catch {
      /* ignore */
    }
  }
}

export function supported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function status() {
  if (!supported()) return 'unsupported';
  if (!wanted) return 'off';
  return sentinel ? 'held' : 'pending';
}

function bindVisibility() {
  if (listenerBound || typeof document === 'undefined') return;
  listenerBound = true;
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible' && !sentinel) acquire();
  });
}

export async function acquire() {
  wanted = true;
  bindVisibility();
  if (!supported()) {
    emit();
    return false;
  }
  if (sentinel) return true;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
      emit();
    });
    emit();
    return true;
  } catch {
    // Rejected (battery saver, not user-activated, etc.). We stay "wanted" so
    // the next visibilitychange retries.
    sentinel = null;
    emit();
    return false;
  }
}

export async function release() {
  wanted = false;
  try {
    await sentinel?.release?.();
  } catch {
    /* ignore */
  }
  sentinel = null;
  emit();
}
