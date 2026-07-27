/**
 * POCKET LOCK
 *
 * Field round 1 failed not because of GPS but because a phone in a sweaty
 * pocket generates a continuous stream of real-looking touches. The app trusted
 * every one of them and advanced a hole the golfer was still playing.
 *
 * This is the guard. While locked, the round UI is covered by an overlay that
 * swallows every pointer event, so no amount of fabric contact can reach a
 * button. GPS and the screen wake lock are untouched — they live outside the
 * DOM — so tracking continues at full precision the whole time it is locked.
 *
 * WHY TWO CRISP TAPS, TOP THEN BOTTOM
 *
 * The real failure mode is the phone going into a back pocket and being SAT ON.
 * That rules out a long press immediately — sustained body pressure *is* a long
 * press. It also rules out fingerprint: wet or gloved fingers do not read, and
 * the fallback is typing a 6-digit PIN on a golf course.
 *
 * Two taps in opposite halves is fast and needs no fine motor control, but only
 * survives being sat on because of what counts as a "tap" here:
 *
 *   - down and up within TIMING.tapMaxMs, having moved less than TIMING.tapMovePx
 *   - the two taps in opposite halves, separated by a neutral dead band
 *   - both within TIMING.tapWindowMs of each other
 *   - zero simultaneous contacts at any point in the sequence
 *
 * Dead weight produces sustained, multi-point, drifting contact. A crisp,
 * isolated, brief tap is close to the one thing it cannot produce. Each
 * constraint above is aimed squarely at a property of being sat on.
 */

/**
 * Gesture thresholds. Overridable through `configure({ timing })` — the window
 * in particular may need widening if two gloves make the second tap slower, and
 * the test suite widens it so that background-tab timer throttling cannot
 * produce a false failure.
 */
export const TIMING = {
  tapMaxMs: 350, // longer than this is a press, not a tap
  tapMovePx: 24, // a tap does not travel
  tapWindowMs: 1200, // the two taps must belong to one another
  deadBand: 0.14, // fraction of height that is neither zone
};

const state = {
  overlay: null,
  locked: false,
  enabled: false,
  idleMs: 30000,
  idleTimer: null,
  status: () => ({}),
  canLock: () => true,
  subs: new Set(),
};

/* ----------------------------------------------------------------- wiring */

/**
 * @param status  () => ({ holeLabel, holeMeta, accuracy, quality })
 *                Read live each time the locked screen repaints.
 */
export function configure({ idleMs, status, canLock, timing } = {}) {
  if (timing) Object.assign(TIMING, timing);
  if (Number.isFinite(idleMs)) {
    state.idleMs = idleMs;
    // Applies immediately, including mid-round: changing the delay while a
    // round is live must not require finishing the hole first.
    if (state.enabled && !state.locked) resetIdle();
  }
  if (status) state.status = status;
  if (canLock) state.canLock = canLock;
}

export function onChange(fn) {
  state.subs.add(fn);
  return () => state.subs.delete(fn);
}

function emit() {
  for (const fn of state.subs) {
    try {
      fn(state.locked);
    } catch {
      /* a broken subscriber must never wedge the lock */
    }
  }
}

export const isLocked = () => state.locked;

/**
 * Arm the auto-lock. Called while a round is in progress, on any screen — if
 * the phone goes in a pocket during a detour into Settings, the problem is
 * identical.
 */
export function enable() {
  state.enabled = true;
  resetIdle();
}

export function disable() {
  state.enabled = false;
  clearTimeout(state.idleTimer);
  state.idleTimer = null;
  if (state.locked) unlock();
}

/** Any deliberate interaction pushes the auto-lock back out. */
export function noteActivity() {
  if (!state.enabled || state.locked) return;
  resetIdle();
}

function resetIdle() {
  clearTimeout(state.idleTimer);
  if (!state.enabled || state.idleMs <= 0) return; // 0 disables auto-lock
  state.idleTimer = setTimeout(() => {
    if (!state.enabled || state.locked) return;
    // Never lock mid-task. Locking while a sheet is open or a GPS burst is
    // running would be more infuriating than the phantom touches it prevents —
    // so instead of locking, wait out another interval and re-check.
    if (!state.canLock()) {
      resetIdle();
      return;
    }
    lock();
  }, state.idleMs);
}

/* ------------------------------------------------------------------ lock */

export function lock() {
  if (state.locked) return;
  state.locked = true;
  clearTimeout(state.idleTimer);
  buildOverlay();
  emit();
}

export function unlock() {
  if (!state.locked) return;
  state.locked = false;
  state.overlay?.remove();
  state.overlay = null;
  resetIdle();
  emit();
}

/** Refresh the live figures on the locked screen (hole, GPS accuracy). */
export function tick() {
  if (!state.locked || !state.overlay) return;
  paintStatus();
}

function paintStatus() {
  const s = state.status() ?? {};
  const hole = state.overlay.querySelector('.lock-hole');
  const meta = state.overlay.querySelector('.lock-meta');
  const acc = state.overlay.querySelector('.lock-acc');
  if (hole) hole.textContent = s.holeLabel ?? '—';
  if (meta) meta.textContent = s.holeMeta ?? '';
  if (acc) {
    acc.textContent = s.accuracy ?? 'GPS —';
    acc.dataset.q = s.quality ?? 'none';
  }
}

/* --------------------------------------------------------------- overlay */

function buildOverlay() {
  const el = document.createElement('div');
  el.className = 'lock-screen';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Round locked');
  el.innerHTML = `
    <div class="lock-zone lock-zone-top" data-armed="true">
      <div class="lock-hole"></div>
      <div class="lock-meta"></div>
      <div class="lock-acc" data-q="none"></div>
      <div class="lock-cue">TAP HERE <span class="lock-step">1</span></div>
    </div>
    <div class="lock-band"><span class="lock-note">LOCKED · GPS STILL TRACKING</span></div>
    <div class="lock-zone lock-zone-bottom">
      <div class="lock-cue">THEN HERE <span class="lock-step">2</span></div>
    </div>
  `;

  // Swallow every pointer event on the overlay in the capture phase, so nothing
  // beneath ever sees it. The unlock logic runs off this same listener rather
  // than off separate live targets, which means there is no element on screen
  // that a stray contact can "click" in the ordinary sense.
  wireTaps(el);
  document.body.appendChild(el);
  state.overlay = el;
  paintStatus();
}

/**
 * Two crisp taps, opposite halves, no simultaneous contacts.
 *
 * Every rejection path resets the sequence to step 1, so a pocket cannot
 * accumulate progress over time — it has to produce the whole clean sequence
 * inside one window, which is what makes this survivable.
 */
function wireTaps(el) {
  const topZone = el.querySelector('.lock-zone-top');
  const bottomZone = el.querySelector('.lock-zone-bottom');
  const band = el.querySelector('.lock-note');

  let step = 0; // 0 = awaiting top tap, 1 = awaiting bottom tap
  let firstAt = 0;
  let down = null; // the single pointer currently down
  let active = 0; // simultaneous contact count
  let hintTimer = null;

  const setStep = (n, message) => {
    step = n;
    topZone.dataset.armed = String(n === 0);
    bottomZone.dataset.armed = String(n === 1);
    if (message) {
      band.textContent = message;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        band.textContent = 'LOCKED · GPS STILL TRACKING';
      }, 1100);
    }
  };

  const reject = (message) => {
    down = null;
    firstAt = 0;
    setStep(0, message);
  };

  /** Which zone a point is in. Null inside the dead band. */
  const zoneOf = (y) => {
    const h = window.innerHeight;
    if (y < h * (0.5 - TIMING.deadBand / 2)) return 'top';
    if (y > h * (0.5 + TIMING.deadBand / 2)) return 'bottom';
    return null;
  };

  el.addEventListener(
    'pointerdown',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      active++;
      // Being sat on means many contacts at once. One deliberate finger is one.
      if (active > 1) {
        reject('ONE FINGER AT A TIME');
        return;
      }
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    },
    { capture: true, passive: false }
  );

  el.addEventListener(
    'pointerup',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      active = Math.max(0, active - 1);
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || active > 0) return;

      const held = performance.now() - d.t;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      // A press or a smear is not a tap. Dead weight produces both.
      if (held > TIMING.tapMaxMs || moved > TIMING.tapMovePx) {
        reject(held > TIMING.tapMaxMs ? 'TAP, DO NOT HOLD' : null);
        return;
      }

      const zone = zoneOf(e.clientY);
      if (!zone) return; // dead band: ignore entirely, do not punish

      if (step === 0) {
        if (zone !== 'top') return;
        firstAt = performance.now();
        setStep(1);
        return;
      }

      if (zone !== 'bottom') {
        reject();
        return;
      }
      if (performance.now() - firstAt > TIMING.tapWindowMs) {
        reject('TOO SLOW — START AGAIN');
        return;
      }
      reject();
      unlock();
    },
    { capture: true, passive: false }
  );

  // Anything else that could reach the page gets eaten.
  for (const type of ['pointercancel', 'pointermove', 'click', 'touchstart', 'touchend', 'touchmove']) {
    el.addEventListener(
      type,
      (e) => {
        if (type === 'pointercancel') {
          active = Math.max(0, active - 1);
          down = null;
        }
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true, passive: false }
    );
  }
}
