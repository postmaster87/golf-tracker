/**
 * DEV ONLY — synthetic GPS. Loaded only when the URL carries `?sim=1`.
 *
 * Golf apps are hard to test indoors, and "it compiled" is not the same as "the
 * round flow works". This replaces `navigator.geolocation` with a receiver that
 * emits 1 Hz fixes with realistic Gaussian scatter, so the whole capture →
 * reduce → back-compute path can be driven end to end at a desk.
 *
 * Any round started while this is active is stamped `simulated: true` so it can
 * never be mistaken for a real one.
 */

import { radiiAt } from '../util/geo.js';

const R2D = 180 / Math.PI;

const state = {
  lat: 42.0301, // roughly Veenker, Ames IA — only the geometry matters
  lon: -93.6463,
  accM: 3,
  intervalMs: 1000,
  multipath: 0, // probability of a wild fix, for exercising outlier rejection
};

/** Box-Muller, so the scatter looks like GPS noise rather than a square. */
function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function offset(lat, lon, north, east) {
  const { M, N } = radiiAt(lat);
  return {
    lat: lat + (north / M) * R2D,
    lon: lon + (east / (N * Math.cos(lat / R2D))) * R2D,
  };
}

function makeFix() {
  const wild = Math.random() < state.multipath;
  const sigma = state.accM * (wild ? 12 : 0.5);
  const p = offset(state.lat, state.lon, gauss() * sigma, gauss() * sigma);
  return {
    coords: {
      latitude: p.lat,
      longitude: p.lon,
      accuracy: Math.max(1, state.accM + gauss() * 0.4),
      altitude: 290,
      altitudeAccuracy: 6,
      speed: null,
      heading: null,
    },
    timestamp: Date.now(),
  };
}

const watchers = new Map();
let nextId = 1;

// `navigator.geolocation` is an accessor with no setter, so a plain assignment
// throws. Redefine the property instead.
Object.defineProperty(navigator, 'geolocation', {
  configurable: true,
  value: {
    getCurrentPosition(ok) {
      setTimeout(() => ok(makeFix()), 50);
    },
    watchPosition(ok) {
      const id = nextId++;
      setTimeout(() => ok(makeFix()), 60);
      watchers.set(id, setInterval(() => ok(makeFix()), state.intervalMs));
      return id;
    },
    clearWatch(id) {
      clearInterval(watchers.get(id));
      watchers.delete(id);
    },
  },
});

globalThis.__GT_SIM__ = true;

/** Drive the simulated ball from the console or from a test harness. */
globalThis.__sim = {
  state,
  /** Move `north`/`east` metres from the current position. */
  move(north, east) {
    const p = offset(state.lat, state.lon, north, east);
    state.lat = p.lat;
    state.lon = p.lon;
    return { lat: state.lat, lon: state.lon };
  },
  moveTo(lat, lon) {
    state.lat = lat;
    state.lon = lon;
  },
  setAccuracy(m) {
    state.accM = m;
  },
  setMultipath(p) {
    state.multipath = p;
  },
  pos() {
    return { lat: state.lat, lon: state.lon, accM: state.accM };
  },
};

// Unmissable, because a simulated round must never look like a real one.
const flag = document.createElement('div');
flag.textContent = 'SIMULATED GPS';
Object.assign(flag.style, {
  position: 'fixed',
  bottom: '0',
  left: '0',
  right: '0',
  zIndex: '999',
  background: '#8c2c17',
  color: '#fff',
  font: '700 11px/1.6 system-ui, sans-serif',
  letterSpacing: '.14em',
  textAlign: 'center',
  pointerEvents: 'none',
});
document.addEventListener('DOMContentLoaded', () => document.body.appendChild(flag));
if (document.readyState !== 'loading') document.body.appendChild(flag);
