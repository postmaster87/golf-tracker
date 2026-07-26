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

/** Persist the active round and keep the round index in step with it. */
function persistRound() {
  if (!ctx.round) return;
  saveRound(ctx.round);
  upsertRoundSummary(ctx.app, ctx.round);
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

function startGps() {
  if (!ctx.gps.running) ctx.gps.start();
  wakeLock.acquire();
}

function stopGps() {
  ctx.gps.stop();
  wakeLock.release();
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
    active?.tick?.();
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
