/** Application shell: state, routing, GPS lifecycle, persistence. */

import { THEMES } from './data/schema.js';
import {
  loadApp,
  saveApp,
  loadRound,
  saveRound,
  reconcileIndex,
  upsertRoundSummary,
  onStorageError,
} from './data/store.js';
import { GpsService } from './gps/gps.js';
import * as wakeLock from './gps/wakelock.js';
import { appendTrack } from './round/round.js';
import { clear, toast } from './ui/dom.js';
import * as pocketLock from './ui/lock.js';
import { homeScreen } from './ui/screen-home.js';
import { setupScreen } from './ui/screen-setup.js';
import { playScreen } from './ui/screen-play.js';
import { summaryScreen } from './ui/screen-summary.js';
import { historyScreen } from './ui/screen-history.js';
import { settingsScreen } from './ui/screen-settings.js';
import { trendsScreen } from './ui/screen-trends.js';

const SCREENS = {
  home: homeScreen,
  setup: setupScreen,
  play: playScreen,
  summary: summaryScreen,
  history: historyScreen,
  settings: settingsScreen,
  trends: trendsScreen,
};

const root = document.getElementById('app');

const ctx = {
  app: loadApp(),
  round: null,
  gps: new GpsService(),
  screen: 'home',
  params: {},
  go,
  render,
  persistRound,
  persistApp,
  setTheme,
  startGps,
  stopGps,
};

let active = null; // { el, tick }
let lastTick = 0;

/* --------------------------------------------------------------- lifecycle */

function setTheme(name) {
  const theme = THEMES.includes(name) ? name : 'fairway';
  document.documentElement.dataset.theme = theme;
  ctx.app.settings.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();
  }
  persistApp();
}

function persistApp() {
  saveApp(ctx.app);
}

/**
 * Persist a round and keep the index in step with it.
 *
 * Takes an explicit round so the play screen can drive a completed round in
 * edit mode without it becoming the active one — editing hole 14 from three
 * weeks ago must never resume that round.
 */
function persistRound(round = ctx.round) {
  if (!round) return;
  saveRound(round);
  upsertRoundSummary(ctx.app, round);
  saveApp(ctx.app);
}

function go(screen, params = {}) {
  ctx.screen = screen;
  ctx.params = params;
  render();
  document.querySelector('.body')?.scrollTo(0, 0);
}

function render() {
  const build = SCREENS[ctx.screen] ?? homeScreen;
  const next = build(ctx);
  active = next;
  clear(root).appendChild(next.el);
}

/* -------------------------------------------------------------------- GPS */

/**
 * Portrait lock.
 *
 * The manifest already asks for portrait, which Android honours for an
 * installed PWA. This is the belt for the braces: it covers the case where the
 * app is opened as a plain browser tab, where the manifest is ignored. Most
 * browsers reject the call outside fullscreen, hence the silent catch — there
 * is nothing useful to do about a refusal.
 */
function lockOrientation() {
  try {
    screen.orientation?.lock?.('portrait').catch(() => {});
  } catch {
    /* not supported here; the manifest is the real mechanism */
  }
}

function startGps() {
  if (!ctx.gps.running) ctx.gps.start();
  wakeLock.acquire();
  lockOrientation();
  pocketLock.enable();
}

function stopGps() {
  ctx.gps.stop();
  wakeLock.release();
  pocketLock.disable();
}

/**
 * What the locked screen shows. Read live on every repaint, so a glance at a
 * locked phone still answers "which hole am I on and is the GPS happy?"
 * without unlocking.
 */
pocketLock.configure({
  idleMs: (ctx.app.settings.autoLockSec ?? 15) * 1000,
  // Never auto-lock mid-task: a sheet open on screen or a GPS burst in flight
  // both mean hands are on the phone deliberately.
  canLock: () => !document.querySelector('.scrim, .capture'),
  status: () => {
    const hole = ctx.round?.holes?.[ctx.round.currentHoleIndex];
    const fix = ctx.gps.current;
    const max = ctx.app.settings.maxAccuracyM;
    return {
      holeLabel: hole ? `H${hole.number}` : '—',
      holeMeta: hole
        ? `Par ${hole.par}${hole.yards ? ` · ${hole.yards} yd` : ''} · ${
            ctx.round.currentHoleIndex + 1
          }/${ctx.round.holes.length}`
        : '',
      accuracy: fix ? `±${fix.acc.toFixed(1)} m` : 'GPS —',
      quality: !fix ? 'none' : fix.acc <= max / 2 ? 'good' : fix.acc <= max ? 'degraded' : 'poor',
    };
  },
});

// Repaint the round UI when the lock is released, so anything that changed
// while locked (GPS status, a resumed watch) is reflected immediately.
pocketLock.onChange((locked) => {
  if (!locked) active?.tick?.();
});

// Any deliberate interaction with the app pushes the auto-lock back out.
// Capture phase so it counts even for handlers that stop propagation.
for (const type of ['pointerdown', 'keydown']) {
  document.addEventListener(type, () => pocketLock.noteActivity(), { capture: true, passive: true });
}

ctx.gps.subscribe((event) => {
  if (event === 'fix' && ctx.round && ctx.round.status === 'in_progress') {
    if (ctx.app.settings.recordTrack && appendTrack(ctx.round, ctx.gps.last)) {
      // Only touches storage on the ~30s cadence the decimator allows.
      saveRound(ctx.round);
    }
  }
  // Live indicators update in place; a full re-render on every fix would fight
  // the user's thumb.
  const now = Date.now();
  if (now - lastTick > 400) {
    lastTick = now;
    if (pocketLock.isLocked()) pocketLock.tick();
    else active?.tick?.();
  }
  if (event === 'error' && ctx.gps.error?.code === 1) {
    active?.tick?.();
  }
});

onStorageError((err) => {
  const full = err?.name === 'QuotaExceededError' || /quota/i.test(err?.message ?? '');
  toast(
    full
      ? 'Storage full — export and clear old rounds now.'
      : 'Could not save to this device.',
    { action: 'Export', onAction: () => go('settings'), ms: 15000 }
  );
});

/* ------------------------------------------------------------------- boot */

function boot() {
  if (reconcileIndex(ctx.app)) saveApp(ctx.app);
  setTheme(ctx.app.settings.theme);

  // Resume: an in-progress round survives a refresh, a tab kill or a dead
  // battery, and comes back on the hole it was left on.
  if (ctx.app.activeRoundId) {
    const round = loadRound(ctx.app.activeRoundId);
    if (round && round.status === 'in_progress') {
      ctx.round = round;
    } else {
      ctx.app.activeRoundId = null;
      saveApp(ctx.app);
    }
  }

  render();

  if (ctx.round) {
    startGps();
    go('play');
  }
}

// A round in progress should never be one stray back-gesture from oblivion.
window.addEventListener('beforeunload', (e) => {
  if (ctx.round?.status === 'in_progress') {
    persistRound();
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx.round?.status === 'in_progress') {
    startGps();
    active?.tick?.();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline support is a bonus, not a requirement */
    });
  });
}

// Dev-only synthetic GPS, so the round flow can be exercised away from a
// course. Never loaded unless explicitly asked for in the URL, and never
// allowed to take the real app down with it.
if (new URLSearchParams(location.search).has('sim')) {
  try {
    await import('./dev/sim.js');
  } catch (err) {
    console.error('GPS simulator failed to load; continuing with real GPS.', err);
  }
}

boot();
