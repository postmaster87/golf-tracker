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
import { createTrackWriter } from './data/trackstore.js';
import { appendTrack, rebuildCourseLearning } from './round/round.js';
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
  /*
   * Live dense-track stats, for the on-course indicator.
   *
   * The dense write is fire-and-forget from inside the GPS callback, so a
   * failing IndexedDB is silent by construction — and the only place the fix
   * count surfaced was the round summary, i.e. after the round was already
   * over. That turns a recoverable "the track is not recording" into four
   * wasted hours. Reads the module-level writer at call time; null means no
   * round is live.
   */
  trackStats: () => trackWriter?.stats() ?? null,
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

/**
 * Whether this build is running inside the native shell.
 *
 * The bridge object's presence is the one signal — there is no flag, no build
 * variant and no user agent sniff. Read at call time rather than cached, so the
 * suite can stand a fake bridge up and take it down again.
 */
function shell() {
  return Boolean(globalThis.GolfNative);
}

function startGps() {
  if (!ctx.gps.running) ctx.gps.start();
  lockOrientation();
  /*
   * In the shell the phone's power button IS the lock (his word, 2026-09-16).
   *
   * The screen wake lock and the in-app pocket lock both exist because a web
   * page only receives GPS while it is the foreground page: the screen had to
   * stay on, and a screen that stays on in a back pocket had to be defended
   * from thumbs. The native recorder removes the premise — it marks the track
   * with the screen off and the app closed — so both come off, and the round is
   * one power-button press away from safe. `js/ui/lock.js` is unchanged; it is
   * simply never enabled here.
   */
  if (shell()) return;
  wakeLock.acquire();
  pocketLock.enable();
}

function stopGps() {
  ctx.gps.stop();
  if (shell()) return;
  wakeLock.release();
  pocketLock.disable();
}

/**
 * What the locked screen shows. Read live on every repaint, so a glance at a
 * locked phone still answers "which hole am I on and is the GPS happy?"
 * without unlocking.
 */
pocketLock.configure({
  idleMs: (ctx.app.settings.autoLockSec ?? 30) * 1000,
  /*
   * Only an in-flight GPS burst blocks the auto-lock.
   *
   * An open sheet used to block it too, but the putt entry now opens by itself
   * when a ball is marked on the green — so a blocking sheet would mean the
   * phone goes into a back pocket unlocked with a modal up, which is precisely
   * the failure the lock exists to prevent. The idle timer already resets on
   * every interaction, so an actively-used sheet never locks; one left open and
   * untouched for the idle period should.
   */
  //
  // A burst still running, and nothing else. Once it ends the shot is saved
  // even if its lie has not been tapped, so a panel waiting on a lie is no
  // reason to leave the phone unlocked in a pocket with the lie grid live.
  canLock: () => !document.querySelector('.capture[data-burst="running"]'),
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

/*
 * Dense track writer, driven off the round rather than off the screens.
 *
 * The round is started, resumed, abandoned and cleared from four different
 * places across three screens. Rather than add a lifecycle hook to each — and
 * rely on every future one remembering — the writer follows `ctx.round.id` from
 * inside the GPS loop, which is the one place that already runs whenever a
 * round is live. A round ending simply means the id stops matching, and the
 * previous writer is flushed and closed.
 */
let trackWriter = null;
let trackWriterRoundId = null;

function syncTrackWriter(round) {
  const id = round?.status === 'in_progress' ? round.id : null;
  if (id === trackWriterRoundId) return trackWriter;
  // Fire-and-forget: close() flushes what is buffered. Awaiting here would
  // block the GPS callback on a disk write for a round that is already over.
  trackWriter?.close();
  trackWriter = id ? createTrackWriter(id) : null;
  trackWriterRoundId = id;
  return trackWriter;
}

/*
 * The native recorder, followed off the round exactly as the writer above is.
 *
 * D8: recording follows the round's STATUS, never a null `ctx.round`. The
 * writer-follows-round pattern closes on null because an absent round means
 * nothing to buffer; the recorder must NOT, because a WebView that dies
 * mid-round would otherwise take the recording with it — and the recording is
 * the whole reason the shell exists.
 *
 * `nativeRecorderRoundId` is what we last told the recorder, so the GPS loop
 * costs one bridge call per state change rather than one a second. Boot and
 * a return to visible pass `recheck`, which re-reads the recorder's own
 * committed answer instead of trusting a variable that a reload just cleared.
 */
let nativeRecorderRoundId = null;

function syncNativeRecorder(round, { recheck = false } = {}) {
  const gn = globalThis.GolfNative;
  if (!gn) return;
  try {
    if (recheck) nativeRecorderRoundId = gn.recordingRoundId() || null;
    const want = round?.status === 'in_progress' ? round.id : null;
    if (want) {
      if (want === nativeRecorderRoundId) return;
      if (gn.startRecording(want)) nativeRecorderRoundId = want;
      return;
    }
    // A null round is "this screen does not know", not "stop". Only a round
    // that has actually ended takes the recorder down with it.
    if (!round || !nativeRecorderRoundId) return;
    if (
      (round.status === 'completed' || round.status === 'abandoned') &&
      round.id === nativeRecorderRoundId
    ) {
      gn.stopRecording(round.id);
      nativeRecorderRoundId = null;
    }
  } catch {
    // The recorder holds its own committed flag and resumes on its own. A
    // failed bridge call is a message lost, never a round lost.
  }
}

ctx.gps.subscribe((event) => {
  // Same place, same reason as the track writer: the one loop that already
  // runs whenever a round is live.
  syncNativeRecorder(ctx.round);
  if (event === 'fix' && ctx.round && ctx.round.status === 'in_progress') {
    /*
     * Two tracks, deliberately.
     *
     * The dense track is the analysis input and lives in IndexedDB. The
     * decimated breadcrumb stays exactly as it was, in the round record, for
     * ~1% of the size — so if IndexedDB is unavailable or the dense write
     * fails, rev 2 degrades to rev 1 behaviour instead of recording nothing.
     * The dense path never touches localStorage and never rewrites the round.
     */
    if (ctx.app.settings.denseTrack !== false) {
      syncTrackWriter(ctx.round)?.push(ctx.gps.last);
    }
    if (ctx.app.settings.recordTrack && appendTrack(ctx.round, ctx.gps.last)) {
      // Only touches storage on the ~30s cadence the decimator allows.
      saveRound(ctx.round);
    }
  } else if (trackWriterRoundId) {
    syncTrackWriter(ctx.round);
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

/**
 * The rule the course model was last rebuilt under.
 *
 * Bumped whenever what counts as a round worth learning from changes, so an
 * install repairs itself once under the new rule rather than carrying a model
 * built by the old one forever.
 */
const COURSE_MODEL_RULE = 1;

function boot() {
  if (reconcileIndex(ctx.app)) saveApp(ctx.app);
  setTheme(ctx.app.settings.theme);

  /*
   * Repair the course model once, for installs built before the rule existed.
   *
   * `learnTee` and friends fire live on every mark, because that is the only
   * moment a mark exists — and at that moment nothing knows whether the round
   * will become golf or be abandoned after one shot. The running means they
   * write cannot be subtracted, so every test session ever logged is still in
   * there: 22 of them put Veenker's learned 1st and 10th tees 23.6 km apart and
   * made the starting-nine check fire on every single round.
   *
   * Rounds ending now rebuild as they go, so this is only for the backlog. It
   * is keyed on the rule version rather than a boolean, so tightening what
   * counts as played repairs everyone again instead of only new installs.
   */
  if (ctx.app.settings.courseModelRule !== COURSE_MODEL_RULE) {
    rebuildCourseLearning(ctx.app, loadRound);
    ctx.app.settings.courseModelRule = COURSE_MODEL_RULE;
    saveApp(ctx.app);
  }

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

  // The app state and the active round are now loaded, so the recorder can be
  // reconciled against them: a round resumed after a reload gets its recording
  // back, and a round that ended while the page was gone stops it.
  syncNativeRecorder(ctx.round, { recheck: true });

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
  if (document.visibilityState !== 'visible') return;
  // The recorder ran while this page was frozen or gone; re-read what it is
  // actually doing rather than trusting a variable that may be stale.
  syncNativeRecorder(ctx.round, { recheck: true });
  if (ctx.round?.status === 'in_progress') {
    startGps();
    active?.tick?.();
  }
});

/*
 * The service worker is a Pages mechanism, and only a Pages mechanism.
 *
 * In the shell every file already comes out of the APK through
 * WebViewAssetLoader, so a worker would cache what is local to begin with — and
 * it would add a second answer to "which build am I running", on the one build
 * whose version is fixed at compile time (D6, D9).
 */
if ('serviceWorker' in navigator && !shell()) {
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

/*
 * Inside the shell, fixes come from the native recorder rather than the
 * WebView's own receiver. Loaded here, before `boot()` can start the GPS
 * service, and dynamically so Pages never fetches a file it has no use for.
 *
 * The simulator wins when both are present. That combination only happens at a
 * desk with `?sim=1` typed by hand, and a synthetic round must never be able to
 * reach a real recorder.
 */
if (globalThis.GolfNative && !globalThis.__GT_SIM__) {
  try {
    await import('./native/shim.js');
  } catch (err) {
    console.error('Native GPS shim failed to load; continuing with the WebView receiver.', err);
  }
}

boot();
